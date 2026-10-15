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
// lens (optional)      the zoom lens on a real body, in 35mm-EQUIVALENT mm:
//                      { name, wide, tele, apWide, apTele }. A camcorder's
//                      widest f-number gets slower as it zooms in (AX100:
//                      f/2.8 wide, f/4.5 tele), so the iris can't open past
//                      maxApertureAt(focal). Generic bodies leave it out and
//                      can frame anything the scene allows.
// wbShift (optional)   fine color trim on top of kelvin: { ab: max steps on
//                      the amber–blue axis, gm: max steps green–magenta,
//                      style: how the body writes it ("sony" A5 G2,
//                      "lumix" B4 G/M0) }.
// colorBias            how this body's color science leans, as RGB gains
//                      on a correctly white-balanced picture. ILLUSTRATIVE,
//                      not measured: small enough to see side by side, which
//                      is the point — two brands at the same kelvin don't
//                      quite match, and matching is done by eye, not by number.
// verify               open questions about this body, listed in the README.

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
    // Sony spec sheet: f=9.3–111.6 mm, 29.0–348.0 mm equivalent (16:9),
    // F2.8–F4.5; manual iris F2.8–F11.
    lens: { name: "Zeiss Vario-Sonnar T* 12×", wide: 29, tele: 348, apWide: 2.8, apTele: 4.5 },
    wbShift: { ab: 7, gm: 7, style: "sony" },
    colorBias: [1, 1, 1],
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
    // Canon spec sheet: f/1.8–2.8, 29.3–601 mm equivalent in UHD 4K (IS off).
    aperture: { min: 1.8, max: 8 },
    lens: { name: "Canon 20× zoom", wide: 29.3, tele: 601, apWide: 1.8, apTele: 2.8 },
    colorBias: [1.01, 1, 0.99],
    gain: { mode: "db", baseIso: 100, step: 1, max: 24 },
    shutters: [
      8, 10, 12, 15, 20, 24, 25, 30, 40, 48, 50, 60, 75, 90, 100, 120, 150, 180, 250, 300, 360, 500, 600,
      720, 1000, 1200, 1400, 1700, 2000,
    ],
    shutterDisplay: "fraction",
    fps: [24, 30, 60],
    // Canon lists a built-in multi-strength ND; this sim treats it as
    // automatic only (no strength you pick). Unverified: whether the body
    // offers manual ND steps.
    nd: { kind: "none", steps: [{ stops: 0, label: "OFF" }] },
    hud: "canon",
  },
  {
    id: "gh5",
    name: "Panasonic GH5",
    blurb: "Micro Four Thirds mirrorless. ISO from 200, no built-in ND — screw-on filters.",
    sensor: { name: "Micro Four Thirds", crop: 2.0, fullWell: 12000, readNoise: 3 },
    // The lens Chapman's GH5s wear: Lumix G Vario 14–140mm f/3.5–5.6
    // (28–280 mm equivalent). Nothing wider is owned yet — see the lens
    // coverage tool for candidates.
    aperture: { min: 3.5, max: 22 },
    lens: { name: "Lumix G Vario 14–140mm f/3.5–5.6", wide: 28, tele: 280, apWide: 3.5, apTele: 5.6 },
    wbShift: { ab: 9, gm: 9, style: "lumix" },
    colorBias: [1.025, 1.01, 0.965],
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
    colorBias: [1, 1, 1],
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

// Salmon Recital Hall's installed PTZ cameras. Run from AJA RovoControl on
// the booth Mac; in a normal gig nobody touches exposure, and the hall's
// static wide runs on auto white balance — which is why the AX100 backup has
// its own Salmon numbers (3800K A5 G2) to match it.
export const rovocam = {
  id: "rovocam",
  name: "AJA RovoCam",
  blurb: "Installed PTZ camera, 1/2.3-inch sensor, 20× zoom. Controlled from RovoControl, not from the camera.",
  // AJA spec sheet: Sony FCB-ER8300 block, 1/2.3" CMOS, iris F1.8–2.0 per
  // AJA (unverified at tele). RovoControl shows iris to F14, gain 0–33 dB.
  sensor: { name: '1/2.3" type', crop: 5.6, fullWell: 3000, readNoise: 3 },
  aperture: { min: 1.8, max: 14 },
  lens: { name: "20× zoom block", wide: 25, tele: 500, apWide: 1.8, apTele: 2.0 },
  gain: { mode: "db", baseIso: 100, step: 3, max: 33 },
  shutters: [30, 60, 90, 100, 120, 125, 180, 250, 350, 500, 725, 1000, 1500, 2000, 3000, 4000, 6000, 10000],
  shutterDisplay: "fraction",
  fps: [30, 60],
  nd: { kind: "none", steps: [{ stops: 0, label: "OFF" }] },
  colorBias: [0.99, 1, 1.01],
  hud: "clean",
  hidden: true,
};

// Musco Center's PTZ cameras, run from a Panasonic AW-RP150 controller in the
// booth (js/ui/rp150-panel.js). Specs from Panasonic retail listings: 1-type
// 4K MOS sensor, 20× zoom, 8.8–176 mm = 24.5–490 mm equivalent, F2.8–4.5,
// gain to 42 dB. `shading` = the controller's R/B gain and pedestal ranges
// (unverified — teaching values).
export const ue150 = {
  id: "ue150",
  name: "Panasonic AW-UE150",
  blurb: "Musco's PTZ cameras: 1-inch sensor, 20× zoom, shaded from the RP150 controller.",
  sensor: { name: '1.0" type', crop: 2.7, fullWell: 8000, readNoise: 3 },
  aperture: { min: 2.8, max: 11 },
  lens: { name: "20× zoom", wide: 24.5, tele: 490, apWide: 2.8, apTele: 4.5 },
  gain: { mode: "db", baseIso: 100, step: 3, max: 42 },
  shutters: [60, 100, 120, 250, 500, 1000, 2000],
  shutterDisplay: "fraction",
  fps: [30, 60],
  nd: { kind: "none", steps: [{ stops: 0, label: "OFF" }] },
  shading: { gain: 200, ped: 200 },
  colorBias: [1, 1, 1],
  hud: "clean",
  hidden: true,
};

export const allCameras = [...cameras, rovocam, ue150];

export function getCamera(id) {
  return allCameras.find((c) => c.id === id) || cameras[0];
}
