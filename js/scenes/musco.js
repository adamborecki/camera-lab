// Musco Center for the Arts — a wind symphony on the big stage, seen from
// the front of house, after the instructor's photo of the booth multiview:
// a blue wash on the upper shell, warm wood below, gold music stands, brass
// and percussion on risers, a conductor on the podium, everyone in black.
//
// Two lighting states of the same stage:
//   concert  — the brightest cue: Musco's house defaults (F5.6 · 0 dB ·
//              A/3200K on the UE150s) are correct exposure here.
//   preshow  — work lights: about two and a third stops darker and a cooler,
//              greener mix. Set exposure here and the concert blows out.
//
// Musco's cameras all look at this one stage from different places; the
// stations fake each position with an aim, a zoom and a parallax shift.
import { vgrad, rgrad, ellipse, rng } from "./draw.js";
import * as K from "./hall-kit.js";

const CAM = { pos: [0, 6.5, -5], pitchDeg: 9.5, equivFocal: 40 };
const BACK_Z = 25;
const SHELL_X = 10.5;
const LIP_Z = 12.5;
const STAND_GOLD = "#c99a3c";

function drawShell(ctx, W, H, cam) {
  ctx.fillStyle = "#08070a";
  ctx.fillRect(0, 0, W, H);
  // wood shell: back wall and splayed side walls, vertical slats
  K.poly(ctx, cam, [[-SHELL_X, 0, BACK_Z], [SHELL_X, 0, BACK_Z], [SHELL_X, 4.2, BACK_Z], [-SHELL_X, 4.2, BACK_Z]], "#a8642c");
  for (const s of [-1, 1]) K.poly(ctx, cam, [[s * SHELL_X, 0, BACK_Z], [s * (SHELL_X + 3), 0, LIP_Z], [s * (SHELL_X + 3), 7, LIP_Z], [s * SHELL_X, 4.2, BACK_Z]], "#94552a");
  const r = rng(21);
  ctx.globalAlpha = 0.35;
  for (let x = -SHELL_X; x < SHELL_X; x += 0.35 + r() * 0.1) K.line(ctx, cam, [x, 0.1, BACK_Z - 0.01], [x, 4.1, BACK_Z - 0.01], "#5a2c10", 1.5);
  ctx.globalAlpha = 1;
  // proscenium edge, dark
  for (const s of [-1, 1]) K.poly(ctx, cam, [[s * (SHELL_X + 3), 0, LIP_Z - 0.1], [s * 20, 0, LIP_Z - 0.1], [s * 20, 14, LIP_Z - 0.1], [s * (SHELL_X + 3), 14, LIP_Z - 0.1]], "#0c0b0d");
}

// The upper shell under the blue LED wash: its own layer, lit by the "cyc"
// light, so it stays blue whatever the camera's white balance does.
function drawCyc(ctx, W, H, cam) {
  K.poly(ctx, cam, [[-SHELL_X, 4.2, BACK_Z], [SHELL_X, 4.2, BACK_Z], [SHELL_X, 11, BACK_Z], [-SHELL_X, 11, BACK_Z]], "#d8dcff");
  for (const s of [-1, 1]) K.poly(ctx, cam, [[s * SHELL_X, 4.2, BACK_Z], [s * (SHELL_X + 3), 7, LIP_Z], [s * (SHELL_X + 3), 12, LIP_Z], [s * SHELL_X, 11, BACK_Z]], "#c4c8f0");
  const [cx, cy] = cam.p(0, 7.5, BACK_Z);
  ctx.fillStyle = rgrad(ctx, cx, cy, 30, 700, [
    [0, "rgba(0,0,0,0)"],
    [1, "rgba(0,0,0,0.55)"],
  ]);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
}

