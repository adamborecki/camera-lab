// Salmon Recital Hall, from the control booth at the back of the house —
// drawn from the instructor's photos of real recitals: cream walls with a
// grid of acoustic panels, a wood wainscot, the cork floor with its light
// stripes, a hanging mic pair, and the audience's heads at the bottom of
// the frame. One room, many programs: a solo pianist, a choir on risers, a
// mariachi line, a percussion ensemble, an early-music band in low light…
//
// Light: warm tungsten-ish (3200K) from overhead. Exposure is set so the
// AX100's Salmon numbers (F4 · 3 dB · 1/60) land right on it. The hall's
// installed RovoCam runs on auto white balance, which here settles a bit warm
// and green of neutral (scene.awb) — the instructor's observation is that an
// AX100 at 3800K, A5 G2 matches it, so that's what this scene encodes.
import { vgrad, rgrad, ellipse, circle, rng } from "./draw.js";
import * as K from "./hall-kit.js";

const CAM = { pos: [0, 5.0, 0], pitchDeg: 14, equivFocal: 32 };
const BACK_Z = 19;
// Half-width at the upstage wall, and how much wider each side gets toward
// the house (z = 6). Salmon's floor plan (adamborecki/salmon, docs/FLOOR_PLAN.md)
// is 18.8 m from the back-of-house apex to the upstage wall and 16.6 m wide.
const ROOM_X = 8.0;
const SPLAY = 0.3;

// ---------- the room ----------

function drawRoom(ctx, W, H, cam, opts) {
  const dim = opts.dim || 0;
  // ceiling / darkness above
  ctx.fillStyle = "#1b140f";
  ctx.fillRect(0, 0, W, H);
  // back wall
  const wall = dim ? "#b9a582" : "#eadcbf";
  K.poly(ctx, cam, [[-ROOM_X, 0, BACK_Z], [ROOM_X, 0, BACK_Z], [ROOM_X, 9.5, BACK_Z], [-ROOM_X, 9.5, BACK_Z]], wall);
  // side walls, splayed toward the house
  for (const s of [-1, 1]) {
    K.poly(ctx, cam, [[s * ROOM_X, 0, BACK_Z], [s * (ROOM_X + SPLAY), 0, 6], [s * (ROOM_X + SPLAY), 9.5, 6], [s * ROOM_X, 9.5, BACK_Z]], dim ? "#a8946f" : "#e2d2b2");
  }
  // soft falloff of the downlights on the walls
  const [, topY] = cam.p(0, 9.5, BACK_Z);
  const [, floorY] = cam.p(0, 0, BACK_Z);
  ctx.fillStyle = vgrad(ctx, topY, floorY, [
    [0, "rgba(40,25,10,0.45)"],
    [0.45, "rgba(40,25,10,0)"],
  ]);
  ctx.fillRect(0, topY, W, floorY - topY);
  // acoustic panels: groups of two columns, small–small–tall, as in the hall
  const groups = [-7.4, -5.2, -3.0, -0.9, 1.2, 3.3, 5.5];
  for (const gx of groups) {
    for (let c = 0; c < 2; c++) {
      const x0 = gx + c * 1.0;
      const rows = [
        [6.9, 7.75],
        [5.85, 6.7],
        [3.4, 5.65],
      ];
      for (const [y0, y1] of rows) {
        K.poly(ctx, cam, [[x0, y0, BACK_Z - 0.02], [x0 + 0.85, y0, BACK_Z - 0.02], [x0 + 0.85, y1, BACK_Z - 0.02], [x0, y1, BACK_Z - 0.02]], dim ? "#a6916c" : "#ddcba8", "#5a4632", 1.6);
      }
    }
  }
  // side-wall panels
  for (const s of [-1, 1]) {
    for (let n = 0; n < 3; n++) {
      const z0 = BACK_Z - 2 - n * 3.6;
      const z1 = z0 - 2.6;
      const xa = s * (ROOM_X + (SPLAY * (BACK_Z - z0)) / (BACK_Z - 6));
      const xb = s * (ROOM_X + (SPLAY * (BACK_Z - z1)) / (BACK_Z - 6));
      K.poly(ctx, cam, [[xa, 3.4, z0], [xb, 3.4, z1], [xb, 7.75, z1], [xa, 7.75, z0]], dim ? "#a08b66" : "#d8c5a2", "#5a4632", 1.6);
    }
  }
  // wood wainscot with dark trim
  K.poly(ctx, cam, [[-ROOM_X, 0, BACK_Z - 0.01], [ROOM_X, 0, BACK_Z - 0.01], [ROOM_X, 1.15, BACK_Z - 0.01], [-ROOM_X, 1.15, BACK_Z - 0.01]], "#c27a35");
  for (const s of [-1, 1]) K.poly(ctx, cam, [[s * ROOM_X, 0, BACK_Z], [s * (ROOM_X + SPLAY), 0, 6], [s * (ROOM_X + SPLAY), 1.15, 6], [s * ROOM_X, 1.15, BACK_Z]], "#b56f2e");
  // vertical grain hints
  const r = rng(5);
  ctx.globalAlpha = 0.18;
  for (let x = -ROOM_X; x < ROOM_X; x += 0.25 + r() * 0.3) K.line(ctx, cam, [x, 0.08, BACK_Z - 0.02], [x, 1.08, BACK_Z - 0.02], "#8a4a18", 1);
  ctx.globalAlpha = 1;
  for (const y of [1.15, 1.22, 0.06]) {
    K.line(ctx, cam, [-ROOM_X, y, BACK_Z - 0.03], [ROOM_X, y, BACK_Z - 0.03], "#5a2412", 3);
    for (const s of [-1, 1]) K.line(ctx, cam, [s * ROOM_X, y, BACK_Z - 0.03], [s * (ROOM_X + SPLAY), y, 6], "#5a2412", 3);
  }
  // ceiling clouds peeking in at the top of a wide shot
  ctx.fillStyle = "#9a6a3a";
  for (let n = 0; n < 6; n++) {
    const z = 8 + n * 2.1;
    K.poly(ctx, cam, [[-7, 10.2 - n * 0.06, z], [7, 10.2 - n * 0.06, z], [7, 9.9 - n * 0.06, z + 1.4], [-7, 9.9 - n * 0.06, z + 1.4]], n % 2 ? "#b07c46" : "#a06e3c", "#2a1a10", 3);
  }
  // downlight cans
  for (let n = 0; n < 4; n++) {
    for (const x of [-5, -1.7, 1.7, 5]) {
      const [lx, ly] = cam.p(x, 9.85, 9 + n * 2.6);
      ellipse(ctx, lx, ly, 6, 4, "#2a2a2e");
    }
  }
}

