// The camera model: value ladders, snapping settings to what a body offers,
// and `derive()` — every physically meaningful number the renderer, HUD,
// scopes and activities need, computed in one place from the settings.
//
// Canonical settings shape (camera-independent):
//   { fps, shutter (denominator, 60 = 1/60 s), aperture (nominal f-number),
//     gainStops (stops of gain above ISO 100), nd (stops), wb (kelvin),
//     focus (meters), focal (35mm-EQUIVALENT focal length, mm — see
//     "framing" below; the real lens on the body is focal / crop) }
//   Optional: wbAB / wbGM (white-balance shift steps; + = amber / green),
//   wbMode ("temp" — dial in kelvin — or "auto", "indoor", "outdoor"), and
//   auto: { aperture, shutter, gainStops, focus } — which settings the
//   camera is choosing for itself (lab-view's auto-exposure loop writes them).
import { whiteBalanceGains, kelvinToLinearRgb } from "./color.js";

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
// "Acceptably sharp": a blur circle narrower than this many scene pixels.
// The classic stills criterion (0.03 mm of circle of confusion on full frame)
// assumes an 8x10 print viewed at arm's length; on a 1280 px wide frame it
// works out to 1.07 px whatever the sensor size, which is finer than this
// picture can draw (the renderer skips blur below 0.7 px) — so the focus map
// used to call subjects soft that looked perfectly sharp on screen. The
// criterion has always depended on how the footage is judged; 2 px is the
// same math judged at the resolution we actually deliver.
export const SHARP_PX = 2;

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

// Kelvin, focus and zoom are continuous; dials treat them with a position
// mapping.
export const WB_RANGE = { min: 2000, max: 10000, step: 50 };
export const FOCUS_RANGE = { min: 0.4, max: 100 };

// ---------- framing ----------
//
// A scene is drawn once, at one field of view: scene.equivFocal, written as
// the 35mm-equivalent focal length that would frame it that way. The lens
// setting (settings.focal) is in those same equivalent millimetres, so it
// means the same framing on every body, while the REAL focal length on the
// barrel is focal / crop — a smaller sensor needs a shorter lens to frame
// the same shot, which is exactly why it shows more depth of field.
//
// Put another way: keep the real lens and switch to a smaller sensor and the
// shot zooms in by the crop factor, because the smaller sensor only covers
// the middle of the image the lens projects. The sim does that by cropping
// into the drawn scene, so it can never frame WIDER than scene.equivFocal,
// and past MAX_FRAME_ZOOM the 1280px scene image would visibly soften — so
// that's where the zoom range stops, tighter than a 5.6× crop would really go.
export const MAX_FRAME_ZOOM = 3;

export function focalRange(scene, camera) {
  const maxZoom = scene.maxFrameZoom || MAX_FRAME_ZOOM;
  let min = scene.equivFocal;
  let max = scene.equivFocal * maxZoom;
  const lens = camera?.lens;
  if (lens) {
    // A real lens can't go wider than its wide end — the scene is drawn wider
    // than that, so the shot starts zoomed in. Nor past its long end.
    min = Math.min(max, Math.max(min, lens.wide));
    max = Math.max(min, Math.min(max, lens.tele));
  }
  return { min, max };
}

// The widest f-number this body's lens reaches at a framing (35mm-equivalent
// mm). Camcorder zooms lose light as they zoom in; this ramps the f-number
// from apWide to apTele on a log scale, which is close to how they behave.
export function maxApertureAt(camera, focalEquiv) {
  const lens = camera.lens;
  if (!lens || !lens.apTele || lens.apTele === lens.apWide) return camera.aperture.min;
  const k = Math.min(1, Math.max(0, Math.log(focalEquiv / lens.wide) / Math.log(lens.tele / lens.wide)));
  return lens.apWide * (lens.apTele / lens.apWide) ** k;
}

// The real focal length (mm) that gives this framing on this body.
export function realFocal(focalEquiv, camera) {
  return focalEquiv / camera.sensor.crop;
}

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

