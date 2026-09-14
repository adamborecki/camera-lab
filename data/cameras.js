// Camera bodies. Pure data: sensor, lens range, how gain / ND / shutter are
// labeled, and which HUD style (js/ui/hud.js) draws the on-screen display.
// Add a body by adding an entry — nothing else needs to change.
//
// sensor.crop          vs. full frame (36mm wide). Sets the hidden focal
//                      length needed to match a scene's framing, which is
//                      what makes small sensors show deeper depth of field.
// sensor.fullWell /    electrons per displayed pixel at base gain, and read
//   readNoise          noise. Bigger sensors collect more light → cleaner.
// gain.mode            "iso" (ISO numbers) or "db" (camcorder gain). 0 dB is
//                      treated as gain.baseIso. 6 dB ≈ 1 stop.
// nd.kind              "internal" (built-in wheel/switch), "external"
//                      (screw-on filters named by filter factor), or "none".

const STANDARD_SHUTTERS = [
  8, 15, 24, 25, 30, 40, 48, 50, 60, 80, 100, 120, 125, 160, 200, 250, 320, 400, 500, 640, 800,
  1000, 1250, 1600, 2000,
];

const EXTERNAL_ND = [
  { stops: 0, label: "No filter" },
  { stops: 1, label: "ND2" },
  { stops: 2, label: "ND4" },
  { stops: 3, label: "ND8" },
  { stops: 4, label: "ND16" },
  { stops: 5, label: "ND32" },
  { stops: 6, label: "ND64" },
];

export const cameras = [
  {
    id: "lab",
    name: "Camera Lab S35",
    blurb: "A generic Super 35 cinema-style camera. ISO, internal ND, every setting available.",
    sensor: { name: "Super 35", crop: 1.5, fullWell: 24000, readNoise: 4 },
    aperture: { min: 1.4, max: 16 },
    gain: { mode: "iso", baseIso: 100, min: 100, max: 12800 },
    shutters: STANDARD_SHUTTERS,
    shutterDisplay: "fraction",
    fps: [24, 25, 30, 50, 60],
    nd: {
      kind: "internal",
      steps: [
        { stops: 0, label: "CLEAR" },
        { stops: 1, label: "ND 0.3" },
        { stops: 2, label: "ND 0.6" },
        { stops: 3, label: "ND 0.9" },
        { stops: 4, label: "ND 1.2" },
        { stops: 5, label: "ND 1.5" },
        { stops: 6, label: "ND 1.8" },
      ],
    },
    hud: "lab",
  },
  {
    id: "ax100",
    name: "Sony FDR-AX100",
    blurb: "4K Handycam with a 1-inch sensor. Gain in dB, ND switch OFF / 1 / 2 / 3.",
    sensor: { name: '1.0" type', crop: 2.7, fullWell: 8000, readNoise: 3 },
    aperture: { min: 2.8, max: 11 },
    gain: { mode: "db", baseIso: 100, step: 3, max: 33 },
    shutters: [8, 15, 30, 60, 90, 100, 120, 125, 180, 250, 350, 500, 725, 1000, 1500, 2000, 3000, 4000, 6000, 10000],
    shutterDisplay: "denominator",
    fps: [24, 30, 60],
    // Sony's manual: ND 1, 2, 3 cut light to about 1/4, 1/16, 1/64.
    nd: {
      kind: "internal",
      steps: [
        { stops: 0, label: "OFF" },
        { stops: 2, label: "ND1", detail: "1/4" },
        { stops: 4, label: "ND2", detail: "1/16" },
        { stops: 6, label: "ND3", detail: "1/64" },
      ],
    },
    hud: "sony",
  },
  {
    id: "g50",
    name: "Canon VIXIA HF G50",
    blurb: "Small-sensor 4K camcorder. Gain 0–24 dB in 1 dB steps; deep depth of field.",
    sensor: { name: '1/2.3" type', crop: 5.6, fullWell: 3000, readNoise: 3 },
    aperture: { min: 2.8, max: 8 },
    gain: { mode: "db", baseIso: 100, step: 1, max: 24 },
    shutters: [
      8, 10, 12, 15, 20, 24, 25, 30, 40, 48, 50, 60, 75, 90, 100, 120, 150, 180, 250, 300, 360, 500, 600,
      720, 1000, 1200, 1400, 1700, 2000,
    ],
    shutterDisplay: "fraction",
    fps: [24, 30, 60],
    // The G50's ND is Automatic / Off only — no manual strengths to choose.
    nd: { kind: "none", steps: [{ stops: 0, label: "OFF" }] },
    hud: "canon",
  },
  {
    id: "gh5",
    name: "Panasonic GH5",
    blurb: "Micro Four Thirds mirrorless. ISO from 200, no built-in ND — screw-on filters.",
    sensor: { name: "Micro Four Thirds", crop: 2.0, fullWell: 12000, readNoise: 3 },
    aperture: { min: 2.8, max: 22 },
    gain: { mode: "iso", baseIso: 200, min: 200, max: 12800 },
    shutters: STANDARD_SHUTTERS,
    shutterDisplay: "fraction",
    fps: [24, 25, 30, 50, 60],
    nd: { kind: "external", steps: EXTERNAL_ND },
    hud: "lumix",
  },
  {
    id: "ff",
    name: "Full-Frame Mirrorless",
    blurb: "A generic full-frame body. Big sensor: shallowest focus, cleanest high ISO.",
    sensor: { name: "Full frame", crop: 1.0, fullWell: 48000, readNoise: 4 },
    aperture: { min: 1.4, max: 22 },
    gain: { mode: "iso", baseIso: 100, min: 100, max: 25600 },
    shutters: STANDARD_SHUTTERS,
    shutterDisplay: "fraction",
    fps: [24, 25, 30, 50, 60],
    nd: { kind: "external", steps: EXTERNAL_ND },
    hud: "alpha",
  },
];

export function getCamera(id) {
  return cameras.find((c) => c.id === id) || cameras[0];
}