function drawFloor(ctx, W, H, cam, opts) {
  const dim = opts.dim || 0;
  // cork floor
  K.poly(ctx, cam, [[-ROOM_X - SPLAY, 0, 6], [ROOM_X + SPLAY, 0, 6], [ROOM_X, 0, BACK_Z], [-ROOM_X, 0, BACK_Z]], dim ? "#8e6a48" : "#c79a6c");
  // light stripes framing the performance area (two nested rectangles)
  const band = (x0, x1, z0, z1, w, col) => {
    K.poly(ctx, cam, [[x0, 0.002, z0], [x1, 0.002, z0], [x1, 0.002, z0 + w], [x0, 0.002, z0 + w]], col);
    K.poly(ctx, cam, [[x0, 0.002, z1 - w], [x1, 0.002, z1 - w], [x1, 0.002, z1], [x0, 0.002, z1]], col);
    K.poly(ctx, cam, [[x0, 0.002, z0], [x0 + w, 0.002, z0], [x0 + w, 0.002, z1], [x0, 0.002, z1]], col);
    K.poly(ctx, cam, [[x1 - w, 0.002, z0], [x1, 0.002, z0], [x1, 0.002, z1], [x1 - w, 0.002, z1]], col);
  };
  const light = dim ? "#b08a62" : "#e6c9a0";
  band(-7.6, 7.6, 8.6, 18.2, 0.5, light);
  band(-6.2, 6.2, 10.2, 17.0, 0.18, light);
  K.poly(ctx, cam, [[-ROOM_X - SPLAY, 0.002, 7.2], [ROOM_X + SPLAY, 0.002, 7.2], [ROOM_X + SPLAY, 0.002, 7.9], [-ROOM_X - SPLAY, 0.002, 7.9]], light);
  // pool of light on the stage (only on the floor)
  const [cx, cy] = cam.p(0, 0, 13);
  ctx.save();
  K.poly(ctx, cam, [[-ROOM_X - SPLAY, 0, 6], [ROOM_X + SPLAY, 0, 6], [ROOM_X, 0, BACK_Z], [-ROOM_X, 0, BACK_Z]]);
  ctx.clip();
  ctx.fillStyle = rgrad(ctx, cx, cy, 20, 620, [
    [0, "rgba(255,225,180,0.22)"],
    [1, "rgba(255,225,180,0)"],
  ]);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // reflections of the overhead cans on the glossy floor
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    const [rx, ry] = cam.p(x, 0, 16.5);
    ellipse(ctx, rx, ry, 14, 3, "rgba(255,240,215,0.25)");
  }
}

// The stereo pair that hangs over the stage on two wires, in every shot.
function drawMics(ctx, W, H, cam) {
  const x = 0.2;
  const z = 13.5;
  const [tx, ty] = cam.p(x, 3.6, z);
  const [ax] = cam.p(x - 0.4, 12, z);
  const [bx] = cam.p(x + 0.4, 12, z);
  ctx.strokeStyle = "rgba(235,230,220,0.85)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(ax, 0);
  ctx.lineTo(tx - 3, ty);
  ctx.moveTo(bx, 0);
  ctx.lineTo(tx + 3, ty);
  ctx.stroke();
  const k = cam.scaleAt(x, z);
  ctx.fillStyle = "#18181b";
  ctx.fillRect(tx - 0.28 * k, ty, 0.56 * k, 0.04 * k);
  for (const d of [-0.22, 0.22]) {
    ctx.save();
    ctx.translate(tx + d * k, ty + 0.06 * k);
    ctx.rotate(d > 0 ? -0.5 : 0.5);
    ctx.fillRect(-0.03 * k, 0, 0.06 * k, 0.2 * k);
    ctx.restore();
  }
}

