// Homework 5 (running a PTZ at Musco): every call can be answered on the
// camera that gets it, every step fails where it starts and passes on a
// known-good answer, and the tally rule catches a move on the live camera.
import test from "node:test";
import assert from "node:assert/strict";
import { stations, gigStation } from "../data/stations.js";
import { getScene } from "../js/scenes/index.js";
import { shotReport, framedOk, shotOk } from "../js/lab/shots.js";
import { viewFor } from "../js/sim/camera-model.js";
import { checks } from "../js/lab/feedback.js";
import { rig, moved, ctxFor } from "./helpers.mjs";

const scene = getScene("musco-concert");
const station = (id) => stations.find((s) => s.id === id);
const rigsOf = (s) => Object.fromEntries(s.rigs.map((d) => [d.id, rig(s.scene, d.camera, d.start, d)]));

// Point a rig straight at a target (parallax included) and find a zoom that
// frames it for `kind`, focused on it with AUTO off.
function solve(r, target, kind) {
  const t = scene.targets[target];
  const a = r.def.angle;
  const du = a ? a.shift * (1 / t.depth - 1 / a.aimDepth) : 0;
  for (let focal = 140; focal >= 40; focal -= 1) {
    const m = moved(r, { focal, aimU: (t.x0 + t.x1) / 2 + du, aimV: (t.y0 + t.y1) / 2, focus: t.depth, auto: {} });
    if (shotOk(shotReport(m, scene, target), kind)) return m;
  }
  return null;
}
const ctx = (rigs, active, extra = {}) => ({ ...ctxFor(rigs, active), touchedKeys: new Set(), ptSpeed: 3, tally: { program: null, preview: null }, liveMoves: 0, ...extra });

test("Musco targets: every section and player can be framed by every close-up camera", () => {
  const s = station("musco-red-means-live");
  const rigs = rigsOf(s);
  const stuck = [];
  for (const id of ["1", "3", "4", "6"])
    for (const [name, t] of Object.entries(scene.targets)) if (!solve(rigs[id], name, t.kind)) stuck.push(`${id}: ${name} (${t.kind})`);
  assert.deepEqual(stuck, []);
});

test("PTZ: pan stays inside the drawn scene, and the static wide can't be driven", () => {
  const s = station("musco-drive-ptz");
  const four = rigsOf(s)["4"];
  const far = moved(four, { aimU: -3, aimV: 9 });
  const half = 0.5 / far.derived.frameZoom;
  assert.ok(far.settings.aimU >= half - 1e-9 && far.settings.aimV <= 1 - half + 1e-9);
  // Zooming out at the edge pulls the aim back in.
  const wide = moved(moved(four, { focal: 140, aimU: 0.15 }), { focal: 40 });
  assert.ok(wide.view.x >= 0.5 - 1e-6 && wide.view.x <= 0.5 + 1e-6);
  assert.ok(!s.rigs.find((d) => d.id === "2").ptz, "Camera 2 has no joystick");
  // A PTZ rig starts on the same picture a fixed camera with its aim would.
  for (const d of station("musco-shot-sizes").rigs) {
    const fixed = rig(scene, "ue150", d.start, { ...d, ptz: false });
    const ptz = rig(scene, "ue150", d.start, d);
    if (d.start.aimU == null) assert.deepEqual(ptz.view, fixed.view, `Camera ${d.id}`);
  }
});

test("untouched() notices a pan", () => {
  const rigs = rigsOf(station("musco-red-means-live"));
  const k = checks.untouched("4");
  assert.ok(k.test(ctx(rigs, "1")).pass);
  rigs["4"] = moved(rigs["4"], { aimU: rigs["4"].settings.aimU + 0.02 });
  assert.ok(!k.test(ctx(rigs, "1")).pass);
});

