// Every station is data; these tests catch the mistakes that only show up
// when a student is stuck on a step nobody can pass.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { stations, SECTIONS } from "../data/stations.js";
import { allCameras, getCamera } from "../data/cameras.js";
import { scenes, getScene } from "../js/scenes/index.js";
import { apertureOptions, gainOptions, ndOptions, shutterOptions, focalRange, renderedWhite, colorMatch } from "../js/sim/camera-model.js";
import { checks } from "../js/lab/feedback.js";
import { rig, ctxFor, allPass } from "./helpers.mjs";

const CONTROLS = ["aperture", "shutter", "iso", "nd", "fps", "wb", "wbab", "wbgm", "focus", "zoom"];
const groups = new Set(SECTIONS.map(([g]) => g));
const camIds = new Set(allCameras.map((c) => c.id));
const sceneIds = new Set(scenes.map((s) => s.id));

test("station data is well-formed", () => {
  const ids = new Set();
  for (const s of stations) {
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
    assert.ok(groups.has(s.group), `${s.id}: unknown group ${s.group}`);
    assert.ok(s.title && s.purpose, `${s.id}: title and purpose`);
    if (s.module) {
      assert.ok(existsSync(new URL(s.module, new URL("../data/", import.meta.url))), `${s.id}: module ${s.module} missing`);
      continue;
    }
    assert.ok(sceneIds.has(s.scene), `${s.id}: unknown scene ${s.scene}`);
    for (const c of [s.camera, ...(s.cameraPool || []), ...(s.cameras || []), ...(s.rigs || []).map((r) => r.camera), ...(s.steps || []).map((st) => st.enter?.camera)].filter(Boolean)) assert.ok(camIds.has(c), `${s.id}: unknown camera ${c}`);
    for (const c of s.controls || []) assert.ok(CONTROLS.includes(c), `${s.id}: unknown control ${c}`);
    if (s.mode === "guided") for (const st of s.steps) assert.ok(st.text && typeof st.when === "function" && st.done, `${s.id}: step needs text, when, done`);
    if (s.mode === "challenge") assert.ok(s.criteria?.length, `${s.id}: challenge without criteria`);
    for (const st of s.steps || []) if (st.enter?.scene) assert.ok(sceneIds.has(st.enter.scene), `${s.id}: step enters unknown scene ${st.enter.scene}`);
  }
});

// Brute-force a single-camera challenge: is there ANY setting combination
// (from what the body offers and the station's controls allow) that passes?
function solvable(station, cameraId) {
  const scene = getScene(station.scene);
  const cam = getCamera(cameraId);
  const has = (c) => (station.controls || []).includes(c);
  const start = rig(scene, cameraId, station.start).settings;
  const aps = has("aperture") ? apertureOptions(cam).map((o) => o.value) : [start.aperture];
  const gains = has("iso") ? gainOptions(cam).map((o) => o.value) : [start.gainStops];
  const nds = has("nd") ? ndOptions(cam).map((o) => o.value) : [start.nd];
  const shutters = has("shutter") ? shutterOptions(cam).map((o) => o.value).filter((d) => d >= 40 && d <= 125) : [start.shutter];
  const wbs = has("wb") ? [3200, 5600] : [start.wb];
  const depths = Object.values(scene.subjects).map((x) => x.depth);
  const focuses = has("focus") ? [...depths, ...depths.flatMap((a) => depths.map((b) => Math.sqrt(a * b)))] : [start.focus];
  for (const aperture of aps)
    for (const gainStops of gains)
      for (const nd of nds)
        for (const shutter of shutters)
          for (const wb of wbs)
            for (const focus of focuses) {
              const r = rig(scene, cameraId, { ...station.start, aperture, gainDb: undefined, iso: 100 * 2 ** gainStops, nd, shutter, wb, focus });
              if (!allPass(station.criteria, ctxFor({ main: r }, "main")).length) return true;
            }
  return false;
}

test("every single-camera challenge can be passed on every camera it offers", () => {
  const stuck = [];
  for (const s of stations.filter((x) => x.mode === "challenge" && !x.rigs)) {
    const cams = s.cameraPool || (s.cameraChoice ? s.cameras || allCameras.filter((c) => !c.hidden).map((c) => c.id) : [s.camera || "lab"]);
    for (const c of cams) if (!solvable(s, c)) stuck.push(`${s.id} on ${c}`);
  }
  assert.deepEqual(stuck, [], "challenges nobody can pass");
});