// ---------- programs ----------
// Each returns a list of { z, draw(ctx, cam) } things on stage (painted far
// to near), plus who to frame. Performer looks come from lookFor(seed):
// invented, never anyone real.

const L = K.lookFor;
const P = (o) => ({ z: o.z, x: o.x, person: o, draw: (ctx, cam) => K.person(ctx, cam, o) });
const T = (z, x, draw) => ({ z, x, draw });
const STEINWAY = { x: -1.4, z: 13.4 };

function pianoWithPlayer(px, pz, seed, opts = {}) {
  return [
    T(pz + 0.05, px, (ctx, cam) => K.grandPiano(ctx, cam, { x: px, z: pz, dir: 1, ...opts })),
    T(pz - 0.6, px - 0.55, (ctx, cam) => K.bench(ctx, cam, px - 0.55, pz + 0.05)),
    P({ x: px - 0.55, z: pz - 0.05, pose: "piano", facing: "right", look: L(seed, opts.look || {}) }),
  ];
}

function storedPiano(x, z) {
  return T(z, x, (ctx, cam) => K.grandPiano(ctx, cam, { x, z, dir: 1, lid: false, cover: true }));
}

export const PROGRAMS = {
  "piano-solo": {
    title: "Solo piano",
    items: () => [...pianoWithPlayer(-1.2, 13.2, 3), storedPiano(4.6, 16.8)],
  },
  "violin-piano": {
    title: "Violin + piano",
    items: () => [...pianoWithPlayer(-0.3, 13.6, 11, { look: { top: "#e9e4dc", accent: "#c9c3b8" } }), P({ x: -2.6, z: 12.2, pose: "stand", inst: "violin", look: L(12), bow: true })],
    movers: ["bow"],
  },
  "clarinet-piano": {
    title: "Clarinet + piano",
    items: () => [...pianoWithPlayer(-1.6, 13.2, 21), P({ x: 2.4, z: 12.4, pose: "stand", inst: "clarinet", look: L(22, { top: "#6a1a3a", accent: "#e8d0e0", accentStyle: "pattern" }) })],
  },
  "brass-trio": {
    title: "Euphonium, horn + piano",
    items: () => [...pianoWithPlayer(-1.4, 13.6, 31), P({ x: -0.3, z: 12.4, pose: "stand", inst: "euphonium", look: L(32, { long: true }) }), P({ x: 2.8, z: 12.8, pose: "stand", inst: "horn", look: L(33) })],
  },
  "two-pianos": {
    title: "Piano duo (two grands)",
    items: () => [
      T(14.6, 0, (ctx, cam) => K.grandPiano(ctx, cam, { x: -0.2, z: 14.6, dir: 1 })),
      P({ x: -0.6, z: 14.4, pose: "piano", facing: "right", look: L(41) }),
      ...pianoWithPlayer(-1.5, 13.0, 42),
      P({ x: -1.6, z: 13.5, pose: "sit", look: L(43, { top: "#5a5d66" }) }),
    ],
  },
  "guitar-solo": {
    title: "Solo guitar",
    items: () => [
      T(15.2, 0, (ctx, cam) => K.grandPiano(ctx, cam, { x: -0.6, z: 15.2, dir: 1, lid: false })),
      T(14.6, 0, (ctx, cam) => K.grandPiano(ctx, cam, { x: -0.9, z: 14.4, dir: 1, lid: false })),
      T(12.8, 0.2, (ctx, cam) => K.chair(ctx, cam, -0.1, 12.6)),
      P({ x: -0.1, z: 12.4, pose: "sit", inst: "guitar", look: L(51, { top: "#7a1c1c" }) }),
      T(12.1, 0.5, (ctx, cam) => K.stand(ctx, cam, 0.55, 11.9, 1.0)),
    ],
  },
  choir: {
    title: "Choir on risers",
    items: () => {
      const out = [];
      out.push(T(17.6, -5.6, (ctx, cam) => K.riser(ctx, cam, -5.2, 5.2, 15.4, 0.55, 0.22)));
      let seed = 100;
      for (let row = 0; row < 3; row++) {
        const n = 11 - (row === 0 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const x = -4.6 + (i * 9.2) / (n - 1) + (row % 2 ? 0.2 : 0);
          const z = 15.5 + row * 0.55;
          out.push(P({ x, z, y0: 0.22 * (row + 1), pose: "stand", inst: "sing", dress: seed % 3 !== 0, look: L(seed++, { long: seed % 3 !== 1 }) }));
        }
      }
      out.push(...pianoWithPlayer(-5.9, 13.2, 140, { len: 1.7 }));
      out.push(P({ x: 0.2, z: 12.4, pose: "conduct", look: L(141, { long: true }) }));
      out.push(T(13.2, 5.6, (ctx, cam) => K.timpani(ctx, cam, 5.6, 13.6, 0.25)));
      return out;
    },
    movers: ["conductor"],
  },
  mariachi: {
    title: "Mariachi",
    items: () => {
      const out = [];
      const insts = ["violin", "violin", "violin", "violin", "trumpet", "trumpet", "sing", null, "harp", "vihuela", "guitarron", "vihuela", "vihuela", "violin", "violin", "violin"];
      insts.forEach((inst, i) => {
        const x = -6.4 + (i * 12.8) / (insts.length - 1);
        const z = 14.2 + Math.abs(x) * 0.12;
        if (inst === "harp") {
          out.push(T(z + 0.1, x, (ctx, cam) => K.harp(ctx, cam, x, z + 0.1)));
          return;
        }
        if (inst) out.push(T(z - 0.3, x, (ctx, cam) => K.stand(ctx, cam, x + 0.2, z - 0.5, 1.15)));
        out.push(
          P({ x, z, pose: "stand", inst: inst || "singFree", dress: i % 4 === 2, look: L(200 + i, { top: "#141016", accent: "#8a1420", accentStyle: "vest", long: i % 3 === 0 }) }),
        );
      });
      out.push(T(12.4, -0.6, (ctx, cam) => K.micStand(ctx, cam, -0.6, 12.4)));
      out.push(T(12.4, 0.6, (ctx, cam) => K.micStand(ctx, cam, 0.6, 12.5)));
      for (const [x, z, r] of [[-3, 12.6, 0.4], [0, 13.2, 0], [3, 12.6, -0.4]]) out.push(T(z, x, (ctx, cam) => K.wedge(ctx, cam, x, z, r)));
      return out;
    },
  },
  percussion: {
    title: "Percussion ensemble",
    items: () => [
      T(14.6, -4, (ctx, cam) => K.marimba(ctx, cam, -4.4, 14.6, 2.4, -0.4)),
      T(13.6, -3.2, (ctx, cam) => K.marimba(ctx, cam, -3.4, 13.4, 2.6, 0.35, "#86391a")),
      T(15.2, -0.9, (ctx, cam) => K.marimba(ctx, cam, -0.9, 15.6, 1.8, 0, "#2a2a30")),
      T(15.0, 1.4, (ctx, cam) => K.drumKit(ctx, cam, 1.5, 15.3)),
      T(14.4, 3.6, (ctx, cam) => K.timpani(ctx, cam, 3.8, 14.6)),
      T(14.5, 5.2, (ctx, cam) => K.timpani(ctx, cam, 5.0, 14.9, 0.32)),
      T(17.6, -2, (ctx, cam) => K.speakerOnPole(ctx, cam, -2.2, 17.6)),
      T(17.6, 3, (ctx, cam) => K.speakerOnPole(ctx, cam, 3.4, 17.6)),
      ...[-2.2, 0.4, 2.6, 4.6].map((x, i) => T(12.4, x, (ctx, cam) => K.stand(ctx, cam, x, 12.5 + (i % 2) * 0.6, 1.1))),
    ],
  },
  "early-music": {
    title: "Early-music ensemble (low light)",
    dim: true,
    items: () => {
      const out = [T(17.8, 0, (ctx, cam) => K.screen(ctx, cam, -2.6, 2.6, 1.6, 4.6, 17.8, paintingOnScreen))];
      out.push(T(15.4, -2.6, (ctx, cam) => K.harpsichord(ctx, cam, -3.4, 15.2)));
      const seats = 14;
      for (let i = 0; i < seats; i++) {
        const a = Math.PI * (0.08 + (0.84 * i) / (seats - 1));
        const x = -Math.cos(a) * 5.8;
        const z = 13.8 + Math.sin(a) * 1.6 - (i % 2) * 0.4;
        const inst = ["cello", "violin", "violin", "cello", "violin", "violin", null, null, "cello", "violin", "cello", "violin", "bass", "guitar"][i];
        out.push(T(z - 0.5, x, (ctx, cam) => K.stand(ctx, cam, x * 0.94, z - 0.7, 1.05)));
        if (inst === "bass") out.push(P({ x, z, pose: "stand", inst, look: L(300 + i) }));
        else out.push(P({ x, z, pose: inst ? "sit" : "stand", inst: inst || "sing", look: L(300 + i) }));
      }
      out.push(P({ x: 0.1, z: 12.6, pose: "conduct", look: L(330) }));
      return out;
    },
    movers: ["conductor"],
  },
  "chamber-orchestra": {
    title: "Chamber orchestra",
    items: () => {
      const out = [...pianoWithPlayer(-6.2, 14.2, 400, { len: 1.9 })];
      out.push(T(15.6, 4, (ctx, cam) => K.drumKit(ctx, cam, 4.4, 15.6)));
      out.push(P({ x: 4.4, z: 16.0, pose: "sit", look: L(401) }));
      const rows = [
        { z: 12.8, xs: [-3.2, -1.8, 1.8], inst: ["violin", "violin", "cello"], pose: "sit" },
        { z: 14.2, xs: [-2.6, -1.2, 0.2, 1.6], inst: ["violin", "violin", "clarinet", "cello"], pose: "sit" },
        { z: 15.6, xs: [-3.6, -1.6, -0.2, 1.4], inst: ["bass", "trumpet", "trumpet", "flute"], pose: "stand" },
      ];
      let seed = 410;
      for (const r of rows) {
        r.xs.forEach((x, i) => {
          out.push(T(r.z - 0.5, x, (ctx, cam) => K.stand(ctx, cam, x + 0.15, r.z - 0.7, 1.05)));
          out.push(P({ x, z: r.z, pose: r.inst[i] === "bass" ? "stand" : r.pose, inst: r.inst[i], look: L(seed++) }));
        });
      }
      out.push(T(11.2, 0, (ctx, cam) => K.poly(ctx, cam, [[-0.55, 0.22, 10.8], [0.55, 0.22, 10.8], [0.55, 0.22, 11.7], [-0.55, 0.22, 11.7]], "#121214")));
      out.push(P({ x: 0, z: 11.1, y0: 0.22, pose: "conduct", look: L(430) }));
      return out;
    },
    movers: ["conductor"],
  },
  "vocal-jazz": {
    title: "Vocal jazz",
    items: () => {
      const out = [];
      // singers in a shallow arc at mic stands, rhythm section behind
      [-3.6, -2.2, -0.8, 0.6, 2.0, 3.4].forEach((x, i) => {
        const z = 12.0 + Math.abs(x) * 0.08;
        out.push(T(z - 0.25, x, (ctx, cam) => K.micStand(ctx, cam, x + 0.15, z - 0.35, 1.5)));
        out.push(P({ x, z, pose: "stand", inst: i % 2 ? "handMic" : "singFree", dress: i % 3 === 1, look: L(700 + i, { long: i % 2 === 0 }) }));
      });
      out.push(...pianoWithPlayer(-4.6, 15.0, 710, { len: 1.8 }));
      out.push(P({ x: -0.8, z: 15.4, pose: "stand", inst: "bass", look: L(711) }));
      out.push(T(15.8, 1.6, (ctx, cam) => K.drumKit(ctx, cam, 1.6, 15.8)));
      out.push(P({ x: 1.6, z: 16.3, pose: "sit", look: L(712) }));
      out.push(T(15.4, 4.2, (ctx, cam) => K.amp(ctx, cam, 4.6, 15.6)));
      out.push(T(15.0, 4.0, (ctx, cam) => K.chair(ctx, cam, 3.9, 15.0)));
      out.push(P({ x: 3.9, z: 14.8, pose: "sit", inst: "guitar", look: L(713) }));
      for (const [x, z, r] of [[-2.4, 11.0, 0.3], [0.2, 11.0, 0], [2.6, 11.0, -0.3]]) out.push(T(z, x, (ctx, cam) => K.wedge(ctx, cam, x, z, r)));
      return out;
    },
  },
  cme: {
    title: "Commercial Music Ensemble",
    items: () => {
      const out = [];
      out.push(T(17.6, -5.2, (ctx, cam) => K.speakerOnPole(ctx, cam, -6.6, 12.0)));
      out.push(T(17.6, 5.2, (ctx, cam) => K.speakerOnPole(ctx, cam, 6.6, 12.0)));
      out.push(T(16.2, 0, (ctx, cam) => K.drumKit(ctx, cam, 0, 16.2)));
      out.push(P({ x: 0, z: 16.7, pose: "sit", look: L(800, { top: "#1d2a3a" }) }));
      out.push(T(15.6, -2.4, (ctx, cam) => K.amp(ctx, cam, -2.6, 16.0, 0.7, 0.75)));
      out.push(T(15.6, 2.6, (ctx, cam) => K.amp(ctx, cam, 2.8, 16.0, 0.8, 0.9)));
      out.push(P({ x: -2.4, z: 14.6, pose: "stand", inst: "eguitar", look: L(801, { top: "#3a3a40" }) }));
      out.push(P({ x: 2.6, z: 14.6, pose: "stand", inst: "eguitar", color: "#d8d2c0", bass: true, look: L(802, { top: "#5a1e2a" }) }));
      out.push(T(14.4, -5.0, (ctx, cam) => K.keyboard(ctx, cam, -5.0, 14.6)));
      out.push(P({ x: -5.0, z: 15.2, pose: "stand", look: L(803, { top: "#2a3a2a" }) }));
      [-1.0, 1.0].forEach((x, i) => {
        out.push(T(12.1, x, (ctx, cam) => K.micStand(ctx, cam, x + 0.1, 12.0, 1.55)));
        out.push(P({ x, z: 12.4, pose: "stand", inst: "handMic", look: L(804 + i, { top: i ? "#6a2a6a" : "#e8e2d4", long: !i }) }));
      });
      out.push(P({ x: 4.6, z: 13.4, pose: "stand", inst: "trumpet", look: L(806) }));
      for (const [x, z, r] of [[-2.0, 11.2, 0.25], [1.4, 11.2, -0.1], [4.2, 12.0, -0.3]]) out.push(T(z, x, (ctx, cam) => K.wedge(ctx, cam, x, z, r)));
      return out;
    },
  },
  "voice-strings": {
    title: "Singer, string quartet + piano",
    items: () => [
      ...pianoWithPlayer(-1.4, 14.6, 500, { look: { top: "#a85a5a" } }),
      T(12.6, 0.8, (ctx, cam) => K.flowers(ctx, cam, 1.0, 12.6)),
      T(12.4, -0.2, (ctx, cam) => K.stand(ctx, cam, -0.1, 12.3, 1.2)),
      P({ x: -0.1, z: 12.8, pose: "stand", inst: "singFree", look: L(501, { top: "#0c0c10", accent: "#f2f2f2", long: false }) }),
      ...[
        [-3.4, 12.2, "violin"],
        [-2.2, 13.0, "viola"],
        [2.4, 13.0, "cello"],
        [3.4, 12.2, "viola"],
      ].flatMap(([x, z, inst], i) => [
        T(z + 0.05, x, (ctx, cam) => K.chair(ctx, cam, x, z + 0.05)),
        T(z - 0.5, x, (ctx, cam) => K.stand(ctx, cam, x + (x < 0 ? 0.4 : -0.4), z - 0.6, 1.05)),
        P({ x, z, pose: "sit", inst, look: L(510 + i, { long: true }) }),
      ]),
    ],
  },
};

