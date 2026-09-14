// The lab: one camera + one scene + the controls and tools a station allows.
// Every station (guided, challenge, playground) is this same view configured
// by data (data/stations.js). It owns the render loop and the settings; the
// activity engine (activity.js) only reads context and makes requests.
import { Renderer } from "../render/renderer.js";
import { getScene, scenes } from "../scenes/index.js";
import { cameras, getCamera } from "../../data/cameras.js";
import {
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
  formatDistance,
} from "../sim/camera-model.js";
import { Dial } from "../ui/dial.js";
import { Hud } from "../ui/hud.js";
import { ToolPanels, TOOL_INFO, scopeStats } from "../ui/tools.js";
import { describeChange } from "./feedback.js";
import { createActivity } from "./activity.js";
import { recordInteraction } from "../progress.js";

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

// Station control names → settings keys + how to build the dial.
const CONTROLS = {
  aperture: { key: "aperture", label: () => "Aperture", options: apertureOptions },
  shutter: { key: "shutter", label: () => "Shutter", options: shutterOptions },
  iso: { key: "gainStops", label: (c) => (c.gain.mode === "db" ? "Gain" : "ISO"), options: gainOptions },
  nd: { key: "nd", label: (c) => (c.nd.kind === "external" ? "ND filter (screw-on)" : "ND filter"), options: ndOptions },
  fps: { key: "fps", label: () => "Frame rate", options: fpsOptions },
  wb: { key: "wb", label: () => "White balance", continuous: WB_DIAL },
  focus: { key: "focus", label: () => "Focus", continuous: FOCUS_DIAL },
};
const CONTROL_ORDER = ["aperture", "shutter", "iso", "nd", "fps", "wb", "focus"];