test("Drive a PTZ: each step fails at its start and passes on the answer", () => {
  const s = station("musco-drive-ptz");
  const [aim, slow, zoom, focus] = s.steps;
  let rigs = rigsOf(s);
  const at = (extra) => ctx(rigs, "4", extra);
  assert.ok(!aim.when(at()), "step 1 already passes at the start");
  const t = scene.targets.trumpets;
  const du = -1.8 * (1 / t.depth - 1 / 24);
  rigs["4"] = moved(rigs["4"], { aimU: (t.x0 + t.x1) / 2 + du, aimV: (t.y0 + t.y1) / 2 });
  assert.ok(aim.when(at()), aim.notYet(at()));
  assert.ok(!slow.when(at({ ptSpeed: 4, touchedKeys: new Set(["pan"]) })), "fast speed passes step 2");
  assert.ok(slow.when(at({ ptSpeed: 2, touchedKeys: new Set(["pan:slow"]) })));
  assert.ok(!zoom.when(at()), "step 3 passes before zooming");
  const z = solve(rigs["4"], "trumpets", "section");
  rigs["4"] = { ...z, settings: { ...z.settings, focus: 8 } };
  rigs["4"] = moved(rigs["4"], {});
  assert.ok(zoom.when(at()), zoom.notYet(at()));
  assert.ok(!focus.when(at({ touchedKeys: new Set(["auto:focus"]) })), "the trumpets should be soft at the start's 8 m, zoomed in");
  assert.match(focus.notYet(at({ touchedKeys: new Set(["auto:focus"]) })), /soft/);
  rigs["4"] = moved(rigs["4"], { focus: t.depth });
  assert.ok(focus.when(at({ touchedKeys: new Set(["auto:focus"]) })));
  rigs["4"] = moved(rigs["4"], { auto: { focus: true } });
  assert.ok(!focus.when(at({ touchedKeys: new Set(["auto:focus"]) })), "AUTO left on passes");
});

// Stations whose steps each ask for one shot on one camera.
const SHOT_STEPS = {
  "musco-shot-sizes": [["6", "ensemble", "wide"], ["6", "horns", "section"], ["6", "tuba", "single"], ["6", "percussion", "section"]],
  "musco-red-means-live": [["1", "flutes", "section"], ["3", "clarinets", "section"], ["1", "first-trumpet", "single"]],
};

for (const [id, answers] of Object.entries(SHOT_STEPS)) {
  test(`${id}: each call fails where it starts and passes once framed`, () => {
    const s = station(id);
    const rigs = rigsOf(s);
    let tally = { ...(s.tally || { program: null, preview: null }) };
    s.steps.forEach((step, i) => {
      if (step.enter?.tally) tally = { ...tally, ...step.enter.tally };
      const [cam, target, kind] = answers[i];
      const c = () => ctx(rigs, cam, { tally });
      assert.ok(!step.when(c()), `step ${i + 1} passes before anything is done`);
      assert.ok(step.notYet(c()).length > 0);
      rigs[cam] = solve(rigs[cam], target, kind);
      assert.ok(rigs[cam], `step ${i + 1}: no answer for ${target} on ${cam}`);
      assert.ok(step.when(c()), `step ${i + 1}: ${step.notYet(c())}`);
      if (tally.program) assert.notEqual(tally.program, cam, `step ${i + 1} asks for a move on the live camera`);
    });
  });
}

for (const pair of ["1-3", "4-6"]) {
  test(`gig (${pair}): every call passes on its answer; other cameras are guarded`, () => {
    const s = gigStation(pair);
    assert.equal(s.id, "musco-gig-calls");
    const rigs = rigsOf(s);
    s.steps.forEach((step, i) => {
      const id = step.enter.tally.preview;
      assert.notEqual(step.enter.tally.program, id, `call ${i + 1} is on the live camera`);
      const c = () => ctx(rigs, id, { tally: step.enter.tally });
      assert.ok(!step.when(c()), `call ${i + 1} passes before anything is done`);
      const before = rigs[id];
      const { target, kind } = step.call;
      assert.equal(step.call.rig, id);
      assert.equal(/tight/.test(step.text), kind === "single", `call ${i + 1}: "tight" in the text iff it's a single`);
      rigs[id] = solve(before, target, kind);
      assert.ok(step.when(c()), `call ${i + 1} (${target}): ${step.notYet(c())}`);
      // left on AUTO focus: not yet
      const auto = moved(rigs[id], { auto: { focus: true } });
      assert.ok(!step.when(ctx({ ...rigs, [id]: auto }, id, { tally: step.enter.tally })));
    });
    // touching the other operator's camera fails the step
    const mine = new Set(s.steps.map((st) => st.enter.tally.preview));
    const other = ["1", "3", "4", "6"].find((x) => !mine.has(x));
    const last = s.steps.at(-1);
    const bumped = { ...rigs, [other]: moved(rigs[other], { aimU: rigs[other].settings.aimU - 0.03 }) };
    assert.match(last.notYet(ctx(bumped, last.enter.tally.preview, { tally: last.enter.tally })), /other operator/);
  });
}