// Moving parts for a program, on their own layers so the renderer can blur
// them over the shutter: a bowing arm, a conductor's beat.
function moverLayers(program, cam, people) {
  const out = [];
  for (const kind of program.movers || []) {
    if (kind === "bow") {
      const v = people.find((p) => p.inst === "violin" && p.bow);
      if (!v) continue;
      const k = cam.scaleAt(v.x, v.z);
      const [fx, fy] = cam.p(v.x, 0, v.z);
      const sh = fy - 1.4 * k;
      out.push({
        id: "bow",
        name: "Bow arm",
        depth: cam.dist(v.x, 1.4, v.z),
        light: "stage",
        motion: { pivot: [fx - 0.2 * k, sh + 0.05 * k], rotBase: 0, rotAmp: 0.32, rotFreq: 0.9, radius: 0.9 * k },
        draw(ctx) {
          ctx.strokeStyle = "#16161a";
          ctx.lineWidth = 0.085 * k;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(fx - 0.2 * k, sh + 0.05 * k);
          ctx.lineTo(fx - 0.38 * k, sh + 0.3 * k);
          ctx.lineTo(fx - 0.05 * k, sh + 0.25 * k);
          ctx.stroke();
          ctx.strokeStyle = "#ece6d4";
          ctx.lineWidth = 0.014 * k;
          ctx.beginPath();
          ctx.moveTo(fx - 0.08 * k, sh + 0.28 * k);
          ctx.lineTo(fx + 0.55 * k, sh + 0.02 * k);
          ctx.stroke();
          circle(ctx, fx - 0.05 * k, sh + 0.26 * k, 0.045 * k, v.look.shade);
        },
      });
    }
    if (kind === "conductor") {
      const c = people.find((p) => p.pose === "conduct");
      if (!c) continue;
      const k = cam.scaleAt(c.x, c.z);
      const [fx, fy] = cam.p(c.x, c.y0 || 0, c.z);
      const sh = fy - 1.4 * k;
      out.push({
        id: "baton",
        name: "Conductor's beat",
        depth: cam.dist(c.x, 1.5, c.z),
        light: "stage",
        motion: { pivot: [fx + 0.21 * k, sh + 0.05 * k], rotBase: 0, rotAmp: 0.4, rotFreq: 1.1, radius: 0.75 * k },
        draw(ctx) {
          ctx.strokeStyle = "#141418";
          ctx.lineWidth = 0.09 * k;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(fx + 0.21 * k, sh + 0.05 * k);
          ctx.lineTo(fx + 0.45 * k, sh - 0.12 * k);
          ctx.lineTo(fx + 0.55 * k, sh - 0.35 * k);
          ctx.stroke();
          ctx.strokeStyle = "#f4f1ea";
          ctx.lineWidth = 0.012 * k;
          ctx.beginPath();
          ctx.moveTo(fx + 0.55 * k, sh - 0.35 * k);
          ctx.lineTo(fx + 0.7 * k, sh - 0.7 * k);
          ctx.stroke();
        },
      });
    }
  }
  return out;
}

