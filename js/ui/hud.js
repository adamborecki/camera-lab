// On-screen camera display. Each body gets its own HUD style — where things
// sit, how values are written (Sony "60" vs Canon "1/60", "9dB" vs "ISO 800"),
// and a font that evokes it. Purely presentational: it reads settings and
// derived values, never changes them.
import { gainOptions, formatDistance, formatStops, formatShutterAngle } from "../sim/camera-model.js";

function gainText(camera, s) {
  const opts = gainOptions(camera);
  let best = opts[0];
  for (const o of opts) if (Math.abs(o.value - s.gainStops) < Math.abs(best.value - s.gainStops)) best = o;
  return camera.gain.mode === "db" ? `${best.shown}dB` : `ISO ${best.shown}`;
}

function ndText(camera, s) {
  const step = camera.nd.steps.find((n) => n.stops === s.nd);
  if (!step || s.nd === 0) return "";
  return step.label;
}

function timecode(sec, fps, withFrames) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = Math.floor(sec % 60);
  const f = Math.floor((sec % 1) * fps);
  const p = (n) => String(n).padStart(2, "0");
  return withFrames ? `${p(h)}:${p(m)}:${p(ss)}:${p(f)}` : `${h}:${p(m)}:${p(ss)}`;
}

function meterScale(stops) {
  // −3 … +3 scale with a caret, like a camera's exposure indicator
  const c = Math.max(-3, Math.min(3, stops));
  const pct = ((c + 3) / 6) * 100;
  return `<span class="hud-meter"><span class="hud-meter-ticks">−3·· 2·· 1··0··1 ··2 ··3</span><span class="hud-meter-caret" style="left:${pct}%">▲</span></span>`;
}

const rec = (x) => (x.recording ? `<span class="hud-rec">● REC</span>` : `<span class="hud-stby">STBY</span>`);

const STYLES = {
  lab(s, d, cam, x) {
    const sh = `1/${s.shutter} <small>${formatShutterAngle(d.shutterAngle)}</small>`;
    return {
      top: `<div class="hud-strip">
        <span>${s.fps}p</span><span>${sh}</span><span>F${s.aperture}</span>
        <span>${gainText(cam, s)}</span><span>${ndText(cam, s) || "CLEAR"}</span><span>${Math.round(s.wb)}K</span></div>`,
      tl: `${rec(x)} <span>${timecode(x.recSeconds, s.fps, true)}</span>`,
      br: `<span class="hud-ev">EXP ${formatStops(d.exposureStops)}</span>`,
      bl: `<span>MF ${formatDistance(s.focus)}</span>`,
    };
  },
  sony(s, d, cam, x) {
    return {
      tl: `${rec(x)} <span>${timecode(x.recSeconds, s.fps, false)}</span>`,
      tr: `<span>${s.fps}p</span> <span class="hud-batt">▮▮▮</span>`,
      left: `${ndText(cam, s) ? `<span class="hud-box">${ndText(cam, s)}</span>` : ""}<span>${Math.round(s.wb)}K</span><span>MF ${formatDistance(s.focus)}</span>`,
      bottom: `<span>${s.shutter}</span><span>F${s.aperture}</span><span>${gainText(cam, s)}</span><span class="hud-ev">M.M ${formatStops(d.exposureStops)}</span>`,
    };
  },
  canon(s, d, cam, x) {
    return {
      top: `<span>${rec(x)}</span><span>${timecode(x.recSeconds, s.fps, true)}</span>`,
      left: `<span>1/${s.shutter}</span><span>F${s.aperture.toFixed(1)}</span><span>${gainText(cam, s).replace("dB", ".0 dB")}</span><span>${Math.round(s.wb)}K</span>`,
      tr: `<span>${s.fps}P</span>`,
      bl: `<span>MF ${formatDistance(s.focus)}</span>`,
      br: meterScale(d.exposureStops),
    };
  },
  lumix(s, d, cam, x) {
    return {
      tl: `<span class="hud-box">${s.fps}p</span> ${rec(x)}`,
      tr: `<span>${timecode(x.recSeconds, s.fps, false)}</span>`,
      bottom: `<span>1/${s.shutter}</span><span>F${s.aperture.toFixed(1)}</span>${meterScale(d.exposureStops)}<span>${gainText(cam, s)}</span><span>${Math.round(s.wb)}K</span>`,
      left: ndText(cam, s) ? `<span>${ndText(cam, s)}</span>` : "",
    };
  },
  alpha(s, d, cam, x) {
    return {
      tl: `${rec(x)} <span>${timecode(x.recSeconds, s.fps, false)}</span>`,
      tr: `<span>${s.fps}p</span>`,
      bottom: `<span>1/${s.shutter}</span><span>F${s.aperture}</span><span>${formatStops(d.exposureStops)}</span><span>${gainText(cam, s)}</span>${ndText(cam, s) ? `<span>${ndText(cam, s)}</span>` : ""}`,
      bl: `<span>MF ${formatDistance(s.focus)}</span>`,
    };
  },
};

export class Hud {
  constructor(container) {
    this.el = document.createElement("div");
    this.el.className = "hud";
    this.el.setAttribute("aria-hidden", "true");
    container.appendChild(this.el);
    this.last = "";
  }

  update(settings, derived, camera, extra) {
    const style = STYLES[camera.hud] || STYLES.lab;
    const slots = style(settings, derived, camera, extra);
    const html = Object.entries(slots)
      .filter(([, v]) => v)
      .map(([k, v]) => `<div class="hud-slot hud-${k}">${v}</div>`)
      .join("");
    const key = camera.hud + html;
    if (key === this.last) return;
    this.last = key;
    this.el.className = `hud hud-style-${camera.hud}`;
    this.el.innerHTML = html;
  }

  setVisible(v) {
    this.el.hidden = !v;
  }
}
