// The lab: cameras + one scene + the controls and tools a station allows.
// Every station (guided, challenge, playground) is this same view configured
// by data (data/stations.js). It owns the render loop and the settings; the
// activity engine (activity.js) only reads context and makes requests.
//
// Most stations have one camera. A station with `rigs` has several looking
// at the same stage — a center wide and a backup at another angle, or a
// RovoCam the AX100 has to match — shown side by side on a monitor wall. One
// rig is "active" (its controls are on screen); tap another monitor to
// switch, unless it's a `reference` the student can't touch.
import { Renderer } from "../render/renderer.js";
import { getScene, scenes } from "../scenes/index.js";
import { cameras, getCamera } from "../../data/cameras.js";
import {
  frameCenter,
  MAX_FRAME_ZOOM,
  derive,
  normalizeSettings,
  settingsFromPreset,
  apertureOptions,
  shutterOptions,
  gainOptions,
  ndOptions,
  fpsOptions,
  WB_RANGE,
  FOCUS_RANGE,
  focalRange,
  realFocal,
  formatDistance,
  formatFocal,
  keyLight,
  effectiveWb,
} from "../sim/camera-model.js";
import { aeStep, anyAutoExposure, cameraMeter } from "../sim/auto-exposure.js";
import { Dial } from "../ui/dial.js";
import { Hud } from "../ui/hud.js";
import { Ax100Panel } from "../ui/ax100-panel.js";
import { Rp150Panel } from "../ui/rp150-panel.js";
import { ToolPanels, TOOL_INFO, scopeStats } from "../ui/tools.js";
import { describeChange } from "./feedback.js";
import { createActivity } from "./activity.js";
import { recordInteraction } from "../progress.js";
import { current } from "./current.js";

const WB_DIAL = {
  min: WB_RANGE.min,
  max: WB_RANGE.max,
  spacing: 10,
  toPos: (k) => (k - 2000) / 100,
  fromPos: (p) => Math.round((2000 + p * 100) / 50) * 50,
  format: (k) => `${Math.round(k)}K`,
  ticks: [2000, 2800, 3200, 4000, 4800, 5600, 6500, 8000, 10000].map((v) => ({
    value: v,
    label: `${v}K`,
    tapeLabel: v === 3200 ? "💡3200" : v === 5600 ? "☀︎5600" : `${v}`,
    major: true,
  })),
};

const FOCUS_DIAL = {
  min: FOCUS_RANGE.min,
  max: FOCUS_RANGE.max,
  spacing: 12,
  toPos: (m) => Math.log2(m / 0.4) * 6,
  fromPos: (p) => 0.4 * 2 ** (p / 6),
  format: (m) => (m >= 60 ? "∞" : formatDistance(m)),
  ticks: [0.5, 1, 2, 3, 5, 10, 20, 100].map((v) => ({ value: v, label: v === 100 ? "∞" : `${v}m`, major: true })),
};

// The lens. settings.focal is a 35mm-equivalent focal length, so the dial's
// range is the same on every body — but it's marked in the real millimetres
// engraved on that body's barrel, which is what changes with the sensor.
const ZOOM_DIAL = (camera, scene) => {
  const { min, max } = focalRange(scene, camera);
  const mm = (f) => Math.round(realFocal(f, camera));
  return {
    min,
    max,
    spacing: 12,
    keyStep: 2,
    toPos: (f) => Math.log2(f / min) * 24,
    fromPos: (p) => min * 2 ** (p / 24),
    format: (f) => formatFocal(f, camera),
    ticks: [1, 1.25, 1.5, 2, 2.5, 3, 3.5]
      .filter((r) => r * min <= max + 0.01)
      .map((r) => ({ value: r * min, label: `${mm(r * min)}mm`, tapeLabel: `${mm(r * min)}`, major: true })),
  };
};

// White-balance shift, written the way the body writes it.
function shiftOptions(camera, axis) {
  const max = camera.wbShift?.[axis === "ab" ? "ab" : "gm"] || 0;
  const [pos, neg] = axis === "ab" ? ["A", "B"] : ["G", "M"];
  const out = [];
  for (let v = -max; v <= max; v++) out.push({ value: v, label: v > 0 ? `${pos}${v}` : v < 0 ? `${neg}${-v}` : "0", major: v % 3 === 0 });
  return out;
}

