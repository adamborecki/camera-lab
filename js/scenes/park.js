// Sunny Park — bright 5600K daylight. Way too much light for a wide aperture
// at a video shutter speed, which is exactly what ND is for. A spinning
// pinwheel and a bouncing ball for motion; flowers close to camera, trees
// and a skyline far away for depth of field.
import { vgrad, rgrad, ellipse, circle, person, rng } from "./draw.js";

const HORIZON = 330;

export const parkScene = {
  id: "park",
  title: "Sunny Park",
  blurb: "Bright daylight, a spinning pinwheel, a bouncing ball, flowers up close.",
  // Correct exposure (ISO 100) for a sunlit subject. "Sunny 16"-ish.
  ev100: 14,
  equivFocal: 70,
  defaults: { fps: 30, shutter: 60, aperture: 16, iso: 100, nd: 0, wb: 5600, focus: 3 },
  lights: {
    sun: { kelvin: 5600, intensity: 1, label: "Sunlight" },
    sky: { kelvin: 5600, intensity: 1.8, label: "Sky" },
    shade: { kelvin: 7500, intensity: 0.35, label: "Open shade" },
  },
  subjects: {
    person: { label: "the person", depth: 3 },
    pinwheel: { label: "the pinwheel", depth: 2.8 },
    flowers: { label: "the flowers", depth: 1.0 },
    trees: { label: "the trees", depth: 25 },
  },
  layers: [
    {
      id: "sky",
      name: "Sky",
      depth: 1000,
      light: "sky",
      draw(ctx, W) {
        ctx.fillStyle = vgrad(ctx, 0, HORIZON + 40, [
          [0, "#3f7fcf"],
          [1, "#b9d6f0"],
        ]);
        ctx.fillRect(0, 0, W, HORIZON + 40);
        const r = rng(3);
        for (let c = 0; c < 5; c++) {
          const cx = 120 + c * 270 + r() * 60;
          const cy = 70 + r() * 90;
          for (let k = 0; k < 6; k++) circle(ctx, cx + (k - 2.5) * 34, cy + (k % 2) * 10, 30 + r() * 22, "#ffffff");
        }
      },
    },
    {
      id: "far",
      name: "Hills & skyline",
      depth: 90,
      light: "sun",
      draw(ctx, W) {
        const r = rng(11);
        ctx.fillStyle = "#8d9fb3";
        for (let x = 40; x < W; x += 70 + r() * 40) {
          const h = 60 + r() * 110;
          ctx.fillRect(x, HORIZON - h + 20, 46 + r() * 30, h);
        }
        ctx.fillStyle = "#7c9a7a";
        ctx.beginPath();
        ctx.moveTo(0, HORIZON + 40);
        for (let x = 0; x <= W; x += 40) ctx.lineTo(x, HORIZON + 10 - Math.sin(x / 150) * 18 - r() * 8);
        ctx.lineTo(W, HORIZON + 40);
        ctx.fill();
      },
    },
    {
      id: "trees",
      name: "Trees",
      depth: 25,
      light: "sun",
      draw(ctx) {
        const tree = (x, s) => {
          ctx.fillStyle = "#5b4330";
          ctx.fillRect(x - 12 * s, HORIZON - 40 * s, 24 * s, 170 * s);
          const r = rng(Math.round(x));
          for (let k = 0; k < 14; k++) {
            const a = r() * Math.PI * 2;
            const d = r() * 90 * s;
            circle(ctx, x + Math.cos(a) * d, HORIZON - 110 * s + Math.sin(a) * d * 0.7, (40 + r() * 30) * s, k % 3 ? "#3f7a3a" : "#5a9a48");
          }
        };
        tree(90, 1.4);
        tree(330, 1.0);
        tree(1120, 1.6);
        tree(920, 0.9);
      },
    },
    {
      id: "ground",
      name: "Grass",
      depthRange: { far: 60, near: 0.9, vFar: HORIZON / 720 + 0.04, vNear: 1.0 },
      light: "sun",
      draw(ctx, W, H) {
        const top = HORIZON + 28;
        ctx.fillStyle = vgrad(ctx, top, H, [
          [0, "#79a857"],
          [1, "#4f8a36"],
        ]);
        ctx.fillRect(0, top, W, H - top);
        // path
        ctx.fillStyle = "#cdbb98";
        ctx.beginPath();
        ctx.moveTo(W * 0.46, top);
        ctx.lineTo(W * 0.52, top);
        ctx.lineTo(W * 0.8, H);
        ctx.lineTo(W * 0.3, H);
        ctx.closePath();
        ctx.fill();
        const r = rng(5);
        ctx.strokeStyle = "rgba(40,80,30,0.5)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 500; i++) {
          const y = top + r() ** 0.6 * (H - top);
          const x = r() * W;
          const l = 3 + ((y - top) / (H - top)) * 12;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 2, y - l);
          ctx.stroke();
        }
      },
    },
    {
      id: "bench-shade",
      name: "Bench in the shade",
      depth: 12,
      light: "shade",
      draw(ctx) {
        ctx.fillStyle = "#e9e6de";
        ctx.fillRect(980, 400, 170, 16);
        ctx.fillRect(980, 424, 170, 12);
        ctx.fillStyle = "#5b5f66";
        ctx.fillRect(990, 436, 8, 40);
        ctx.fillRect(1132, 436, 8, 40);
      },
    },
    {
      id: "ball",
      name: "Bouncing ball",
      depth: 8,
      light: "sun",
      motion: { pivot: [300, 520], tyAmp: 210, tFreq: 1.1, bounce: true, radius: 34 },
      draw(ctx) {
        circle(ctx, 300, 520, 30, "#e8472f");
        ctx.save();
        ctx.beginPath();
        ctx.arc(300, 520, 30, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = "#f7d33c";
        ctx.fillRect(270, 510, 60, 20);
        ctx.restore();
      },
    },
    {
      id: "person",
      name: "Person",
      depth: 3,
      light: "sun",
      draw(ctx) {
        const r = person(ctx, 780, 140, 1.0, {
          skin: "#a8704f",
          skinLight: "#c38563",
          skinShade: "#7f5139",
          hair: "#22160f",
          jacket: "#f2f0ea",
          shirt: "#dcd8cf",
        });
        // arm up holding the pinwheel stick
        ctx.fillStyle = "#f2f0ea";
        ctx.beginPath();
        ctx.moveTo(660, r.shoulderY + 40);
        ctx.quadraticCurveTo(610, 520, 610, 430);
        ctx.lineTo(645, 420);
        ctx.quadraticCurveTo(660, 480, 700, r.shoulderY + 20);
        ctx.closePath();
        ctx.fill();
        ellipse(ctx, 626, 412, 22, 20, "#a8704f");
        ctx.strokeStyle = "#caa15f";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(626, 420);
        ctx.lineTo(610, 250);
        ctx.stroke();
      },
    },
    {
      id: "pinwheel",
      name: "Pinwheel",
      depth: 2.8,
      light: "sun",
      motion: { pivot: [610, 250], spin: 13, radius: 78 },
      draw(ctx) {
        const colors = ["#e63946", "#f4c430", "#2a9df4", "#3cb371"];
        for (let k = 0; k < 4; k++) {
          ctx.save();
          ctx.translate(610, 250);
          ctx.rotate((k * Math.PI) / 2);
          ctx.fillStyle = colors[k];
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(74, -8);
          ctx.quadraticCurveTo(52, 30, 0, 0);
          ctx.fill();
          ctx.restore();
        }
        circle(ctx, 610, 250, 7, "#fafafa");
      },
    },
    {
      id: "flowers",
      name: "Flowers (close)",
      depth: 1.0,
      light: "sun",
      draw(ctx, W, H) {
        const r = rng(21);
        const bloom = (x, y, c) => {
          ctx.strokeStyle = "#2f6b28";
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(x, H + 10);
          ctx.quadraticCurveTo(x + 20, (y + H) / 2, x, y);
          ctx.stroke();
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            ellipse(ctx, x + Math.cos(a) * 22, y + Math.sin(a) * 22, 20, 12, c, a);
          }
          circle(ctx, x, y, 12, "#f6c343");
        };
        for (let i = 0; i < 6; i++) bloom(20 + i * 42 + r() * 20, H - 60 - r() * 150, i % 2 ? "#f06a9b" : "#fbfbff");
        for (let i = 0; i < 4; i++) bloom(W - 30 - i * 50 - r() * 20, H - 50 - r() * 130, i % 2 ? "#b36bf0" : "#fbfbff");
      },
    },
  ],
};
