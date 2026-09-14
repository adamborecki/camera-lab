// Concert Stage — a singer under a tungsten spotlight, a drummer behind,
// par cans on the truss, a mic stand close to camera. Low light, lots of
// depth (1.3 m → 12 m), fast drumsticks, bright lamps that clip and bloom
// into bokeh.
import { vgrad, hgrad, rgrad, ellipse, circle, rrect, person, rng } from "./draw.js";

const LAMPS_WARM = [150, 330, 520, 890, 1080];
const LAMPS_BLUE = [240, 720, 1180];
const TRUSS_Y = 70;

export const stageScene = {
  id: "stage",
  title: "Concert Stage",
  blurb: "Singer in a tungsten spotlight, drummer behind, lamps on the truss.",
  // Correct exposure (ISO 100) for the singer's face under the spotlight.
  ev100: 6,
  equivFocal: 85,
  defaults: { fps: 30, shutter: 60, aperture: 2.8, iso: 800, nd: 0, wb: 3200, focus: 2.5 },
  lights: {
    spot: { kelvin: 3200, intensity: 1, label: "Tungsten spotlight" },
    wash: { kelvin: 3200, intensity: 0.32, label: "Stage wash" },
    back: { kelvin: 3200, intensity: 0.1, label: "Backdrop spill" },
    lamp: { kelvin: 3200, intensity: 26, label: "Par cans" },
    led: { kelvin: 6500, intensity: 16, tint: [0.35, 0.55, 1.7], label: "Blue LED pars" },
    beam: { kelvin: 3200, intensity: 0.6, label: "Haze beams" },
  },
  // Named things students can be asked to focus on.
  subjects: {
    singer: { label: "the singer", depth: 2.5 },
    drummer: { label: "the drummer", depth: 6.5 },
    mic: { label: "the mic stand", depth: 1.3 },
    lamps: { label: "the stage lights", depth: 10 },
  },
  layers: [
    {
      id: "backdrop",
      name: "Backdrop & truss",
      depth: 12,
      light: "back",
      draw(ctx, W, H) {
        // velvet curtain folds
        for (let x = 0; x < W; x += 64) {
          ctx.fillStyle = hgrad(ctx, x, x + 64, [
            [0, "#2a1418"],
            [0.5, "#6b2f37"],
            [1, "#2a1418"],
          ]);
          ctx.fillRect(x, 0, 64, H);
        }
        ctx.fillStyle = vgrad(ctx, 0, H, [
          [0, "rgba(0,0,0,0.55)"],
          [0.5, "rgba(0,0,0,0)"],
          [1, "rgba(0,0,0,0.3)"],
        ]);
        ctx.fillRect(0, 0, W, H);
        // truss
        ctx.fillStyle = "#3a3a3e";
        ctx.fillRect(0, TRUSS_Y - 22, W, 12);
        ctx.fillRect(0, TRUSS_Y + 14, W, 12);
        ctx.strokeStyle = "#48484e";
        ctx.lineWidth = 5;
        for (let x = 0; x < W; x += 36) {
          ctx.beginPath();
          ctx.moveTo(x, TRUSS_Y - 12);
          ctx.lineTo(x + 36, TRUSS_Y + 16);
          ctx.stroke();
        }
      },
    },
    {
      id: "lamps-warm",
      name: "Par cans (tungsten)",
      depth: 10,
      light: "lamp",
      draw(ctx) {
        for (const x of LAMPS_WARM) {
          ellipse(ctx, x, TRUSS_Y + 36, 22, 20, "rgba(40,36,34,1)");
          circle(ctx, x, TRUSS_Y + 38, 15, "#fff1dc");
          circle(ctx, x, TRUSS_Y + 38, 26, "rgba(255,230,190,0.08)");
        }
      },
    },
    {
      id: "lamps-led",
      name: "LED pars (blue)",
      depth: 10,
      light: "led",
      draw(ctx) {
        for (const x of LAMPS_BLUE) {
          ellipse(ctx, x, TRUSS_Y + 34, 20, 18, "rgba(30,30,34,1)");
          circle(ctx, x, TRUSS_Y + 36, 13, "#ffffff");
        }
      },
    },
    {
      id: "beams",
      name: "Haze beams",
      depth: 9,
      light: "beam",
      add: true,
      draw(ctx, W, H) {
        for (const x of LAMPS_WARM) {
          const tx = x + (x < W / 2 ? 120 : -120);
          const g = ctx.createLinearGradient(x, TRUSS_Y, tx, H * 0.8);
          g.addColorStop(0, "rgba(255,236,205,0.35)");
          g.addColorStop(1, "rgba(255,236,205,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x - 10, TRUSS_Y + 40);
          ctx.lineTo(x + 10, TRUSS_Y + 40);
          ctx.lineTo(tx + 110, H * 0.85);
          ctx.lineTo(tx - 110, H * 0.85);
          ctx.closePath();
          ctx.fill();
        }
      },
    },
    {
      id: "floor",
      name: "Stage floor",
      depthRange: { far: 12, near: 1.2, vFar: 0.6, vNear: 1.0 },
      light: "wash",
      draw(ctx, W, H) {
        const top = H * 0.6;
        ctx.fillStyle = vgrad(ctx, top, H, [
          [0, "#2c2420"],
          [1, "#4a3c33"],
        ]);
        ctx.fillRect(0, top, W, H - top);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 2;
        for (let i = -12; i <= 12; i++) {
          ctx.beginPath();
          ctx.moveTo(W / 2 + i * 40, top);
          ctx.lineTo(W / 2 + i * 190, H);
          ctx.stroke();
        }
        // spill pool from the spotlight
        ctx.fillStyle = rgrad(ctx, 880, H * 0.93, 10, 330, [
          [0, "rgba(170,140,110,0.9)"],
          [1, "rgba(170,140,110,0)"],
        ]);
        ctx.fillRect(0, top, W, H - top);
      },
    },
    {
      id: "drums",
      name: "Drummer & kit",
      depth: 6.5,
      light: "wash",
      draw(ctx) {
        person(ctx, 430, 250, 0.55, {
          skin: "#8d5a3f",
          skinLight: "#a36d4f",
          skinShade: "#6b412d",
          hair: "#1a1310",
          jacket: "#23252b",
          shirt: "#3d4250",
        });
        // cymbals
        ellipse(ctx, 250, 330, 78, 12, "#c9a24a", -0.12);
        ellipse(ctx, 620, 315, 86, 13, "#d4ad55", 0.1);
        ctx.fillStyle = "#6c6c70";
        ctx.fillRect(247, 330, 5, 200);
        ctx.fillRect(617, 318, 5, 210);
        // toms
        ellipse(ctx, 370, 425, 46, 30, "#8b1e2b");
        ellipse(ctx, 370, 410, 46, 16, "#e8e2d6");
        ellipse(ctx, 500, 420, 50, 32, "#8b1e2b");
        ellipse(ctx, 500, 404, 50, 17, "#e8e2d6");
        // bass drum
        circle(ctx, 435, 520, 98, "#7a1826");
        circle(ctx, 435, 520, 86, "#efe9dd");
        ctx.fillStyle = "#1c1c1c";
        ctx.font = "bold 30px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("MUS 248", 435, 530);
        // snare
        ellipse(ctx, 300, 470, 44, 14, "#dcd6c8");
        ctx.fillStyle = "#9aa0a8";
        ctx.fillRect(256, 470, 88, 26);
      },
    },
    {
      id: "stick-r",
      name: "Drumstick (right)",
      depth: 6.4,
      light: "wash",
      motion: { pivot: [505, 372], rotBase: -0.35, rotAmp: 0.55, rotFreq: 3.2, radius: 120 },
      draw(ctx) {
        ctx.strokeStyle = "#f3e2b8";
        ctx.lineWidth = 11;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(505, 372);
        ctx.lineTo(620, 372);
        ctx.stroke();
        circle(ctx, 505, 372, 13, "#8d5a3f");
      },
    },
    {
      id: "stick-l",
      name: "Drumstick (left)",
      depth: 6.4,
      light: "wash",
      motion: { pivot: [360, 380], rotBase: 0.3, rotAmp: 0.5, rotFreq: 3.2, rotPhase: Math.PI, radius: 120 },
      draw(ctx) {
        ctx.strokeStyle = "#f3e2b8";
        ctx.lineWidth = 11;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(360, 380);
        ctx.lineTo(250, 400);
        ctx.stroke();
        circle(ctx, 360, 380, 13, "#8d5a3f");
      },
    },
    {
      id: "singer",
      name: "Singer",
      depth: 2.5,
      light: "spot",
      motion: { pivot: [880, 900], rotAmp: 0.025, rotFreq: 0.35, radius: 820 },
      draw(ctx) {
        const r = person(ctx, 880, 150, 1.15, {
          skin: "#c98f6c",
          skinLight: "#e0a784",
          skinShade: "#9c6649",
          hair: "#3b2416",
          jacket: "#1d1d24",
          shirt: "#f4f1ea",
          mouthOpen: true,
        });
        // arm + hand bringing the mic up
        ctx.fillStyle = "#1d1d24";
        ctx.beginPath();
        ctx.moveTo(720, r.shoulderY + 80);
        ctx.quadraticCurveTo(700, 560, 790, 520);
        ctx.lineTo(815, 470);
        ctx.quadraticCurveTo(760, 470, 770, r.shoulderY + 60);
        ctx.closePath();
        ctx.fill();
        // microphone
        ctx.save();
        ctx.translate(815, 420);
        ctx.rotate(-0.5);
        ctx.fillStyle = "#1a1a1a";
        rrect(ctx, -9, 0, 18, 110, 7);
        ctx.fill();
        ctx.fillStyle = "#9da3a8";
        ctx.beginPath();
        ctx.arc(0, -4, 21, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ellipse(ctx, 812, 478, 26, 22, "#c98f6c");
      },
    },
    {
      id: "mic-stand",
      name: "Mic stand & wedge",
      depth: 1.3,
      light: "wash",
      intensity: 0.9,
      draw(ctx, W, H) {
        // floor wedge monitor
        ctx.fillStyle = "#1e1e20";
        ctx.beginPath();
        ctx.moveTo(-20, H);
        ctx.lineTo(40, H - 150);
        ctx.lineTo(420, H - 120);
        ctx.lineTo(460, H);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#2f3033";
        ctx.beginPath();
        ctx.moveTo(60, H - 138);
        ctx.lineTo(400, H - 112);
        ctx.lineTo(420, H - 20);
        ctx.lineTo(40, H - 20);
        ctx.closePath();
        ctx.fill();
        const r = rng(7);
        ctx.fillStyle = "#26272a";
        for (let i = 0; i < 160; i++) circle(ctx, 70 + r() * 330, H - 120 + r() * 95, 3, "#232427");
        // boom stand
        ctx.strokeStyle = "#101012";
        ctx.lineWidth = 14;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(560, H + 10);
        ctx.lineTo(560, 300);
        ctx.lineTo(330, 210);
        ctx.stroke();
        ctx.fillStyle = "#101012";
        rrect(ctx, 300, 186, 60, 40, 10);
        ctx.fill();
        circle(ctx, 560, 300, 14, "#3a3a3e");
        // gaffer tape label on the stand
        ctx.fillStyle = "#e9e4d4";
        ctx.fillRect(548, 470, 24, 60);
      },
    },
  ],
};
