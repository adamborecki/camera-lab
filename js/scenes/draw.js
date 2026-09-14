// Small Canvas2D drawing kit shared by the scenes. Scenes are illustrated,
// not photographic — but each layer sits at a real distance and under a real
// light, so the camera math treats them like the real thing.

export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function ellipse(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function circle(ctx, x, y, r, fill) {
  ellipse(ctx, x, y, r, r, fill);
}

export function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

export function hgrad(ctx, x0, x1, stops) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

export function rgrad(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

// Deterministic pseudo-random so scenes look the same every load.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// A stylized head-and-shoulders figure. (x, y) = top of the head.
// s = scale (1 ≈ a 110px-tall head). opts: skin, hair, shirt, jacket.
export function person(ctx, x, y, s, o) {
  const headW = 78 * s;
  const headH = 104 * s;
  const cx = x;
  const cy = y + headH / 2;

  // torso
  const shoulderY = y + headH + 22 * s;
  ctx.fillStyle = o.jacket;
  ctx.beginPath();
  ctx.moveTo(cx - 150 * s, shoulderY + 60 * s);
  ctx.quadraticCurveTo(cx - 150 * s, shoulderY, cx - 60 * s, shoulderY - 8 * s);
  ctx.lineTo(cx + 60 * s, shoulderY - 8 * s);
  ctx.quadraticCurveTo(cx + 150 * s, shoulderY, cx + 150 * s, shoulderY + 60 * s);
  ctx.lineTo(cx + 175 * s, y + 900 * s);
  ctx.lineTo(cx - 175 * s, y + 900 * s);
  ctx.closePath();
  ctx.fill();

  // shirt V
  if (o.shirt) {
    ctx.fillStyle = o.shirt;
    ctx.beginPath();
    ctx.moveTo(cx - 44 * s, shoulderY - 8 * s);
    ctx.lineTo(cx + 44 * s, shoulderY - 8 * s);
    ctx.lineTo(cx + 18 * s, shoulderY + 170 * s);
    ctx.lineTo(cx - 18 * s, shoulderY + 170 * s);
    ctx.closePath();
    ctx.fill();
  }

  // neck
  ctx.fillStyle = o.skinShade || o.skin;
  rrect(ctx, cx - 22 * s, y + headH - 16 * s, 44 * s, 46 * s, 10 * s);
  ctx.fill();

  // ears
  ellipse(ctx, cx - headW / 2, cy + 6 * s, 10 * s, 16 * s, o.skinShade || o.skin);
  ellipse(ctx, cx + headW / 2, cy + 6 * s, 10 * s, 16 * s, o.skinShade || o.skin);

  // face with soft modelling
  ctx.fillStyle = rgrad(ctx, cx - 14 * s, cy - 18 * s, 4 * s, headW * 0.9, [
    [0, o.skinLight || o.skin],
    [0.6, o.skin],
    [1, o.skinShade || o.skin],
  ]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, headW / 2, headH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // hair
  ctx.fillStyle = o.hair;
  ctx.beginPath();
  ctx.ellipse(cx, cy - headH * 0.28, headW * 0.56, headH * 0.34, 0, Math.PI, Math.PI * 2);
  ctx.quadraticCurveTo(cx + headW * 0.62, cy - headH * 0.05, cx + headW * 0.5, cy + headH * 0.05);
  ctx.quadraticCurveTo(cx + headW * 0.3, cy - headH * 0.3, cx - headW * 0.1, cy - headH * 0.3);
  ctx.quadraticCurveTo(cx - headW * 0.45, cy - headH * 0.25, cx - headW * 0.52, cy + headH * 0.05);
  ctx.quadraticCurveTo(cx - headW * 0.62, cy - headH * 0.1, cx - headW * 0.56, cy - headH * 0.28);
  ctx.fill();

  // features
  const eyeY = cy + 2 * s;
  ellipse(ctx, cx - 17 * s, eyeY, 6 * s, 4 * s, "#1b1411");
  ellipse(ctx, cx + 17 * s, eyeY, 6 * s, 4 * s, "#1b1411");
  ctx.strokeStyle = o.hair;
  ctx.lineWidth = 4 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 26 * s, eyeY - 13 * s);
  ctx.lineTo(cx - 9 * s, eyeY - 15 * s);
  ctx.moveTo(cx + 9 * s, eyeY - 15 * s);
  ctx.lineTo(cx + 26 * s, eyeY - 13 * s);
  ctx.stroke();
  ctx.strokeStyle = o.skinShade || "#0004";
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(cx, eyeY + 6 * s);
  ctx.lineTo(cx - 5 * s, eyeY + 22 * s);
  ctx.lineTo(cx + 3 * s, eyeY + 24 * s);
  ctx.stroke();
  if (o.mouthOpen) ellipse(ctx, cx, eyeY + 38 * s, 10 * s, 8 * s, "#4a1f1f");
  else {
    ctx.strokeStyle = "#7a3b35";
    ctx.beginPath();
    ctx.moveTo(cx - 12 * s, eyeY + 37 * s);
    ctx.quadraticCurveTo(cx, eyeY + 43 * s, cx + 12 * s, eyeY + 37 * s);
    ctx.stroke();
  }
  return { shoulderY, headH, headW, cy };
}
