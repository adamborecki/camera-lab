// The Panasonic AW-RP150 remote camera controller from the Musco booth,
// laid out after the instructor's photo: camera selection buttons (the
// selected one lights — orange on the unit, "yellow" in the checklist), the
// screen with iris / zoom / focus bars and the shading values, the white
// balance buttons, R/B GAIN, R/B PED and M.PED knobs, IRIS with AUTO, and
// the zoom lever. Gain lives on the screen's F1 knob.
//
// Selecting a camera here selects that rig in the lab (one controller, many
// cameras). Camera 2 is the static wide: you may look, never touch.
//
// On PTZ stations (host.pan) it also gets the joystick and a P/T SPEED
// knob: push to pan and tilt, harder to go faster, and the knob scales it.
//
// Unverified (README → Technical verification): knob ranges and step sizes,
// what holding A/3200K does, F1 as the gain knob, and the screen's exact
// layout beyond the photo. For the joystick: which way tilt goes on Musco's
// RP150 (sim: push up, camera tilts up), the speed knob's real label and
// range (sim: P/T SPEED 1–5), and how speed scales with zoom.
import { Knob } from "./knob.js";
import { apertureOptions, gainOptions, focalRange, effectiveWb } from "../sim/camera-model.js";

const WB_BUTTONS = [
  { id: "onepush", label: "AWB", title: "Run a white balance on what's in frame" },
  { id: "indoor", label: "A/3200K", title: "Memory A — Musco's house default" },
  { id: "outdoor", label: "B/5600K", title: "Memory B" },
  { id: "auto", label: "ATW/VAR", title: "Auto tracking white balance" },
];

export class Rp150Panel {
  // host: { camera, scene, get(), change(k, v), setAuto(k, on), note(k),
  //         say(t), rigs: [{ id, label, readOnly }], active, select(i),
  //         oneShotWhite(), panelEl }
  constructor(host) {
    this.host = host;
    this.el = document.createElement("div");
    this.el.className = "body-panel rp-panel";
    const ro = !!host.rigs[host.active].readOnly;
    this.el.innerHTML = `
      <p class="body-panel-title">Panasonic AW-RP150 · <span>pick a camera, read its screen, then turn the knobs</span></p>
      <div class="rp-screen" aria-live="polite"></div>
      <div class="rp-select" role="group" aria-label="Camera selection">
        ${Array.from({ length: 10 }, (_, i) => {
          const rig = host.rigs.findIndex((r) => r.id === String(i + 1));
          return `<button type="button" class="rp-cam${rig === host.active ? " on" : ""}" data-cam="${i + 1}" ${rig < 0 ? "disabled" : ""}><i class="${rig >= 0 ? "led" : ""}"></i>${i + 1}</button>`;
        }).join("")}
      </div>
      ${
        host.pan
          ? `<div class="rp-ptz">
        <figure class="rp-mirror" aria-hidden="true"><canvas width="320" height="180"></canvas><figcaption>Camera ${host.rigs[host.active].id} on the multiview</figcaption></figure>
        <div class="rp-joy" role="application" tabindex="0" aria-label="Pan/tilt joystick: drag, or use the arrow keys" aria-disabled="${ro}"><span class="rp-joy-stick"></span></div>
        <div class="rp-ptz-side">
          <div class="rp-speed"></div>
          <div class="hw-rocker" aria-label="Zoom lever">
            <button type="button" data-zoom="-1" aria-label="Zoom out (WIDE)" ${ro ? "disabled" : ""}>W</button><span>ZOOM</span><button type="button" data-zoom="1" aria-label="Zoom in (TELE)" ${ro ? "disabled" : ""}>T</button>
          </div>
          <button type="button" class="hw-btn" data-focus-auto ${ro ? "disabled" : ""}>FOCUS AUTO</button>
        </div>
      </div>`
          : ""
      }
      ${ro ? `<p class="control-note rp-readonly">Camera ${host.rigs[host.active].id} is the <strong>static wide</strong> — read its screen, but never touch it.</p>` : ""}
      <div class="rp-wb" role="group" aria-label="White balance">
        ${WB_BUTTONS.map((b) => `<button type="button" class="hw-btn" data-wb="${b.id}" title="${b.title}" ${ro ? "disabled" : ""}>${b.label}</button>`).join("")}
      </div>
      <div class="rp-knobs"></div>
      <div class="ax-row">
        <button type="button" class="hw-btn" data-iris-auto ${ro ? "disabled" : ""}>IRIS AUTO</button>
        ${
          host.pan
            ? ""
            : `<div class="hw-rocker" aria-label="Zoom lever">
          <button type="button" data-zoom="-1" aria-label="Zoom out (WIDE)" ${ro ? "disabled" : ""}>W</button><span>ZOOM</span><button type="button" data-zoom="1" aria-label="Zoom in (TELE)" ${ro ? "disabled" : ""}>T</button>
        </div>
        <button type="button" class="hw-btn" data-focus-auto ${ro ? "disabled" : ""}>FOCUS AUTO</button>`
        }
      </div>`;
    host.panelEl.appendChild(this.el);
    this.screen = this.el.querySelector(".rp-screen");
    this.readOnly = ro;
    this.buildKnobs();
    this.bind();
    if (host.pan) this.bindJoystick();
    this.update();
  }