// Station control names → settings keys + how to build the dial.
const CONTROLS = {
  aperture: { key: "aperture", label: () => "Aperture", options: apertureOptions },
  shutter: { key: "shutter", label: () => "Shutter", options: shutterOptions },
  iso: { key: "gainStops", label: (c) => (c.gain.mode === "db" ? "Gain" : "ISO"), options: gainOptions },
  nd: { key: "nd", label: (c) => (c.nd.kind === "external" ? "ND filter (screw-on)" : "ND filter"), options: ndOptions },
  fps: { key: "fps", label: () => "Frame rate", options: fpsOptions },
  wb: { key: "wb", label: () => "White balance", continuous: WB_DIAL },
  wbab: { key: "wbAB", label: () => "WB shift A–B", options: (c) => shiftOptions(c, "ab") },
  wbgm: { key: "wbGM", label: () => "WB shift G–M", options: (c) => shiftOptions(c, "gm") },
  focus: { key: "focus", label: () => "Focus", continuous: FOCUS_DIAL },
  zoom: { key: "focal", label: () => "Zoom (lens)", continuous: ZOOM_DIAL },
};
const CONTROL_ORDER = ["aperture", "shutter", "iso", "nd", "fps", "wb", "wbab", "wbgm", "focus", "zoom"];