// Multi-camera challenges: a known-good answer passes every criterion.
const MUSCO_HOUSE = { aperture: 5.6, gainDb: 0, wb: 3200, wbMode: "indoor", rGain: 0, bGain: 0, rPed: 0, bPed: 0, mPed: 0, auto: { focus: true } };
const ANSWERS = {
  "warmup-salmon-numbers": { X: { aperture: 4, gainDb: 3, shutter: 60, wb: 3800, wbMode: "temp", wbAB: 5, wbGM: 2, auto: { focus: true } } },
  "warmup-lock-it-down": { A: { aperture: 2.8, gainDb: 6, shutter: 60, wb: 3200, wbMode: "temp", auto: { focus: true } } },
  "musco-shade-all": { 1: MUSCO_HOUSE, 3: MUSCO_HOUSE, 4: MUSCO_HOUSE, 6: MUSCO_HOUSE },
  "match-two-ax100": { B: { aperture: 2.8, gainDb: 3, shutter: 60, wb: 3200, wbMode: "temp", nd: 0, auto: { focus: true } } },
  "match-rovocam": { X: { aperture: 4, gainDb: 3, shutter: 60, wb: 3800, wbAB: 5, wbGM: 2, auto: { focus: true } } },
  "sgk-gig": {
    A: { aperture: 2.8, gainDb: 3, shutter: 60, wb: 3200, wbMode: "temp", focal: 34, auto: { focus: true }, recording: true },
    B: { aperture: 2.8, gainDb: 3, shutter: 60, wb: 3200, nd: 0, focal: 36, auto: { focus: true }, recording: true },
  },
};

test("multi-camera challenges have a passing answer", () => {
  for (const s of stations.filter((x) => x.rigs && x.mode === "challenge")) {
    const answer = ANSWERS[s.id];
    if (!answer && s.id === "match-gh5") continue; // searched below
    assert.ok(answer, `${s.id}: add a known-good answer to this test`);
    const rigs = {};
    for (const d of s.rigs) {
      const a = answer[d.id];
      rigs[d.id] = rig(s.scene, d.camera, { ...d.start, ...(a || {}), auto: a?.auto ?? d.start.auto }, { ...d, recording: a?.recording });
    }
    const active = s.rigs.find((d) => !d.reference && !d.readOnly).id;
    const failed = allPass(s.criteria, ctxFor(rigs, active));
    assert.deepEqual(failed.map((f) => f.detail), [], `${s.id}`);
  }
});

test("GH5 can be matched to the AX100 with its own white-balance controls", () => {
  const s = stations.find((x) => x.id === "match-gh5");
  const ref = s.rigs.find((d) => d.reference);
  const g = s.rigs.find((d) => !d.reference);
  const A = rig(s.scene, ref.camera, ref.start, ref);
  // Color first (kelvin + shift), then exposure with the GH5's own iris/ISO.
  let found = null;
  const sc = getScene(s.scene);
  const white = (r) => renderedWhite(r.settings, r.camera, sc);
  for (let wb = 2800; wb <= 4000 && !found; wb += 50)
    for (let ab = -9; ab <= 9 && !found; ab++)
      for (let gm = -9; gm <= 9 && !found; gm++) {
        const G = rig(s.scene, "gh5", { ...g.start, wb, wbAB: ab, wbGM: gm }, g);
        if (colorMatch(white(A), white(G)).dist <= 0.03) found = { wb, wbAB: ab, wbGM: gm };
      }
  let passed = false;
  if (found)
    for (const aperture of apertureOptions(getCamera("gh5")).map((o) => o.value))
      for (const iso of [200, 250, 320, 400, 500, 640, 800]) {
        const G = rig(s.scene, "gh5", { ...g.start, ...found, aperture, iso, shutter: 60 }, g);
        if (!allPass(s.criteria, ctxFor({ A, G }, "G")).length) passed = true;
      }
  assert.ok(passed, "GH5 color matches but no exposure passes");
  assert.ok(found, "no GH5 setting matches");
  // …and the bare 3200K isn't already a match, or there's nothing to learn.
  const G0 = rig(s.scene, "gh5", { ...g.start, wb: 3200 }, g);
  assert.ok(colorMatch(renderedWhite(A.settings, A.camera, sc), renderedWhite(G0.settings, G0.camera, sc)).dist > 0.03);
});

test("the framing station can be framed for every program it uses", () => {
  const s = stations.find((x) => x.id === "framing-static-wide");
  const programs = [s.scene, ...s.steps.map((st) => st.enter?.scene).filter(Boolean)];
  for (const id of programs) {
    const scene = getScene(id);
    const { min, max } = focalRange(scene, getCamera("ax100"));
    let ok = false;
    for (let f = min; f <= max + 0.01 && !ok; f *= 1.02) {
      const r = rig(scene, "ax100", { ...s.start, focal: Math.min(f, max) });
      ok = checks.framing().test(ctxFor({ main: r }, "main")).pass;
    }
    assert.ok(ok, `${id}: no zoom passes the framing check`);
  }
});

