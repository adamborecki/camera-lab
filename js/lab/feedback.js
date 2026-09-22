// Teaching feedback, kept separate from the simulator:
//  - describeChange(): the "+1 stop — depth of field got shallower"
//    narration guided stations show after each adjustment.
//  - checks: reusable criteria for guided steps and challenges. Each returns
//    { label, test(ctx) → { pass, detail } } where ctx is
//    { settings, derived, camera, scene, stats }. Criteria use ranges, so a
//    challenge accepts every reasonable solution, not one magic combination.
import { formatStops, stopWord, formatDistance, formatShutterAngle, formatFocal, gainOptions } from "../sim/camera-model.js";

function gainLabel(camera, stops) {
  const opts = gainOptions(camera);
  let best = opts[0];
  for (const o of opts) if (Math.abs(o.value - stops) < Math.abs(best.value - stops)) best = o;
  return best.label;
}

function stopsPhrase(x) {
  if (Math.abs(x) < 0.15) return "no change in exposure";
  return `${formatStops(x)} ${stopWord(x)}`;
}

// Returns { stops, text, tone } for a single control change.
export function describeChange(key, prev, next, prevD, nextD, camera) {
  const dExp = nextD.exposureStops - prevD.exposureStops;
  const tone = dExp > 0.15 ? "up" : dExp < -0.15 ? "down" : "";
  let text = "";
  switch (key) {
    case "aperture": {
      const wider = next.aperture < prev.aperture;
      text = `f/${prev.aperture} → f/${next.aperture}: ${stopsPhrase(dExp)}. ${wider ? "Bigger opening, more light — and shallower depth of field." : "Smaller opening, less light — and deeper depth of field."}`;
      break;
    }
    case "shutter": {
      const faster = next.shutter > prev.shutter;
      text = `1/${prev.shutter} → 1/${next.shutter}: ${stopsPhrase(dExp)}. ${faster ? "Shorter exposure per frame → crisper motion" : "Longer exposure per frame → more motion blur"} (${formatShutterAngle(nextD.shutterAngle)} shutter).`;
      break;
    }
    case "gainStops":
      text = `${gainLabel(camera, prev.gainStops)} → ${gainLabel(camera, next.gainStops)}: ${stopsPhrase(dExp)} of gain. ${dExp > 0 ? "Same light hit the sensor — it was just amplified, noise and all." : "Less amplification → cleaner picture."}`;
      break;
    case "nd":
      text = `ND ${stopsPhrase(dExp)}. ${dExp < 0 ? "Less light in" : "More light in"} — motion blur and depth of field didn't change.`;
      break;
    case "fps":
      text = `${prev.fps}p → ${next.fps}p: at 1/${next.shutter} that's now a ${formatShutterAngle(nextD.shutterAngle)} shutter.${nextD.slowShutter ? " The shutter is now slower than a frame — frames will repeat." : ""}`;
      break;
    case "wb":
      text = `White balance ${Math.round(prev.wb)}K → ${Math.round(next.wb)}K: picture renders ${next.wb > prev.wb ? "warmer (more orange)" : "cooler (more blue)"}. Exposure unchanged.`;
      break;
    case "focus":
      text = `Focus ${formatDistance(prev.focus)} → ${formatDistance(next.focus)}.`;
      break;
    case "focal": {
      const tighter = next.focal > prev.focal;
      text = `Zoom ${formatFocal(prev.focal, camera)} → ${formatFocal(next.focal, camera)}: ${tighter ? "tighter framing, and the longer lens throws the background further out of focus" : "wider framing, and more of the depth looks sharp"}. Exposure is unchanged — the f-number already accounts for focal length.`;
      break;
    }
    default:
      text = stopsPhrase(dExp);
  }
  const noStops = key === "focus" || key === "wb" || key === "fps" || key === "focal";
  return { stops: dExp, text, tone, short: noStops ? "" : formatStops(dExp) };
}

// ---------- criteria ----------

const within = (v, lo, hi) => v >= lo && v <= hi;
const subject = (scene, key) => scene.subjects[key];
const sharp = (d, depth) => depth >= d.dofNear * 0.98 && depth <= d.dofFar * 1.02;

