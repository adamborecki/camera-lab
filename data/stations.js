// Course content: every station is data consumed by the same lab view
// (js/lab/lab-view.js). To add one, copy an entry and change it.
//
//  mode       "guided" (steps), "challenge" (brief + criteria), "playground"
//  group      floor section: one of SECTIONS below (learn / go-further /
//             challenge / play / finish) — nothing gates a later section on
//             an earlier one finishing; grouping is for homework chunking
//             and page layout only, not a progression lock
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

// Floor sections, in display order. Rename the label text freely (e.g. to
// match an actual Canvas assignment name each term) — station.group values
// elsewhere in this file must keep matching the id on the left.
export const SECTIONS = [
  ["learn", "Homework 1 — Exposure Basics"],
  ["go-further", "Homework 2 — Go Further"],
  ["challenge", "Challenges"],
  ["play", "Free play"],
  ["finish", "Finish"],
];

const near0 = (c, tol = 0.4) => Math.abs(c.derived.exposureStops) <= tol;
const angleOk = (c) => c.derived.shutterAngle >= 150 && c.derived.shutterAngle <= 220;
const sharp = (c, key) => {
  const d = c.scene.subjects[key].depth;
  return d >= c.derived.dofNear * 0.98 && d <= c.derived.dofFar * 1.02;
};

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
    purpose: "Full frame vs. crop vs. camcorder — same shot, different depth.",
    group: "go-further",
    accent: "#C3F584",
    mode: "guided",
    scene: "stage",
    camera: "ff",
    cameraChoice: true,
    start: { aperture: 2.8, iso: 800, shutter: 60, fps: 30, focus: 2.5, wb: 3200 },
    controls: ["aperture"],
    tools: { available: ["dof", "meter", "hud"], on: ["dof", "hud"] },
    intro: "Every camera here frames the shot the same way. Notice the on-screen display changes too.",
    steps: [
      {
        text: "Full-frame at f/2.8: the drummer is soft. Switch the camera to the <strong>Canon VIXIA HF G50</strong>.",
        when: (c) => c.camera.id === "g50",
        done: "Same framing and f-stop, tiny sensor → nearly everything is sharp.",
      },
      {
        text: "Try the <strong>Sony FDR-AX100</strong> (1-inch sensor).",
        when: (c) => c.camera.id === "ax100",
        done: "In between. Its gain is in dB, and its ND switch reads ND1/ND2/ND3.",
      },
      {
        text: "Now the <strong>Panasonic GH5</strong>, then back to <strong>Full-Frame</strong>.",
        when: (c) => c.camera.id === "ff",
        done: "Bigger sensor = shallower depth of field at the same framing and f-stop — part of the ‘cinematic’ look.",
      },
    ],
  },

  // ---------------- challenges ----------------
  {
    id: "low-light",
    title: "Low-Light Concert",
    purpose: "Noisy, smeary, soft. Fix the shot within the rules.",
    group: "challenge",
    accent: "#FF6B9A",
    mode: "challenge",
    scene: "stage",
    camera: "lab",
    cameraChoice: true,
    start: { fps: 30, shutter: 15, aperture: 5.6, iso: 6400, focus: 6.5, wb: 3200 },
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
    group: "challenge",
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
    criteria: [checks.inFocus("person"), checks.blurred("trees", 6), checks.shutterAngle(120, 250), checks.exposure(-0.7, 0.7)],
  },
  {
    id: "full-camera",
    title: "Full Camera: Everything's Wrong",
    purpose: "Someone left the camera on crazy settings. Diagnose and fix.",
    group: "challenge",
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
    controls: ["aperture", "shutter", "iso", "nd", "fps", "wb", "focus"],
    tools: {
      available: ["meter", "histogram", "waveform", "zebras", "peaking", "magnify", "dof", "shutter", "hud"],
      on: ["meter", "hud"],
    },
    intro: "Everything unlocked. Break it on purpose, then fix it.",
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
