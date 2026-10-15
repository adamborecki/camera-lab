// Drawing kit for concert halls seen from the back of the house: a simple
// pinhole projection (so rooms, risers and pianos sit in real perspective and
// every performer stands at a real distance), plus illustrated performers
// and instruments. Scenes built on it (salmon.js, auditorium.js) describe a
// room and a program — who's on stage, where, holding what — as data.
//
// World units are meters. X right, Y up, Z away from the camera, floor of the
// stage at Y = 0. Performers are drawn as flat cut-outs facing the camera
// (they're 10+ m away; nobody can tell), at the size their distance implies.
import { ellipse, circle, rng } from "./draw.js";

export const W = 1280;
export const H = 720;

// A camera at `pos`, pitched down by `pitchDeg`, framing `equivFocal`
// (35mm-equivalent mm across the 1280 px width).
export function makeCamera({ pos = [0, 5, 0], pitchDeg = 10, equivFocal = 32 } = {}) {
  const th = (pitchDeg * Math.PI) / 180;
  const F = (W / 2) / (18 / equivFocal); // tan(hfov/2) = 18/f for a 36mm-wide frame
  const fwd = [0, -Math.sin(th), Math.cos(th)];
  const up = [0, Math.cos(th), Math.sin(th)];
  const cam = {
    pos,
    F,
    // world → [screen x, screen y, depth along the view axis]
    p(x, y, z) {
      const d = [x - pos[0], y - pos[1], z - pos[2]];
      const zc = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2];
      const yc = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
      const k = F / Math.max(zc, 0.05);
      return [W / 2 + d[0] * k, H / 2 - yc * k, zc];
    },
    // pixels per meter for something standing at depth z
    scaleAt(x, z) {
      return cam.p(x, 0, z)[2] > 0 ? F / cam.p(x, 0, z)[2] : 1;
    },
    // straight-line distance from the camera, for depth of field
    dist(x, y, z) {
      return Math.hypot(x - pos[0], y - pos[1], z - pos[2]);
    },
    // scene uv (v down) of a world point
    uv(x, y, z) {
      const [sx, sy] = cam.p(x, y, z);
      return [sx / W, sy / H];
    },
  };
  return cam;
}

