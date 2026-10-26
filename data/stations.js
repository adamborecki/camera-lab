// Course content: every station is data consumed by the same lab view
// (js/lab/lab-view.js). To add one, copy an entry and change it.
//
//  mode       "guided" (steps), "challenge" (brief + criteria), "playground"
//  group      floor section: one of SECTIONS below (learn / go-further /
//             play / finish) — nothing gates a later section on an earlier
//             one finishing; grouping is for homework chunking and page
//             layout only, not a progression lock. It's independent of
//             `mode`: Homework 2 holds both guided stations and challenges.
//  scene      scene id (js/scenes); camera: camera id (data/cameras.js)
//  start      starting settings (iso: or gainDb:, shutter: denominator …)
//  controls   dials the student can use; locked: shown but not adjustable
//  tools      { available: [...], on: [...] } — see TOOL_INFO in js/ui/tools.js
//  steps      guided: { text, when(ctx) → bool, done, notYet?, hint?, enter? }
//             `when` is only ever evaluated when the student presses the
//             Check button — never automatically on every dial nudge — so
//             idly passing through the right value isn't declared a win.
//             `done` shows on success. `notYet` shows on a failed check —
//             a string, or fn(ctx) → string to point at whichever part of a
//             compound condition is still off (see "triangle" below); falls
//             back to a generic line when omitted. enter can switch
//             { scene, settings, camera, unlock, tool }.
//  criteria   challenge: checks from js/lab/feedback.js — ranges, never one
//             magic answer
//  ctx        { settings, derived, camera, scene, stats, touchedKeys } —
//             touchedKeys is the Set of control names touched since this
//             step began (see exposure-triangle below), for steps that care
//             which dial was tried, not just where it ended up.
import { checks } from "../js/lab/feedback.js";
import { effectiveWb, frameCenter } from "../js/sim/camera-model.js";
import { getCamera } from "./cameras.js";

// Floor sections, in display order. Rename the label text freely (e.g. to
// match an actual Canvas assignment name each term) — station.group values
// elsewhere in this file must keep matching the id on the left.
export const SECTIONS = [
  ["learn", "Homework 1 — Exposure Basics"],
  ["go-further", "Homework 2 — Go Further"],
  ["hw3", "Homework 3 — Standard Gear Kit & Salmon"],
  ["hw4", "Homework 4 — Musco: Many Cameras, One Look"],
  ["play", "Free play"],
  ["finish", "Finish"],
];

const near0 = (c, tol = 0.4) => Math.abs(c.derived.exposureStops) <= tol;
const angleOk = (c) => c.derived.shutterAngle >= 150 && c.derived.shutterAngle <= 220;
const sharp = (c, key) => {
  const d = c.scene.subjects[key].depth;
  return d >= c.derived.dofNear * 0.98 && d <= c.derived.dofFar * 1.02;
};

// Musco's PTZ cameras, all UE150s on one RP150. Positions are faked with an
// aim, a zoom and a sideways shift. Numbering follows the multiview as the
// instructor gave it (Oct 17): 2 static wide, 5 conductor cam, 7 backstage,
// 8 PowerPoint/video, and 1, 3, 4, 6 the close-ups (two per operator). The
// conductor cam faces the other way and isn't simulated. The numbers are the
// Panasonic cameras' own, the same on the RP150 and the multiview.
const MUSCO_START = { fps: 30, aperture: 5.6, gainDb: 0, shutter: 60, wb: 3200, wbMode: "indoor", focus: 22 };
const MUSCO_POS = {
  1: { label: "Camera 1 · flutes, house left", aim: [0.25, 0.68], focal: 140, angle: { shift: -1.4, aimDepth: 20 } },
  2: { label: "Camera 2 · static wide", aim: [0.5, 0.6], focal: 40, readOnly: true },
  3: { label: "Camera 3 · center, over the conductor", aim: [0.5, 0.6], focal: 100, angle: { shift: 0.2, aimDepth: 22 } },
  4: { label: "Camera 4 · brass, house left", aim: [0.34, 0.58], focal: 135, angle: { shift: -1.8, aimDepth: 24 } },
  6: { label: "Camera 6 · horns & percussion, house right", aim: [0.7, 0.6], focal: 125, angle: { shift: 1.6, aimDepth: 23 } },
};
function MUSCO_RIGS(off = {}) {
  return Object.entries(MUSCO_POS).map(([id, p]) => ({
    id,
    label: p.label,
    name: `Camera ${id}`,
    camera: "ue150",
    aim: p.aim,
    angle: p.angle,
    readOnly: !!p.readOnly,
    start: { ...MUSCO_START, focal: p.focal, ...(off[id] || {}) },
  }));
}
// Lens Shopping: is everyone (standing to bow) inside the frame, and which
// GH5 lens is the longest that still gets them all in from here?
const LENSES = ["gh5-14-140", "gh5-12-60", "gh5-9-18", "gh5-7-5"];
function inFrame(scene, view) {
  const b = scene.framing;
  const half = 0.5 / view.zoom;
  const pad = 0.01 / view.zoom;
  return b.x0 >= view.x - half + pad && b.x1 <= view.x + half - pad && b.y0 >= view.y - half + pad && b.y1 <= view.y + half - pad;
}
const widestOf = (scene, camera) => Math.max(camera.lens.wide, scene.equivFocal);
export function lensFits(scene, camera) {
  const zoom = widestOf(scene, camera) / scene.equivFocal;
  return inFrame(scene, { ...frameCenter(scene.aim, zoom, scene.maxFrameZoom), zoom });
}
export function bestLens(scene) {
  const fit = LENSES.map(getCamera).filter((c) => lensFits(scene, c));
  return fit.reduce((a, c) => (!a || c.lens.wide > a.lens.wide ? c : a), null);
}
const atWidest = (c) => c.settings.focal <= widestOf(c.scene, c.camera) + 0.5;
const mm = (c) => `${Math.round(c.settings.focal)} mm`;
const lensName = (cam) => cam.name.replace(/^GH5 \+ /, "").replace(/ \(owned\)$/, "");
const pickedBest = (c) => inFrame(c.scene, c.view) && c.camera.id === bestLens(c.scene)?.id;
const pickNotYet = (c) => {
  if (!inFrame(c.scene, c.view)) return "Someone's cut off. Zoom out (W), or try a wider lens from the Camera menu.";
  const best = bestLens(c.scene);
  if (best && c.camera.lens.wide < best.lens.wide) return "Everyone fits — but a lens that doesn't go quite as wide would fit them too, and make them bigger. Try another.";
  return "Try another lens from the Camera menu.";
};
const alsoFit = (c, best) =>
  LENSES.map(getCamera)
    .filter((x) => x.id !== best.id && lensFits(c.scene, x))
    .map(lensName);