function drawFloor(ctx, W, H, cam) {
  K.poly(ctx, cam, [[-SHELL_X - 3, 0, LIP_Z], [SHELL_X + 3, 0, LIP_Z], [SHELL_X, 0, BACK_Z], [-SHELL_X, 0, BACK_Z]], "#b98a55");
  const r = rng(7);
  ctx.globalAlpha = 0.18;
  for (let x = -13; x < 13; x += 0.22 + r() * 0.05) K.line(ctx, cam, [x, 0.001, LIP_Z], [x * 0.8, 0.001, BACK_Z], "#5a3a1c", 1);
  ctx.globalAlpha = 1;
  const [cx, cy] = cam.p(0, 0, 17);
  ctx.save();
  K.poly(ctx, cam, [[-SHELL_X - 3, 0, LIP_Z], [SHELL_X + 3, 0, LIP_Z], [SHELL_X, 0, BACK_Z], [-SHELL_X, 0, BACK_Z]]);
  ctx.clip();
  ctx.fillStyle = rgrad(ctx, cx, cy, 30, 640, [
    [0, "rgba(255,226,180,0.3)"],
    [1, "rgba(255,226,180,0)"],
  ]);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // risers for the back rows
  for (const [z0, z1, y] of [
    [19.2, 21.0, 0.22],
    [21.0, 23.4, 0.44],
  ]) {
    K.poly(ctx, cam, [[-8.5, y, z0], [8.5, y, z0], [8.5, y, z1], [-8.5, y, z1]], "#9a7444");
    K.poly(ctx, cam, [[-8.5, y - 0.22, z0], [8.5, y - 0.22, z0], [8.5, y, z0], [-8.5, y, z0]], "#2a1e14");
  }
  // the house: rows of dark seats and a few heads below the stage lip
  ctx.fillStyle = vgrad(ctx, cam.p(0, 0, LIP_Z)[1], H, [
    [0, "#0d0c0e"],
    [1, "#050506"],
  ]);
  ctx.fillRect(0, cam.p(0, 0, LIP_Z)[1], W, H);
}

// ---------- the wind symphony ----------
const L = K.lookFor;
const P = (o) => ({ z: o.z, x: o.x, person: o, draw: (ctx, cam) => K.person(ctx, cam, o) });
const T = (z, x, draw) => ({ z, x, draw });

function rowArc(n, x0, x1, z, bow = 0.03) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1);
    out.push([x, z + x * x * bow]);
  }
  return out;
}

function windSymphony() {
  const items = [];
  let seed = 600;
  const seat = (x, z, inst, y0 = 0) => {
    items.push(T(z - 0.55, x, (ctx, cam) => K.stand(ctx, cam, x + 0.12, z - 0.65, 1.0, 0, STAND_GOLD, y0)));
    items.push(P({ x, z, y0, pose: "sit", inst, look: L(seed++, { long: seed % 2 === 0 }) }));
  };
  // front arc: flutes and oboes left, clarinets right
  rowArc(10, -6.4, 6.4, 15.0).forEach(([x, z], i) => seat(x, z, i < 4 ? "flute" : i < 5 ? "oboe" : "clarinet"));
  // second arc: clarinets, saxes, horns
  rowArc(11, -7.2, 7.2, 16.8).forEach(([x, z], i) => seat(x, z, i < 4 ? "clarinet" : i < 7 ? "sax" : "horn"));
  // third arc on the first riser: trumpets, trombones, euphonium, tuba
  rowArc(11, -7.6, 7.6, 19.9, 0.02).forEach(([x, z], i) => seat(x, z, i < 4 ? "trumpet" : i < 8 ? "trombone" : i < 9 ? "euphonium" : "tuba", 0.22));
  // percussion on the top riser
  items.push(T(22.2, -6, (ctx, cam) => K.timpani(ctx, cam, -6.2, 22.2)));
  items.push(T(22.4, -5, (ctx, cam) => K.timpani(ctx, cam, -5.2, 22.6, 0.32)));
  items.push(T(22.6, -3, (ctx, cam) => K.chimes(ctx, cam, -3.2, 22.8, 0.44)));
  items.push(T(22.0, -0.5, (ctx, cam) => K.marimba(ctx, cam, -0.6, 22.2, 2.2, 0)));
  items.push(T(22.6, 2.4, (ctx, cam) => K.bassDrum(ctx, cam, 2.4, 22.6, 0.44)));
  items.push(T(23.0, 4.6, (ctx, cam) => K.gong(ctx, cam, 4.8, 23.0, 0.44)));
  items.push(T(22.0, 6.4, (ctx, cam) => K.drumKit(ctx, cam, 6.4, 22.2)));
  for (const x of [-5.6, -2.6, 0.2, 3.0, 6.0]) items.push(P({ x, z: 22.9, y0: 0.44, pose: "stand", look: L(seed++) }));
  // the conductor, back to the house, on the podium
  items.push(T(13.6, 0, (ctx, cam) => K.poly(ctx, cam, [[-0.6, 0.25, 13.1], [0.6, 0.25, 13.1], [0.6, 0.25, 14.1], [-0.6, 0.25, 14.1]], "#121214")));
  items.push(T(14.15, 0.3, (ctx, cam) => K.stand(ctx, cam, 0.3, 14.2, 1.1, 0, "#141417", 0.25)));
  items.push(P({ x: 0, z: 13.6, y0: 0.25, pose: "conduct", look: L(seed++, { long: false }) }));
  return items;
}