export function mountLab(container, station) {
  const debug = /[?&]debug/.test(location.search) || safeGet("cameralab.debug") === "1";
  let scene = getScene(station.scene);
  let locked = new Set(station.locked || []);
  const narrate = station.mode !== "challenge";

  const toolsAvail = [...(station.tools?.available || ["meter", "hud"])];
  const toolsOn = new Set(station.tools?.on || ["meter", "hud"]);
  if (debug) {
    toolsAvail.push("debug");
    toolsOn.add("debug");
  }

  container.innerHTML = `
    <div class="lab">
      <div class="lab-main">
        <div class="monitor-wall" hidden></div>
        <div class="viewport">
          <canvas class="viewport-canvas" aria-label="Simulated camera image"></canvas>
          <div class="reticle" hidden></div>
          <button type="button" class="rec-btn" aria-pressed="false" aria-label="Record">●</button>
          <p class="viewport-hint">Tap the picture to focus</p>
        </div>
        <p class="scene-tag" hidden></p>
        <div class="tool-chips" role="group" aria-label="Monitoring tools"></div>
        <div class="tool-panels" hidden></div>
      </div>
      <div class="lab-side">
        <div class="activity"></div>
        <div class="rig-tabs" role="tablist" hidden></div>
        <div class="control-tabs" role="tablist" hidden></div>
        <div class="controls"></div>
        <p class="feed" aria-live="polite"></p>
        <div class="lab-pickers"></div>
      </div>
    </div>`;

  const viewport = container.querySelector(".viewport");
  const sceneTag = container.querySelector(".scene-tag");
  // Which room this is — the halls share a stage and performers, so without
  // a label the dark auditorium reads as "Salmon with black walls".
  function showSceneTag() {
    sceneTag.hidden = !scene.room;
    if (scene.room) sceneTag.textContent = `📍 ${scene.title}${scene.room === "auditorium" ? " — a generic dark hall, not Salmon" : ""}`;
  }
  const wall = container.querySelector(".monitor-wall");
  const canvas = container.querySelector(".viewport-canvas");
  const reticle = container.querySelector(".reticle");
  const recBtn = container.querySelector(".rec-btn");
  const hint = container.querySelector(".viewport-hint");
  const chipsEl = container.querySelector(".tool-chips");
  const controlsEl = container.querySelector(".controls");
  const tabsEl = container.querySelector(".control-tabs");
  const rigTabsEl = container.querySelector(".rig-tabs");
  const feedEl = container.querySelector(".feed");
  const pickersEl = container.querySelector(".lab-pickers");
  const activityEl = container.querySelector(".activity");

  let renderer;
  try {
    renderer = new Renderer(canvas);
  } catch (e) {
    viewport.innerHTML = `<div class="gl-error"><strong>This browser can't run the camera simulator.</strong><br>It needs WebGL2 — try a current Chrome, Safari, Edge or Firefox.<br><small>${e.message.split("\n")[0]}</small></div>`;
    console.error(e);
    return () => {};
  }
  const hud = new Hud(viewport);
  const panels = new ToolPanels(container.querySelector(".tool-panels"));

  // ---------- rigs (cameras on this station) ----------
  // A warm-up can hand out a different body each time it's opened
  // (cameraPool), so the same drill is practiced on whatever's in the bag.
  const pooled = station.cameraPool ? station.cameraPool[Math.floor(Math.random() * station.cameraPool.length)] : null;
  const rigDefs = station.rigs || [{ id: "main", camera: pooled || station.camera || "lab", start: station.start }];
  const rigs = rigDefs.map((def, i) => ({
    def,
    id: def.id || `cam${i + 1}`,
    label: def.label || "",
    camera: getCamera(def.camera || station.camera || "lab"),
    slot: i,
    settings: null,
    derived: null,
    stats: null,
    meter: 0,
    tile: null,
    recording: false,
    recStart: 0,
  }));
  let active = Math.max(0, rigs.findIndex((r) => !r.def.reference));
  // The active rig's state, mirrored into plain variables the rest of this
  // file (and every narration helper) reads.
  let camera = rigs[active].camera;
  let settings;
  let derived;

  function rigStart(rig) {
    const own = rig.def.start || (rigs.length === 1 ? station.start : {}) || {};
    const start = scene.id === station.scene ? own : {};
    return normalizeSettings(settingsFromPreset({ ...scene.defaults, ...start }, scene), rig.camera, scene);
  }

  function resetSettings(extra = {}) {
    for (const rig of rigs) {
      rig.settings = normalizeSettings({ ...rigStart(rig), ...extra }, rig.camera, scene);
      rig.start = rig.settings;
      rig.derived = derive(rig.settings, rig.camera, scene);
    }
    loadActive();
  }
  function loadActive() {
    const r = rigs[active];
    camera = r.camera;
    settings = r.settings;
    derived = r.derived;
  }
  function saveActive() {
    const r = rigs[active];
    r.camera = camera;
    r.settings = settings;
    r.derived = derived;
  }
  resetSettings();

  let dirty = true;
  let focusAnim = null;
  let lastInteraction = 0;

  function interaction() {
    const now = Date.now();
    if (now - lastInteraction > 400) {
      recordInteraction(station.id);
      lastInteraction = now;
    }
  }

  // The student (or the AX100 panel) changed something on the active rig.
  function change(key, value, { fromDial = false, silent = false, fromRing = false } = {}) {
    if (rigs[active].def.readOnly && !silent) {
      feedEl.textContent = `${rigs[active].label || rigs[active].id} is the static wide — look, don't touch.`;
      return;
    }
    const prev = settings;
    const prevD = derived;
    let next = { ...settings, [key]: value };
    if (key === "aperture") next.apertureSet = value;
    // Grabbing a control by hand takes it off auto, as on a real camera.
    if (!silent && next.auto?.[key] && !fromRing) next.auto = { ...next.auto, [key]: false };
    if (key === "aperture" || key === "focal") next = normalizeSettings(next, camera, scene);
    settings = next;
    derived = derive(settings, camera, scene);
    saveActive();
    dirty = true;
    if (!fromDial && dials[key]) dials[key].setValue(settings[key], true);
    if (key === "focal" && dials.aperture) dials.aperture.setValue(settings.aperture, true);
    if (silent) return;
    if (narrate) {
      const c = describeChange(key, prev, settings, prevD, derived, camera);
      if (c.short && dials[key]) dials[key].flash(c.short === "0" ? "±0" : c.short, c.tone);
      let text = c.text;
      if (key === "focal" && settings.aperture > prev.aperture + 0.01 && !settings.auto?.aperture) {
        text += ` This zoom can't open wider than f/${settings.aperture} at this focal length, so the iris closed down and the picture got darker — camcorder zooms lose light as they zoom in.`;
      }
      if (key === "aperture" && settings.aperture > value + 0.01) {
        text = `f/${value} isn't available at this zoom — the widest this lens opens here is f/${settings.aperture}. Zoom out to open wider.`;
      }
      feedEl.textContent = text;
    }
    interaction();
    activity.onChange(key);
  }

  function setAuto(key, on) {
    settings = { ...settings, auto: { ...settings.auto, [key]: on } };
    derived = derive(settings, camera, scene);
    saveActive();
    dirty = true;
    interaction();
    activity.onChange(`auto:${key}`);
  }

  // ---------- controls ----------
  let dials = {};
  let activeTab = null;
  let bodyPanel = null;
  function usesBody() {
    return !!station.bodyControls && (camera.id === "ax100" || camera.id === "ue150") && !rigs[active].def.reference;
  }
  function buildControls() {
    Object.values(dials).forEach((d) => d.destroy());
    dials = {};
    if (bodyPanel) {
      bodyPanel.destroy();
      bodyPanel = null;
    }
    controlsEl.innerHTML = "";
    tabsEl.innerHTML = "";
    tabsEl.hidden = true;
    controlsEl.classList.remove("tabbed");
    hint.hidden = !canFocus();
    if (rigs[active].def.reference) {
      controlsEl.innerHTML = `<p class="control-note">This camera isn't yours to change — it's the one to match.</p>`;
      return;
    }
    if (usesBody() && camera.id === "ue150") {
      bodyPanel = new Rp150Panel({
        camera,
        scene,
        get: () => settings,
        change: (k, v, o) => change(k, v, o),
        setAuto,
        note: (k) => activity.onChange(k),
        say: (t) => (feedEl.textContent = t),
        oneShotWhite: () => keyLight(scene).kelvin,
        rigs: rigs.map((r) => ({ id: r.id, label: r.label, readOnly: !!r.def.readOnly })),
        active,
        select: (i) => setActiveRig(i),
        panelEl: controlsEl,
      });
      hud.setVisible(false);
      hint.hidden = true;
      return;
    }
    if (usesBody()) {
      bodyPanel = new Ax100Panel({
        camera,
        get: () => settings,
        change: (k, v, o) => change(k, v, o),
        setAuto,
        note: (k) => activity.onChange(k),
        say: (t) => (feedEl.textContent = t),
        oneShotWhite: () => keyLight(scene).kelvin,
        lcdEl: viewport,
        panelEl: controlsEl,
      });
      hud.setVisible(false);
      hint.hidden = true;
      return;
    }
    hud.setVisible(toolsOn.has("hud"));
    const list = CONTROL_ORDER.filter((c) => (station.controls || []).includes(c) || locked.has(c));
    for (const name of list) {
      const def = CONTROLS[name];
      if (name === "nd" && camera.nd.kind === "none") {
        controlsEl.appendChild(note(name, `${camera.name}: no manual ND filter (it's automatic-only).`));
        continue;
      }
      if ((name === "wbab" || name === "wbgm") && !camera.wbShift) {
        controlsEl.appendChild(note(name, `${camera.name}: no white-balance shift — kelvin only.`));
        continue;
      }
      const continuous = typeof def.continuous === "function" ? def.continuous(camera, scene) : def.continuous;
      const dial = new Dial({
        label: def.label(camera),
        options: continuous ? null : def.options(camera),
        ...(continuous || {}),
        value: settings[def.key],
        locked: locked.has(name),
        onChange: (v) => {
          if (name === "focus") focusAnim = null;
          change(def.key, v, { fromDial: true });
        },
      });
      dial.el.dataset.control = name;
      dials[def.key] = dial;
      controlsEl.appendChild(dial.el);
    }
    // Many controls on a small screen → camera-style function tabs.
    const tabbed = list.length > 3;
    tabsEl.hidden = !tabbed;
    controlsEl.classList.toggle("tabbed", tabbed);
    if (tabbed) {
      if (!list.includes(activeTab)) activeTab = list[0];
      for (const name of list) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "control-tab";
        b.setAttribute("role", "tab");
        b.dataset.control = name;
        // Built once; updateTabLabels() only touches the text. Rewriting the
        // button's innerHTML every frame swapped out the element under the
        // pointer mid-press, so presses on the label text never clicked.
        b.innerHTML = `<span></span><strong></strong>`;
        b.addEventListener("click", () => {
          activeTab = name;
          syncTabs();
        });
        tabsEl.appendChild(b);
      }
      syncTabs();
    }
    updateTabLabels();
  }

  function note(name, text) {
    const p = document.createElement("p");
    p.className = "control-note";
    p.dataset.control = name;
    p.textContent = text;
    return p;
  }

  function syncTabs() {
    tabsEl.querySelectorAll(".control-tab").forEach((b) => {
      const on = b.dataset.control === activeTab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    controlsEl.querySelectorAll("[data-control]").forEach((el) => {
      el.classList.toggle("tab-hidden", el.dataset.control !== activeTab);
    });
    Object.values(dials).forEach((d) => d.render());
  }

  function updateTabLabels() {
    tabsEl.querySelectorAll(".control-tab").forEach((b) => {
      const name = b.dataset.control;
      const def = CONTROLS[name];
      const d = dials[def.key];
      const autoMark = settings.auto?.[def.key] ? " A" : "";
      const value = (d ? d.label(settings[def.key]) : "—") + autoMark + (locked.has(name) ? " 🔒" : "");
      setText(b.querySelector("span"), def.label(camera));
      setText(b.querySelector("strong"), value);
    });
  }

  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  // ---------- monitor wall (multi-camera stations) ----------
  function buildWall() {
    if (rigs.length < 2) return;
    wall.hidden = false;
    wall.innerHTML = "";
    wall.style.setProperty("--tiles", String(Math.min(rigs.length, 3)));
    wall.classList.toggle("many", rigs.length > 2);
    rigs.forEach((rig, i) => {
      const tile = document.createElement("figure");
      tile.className = "monitor-tile";
      tile.dataset.rig = String(i);
      tile.innerHTML = `<div class="monitor-screen"><canvas></canvas></div><figcaption><span class="monitor-name"></span><span class="monitor-cam"></span></figcaption>`;
      tile.querySelector(".monitor-name").textContent = rig.label || rig.id;
      if (!rig.def.reference) {
        tile.classList.add("selectable");
        tile.addEventListener("click", (e) => {
          if (i !== active && !e.target.closest(".viewport")) setActiveRig(i);
        });
      } else tile.classList.add("reference");
      rig.tile = tile;
      rig.canvas2d = tile.querySelector("canvas");
      wall.appendChild(tile);
    });
    placeViewport();
    buildRigTabs();
  }

  function placeViewport() {
    if (rigs.length < 2) return;
    rigs.forEach((rig, i) => {
      const screen = rig.tile.querySelector(".monitor-screen");
      rig.tile.classList.toggle("active", i === active);
      rig.tile.querySelector(".monitor-cam").textContent = rig.camera.name;
      if (i === active) {
        rig.canvas2d.hidden = true;
        screen.appendChild(viewport);
      } else rig.canvas2d.hidden = false;
    });
  }

  function buildRigTabs() {
    const editable = rigs.map((r, i) => [r, i]).filter(([r]) => !r.def.reference);
    // The RP150 has its own camera buttons; tabs would just repeat them.
    const controller = station.bodyControls && rigs.every((r) => r.camera.id === "ue150");
    rigTabsEl.hidden = editable.length < 2 || controller;
    rigTabsEl.innerHTML = "";
    for (const [r, i] of editable) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip rig-tab";
      b.textContent = `Controls: ${r.label || r.id}`;
      b.classList.toggle("active", i === active);
      b.setAttribute("aria-selected", String(i === active));
      b.addEventListener("click", () => setActiveRig(i));
      rigTabsEl.appendChild(b);
    }
  }

  function setActiveRig(i) {
    if (i === active || rigs[i].def.reference) return;
    saveActive();
    active = i;
    loadActive();
    placeViewport();
    buildRigTabs();
    buildControls();
    buildPickers();
    syncRecButton();
    dirty = true;
    feedEl.textContent = `Now controlling ${rigs[i].label || rigs[i].id} (${camera.name}).`;
    activity.onChange("rig");
  }

  // ---------- tools ----------
  function buildChips() {
    chipsEl.innerHTML = "";
    for (const id of toolsAvail) {
      const info = TOOL_INFO[id];
      if (!info) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip tool-chip";
      b.textContent = info.label;
      b.setAttribute("aria-pressed", String(toolsOn.has(id)));
      b.classList.toggle("active", toolsOn.has(id));
      b.addEventListener("click", () => {
        toolsOn.has(id) ? toolsOn.delete(id) : toolsOn.add(id);
        b.classList.toggle("active", toolsOn.has(id));
        b.setAttribute("aria-pressed", String(toolsOn.has(id)));
        applyTools();
        interaction();
        activity.onChange(`tool:${id}`);
      });
      chipsEl.appendChild(b);
    }
    chipsEl.hidden = toolsAvail.length === 0;
  }

  function applyTools() {
    panels.set([...toolsOn].filter((id) => TOOL_INFO[id]?.panel));
    hud.setVisible(toolsOn.has("hud") && !bodyPanel);
    if (bodyPanel) bodyPanel.setVisible(toolsOn.has("hud") || !toolsAvail.includes("hud"));
    dirty = true;
  }

  // ---------- scene / camera pickers ----------
  function buildPickers() {
    pickersEl.innerHTML = "";
    // A station's own list may name hidden bodies (the GH5 lens options).
    const allowedCams = station.cameras ? station.cameras.map(getCamera) : cameras;
    if (station.cameraChoice && !rigs[active].def.reference) {
      pickersEl.appendChild(picker("Camera", allowedCams, camera.id, (id) => setCamera(id)));
    }
    if (station.sceneChoice) {
      const list = station.scenes ? scenes.filter((s) => station.scenes.some((p) => s.id.startsWith(p))) : scenes.filter((s) => !s.hidden);
      pickersEl.appendChild(picker("Scene", list, scene.id, (id) => setScene(id)));
    }
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "chip";
    const many = rigs.filter((r) => !r.def.reference).length > 1;
    reset.textContent = many ? "↺ Reset this camera" : "↺ Reset camera";
    reset.addEventListener("click", () => {
      // On a multi-camera station, only the camera you're controlling —
      // never the one you already finished.
      const rig = rigs[active];
      rig.settings = rigStart(rig);
      rig.derived = derive(rig.settings, rig.camera, scene);
      loadActive();
      buildControls();
      dirty = true;
      feedEl.textContent = many ? `${rig.label || rig.id} reset to this station's starting settings.` : "Camera reset to this station's starting settings.";
      activity.onChange("reset");
    });
    pickersEl.appendChild(reset);
  }

  function picker(label, list, current, onPick) {
    const wrap = document.createElement("label");
    wrap.className = "picker";
    wrap.innerHTML = `<span>${label}</span><select>${list
      .map((o) => `<option value="${o.id}"${o.id === current ? " selected" : ""}>${o.name || o.title}</option>`)
      .join("")}</select>`;
    wrap.querySelector("select").addEventListener("change", (e) => onPick(e.target.value));
    return wrap;
  }

  function setCamera(id) {
    const prev = camera;
    const prevD = derived;
    camera = getCamera(id);
    // Swapping bodies keeps the same physical lens, so a smaller sensor —
    // covering only the middle of the image that lens throws — frames
    // tighter by the crop factor. That's the crop-factor zoom, and the
    // student zooms back out to compare like for like. Stations that don't
    // give them a zoom control keep the framing instead, so a camera switch
    // can't strand them in a shot they can't undo.
    const canZoom = (station.controls || []).includes("zoom") && !locked.has("zoom");
    const focal = canZoom ? settings.focal * (camera.sensor.crop / prev.sensor.crop) : settings.focal;
    settings = normalizeSettings({ ...settings, focal }, camera, scene);
    derived = derive(settings, camera, scene);
    saveActive();
    buildControls();
    buildPickers();
    placeViewport();
    dirty = true;
    const irisNote =
      settings.aperture > (settings.apertureSet ?? settings.aperture) + 0.01
        ? ` Its lens can't open to f/${settings.apertureSet} at this zoom, so the iris is at f/${settings.aperture} for now (it goes back when it can).`
        : "";
    const tighter = derived.frameZoom > prevD.frameZoom * 1.01;
    const wider = derived.frameZoom < prevD.frameZoom * 0.99;
    const framing = tighter
      ? ` Same lens, smaller sensor: it only covers the middle of the picture the lens throws, so the shot is tighter — now ${formatFocal(settings.focal, camera)}. Zoom out to match the old framing.`
      : wider
        ? ` Bigger sensor, same lens: it sees more of the picture the lens throws, so the shot is wider — now ${formatFocal(settings.focal, camera)}.`
        : "";
    feedEl.textContent = `${camera.name} — ${camera.blurb}${framing}${irisNote}`;
    interaction();
    activity.onChange("camera");
  }

  // keepSettings: the lights change but nobody touched the cameras (e.g.
  // the concert cue coming up after pre-show) — every rig keeps its settings.
  function setScene(id, extraSettings, keepSettings = false) {
    scene = getScene(id);
    renderer.setScene(scene);
    showSceneTag();
    if (keepSettings) {
      saveActive();
      for (const rig of rigs) {
        rig.settings = normalizeSettings(rig.settings, rig.camera, scene);
        rig.derived = derive(rig.settings, rig.camera, scene);
      }
      loadActive();
      buildControls();
      buildPickers();
      dirty = true;
      activity.onChange("scene");
      return;
    }
    const keep = { fps: settings.fps };
    resetSettings({ ...keep, ...(extraSettings || {}) });
    buildControls();
    buildPickers();
    dirty = true;
    activity.onChange("scene");
  }

  // ---------- tap to focus ----------
  function canFocus() {
    return ((station.controls || []).includes("focus") || usesBody()) && !locked.has("focus") && !rigs[active].def.reference;
  }
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    let u = (e.clientX - rect.left) / rect.width;
    let v = (e.clientY - rect.top) / rect.height;
    const vw = currentView(rigs[active]);
    u = vw.x + (u - 0.5) / vw.zoom;
    v = vw.y + (v - 0.5) / vw.zoom;
    hint.hidden = true;
    if (!canFocus()) {
      feedEl.textContent = "Focus is fixed in this station.";
      return;
    }
    const hit = renderer.pickDepth(u, v, parallaxOf(rigs[active]));
    if (!hit) return;
    if (settings.auto?.focus) setAuto("focus", false);
    magCenter = { x: u, y: v };
    reticle.hidden = false;
    reticle.style.left = `${((e.clientX - rect.left) / rect.width) * 100}%`;
    reticle.style.top = `${((e.clientY - rect.top) / rect.height) * 100}%`;
    reticle.classList.remove("pulse");
    void reticle.offsetWidth;
    reticle.classList.add("pulse");
    focusAnim = { from: settings.focus, to: hit.depth, start: performance.now(), name: hit.layer.name };
  });

  function stepFocusAnim() {
    if (!focusAnim) return;
    const k = Math.min(1, (performance.now() - focusAnim.start) / 350);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const f = focusAnim.from * (focusAnim.to / focusAnim.from) ** e;
    const done = k >= 1;
    const name = focusAnim.name;
    if (done) focusAnim = null;
    change("focus", f, { silent: !done });
    if (done) feedEl.textContent = `Focused on ${name.toLowerCase()} at ${formatDistance(f)}.`;
  }

  // ---------- framing & magnify ----------
  // Two zooms stack into one view: the optical one (this lens on this
  // sensor — derived.frameZoom, how far into the drawn scene the sensor
  // actually sees) and the magnify tool's 3× focus check on top of it.
  let magCenter = { x: 0.65, y: 0.35 };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function frameView(rig) {
    // The camera points at the scene's subject (or where this rig's operator
    // aimed it); zooming scales straight in on that point (frameCenter).
    const frame = rig.derived.frameZoom;
    const c = frameCenter(rig.def.aim || scene.aim, frame, scene.maxFrameZoom || MAX_FRAME_ZOOM);
    return { x: c.x, y: c.y, zoom: frame };
  }
  function currentView(rig) {
    const f = frameView(rig);
    if (rig !== rigs[active] || !toolsOn.has("magnify")) return f;
    // Magnify punches into the shot the camera is actually taking, so its
    // window stays inside that frame rather than the whole scene.
    const half = 0.5 / f.zoom;
    const zoom = f.zoom * 3;
    const h = 0.5 / zoom;
    return {
      x: clamp(magCenter.x, f.x - half + h, f.x + half - h),
      y: clamp(magCenter.y, f.y - half + h, f.y + half - h),
      zoom,
    };
  }
  function parallaxOf(rig) {
    const a = rig.def.angle;
    if (!a) return null;
    return { shift: a.shift, aimDepth: a.aimDepth || scene.subjects?.performers?.depth || 10 };
  }

  // ---------- record button (each camera rolls on its own) ----------
  let recording = false;
  let recSeconds = 0;
  function syncRecButton() {
    recording = rigs[active].recording;
    recBtn.classList.toggle("on", recording);
    recBtn.setAttribute("aria-pressed", String(recording));
  }
  recBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const rig = rigs[active];
    rig.recording = !rig.recording;
    rig.recStart = performance.now() / 1000;
    syncRecButton();
    activity.onChange(rig.recording ? "record:start" : "record:stop");
  });

  // ---------- automatic camera functions ----------
  // Auto exposure meters each rig's own rendered frame; autofocus focuses on
  // whatever is in the middle of the frame. Neither counts as the student
  // touching anything.
  let lastAuto = 0;
  function runAutos(now) {
    if (now - lastAuto < 90) return;
    lastAuto = now;
    rigs.forEach((rig, i) => {
      let s = rig.settings;
      let changed = false;
      if (anyAutoExposure(s) && rig.stats) {
        const d = aeStep(s, rig.camera, rig.stats.meanLuma);
        if (Object.keys(d).length) {
          s = normalizeSettings({ ...s, ...d, ...(d.aperture ? { apertureSet: d.aperture } : {}) }, rig.camera, scene);
          changed = true;
        }
      }
      if (s.auto?.focus) {
        const v = frameView(rig);
        const hit = renderer.pickDepth(v.x, v.y, parallaxOf(rig));
        if (hit && Math.abs(Math.log(hit.depth / s.focus)) > 0.01) {
          s = { ...s, focus: s.focus * (hit.depth / s.focus) ** 0.5 };
          changed = true;
        }
      }
      if (!changed) return;
      rig.settings = s;
      rig.derived = derive(s, rig.camera, scene);
      if (i === active) {
        loadActive();
        for (const [k, d] of Object.entries(dials)) d.setValue(settings[k], true);
      }
      dirty = true;
    });
  }

  // ---------- render loop ----------
  let raf = 0;
  let lastFrame = -1;
  let frameCount = 0;
  let lastScope = null;
  let lastStats = null;
  let statWaiters = [];
  const t0 = performance.now();

  function sizeCanvas() {
    const rect = viewport.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, Math.min(1280, Math.round(rect.width * dpr)));
    renderer.resize(w, Math.round((w * 9) / 16));
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    tick();
  }

  function tick() {
    stepFocusAnim();
    const nowMs = performance.now();
    runAutos(nowMs);
    const now = (nowMs - t0) / 1000;
    const fi = Math.floor(now / derived.captureInterval);
    if (fi === lastFrame && !dirty) {
      if (toolsOn.has("zebras")) renderer.represent({ zebra: 0.95, peaking: toolsOn.has("peaking") });
      return;
    }
    lastFrame = fi;
    dirty = false;
    sizeCanvas();
    frameCount++;
    // Other rigs first (copied out to their monitors), the active one last
    // so it's what stays on the main canvas.
    rigs.forEach((rig, i) => {
      if (i === active || !rig.canvas2d) return;
      // Monitors are small and mostly static: refresh every third frame, and
      // only read back scopes for a camera that's metering itself.
      if (frameCount % 3 && rig.rendered) return;
      rig.rendered = true;
      const metering = anyAutoExposure(rig.settings);
      const sc = renderer.render({
        settings: rig.settings,
        derived: rig.derived,
        time: fi * rig.derived.captureInterval,
        frameIndex: frameCount,
        view: currentView(rig),
        parallax: parallaxOf(rig),
        slot: rig.slot,
        wantScopes: metering,
      });
      if (sc) {
        rig.stats = scopeStats(sc);
        rig.meter = cameraMeter(rig.stats.meanLuma);
      }
      const c = rig.canvas2d;
      if (c.width !== canvas.width) {
        c.width = canvas.width;
        c.height = canvas.height;
      }
      c.getContext("2d").drawImage(canvas, 0, 0);
    });
    rigs.forEach((r) => r.tile?.classList.toggle("rec", r.recording));
    const rig = rigs[active];
    const wantScopes = panels.needsScope() || statWaiters.length > 0 || frameCount % 5 === 0 || anyAutoExposure(settings);
    const scope = renderer.render({
      settings,
      derived,
      time: fi * derived.captureInterval,
      frameIndex: frameCount,
      view: currentView(rig),
      parallax: parallaxOf(rig),
      slot: rig.slot,
      zebra: toolsOn.has("zebras") ? 0.95 : 0,
      peaking: toolsOn.has("peaking"),
      wantScopes,
    });
    if (scope) {
      lastScope = scope;
      lastStats = scopeStats(scope);
      rig.stats = lastStats;
      rig.meter = cameraMeter(lastStats.meanLuma);
      statWaiters.forEach((fn) => fn(lastStats));
      statWaiters = [];
    }
    recSeconds = recording ? performance.now() / 1000 - rig.recStart : 0;
    const time = timecode(recSeconds);
    if (bodyPanel) bodyPanel.update({ recording, time, cameraMeter: rig.meter });
    else hud.update(settings, derived, camera, { recording, recSeconds });
    updateTabLabels();
    panels.update({
      settings,
      derived,
      scene,
      camera,
      scope: lastScope,
      stats: lastStats,
      cameraMeter: anyAutoExposure(settings) ? rig.meter : null,
      perf: { ...renderer.stats, w: renderer.outW, h: renderer.outH },
      activity: activity.debugState?.(),
    });
  }

  function timecode(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // ---------- activity ----------
  function rigCtx() {
    const out = {};
    rigs.forEach((r, i) => {
      const s = i === active ? settings : r.settings;
      const d = i === active ? derived : r.derived;
      out[r.id] = { settings: s, derived: d, camera: i === active ? camera : r.camera, stats: r.stats, meter: r.meter, view: frameView({ ...r, derived: d }), def: r.def, recording: r.recording, start: r.start };
    });
    return out;
  }
  const api = {
    el: activityEl,
    station,
    ctx: () => ({
      settings,
      derived,
      camera,
      scene,
      stats: lastStats,
      view: frameView(rigs[active]),
      rigs: rigCtx(),
      activeRig: rigs[active].id,
      recording,
      cameraMeter: rigs[active].meter,
    }),
    // Fresh scope stats for the current settings (used on challenge submit).
    freshStats: () =>
      new Promise((resolve) => {
        dirty = true;
        statWaiters.push(resolve);
      }),
    setScene: (id, extra, keep) => setScene(id, extra, keep),
    setCamera: (id) => setCamera(id),
    apply: (partial) => {
      const set = partial.aperture != null ? { apertureSet: partial.aperture } : {};
      settings = normalizeSettings({ ...settings, ...partial, ...set }, camera, scene);
      derived = derive(settings, camera, scene);
      saveActive();
      dirty = true;
      buildControls();
    },
    unlock: (names) => {
      names.forEach((n) => locked.delete(n));
      buildControls();
    },
    showTool: (id) => {
      if (!toolsAvail.includes(id)) toolsAvail.push(id);
      toolsOn.add(id);
      buildChips();
      applyTools();
    },
    say: (text) => (feedEl.textContent = text),
  };
  const activity = createActivity(api);

  // Developer hook (?debug): drive the lab from the console.
  if (debug) {
    window.cameraLab = {
      set: (key, value) => {
        change(key, value);
        buildControls();
      },
      auto: (key, on = true) => setAuto(key, on),
      get: () => ({ settings, derived, camera: camera.id, scene: scene.id, stats: lastStats, rigs: rigCtx() }),
      // Render one frame now, even in a background tab (rAF is paused there).
      frame: () => {
        dirty = true;
        tick();
      },
      setScene,
      setCamera,
      rig: (i) => setActiveRig(i),
      magnify: (x, y) => {
        magCenter = { x, y };
        toolsOn.add("magnify");
        applyTools();
      },
      tool: (id, on = true) => {
        on ? toolsOn.add(id) : toolsOn.delete(id);
        buildChips();
        applyTools();
      },
    };
  }

  current.get = () => {
    const sum = [`${settings.fps}p`, `1/${settings.shutter}`, `f/${settings.aperture}`, `gain ${settings.gainStops.toFixed(2)} st`, `ND ${settings.nd}`, settings.wbMode === "auto" ? "AWB" : `${Math.round(effectiveWb(settings, scene).kelvin)}K`];
    if (settings.wbAB || settings.wbGM) sum.push(`shift ${settings.wbAB}/${settings.wbGM}`);
    const autos = Object.entries(settings.auto || {}).filter(([, v]) => v).map(([k]) => k);
    if (autos.length) sum.push(`auto: ${autos.join(",")}`);
    return { camera: camera.name, scene: scene.id, settings: sum.join(" · ") };
  };
  renderer.setScene(scene);
  showSceneTag();
  buildWall();
  buildControls();
  buildChips();
  buildPickers();
  applyTools();
  activity.start();
  loop();

  return function unmount() {
    current.get = null;
    cancelAnimationFrame(raf);
    Object.values(dials).forEach((d) => d.destroy());
    if (bodyPanel) bodyPanel.destroy();
    activity.stop?.();
    renderer.dispose();
  };
}

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}