export const checks = {
  exposure(lo = -0.7, hi = 0.7) {
    return {
      label: `Exposure within ${formatStops(lo)} to ${formatStops(hi)} stops`,
      test: ({ derived }) => {
        const e = derived.exposureStops;
        return {
          pass: within(e, lo, hi),
          detail: e > hi ? `Too bright (${formatStops(e)} ${stopWord(e)}).` : e < lo ? `Too dark (${formatStops(e)} ${stopWord(e)}).` : `Exposure ${formatStops(e)} — good.`,
        };
      },
    };
  },
  shutterAngle(lo = 120, hi = 250) {
    return {
      label: `Natural motion: shutter angle ${lo}°–${hi}°`,
      test: ({ derived, settings }) => {
        const a = derived.shutterAngle;
        return {
          pass: within(a, lo, hi),
          detail:
            a > hi
              ? `1/${settings.shutter} at ${settings.fps}p is ${formatShutterAngle(a)} — motion will smear.`
              : a < lo
                ? `1/${settings.shutter} at ${settings.fps}p is ${formatShutterAngle(a)} — motion will look choppy/staccato.`
                : `${formatShutterAngle(a)} shutter — natural motion.`,
        };
      },
    };
  },
  maxIso(iso) {
    const maxStops = Math.log2(iso / 100) + 0.01;
    return {
      label: `Gain no higher than ISO ${iso} (${Math.round(Math.log2(iso / 100) * 6)} dB)`,
      test: ({ settings, camera }) => ({
        pass: settings.gainStops <= maxStops,
        detail:
          settings.gainStops <= maxStops ? `${gainLabel(camera, settings.gainStops)} — noise under control.` : `${gainLabel(camera, settings.gainStops)} is too noisy for this shot.`,
      }),
    };
  },
  wbNear(kelvin, tol = 400) {
    return {
      label: `White balance matches the ${kelvin}K light (±${tol}K)`,
      test: ({ settings }) => {
        const off = settings.wb - kelvin;
        return {
          pass: Math.abs(off) <= tol,
          detail: Math.abs(off) <= tol ? `${Math.round(settings.wb)}K — neutral whites.` : off < 0 ? `${Math.round(settings.wb)}K renders this light too blue.` : `${Math.round(settings.wb)}K renders this light too orange.`,
        };
      },
    };
  },
  inFocus(key) {
    return {
      label: `Keep ${key} sharp`,
      test: ({ derived, scene }) => {
        const s = subject(scene, key);
        const ok = sharp(derived, s.depth);
        return { pass: ok, detail: ok ? `${cap(s.label)} is sharp.` : `${cap(s.label)} is out of focus.` };
      },
    };
  },
  blurred(key, minPx = 6) {
    return {
      label: `Soften ${key} (shallow depth of field)`,
      test: ({ derived, scene }) => {
        const s = subject(scene, key);
        const px = derived.blurPxAt(s.depth);
        return { pass: px >= minPx, detail: px >= minPx ? `${cap(s.label)} is nicely soft.` : `${cap(s.label)} is still fairly sharp — open up or focus closer.` };
      },
    };
  },
  maxClip(pct = 2) {
    return {
      label: `Protect highlights (under ${pct}% clipped)`,
      test: ({ stats }) => {
        if (!stats) return { pass: true, detail: "" };
        return {
          pass: stats.clipPct <= pct,
          detail: stats.clipPct <= pct ? "Highlights hold." : `${stats.clipPct.toFixed(1)}% of the frame is blown out.`,
        };
      },
    };
  },
  noSlowShutter() {
    return {
      label: "Shutter no slower than the frame rate",
      test: ({ derived }) => ({
        pass: !derived.slowShutter,
        detail: derived.slowShutter ? "Shutter is slower than one frame — frames repeat." : "",
      }),
    };
  },
  apertureAtMost(n) {
    return {
      label: `Aperture f/${n} or wider`,
      test: ({ settings }) => ({
        pass: settings.aperture <= n + 0.01,
        detail: settings.aperture <= n + 0.01 ? "" : `f/${settings.aperture} is too closed down for this look.`,
      }),
    };
  },
};

export function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function runChecks(list, ctx) {
  return list.map((c) => ({ label: c.label, ...c.test(ctx) }));
}