// ---------- assembling ----------
export function makeMuscoScene(state = "concert") {
  const preshow = state === "preshow";
  const cam = K.makeCamera(CAM);
  const items = windSymphony().sort((a, b) => b.z - a.z);
  const people = items.filter((i) => i.person).map((i) => i.person);
  const bands = [
    { name: "Percussion & brass", test: (z) => z >= 19 },
    { name: "Woodwinds & horns", test: (z) => z >= 16 && z < 19 },
    { name: "Front row & conductor", test: (z) => z < 16 },
  ];
  const stageLayers = bands.map((b, i) => {
    const mine = items.filter((it) => b.test(it.z));
    const zAvg = mine.reduce((a, it) => a + it.z, 0) / mine.length;
    return {
      id: `stage-${i}`,
      name: b.name,
      depth: cam.dist(0, 1.2, zAvg),
      light: "stage",
      draw(ctx) {
        for (const it of mine) it.draw(ctx, cam);
      },
    };
  });
  const conductor = people.find((p) => p.pose === "conduct");
  const k = cam.scaleAt(conductor.x, conductor.z);
  const [fx, fy] = cam.p(conductor.x, conductor.y0, conductor.z);
  const sh = fy - 1.4 * k;
  const baton = {
    id: "baton",
    name: "Conductor's beat",
    depth: cam.dist(0, 1.6, conductor.z),
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
  };
  const section = (x0, x1, z0, z1, y = 0) => {
    const a = cam.uv(x0, y, z0);
    const b = cam.uv(x1, y + 1.8, z1);
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const layers = [
    { id: "shell", name: "Stage shell", depth: cam.dist(0, 3, BACK_Z), light: "shell", draw: (ctx, w, h) => drawShell(ctx, w, h, cam) },
    { id: "cyc", name: "Blue wash on the upper shell", depth: cam.dist(0, 8, BACK_Z), light: "cyc", draw: (ctx, w, h) => drawCyc(ctx, w, h, cam) },
    {
      id: "floor",
      name: "Stage floor",
      depthRange: { far: cam.dist(0, 0, BACK_Z), near: cam.dist(0, 0, LIP_Z), vFar: cam.uv(0, 0, BACK_Z)[1], vNear: cam.uv(0, 0, LIP_Z)[1] },
      light: "stage",
      draw: (ctx, w, h) => drawFloor(ctx, w, h, cam),
    },
    ...stageLayers,
    baton,
  ];
  const all = people.map((p) => cam.dist(p.x, 1.2, p.z));
  return {
    id: preshow ? "musco-preshow" : "musco-concert",
    title: preshow ? "Musco — Wind Symphony, work lights (pre-show)" : "Musco — Wind Symphony, concert lighting",
    room: "musco",
    blurb: preshow ? "Pre-show: work lights only." : "The brightest cue of the night.",
    // F5.6 · 0 dB · 1/60 on a UE150 is correct under the concert cue.
    ev100: preshow ? 8.55 : 10.88,
    equivFocal: CAM.equivFocal,
    maxFrameZoom: 3.5,
    aim: [0.5, cam.uv(0, 1.2, 18)[1]],
    keyLight: "stage",
    defaults: { fps: 30, shutter: 60, aperture: 5.6, gainDb: 0, nd: 0, wb: 3200, wbMode: "indoor", focus: 20 },
    lights: preshow
      ? {
          stage: { kelvin: 4300, intensity: 1, tint: [0.97, 1.03, 0.98], label: "Work lights" },
          shell: { kelvin: 4300, intensity: 0.7, tint: [0.97, 1.03, 0.98], label: "Work lights on the shell" },
          cyc: { kelvin: 4300, intensity: 0.25, label: "Shell (no wash)" },
        }
      : {
          stage: { kelvin: 3200, intensity: 1, label: "Concert lighting (brightest cue)" },
          shell: { kelvin: 3200, intensity: 0.55, label: "Shell wash" },
          cyc: { kelvin: 6500, intensity: 0.9, tint: [0.35, 0.45, 1.9], label: "Blue LED wash" },
        },
    subjects: {
      performers: { label: "the ensemble", plural: true, depth: (Math.min(...all) + Math.max(...all)) / 2 },
      conductor: { label: "the conductor", depth: cam.dist(0, 1.4, conductor.z) },
      percussion: { label: "the percussion", plural: true, depth: cam.dist(0, 1.4, 22.6) },
    },
    // where each section sits in the picture — stations aim cameras at these
    sections: {
      flutes: section(-6.6, -3.4, 15, 15),
      clarinets: section(1.4, 6.6, 15, 15),
      horns: section(3.5, 7.4, 17, 17),
      brass: section(-7.6, 0, 20, 20, 0.22),
      percussion: section(-6.5, 6.5, 22.5, 22.5, 0.44),
      conductor: section(-0.8, 0.8, 13.6, 13.6, 0.25),
    },
    camera3d: cam,
    layers,
  };
}