export function mountLab(container, station) {
  const debug = /[?&]debug/.test(location.search) || localStorage.getItem("cameralab.debug") === "1";
  let scene = getScene(station.scene);
  let camera = getCamera(station.camera || "lab");
  let settings;
  let derived;
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
        <div class="viewport">
          <canvas class="viewport-canvas" aria-label="Simulated camera image"></canvas>
          <div class="reticle" hidden></div>
          <button type="button" class="rec-btn" aria-pressed="false" aria-label="Record">●</button>
          <p class="viewport-hint">Tap the picture to focus</p>
        </div>
        <div class="tool-chips" role="group" aria-label="Monitoring tools"></div>
        <div class="tool-panels" hidden></div>
      </div>
      <div class="lab-side">
        <div class="activity"></div>
        <div class="control-tabs" role="tablist" hidden></div>
        <div class="controls"></div>
        <p class="feed" aria-live="polite"></p>
        <div class="lab-pickers"></div>
      </div>
    </div>`;

  const viewport = container.querySelector(".viewport");
  const canvas = container.querySelector(".viewport-canvas");
  const reticle = container.querySelector(".reticle");
  const recBtn = container.querySelector(".rec-btn");
  const hint = container.querySelector(".viewport-hint");
  const chipsEl = container.querySelector(".tool-chips");
  const controlsEl = container.querySelector(".controls");
  const tabsEl = container.querySelector(".control-tabs");
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
  hint.hidden = !(station.controls || []).includes("focus") || locked.has("focus");
  const hud = new Hud(viewport);
  const panels = new ToolPanels(container.querySelector(".tool-panels"));

  // ---------- settings ----------
  // Station start values belong to the station's own scene; after switching
  // scenes, start from the new scene's defaults instead.
  function resetSettings(extra = {}) {
    const start = scene.id === station.scene ? station.start : {};
    settings = normalizeSettings(settingsFromPreset({ ...scene.defaults, ...start, ...extra }), camera);
    derived = derive(settings, camera, scene);
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

  function change(key, value, { fromDial = false, silent = false } = {}) {
    const prev = settings;
    const prevD = derived;
    settings = { ...settings, [key]: value };
    derived = derive(settings, camera, scene);
    dirty = true;
    if (!fromDial && dials[key]) dials[key].setValue(value, true);
    if (silent) return;
    if (narrate) {
      const c = describeChange(key, prev, settings, prevD, derived, camera);
      if (c.short && dials[key]) dials[key].flash(c.short === "0" ? "±0" : c.short, c.tone);
      feedEl.textContent = c.text;
    }
    interaction();
    activity.onChange(key);
  }

  // ---------- controls ----------
  let dials = {};
  let activeTab = null;
  function buildControls() {
    Object.values(dials).forEach((d) => d.destroy());
    dials = {};
    controlsEl.innerHTML = "";
    tabsEl.innerHTML = "";
    const list = CONTROL_ORDER.filter((c) => (station.controls || []).includes(c) || locked.has(c));
    for (const name of list) {
      const def = CONTROLS[name];
      if (name === "nd" && camera.nd.kind === "none") {
        const note = document.createElement("p");
        note.className = "control-note";
        note.dataset.control = name;
        note.textContent = `${camera.name}: no manual ND filter (it's automatic-only).`;
        controlsEl.appendChild(note);
        continue;
      }
      const dial = new Dial({
        label: def.label(camera),
        options: def.continuous ? null : def.options(camera),
        ...(def.continuous || {}),
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
      const value = d ? d.label(settings[def.key]) : "—";
      b.innerHTML = `<span>${def.label(camera)}</span><strong>${value}</strong>${locked.has(name) ? " 🔒" : ""}`;
    });
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
      });
      chipsEl.appendChild(b);
    }
    chipsEl.hidden = toolsAvail.length === 0;
  }

  function applyTools() {
    panels.set([...toolsOn].filter((id) => TOOL_INFO[id]?.panel));
    hud.setVisible(toolsOn.has("hud"));
    dirty = true;
  }

  // ---------- scene / camera pickers ----------
  function buildPickers() {
    pickersEl.innerHTML = "";
    const allowedCams = station.cameras ? cameras.filter((c) => station.cameras.includes(c.id)) : cameras;
    if (station.cameraChoice) {
      pickersEl.appendChild(
        picker("Camera", allowedCams, camera.id, (id) => setCamera(id)),
      );
    }
    if (station.sceneChoice) {
      pickersEl.appendChild(picker("Scene", scenes, scene.id, (id) => setScene(id)));
    }
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "chip";
    reset.textContent = "↺ Reset camera";
    reset.addEventListener("click", () => {
      resetSettings();
      buildControls();
      dirty = true;
      feedEl.textContent = "Camera reset to this station's starting settings.";
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
    camera = getCamera(id);
    settings = normalizeSettings(settings, camera);
    derived = derive(settings, camera, scene);
    buildControls();
    buildPickers();
    dirty = true;
    feedEl.textContent = `${camera.name} — ${camera.blurb}`;
    interaction();
    activity.onChange("camera");
  }

  function setScene(id, extraSettings) {
    scene = getScene(id);
    renderer.setScene(scene);
    resetSettings({ ...settingsKeep(), ...(extraSettings || {}) });
    buildControls();
    buildPickers();
    dirty = true;
    activity.onChange("scene");
  }

  // Scene changes keep the frame rate but take the new scene's lighting defaults.
  function settingsKeep() {
    return { fps: settings.fps };
  }

  // ---------- tap to focus ----------
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    let u = (e.clientX - rect.left) / rect.width;
    let v = (e.clientY - rect.top) / rect.height;
    const vw = currentView();
    u = vw.x + (u - 0.5) / vw.zoom;
    v = vw.y + (v - 0.5) / vw.zoom;
    hint.hidden = true;
    const canFocus = (station.controls || []).includes("focus") && !locked.has("focus");
    if (!canFocus) {
      feedEl.textContent = "Focus is fixed in this station.";
      return;
    }
    const hit = renderer.pickDepth(u, v);
    if (!hit) return;
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

  // ---------- magnify ----------
  let magCenter = { x: 0.65, y: 0.35 };
  function currentView() {
    if (!toolsOn.has("magnify")) return { x: 0.5, y: 0.5, zoom: 1 };
    const zoom = 3;
    const half = 0.5 / zoom;
    return {
      x: Math.min(1 - half, Math.max(half, magCenter.x)),
      y: Math.min(1 - half, Math.max(half, magCenter.y)),
      zoom,
    };
  }

  // ---------- record button (cosmetic, but cameras have one) ----------
  let recording = false;
  let recStart = 0;
  let recSeconds = 0;
  recBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    recording = !recording;
    recStart = performance.now() / 1000 - (recording ? 0 : recSeconds);
    if (recording) recSeconds = 0;
    recBtn.classList.toggle("on", recording);
    recBtn.setAttribute("aria-pressed", String(recording));
  });

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
    const now = (performance.now() - t0) / 1000;
    const fi = Math.floor(now / derived.captureInterval);
    if (fi === lastFrame && !dirty) {
      if (toolsOn.has("zebras")) renderer.represent({ zebra: 0.95, peaking: toolsOn.has("peaking") });
      return;
    }
    lastFrame = fi;
    dirty = false;
    sizeCanvas();
    const wantScopes = panels.needsScope() || statWaiters.length > 0 || frameCount % 10 === 0;
    const scope = renderer.render({
      settings,
      derived,
      time: fi * derived.captureInterval,
      frameIndex: ++frameCount,
      view: currentView(),
      zebra: toolsOn.has("zebras") ? 0.95 : 0,
      peaking: toolsOn.has("peaking"),
      wantScopes,
    });
    if (scope) {
      lastScope = scope;
      lastStats = scopeStats(scope);
      statWaiters.forEach((fn) => fn(lastStats));
      statWaiters = [];
    }
    if (recording) recSeconds = performance.now() / 1000 - recStart;
    hud.update(settings, derived, camera, { recording, recSeconds });
    updateTabLabels();
    panels.update({
      settings,
      derived,
      scene,
      camera,
      scope: lastScope,
      stats: lastStats,
      perf: { ...renderer.stats, w: renderer.outW, h: renderer.outH },
      activity: activity.debugState?.(),
    });
  }

  // ---------- activity ----------
  const api = {
    el: activityEl,
    station,
    ctx: () => ({ settings, derived, camera, scene, stats: lastStats }),
    // Fresh scope stats for the current settings (used on challenge submit).
    freshStats: () =>
      new Promise((resolve) => {
        dirty = true;
        statWaiters.push(resolve);
      }),
    setScene: (id, extra) => setScene(id, extra),
    setCamera: (id) => setCamera(id),
    apply: (partial) => {
      for (const [k, v] of Object.entries(partial)) change(k, v, { silent: true });
      settings = normalizeSettings(settings, camera);
      derived = derive(settings, camera, scene);
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
      get: () => ({ settings, derived, camera: camera.id, scene: scene.id, stats: lastStats }),
      // Render one frame now, even in a background tab (rAF is paused there).
      frame: () => {
        dirty = true;
        tick();
      },
      setScene,
      setCamera,
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

  renderer.setScene(scene);
  buildControls();
  buildChips();
  buildPickers();
  applyTools();
  activity.start();
  loop();

  return function unmount() {
    cancelAnimationFrame(raf);
    Object.values(dials).forEach((d) => d.destroy());
    activity.stop?.();
    renderer.dispose();
  };
}