// Fill a world-space polygon.
export function poly(ctx, cam, pts, fill, stroke, lw = 1) {
  ctx.beginPath();
  pts.forEach(([x, y, z], i) => {
    const [sx, sy] = cam.p(x, y, z);
    i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
  });
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

export function line(ctx, cam, a, b, color, lw) {
  const [x0, y0] = cam.p(...a);
  const [x1, y1] = cam.p(...b);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

// ---------- people ----------

const SKIN = [
  ["#f1c6a6", "#d9a785"],
  ["#e0ac87", "#c38d68"],
  ["#c98f6c", "#a8714f"],
  ["#a8714f", "#8a5a3c"],
  ["#8d5a3f", "#6f442d"],
  ["#5e3a28", "#47291b"],
];
const HAIR = ["#1a1310", "#2b1d14", "#3b2416", "#5a3a22", "#7a5634", "#b08850", "#d9c79a", "#9a9a9a", "#e8e4dc", "#4a2a20"];

// A deterministic, made-up look for performer #i — never a real person.
export function lookFor(seed, overrides = {}) {
  const r = rng(seed * 7919 + 13);
  const [skin, shade] = SKIN[Math.floor(r() * SKIN.length)];
  return {
    skin,
    shade,
    hair: HAIR[Math.floor(r() * HAIR.length)],
    long: r() < 0.45,
    top: "#16161a",
    bottom: "#121216",
    ...overrides,
  };
}

// Draw a person whose feet are at world (x, z). opts:
//  pose   "stand" | "sit" | "conduct" (back to camera) | "piano" (seated, in
//         profile at a keyboard to their left/right: facing "left"/"right")
//  inst   instrument held (see INSTRUMENTS)
//  look   from lookFor()
//  arms   "down" | "up" (singers' folders) — default chosen per instrument
export function person(ctx, cam, o) {
  const k = cam.scaleAt(o.x, o.z);
  const [fx, fy] = cam.p(o.x, o.y0 || 0, o.z);
  const L = o.look;
  const seated = o.pose === "sit" || o.pose === "piano";
  const h = (o.height || 1.72) * k;
  const hipY = seated ? fy - 0.5 * k : fy - 0.88 * k;
  const shoulderY = seated ? hipY - 0.55 * k : fy - 1.4 * k;
  const headR = 0.115 * k;
  const headY = shoulderY - 0.1 * k - headR;
  const sw = 0.21 * k; // half shoulder width
  const back = o.pose === "conduct";
  const profile = o.pose === "piano" ? (o.facing === "left" ? -1 : 1) : 0;
  void h;

  // legs
  ctx.fillStyle = L.bottom;
  if (seated) {
    // thighs forward (toward camera = slightly down on screen), shins down
    const kx = profile * 0.35 * k;
    ctx.beginPath();
    ctx.moveTo(fx - 0.17 * k + kx * 0.2, hipY - 0.04 * k);
    ctx.lineTo(fx + 0.17 * k + kx * 0.2, hipY - 0.04 * k);
    ctx.lineTo(fx + 0.17 * k + kx, hipY + 0.12 * k);
    ctx.lineTo(fx + 0.15 * k + kx, fy);
    ctx.lineTo(fx - 0.15 * k + kx, fy);
    ctx.lineTo(fx - 0.17 * k + kx, hipY + 0.12 * k);
    ctx.closePath();
    ctx.fill();
    ellipse(ctx, fx - 0.08 * k + kx, fy, 0.07 * k, 0.03 * k, "#0b0b0d");
    ellipse(ctx, fx + 0.08 * k + kx, fy, 0.07 * k, 0.03 * k, "#0b0b0d");
  } else if (o.dress) {
    ctx.beginPath();
    ctx.moveTo(fx - 0.15 * k, hipY - 0.2 * k);
    ctx.lineTo(fx + 0.15 * k, hipY - 0.2 * k);
    ctx.lineTo(fx + 0.26 * k, fy);
    ctx.lineTo(fx - 0.26 * k, fy);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(fx - 0.17 * k, hipY - 0.05 * k, 0.15 * k, fy - hipY + 0.05 * k);
    ctx.fillRect(fx + 0.02 * k, hipY - 0.05 * k, 0.15 * k, fy - hipY + 0.05 * k);
    ellipse(ctx, fx - 0.1 * k, fy, 0.08 * k, 0.03 * k, "#0b0b0d");
    ellipse(ctx, fx + 0.1 * k, fy, 0.08 * k, 0.03 * k, "#0b0b0d");
  }

  // torso
  ctx.fillStyle = L.top;
  ctx.beginPath();
  ctx.moveTo(fx - sw, shoulderY + 0.04 * k);
  ctx.quadraticCurveTo(fx - sw, shoulderY - 0.03 * k, fx - sw * 0.5, shoulderY - 0.04 * k);
  ctx.lineTo(fx + sw * 0.5, shoulderY - 0.04 * k);
  ctx.quadraticCurveTo(fx + sw, shoulderY - 0.03 * k, fx + sw, shoulderY + 0.04 * k);
  ctx.lineTo(fx + sw * 0.8, hipY + 0.02 * k);
  ctx.lineTo(fx - sw * 0.8, hipY + 0.02 * k);
  ctx.closePath();
  ctx.fill();
  if (L.accent) {
    // a shirt front, sash or pattern
    ctx.fillStyle = L.accent;
    if (L.accentStyle === "vest") {
      ctx.fillRect(fx - sw * 0.25, shoulderY, sw * 0.5, hipY - shoulderY);
    } else if (L.accentStyle === "pattern") {
      const r = rng(Math.round(fx * 7 + fy));
      for (let i = 0; i < 14; i++) circle(ctx, fx + (r() - 0.5) * sw * 1.6, shoulderY + r() * (hipY - shoulderY), 0.025 * k, L.accent);
    } else {
      ctx.beginPath();
      ctx.moveTo(fx - sw * 0.28, shoulderY - 0.03 * k);
      ctx.lineTo(fx + sw * 0.28, shoulderY - 0.03 * k);
      ctx.lineTo(fx, shoulderY + 0.22 * k);
      ctx.closePath();
      ctx.fill();
    }
  }

  // neck + head
  ctx.fillStyle = L.shade;
  ctx.fillRect(fx - 0.04 * k, headY + headR * 0.6, 0.08 * k, 0.12 * k);
  const hx = fx + profile * 0.02 * k;
  if (back) {
    circle(ctx, hx, headY, headR, L.hair);
  } else {
    ellipse(ctx, hx, headY, headR * 0.9, headR, L.skin);
    // hair cap (and length)
    ctx.fillStyle = L.hair;
    ctx.beginPath();
    ctx.ellipse(hx, headY - headR * 0.25, headR * 0.98, headR * 0.82, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    if (L.long) {
      ctx.fillRect(hx - headR * 1.0, headY - headR * 0.3, headR * 0.32, headR * 2.0);
      ctx.fillRect(hx + headR * 0.68, headY - headR * 0.3, headR * 0.32, headR * 2.0);
    }
    if (profile) {
      // face turned: hair covers the far side
      ctx.beginPath();
      ctx.ellipse(hx - profile * headR * 0.35, headY, headR * 0.6, headR * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (k > 60) {
      ellipse(ctx, hx - headR * 0.33, headY + headR * 0.08, headR * 0.1, headR * 0.07, "#20160f");
      ellipse(ctx, hx + headR * 0.33, headY + headR * 0.08, headR * 0.1, headR * 0.07, "#20160f");
    }
  }
  if (L.hat === "sombrero") {
    ellipse(ctx, hx, headY - headR * 0.7, headR * 2.3, headR * 0.45, "#1a1210");
    ellipse(ctx, hx, headY - headR * 1.05, headR * 0.9, headR * 0.6, "#1a1210");
  }

  // arms + instrument
  const ctxInfo = { fx, fy, k, shoulderY, hipY, headY, headR, sw, profile, look: L, seated };
  const inst = INSTRUMENTS[o.inst];
  if (inst) inst(ctx, ctxInfo, o);
  else arms(ctx, ctxInfo, o.arms || (back ? "conduct" : "down"));
  return ctxInfo;
}

function limb(ctx, color, w, pts) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

function hand(ctx, i, x, y) {
  circle(ctx, x, y, 0.045 * i.k, i.look.shade);
}

function arms(ctx, i, style) {
  const { fx, k, shoulderY, sw, look } = i;
  const c = look.sleeve || look.top;
  if (style === "folder") {
    // singer holding a black folder at chest height
    limb(ctx, c, 0.09 * k, [[fx - sw, shoulderY + 0.05 * k], [fx - sw * 0.9, shoulderY + 0.35 * k], [fx - 0.08 * k, shoulderY + 0.38 * k]]);
    limb(ctx, c, 0.09 * k, [[fx + sw, shoulderY + 0.05 * k], [fx + sw * 0.9, shoulderY + 0.35 * k], [fx + 0.08 * k, shoulderY + 0.38 * k]]);
    ctx.fillStyle = "#0c0c0e";
    ctx.fillRect(fx - 0.17 * k, shoulderY + 0.24 * k, 0.34 * k, 0.24 * k);
    return;
  }
  if (style === "conduct") {
    limb(ctx, c, 0.09 * k, [[fx - sw, shoulderY + 0.05 * k], [fx - sw * 1.6, shoulderY - 0.1 * k], [fx - sw * 2, shoulderY - 0.25 * k]]);
    limb(ctx, c, 0.09 * k, [[fx + sw, shoulderY + 0.05 * k], [fx + sw * 1.5, shoulderY - 0.05 * k], [fx + sw * 1.9, shoulderY - 0.3 * k]]);
    return;
  }
  limb(ctx, c, 0.09 * k, [[fx - sw, shoulderY + 0.05 * k], [fx - sw * 1.08, shoulderY + 0.62 * k]]);
  limb(ctx, c, 0.09 * k, [[fx + sw, shoulderY + 0.05 * k], [fx + sw * 1.08, shoulderY + 0.62 * k]]);
  hand(ctx, i, fx - sw * 1.08, shoulderY + 0.66 * k);
  hand(ctx, i, fx + sw * 1.08, shoulderY + 0.66 * k);
}

const WOOD = "#9a4a1c";
const WOOD_L = "#c06a2c";
const BRASS = "#d9b65a";
const SILVER = "#cfd3d8";

// Each instrument draws itself plus the arms that play it.
export const INSTRUMENTS = {
  violin(ctx, i) {
    const { fx, k, shoulderY, sw, look } = i;
    const c = look.top;
    // body tucked under the chin, angled down to the player's left (screen right)
    ctx.save();
    ctx.translate(fx + sw * 0.7, shoulderY + 0.06 * k);
    ctx.rotate(0.35);
    ellipse(ctx, 0.12 * k, 0, 0.13 * k, 0.07 * k, WOOD_L);
    ctx.fillStyle = "#2a1408";
    ctx.fillRect(-0.12 * k, -0.012 * k, 0.24 * k, 0.024 * k);
    ctx.restore();
    limb(ctx, c, 0.085 * k, [[fx + sw, shoulderY + 0.05 * k], [fx + sw * 1.8, shoulderY + 0.2 * k], [fx + sw * 1.7, shoulderY + 0.05 * k]]);
    limb(ctx, c, 0.085 * k, [[fx - sw, shoulderY + 0.05 * k], [fx - sw * 0.6, shoulderY + 0.35 * k], [fx + sw * 0.5, shoulderY + 0.16 * k]]);
  },
  viola(ctx, i, o) {
    INSTRUMENTS.violin(ctx, i, o);
  },
  bow(ctx, i) {
    // a separate moving layer draws just the bow arm (see motion in scenes)
    const { fx, k, shoulderY, sw } = i;
    limb(ctx, "#e8e2d0", 0.012 * k, [[fx - sw * 1.6, shoulderY + 0.3 * k], [fx + sw * 1.2, shoulderY + 0.05 * k]]);
  },
  cello(ctx, i) {
    const { fx, fy, k, shoulderY, hipY, look } = i;
    const c = look.top;
    ellipse(ctx, fx + 0.02 * k, hipY + 0.05 * k, 0.24 * k, 0.36 * k, WOOD);
    ellipse(ctx, fx + 0.02 * k, hipY - 0.2 * k, 0.17 * k, 0.16 * k, WOOD);
    ctx.fillStyle = "#1c0d05";
    ctx.fillRect(fx - 0.015 * k, shoulderY - 0.25 * k, 0.03 * k, hipY - shoulderY + 0.2 * k);
    limb(ctx, "#666", 0.015 * k, [[fx + 0.02 * k, hipY + 0.4 * k], [fx + 0.05 * k, fy]]);
    limb(ctx, c, 0.085 * k, [[fx - 0.2 * k, shoulderY + 0.05 * k], [fx - 0.18 * k, shoulderY + 0.2 * k], [fx - 0.03 * k, shoulderY - 0.05 * k]]);
    limb(ctx, c, 0.085 * k, [[fx + 0.2 * k, shoulderY + 0.05 * k], [fx + 0.3 * k, hipY - 0.05 * k], [fx + 0.05 * k, hipY - 0.02 * k]]);
    limb(ctx, "#e8e2d0", 0.01 * k, [[fx - 0.3 * k, hipY - 0.12 * k], [fx + 0.35 * k, hipY + 0.02 * k]]);
  },
  bass(ctx, i) {
    const { fx, fy, k, shoulderY, look } = i;
    const bx = fx - 0.32 * k;
    ellipse(ctx, bx, fy - 0.55 * k, 0.3 * k, 0.42 * k, WOOD);
    ellipse(ctx, bx, fy - 0.98 * k, 0.22 * k, 0.2 * k, WOOD);
    ctx.fillStyle = "#1c0d05";
    ctx.fillRect(bx - 0.02 * k, fy - 1.85 * k, 0.04 * k, 1.0 * k);
    limb(ctx, look.top, 0.085 * k, [[fx - 0.2 * k, shoulderY + 0.05 * k], [bx + 0.05 * k, shoulderY - 0.1 * k]]);
    limb(ctx, look.top, 0.085 * k, [[fx + 0.2 * k, shoulderY + 0.05 * k], [fx + 0.05 * k, fy - 0.85 * k], [bx + 0.15 * k, fy - 0.7 * k]]);
  },
  guitar(ctx, i) {
    const { fx, k, shoulderY, hipY, look } = i;
    ctx.save();
    ctx.translate(fx, hipY - 0.08 * k);
    ctx.rotate(-0.55);
    ellipse(ctx, -0.05 * k, 0.02 * k, 0.22 * k, 0.17 * k, "#d8a868");
    ellipse(ctx, 0.17 * k, 0.0, 0.16 * k, 0.13 * k, "#d8a868");
    circle(ctx, 0.05 * k, 0.0, 0.05 * k, "#3a2414");
    ctx.fillStyle = "#3a2414";
    ctx.fillRect(0.25 * k, -0.025 * k, 0.48 * k, 0.05 * k);
    ctx.restore();
    limb(ctx, look.top, 0.085 * k, [[fx - 0.2 * k, shoulderY + 0.05 * k], [fx - 0.28 * k, shoulderY + 0.25 * k], [fx - 0.02 * k, hipY - 0.12 * k]]);
    limb(ctx, look.top, 0.085 * k, [[fx + 0.2 * k, shoulderY + 0.05 * k], [fx + 0.28 * k, shoulderY + 0.22 * k], [fx + 0.35 * k, shoulderY + 0.02 * k]]);
  },
  vihuela(ctx, i) {
    // mariachi guitars: round-backed, held high
    const { fx, k, shoulderY, look } = i;
    ellipse(ctx, fx, shoulderY + 0.32 * k, 0.24 * k, 0.21 * k, "#ead7a8");
    circle(ctx, fx, shoulderY + 0.3 * k, 0.05 * k, "#2a1a10");
    ctx.fillStyle = "#3a2414";
    ctx.save();
    ctx.translate(fx, shoulderY + 0.3 * k);
    ctx.rotate(-0.4);
    ctx.fillRect(0.18 * k, -0.025 * k, 0.4 * k, 0.05 * k);
    ctx.restore();
    arms(ctx, i, "down");
    void look;
  },
  guitarron(ctx, i) {
    const { fx, k, shoulderY, hipY } = i;
    ellipse(ctx, fx, (shoulderY + hipY) / 2 + 0.05 * k, 0.32 * k, 0.32 * k, "#d4b07a");
    circle(ctx, fx, (shoulderY + hipY) / 2 + 0.05 * k, 0.06 * k, "#2a1a10");
    arms(ctx, i, "down");
  },
  clarinet(ctx, i) {
    const { fx, k, shoulderY, headY, headR, look } = i;
    limb(ctx, "#121214", 0.045 * k, [[fx, headY + headR * 0.6], [fx + 0.04 * k, shoulderY + 0.62 * k]]);
    circle(ctx, fx + 0.04 * k, shoulderY + 0.62 * k, 0.04 * k, SILVER);
    limb(ctx, look.top, 0.085 * k, [[fx - 0.2 * k, shoulderY + 0.05 * k], [fx - 0.18 * k, shoulderY + 0.3 * k], [fx, shoulderY + 0.2 * k]]);
    limb(ctx, look.top, 0.085 * k, [[fx + 0.2 * k, shoulderY + 0.05 * k], [fx + 0.2 * k, shoulderY + 0.42 * k], [fx + 0.03 * k, shoulderY + 0.42 * k]]);
  },
  flute(ctx, i) {
    const { fx, k, shoulderY, headY, headR, look } = i;
    limb(ctx, SILVER, 0.03 * k, [[fx - 0.05 * k, headY + headR * 0.7], [fx + 0.6 * k, headY + headR * 1.6]]);
    limb(ctx, look.top, 0.085 * k, [[fx - 0.2 * k, shoulderY + 0.05 * k], [fx - 0.15 * k, shoulderY + 0.2 * k], [fx + 0.05 * k, headY + headR * 1.1]]);
    limb(ctx, look.top, 0.085 * k, [[fx + 0.2 * k, shoulderY + 0.05 * k], [fx + 0.3 * k, shoulderY + 0.2 * k], [fx + 0.4 * k, headY + headR * 1.5]]);
  },
  trumpet(ctx, i) {
    const { fx, k, shoulderY, headY, headR, look } = i;
    limb(ctx, BRASS, 0.05 * k, [[fx, headY + headR * 0.7], [fx + 0.05 * k, headY + headR * 0.7 + 0.35 * k]]);
    circle(ctx, fx + 0.05 * k, headY + headR * 0.7 + 0.38 * k, 0.07 * k, BRASS);
    arms(ctx, { ...i }, "folder" === "x" ? "folder" : "down");
    void look;
  },
  horn(ctx, i) {
    const { fx, k, shoulderY, look } = i;
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = 0.05 * k;
    ctx.beginPath();
    ctx.arc(fx + 0.06 * k, shoulderY + 0.25 * k, 0.15 * k, 0, Math.PI * 2);
    ctx.stroke();
    circle(ctx, fx + 0.22 * k, shoulderY + 0.32 * k, 0.1 * k, BRASS);
    limb(ctx, look.top, 0.085 * k, [[fx - 0.2 * k, shoulderY + 0.05 * k], [fx - 0.1 * k, shoulderY + 0.3 * k], [fx + 0.02 * k, shoulderY + 0.22 * k]]);
    limb(ctx, look.top, 0.085 * k, [[fx + 0.2 * k, shoulderY + 0.05 * k], [fx + 0.26 * k, shoulderY + 0.3 * k]]);
  },
  euphonium(ctx, i) {
    const { fx, k, shoulderY, hipY, look } = i;
    ctx.fillStyle = SILVER;
    ctx.beginPath();
    ctx.roundRect(fx - 0.14 * k, shoulderY + 0.12 * k, 0.3 * k, hipY - shoulderY - 0.1 * k, 0.08 * k);
    ctx.fill();
    ellipse(ctx, fx - 0.12 * k, shoulderY + 0.02 * k, 0.17 * k, 0.12 * k, "#e2e5e9");
    ellipse(ctx, fx - 0.12 * k, shoulderY + 0.02 * k, 0.12 * k, 0.07 * k, "#8b8f95");
    limb(ctx, look.top, 0.085 * k, [[fx - 0.2 * k, shoulderY + 0.05 * k], [fx - 0.22 * k, shoulderY + 0.35 * k], [fx - 0.02 * k, shoulderY + 0.42 * k]]);
    limb(ctx, look.top, 0.085 * k, [[fx + 0.2 * k, shoulderY + 0.05 * k], [fx + 0.22 * k, shoulderY + 0.3 * k], [fx + 0.1 * k, shoulderY + 0.3 * k]]);
  },
  trombone(ctx, i) {
    const { fx, k, shoulderY, headY, headR, look } = i;
    const my = headY + headR * 0.7;
    limb(ctx, BRASS, 0.035 * k, [[fx, my], [fx - 0.05 * k, my + 0.75 * k]]);
    limb(ctx, BRASS, 0.025 * k, [[fx + 0.08 * k, my + 0.05 * k], [fx + 0.03 * k, my + 0.95 * k]]);
    circle(ctx, fx - 0.05 * k, my + 0.8 * k, 0.09 * k, BRASS);
    limb(ctx, look.top, 0.085 * k, [[fx - 0.2 * k, shoulderY + 0.05 * k], [fx - 0.1 * k, shoulderY + 0.25 * k], [fx - 0.02 * k, shoulderY + 0.08 * k]]);
    limb(ctx, look.top, 0.085 * k, [[fx + 0.2 * k, shoulderY + 0.05 * k], [fx + 0.25 * k, shoulderY + 0.4 * k], [fx + 0.04 * k, shoulderY + 0.55 * k]]);
  },
  sax(ctx, i) {
    const { fx, k, shoulderY, headY, headR, look } = i;
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = 0.06 * k;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(fx - 0.02 * k, headY + headR * 0.8);
    ctx.quadraticCurveTo(fx + 0.02 * k, shoulderY + 0.5 * k, fx + 0.05 * k, shoulderY + 0.62 * k);
    ctx.quadraticCurveTo(fx + 0.12 * k, shoulderY + 0.7 * k, fx + 0.15 * k, shoulderY + 0.48 * k);
    ctx.stroke();
    circle(ctx, fx + 0.15 * k, shoulderY + 0.46 * k, 0.06 * k, BRASS);
    arms(ctx, i, "down");
    void look;
  },
  tuba(ctx, i) {
    const { fx, k, shoulderY, hipY } = i;
    ctx.fillStyle = BRASS;
    ctx.beginPath();
    ctx.roundRect(fx - 0.2 * k, shoulderY + 0.05 * k, 0.36 * k, hipY - shoulderY + 0.05 * k, 0.12 * k);
    ctx.fill();
    ellipse(ctx, fx - 0.05 * k, shoulderY - 0.15 * k, 0.24 * k, 0.12 * k, "#e8cf7a");
    ellipse(ctx, fx - 0.05 * k, shoulderY - 0.15 * k, 0.17 * k, 0.07 * k, "#8a6a2a");
    arms(ctx, i, "down");
  },
  oboe(ctx, i, o) {
    INSTRUMENTS.clarinet(ctx, i, o);
  },
  sing(ctx, i) {
    arms(ctx, i, "folder");
  },
  singFree(ctx, i) {
    arms(ctx, i, "down");
  },
};

// ---------- furniture & instruments that sit on the floor ----------

// A grand piano with its keyboard at (x, z), body extending toward +x (tail
// to the right as seen from the house) or -x. lidOpen: the lid raised toward
// the audience. `make`: "Steinway" or "Kawai" lettering color.
export function grandPiano(ctx, cam, { x, z, dir = 1, lid = true, len = 2.1, width = 1.5, cover = false }) {
  const s = dir;
  // outline of the case at lid height, keyboard edge at local u = 0
  const outline = [];
  const N = 22;
  for (let n = 0; n <= N; n++) {
    const t = n / N;
    // straight spine side (back), curved bentside (front, toward camera)
    const u = t * len;
    const w = t < 0.45 ? width : width * (0.42 + 0.58 * Math.cos(((t - 0.45) / 0.55) * (Math.PI / 2)) ** 0.7);
    outline.push([u, w]);
  }
  const at = (u, v, y) => [x + s * u, y, z + 0.75 - v * 0.95 + 0.1];
  const top = 1.0;
  const bottom = 0.72;
  const dark = cover ? "#1c1c22" : "#0b0b0d";
  const shine = cover ? "#2a2a33" : "#26262c";
  // legs
  for (const [u, v] of [[0.15, 0.1], [0.15, 1.4], [len * 0.8, 0.95]]) {
    const [lx, ly] = cam.p(...at(u, v, bottom));
    const [, gy] = cam.p(...at(u, v, 0));
    const kk = cam.scaleAt(x, z);
    ctx.fillStyle = "#0e0e10";
    ctx.fillRect(lx - 0.05 * kk, ly, 0.1 * kk, gy - ly);
    ellipse(ctx, lx, gy, 0.07 * kk, 0.03 * kk, "#55555c");
  }
  // the case: its outline at the rim, and a dropped copy for the side band
  const ring = (y) => {
    const pts = outline.map(([u, w]) => at(u, 1.5 - w, y));
    pts.push(at(len * 0.98, 1.5, y), at(0, 1.5, y));
    return pts;
  };
  poly(ctx, cam, ring(bottom), dark);
  poly(ctx, cam, ring(top), shine);
  // keyboard
  poly(ctx, cam, [at(-0.18, 1.5, top - 0.06), at(0, 1.5, top - 0.06), at(0, 0.05, top - 0.06), at(-0.18, 0.05, top - 0.06)], "#f2efe6");
  poly(ctx, cam, [at(-0.2, 1.52, top - 0.12), at(-0.18, 1.52, top - 0.04), at(-0.18, 0.03, top - 0.04), at(-0.2, 0.03, top - 0.12)], "#0b0b0d");
  if (lid && !cover) {
    // raised lid: hinged along the spine (far side), propped toward the house
    const lidPts = outline.map(([u, w]) => {
      const v = 1.5 - w;
      // swung up about the spine (far edge) by ~40°
      return at(u, 1.5 - (1.5 - v) * 0.75, top + (1.5 - v) * 0.62);
    });
    lidPts.push(at(len * 0.98, 1.5, top), at(0.25, 1.5, top));
    poly(ctx, cam, lidPts, "#141418");
    line(ctx, cam, at(len * 0.55, 0.5, top), at(len * 0.55, 0.9, top + 0.55), "#2a2a30", 0.02 * cam.scaleAt(x, z));
    // strings glint
    poly(ctx, cam, [at(0.35, 1.3, top + 0.01), at(len * 0.8, 1.2, top + 0.01), at(len * 0.75, 0.6, top + 0.01), at(0.35, 0.3, top + 0.01)], "#b08a3c");
  }
  // music desk
  poly(ctx, cam, [at(0.12, 1.2, top), at(0.12, 0.3, top), at(0.18, 0.3, top + 0.3), at(0.18, 1.2, top + 0.3)], "#151518");
  return { at };
}

export function bench(ctx, cam, x, z, w = 0.75) {
  poly(ctx, cam, [[x - w / 2, 0.5, z - 0.2], [x + w / 2, 0.5, z - 0.2], [x + w / 2, 0.5, z + 0.2], [x - w / 2, 0.5, z + 0.2]], "#121214");
  poly(ctx, cam, [[x - w / 2, 0.42, z - 0.2], [x + w / 2, 0.42, z - 0.2], [x + w / 2, 0.5, z - 0.2], [x - w / 2, 0.5, z - 0.2]], "#0b0b0d");
  for (const dx of [-w / 2 + 0.05, w / 2 - 0.05]) line(ctx, cam, [x + dx, 0.42, z - 0.18], [x + dx, 0, z - 0.18], "#0b0b0d", 0.05 * cam.scaleAt(x, z));
}

export function chair(ctx, cam, x, z, color = "#151518") {
  const k = cam.scaleAt(x, z);
  poly(ctx, cam, [[x - 0.22, 0.46, z - 0.2], [x + 0.22, 0.46, z - 0.2], [x + 0.22, 0.46, z + 0.22], [x - 0.22, 0.46, z + 0.22]], color);
  poly(ctx, cam, [[x - 0.21, 0.5, z + 0.22], [x + 0.21, 0.5, z + 0.22], [x + 0.2, 0.92, z + 0.28], [x - 0.2, 0.92, z + 0.28]], color);
  for (const [dx, dz] of [[-0.2, -0.18], [0.2, -0.18]]) line(ctx, cam, [x + dx, 0.46, z + dz], [x + dx, 0, z + dz], "#0b0b0d", 0.03 * k);
}

export function stand(ctx, cam, x, z, h = 1.15, tilt = 0, desk = "#141417", y0 = 0) {
  const k = cam.scaleAt(x, z);
  line(ctx, cam, [x, y0, z], [x, y0 + h - 0.1, z], "#0d0d0f", 0.025 * k);
  for (const a of [0.4, 2.5, 4.6]) line(ctx, cam, [x, y0 + 0.02, z], [x + Math.cos(a) * 0.25, y0, z + Math.sin(a) * 0.25], "#0d0d0f", 0.02 * k);
  poly(ctx, cam, [[x - 0.26 + tilt, y0 + h - 0.18, z + 0.04], [x + 0.26 + tilt, y0 + h - 0.18, z + 0.04], [x + 0.26, y0 + h + 0.12, z + 0.14], [x - 0.26, y0 + h + 0.12, z + 0.14]], desk);
  if (desk !== "#141417") {
    // a wooden desk has a dark sheet-music panel on it
    poly(ctx, cam, [[x - 0.17, y0 + h - 0.12, z + 0.06], [x + 0.17, y0 + h - 0.12, z + 0.06], [x + 0.17, y0 + h + 0.06, z + 0.12], [x - 0.17, y0 + h + 0.06, z + 0.12]], "#2a2622");
  }
}

export function micStand(ctx, cam, x, z, h = 1.6) {
  const k = cam.scaleAt(x, z);
  line(ctx, cam, [x, 0, z], [x, h, z], "#101012", 0.025 * k);
  for (const a of [0.4, 2.5, 4.6]) line(ctx, cam, [x, 0.02, z], [x + Math.cos(a) * 0.3, 0, z + Math.sin(a) * 0.3], "#101012", 0.02 * k);
  const [mx, my] = cam.p(x, h, z);
  ellipse(ctx, mx, my, 0.03 * k, 0.06 * k, "#1d1d20");
}

export function wedge(ctx, cam, x, z, rot = 0) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const P = (u, y, v) => [x + u * c - v * s, y, z + u * s + v * c];
  poly(ctx, cam, [P(-0.3, 0, -0.25), P(0.3, 0, -0.25), P(0.3, 0.32, 0.12), P(-0.3, 0.32, 0.12)], "#141416");
  poly(ctx, cam, [P(-0.3, 0.32, 0.12), P(0.3, 0.32, 0.12), P(0.3, 0, 0.25), P(-0.3, 0, 0.25)], "#0c0c0d");
}

export function speakerOnPole(ctx, cam, x, z) {
  const k = cam.scaleAt(x, z);
  line(ctx, cam, [x, 0, z], [x, 1.6, z], "#141416", 0.035 * k);
  for (const a of [0.4, 2.5, 4.6]) line(ctx, cam, [x, 0.05, z], [x + Math.cos(a) * 0.4, 0, z + Math.sin(a) * 0.4], "#141416", 0.025 * k);
  poly(ctx, cam, [[x - 0.2, 1.55, z], [x + 0.2, 1.55, z], [x + 0.2, 2.15, z], [x - 0.2, 2.15, z]], "#0e0e10");
}

export function riser(ctx, cam, x0, x1, z, step, height, color = "#8d8f94") {
  // a straight run of choral riser: three steps rising away from the house
  for (let n = 0; n < 3; n++) {
    const zf = z + n * step;
    const y = height * (n + 1);
    poly(ctx, cam, [[x0, y, zf], [x1, y, zf], [x1, y, zf + step], [x0, y, zf + step]], color);
    poly(ctx, cam, [[x0, y - height, zf], [x1, y - height, zf], [x1, y, zf], [x0, y, zf]], "#3e4045");
  }
}

export function marimba(ctx, cam, x, z, len = 2.4, rot = 0, color = "#7a3216") {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const P = (u, y, v) => [x + u * c - v * s, y, z + u * s + v * c];
  const k = cam.scaleAt(x, z);
  // resonators and frame
  for (let u = -len / 2; u <= len / 2; u += 0.08) line(ctx, cam, P(u, 0.9, 0.1), P(u, 0.45 - (u + len / 2) * 0.12, 0.1), "#a8834a", 0.03 * k);
  poly(ctx, cam, [P(-len / 2, 0.9, -0.45), P(len / 2, 0.9, -0.25), P(len / 2, 0.9, 0.2), P(-len / 2, 0.9, 0.4)], color);
  for (let u = -len / 2; u <= len / 2; u += 0.06) line(ctx, cam, P(u, 0.92, -0.42 + (u + len / 2) * 0.08), P(u, 0.92, 0.38 - (u + len / 2) * 0.08), "#5a220c", 0.012 * k);
  for (const u of [-len / 2, len / 2]) line(ctx, cam, P(u, 0.9, 0), P(u, 0, 0), "#1a1a1c", 0.05 * k);
}

export function drumKit(ctx, cam, x, z) {
  const k = cam.scaleAt(x, z);
  const at = (dx, y, dz) => cam.p(x + dx, y, z + dz);
  const [bx, by] = at(0, 0.32, -0.2);
  circle(ctx, bx, by, 0.3 * k, "#5a1820");
  circle(ctx, bx, by, 0.25 * k, "#e8e2d6");
  for (const [dx, y, dz, r, col] of [[-0.45, 0.65, -0.35, 0.18, "#5a1820"], [0.35, 0.6, -0.3, 0.2, "#5a1820"], [0.1, 0.85, 0.05, 0.15, "#5a1820"]]) {
    const [tx, ty] = at(dx, y, dz);
    ellipse(ctx, tx, ty, r * k, r * 0.45 * k, "#e8e2d6");
    ctx.fillStyle = col;
    ctx.fillRect(tx - r * k, ty, 2 * r * k, 0.18 * k);
  }
  for (const [dx, y, dz] of [[-0.75, 1.05, -0.1], [0.75, 1.15, 0.05], [0.95, 0.85, -0.2]]) {
    const [cx, cy] = at(dx, y, dz);
    ellipse(ctx, cx, cy, 0.25 * k, 0.05 * k, BRASS, -0.08);
    line(ctx, cam, [x + dx, y, z + dz], [x + dx, 0, z + dz], "#77777d", 0.02 * k);
  }
}

export function timpani(ctx, cam, x, z, r = 0.38) {
  const k = cam.scaleAt(x, z);
  const [tx, ty] = cam.p(x, 0.8, z);
  ctx.fillStyle = "#a0602c";
  ctx.beginPath();
  ctx.ellipse(tx, ty, r * k, r * 0.4 * k, 0, 0, Math.PI);
  ctx.lineTo(tx + r * 0.5 * k, ty + 0.55 * k);
  ctx.lineTo(tx - r * 0.5 * k, ty + 0.55 * k);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, tx, ty, r * k, r * 0.4 * k, "#efe6d0");
}

export function harp(ctx, cam, x, z) {
  const k = cam.scaleAt(x, z);
  const [hx, hy] = cam.p(x, 0, z);
  ctx.strokeStyle = "#d9c08a";
  ctx.lineWidth = 0.07 * k;
  ctx.beginPath();
  ctx.moveTo(hx - 0.1 * k, hy);
  ctx.lineTo(hx - 0.2 * k, hy - 1.75 * k);
  ctx.quadraticCurveTo(hx + 0.25 * k, hy - 1.95 * k, hx + 0.35 * k, hy - 1.55 * k);
  ctx.lineTo(hx + 0.15 * k, hy - 0.3 * k);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = "#e9e1cc";
  ctx.fillRect(hx - 0.12 * k, hy - 0.3 * k, 0.32 * k, 0.3 * k);
  ctx.strokeStyle = "rgba(240,235,220,0.7)";
  ctx.lineWidth = 0.008 * k;
  for (let n = 0; n < 9; n++) {
    ctx.beginPath();
    ctx.moveTo(hx - 0.16 * k + n * 0.04 * k, hy - 1.7 * k + n * 0.05 * k);
    ctx.lineTo(hx - 0.05 * k + n * 0.025 * k, hy - 0.3 * k);
    ctx.stroke();
  }
}

export function harpsichord(ctx, cam, x, z, dir = 1) {
  poly(ctx, cam, [[x, 0.85, z], [x + dir * 2.0, 0.85, z + 0.4], [x + dir * 2.0, 0.85, z + 0.65], [x, 0.85, z + 0.9]], "#8a4a20");
  poly(ctx, cam, [[x, 0.6, z], [x + dir * 2.0, 0.6, z + 0.4], [x + dir * 2.0, 0.85, z + 0.4], [x, 0.85, z]], "#6a3414");
  poly(ctx, cam, [[x, 0.86, z + 0.85], [x + dir * 1.8, 0.86, z + 0.62], [x + dir * 1.8, 1.4, z + 0.9], [x, 1.5, z + 1.1]], "#b0763a");
}

export function screen(ctx, cam, x0, x1, y0, y1, z, image) {
  poly(ctx, cam, [[x0 - 0.1, y0 - 0.1, z], [x1 + 0.1, y0 - 0.1, z], [x1 + 0.1, y1 + 0.1, z], [x0 - 0.1, y1 + 0.1, z]], "#0c0c0e");
  poly(ctx, cam, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], "#dcdad2");
  if (image) {
    const [ax, ay] = cam.p(x0 + 0.35, y1 - 0.3, z);
    const [bx, by] = cam.p(x1 - 0.35, y0 + 0.3, z);
    image(ctx, ax, ay, bx - ax, by - ay);
  }
}

export function flowers(ctx, cam, x, z) {
  const k = cam.scaleAt(x, z);
  poly(ctx, cam, [[x - 0.2, 0.45, z - 0.15], [x + 0.2, 0.45, z - 0.15], [x + 0.2, 0.45, z + 0.15], [x - 0.2, 0.45, z + 0.15]], "#4a2a18");
  line(ctx, cam, [x - 0.15, 0.45, z], [x - 0.15, 0, z], "#3a2010", 0.025 * k);
  line(ctx, cam, [x + 0.15, 0.45, z], [x + 0.15, 0, z], "#3a2010", 0.025 * k);
  const [vx, vy] = cam.p(x, 0.62, z);
  ellipse(ctx, vx, vy, 0.06 * k, 0.12 * k, "#9fb4b8");
  const r = rng(Math.round(x * 100 + z));
  for (let n = 0; n < 14; n++) circle(ctx, vx + (r() - 0.5) * 0.3 * k, vy - 0.15 * k - r() * 0.22 * k, 0.03 * k, n % 3 ? "#f2eedc" : "#e9d15a");
}

// Heads and shoulders of the audience, from behind — dark, since the house
// lights are down. rows: [{ z, y, xs: [...] }]
export function audience(ctx, cam, rows, seed = 3) {
  const r = rng(seed);
  for (const row of rows) {
    for (const x of row.xs) {
      if (r() < (row.empty ?? 0.25)) continue;
      const k = cam.scaleAt(x, row.z);
      const [sx, sy] = cam.p(x + (r() - 0.5) * 0.1, row.y, row.z);
      const shade = ["#2a2522", "#332c27", "#3a322c", "#221e1c", "#40372f"][Math.floor(r() * 5)];
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.ellipse(sx, sy + 0.32 * k, 0.24 * k, 0.2 * k, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(sx - 0.24 * k, sy + 0.32 * k, 0.48 * k, 0.4 * k);
      circle(ctx, sx, sy, 0.11 * k, HAIR[Math.floor(r() * 6)]);
    }
  }
}

export function chimes(ctx, cam, x, z, y0 = 0) {
  const k = cam.scaleAt(x, z);
  line(ctx, cam, [x - 0.4, y0, z], [x - 0.4, y0 + 2.0, z], "#6a6a70", 0.03 * k);
  line(ctx, cam, [x + 0.4, y0, z], [x + 0.4, y0 + 2.0, z], "#6a6a70", 0.03 * k);
  line(ctx, cam, [x - 0.45, y0 + 2.0, z], [x + 0.45, y0 + 2.0, z], "#6a6a70", 0.04 * k);
  for (let n = 0; n < 9; n++) {
    const xx = x - 0.32 + n * 0.08;
    line(ctx, cam, [xx, y0 + 1.95, z], [xx, y0 + 1.95 - 0.9 - n * 0.05, z], "#d9dce2", 0.025 * k);
  }
}

export function gong(ctx, cam, x, z, y0 = 0) {
  const k = cam.scaleAt(x, z);
  line(ctx, cam, [x - 0.55, y0, z], [x - 0.55, y0 + 1.7, z], "#2a2a2e", 0.04 * k);
  line(ctx, cam, [x + 0.55, y0, z], [x + 0.55, y0 + 1.7, z], "#2a2a2e", 0.04 * k);
  line(ctx, cam, [x - 0.6, y0 + 1.7, z], [x + 0.6, y0 + 1.7, z], "#2a2a2e", 0.05 * k);
  const [gx, gy] = cam.p(x, y0 + 1.05, z);
  circle(ctx, gx, gy, 0.48 * k, "#a8783a");
  circle(ctx, gx, gy, 0.3 * k, "#c8984e");
  circle(ctx, gx, gy, 0.12 * k, "#a8783a");
}

export function bassDrum(ctx, cam, x, z, y0 = 0) {
  const k = cam.scaleAt(x, z);
  const [bx, by] = cam.p(x, y0 + 0.7, z);
  ellipse(ctx, bx, by, 0.18 * k, 0.45 * k, "#7a1a22");
  ellipse(ctx, bx + 0.08 * k, by, 0.12 * k, 0.42 * k, "#ece6d8");
  line(ctx, cam, [x - 0.25, y0, z], [x, y0 + 0.4, z], "#3a3a3e", 0.03 * k);
  line(ctx, cam, [x + 0.25, y0, z], [x, y0 + 0.4, z], "#3a3a3e", 0.03 * k);
}
