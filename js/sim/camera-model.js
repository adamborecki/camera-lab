// The camera model: value ladders, snapping settings to what a body offers,
// and `derive()` — every physically meaningful number the renderer, HUD,
// scopes and activities need, computed in one place from the settings.
//
// Canonical settings shape (camera-independent):
//   { fps, shutter (denominator, 60 = 1/60 s), aperture (nominal f-number),
//     gainStops (stops of gain above ISO 100), nd (stops), wb (kelvin),
//     focus (meters) }
import { whiteBalanceGains } from "./color.js";

// Every scene is drawn at this resolution; blur radii are in these pixels.
export const SCENE_W = 1280;
export const SCENE_H = 720;
// Sensor saturation in "raw" units, where an 18% grey card lit by the
// scene's key light reads 0.18 at correct exposure and base gain. The
// display clips at 1.3 (tone curve); the sensor keeps ~1.2 stops of headroom
// above that, so a strongly colored light (tungsten is red-heavy) doesn't
// clip one raw channel before the picture itself reaches white.
export const SENSOR_SAT = 3.0;
export const INFINITY_M = 1000;

export const APERTURE_LADDER = [
  1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13,
  14, 16, 18, 20, 22,
];
export const ISO_LADDER = [
  100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000,
  6400, 8000, 10000, 12800, 16000, 20000, 25600,
];
const MAJOR_SHUTTERS = new Set([8, 15, 30, 60, 125, 250, 500, 1000, 2000, 4000, 10000]);

// Nominal markings (f/2.8, 1/125, ISO 125) are rounded; the math uses the
// exact third-stop values so f/2.8 → f/4 is exactly one stop.
export function exactAperture(n) {
  return 2 ** (Math.round(6 * Math.log2(n)) / 6);
}
function apertureThirds(n) {
  return Math.round(6 * Math.log2(n));
}
function isoStops(iso) {
  return Math.round(3 * Math.log2(iso / 100)) / 3;
}

// ---------- per-camera option lists (used by dials) ----------

export function apertureOptions(camera) {
  const lo = apertureThirds(camera.aperture.min);
  const hi = apertureThirds(camera.aperture.max);
  return APERTURE_LADDER.filter((n) => apertureThirds(n) >= lo && apertureThirds(n) <= hi).map((n) => ({
    value: n,
    label: `f/${n}`,
    major: apertureThirds(n) % 3 === 0,
  }));
}

export function shutterOptions(camera) {
  return camera.shutters.map((d) => ({ value: d, label: `1/${d}`, major: MAJOR_SHUTTERS.has(d) }));
}

// Gain options carry the value the camera shows (ISO or dB) plus the
// canonical gainStops the engine uses.
export function gainOptions(camera) {
  const g = camera.gain;
  if (g.mode === "db") {
    const baseStops = Math.log2(g.baseIso / 100);
    const out = [];
    for (let db = 0; db <= g.max; db += g.step) {
      out.push({ value: baseStops + db / 6, shown: db, label: `${db} dB`, major: db % 6 === 0 });
    }
    return out;
  }
  return ISO_LADDER.filter((iso) => iso >= g.min && iso <= g.max).map((iso) => ({
    value: isoStops(iso),
    shown: iso,
    label: `ISO ${iso}`,
    major: Math.round(3 * Math.log2(iso / 100)) % 3 === 0,
  }));
}

export function ndOptions(camera) {
  return camera.nd.steps.map((s) => ({
    value: s.stops,
    label: s.label,
    detail: s.detail || (s.stops ? `−${s.stops} stop${s.stops > 1 ? "s" : ""}` : "no filter"),
    major: true,
  }));
}

export function fpsOptions(camera) {
  return camera.fps.map((f) => ({ value: f, label: `${f}p`, major: true }));
}

// Kelvin and focus are continuous; dials treat them with a position mapping.
export const WB_RANGE = { min: 2000, max: 10000, step: 50 };
export const FOCUS_RANGE = { min: 0.4, max: 100 };

function nearest(options, v, key = "value") {
  let best = options[0];
  for (const o of options) if (Math.abs(o[key] - v) < Math.abs(best[key] - v)) best = o;
  return best;
}
function nearestLog(options, v) {
  let best = options[0];
  for (const o of options) if (Math.abs(Math.log(o.value / v)) < Math.abs(Math.log(best.value / v))) best = o;
  return best;
}

// Snap any settings object onto what a given body can actually do.
export function normalizeSettings(s, camera) {
  const out = { ...s };
  out.fps = nearest(fpsOptions(camera), s.fps).value;
  out.shutter = nearestLog(shutterOptions(camera), s.shutter).value;
  out.aperture = nearestLog(apertureOptions(camera), s.aperture).value;
  out.gainStops = nearest(gainOptions(camera), s.gainStops).value;
  out.nd = nearest(ndOptions(camera), s.nd).value;
  out.wb = Math.min(WB_RANGE.max, Math.max(WB_RANGE.min, s.wb));
  out.focus = Math.min(INFINITY_M, Math.max(FOCUS_RANGE.min, s.focus));
  return out;
}