// Snap any settings object onto what a given body can actually do (and, for
// the lens, what the scene can be framed at).
export function normalizeSettings(s, camera, scene) {
  const out = { ...s };
  out.fps = nearest(fpsOptions(camera), s.fps).value;
  out.shutter = nearestLog(shutterOptions(camera), s.shutter).value;
  const lens = focalRange(scene, camera);
  out.focal = Math.min(lens.max, Math.max(lens.min, s.focal ?? lens.min));
  // Snap to a marked stop the lens can actually open to at this zoom.
  const widest = maxApertureAt(camera, out.focal);
  const apOpts = apertureOptions(camera).filter((o) => exactAperture(o.value) >= exactAperture(widest) * 0.985);
  out.aperture = nearestLog(apOpts.length ? apOpts : apertureOptions(camera), Math.max(s.aperture, widest)).value;
  out.gainStops = nearest(gainOptions(camera), s.gainStops).value;
  out.nd = nearest(ndOptions(camera), s.nd).value;
  out.wb = Math.min(WB_RANGE.max, Math.max(WB_RANGE.min, s.wb));
  out.focus = Math.min(INFINITY_M, Math.max(FOCUS_RANGE.min, s.focus));
  const sh = camera.wbShift;
  out.wbAB = sh ? Math.max(-sh.ab, Math.min(sh.ab, Math.round(s.wbAB || 0))) : 0;
  out.wbGM = sh ? Math.max(-sh.gm, Math.min(sh.gm, Math.round(s.wbGM || 0))) : 0;
  out.wbMode = s.wbMode || "temp";
  out.auto = { ...(s.auto || {}) };
  return out;
}

// Station data speaks in ISO ("iso: 800"); convert once on load. A station
// that says nothing about the lens gets the scene's own framing (the widest
// the drawn scene can be shown at), so nothing zooms unless it means to.
export function settingsFromPreset(p, scene) {
  return {
    fps: p.fps ?? 30,
    shutter: p.shutter ?? 60,
    aperture: p.aperture ?? 4,
    gainStops: p.gainDb != null ? p.gainDb / 6 : isoStops(p.iso ?? 100),
    nd: p.nd ?? 0,
    wb: p.wb ?? 5600,
    focus: p.focus ?? 3,
    focal: p.focal ?? scene.equivFocal,
    wbAB: p.wbAB ?? 0,
    wbGM: p.wbGM ?? 0,
    wbMode: p.wbMode ?? "temp",
    auto: { ...(p.auto || {}) },
  };
}

// ---------- white balance ----------
//
// One step of white-balance shift. Sony documents the A–B axis in steps of
// about 5 mireds (unverified for the AX100 specifically); G–M has no common
// unit, so a step here is a 1.5% green gain. Both are teaching values: they
// move the picture the right way by a plausible amount.
export const WB_AB_MIRED = 5;
export const WB_GM_STEP = 0.015;
export const WB_PRESETS = { indoor: 3200, outdoor: 5600 };

export function keyLight(scene) {
  return scene.lights[scene.keyLight] || Object.values(scene.lights)[0];
}

// What white balance the camera is actually applying: { kelvin, ab, gm }.
// Auto lands where the scene says a camcorder's AWB settles (scene.awb) —
// rarely perfectly neutral under warm stage light — or, if the scene doesn't
// say, exactly on the key light.
export function effectiveWb(s, scene) {
  const mode = s.wbMode || "temp";
  let base = { kelvin: s.wb, ab: 0, gm: 0 };
  if (mode === "auto") base = { ab: 0, gm: 0, ...(scene.awb || { kelvin: keyLight(scene).kelvin }) };
  else if (WB_PRESETS[mode]) base = { kelvin: WB_PRESETS[mode], ab: 0, gm: 0 };
  return { kelvin: base.kelvin, ab: base.ab + (s.wbAB || 0), gm: base.gm + (s.wbGM || 0) };
}

// RGB gains for the whole white-balance chain: kelvin, then the shift, then
// the body's own color lean. Amber shift = camera assumes cooler light (fewer
// mireds) than the dial says, so it leaves the picture warmer.
export function wbGainsFor(s, camera, scene) {
  const wb = effectiveWb(s, scene);
  const mired = 1e6 / wb.kelvin - wb.ab * WB_AB_MIRED;
  const g = whiteBalanceGains(1e6 / Math.max(40, Math.min(600, mired)));
  const green = 1 + wb.gm * WB_GM_STEP;
  const bias = camera.colorBias || [1, 1, 1];
  return [g[0] * bias[0], g[1] * green * bias[1], g[2] * bias[2]];
}

