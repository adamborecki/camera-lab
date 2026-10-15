// Teaching feedback, kept separate from the simulator:
//  - describeChange(): the "+1 stop — depth of field got shallower"
//    narration guided stations show after each adjustment.
//  - checks: reusable criteria for guided steps and challenges. Each returns
//    { label, test(ctx) → { pass, detail } } where ctx is
//    { settings, derived, camera, scene, stats }. Criteria use ranges, so a
//    challenge accepts every reasonable solution, not one magic combination.
import {
  formatStops,
  stopWord,
  formatDistance,
  formatShutterAngle,
  formatFocal,
  gainOptions,
  renderedWhite,
  colorMatch,
  blackMatch,
  effectiveWb,
} from "../sim/camera-model.js";

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
  // tips: optional { bright, dark } — a station-specific nudge appended when
  // the shot is off, e.g. pointing at the one control the challenge is about.
  exposure(lo = -0.7, hi = 0.7, tips = {}) {
    return {
      label: `Exposure within ${formatStops(lo)} to ${formatStops(hi)} stops`,
      test: ({ derived }) => {
        const e = derived.exposureStops;
        const off = (word, tip) => `${word} (${formatStops(e)} ${stopWord(e)}).${tip ? ` ${tip}` : ""}`;
        return {
          pass: within(e, lo, hi),
          detail: e > hi ? off("Too bright", tips.bright) : e < lo ? off("Too dark", tips.dark) : `Exposure ${formatStops(e)} — good.`,
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
        return { pass: ok, detail: ok ? `${cap(s.label)} ${is(s)} sharp.` : `${cap(s.label)} ${is(s)} out of focus.` };
      },
    };
  },
  blurred(key, minPx = 6) {
    return {
      label: `Soften ${key} (shallow depth of field)`,
      test: ({ derived, scene }) => {
        const s = subject(scene, key);
        const px = derived.blurPxAt(s.depth);
        return {
          pass: px >= minPx,
          detail:
            px >= minPx
              ? `${cap(s.label)} ${is(s)} nicely soft.`
              : `${cap(s.label)} ${is(s)} still fairly sharp — open the aperture wider (a lower f-number like f/2.8) for shallower depth of field.`,
        };
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

// ---------- multi-camera & real-gig criteria ----------
//
// Rig-aware checks read ctx.rigs[id] (lab-view gives every camera on the
// station); `rig` defaults to the one the student is controlling.

const rigOf = (ctx, id) => (id ? ctx.rigs?.[id] : null) || { settings: ctx.settings, derived: ctx.derived, camera: ctx.camera, view: ctx.view };
const rigName = (ctx, id) => ctx.rigs?.[id]?.def?.label || id || "your camera";
const gainDbOf = (r) => gainOptions(r.camera).reduce((b, o) => (Math.abs(o.value - r.settings.gainStops) < Math.abs(b.value - r.settings.gainStops) ? o : b));

Object.assign(checks, {
  // Two cameras' whites look the same on the multiview.
  colorMatches(refId, { rig, tol = 0.03 } = {}) {
    return {
      label: `Color matches ${refId}`,
      test: (ctx) => {
        const a = rigOf(ctx, refId);
        const b = rigOf(ctx, rig);
        const m = colorMatch(renderedWhite(a.settings, a.camera, ctx.scene), renderedWhite(b.settings, b.camera, ctx.scene));
        const ok = m.dist <= tol;
        return {
          pass: ok,
          detail: ok
            ? `Color matches ${rigName(ctx, refId)}.`
            : `${cap(rigName(ctx, rig))} looks ${m.words.join(" and ") || "a little different"} than ${rigName(ctx, refId)}.`,
        };
      },
    };
  },
  // …and the same brightness (on the performers, not the whole frame).
  brightnessMatches(refId, { rig, tol = 0.34 } = {}) {
    return {
      label: `Brightness matches ${refId} (±⅓ stop)`,
      test: (ctx) => {
        const a = rigOf(ctx, refId).derived.exposureStops;
        const b = rigOf(ctx, rig).derived.exposureStops;
        const d = b - a;
        return {
          pass: Math.abs(d) <= tol,
          detail: Math.abs(d) <= tol ? "Same brightness." : `${cap(rigName(ctx, rig))} is ${formatStops(Math.abs(d), { sign: false })} ${stopWord(d)} ${d > 0 ? "brighter" : "darker"} than ${rigName(ctx, refId)}.`,
        };
      },
    };
  },
  // Exposure judged on the subject, for one rig.
  rigExposure(lo, hi, { rig } = {}) {
    const base = checks.exposure(lo, hi);
    return { label: base.label, test: (ctx) => base.test({ ...ctx, derived: rigOf(ctx, rig).derived }) };
  },
  noAutoExposure({ rig } = {}) {
    return {
      label: "Iris, shutter and gain locked (no A)",
      test: (ctx) => {
        const s = rigOf(ctx, rig).settings;
        const on = ["aperture", "shutter", "gainStops"].filter((k) => s.auto?.[k]);
        const names = { aperture: "IRIS", shutter: "SHUTTER", gainStops: "GAIN" };
        return {
          pass: on.length === 0,
          detail: on.length ? `${cap(rigName(ctx, rig))}: ${on.map((k) => names[k]).join(", ")} still on auto — the camera will drift as the light changes.` : "Exposure locked.",
        };
      },
    };
  },
  shutterIs(denom, { rig } = {}) {
    return {
      label: `Shutter 1/${denom}`,
      test: (ctx) => {
        const s = rigOf(ctx, rig).settings;
        return { pass: s.shutter === denom, detail: s.shutter === denom ? `1/${denom}.` : `${cap(rigName(ctx, rig))} is at 1/${s.shutter} — the house standard is 1/${denom}.` };
      },
    };
  },
  maxGainDb(db, { rig } = {}) {
    return {
      label: `Gain ${db} dB or less`,
      test: (ctx) => {
        const r = rigOf(ctx, rig);
        const g = gainDbOf(r);
        const ok = r.settings.gainStops <= Math.log2(r.camera.gain.baseIso / 100) + db / 6 + 0.01;
        return { pass: ok, detail: ok ? `${g.label}.` : `${cap(rigName(ctx, rig))} is at ${g.label} — more gain than this shot needs (noise).` };
      },
    };
  },
  whiteBalance(kelvin, { rig, tol = 100, shift = false } = {}) {
    return {
      label: `White balance ${kelvin}K${shift ? "" : ", no shift"}`,
      test: (ctx) => {
        const r = rigOf(ctx, rig);
        const wb = effectiveWb(r.settings, ctx.scene);
        const auto = r.settings.wbMode === "auto";
        const ok = !auto && Math.abs(wb.kelvin - kelvin) <= tol && (shift || (!wb.ab && !wb.gm));
        return {
          pass: ok,
          detail: ok
            ? `${kelvin}K.`
            : auto
              ? `${cap(rigName(ctx, rig))} is on auto white balance — it can drift between pieces. Set ${kelvin}K.`
              : `${cap(rigName(ctx, rig))} is at ${Math.round(wb.kelvin)}K${wb.ab || wb.gm ? " with a shift" : ""} — set ${kelvin}K${shift ? "" : " with no shift"}.`,
        };
      },
    };
  },
  ndOff({ rig } = {}) {
    return {
      label: "ND off (indoors)",
      test: (ctx) => {
        const s = rigOf(ctx, rig).settings;
        return { pass: s.nd === 0, detail: s.nd === 0 ? "ND off." : `${cap(rigName(ctx, rig))} still has ND in — that's for daylight; indoors it only costs light.` };
      },
    };
  },
  autofocusOn({ rig } = {}) {
    return {
      label: "Autofocus on",
      test: (ctx) => {
        const s = rigOf(ctx, rig).settings;
        return { pass: !!s.auto?.focus, detail: s.auto?.focus ? "AF on." : `${cap(rigName(ctx, rig))} is on manual focus — the house standard is AF.` };
      },
    };
  },
  recording({ rig } = {}) {
    return {
      label: "Recording",
      test: (ctx) => {
        const r = ctx.rigs?.[rig || ctx.activeRig];
        const on = r ? !!r.recording : !!ctx.recording;
        return { pass: on, detail: on ? "Rolling." : `${cap(rigName(ctx, rig))} isn't recording.` };
      },
    };
  },
  // "As close as possible, but wide enough for bows": everyone (standing)
  // inside the frame with a little air, and the group filling a good share
  // of it — or the lens all the way in.
  framing({ rig, minFill = 0.62 } = {}) {
    return {
      label: "Framed tight, with room to bow",
      test: (ctx) => {
        const r = rigOf(ctx, rig);
        const b = ctx.scene.framing;
        if (!b) return { pass: true, detail: "" };
        const v = r.view;
        const half = 0.5 / v.zoom;
        const fx0 = v.x - half;
        const fx1 = v.x + half;
        const fy0 = v.y - half;
        const fy1 = v.y + half;
        const pad = 0.01 / v.zoom;
        const inside = b.x0 >= fx0 + pad && b.x1 <= fx1 - pad && b.y0 >= fy0 + pad && b.y1 <= fy1 - pad;
        const fill = Math.max((b.x1 - b.x0) / (fx1 - fx0), (b.y1 - b.y0) / (fy1 - fy0));
        const maxed = r.derived.frameZoom >= (ctx.scene.maxFrameZoom || 3) * 0.97 || r.settings.focal >= (r.camera.lens?.tele || Infinity) * 0.97;
        if (!inside) return { pass: false, detail: "Too tight — someone (standing for a bow) would be cut off. Zoom out a little." };
        if (fill < minFill && !maxed) return { pass: false, detail: `Lots of empty space — the group only fills ${Math.round(fill * 100)}% of the frame. Zoom in until it's snug, leaving room to stand.` };
        return { pass: true, detail: "Snug, with room for bows." };
      },
    };
  },
});

// ---------- shading (Musco PTZ cameras on the RP150) ----------
Object.assign(checks, {
  // Blacks the same as the reference camera (pedestal).
  blacksMatch(refId, { rig, tol = 0.004 } = {}) {
    return {
      label: `Blacks match ${refId}`,
      test: (ctx) => {
        const m = blackMatch(rigOf(ctx, refId).settings, rigOf(ctx, rig).settings);
        return {
          pass: m.worst <= tol,
          detail: m.worst <= tol ? "Blacks match." : `${cap(rigName(ctx, rig))}'s blacks look ${m.words.join(" and ") || "different"} next to ${rigName(ctx, refId)} — that's pedestal.`,
        };
      },
    };
  },
  // The static wide is the reference: nobody changes it.
  untouched(rigId) {
    const keys = ["aperture", "gainStops", "shutter", "wb", "wbMode", "rGain", "bGain", "rPed", "bPed", "mPed", "focal"];
    return {
      label: `Camera ${rigId} untouched`,
      test: (ctx) => {
        const r = ctx.rigs?.[rigId];
        const start = r?.start;
        if (!r || !start) return { pass: true, detail: "" };
        const changed = keys.filter((k) => (typeof start[k] === "number" ? Math.abs(start[k] - r.settings[k]) > 1e-6 : start[k] !== r.settings[k]));
        return { pass: !changed.length, detail: changed.length ? `Camera ${rigId} (the static wide) was changed — it's the safe shot; never touch it.` : `Camera ${rigId} untouched.` };
      },
    };
  },
  // Musco's house defaults on a UE150: F5.6 · 0 dB · A/3200K · shading at 0.
  muscoHouse({ rig } = {}) {
    return {
      label: "House defaults (F5.6 · 0 dB · A/3200K · R/B gain & pedestal 0)",
      test: (ctx) => {
        const s = rigOf(ctx, rig).settings;
        const off = [];
        if (Math.abs(s.aperture - 5.6) > 0.01) off.push(`iris F${s.aperture.toFixed(1)}`);
        if (Math.abs(s.gainStops) > 0.01) off.push("gain not 0 dB");
        if (s.wbMode !== "indoor") off.push(s.wbMode === "outdoor" ? "B/5600K" : s.wbMode === "auto" ? "ATW" : "white balance not A/3200K");
        for (const [k, n] of [["rGain", "R gain"], ["bGain", "B gain"], ["rPed", "R ped"], ["bPed", "B ped"], ["mPed", "M ped"]]) if (s[k]) off.push(`${n} ${s[k] > 0 ? "+" : ""}${s[k]}`);
        if (s.auto?.aperture) off.push("iris on AUTO");
        return { pass: !off.length, detail: off.length ? `${cap(rigName(ctx, rig))}: ${off.join(", ")}.` : "At house defaults." };
      },
    };
  },
});

const is = (s) => (s.plural ? "are" : "is");

export function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function runChecks(list, ctx) {
  return list.map((c) => ({ label: c.label, ...c.test(ctx) }));
}