function paintingOnScreen(ctx, x, y, w, h) {
  ctx.fillStyle = "#3a2e1e";
  ctx.fillRect(x, y, w, h);
  const r = rng(77);
  for (let n = 0; n < 60; n++) {
    ctx.fillStyle = ["#d8b04a", "#8a5a2a", "#c87a3a", "#5a7a4a", "#e8d8a8", "#a03a2a"][Math.floor(r() * 6)];
    ctx.fillRect(x + r() * w, y + h * 0.2 + r() * h * 0.75, w * 0.04, h * 0.12);
  }
  ctx.fillStyle = "#f4f0e0";
  ctx.fillRect(x + w * 0.15, y + h * 0.06, w * 0.7, h * 0.04);
  ctx.fillRect(x + w * 0.25, y + h * 0.12, w * 0.5, h * 0.03);
}

// ---------- assembling a scene ----------

function bboxOf(people, cam) {
  // Where everyone would be when they stand up to bow, in scene uv.
  let x0 = 1;
  let x1 = 0;
  let y0 = 1;
  let y1 = 0;
  for (const p of people) {
    const y = p.y0 || 0;
    for (const [dx, dy] of [[-0.45, 0], [0.45, 0], [-0.45, 1.85], [0.45, 1.85]]) {
      const [u, v] = cam.uv(p.x + dx, y + dy, p.z);
      x0 = Math.min(x0, u);
      x1 = Math.max(x1, u);
      y0 = Math.min(y0, v);
      y1 = Math.max(y1, v);
    }
  }
  return { x0, x1, y0, y1 };
}

