// Monitoring panels: exposure meter, histogram, waveform, depth-of-field
// map, shutter-angle diagram, debug readout. Each is independent; a station
// lists which ones exist and which start on. Histogram and waveform are
// computed from the rendered frame (renderer scope readback), so if the
// picture clips, they clip.
import { formatStops, stopWord, formatDistance, formatShutterAngle, INFINITY_M } from "../sim/camera-model.js";

export const TOOL_INFO = {
  meter: { label: "Meter", panel: true },
  histogram: { label: "Histogram", panel: true },
  waveform: { label: "Waveform", panel: true },
  zebras: { label: "Zebras" },
  peaking: { label: "Peaking" },
  magnify: { label: "Magnify" },
  dof: { label: "Focus map", panel: true },
  shutter: { label: "Shutter angle", panel: true },
  hud: { label: "Camera display" },
  debug: { label: "Debug", panel: true },
};

// Rec.709 luma of 8-bit display values, plus clip / crush fractions.
export function scopeStats(scope) {
  const { pixels, width, height } = scope;
  const hist = new Uint32Array(64);
  let clipped = 0;
  let crushed = 0;
  let sum = 0;
  const n = width * height;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    hist[Math.min(63, y >> 2)]++;
    if (Math.max(r, g, b) >= 253) clipped++;
    if (y <= 4) crushed++;
    sum += y;
  }
  return { hist, clipPct: (100 * clipped) / n, crushPct: (100 * crushed) / n, meanLuma: sum / n / 255 };
}

function canvasPanel(title, h = 110) {
  const wrap = document.createElement("figure");
  wrap.className = "tool-panel";
  wrap.innerHTML = `<figcaption>${title}<span class="tool-note"></span></figcaption><canvas height="${h}"></canvas>`;
  const cnv = wrap.querySelector("canvas");
  return { wrap, cnv, note: wrap.querySelector(".tool-note") };
}

function fitCanvas(cnv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(cnv.clientWidth * dpr);
  const h = Math.round(cnv.clientHeight * dpr);
  if (cnv.width !== w || cnv.height !== h) {
    cnv.width = w;
    cnv.height = h;
  }
  return { w, h, dpr };
}