test("guided AX100 stations: the house-default steps are reachable", () => {
  // The step after "set F4.0 · 3 dB · 1/60" wants exposure near 0 in a darker
  // hall without more than 9 dB: F2.8 must be reachable at the start zoom.
  const s = stations.find((x) => x.id === "ax100-out-of-bag");
  const r = rig(s.scene, "ax100", { ...s.start, aperture: 2.8, gainDb: 3, shutter: 60, auto: {} });
  assert.ok(Math.abs(r.derived.exposureStops) <= 0.5, `exposure ${r.derived.exposureStops}`);
});

test("HW2 Sensor Size: swapping through slower lenses and back leaves the iris where it was", async () => {
  const { normalizeSettings } = await import("../js/sim/camera-model.js");
  const scene = getScene("stage");
  let s = rig(scene, "ff", { aperture: 2.8, focal: 85 }).settings;
  let prev = getCamera("ff");
  for (const id of ["g50", "ax100", "gh5", "ff"]) {
    const cam = getCamera(id);
    s = normalizeSettings({ ...s, focal: s.focal * (cam.sensor.crop / prev.sensor.crop) }, cam, scene);
    prev = cam;
  }
  assert.equal(s.aperture, 2.8);
});

test("AX100 white-balance step judges what the camera applies, not the dial", () => {
  const s = stations.find((x) => x.id === "ax100-out-of-bag");
  const step = s.steps.find((st) => /Color Temp/.test(st.text));
  const at = (p) => step.when({ ...ctxFor({ main: rig(s.scene, "ax100", { ...s.start, ...p }) }, "main") });
  assert.equal(at({ wbMode: "outdoor", wb: 3200 }), false, "Outdoor is 5600K even if the dial says 3200");
  assert.equal(at({ wbMode: "indoor", wb: 5600 }), true, "Indoor is 3200K");
  assert.equal(at({ wbMode: "temp", wb: 3200 }), true);
  assert.equal(at({ wbMode: "temp", wb: 3200, wbAB: 2 }), false, "no shift");
});

test("Musco brightest cue: fixable under work lights, and the house defaults are right under the concert cue", () => {
  const s = stations.find((x) => x.id === "musco-brightest-cue");
  const d = s.rigs[0];
  const pre = rig("musco-preshow", "ue150", { ...d.start, aperture: 2.8, gainDb: 6 }, d);
  assert.ok(Math.abs(pre.derived.exposureStops) <= 0.5, `preshow fix: ${pre.derived.exposureStops}`);
  const concert = rig("musco-concert", "ue150", d.start, d);
  assert.ok(Math.abs(concert.derived.exposureStops) <= 0.1, `house defaults under the concert cue: ${concert.derived.exposureStops}`);
});

test("Musco shading: a camera off by B PED −8 doesn't match; at house defaults it does", () => {
  const s = stations.find((x) => x.id === "musco-shade-all");
  const ref = s.rigs.find((d) => d.id === "2");
  const one = s.rigs.find((d) => d.id === "1");
  const R = rig(s.scene, "ue150", ref.start, ref);
  const bad = rig(s.scene, "ue150", one.start, one);
  assert.equal(checks.blacksMatch("2", { rig: "1" }).test(ctxFor({ 2: R, 1: bad }, "1")).pass, false);
  const good = rig(s.scene, "ue150", { ...one.start, ...MUSCO_HOUSE }, one);
  assert.equal(checks.blacksMatch("2", { rig: "1" }).test(ctxFor({ 2: R, 1: good }, "1")).pass, true);
});

test("Lens Shopping: every 'longest lens that fits' step has an answer that really fits", async () => {
  const { bestLens } = await import("../data/stations.js");
  const s = stations.find((x) => x.id === "lens-shopping");
  const scenes = [s.scene, ...s.steps.map((st) => st.enter?.scene).filter(Boolean)];
  for (const id of scenes) {
    const scene = getScene(id);
    const best = bestLens(scene);
    assert.ok(best, `${id}: no lens fits`);
    // Same check as the framing station, from the browser's own view math.
    const { min } = focalRange(scene, best);
    const r = rig(scene, best.id, { ...s.start, focal: min });
    assert.ok(checks.framing({ minFill: 0 }).test(ctxFor({ main: r }, "main")).pass, `${id}: ${best.id} at its widest doesn't frame everyone`);
  }
  // The point of the station: the answer changes as the camera moves closer.
  assert.deepEqual(scenes.map((id) => bestLens(getScene(id)).id), ["gh5-14-140", "gh5-12-60", "gh5-9-18"]);
});