// A generic proscenium auditorium — Memorial Hall-ish, or any rented hall
// you carry the Standard Gear Kit into: a dark house, black masking, warm
// light only on the stage. Average metering hates this room: most of the
// frame is near black, so auto exposure brightens until the performers blow
// out. Same stage coordinates as Salmon, so every program works in both.
function drawAuditorium(ctx, W, H, cam) {
  ctx.fillStyle = "#07070a";
  ctx.fillRect(0, 0, W, H);
  // black masking and a deep red main curtain pulled to the sides
  K.poly(ctx, cam, [[-9, 0, 19.5], [9, 0, 19.5], [9, 9, 19.5], [-9, 9, 19.5]], "#0d0c0f");
  for (const s of [-1, 1]) {
    for (let n = 0; n < 6; n++) {
      const x0 = s * (7.2 + n * 0.32);
      K.poly(ctx, cam, [[x0, 0, 9.2], [x0 + s * 0.32, 0, 9.2], [x0 + s * 0.32, 8.5, 9.2], [x0, 8.5, 9.2]], n % 2 ? "#3a0c12" : "#4c121a");
    }
  }
  // valance across the top of the proscenium
  K.poly(ctx, cam, [[-9.5, 6.4, 9.1], [9.5, 6.4, 9.1], [9.5, 8.6, 9.1], [-9.5, 8.6, 9.1]], "#431018");
  // proscenium frame
  for (const s of [-1, 1]) K.poly(ctx, cam, [[s * 9.4, 0, 9], [s * 12, 0, 9], [s * 12, 9, 9], [s * 9.4, 9, 9]], "#17130f");
  K.poly(ctx, cam, [[-12, 8.6, 9], [12, 8.6, 9], [12, 11, 9], [-12, 11, 9]], "#17130f");
}