const panels = {
  meter() {
    const wrap = document.createElement("figure");
    wrap.className = "tool-panel tool-meter";
    wrap.innerHTML = `<figcaption>Exposure</figcaption>
      <div class="meter-scale" role="img">
        <div class="meter-zone"></div>
        ${[-3, -2, -1, 0, 1, 2, 3].map((v) => `<span class="meter-mark" style="left:${((v + 3) / 6) * 100}%">${v > 0 ? "+" + v : v === 0 ? "0" : "−" + -v}</span>`).join("")}
        <div class="meter-needle"></div>
      </div>
      <p class="meter-text"></p>`;
    const needle = wrap.querySelector(".meter-needle");
    const text = wrap.querySelector(".meter-text");
    const scale = wrap.querySelector(".meter-scale");
    return {
      wrap,
      update({ derived }) {
        const e = derived.exposureStops;
        const c = Math.max(-3.3, Math.min(3.3, e));
        needle.style.left = `${((c + 3) / 6) * 100}%`;
        const word =
          Math.abs(e) < 0.2 ? "About right" : e > 0 ? `${formatStops(e)} ${stopWord(e)} over` : `${formatStops(e)} ${stopWord(e)} under`;
        text.textContent = Math.abs(e) > 3.3 ? `${word} — off the scale!` : word;
        scale.setAttribute("aria-label", `Exposure meter: ${word}`);
      },
    };
  },

  histogram() {
    const p = canvasPanel("Histogram");
    return {
      wrap: p.wrap,
      update({ stats }) {
        if (!stats) return;
        const ctx = p.cnv.getContext("2d");
        const { w, h } = fitCanvas(p.cnv);
        ctx.clearRect(0, 0, w, h);
        let max = 1;
        for (let i = 1; i < 63; i++) max = Math.max(max, stats.hist[i]);
        const bw = w / 64;
        for (let i = 0; i < 64; i++) {
          const v = Math.min(1, stats.hist[i] / max);
          ctx.fillStyle = i === 63 && stats.clipPct > 0.5 ? "#ff5a6e" : i === 0 && stats.crushPct > 2 ? "#7c9bff" : "rgba(235,238,250,0.8)";
          ctx.fillRect(i * bw, h - v * h, bw - 0.5, v * h);
        }
        const parts = [];
        if (stats.clipPct > 0.5) parts.push(`${stats.clipPct.toFixed(1)}% clipped`);
        if (stats.crushPct > 2) parts.push(`${stats.crushPct.toFixed(0)}% crushed`);
        p.note.textContent = parts.length ? " · " + parts.join(" · ") : "";
      },
    };
  },

  waveform() {
    const p = canvasPanel("Waveform (luma, 0–100)", 130);
    return {
      wrap: p.wrap,
      update({ scope }) {
        if (!scope) return;
        const ctx = p.cnv.getContext("2d");
        const { w, h } = fitCanvas(p.cnv);
        const img = ctx.createImageData(w, h);
        const { pixels, width, height } = scope;
        const buf = img.data;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const l = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
            const px = Math.floor((x / width) * w);
            const py = Math.round((1 - l) * (h - 1));
            const o = (py * w + px) * 4;
            buf[o] = Math.min(255, buf[o] + 40);
            buf[o + 1] = Math.min(255, buf[o + 1] + 70);
            buf[o + 2] = Math.min(255, buf[o + 2] + 45);
            buf[o + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font = `${Math.round(h / 11)}px system-ui`;
        for (const v of [0, 50, 100]) {
          const y = (1 - v / 100) * (h - 1) + 0.5;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
          ctx.fillText(String(v), 4, Math.max(h / 11, Math.min(h - 3, y - 3)));
        }
      },
    };
  },

  dof() {
    const p = canvasPanel("Focus map (distance from camera)", 96);
    return {
      wrap: p.wrap,
      update({ derived, settings, scene }) {
        const ctx = p.cnv.getContext("2d");
        const { w, h, dpr } = fitCanvas(p.cnv);
        const lo = Math.log(0.5);
        const hi = Math.log(40);
        const X = (m) => 12 * dpr + ((Math.log(Math.min(40, Math.max(0.5, m))) - lo) / (hi - lo)) * (w - 24 * dpr);
        ctx.clearRect(0, 0, w, h);
        const axisY = h * 0.72;
        // in-focus band
        const x0 = X(derived.dofNear);
        const x1 = derived.dofFar === Infinity ? w : X(derived.dofFar);
        ctx.fillStyle = "rgba(107,255,176,0.22)";
        ctx.fillRect(x0, 4 * dpr, Math.max(2, x1 - x0), axisY - 4 * dpr);
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.moveTo(0, axisY);
        ctx.lineTo(w, axisY);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = `${11 * dpr}px system-ui`;
        ctx.textAlign = "center";
        for (const m of [0.5, 1, 2, 5, 10, 20, 40]) {
          ctx.fillText(m === 40 ? "∞" : `${m}m`, X(m), h - 4 * dpr);
          ctx.fillRect(X(m) - 0.5, axisY, 1, 4 * dpr);
        }
        // subjects
        // Sorted by distance, labels cycle through three rows so neighbors
        // never overlap.
        const subjects = Object.values(scene.subjects || {}).sort((a, b) => a.depth - b.depth);
        subjects.forEach((s, i) => {
          const x = X(s.depth);
          const inFocus = s.depth >= derived.dofNear && s.depth <= derived.dofFar;
          ctx.fillStyle = inFocus ? "#6bffb0" : "#a6acc8";
          ctx.beginPath();
          ctx.arc(x, axisY, 5 * dpr, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText(s.label.replace(/^the /, ""), x, axisY - (11 + (i % 3) * 14) * dpr);
        });
        // focus plane
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(X(settings.focus) - dpr, 2 * dpr, 2 * dpr, axisY);
        const far = derived.dofFar === Infinity ? "∞" : formatDistance(derived.dofFar);
        p.note.textContent = ` · sharp from ${formatDistance(derived.dofNear)} to ${far}`;
      },
    };
  },

  shutter() {
    const wrap = document.createElement("figure");
    wrap.className = "tool-panel tool-shutter";
    wrap.innerHTML = `<figcaption>Shutter angle</figcaption>
      <div class="shutter-row">
        <svg viewBox="-50 -50 100 100" class="shutter-disc" aria-hidden="true">
          <circle r="46" class="shutter-bg"/><path class="shutter-open"/>
        </svg>
        <p class="shutter-text"></p>
      </div>`;
    const path = wrap.querySelector(".shutter-open");
    const text = wrap.querySelector(".shutter-text");
    return {
      wrap,
      update({ settings, derived }) {
        const a = Math.min(359.9, derived.shutterAngle);
        const rad = (a * Math.PI) / 180;
        const x = 46 * Math.sin(rad);
        const y = -46 * Math.cos(rad);
        path.setAttribute("d", `M0 0 L0 -46 A46 46 0 ${a > 180 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`);
        const conv = Math.round(settings.fps * 2);
        const note = derived.slowShutter
          ? "Slower than the frame rate — frames repeat."
          : derived.shutterAngle > 250
            ? "Open a long time each frame → smeary motion."
            : derived.shutterAngle < 90
              ? "Open only briefly → crisp, staccato motion."
              : "Close to the classic 180° look.";
        text.innerHTML = `<strong>${formatShutterAngle(derived.shutterAngle)}</strong> at ${settings.fps}p · 1/${settings.shutter}<br><span>${note} (180° at ${settings.fps}p ≈ 1/${conv})</span>`;
      },
    };
  },

  debug() {
    const wrap = document.createElement("figure");
    wrap.className = "tool-panel tool-debug";
    wrap.innerHTML = `<figcaption>Debug</figcaption><pre></pre>`;
    const pre = wrap.querySelector("pre");
    return {
      wrap,
      update({ settings, derived, stats, perf, camera, scene, activity }) {
        const f = (v, n = 3) => (typeof v === "number" ? (isFinite(v) ? v.toFixed(n) : "∞") : v);
        pre.textContent = [
          `camera ${camera.id} (${camera.sensor.name}, crop ${camera.sensor.crop})  scene ${scene.id} EV100 ${scene.ev100}`,
          `N ${f(derived.N)}  t ${f(derived.t, 5)}s  ND ${settings.nd}  gain ${f(settings.gainStops, 2)} st  WB ${Math.round(settings.wb)}K`,
          `EV(optical) ${f(derived.evOptical, 2)}  sensor ${f(derived.sensorStops, 2)} st  picture ${f(derived.exposureStops, 2)} st`,
          `rawScale ${f(derived.rawScale, 4)}  gain× ${f(derived.gain, 2)}  WB gains ${derived.wbGains.map((g) => g.toFixed(2)).join(" ")}`,
          `focal ${f(derived.focal, 1)}mm (${f(derived.focalEquiv, 0)}mm eq, frame zoom ${f(derived.frameZoom, 2)}×)  sensorW ${f(derived.sensorWidth, 1)}mm`,
          `CoC scale ${f(derived.cocScalePx, 2)}px frame / ${f(derived.cocScenePx, 2)}px scene  DOF ${f(derived.dofNear, 2)}–${f(derived.dofFar, 2)}m`,
          `shutter ${f(derived.shutterAngle, 0)}°  capture ${f(1 / derived.captureInterval, 1)}/s  slow ${derived.slowShutter}`,
          `noise mid-grey ${f(derived.midNoisePct, 1)}%  shotK ${derived.shotK.toExponential(2)}  read ${derived.readSigma.toExponential(2)}`,
          stats ? `clip ${f(stats.clipPct, 2)}%  crush ${f(stats.crushPct, 2)}%  mean ${f(stats.meanLuma, 3)}` : "scopes off",
          perf ? `dof ${f(perf.dofMs, 1)}ms  image ${f(perf.imageMs, 1)}ms  motion samples ${perf.samples}  out ${perf.w}×${perf.h}` : "",
          activity ? `activity ${JSON.stringify(activity)}` : "",
        ].join("\n");
      },
    };
  },
};

export class ToolPanels {
  constructor(container) {
    this.container = container;
    this.active = new Map();
  }

  set(ids) {
    const want = ids.filter((id) => panels[id]);
    for (const [id, p] of this.active) {
      if (!want.includes(id)) {
        p.wrap.remove();
        this.active.delete(id);
      }
    }
    // keep a stable order
    for (const id of want) {
      if (!this.active.has(id)) this.active.set(id, panels[id]());
    }
    for (const id of Object.keys(panels)) {
      const p = this.active.get(id);
      if (p) this.container.appendChild(p.wrap);
    }
    this.container.hidden = this.active.size === 0;
  }

  needsScope() {
    return this.active.has("histogram") || this.active.has("waveform") || this.active.has("debug");
  }

  update(ctx) {
    for (const p of this.active.values()) p.update(ctx);
  }
}

export { INFINITY_M };