  // Drag the stick (or hold an arrow key); it springs back when let go.
  // The push is raised to the 1.5 power so small pushes give fine control.
  bindJoystick() {
    const h = this.host;
    const pad = this.el.querySelector(".rp-joy");
    const stick = pad.querySelector(".rp-joy-stick");
    this.speedKnob = new Knob({
      label: "P/T SPEED",
      min: 1,
      max: 5,
      value: h.ptSpeed(),
      color: "#36d07a",
      disabled: false,
      format: (v) => ["", "1 slow", "2", "3", "4", "5 fast"][v],
      onChange: (v) => {
        h.setPtSpeed(v);
        h.say(v <= 2 ? `P/T SPEED ${v}: slow and smooth — for moves that might be on air, and for the last little bit of framing.` : v >= 4 ? `P/T SPEED ${v}: fast — for getting somewhere while you're not on program. Too fast to frame with.` : `P/T SPEED ${v}.`);
      },
    });
    this.el.querySelector(".rp-speed").appendChild(this.speedKnob.el);
    // On a phone the picture is a long scroll away from the stick, so a copy
    // of it sits beside the joystick (CSS shows it only in one column).
    this.mirror = this.el.querySelector(".rp-mirror canvas");
    if (this.readOnly) return;
    let push = [0, 0];
    let raf = 0;
    let last = 0;
    const run = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const m = Math.hypot(push[0], push[1]);
      if (m > 0.04) h.pan(push[0] * Math.sqrt(m), push[1] * Math.sqrt(m), dt);
      raf = requestAnimationFrame(run);
    };
    const start = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(run);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      push = [0, 0];
      stick.style.transform = "";
      pad.classList.remove("held");
    };
    const aim = (e) => {
      const r = pad.getBoundingClientRect();
      const R = r.width / 2;
      let dx = (e.clientX - (r.left + R)) / (R * 0.8);
      let dy = (e.clientY - (r.top + r.height / 2)) / (R * 0.8);
      const m = Math.hypot(dx, dy);
      if (m > 1) {
        dx /= m;
        dy /= m;
      }
      push = [dx, dy];
      stick.style.transform = `translate(${dx * R * 0.55}px, ${dy * R * 0.55}px)`;
    };
    pad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pad.setPointerCapture?.(e.pointerId);
      pad.classList.add("held");
      aim(e);
      start();
    });
    pad.addEventListener("pointermove", (e) => {
      if (raf) aim(e);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => pad.addEventListener(ev, stop));
    const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    pad.addEventListener("keydown", (e) => {
      const k = keys[e.key];
      if (!k) return;
      e.preventDefault();
      h.pan(k[0] * 0.5, k[1] * 0.5, 0.12);
    });
    this.stopJoystick = stop;
  }

  buildKnobs() {
    const h = this.host;
    const cam = h.camera;
    const s = h.get();
    const wrap = this.el.querySelector(".rp-knobs");
    const sh = cam.shading || { gain: 200, ped: 200 };
    const k = (label, key, min, max, color) =>
      new Knob({ label, min, max, value: s[key] || 0, color, disabled: this.readOnly, format: (v) => (v > 0 ? `+${v}` : String(v)), onChange: (v) => h.change(key, v) });
    // The whole iris range; the lab clamps it to what the lens can open to
    // at the current zoom (zoomed in, F2.8 isn't there).
    const irisOpts = () => apertureOptions(cam);
    const ap = irisOpts();
    const gains = gainOptions(cam);
    const idx = (opts, v) => opts.reduce((b, o, i) => (Math.abs(Math.log(o.value || 1e-3) - Math.log(v || 1e-3)) < Math.abs(Math.log(opts[b].value || 1e-3) - Math.log(v || 1e-3)) ? i : b), 0);
    const gIdx = (v) => gains.reduce((b, o, i) => (Math.abs(o.value - v) < Math.abs(gains[b].value - v) ? i : b), 0);
    this.knobs = {
      rGain: k("R GAIN", "rGain", -sh.gain, sh.gain, "#e2453c"),
      bGain: k("B GAIN", "bGain", -sh.gain, sh.gain, "#3c78e2"),
      rPed: k("R PED", "rPed", -sh.ped, sh.ped, "#e2453c"),
      bPed: k("B PED", "bPed", -sh.ped, sh.ped, "#3c78e2"),
      mPed: k("M.PED", "mPed", -sh.ped, sh.ped, "#9aa0b0"),
      aperture: new Knob({
        label: "IRIS",
        min: 0,
        max: ap.length - 1,
        value: ap.length - 1 - idx(ap, s.aperture),
        disabled: this.readOnly,
        color: "#f0c040",
        // turning up opens the iris
        format: (i) => `F${irisOpts()[Math.max(0, irisOpts().length - 1 - i)]?.value.toFixed(1) ?? "—"}`,
        onChange: (i) => {
          const o = irisOpts();
          h.change("aperture", o[Math.max(0, o.length - 1 - i)].value);
        },
      }),
      gainStops: new Knob({
        label: "F1 · GAIN",
        min: 0,
        max: gains.length - 1,
        value: gIdx(s.gainStops),
        disabled: this.readOnly,
        color: "#9aa0b0",
        format: (i) => `${gains[i].shown}dB`,
        onChange: (i) => h.change("gainStops", gains[i].value),
      }),
    };
    this.gIdx = gIdx;
    this.apIdx = (v) => {
      const o = irisOpts();
      return o.length - 1 - idx(o, v);
    };
    for (const name of ["rGain", "bGain", "rPed", "bPed", "mPed", "aperture", "gainStops"]) wrap.appendChild(this.knobs[name].el);
  }

  bind() {
    const h = this.host;
    this.el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.dataset.cam) {
        const i = h.rigs.findIndex((r) => r.id === b.dataset.cam);
        if (i >= 0) h.select(i);
      } else if (b.dataset.wb) {
        const mode = b.dataset.wb;
        if (mode === "onepush") h.change("wb", h.oneShotWhite());
        else if (mode === "indoor") h.change("wb", 3200);
        else if (mode === "outdoor") h.change("wb", 5600);
        h.change("wbMode", mode);
        h.say(
          mode === "indoor"
            ? "A / 3200K — Musco's house default."
            : mode === "outdoor"
              ? "B / 5600K: daylight. Not what Musco's stage lights are."
              : mode === "auto"
                ? "ATW: auto tracking — it drifts as the lighting changes between pieces."
                : "AWB: white balanced on whatever is in frame. Each camera sees something different, so they won't match.",
        );
        h.note(`wb:${mode}`);
      } else if ("irisAuto" in b.dataset) {
        const on = !h.get().auto?.aperture;
        h.setAuto("aperture", on);
        h.say(on ? "Iris on AUTO: it will chase every lighting change." : "Iris back to manual.");
      } else if ("focusAuto" in b.dataset) {
        // The checklist's quick fix: AUTO on, let it find focus, AUTO off.
        const on = !h.get().auto?.focus;
        h.setAuto("focus", on);
        h.say(on ? "Focus AUTO on — let it find focus, then turn it off so it doesn't wander mid-shot." : "Focus AUTO off: focus stays where it is.");
      }
    });
    this.el.querySelectorAll("[data-zoom]").forEach((b) => {
      let timer = 0;
      const dir = Number(b.dataset.zoom);
      const go = () => h.change("focal", h.get().focal * (dir > 0 ? 1.03 : 1 / 1.03));
      const stop = () => clearInterval(timer);
      b.addEventListener("pointerdown", (e) => {
        if (b.disabled) return;
        e.preventDefault();
        go();
        clearInterval(timer);
        timer = setInterval(go, 60);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, stop));
    });
  }

  update() {
    const h = this.host;
    if (this.mirror && this.mirror.offsetParent && h.mirror) {
      this.mirror.getContext("2d").drawImage(h.mirror(), 0, 0, this.mirror.width, this.mirror.height);
      const live = h.tally?.().program === h.rigs[h.active].id;
      this.mirror.parentElement.classList.toggle("pgm", live);
    }
    const s = h.get();
    const cam = h.camera;
    const rig = h.rigs[h.active];
    const range = focalRange(h.scene, cam);
    const irisT = 1 - (Math.log(s.aperture) - Math.log(cam.aperture.min)) / (Math.log(cam.aperture.max) - Math.log(cam.aperture.min));
    const zoomT = (Math.log(s.focal) - Math.log(range.min)) / (Math.log(range.max / range.min) || 1);
    const focusT = Math.min(1, Math.log(s.focus / 0.5) / Math.log(200));
    const bar = (t) => `<span class="rp-bar"><span style="width:${Math.round(Math.max(0, Math.min(1, t)) * 100)}%"></span></span>`;
    const g = gainOptions(cam)[this.gIdx(s.gainStops)];
    const wbMode = s.wbMode || "temp";
    const wbText = wbMode === "indoor" ? "A 3200K" : wbMode === "outdoor" ? "B 5600K" : wbMode === "auto" ? "ATW" : `${Math.round(effectiveWb(s, h.scene).kelvin)}K`;
    const val = (v) => (v > 0 ? `+${v}` : String(v || 0));
    const html = `
      <div class="rp-top"><span>CAM00${rig.id}:AW-UE150</span><span>${rig.label || ""}</span></div>
      <div class="rp-main">
        <div class="rp-cambox">CAM<b>${rig.id}</b></div>
        <div class="rp-bars">
          <div>IRIS : CLOSE ${bar(irisT)} OPEN <b>F${s.aperture.toFixed(1)}</b>${s.auto?.aperture ? " <i>AUTO</i>" : ""}</div>
          <div>ZOOM : WIDE ${bar(zoomT)} TELE</div>
          <div>FOCUS: NEAR ${bar(focusT)} FAR${s.auto?.focus ? " <i>AUTO</i>" : ""}</div>
        </div>
      </div>
      <div class="rp-vals">
        <div class="rp-group"><span>GAIN</span><div><em class="r">R</em><b>${val(s.rGain)}</b></div><div><em class="b">B</em><b>${val(s.bGain)}</b></div></div>
        <div class="rp-group"><span>PED</span><div><em class="r">R</em><b>${val(s.rPed)}</b></div><div><em class="b">B</em><b>${val(s.bPed)}</b></div><div><em class="m">M</em><b>${val(s.mPed)}</b></div></div>
      </div>
      <div class="rp-foot"><div><span>GAIN</span><b>${g.shown}dB</b></div><div><span>SHTR</span><b>${s.shutter === 60 ? "—" : `1/${s.shutter}`}</b></div><div><span>SCENE</span><b>SCENE1</b></div><div><span>COLOR</span><b>${wbText}</b></div></div>`;
    if (html !== this.lastHtml) {
      this.screen.innerHTML = html;
      this.lastHtml = html;
    }
    this.el.querySelectorAll("[data-wb]").forEach((b) => b.classList.toggle("on", b.dataset.wb === wbMode));
    this.el.querySelector("[data-iris-auto]").classList.toggle("on", !!s.auto?.aperture);
    this.el.querySelector("[data-focus-auto]").classList.toggle("on", !!s.auto?.focus);
    for (const key of ["rGain", "bGain", "rPed", "bPed", "mPed"]) if (this.knobs[key].value !== (s[key] || 0)) this.knobs[key].set(s[key] || 0, true);
    const ai = this.apIdx(s.aperture);
    if (this.knobs.aperture.value !== ai) this.knobs.aperture.set(ai, true);
    if (this.speedKnob && this.speedKnob.value !== h.ptSpeed()) this.speedKnob.set(h.ptSpeed(), true);
    const gi = this.gIdx(s.gainStops);
    if (this.knobs.gainStops.value !== gi) this.knobs.gainStops.set(gi, true);
  }

  setVisible() {}

  destroy() {
    this.stopJoystick?.();
    this.el.remove();
  }
}
