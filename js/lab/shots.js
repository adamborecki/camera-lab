// Shots a director calls on a PTZ: "Camera 4, the trumpets." Each scene that
// supports calls names its targets (scene.targets: a box in the drawn
// picture, a depth, and a kind). These functions say whether a rig's frame
// is on one, at the right size, centered and sharp, and if not, what the
// operator would do about it, in joystick terms (pan left, tilt up, zoom in).
//
// Shot sizes (sim): "wide" is the whole band with a little air; "section"
// fills a good share of the frame with one section, nobody cut off; "single"
// is one player, centered, with the lens at (or near) its longest. The sim
// can't zoom as far as a real UE150 (the drawn scene runs out of pixels past
// scene.maxFrameZoom), so its tightest shot is about waist-up on a player in
// the front rows; a real one gets much closer.
import { MAX_FRAME_ZOOM } from "../sim/camera-model.js";

export const SHOT_RULES = {
  // At Musco the band fills 70% of the frame zoomed all the way out, so 0.65
  // keeps "all the way out" a wide with margin (a test pins it).
  wide: { center: 0.15, fill: 0.65 },
  section: { center: 0.12, fill: 0.6 },
  single: { center: 0.1, fill: 0 },
};

export const SHOT_WORDS = { wide: "a wide of", section: "a section shot of", single: "a tight shot of" };

// r: { settings, derived, view, def } (a ctx.rigs entry); returns where the
// target sits in that rig's frame. Offsets are fractions of the frame (+ =
// the target is right of / below the middle).
export function shotReport(r, scene, targetId) {
  const t = scene.targets?.[targetId];
  if (!t) return null;
  const a = r.def?.angle;
  // A camera off to one side sees each depth shifted (the renderer's
  // parallax): shift · (1/d − 1/aimDepth) in scene u.
  const du = a ? a.shift * (1 / t.depth - 1 / (a.aimDepth || scene.subjects?.performers?.depth || 10)) : 0;
  const b = { x0: t.x0 + du, x1: t.x1 + du, y0: t.y0, y1: t.y1 };
  const v = r.view;
  const fw = 1 / v.zoom;
  const fx0 = v.x - fw / 2;
  const fx1 = v.x + fw / 2;
  const fy0 = v.y - fw / 2;
  const fy1 = v.y + fw / 2;
  const pad = 0.01 / v.zoom;
  const cut = { left: b.x0 < fx0 + pad, right: b.x1 > fx1 - pad, top: b.y0 < fy0 + pad, bottom: b.y1 > fy1 - pad };
  const inside = !cut.left && !cut.right && !cut.top && !cut.bottom;
  const visible = b.x1 > fx0 && b.x0 < fx1 && b.y1 > fy0 && b.y0 < fy1;
  const fill = Math.max((b.x1 - b.x0) / fw, (b.y1 - b.y0) / fw);
  const offX = ((b.x0 + b.x1) / 2 - v.x) / fw;
  const offY = ((b.y0 + b.y1) / 2 - v.y) / fw;
  const maxZoom = scene.maxFrameZoom || MAX_FRAME_ZOOM;
  const maxed = v.zoom >= maxZoom * 0.92 || r.settings.focal >= (r.camera?.lens?.tele || Infinity) * 0.97;
  const d = r.derived;
  const sharp = t.depth >= d.dofNear * 0.98 && t.depth <= d.dofFar * 1.02;
  return { target: t, kind: t.kind, inside, visible, cut, fill, offX, offY, maxed, sharp, autoFocus: !!r.settings.auto?.focus };
}

// Framed right for its kind (ignores focus; see shotOk).
export function framedOk(rep, kind = rep?.kind) {
  if (!rep) return false;
  const rule = SHOT_RULES[kind];
  if (!rep.inside || Math.abs(rep.offX) > rule.center || Math.abs(rep.offY) > rule.center + 0.05) return false;
  if (kind === "single") return rep.maxed;
  return rep.fill >= rule.fill || rep.maxed;
}

export function shotOk(rep, kind = rep?.kind) {
  return framedOk(rep, kind) && rep.sharp;
}

const panWord = (x) => (x < 0 ? "left" : "right");
const tiltWord = (y) => (y < 0 ? "up" : "down");

// One sentence: the first thing an operator would fix.
export function shotAdvice(rep, name, kind = rep?.kind) {
  if (!rep) return `${name}: nothing to frame here.`;
  const label = rep.target.label;
  const are = rep.target.kind === "single" ? "is" : "are";
  const rule = SHOT_RULES[kind];
  const dirs = [Math.abs(rep.offX) > 0.08 && `pan ${panWord(rep.offX)}`, Math.abs(rep.offY) > 0.1 && `tilt ${tiltWord(rep.offY)}`].filter(Boolean).join(" and ");
  if (!rep.visible) return `${name} isn't on ${label} — they're off to the ${Math.abs(rep.offX) >= Math.abs(rep.offY) ? panWord(rep.offX) : rep.offY < 0 ? "top" : "bottom"} of the frame. Zoom out to find them, then ${dirs || "re-center"}.`;
  if (!rep.inside) {
    const sides = Object.entries(rep.cut)
      .filter(([, c]) => c)
      .map(([s]) => s);
    if (rep.fill > 0.95 && kind !== "single") return `${cap(label)} don't fit at this zoom — someone is cut off. Zoom out (W) a little.`;
    return `Part of ${label} is cut off at the ${sides.join(" and ")} of ${name}'s frame — ${dirs || `pan ${sides.includes("left") ? "left" : "right"}`} a little${kind === "single" ? "" : ", or zoom out"}.`;
  }
  if (Math.abs(rep.offX) > rule.center || Math.abs(rep.offY) > rule.center + 0.05) return `${cap(label)} ${are} in, but off-center: ${dirs || "re-center"}.`;
  if (kind === "single" && !rep.maxed) return `That's still loose for a tight shot of ${label} — zoom in (T) all the way, keeping them centered.`;
  if (kind !== "single" && rep.fill < rule.fill && !rep.maxed) return `Too loose: ${label} only fill ${Math.round(rep.fill * 100)}% of the frame. Zoom in (T) until they fill it, nobody cut off.`;
  if (!rep.sharp) return `Framed right, but ${label} ${are} soft. Press FOCUS AUTO, let it find them, then press it again to turn AUTO off.`;
  return `On ${label}.`;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