export const stations = [
  // ---------------- learn ----------------
  {
    id: "exposure-triangle",
    title: "The Exposure Triangle",
    purpose: "Three different controls, one shared job: brightness.",
    group: "learn",
    accent: "#FFB4A2",
    mode: "guided",
    scene: "stage",
    camera: "lab",
    start: { aperture: 4, iso: 400, shutter: 60, fps: 30, focus: 2.5, wb: 3200 },
    controls: ["aperture", "shutter", "iso"],
    tools: { available: ["meter", "hud"], on: ["meter", "hud"] },
    intro: "Three controls decide how bright your video looks. Try each one — the meter shows what happened.",
    steps: [
      {
        text: "<strong>Aperture</strong> is the size of the lens opening. Move the aperture wheel and watch the meter.",
        when: (c) => c.touchedKeys.has("aperture"),
        notYet: "Move the aperture wheel first, then check again.",
        done: "A bigger opening (smaller f-number) lets in more light. That's the first leg of the triangle.",
      },
      {
        text: "<strong>Shutter speed</strong> is how long each frame collects light. Move the shutter wheel.",
        when: (c) => c.touchedKeys.has("shutter"),
        notYet: "Move the shutter wheel first, then check again.",
        done: "A slower shutter (like 1/30 instead of 1/125) leaves the sensor open longer, so more light gets in. That's the second leg.",
      },
      {
        text: "<strong>ISO</strong> (called gain on some cameras) doesn't collect more light — it amplifies whatever the sensor already captured. Move the ISO wheel.",
        when: (c) => c.touchedKeys.has("gainStops"),
        notYet: "Move the ISO wheel first, then check again.",
        done: "Higher ISO brightens the picture electronically, no extra light required. That's the third leg — and its cost is noise, which you'll see in the ISO station.",
      },
      {
        text: "All three — aperture, shutter, and ISO — change exposure. Use any combination you like to bring the meter close to <strong>0</strong>, then check.",
        when: (c) => Math.abs(c.derived.exposureStops) <= 0.5,
        notYet: "Check the exposure meter — it's not close enough to 0 yet.",
        done: "That's the exposure triangle: three separate controls that all affect brightness, but each one also does something else — aperture changes depth of field, shutter changes motion blur, ISO changes noise. The next few stations dig into each one on its own.",
      },
    ],
  },
  {
    id: "aperture",
    title: "Aperture",
    purpose: "The lens opening: more light — and less in focus.",
    group: "learn",
    accent: "#7CE0FF",
    mode: "guided",
    scene: "stage",
    camera: "lab",
    start: { aperture: 4, iso: 800, shutter: 60, fps: 30, focus: 2.5, wb: 3200 },
    controls: ["aperture"],
    tools: { available: ["meter", "dof", "hud"], on: ["meter", "hud"] },
    intro: "Only the aperture ring works here. Watch the brightness <em>and</em> the drummer behind the singer.",
    steps: [
      {
        text: "The singer looks a bit dark. Open the aperture to <strong>f/2.8</strong>.",
        hint: "Smaller f-number = bigger opening. Drag the wheel left or tap − .",
        when: (c) => c.settings.aperture <= 2.8,
        done: "+1 stop: about twice as much light. Now look behind the singer — the drummer got blurrier. A wider aperture means a shallower depth of field, so more of the background falls out of focus.",
      },
      {
        text: "Open all the way to <strong>f/1.4</strong>.",
        when: (c) => c.settings.aperture <= 1.4,
        done: "Two more stops — now it's too bright, and the background has melted into blur. Wide aperture = shallow depth of field.",
      },
      {
        text: "Close down to <strong>f/8</strong> and watch the drummer and the lights sharpen up. Try the <strong>Focus map</strong> tool.",
        when: (c) => c.settings.aperture >= 8,
        done: "Deeper depth of field — but the picture got dark. Aperture trades light against how much is in focus.",
      },
      {
        text: "Find the aperture that exposes the singer well (meter near <strong>0</strong>).",
        when: (c) => near0(c),
        done: "That's aperture: one ring controls both exposure and depth of field.",
      },
    ],
  },
  {
    id: "shutter",
    title: "Shutter & Motion",
    purpose: "How long each frame is exposed — brightness and motion blur.",
    group: "learn",
    accent: "#FF7CD6",
    mode: "guided",
    scene: "park",
    camera: "lab",
    start: { aperture: 5.6, iso: 100, nd: 3, shutter: 60, fps: 30, focus: 3, wb: 5600 },
    controls: ["shutter"],
    locked: ["fps"],
    tools: { available: ["meter", "shutter", "magnify", "hud"], on: ["meter", "shutter", "hud"] },
    intro: "Frame rate is locked at 30p. Keep your eyes on the spinning pinwheel and the bouncing ball.",
    steps: [
      {
        text: "Slow the shutter to <strong>1/30</strong>.",
        when: (c) => c.settings.shutter <= 30,
        done: "+1 stop brighter, and the pinwheel smears into a disc: each frame now records 1/30 s of movement (a 360° shutter).",
      },
      {
        text: "Now go fast: <strong>1/500</strong> or faster.",
        when: (c) => c.settings.shutter >= 500,
        done: "The blades freeze crisp in every frame, so motion looks jumpy — and you lost about 3 stops of light.",
      },
      {
        text: "Try <strong>1/8</strong>. Watch how often the picture updates.",
        when: (c) => c.settings.shutter <= 10,
        done: "Each exposure now lasts longer than a frame (1/30 s), so the camera repeats frames: smeary <em>and</em> choppy.",
      },
      {
        text: "Back to natural motion: pick the shutter that makes a <strong>180°</strong> shutter at 30p.",
        hint: "Rule of thumb: 1 ÷ (2 × frame rate).",
        when: angleOk,
        done: "1/60 at 30p = 180°. That's the conventional motion look for video.",
      },
    ],
  },
  {
    id: "iso",
    title: "ISO & Gain",
    purpose: "Amplifying the signal: brighter, but noisier.",
    group: "learn",
    accent: "#FFD166",
    mode: "guided",
    scene: "stage",
    camera: "lab",
    start: { aperture: 2.8, iso: 100, shutter: 60, fps: 30, focus: 2.5, wb: 3200 },
    controls: ["iso"],
    tools: { available: ["meter", "magnify", "hud"], on: ["meter", "hud"] },
    intro: "Aperture and shutter are set. The only thing left is gain.",
    steps: [
      {
        text: "Way too dark. Raise the ISO until the meter reads about <strong>0</strong>.",
        when: (c) => near0(c),
        done: "ISO 800 = +3 stops of gain. No extra light reached the sensor — the signal was amplified.",
      },
      {
        text: "Crank it to <strong>ISO 6400</strong>, then turn on <strong>Magnify</strong> and look at the singer's face.",
        when: (c) => c.settings.gainStops >= 5.99,
        done: "Brighter — and grainy. Gain amplifies the noise along with the picture.",
      },
      {
        text: "Go back to the <strong>lowest ISO</strong> that still gives a good exposure.",
        when: (c) => near0(c) && c.settings.gainStops <= 3.01,
        done: "Rule of thumb: get light from the lens and the lighting first; add gain last.",
      },
    ],
  },
  {
    id: "triangle",
    title: "Same Brightness, Different Picture",
    purpose: "Equivalent exposures: trade aperture, shutter and ISO.",
    group: "learn",
    accent: "#B88CFF",
    mode: "guided",
    scene: "stage",
    camera: "lab",
    start: { aperture: 4, iso: 1600, shutter: 60, fps: 30, focus: 2.5, wb: 3200 },
    controls: ["aperture", "shutter", "iso"],
    tools: { available: ["meter", "dof", "shutter", "magnify", "hud"], on: ["meter", "hud"] },
    intro: "Exposure is right. Now change <em>how</em> the picture looks without changing its brightness.",
    steps: [
      {
        text: "Blur the drummer more: open to <strong>f/2.8 or wider</strong>, then use another setting to bring the meter back near <strong>0</strong>.",
        when: (c) => c.settings.aperture <= 2.8 && near0(c),
        notYet: (c) => (c.settings.aperture > 2.8 ? "Open the aperture to f/2.8 or wider first." : "Aperture's open, but the exposure meter isn't near 0 yet — adjust shutter or ISO to compensate."),
        done: "Equivalent exposure: same brightness, shallower depth of field.",
      },
      {
        text: "Freeze the sticks: <strong>1/250 or faster</strong> — still with the meter near 0.",
        when: (c) => c.settings.shutter >= 250 && near0(c),
        notYet: (c) => (c.settings.shutter < 250 ? "Speed the shutter up to 1/250 or faster first." : "Shutter's fast enough, but the meter isn't near 0 — compensate with aperture or ISO."),
        done: "The faster shutter cost light; you paid it back with aperture or gain. Every choice has a side effect.",
      },
      {
        text: "Now the cleanest picture: natural motion (<strong>~180°</strong>), meter near 0, and <strong>ISO 400 or lower</strong>.",
        when: (c) => near0(c, 0.5) && angleOk(c) && c.settings.gainStops <= 2.01,
        notYet: (c) =>
          !angleOk(c)
            ? "Get the shutter angle close to 180° first (check the Shutter angle tool)."
            : c.settings.gainStops > 2.01
              ? "ISO is still above 400 — bring it down and make up the light elsewhere."
              : "Motion and ISO look right, but the exposure meter isn't near 0 yet.",
        done: "Wide open for light, 180° for motion, minimal gain — a classic low-light setup.",
      },
    ],
  },
  {
    id: "framerate",
    title: "Frame Rate + Shutter",
    purpose: "Why the “right” shutter speed depends on the frame rate.",
    group: "learn",
    accent: "#8CE8C4",
    mode: "guided",
    scene: "park",
    camera: "lab",
    start: { fps: 24, shutter: 30, aperture: 5.6, iso: 100, nd: 3, focus: 3 },
    controls: ["fps", "shutter"],
    tools: { available: ["shutter", "meter", "hud"], on: ["shutter", "hud"] },
    intro: "Watch the pinwheel. Shutter <em>angle</em> = how much of each frame's time the shutter is open.",
    steps: [
      {
        text: "At <strong>24p</strong>, set the shutter that gives a <strong>180°</strong> shutter.",
        hint: "1 ÷ (2 × 24) = 1/48. Cameras often offer 1/48 or 1/50.",
        when: (c) => c.settings.fps === 24 && angleOk(c),
        done: "1/48 (or 1/50) at 24p ≈ 180° — the film-style look.",
      },
      {
        text: "Switch to <strong>60p</strong> and pick the matching 180° shutter.",
        when: (c) => c.settings.fps === 60 && angleOk(c),
        done: "Double the frame rate → double the shutter speed (1/120 or 1/125).",
      },
      {
        text: "Still at 60p, try <strong>1/60</strong>.",
        when: (c) => c.settings.fps === 60 && c.settings.shutter === 60,
        done: "At 60p, 1/60 is a 360° shutter — it never closes. Smoother, smearier motion: a very ‘video’ look.",
      },
      {
        text: "Finish at <strong>30p</strong> with natural motion.",
        when: (c) => c.settings.fps === 30 && angleOk(c),
        done: "30p + 1/60. You now know the rule: shutter ≈ 1 ÷ (2 × fps), and when to break it.",
      },
    ],
  },
  {
    id: "wb",
    title: "White Balance",
    purpose: "Telling the camera what color “white” light is.",
    group: "go-further",
    accent: "#FFA36C",
    mode: "guided",
    scene: "stage",
    camera: "lab",
    start: { aperture: 2.8, iso: 800, shutter: 60, fps: 30, focus: 2.5, wb: 5600 },
    controls: ["wb"],
    tools: { available: ["hud"], on: ["hud"] },
    intro: "Look at the singer's white shirt and the drum heads.",
    steps: [
      {
        text: "The stage is lit by tungsten lamps (about <strong>3200K</strong>), but the camera is set for daylight (5600K). Dial white balance to match the lights.",
        when: (c) => Math.abs(c.settings.wb - 3200) <= 250,
        done: "Whites look white again. White balance cancels the color of the light.",
      },
      {
        text: "Overshoot: go down to <strong>2200K</strong>.",
        when: (c) => c.settings.wb <= 2400,
        done: "Too far — now it's blue. The camera is “correcting” orange that isn't there.",
      },
      {
        enter: { scene: "park", settings: { wb: 3200 } },
        text: "Outside in the sun with the camera still at 3200K. Fix it.",
        when: (c) => Math.abs(c.settings.wb - 5600) <= 300,
        done: "Daylight ≈ 5600K. Match white balance to the <em>light</em>, not to what the scene looks like.",
      },
    ],
  },
  {
    id: "nd",
    title: "ND Filters",
    purpose: "Sunglasses for the lens: less light, nothing else changes.",
    group: "go-further",
    accent: "#6FA8FF",
    mode: "guided",
    scene: "park",
    camera: "lab",
    start: { aperture: 2.8, iso: 100, shutter: 60, fps: 30, nd: 0, focus: 3, wb: 5600 },
    controls: ["nd", "aperture"],
    tools: { available: ["meter", "dof", "zebras", "hud"], on: ["meter", "hud"] },
    intro: "We want f/2.8 for a soft background and 1/60 for natural motion. ISO is already at its lowest.",
    steps: [
      {
        text: "Blown out! Add ND until the meter reads about <strong>0</strong>.",
        when: (c) => near0(c, 0.5) && c.settings.aperture <= 2.8,
        done: "About 5 stops of ND — and the shutter, aperture and ISO didn't change. Soft background kept.",
      },
      {
        text: "Compare: set ND back to <strong>CLEAR</strong> and fix exposure with the <strong>aperture</strong> instead.",
        when: (c) => c.settings.nd === 0 && near0(c, 0.5),
        done: "Same brightness — but at f/16 the trees are sharp and the soft background is gone. That's why ND exists.",
      },
    ],
  },
  {
    id: "focus",
    title: "Focus & Depth of Field",
    purpose: "Pick what's sharp — and how much around it stays sharp.",
    group: "go-further",
    accent: "#FF8A8A",
    mode: "guided",
    scene: "stage",
    camera: "lab",
    start: { aperture: 1.4, iso: 200, shutter: 60, fps: 30, focus: 1.3, wb: 3200 },
    controls: ["focus", "aperture", "iso"],
    tools: { available: ["dof", "peaking", "magnify", "meter", "hud"], on: ["dof", "hud"] },
    intro: "Tap the picture to focus, or turn the focus wheel.",
    steps: [
      {
        text: "Focus is on the mic stand. <strong>Tap the singer</strong> to focus on them.",
        when: (c) => sharp(c, "singer"),
        done: "Focus sits at one distance. Nearer and farther things fall off.",
      },
      {
        text: "<strong>Rack focus</strong> to the drummer.",
        when: (c) => sharp(c, "drummer"),
        done: "A focus pull moves the audience's attention without a cut.",
      },
      {
        text: "Get <strong>both</strong> the singer and the drummer sharp at once.",
        hint: "Close the aperture down and put focus between them (around 3–4 m). Raise ISO if it gets too dark.",
        when: (c) => sharp(c, "singer") && sharp(c, "drummer"),
        done: "Stopping down stretches the depth of field around the focus distance.",
      },
    ],
  },
  {
    id: "sensor",
    title: "Sensor Size",
    purpose: "Full frame vs. crop vs. camcorder — same lens, different slice of the picture.",
    group: "go-further",
    accent: "#C3F584",
    mode: "guided",
    scene: "stage",
    camera: "ff",
    cameraChoice: true,
    start: { aperture: 2.8, iso: 800, shutter: 60, fps: 30, focus: 2.5, wb: 3200 },
    controls: ["aperture", "zoom"],
    tools: { available: ["dof", "meter", "hud"], on: ["dof", "hud"] },
    intro:
      "A lens throws a circle of light out the back; the sensor records only the part of it that it covers. A smaller sensor covers less — so it keeps the middle and throws the rest away.",
    steps: [
      {
        text: "Full-frame, 85mm, f/2.8: the singer is sharp and the drummer is soft. Leave the lens alone and switch the camera to the <strong>Canon VIXIA HF G50</strong>.",
        when: (c) => c.camera.id === "g50",
        done: "The shot jumped way in — and nobody touched the zoom. The G50's 1/2.3-inch chip covers a much smaller patch of the same image circle, so it keeps the middle. That's <em>crop factor</em>: 5.6× on this body. (The sim's zoom stops at 3×, so it shortened the lens to keep the shot inside the scene — a real G50 at 85mm would be tighter still.)",
      },
      {
        text: "Comparing cameras only means something at the same framing. <strong>Zoom out to the wide end</strong> until the shot matches the full-frame one.",
        hint: "The zoom dial reads the real millimetres on the barrel first, then what they'd be on full frame.",
        when: (c) => c.derived.frameZoom <= 1.05,
        notYet: (c) => `Still ${c.derived.frameZoom.toFixed(1)}× tighter than the full-frame shot — keep zooming out.`,
        done: "Same framing, same f/2.8 — and now the drummer is sharp too. Matching that framing on a tiny sensor takes a ~15mm lens instead of an 85mm one, and short lenses have enormous depth of field. <em>That's</em> why camcorder footage looks like everything is in focus: not the sensor on its own, but the short lens a small sensor forces on you.",
      },
      {
        text: "Now the <strong>Sony FDR-AX100</strong> (1-inch sensor), again matched to the same framing.",
        when: (c) => c.camera.id === "ax100" && c.derived.frameZoom <= 1.05,
        notYet: (c) =>
          c.camera.id !== "ax100" ? "Switch the camera to the Sony FDR-AX100." : "Match the framing first — zoom back out to the wide end.",
        done: "In between: a 2.7× crop, so roughly a 31mm lens for this shot, and a depth of field between the other two. Its gain reads in dB and its ND switch reads ND1/ND2/ND3.",
      },
      {
        text: "Finish back on <strong>Full-Frame</strong>, same framing again, and look at the drummer. (The <strong>Panasonic GH5</strong>'s Micro Four Thirds sensor sits between the two — worth a look on the way.)",
        when: (c) => c.camera.id === "ff" && c.derived.frameZoom <= 1.05,
        notYet: (c) => (c.camera.id !== "ff" ? "Switch back to the Full-Frame Mirrorless." : "Zoom back out to the wide end to match the framing."),
        done: "One shot, one f-stop, four sensor sizes. Two things move together: the bigger the sensor, the longer the lens you need for the same shot — and the shallower the depth of field that lens gives you. That's most of what people mean by the ‘cinematic’ look.",
      },
    ],
  },

  // ------- homework 2, part two: challenges -------
  // Same section as the guided stations above — learn the four topics, then
  // apply the lot — these just run in challenge mode: a brief and
  // range-based criteria instead of steps.
  {
    id: "low-light",
    title: "Low-Light Concert",
    purpose: "Noisy, smeary, soft. Fix the shot within the rules.",
    group: "go-further",
    accent: "#FF6B9A",
    mode: "challenge",
    scene: "stage",
    camera: "lab",
    cameraChoice: true,
    // Not the GH5: with the department's f/3.5–5.6 kit zoom it can't get
    // enough light at ISO 800 on this stage — true of the real camera too.
    cameras: ["lab", "ax100", "g50", "ff"],
    start: { fps: 30, shutter: 15, aperture: 5.6, iso: 6400, focus: 5, wb: 3200 },
    controls: ["shutter", "aperture", "iso", "focus"],
    locked: ["fps"],
    tools: { available: ["histogram", "zebras", "waveform", "magnify", "hud"], on: ["hud"] },
    brief: "You're filming a singer at 30 fps. The footage is noisy, the drums smear, and something else is off.",
    goals: ["Good exposure on the singer", "Natural-looking motion", "No higher than ISO 800 / 18 dB", "Singer in focus"],
    criteria: [checks.exposure(-0.7, 0.7), checks.shutterAngle(120, 250), checks.maxIso(800), checks.inFocus("singer")],
  },
  {
    id: "bright-day",
    title: "Sunny Day, Soft Background",
    purpose: "Shallow focus in blazing sun — without breaking motion.",
    group: "go-further",
    accent: "#FFD166",
    mode: "challenge",
    scene: "park",
    camera: "lab",
    cameraChoice: true,
    cameras: ["lab", "ax100", "gh5", "ff"],
    start: { fps: 30, shutter: 60, aperture: 16, iso: 100, nd: 0, focus: 3, wb: 5600 },
    controls: ["aperture", "shutter", "iso", "nd", "focus"],
    tools: { available: ["histogram", "zebras", "dof", "hud"], on: ["hud"] },
    brief: "A client wants the person sharp against soft, blurry trees. It's a bright sunny day and you're shooting 30p.",
    goals: ["Person sharp", "Trees soft", "Natural-looking motion", "Good exposure"],
    criteria: [
      checks.inFocus("person"),
      checks.blurred("trees", 5.5),
      checks.shutterAngle(120, 250),
      checks.exposure(-0.7, 0.7, {
        bright: "Closing the aperture or speeding up the shutter would undo the soft trees or the natural motion — tap the <strong>ND filter</strong> tab and add ND instead. It cuts light and changes nothing else.",
      }),
    ],
  },
  {
    id: "full-camera",
    title: "Full Camera: Everything's Wrong",
    purpose: "Someone left the camera on crazy settings. Diagnose and fix.",
    group: "go-further",
    accent: "#7CE0FF",
    mode: "challenge",
    scene: "stage",
    camera: "lab",
    cameraChoice: true,
    start: { fps: 30, shutter: 1000, aperture: 11, iso: 100, nd: 2, wb: 5600, focus: 1.3 },
    controls: ["aperture", "shutter", "iso", "nd", "fps", "wb", "focus"],
    tools: { available: ["histogram", "waveform", "zebras", "peaking", "magnify", "hud"], on: ["hud"] },
    brief: "You walk up to the concert camera five minutes before downbeat. Nothing is set right.",
    goals: ["Usable exposure", "Natural motion for the frame rate", "Reasonable noise (ISO 1600 / 24 dB max)", "Correct color", "Singer in focus"],
    criteria: [checks.exposure(-0.7, 0.7), checks.shutterAngle(120, 250), checks.maxIso(1600), checks.wbNear(3200, 400), checks.inFocus("singer")],
  },

  // ---------------- homework 3: Standard Gear Kit & Salmon ----------------
  // Warm-ups first (spaced retrieval of HW1–2 on a random body each time),
  // then the AX100 as it really works, framing a static wide, matching
  // cameras, and the Salmon livestream. The finale puts two AX100s in a
  // generic hall the way a Standard Gear Kit gig does.
  {
    id: "warmup-dark-stage",
    title: "Warm-up: Dark Stage, Mystery Camera",
    purpose: "Refresher — a random body each time. Fix exposure, motion and focus.",
    group: "hw3",
    accent: "#FFB4A2",
    mode: "challenge",
    scene: "stage",
    cameraPool: ["g50", "gh5", "ax100", "lab"],
    start: { fps: 30, shutter: 250, aperture: 8, gainDb: 0, iso: 100, focus: 1.3, wb: 3200 },
    controls: ["aperture", "shutter", "iso", "focus"],
    locked: ["fps"],
    tools: { available: ["meter", "histogram", "zebras", "magnify", "hud"], on: ["hud"] },
    brief: "Refresher from Homework 1. You've been handed a camera — a different one each time you open this — and it's set for somewhere much brighter. Get the singer usable before downbeat.",
    goals: ["Good exposure on the singer", "Natural motion at 30p", "No more gain than ISO 1600 / 24 dB", "Singer in focus"],
    criteria: [checks.exposure(-0.7, 0.7), checks.shutterAngle(120, 250), checks.maxIso(1600), checks.inFocus("singer")],
  },
  {
    id: "warmup-sunny",
    title: "Warm-up: Left on Indoor",
    purpose: "Refresher — the last person shot a recital. You're outside.",
    group: "hw3",
    accent: "#FFD166",
    mode: "challenge",
    scene: "park",
    cameraPool: ["ax100", "gh5", "lab", "ff"],
    start: { fps: 30, shutter: 60, aperture: 2.8, iso: 400, gainDb: 3, nd: 0, focus: 3, wb: 3200 },
    controls: ["aperture", "shutter", "iso", "nd", "wb", "focus"],
    tools: { available: ["meter", "histogram", "zebras", "hud"], on: ["hud"] },
    brief: "Refresher from Homework 2. This camera was last used at a recital and nobody reset it. Now it's a bright afternoon outdoors, and you want natural motion.",
    goals: ["Good exposure", "White balance for daylight", "Natural motion at 30p", "Person in focus"],
    criteria: [checks.exposure(-0.7, 0.7), checks.wbNear(5600, 400), checks.shutterAngle(120, 250), checks.inFocus("person")],
  },
  {
    id: "warmup-two-sharp",
    title: "Warm-up: Two Things Sharp",
    purpose: "Refresher — depth of field on whatever sensor you're handed.",
    group: "hw3",
    accent: "#FF8A8A",
    mode: "challenge",
    scene: "stage",
    cameraPool: ["g50", "ax100", "gh5"],
    start: { fps: 30, shutter: 60, aperture: 2.8, iso: 800, gainDb: 9, focus: 1.3, wb: 3200 },
    controls: ["aperture", "iso", "focus"],
    tools: { available: ["meter", "dof", "magnify", "hud"], on: ["hud"] },
    brief: "Refresher from Homework 2. Singer and drummer both need to be sharp, and the shot still has to be exposed. How hard that is depends on the sensor you got.",
    goals: ["Singer sharp", "Drummer sharp", "Good exposure", "Gain no higher than ISO 3200 / 30 dB"],
    criteria: [
      // Students focused on the singer (2.4–2.5 m); every pass focused at
      // 3.2–3.4 m. Full tip once, so it isn't printed twice when both miss.
      checks.inFocus("singer", { tip: "Focus between them, not on the singer." }),
      checks.inFocus("drummer", { tip: "Focus <em>between</em> them, about a third of the way back from the singer: depth of field reaches further behind the focus point than in front of it." }),
      checks.exposure(-0.7, 0.7),
      checks.maxIso(3200),
    ],
    passNote:
      "Deep depth of field costs light. Stopping down far enough for both meant a lot of gain — around 24 dB on the AX100, ISO 3200 on the GH5: allowed, but you can see the noise. A smaller sensor gets there more cheaply (the G50 passes at about f/2.5 and 11 dB). On a real gig the fixes are more light, or choosing which one stays sharp.",
  },
  {
    id: "ax100-out-of-bag",
    title: "The AX100, For Real",
    purpose: "The Standard Gear Kit camera's own buttons: auto vs manual, the MANUAL ring, house default.",
    group: "hw3",
    accent: "#7CE0FF",
    mode: "guided",
    scene: "auditorium-voice-strings",
    camera: "ax100",
    bodyControls: true,
    start: { fps: 30, shutter: 60, aperture: 2.8, gainDb: 12, focal: 40, wb: 3200, wbMode: "auto", auto: { aperture: true, shutter: true, gainStops: true, focus: true } },
    tools: { available: ["meter", "zebras", "waveform", "hud"], on: ["meter", "hud"] },
    intro: "These are the AX100's real controls: tap a value on the touchscreen (or the matching side button), then turn the <strong>MANUAL ring</strong>.",
    steps: [
      {
        text: "This AX100 just came out of the bag on full auto — see the <strong>A</strong> next to IRIS, SHUTTER and GAIN. On the Meter, the white needle judges the performers; the <strong>blue</strong> line is the camera's own meter. Let auto settle for a second, turn on <strong>Zebras</strong> (an exposure tool: stripes on anything about to blow out), then Check.",
        when: (c) => c.touchedKeys.has("tool:zebras"),
        notYet: "Turn on Zebras (under the picture) and look at the singer.",
        done: (c) =>
          ["aperture", "shutter", "gainStops"].some((k) => c.settings.auto?.[k])
            ? "Stripes on the performers: blown out. Yet the camera's meter says it's fine — it averages the <em>whole frame</em>, and this hall is mostly dark, so it brightens until the average looks gray. That's why concert cameras never run on auto."
            : "You've already taken exposure off auto, so the stripes may be gone. On full auto they're all over the performers: the camera's meter averages the <em>whole frame</em>, this hall is mostly dark, so it brightens until the average looks gray. That's why concert cameras never run on auto.",
      },
      {
        text: "Take IRIS off auto: tap <strong>IRIS</strong> on the screen (or press the IRIS button on the side). The A goes away and the value freezes.",
        when: (c) => !c.settings.auto?.aperture,
        notYet: "IRIS still shows an A. Tap it once.",
        done: "Manual iris, held at the value auto had picked.",
      },
      {
        text: "Now do the same for <strong>SHUTTER</strong> and <strong>GAIN</strong>.",
        when: (c) => !c.settings.auto?.shutter && !c.settings.auto?.gainStops && !c.settings.auto?.aperture,
        notYet: (c) => `Still on auto: ${["aperture", "shutter", "gainStops"].filter((k) => c.settings.auto?.[k]).map((k) => ({ aperture: "IRIS", shutter: "SHUTTER", gainStops: "GAIN" })[k]).join(", ")}. (Careful: tapping a selected item again puts it back on auto.)`,
        done: "No more A's — the camera won't change anything behind your back.",
      },
      {
        text: "Dial in the house default with the MANUAL ring: <strong>F4.0 · 3 dB · 1/60</strong>. Tap an item to select it, then turn the ring.",
        when: (c) => c.settings.aperture === 4 && Math.abs(c.settings.gainStops - 0.5) < 0.01 && c.settings.shutter === 60,
        notYet: (c) =>
          [c.settings.aperture !== 4 && `iris is F${c.settings.aperture.toFixed(1)}`, Math.abs(c.settings.gainStops - 0.5) >= 0.01 && "gain isn't 3 dB", c.settings.shutter !== 60 && `shutter is ${c.settings.shutter}`]
            .filter(Boolean)
            .join(", ") + " — keep going.",
        done: "F4.0 · 3 dB · 1/60: the house default. Notice the white needle, though.",
      },
      {
        text: "The house default is a <em>starting point</em>, set for Salmon. This hall is darker. Bring the performers to about <strong>0</strong> on the white needle — keep 1/60 and stay at 9 dB or less.",
        when: (c) => Math.abs(c.derived.exposureStops) <= 0.5 && c.settings.shutter === 60 && c.settings.gainStops <= 1.51 && !["aperture", "shutter", "gainStops"].some((k) => c.settings.auto?.[k]),
        notYet: (c) =>
          c.settings.shutter !== 60
            ? "Keep the shutter at 1/60 — fix brightness with the iris first, then gain."
            : c.settings.gainStops > 1.51
              ? "That's more gain than you need — open the iris instead."
              : "Not at 0 yet. Open the iris first (it's free); add gain only if the iris is wide open.",
        done: "You probably opened to F2.8 — the widest this lens gets at this zoom (zoom in and the AX100 can't open that far). Set the house default, then correct to the room: that's the job.",
      },
      {
        text: "White balance: press <strong>WB</strong>, choose <strong>Color Temp</strong>, and turn the ring to <strong>3200K</strong>. No shift. (Indoor is also 3200K.)",
        when: (c) => {
          const wb = effectiveWb(c.settings, c.scene);
          return c.settings.wbMode !== "auto" && Math.abs(wb.kelvin - 3200) <= 50 && !wb.ab && !wb.gm;
        },
        notYet: (c) =>
          c.settings.wbMode === "auto"
            ? "Still on auto white balance (AWB on the screen). Press WB."
            : `The camera is applying ${Math.round(effectiveWb(c.settings, c.scene).kelvin)}K${c.settings.wbAB || c.settings.wbGM ? " with a shift" : ""} — you want 3200K, no shift.`,
        done: "3200K: the default for a Standard Gear Kit gig anywhere. Salmon is the one exception — that's a later station.",
      },
      {
        text: "Last: make sure autofocus is on (<strong>AF/MF</strong>), so the stage stays sharp without anyone touching the camera.",
        when: (c) => !!c.settings.auto?.focus,
        notYet: "The screen shows MF. Press AF/MF.",
        done: "House-ready: manual F-stop, gain and shutter, 3200K, AF. That's the AX100 checklist. AF is the default for a wide from far away. The exception: if the show has a blackout, focus, then switch to MF — AF can hunt when the lights come back.",
      },
    ],
  },
  {
    id: "ax100-double-press",
    title: "The AX100 Traps",
    purpose: "The double press and the MANUAL button — and how to get back.",
    group: "hw3",
    accent: "#FF7CD6",
    mode: "guided",
    scene: "auditorium-chamber-orchestra",
    camera: "ax100",
    bodyControls: true,
    start: { fps: 30, shutter: 60, aperture: 2.8, gainDb: 3, focal: 36, wb: 3200, auto: { focus: true } },
    tools: { available: ["meter", "zebras", "hud"], on: ["meter", "hud"] },
    intro: "The camera is set right. Now break it the two ways people really do — on purpose, so you recognize them.",
    steps: [
      {
        text: "Tap <strong>GAIN</strong> on the screen once (it turns orange — selected). Then tap <strong>GAIN</strong> again.",
        when: (c) => !!c.settings.auto?.gainStops,
        notYet: "Tap GAIN twice: once to select, once more.",
        done: "GAIN shows an A: the second press handed it back to auto. Easy to do by accident while adjusting — and auto gain in a dark hall means noise you didn't choose.",
      },
      {
        text: "Get it back: tap <strong>GAIN</strong> once (manual again, at whatever auto picked), then set <strong>3 dB</strong> with the ring.",
        when: (c) => !c.settings.auto?.gainStops && Math.abs(c.settings.gainStops - 0.5) < 0.01,
        notYet: (c) => (c.settings.auto?.gainStops ? "GAIN still has its A. Tap it once." : "Manual — now turn the ring to 3 dB."),
        done: "Back in manual at 3 dB.",
      },
      {
        text: "Now press the <strong>MANUAL</strong> button on the side panel. Watch the picture and both meter needles.",
        when: (c) => c.touchedKeys.has("manual-button") && ["aperture", "shutter", "gainStops"].every((k) => c.settings.auto?.[k]),
        notYet: "Press MANUAL (side panel). If you pressed it twice, press it once more.",
        done: "All three went to A at once, and the camera is brightening the stage until the dark hall averages out to gray. One button, and your whole setup is gone.",
      },
      {
        text: "Recover: iris, shutter and gain back to manual, performers near <strong>0</strong> on the white needle, <strong>1/60</strong>, gain <strong>9 dB</strong> or less.",
        when: (c) => !["aperture", "shutter", "gainStops"].some((k) => c.settings.auto?.[k]) && Math.abs(c.derived.exposureStops) <= 0.5 && c.settings.shutter === 60 && c.settings.gainStops <= 1.51,
        notYet: (c) =>
          ["aperture", "shutter", "gainStops"].some((k) => c.settings.auto?.[k])
            ? "Something still shows an A. (Pressing MANUAL again locks all three at what auto chose — then fix the values.)"
            : c.settings.shutter !== 60
              ? "Shutter back to 1/60."
              : c.settings.gainStops > 1.51
                ? "Less gain — open the iris instead."
                : "Exposure isn't at 0 yet.",
        done: "Recovered. If an AX100 picture suddenly brightens mid-concert, look for A's on the screen.",
      },
    ],
  },
  {
    id: "framing-static-wide",
    title: "Frame the Static Wide",
    purpose: "As close as possible — but wide enough for everyone to stand and bow.",
    group: "hw3",
    accent: "#C3F584",
    mode: "guided",
    scene: "salmon-voice-strings",
    camera: "ax100",
    bodyControls: true,
    start: { fps: 30, shutter: 60, aperture: 4, gainDb: 3, focal: 32, wb: 3800, wbAB: 5, wbGM: 2, auto: { focus: true } },
    tools: { available: ["hud"], on: ["hud"] },
    intro: "Salmon's backup wide: an AX100 on a tripod in the booth, centered and level. Use the <strong>zoom lever (W / T)</strong>.",
    steps: [
      {
        text: "Frame it <strong>as close as possible, but wide enough that everyone has room to stand up and bow</strong>. The seated players will stand for bows — leave room above their heads.",
        when: (c) => checks.framing().test(c).pass,
        notYet: (c) => checks.framing().test(c).detail,
        done: "That's the shot. Reframe between pieces when the stage changes — never during one.",
      },
      {
        enter: { scene: "salmon-choir", settings: { wb: 3800, wbAB: 5, wbGM: 2 } },
        text: "The choir is on next (with piano). Reframe.",
        when: (c) => checks.framing().test(c).pass,
        notYet: (c) => checks.framing().test(c).detail,
        done: "Wider for a bigger group. Don't forget the pianist.",
      },
      {
        enter: { scene: "salmon-piano-solo", settings: { wb: 3800, wbAB: 5, wbGM: 2 } },
        text: "Solo piano. Reframe.",
        when: (c) => checks.framing().test(c).pass,
        notYet: (c) => checks.framing().test(c).detail,
        done: "Tight on a single performer. (This sim's zoom stops at 3.5× — the real AX100 goes to 12×, but a static wide never needs to.)",
      },
      {
        enter: { scene: "salmon-mariachi", settings: { wb: 3800, wbAB: 5, wbGM: 2 } },
        text: "A sixteen-piece mariachi, wall to wall. Reframe.",
        when: (c) => checks.framing().test(c).pass,
        notYet: (c) => checks.framing().test(c).detail,
        done: "Wide, but with room to spare: from the booth even the biggest group fits well inside the AX100's widest (29 mm, 35mm-equivalent). Wide lenses matter when the camera has to stand closer — try Lens Shopping in Free play.",
      },
    ],
  },
  {
    id: "match-two-ax100",
    title: "Match Two AX100s",
    purpose: "Same camera, two angles: make B cut seamlessly with A.",
    group: "hw3",
    accent: "#B88CFF",
    mode: "challenge",
    scene: "auditorium-chamber-orchestra",
    bodyControls: true,
    noAutoWb: true,
    rigs: [
      { id: "A", label: "Cam A · center wide", name: "Cam A", camera: "ax100", reference: true, start: { fps: 30, aperture: 2.8, gainDb: 3, shutter: 60, wb: 3200, focal: 36, auto: { focus: true } } },
      {
        id: "B",
        label: "Cam B · backup, house left",
        name: "Cam B",
        camera: "ax100",
        angle: { shift: -0.8 },
        aim: [0.45, 0.55],
        start: { fps: 30, aperture: 4, gainDb: 12, shutter: 30, nd: 2, wb: 3200, wbMode: "auto", focal: 40, auto: { aperture: true, focus: true } },
      },
    ],
    tools: { available: ["meter", "zebras", "hud"], on: ["hud"] },
    brief: "Both AX100s from the Standard Gear Kit are rolling on a generic gig. Cam A is set correctly. Cam B came out of the bag in a mess. Make B match A — same color, same brightness — so the edit can cut between them without a jump.",
    goals: ["B's color matches A", "B's brightness matches A", "Shutter 1/60", "Nothing on auto exposure", "ND off", "No more than 9 dB"],
    criteria: [
      checks.colorMatches("A", { rig: "B" }),
      checks.brightnessMatches("A", { rig: "B" }),
      checks.shutterIs(60, { rig: "B" }),
      checks.noAutoExposure({ rig: "B" }),
      checks.ndOff({ rig: "B" }),
      checks.maxGainDb(9, { rig: "B" }),
    ],
    passNote: "Two identical cameras match when the numbers match. The next station is the harder case: two different cameras.",
  },
  {
    id: "match-gh5",
    title: "Match a GH5 to the AX100",
    purpose: "Different brand, different color: match by eye, then trim.",
    group: "hw3",
    accent: "#8CE8C4",
    mode: "challenge",
    scene: "auditorium-voice-strings",
    rigs: [
      { id: "A", label: "AX100", name: "the AX100", camera: "ax100", reference: true, start: { fps: 30, aperture: 2.8, gainDb: 3, shutter: 60, wb: 3200, focal: 36, auto: { focus: true } } },
      {
        id: "G",
        label: "GH5",
        name: "the GH5",
        camera: "gh5",
        angle: { shift: 0.8 },
        aim: [0.55, 0.55],
        start: { fps: 30, aperture: 5.6, iso: 1600, shutter: 50, wb: 5600, focal: 32, focus: 13 },
      },
    ],
    controls: ["aperture", "shutter", "iso", "wb", "wbab", "wbgm"],
    tools: { available: ["meter", "hud"], on: ["hud"] },
    brief: "A GH5 (with the department's 14–140) joins the AX100 for a second angle. Get it to cut with the AX100: start from the same kelvin, then use the GH5's white-balance shift (A–B, G–M) to fix what's left. Two brands at the same numbers rarely match exactly — trust the monitors.",
    goals: ["GH5 color matches the AX100", "Brightness matches", "Shutter 1/60", "ISO 800 or lower"],
    criteria: [checks.colorMatches("A", { rig: "G" }), checks.brightnessMatches("A", { rig: "G" }), checks.shutterIs(60, { rig: "G" }), checks.maxIso(800)],
    passNote: "Matching by eye (and by vectorscope, eventually) beats matching by numbers. Salmon's old multicam notes list GH5 numbers too — 3700K, B4 — for the same reason.",
  },
  {
    id: "match-rovocam",
    title: "Match the AX100 to Salmon's RovoCam",
    purpose: "Why Salmon's backup wide uses 3800K, A5 G2.",
    group: "hw3",
    accent: "#FFA36C",
    mode: "challenge",
    scene: "salmon-violin-piano",
    bodyControls: true,
    noAutoWb: true,
    rigs: [
      {
        id: "R",
        label: "RovoCam · Camera 2",
        name: "the RovoCam",
        camera: "rovocam",
        reference: true,
        start: { fps: 30, aperture: 4, gainDb: 3, shutter: 60, wbMode: "auto", focal: 34, auto: { focus: true } },
      },
      {
        id: "X",
        label: "AX100",
        name: "the AX100",
        camera: "ax100",
        angle: { shift: 0.3 },
        start: { fps: 30, aperture: 4, gainDb: 3, shutter: 60, wb: 3200, focal: 36, auto: { focus: true } },
      },
    ],
    tools: { available: ["meter", "hud"], on: ["hud"] },
    brief: "Salmon's installed RovoCam is the main wide, and it runs on <strong>auto white balance</strong> — nobody changes it. Your AX100 backup is at the generic 3200K. Make the AX100 match the RovoCam: press WB → Color Temp for the kelvin, and use WB shift (A–B, G–M) for the rest.",
    goals: ["AX100 color matches the RovoCam", "Brightness matches", "Exposure locked (no A)", "Shutter 1/60"],
    criteria: [checks.colorMatches("R", { rig: "X" }), checks.brightnessMatches("R", { rig: "X" }), checks.noAutoExposure({ rig: "X" }), checks.shutterIs(60, { rig: "X" })],
    passNote: "The Salmon house numbers for the AX100 are <strong>3800K, A5 G2</strong> — worked out exactly this way. Anywhere else, use 3200K. And if you forget in Salmon and leave it on 3200, it's not a disaster — the one rule is that cameras that cut together match each other.",
  },
  {
    id: "salmon-livestream",
    title: "Salmon Livestream: Program, Preview, On Air",
    purpose: "The multiview, the static wide on program, and the one button that goes live.",
    group: "hw3",
    accent: "#FF6B9A",
    module: "../stations/livestream.js",
    wide: true,
  },
  {
    id: "sgk-gig",
    title: "Standard Gear Kit Gig: 10 Minutes to Downbeat",
    purpose: "Two AX100s, a dark hall, nothing set. Get both cameras gig-ready and rolling.",
    group: "hw3",
    accent: "#6FA8FF",
    mode: "challenge",
    scene: "auditorium-choir",
    bodyControls: true,
    noAutoWb: true,
    rigs: [
      {
        id: "A",
        label: "Cam A · center wide",
        name: "Cam A",
        camera: "ax100",
        start: { fps: 30, aperture: 2.8, gainDb: 15, shutter: 60, wbMode: "auto", focal: 32, auto: { aperture: true, shutter: true, gainStops: true, focus: true } },
      },
      {
        id: "B",
        label: "Cam B · backup, house left",
        name: "Cam B",
        camera: "ax100",
        angle: { shift: -0.9 },
        aim: [0.42, 0.52],
        start: { fps: 30, aperture: 4, gainDb: 0, shutter: 60, nd: 4, wb: 5600, focal: 36, focus: 2 },
      },
    ],
    tools: { available: ["meter", "zebras", "waveform", "hud"], on: ["hud"] },
    brief: "A choir concert in a hall you don't know, Standard Gear Kit. Both AX100s are on tripods. Cam A came out on full auto; Cam B still has someone's outdoor settings. Ten minutes to downbeat. Switch cameras with the tabs (or tap a monitor).",
    goals: [
      "Both: performers correctly exposed, gain 9 dB or less",
      "Both: 1/60, iris/shutter/gain locked",
      "Both: 3200K, no shift; ND off; AF on",
      "B matches A: same color, same brightness",
      "A framed tight, with room to bow",
      "Both recording",
    ],
    criteria: [
      checks.rigExposure(-0.6, 0.6, { rig: "A" }),
      checks.rigExposure(-0.6, 0.6, { rig: "B" }),
      checks.maxGainDb(9, { rig: "A" }),
      checks.maxGainDb(9, { rig: "B" }),
      checks.shutterIs(60, { rig: "A" }),
      checks.shutterIs(60, { rig: "B" }),
      checks.noAutoExposure({ rig: "A" }),
      checks.noAutoExposure({ rig: "B" }),
      checks.whiteBalance(3200, { rig: "A" }),
      checks.whiteBalance(3200, { rig: "B" }),
      checks.ndOff({ rig: "B" }),
      checks.autofocusOn({ rig: "A" }),
      checks.autofocusOn({ rig: "B" }),
      checks.colorMatches("A", { rig: "B" }),
      checks.brightnessMatches("A", { rig: "B" }),
      checks.framing({ rig: "A" }),
      checks.recording({ rig: "A" }),
      checks.recording({ rig: "B" }),
    ],
    passNote: "That's a gig-ready Standard Gear Kit video setup. On the real thing: AC power, a clean 128 GB card in each, and check they're actually recording (the counter moving), not just that you pressed the button.",
  },

  // ---------------- homework 4: Musco ----------------
  // One controller, many cameras: read the multiview, pick a camera on the
  // RP150, read its screen, and shade every PTZ to match the static wide
  // under the brightest cue. Camera numbers follow the instructor's multiview
  // map; positions on stage are illustrative (README). Warm-ups review HW3
  // (Salmon numbers, AX100 off auto) and HW2 (ND).
  {
    id: "warmup-salmon-numbers",
    title: "Warm-up: The Salmon Numbers",
    purpose: "Refresher — match the AX100 to the RovoCam from memory.",
    group: "hw4",
    accent: "#FFA36C",
    mode: "challenge",
    scene: "salmon-choir",
    bodyControls: true,
    noAutoWb: true,
    rigs: [
      { id: "R", label: "RovoCam · Camera 2", name: "the RovoCam", camera: "rovocam", reference: true, start: { fps: 30, aperture: 4, gainDb: 3, shutter: 60, wbMode: "auto", focal: 34, auto: { focus: true } } },
      { id: "X", label: "AX100", name: "the AX100", camera: "ax100", angle: { shift: 0.3 }, start: { fps: 30, aperture: 4, gainDb: 3, shutter: 60, wb: 5600, wbMode: "outdoor", focal: 36, auto: { focus: true } } },
    ],
    tools: { available: ["meter", "hud"], on: ["hud"] },
    brief: "Refresher from Homework 3. Someone brought this AX100 back from an outdoor shoot. It's the backup wide in Salmon tonight — make it cut with the RovoCam.",
    goals: ["Color matches the RovoCam", "Brightness matches", "Exposure locked (no A)", "Shutter 1/60"],
    criteria: [checks.colorMatches("R", { rig: "X" }), checks.brightnessMatches("R", { rig: "X" }), checks.noAutoExposure({ rig: "X" }), checks.shutterIs(60, { rig: "X" })],
    passNote: "3800K, A5 G2 — Salmon's numbers, because the RovoCam runs on auto white balance.",
  },
  {
    id: "warmup-lock-it-down",
    title: "Warm-up: Lock It Down",
    purpose: "Refresher — an AX100 on full auto in a dark hall. Thirty seconds.",
    group: "hw4",
    accent: "#7CE0FF",
    mode: "challenge",
    scene: "auditorium-piano-solo",
    bodyControls: true,
    noAutoWb: true,
    rigs: [
      {
        id: "A",
        label: "AX100",
        name: "the AX100",
        camera: "ax100",
        start: { fps: 30, aperture: 2.8, gainDb: 12, shutter: 60, wbMode: "auto", focal: 50, auto: { aperture: true, shutter: true, gainStops: true, focus: true } },
      },
    ],
    tools: { available: ["meter", "zebras", "hud"], on: ["meter", "hud"] },
    brief: "Refresher from Homework 3. Full auto, dark hall, solo pianist. Take it off auto and expose the performer properly — fast.",
    goals: ["Performer correctly exposed", "Iris, shutter, gain locked", "1/60, 9 dB or less", "3200K, no shift"],
    criteria: [checks.rigExposure(-0.6, 0.6, { rig: "A" }), checks.noAutoExposure({ rig: "A" }), checks.shutterIs(60, { rig: "A" }), checks.maxGainDb(9, { rig: "A" }), checks.whiteBalance(3200, { rig: "A" })],
  },
  {
    id: "warmup-nd",
    title: "Warm-up: Fixed It With the Shutter",
    purpose: "Refresher — ND on a random body. Smooth motion and a soft background, in full sun.",
    group: "hw4",
    accent: "#9BE564",
    mode: "challenge",
    scene: "park",
    cameraPool: ["ax100", "gh5", "lab", "ff"],
    start: { fps: 30, shutter: 2000, aperture: 2.8, iso: 100, gainDb: 0, nd: 0, focus: 3, wb: 5600 },
    controls: ["aperture", "shutter", "iso", "nd", "focus"],
    tools: { available: ["meter", "histogram", "zebras", "dof", "hud"], on: ["hud"] },
    brief: "Refresher from Homework 2. Full sun, and the client wants the person sharp against soft trees. The last operator got the brightness right by turning the shutter up to 1/2000 — so at 30p every movement looks choppy. Fix the motion without losing the soft background or the exposure. A different camera each time you open this.",
    goals: ["Natural motion at 30p", "Person sharp", "Trees soft", "Good exposure"],
    criteria: [
      checks.shutterAngle(120, 250),
      checks.inFocus("person"),
      checks.blurred("trees", 5.5),
      checks.exposure(-0.7, 0.7, {
        bright: "Slowing the shutter let in about five stops more light. Closing the iris would sharpen the trees — add <strong>ND</strong> instead: it cuts light and changes nothing else.",
        dark: "Built-in ND can come in big steps. If the ND that keeps the trees soft leaves the picture a little dark, make up the difference with a little gain.",
      }),
    ],
    passNote: "1/2000 to 1/60 is five stops more light, and ND takes them back. The AX100's ND switch jumps 2, 4 or 6 stops, so it usually lands with a little gain on top; the GH5 has no built-in ND, so it needs a filter screwed onto the lens. Same job, different hardware.",
  },
  {
    id: "musco-multiview",
    title: "Musco: One Multiview, Many Cameras",
    purpose: "The multiview, the RP150's camera buttons, and the static wide you never touch.",
    group: "hw4",
    accent: "#B88CFF",
    mode: "guided",
    scene: "musco-concert",
    bodyControls: true,
    rigs: MUSCO_RIGS(),
    tools: { available: ["hud"], on: [] },
    intro:
      "Musco's cameras are remote-controlled PTZs. One Panasonic RP150 controller runs all of them: whichever camera button is lit is the camera the knobs change. On the multiview: <strong>2</strong> is the static wide, <strong>5</strong> the conductor cam, <strong>7</strong> a backstage view nobody uses, <strong>8</strong> PowerPoint or video (usually empty). That leaves <strong>1, 3, 4 and 6</strong>: the close-ups, two per camera operator. (Here you see the five PTZs that face the stage.)",
    steps: [
      {
        text: "Your controls are on <strong>Camera 1</strong> — its monitor has the colored border and its button is lit. Press camera button <strong>3</strong> on the RP150 (or tap Camera 3's monitor).",
        when: (c) => c.activeRig === "3",
        notYet: "Press the 3 button in the row of camera buttons.",
        done: "Button 3 lit, Camera 3's monitor got the border, and the screen now says CAM 3. Every knob now changes Camera 3 — <em>always check which button is lit before you turn anything</em>.",
      },
      {
        text: "Which camera is the <strong>static wide</strong> — the safe shot that opens and closes the show, with everyone in it, bows included? Select it.",
        when: (c) => c.activeRig === "2",
        notYet: "Look for the widest shot that shows the whole ensemble, centered.",
        done: "Camera 2. You can select it to read its screen, but you never move it or change it — it's the shot the switcher can always cut to.",
      },
      {
        text: "Now select the camera that's on the <strong>flutes</strong>.",
        when: (c) => c.activeRig === "1",
        notYet: "Front row, house left. Find it on the multiview, then press its button.",
        done: "Camera 1. On a real gig the switcher operator calls shots by number — \"camera 1, the flute solo\" — so you need to know which is which without thinking.",
      },
    ],
  },
  {
    id: "musco-read-the-screen",
    title: "Musco: Read the Screen, Fix the Camera",
    purpose: "House defaults on the RP150 — and the two different kinds of gain.",
    group: "hw4",
    accent: "#FF7CD6",
    mode: "guided",
    scene: "musco-concert",
    bodyControls: true,
    rigs: MUSCO_RIGS({
      1: { aperture: 5, bPed: -8 },
      3: { rGain: 40 },
      4: { wb: 5600, wbMode: "outdoor" },
    }),
    tools: { available: ["hud", "waveform"], on: [] },
    intro: "Musco's house defaults for every PTZ: <strong>iris F5.6 · gain 0 dB · A/3200K · R/B gain 0 · R/B pedestal 0</strong>. Camera 2, the static wide, is set; three others aren't.",
    steps: [
      {
        text: "Select <strong>Camera 1</strong> and read its screen. Two values are off the house defaults (this is the real screen from the booth photo). Fix both with the knobs.",
        when: (c) => c.rigs["1"].settings.aperture === 5.6 && c.rigs["1"].settings.bPed === 0,
        notYet: (c) => {
          const s = c.rigs["1"].settings;
          const off = [s.aperture !== 5.6 && `IRIS is F${s.aperture.toFixed(1)}`, s.bPed !== 0 && `B PED is ${s.bPed}`].filter(Boolean);
          return `Camera 1 still has: ${off.join(", ")}. (Is button 1 lit?)`;
        },
        done: "F5.6 and blue pedestal 0. A pedestal off by −8 sinks the blue in the blacks — with everyone in black, the whole band looks yellowish next to the other cameras.",
      },
      {
        text: "Camera 3's color is off — compare its monitor with Camera 2. There are two kinds of \"gain\" on this controller. Fix Camera 3 with the right one.",
        when: (c) => c.rigs["3"].settings.rGain === 0 && Math.abs(c.rigs["3"].settings.gainStops) < 0.01,
        notYet: (c) =>
          Math.abs(c.rigs["3"].settings.gainStops) > 0.01
            ? "That's GAIN in dB — it brightens the whole picture (and adds noise). Put it back to 0 dB; color lives on the R/B GAIN knobs."
            : `Camera 3's R GAIN is ${c.rigs["3"].settings.rGain > 0 ? "+" : ""}${c.rigs["3"].settings.rGain}.`,
        done: "R GAIN is color (red, in the highlights); GAIN in dB is brightness. Same word, different job.",
      },
      {
        text: "Camera 4 looks blue. Fix its white balance to the house default.",
        when: (c) => c.rigs["4"].settings.wbMode === "indoor",
        notYet: "Select Camera 4, then press A/3200K.",
        done: "B/5600K is daylight; Musco's stage is lit like tungsten, so A/3200K. (The checklist says to hold A/3200K for a few seconds — what the hold does is still being confirmed.)",
      },
    ],
  },
  {
    id: "musco-brightest-cue",
    title: "Musco: Set It Under the Brightest Cue",
    purpose: "Why you ask for concert lighting before you touch exposure.",
    group: "hw4",
    accent: "#FFD166",
    mode: "guided",
    scene: "musco-preshow",
    bodyControls: true,
    rigs: [
      { id: "3", label: "Camera 3 · center", name: "Camera 3", camera: "ue150", start: { ...MUSCO_START, focal: 45 } },
      { id: "2", label: "Camera 2 · static wide", name: "Camera 2", camera: "ue150", readOnly: true, start: { ...MUSCO_START, focal: 40 } },
    ],
    tools: { available: ["meter", "zebras", "hud"], on: ["meter"] },
    intro: "It's an hour before the Wind Symphony. Only the work lights are on.",
    steps: [
      {
        text: "Camera 3 is at the house defaults, and the picture is dark under the work lights. Fix it the way it <em>looks right now</em>: bring the white needle to about 0 with the iris and gain.",
        when: (c) => Math.abs(c.rigs["3"].derived.exposureStops) <= 0.5,
        notYet: "Open the iris (turn IRIS up) and add GAIN until the white needle is near 0.",
        done: "Looks fine… for now.",
      },
      {
        enter: { scene: "musco-concert", keepSettings: true },
        text: "Places! The house goes dark and the lighting designer brings up the concert cue. Look at Camera 3 now — then put it back where it belongs.",
        when: (c) => Math.abs(c.rigs["3"].derived.exposureStops) <= 0.4 && c.rigs["3"].settings.aperture === 5.6 && Math.abs(c.rigs["3"].settings.gainStops) < 0.01,
        notYet: (c) => (Math.abs(c.rigs["3"].derived.exposureStops) > 0.4 ? "Still off — the house defaults are made for this cue: F5.6 and 0 dB." : "Exposure's right; the house numbers are F5.6 and 0 dB."),
        done: "Blown out the moment the real lights came up — and the extra gain was noise for nothing. That's why the checklist says to ask for concert lighting, <strong>including the brightest cue</strong>, before you set anything: the house defaults are made for it.",
      },
    ],
  },
  {
    id: "musco-which-button",
    title: "Musco: Which Button Is Lit?",
    purpose: "Two cameras left to shade, and the controller is still on the last one you finished.",
    group: "hw4",
    accent: "#FF9F7C",
    mode: "challenge",
    scene: "musco-concert",
    bodyControls: true,
    startRig: "4",
    rigs: MUSCO_RIGS({
      1: { aperture: 4 },
      6: { rGain: 30 },
    }),
    tools: { available: ["meter", "waveform", "hud"], on: [] },
    brief: "The brightest cue is up. You've just shaded Cameras 3 and 4, and they match Camera 2, the static wide. Cameras 1 and 6 still need it. Match them to Camera 2 without disturbing the three that are already right.",
    goals: ["Cameras 1 and 6: color, brightness and blacks match Camera 2", "Cameras 3 and 4 as you left them", "Camera 2 untouched"],
    criteria: [
      ...["1", "6"].flatMap((id) => [checks.colorMatches("2", { rig: id }), checks.brightnessMatches("2", { rig: id }), checks.blacksMatch("2", { rig: id })]),
      ...["3", "4"].map((id) => checks.untouched(id, { why: "was changed, and it was already right. Look at which camera button is lit before you turn a knob." })),
      checks.untouched("2"),
    ],
    passNote: "Every time you pick up the controller, check which button is lit first. A knob turned on the wrong camera spoils a shot that was right, and if that camera is on Program, everyone watching sees it happen.",
  },
  {
    id: "musco-looks-off",
    title: "Musco: One of Them Looks Off",
    purpose: "Nobody tells you which camera. Find the one that doesn't match — a different one each time.",
    group: "hw4",
    accent: "#C9B8FF",
    mode: "challenge",
    scene: "musco-concert",
    bodyControls: true,
    rigs: MUSCO_RIGS(),
    // One camera, one small fault: blacks, color or brightness.
    faultPool: [{ 1: { mPed: 8 } }, { 3: { bGain: 30 } }, { 4: { aperture: 4.5 } }, { 6: { rGain: 25 } }],
    tools: { available: ["meter", "waveform", "hud"], on: [] },
    brief: "Ten minutes to downbeat, brightest cue up. The person switching cuts around the multiview and says, \"One of the close-ups looks off.\" That's all you get. Find it, fix it, and leave the rest alone. (A different camera each time you open this.)",
    goals: ["Cameras 1, 3, 4, 6: color, brightness and blacks match Camera 2", "Camera 2 untouched"],
    criteria: [
      ...["1", "3", "4", "6"].flatMap((id) => [checks.colorMatches("2", { rig: id }), checks.brightnessMatches("2", { rig: id }), checks.blacksMatch("2", { rig: id })]),
      checks.untouched("2"),
    ],
    passNote: "Two ways to find it, and a good operator uses both: compare each monitor with Camera 2 (that's what the multiview is for), and read each camera's screen for anything off the house defaults.",
  },
  {
    id: "musco-shade-all",
    title: "Musco: Make It Look Like One Room",
    purpose: "Shade four PTZ cameras to match the static wide. Every cut depends on it.",
    group: "hw4",
    accent: "#6FA8FF",
    mode: "challenge",
    scene: "musco-concert",
    bodyControls: true,
    rigs: MUSCO_RIGS({
      1: { aperture: 5, bPed: -8 },
      3: { rGain: 40, gainDb: 6 },
      4: { wb: 5600, wbMode: "outdoor", mPed: 10 },
      6: { wbMode: "auto", bGain: -30, auto: { aperture: true, focus: true } },
    }),
    tools: { available: ["meter", "waveform", "hud"], on: [] },
    brief: "Twenty minutes to downbeat, under the brightest cue. Cameras 1, 3, 4 and 6 were left in a mess; Camera 2, the static wide, is right — and nobody touches it. Make every camera match Camera 2: same color, same brightness, same blacks. Cut between them on the multiview in your head: nothing should jump.",
    goals: ["Cameras 1, 3, 4, 6: color, brightness and blacks match Camera 2", "Camera 2 untouched"],
    criteria: [
      ...["1", "3", "4", "6"].flatMap((id) => [checks.colorMatches("2", { rig: id }), checks.brightnessMatches("2", { rig: id }), checks.blacksMatch("2", { rig: id })]),
      checks.untouched("2"),
    ],
    passNote: "One room. On the real controller you'd finish by comparing the multiview under the brightest cue — and on a vectorscope and waveform, if you have them.",
  },

  // ---------------- play ----------------
  {
    id: "playground",
    title: "Playground",
    purpose: "Every control, every tool, every camera. No instructions.",
    group: "play",
    accent: "#8CE8C4",
    mode: "playground",
    scene: "stage",
    camera: "lab",
    cameraChoice: true,
    sceneChoice: true,
    start: {},
    controls: ["aperture", "shutter", "iso", "nd", "fps", "wb", "focus", "zoom"],
    tools: {
      available: ["meter", "histogram", "waveform", "zebras", "peaking", "magnify", "dof", "shutter", "hud"],
      on: ["meter", "hud"],
    },
    intro: "Everything unlocked. Break it on purpose, then fix it.",
  },

  {
    id: "lens-shopping",
    title: "Lens Shopping: How Wide Is Wide Enough?",
    purpose: "Where the camera stands decides the lens it needs.",
    group: "play",
    accent: "#C9B8FF",
    mode: "guided",
    scene: "salmon-booth15-mariachi",
    camera: "gh5-14-140",
    cameraChoice: true,
    cameras: LENSES,
    start: { fps: 30, shutter: 60, aperture: 5.6, iso: 400, focal: 60, wb: 3200 },
    controls: ["zoom"],
    tools: { available: ["hud"], on: ["hud"] },
    intro:
      "The department's GH5s have one lens, the 14–140, and its widest is 28 mm (35mm-equivalent). Before buying something wider, find out where it would actually help: the same Salmon, three places to put the camera. Everyone has to fit <strong>standing up to bow</strong>.",
    steps: [
      {
        text: "You're in the booth with the 14–140, and the mariachi is on — sixteen players across the stage. <strong>Zoom all the way out</strong> (W). Does everyone fit?",
        when: atWidest,
        notYet: "Zoom all the way out, then check.",
        done: (c) =>
          `Easily — at ${mm(c)} there's empty hall on both sides. From the booth the stage is a long way off, so a static wide back here zooms <em>in</em> to fill the frame. In the booth, the lens's wide end isn't the problem.`,
      },
      {
        enter: { scene: "salmon-aisle15-chamber-orchestra", camera: "gh5-14-140" },
        text: "Now the camera is on a tripod in the <strong>center aisle</strong>, a few rows from the front — about 3 m short of where the performers sit, a closer second angle, or a wide when the booth view is blocked. The chamber orchestra is on, conductor and all. <strong>Zoom all the way out</strong> again.",
        when: atWidest,
        notYet: "Zoom all the way out, then check.",
        done: (c) =>
          inFrame(c.scene, c.view)
            ? `Everyone fits at ${mm(c)}.`
            : `Not quite: at ${mm(c)} someone is cut off — look at the ends of the orchestra. Halfway to the stage, the same group takes up a much wider angle.`,
      },
      {
        text: "Open the <strong>Camera</strong> menu and try the other lenses. Pick the <strong>longest</strong> one that still gets everyone in — any wider just makes the performers smaller.",
        when: pickedBest,
        notYet: pickNotYet,
        hint: "Zoom each lens all the way out. The one you want fits, but only just.",
        done: (c) => {
          const others = alsoFit(c, c.camera);
          return `The ${lensName(c.camera)}: its widest (${c.camera.lens.wide} mm) gets the whole orchestra in from the aisle.${others.length ? ` The ${others.join(" and the ")} would too, with more empty hall around everyone.` : ""}`;
        },
      },
      {
        enter: { scene: "salmon-front15-mariachi", camera: "gh5-14-140" },
        text: "Last spot: <strong>down front</strong>, at the edge of the stage — as close as a camera gets. The mariachi again. Find the <strong>longest lens that fits</strong> now.",
        when: pickedBest,
        notYet: pickNotYet,
        hint: "Up close you need a lot more width. Start from the widest and work back.",
        done: (c) =>
          `The ${lensName(c.camera)} at ${c.camera.lens.wide} mm. The closer the camera, the wider the lens — that's the whole trade. (This Salmon is drawn from photos, not measured, so treat the exact millimeters as approximate.)`,
      },
    ],
  },

  // ---------------- finish ----------------
  {
    id: "finish",
    title: "Finish & Submit",
    purpose: "Two reflections and a summary to paste into Canvas.",
    group: "finish",
    accent: "#6BFFB0",
    module: "../stations/finish.js",
  },
];

export function getStation(id) {
  return stations.find((s) => s.id === id);
}