// Station data speaks in ISO ("iso: 800"); convert once on load.
export function settingsFromPreset(p) {
  return {
    fps: p.fps ?? 30,
    shutter: p.shutter ?? 60,
    aperture: p.aperture ?? 4,
    gainStops: p.gainDb != null ? p.gainDb / 6 : isoStops(p.iso ?? 100),
    nd: p.nd ?? 0,
    wb: p.wb ?? 5600,
    focus: p.focus ?? 3,
  };
}

// ---------- the physics ----------

export function derive(s, camera, scene) {
  const N = exactAperture(s.aperture);
  const t = 1 / s.shutter;
  const frameInterval = 1 / s.fps;
  const slowShutter = t > frameInterval * 1.001;
  // A shutter slower than the frame interval can't fit in one frame, so
  // camcorders repeat frames: the picture updates only once per exposure.
  const captureInterval = slowShutter ? t : frameInterval;
  const shutterAngle = 360 * s.fps * t;

  // Exposure in stops. EV = log2(N²/t) is the classic relationship; ND
  // removes light before the sensor; gain brightens afterward.
  const evOptical = Math.log2((N * N) / t) + s.nd;
  const sensorStops = scene.ev100 - evOptical; // light reaching the sensor vs. "correct" at base
  const exposureStops = sensorStops + s.gainStops; // what the picture looks like
  const rawScale = 2 ** sensorStops;
  const gain = 2 ** s.gainStops;

  // Optics: the scene fixes the framing (35mm-equivalent focal length), so a
  // smaller sensor needs a shorter real lens — and gets deeper focus.
  const crop = camera.sensor.crop;
  const sensorWidth = 36 / crop;
  const focal = scene.equivFocal / crop;
  const S = Math.max(s.focus * 1000, focal * 1.5);
  const cocPerUnit = (focal * focal) / (N * (S - focal)); // mm on sensor × |d−S|/d
  const cocScalePx = (cocPerUnit / sensorWidth) * SCENE_W; // blur-circle diameter in scene px
  const cocLimit = 0.03 / crop; // "acceptably sharp" criterion
  const H = (focal * focal) / (N * cocLimit) + focal;
  const dofNear = (S * (H - focal)) / (H + S - 2 * focal) / 1000;
  const dofFar = S < H ? (S * (H - focal)) / (H - S) / 1000 : Infinity;
  const blurPxAt = (d) => (cocScalePx * Math.abs(d * 1000 - S)) / (d * 1000);

  // Sensor noise in raw units: photon shot noise (√signal) + read noise.
  const electronsPerRaw = camera.sensor.fullWell / SENSOR_SAT;
  const shotK = 1 / electronsPerRaw;
  const readSigma = camera.sensor.readNoise / electronsPerRaw;
  // Relative noise on a mid-grey patch — a handy single number for UI.
  const midRaw = 0.18 * rawScale;
  const midNoisePct = (100 * Math.sqrt(midRaw * shotK + readSigma * readSigma)) / Math.max(midRaw, 1e-6);

  return {
    N,
    t,
    frameInterval,
    captureInterval,
    slowShutter,
    shutterAngle,
    evOptical,
    sensorStops,
    exposureStops,
    rawScale,
    gain,
    crop,
    sensorWidth,
    focal,
    focusMm: S,
    cocScalePx,
    dofNear,
    dofFar,
    blurPxAt,
    shotK,
    readSigma,
    midNoisePct,
    wbGains: whiteBalanceGains(s.wb),
  };
}

// ---------- formatting ----------

// Nearest third of a stop, written the way camera people say it.
export function formatStops(x, { sign = true } = {}) {
  const thirds = Math.round(x * 3);
  if (thirds === 0) return "0";
  const whole = Math.trunc(Math.abs(thirds) / 3);
  const frac = Math.abs(thirds) % 3;
  const s = thirds > 0 ? (sign ? "+" : "") : "−";
  const fracStr = frac === 1 ? "⅓" : frac === 2 ? "⅔" : "";
  return `${s}${whole || !fracStr ? whole : ""}${fracStr}`;
}

export function stopWord(x) {
  const n = Math.abs(Math.round(x * 3) / 3);
  return n === 1 ? "stop" : "stops";
}

export function formatDistance(m) {
  if (m >= INFINITY_M * 0.99 || !isFinite(m)) return "∞";
  if (m < 1) return `${Math.round(m * 100)} cm`;
  if (m < 10) return `${m.toFixed(1)} m`;
  return `${Math.round(m)} m`;
}

export function formatShutterAngle(angle) {
  return `${Math.round(angle)}°`;
}