test("Ready… Take: the switcher steps follow ready → take, and a moving camera isn't the answer", () => {
  const s = station("musco-ready-take");
  const rigs = rigsOf(s);
  const [ready, take, safe, take4, back] = s.steps;
  const c = (tally, { keys = [], moving = false, takenMoving = false } = {}) => ({ ...ctx(rigs, "2", { tally, touchedKeys: new Set(keys), takenMoving }), rigs: { ...rigs, 4: { ...rigs["4"], moving } } });
  assert.ok(!ready.when(c({ program: "2", preview: null })));
  assert.ok(ready.when(c({ program: "2", preview: "3" })));
  assert.ok(!take.when(c({ program: "2", preview: "3" })));
  assert.ok(take.when(c({ program: "3", preview: "2" })));
  // Step 3: Camera 4 hunts until the next step (wander), so it's never the answer.
  assert.ok(safe.enter.moves[0].to.wander, "Camera 4 should keep hunting through step 3");
  assert.ok(!safe.when(c({ program: "3", preview: "4" }, { moving: true })), "staying on 3 passes");
  assert.ok(!safe.when(c({ program: "4", preview: "3" }, { moving: true, takenMoving: true })), "taking the moving camera passes");
  assert.match(safe.notYet(c({ program: "4", preview: "3" }, { moving: true, takenMoving: true })), /still moving/);
  assert.ok(safe.when(c({ program: "2", preview: "3" }, { moving: true })));
  // Step 4: only once it has stopped, and a take made mid-move can be redone.
  assert.ok(!take4.when(c({ program: "4", preview: "2" }, { moving: true, takenMoving: true })), "take 4 passes while it's still moving");
  assert.ok(!take4.when(c({ program: "4", preview: "2" }, { takenMoving: true })), "a take made mid-move passes once it stops");
  assert.match(take4.notYet(c({ program: "4", preview: "2" }, { takenMoving: true })), /Go back to 2/);
  assert.ok(take4.when(c({ program: "4", preview: "2" })));
  assert.ok(!back.when(c({ program: "4", preview: "2" })));
  assert.ok(back.when(c({ program: "2", preview: "4" }, { keys: ["program:2"] })));
  // The landing move puts Camera 4 on a passing trumpet shot.
  const m = take4.enter.moves[0];
  const t = scene.targets[m.to.target];
  const a = s.rigs.find((d) => d.id === "4").angle;
  const du = a.shift * (1 / t.depth - 1 / a.aimDepth);
  const landed = moved(rigs["4"], { aimU: (t.x0 + t.x1) / 2 + du, aimV: (t.y0 + t.y1) / 2, focal: m.to.focal, focus: t.depth });
  assert.ok(shotOk(shotReport(landed, scene, "trumpets"), "section"), "Camera 4's move doesn't land on the trumpets");
});

test("every HW5 PTZ station keeps Camera 2 read-only and starts on a camera you can drive", () => {
  for (const s of [...stations.filter((x) => x.group === "hw5" && x.rigs), gigStation("1-3"), gigStation("4-6")]) {
    const two = s.rigs.find((d) => d.id === "2");
    assert.ok(two.readOnly, `${s.id}: Camera 2 should be read-only`);
    if (s.startRig && !s.switcher) assert.ok(s.rigs.find((d) => d.id === s.startRig && !d.readOnly), `${s.id}: startRig`);
  }
  // framedOk alone ignores focus; shotOk needs it
  const r = rigsOf(station("musco-drive-ptz"))["4"];
  const z = solve(r, "trumpets", "section");
  const soft = moved(z, { focus: 3 });
  assert.ok(framedOk(shotReport(soft, scene, "trumpets"), "section") && !shotOk(shotReport(soft, scene, "trumpets"), "section"));
  assert.ok(viewFor(scene, z.settings, z.derived).zoom > 2);
});