// How a white object under the scene's key light comes out, as log chroma
// (ln R/G, ln B/G) — 0,0 is neutral. Comparing two cameras' renders of the
// same white is how the matching stations judge color: it's exactly what an
// operator compares on the multiview, minus the eyeballs.
export function renderedWhite(s, camera, scene) {
  const k = keyLight(scene);
  const light = kelvinToLinearRgb(k.kelvin).map((v, i) => v * (k.tint ? k.tint[i] : 1));
  const g = wbGainsFor(s, camera, scene);
  const r = light[0] * g[0];
  const gr = light[1] * g[1];
  const b = light[2] * g[2];
  return { rg: Math.log(r / gr), bg: Math.log(b / gr) };
}

// Color distance between two renders, in the same log units. About 0.02 is
// where two monitors side by side start to look "the same"; 0.1 is an
// obvious cast. Also returns which way B is off from A, in words.
export function colorMatch(a, b) {
  const dr = b.rg - a.rg;
  const db = b.bg - a.bg;
  const dist = Math.hypot(dr, db);
  // Amber–blue is mostly (R up, B down); green–magenta is G against both.
  const warm = (dr - db) / 2;
  const green = -(dr + db) / 2;
  const words = [];
  if (Math.abs(warm) > 0.015) words.push(warm > 0 ? "warmer (more amber)" : "cooler (more blue)");
  if (Math.abs(green) > 0.012) words.push(green > 0 ? "greener" : "more magenta");
  return { dist, warm, green, words };
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

  // Optics. s.focal is the framing, as a 35mm-equivalent focal length; the
  // real lens on this body is that over the crop factor. So a smaller sensor
  // at the same framing runs a shorter lens — and gets deeper focus for it —
  // while at the same REAL lens it frames tighter (frameZoom).
  const crop = camera.sensor.crop;
  const sensorWidth = 36 / crop;
  const focalEquiv = s.focal;
  const focal = focalEquiv / crop;
  const frameZoom = focalEquiv / scene.equivFocal; // ≥ 1: crop into the drawn scene
  const S = Math.max(s.focus * 1000, focal * 1.5);
  const cocPerUnit = (focal * focal) / (N * (S - focal)); // mm on sensor × |d−S|/d
  // Blur-circle diameter as px of the displayed frame (the whole sensor
  // width), and as px of the drawn scene image — which the blur pass works
  // in, and which the view then magnifies by frameZoom.
  const cocScalePx = (cocPerUnit / sensorWidth) * SCENE_W;
  const cocScenePx = cocScalePx / frameZoom;
  // Same criterion the picture is judged by: SHARP_PX of the DISPLAYED frame,
  // converted to mm on this sensor. (Smaller sensor → smaller circle → the
  // deeper depth of field small cameras really have.) The delivered frame is
  // SCENE_W px wide at every zoom, so zooming doesn't move the criterion —
  // it moves the depth of field, by lengthening the real lens.
  const cocLimit = (SHARP_PX / SCENE_W) * sensorWidth;
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
    focalEquiv,
    frameZoom,
    focusMm: S,
    cocScalePx,
    cocScenePx,
    dofNear,
    dofFar,
    blurPxAt,
    shotK,
    readSigma,
    midNoisePct,
    wbGains: wbGainsFor(s, camera, scene),
    maxAperture: maxApertureAt(camera, s.focal),
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

// Lenses are marked in real millimetres, but how tight the shot looks is the
// 35mm equivalent — which is why camcorder specs quote both.
export function formatFocal(focalEquiv, camera) {
  const real = Math.round(realFocal(focalEquiv, camera));
  if (camera.sensor.crop === 1) return `${real}mm`;
  return `${real}mm (${Math.round(focalEquiv)}mm eq)`;
}

export function formatShutterAngle(angle) {
  return `${Math.round(angle)}°`;
}