function drawAuditoriumFloor(ctx, W, H, cam) {
  // wood stage floor, apron, and the pit edge
  K.poly(ctx, cam, [[-9, 0, 8.4], [9, 0, 8.4], [9, 0, 19.5], [-9, 0, 19.5]], "#5a3a22");
  const r = rng(9);
  ctx.globalAlpha = 0.25;
  for (let x = -9; x < 9; x += 0.18 + r() * 0.05) K.line(ctx, cam, [x, 0.001, 8.4], [x, 0.001, 19.5], "#2a180c", 1);
  ctx.globalAlpha = 1;
  K.poly(ctx, cam, [[-11, 0, 7.6], [11, 0, 7.6], [11, 0, 8.4], [-11, 0, 8.4]], "#3a2616");
  K.poly(ctx, cam, [[-11, -1.2, 7.6], [11, -1.2, 7.6], [11, 0, 7.6], [-11, 0, 7.6]], "#0b0908");
  // the lit acting area (only on the floor)
  const [cx, cy] = cam.p(0, 0, 14);
  ctx.save();
  K.poly(ctx, cam, [[-9, 0, 8.4], [9, 0, 8.4], [9, 0, 19.5], [-9, 0, 19.5]]);
  ctx.clip();
  ctx.fillStyle = rgrad(ctx, cx, cy, 30, 520, [
    [0, "rgba(255,220,170,0.4)"],
    [1, "rgba(255,220,170,0)"],
  ]);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

const ROOMS = {
  salmon: {
    title: "Salmon Recital Hall",
    blurb: "From the booth: the hall's usual static-wide view.",
    walls: drawRoom,
    floor: drawFloor,
    mics: true,
    ev100: (dim) => (dim ? 7.4 : 9.4),
    wallLight: (dim) => (dim ? 0.6 : 0.9),
    awb: { kelvin: 3800, ab: 5, gm: 2 },
  },
  auditorium: {
    title: "Dark auditorium",
    blurb: "A generic proscenium hall with the house lights down — a Standard Gear Kit gig anywhere. Not Salmon: black masking, a dark house.",
    walls: drawAuditorium,
    floor: drawAuditoriumFloor,
    mics: false,
    ev100: (dim) => (dim ? 7 : 8.4),
    wallLight: () => 0.35,
    // Under one warm source, AWB here lands closer to neutral than in Salmon.
    awb: { kelvin: 3500, ab: 2, gm: 1 },
  },
};

export function makeSalmonScene(programId = "piano-solo") {
  return makeHallScene("salmon", programId);
}

// `view` (optional) puts the camera somewhere else and/or draws the hall wider
// than the booth's usual 32 mm: { id, label, cam: { pos, pitchDeg,
// equivFocal }, audience }. The lens-shopping station uses it to show what a
// wide lens sees from the booth and from the center aisle.
export function makeHallScene(roomId, programId = "piano-solo", view = null) {
  const room = ROOMS[roomId];
  const program = PROGRAMS[programId] || PROGRAMS["piano-solo"];
  const camDef = view?.cam || CAM;
  const floorNear = Math.max(7, camDef.pos[2] + 2.5);
  const items = program.items().sort((a, b) => b.z - a.z);
  const people = items.filter((i) => i.person).map((i) => i.person);
  const dim = !!program.dim;
  // A stage with only instruments on it (set-up before a percussion piece)
  // frames and focuses on the instruments instead.
  const framed = people.length ? people : items.map((i) => ({ x: i.x ?? 0, z: i.z }));
  const cam = K.makeCamera(camDef);
  const box = bboxOf(framed, cam);
  const nearest = Math.min(...framed.map((p) => cam.dist(p.x, 1.2, p.z)));
  const farthest = Math.max(...framed.map((p) => cam.dist(p.x, 1.2, p.z)));

  // Split the stage into three depth bands so depth of field still means
  // something at a long lens.
  const bands = [
    { name: "Upstage", test: (z) => z >= 15 },
    { name: "Mid-stage", test: (z) => z >= 13.2 && z < 15 },
    { name: "Downstage", test: (z) => z < 13.2 },
  ];
  const stageLayers = bands
    .map((b, i) => {
      const mine = items.filter((it) => b.test(it.z));
      if (!mine.length) return null;
      const zAvg = mine.reduce((a, it) => a + it.z, 0) / mine.length;
      return {
        id: `stage-${i}`,
        name: `${b.name} performers`,
        depth: cam.dist(0, 1.2, zAvg),
        light: "stage",
        draw(ctx) {
          for (const it of mine) it.draw(ctx, cam);
        },
      };
    })
    .filter(Boolean);

  const audienceRows = [
    { z: 4.6, y: 2.75, xs: [-3.9, -3.2, -2.5, -1.8, -1.1, 1.1, 1.8, 2.5, 3.2, 3.9], empty: 0.45 },
    { z: 3.9, y: 3.15, xs: [-4.2, -3.4, -2.6, -1.8, 1.8, 2.6, 3.4, 4.2], empty: 0.5 },
  ];

  const layers = [
    { id: "room", name: "Hall walls", depth: cam.dist(0, 4, BACK_Z), light: "walls", draw: (ctx, w, h) => room.walls(ctx, w, h, cam, { dim }) },
    {
      id: "floor",
      name: "Stage floor",
      depthRange: { far: cam.dist(0, 0, BACK_Z), near: cam.dist(0, 0, floorNear), vFar: cam.uv(0, 0, BACK_Z)[1], vNear: Math.min(1, cam.uv(0, 0, floorNear)[1]) },
      light: "stage",
      draw: (ctx, w, h) => room.floor(ctx, w, h, cam, { dim }),
    },
    ...stageLayers,
    ...(room.mics ? [{ id: "mics", name: "Hanging mic pair", depth: cam.dist(0, 3.6, 13.5), light: "walls", draw: (ctx, w, h) => drawMics(ctx, w, h, cam), noFocus: true }] : []),
    ...moverLayers(program, cam, people),
    view?.audience === false
      ? null
      : {
          id: "audience",
          name: "Audience",
          depthRange: { far: 5.0, near: 3.4, vFar: 0.85, vNear: 1.0 },
          light: "house",
          draw: (ctx) => K.audience(ctx, cam, audienceRows, programId.length),
        },
  ]
    .filter(Boolean)
    .slice(0, 10);

  const aim = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  return {
    id: view ? `${roomId}-${view.id}-${programId}` : `${roomId}-${programId}`,
    title: view ? `${room.title} — ${program.title}, ${view.label}` : `${room.title} — ${program.title}`,
    room: roomId,
    program: programId,
    blurb: room.blurb,
    // Salmon: F4 · 3 dB · 1/60 on an AX100 is correct exposure (dim programs
    // are two stops darker — that's when you open up).
    ev100: room.ev100(dim),
    equivFocal: camDef.equivFocal,
    maxFrameZoom: 3.5,
    aim,
    framing: box,
    keyLight: "stage",
    awb: room.awb,
    defaults: { fps: 30, shutter: 60, aperture: 4, gainDb: 3, nd: 0, wb: 3200, focus: Math.round((nearest + farthest) / 2) },
    lights: {
      stage: { kelvin: 3200, intensity: 1, label: "Overhead stage lights" },
      walls: { kelvin: 3200, intensity: room.wallLight(dim), label: "Wall wash" },
      house: { kelvin: 3200, intensity: 0.05, label: "House (lights down)" },
    },
    subjects: {
      performers: { label: "the performers", plural: true, depth: (nearest + farthest) / 2 },
      front: { label: "the nearest performer", depth: nearest },
      back: { label: "the back row", depth: farthest },
      wall: { label: "the back wall", depth: cam.dist(0, 4, BACK_Z) },
    },
    camera3d: cam,
    layers,
  };
}

export const SALMON_PROGRAM_IDS = Object.keys(PROGRAMS);

// Salmon drawn wider than any lens Chapman owns (15 mm equivalent), from two
// places a camera could stand: the booth, where the static wide lives, and the
// center aisle a few rows back, and down front at the edge of the stage —
// the closer the camera, the wider the lens it needs. For the lens-shopping
// station.
export const WIDE_VIEWS = [
  { id: "booth15", label: "from the booth", cam: { pos: [0, 5.0, 0], pitchDeg: 14, equivFocal: 15 } },
  { id: "aisle15", label: "from the center aisle", cam: { pos: [0, 1.6, 5.0], pitchDeg: 3, equivFocal: 15 }, audience: false },
  { id: "front15", label: "down front", cam: { pos: [0, 1.3, 7.0], pitchDeg: 2, equivFocal: 15 }, audience: false },
];
export const WIDE_PROGRAM_IDS = ["mariachi", "choir", "chamber-orchestra", "cme"];
