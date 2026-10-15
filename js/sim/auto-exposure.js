// Auto exposure, the way a camcorder does it: meter the WHOLE frame, average
// it, and push that average toward mid grey by moving whichever of iris,
// gain and shutter are set to auto. Pure functions — lab-view.js runs the
// loop, feeding in the mean brightness of each rendered frame.
//
// The teaching point lives in "the whole frame". A recital in a dark hall is
// mostly black curtain and dark audience; to make the AVERAGE look mid grey
// the camera brightens until the brightly lit performers blow out. Its own
// meter then reads "0" — it got what it aimed for — while the performer is
// two stops over. That's why concert cameras run in manual.
import { srgbToLinear } from "./color.js";
import { apertureOptions, gainOptions, shutterOptions, exactAperture, maxApertureAt } from "./camera-model.js";

// Mean display brightness (sRGB 0–1) a camcorder's AE aims the frame at —
// about mid grey after the tone curve.
export const AE_TARGET = 0.43;
export const AE_DEADBAND = 0.2; // stops: close enough, stop hunting
export const AE_RATE = 0.6; // fraction of the error fixed per update

// What the camera's own meter says: stops between the frame average and its
// target. Positive = the camera thinks the picture is too bright.
export function cameraMeter(meanLuma) {
  const m = Math.max(1e-4, srgbToLinear(Math.min(1, Math.max(0, meanLuma))));
  return Math.log2(m / srgbToLinear(AE_TARGET));
}

const AUTO_KEYS = ["aperture", "gainStops", "shutter"];

export function anyAutoExposure(settings) {
  return AUTO_KEYS.some((k) => settings.auto?.[k]);
}

// One step of the loop. Returns the settings changes (possibly none).
// `delta` is stops of brightness wanted (+ = brighter). Brightening opens
// the iris first, then adds gain, then slows the shutter (never slower than
// one frame); darkening takes gain away first, then closes the iris, then
// speeds the shutter.
export function aeStep(settings, camera, meanLuma) {
  if (!anyAutoExposure(settings)) return {};
  const err = -cameraMeter(meanLuma);
  if (Math.abs(err) < AE_DEADBAND) return {};
  let want = Math.max(-2, Math.min(2, err * AE_RATE));
  const out = {};
  const order = want > 0 ? ["aperture", "gainStops", "shutter"] : ["gainStops", "aperture", "shutter"];
  for (const key of order) {
    if (!settings.auto?.[key] || Math.abs(want) < 0.1) continue;
    const [value, got] = moveBy(key, settings[key], want, settings, camera);
    if (got !== 0) {
      out[key] = value;
      want -= got;
    }
  }
  return out;
}

// Move one setting by up to `stops` (+ brighter), snapping to what the body
// offers. Returns [new value, stops actually moved].
function moveBy(key, current, stops, s, camera) {
  let opts;
  let stopsOf;
  if (key === "aperture") {
    const widest = exactAperture(maxApertureAt(camera, s.focal));
    opts = apertureOptions(camera).filter((o) => exactAperture(o.value) >= widest * 0.985 && o.value <= 11.01);
    stopsOf = (v) => -2 * Math.log2(exactAperture(v)); // bigger opening = brighter
  } else if (key === "gainStops") {
    const agcLimit = Math.log2(camera.gain.baseIso / 100) + (camera.gain.mode === "db" ? 30 / 6 : 4);
    opts = gainOptions(camera).filter((o) => o.value <= agcLimit + 0.01);
    stopsOf = (v) => v;
  } else {
    opts = shutterOptions(camera).filter((o) => o.value >= s.fps);
    stopsOf = (v) => -Math.log2(v);
  }
  if (!opts.length) return [current, 0];
  const now = stopsOf(current);
  const goal = now + stops;
  let best = opts[0];
  for (const o of opts) if (Math.abs(stopsOf(o.value) - goal) < Math.abs(stopsOf(best.value) - goal)) best = o;
  // Don't overshoot past the goal by more than half a step's worth.
  const moved = stopsOf(best.value) - now;
  if (Math.sign(moved) !== Math.sign(stops) || Math.abs(moved) < 0.01) return [current, 0];
  return [best.value, moved];
}
