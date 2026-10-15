import test from "node:test";
import assert from "node:assert/strict";
import { getCamera } from "../data/cameras.js";
import { getScene } from "../js/scenes/index.js";
import { renderedWhite, colorMatch, maxApertureAt, exactAperture } from "../js/sim/camera-model.js";
import { aeStep, cameraMeter, AE_TARGET } from "../js/sim/auto-exposure.js";
import { rig } from "./helpers.mjs";

test("stops: f/2.8 → f/4 is exactly one stop", () => {
  const a = rig("stage", "lab", { aperture: 2.8 }).derived.exposureStops;
  const b = rig("stage", "lab", { aperture: 4 }).derived.exposureStops;
  assert.ok(Math.abs(a - b - 1) < 1e-9);
});

test("6 dB of gain is one stop", () => {
  const a = rig("stage", "ax100", { gainDb: 3 }).derived.exposureStops;
  const b = rig("stage", "ax100", { gainDb: 9 }).derived.exposureStops;
  assert.ok(Math.abs(b - a - 1) < 1e-9);
});

test("camcorder zooms lose light as they zoom in (spec-sheet apertures)", () => {
  const ax = getCamera("ax100");
  assert.equal(maxApertureAt(ax, 29), 2.8);
  assert.ok(Math.abs(maxApertureAt(ax, 348) - 4.5) < 1e-9);
  const g50 = getCamera("g50");
  assert.equal(maxApertureAt(g50, 29.3), 1.8, "G50 opens to f/1.8 at the wide end");
  // Normalizing can't leave the iris wider than the lens allows at that zoom.
  const s = rig("salmon-voice-strings", "ax100", { aperture: 2.8, focal: 110 }).settings;
  assert.ok(exactAperture(s.aperture) >= exactAperture(maxApertureAt(ax, 110)) * 0.985);
});

test("Salmon: the AX100 house numbers (F4 · 3 dB · 1/60) are correct exposure", () => {
  const e = rig("salmon-violin-piano", "ax100", { aperture: 4, gainDb: 3, shutter: 60 }).derived.exposureStops;
  assert.ok(Math.abs(e) < 0.05, `got ${e}`);
});

test("Salmon: AX100 at 3800K A5 G2 matches the RovoCam on auto WB; 3200K doesn't", () => {
  const scene = getScene("salmon-violin-piano");
  const rovo = rig(scene, "rovocam", { wbMode: "auto" });
  const ref = renderedWhite(rovo.settings, rovo.camera, scene);
  const at = (p) => {
    const r = rig(scene, "ax100", p);
    return colorMatch(ref, renderedWhite(r.settings, r.camera, scene)).dist;
  };
  assert.ok(at({ wb: 3800, wbAB: 5, wbGM: 2 }) < 0.03);
  assert.ok(at({ wb: 3200 }) > 0.1);
});

test("white balance shift moves color the right way", () => {
  const scene = getScene("auditorium-choir");
  const base = rig(scene, "ax100", { wb: 3200 });
  const amber = rig(scene, "ax100", { wb: 3200, wbAB: 4 });
  const green = rig(scene, "ax100", { wb: 3200, wbGM: 4 });
  const w = (r) => renderedWhite(r.settings, r.camera, scene);
  assert.ok(colorMatch(w(base), w(amber)).warm > 0, "A = warmer");
  assert.ok(colorMatch(w(base), w(green)).green > 0, "G = greener");
});

test("auto exposure: a dark frame makes the camera brighten, using only auto controls", () => {
  const r = rig("auditorium-choir", "ax100", { aperture: 4, gainDb: 0, shutter: 60, auto: { gainStops: true } });
  const d = aeStep(r.settings, r.camera, 0.08);
  assert.ok(d.gainStops > r.settings.gainStops, "gain went up");
  assert.equal(d.aperture, undefined, "iris was manual — untouched");
  assert.deepEqual(aeStep({ ...r.settings, auto: {} }, r.camera, 0.08), {}, "nothing on auto, nothing moves");
  assert.ok(Math.abs(cameraMeter(AE_TARGET)) < 1e-9, "the camera's meter reads 0 at its own target");
  const bright = aeStep({ ...r.settings, gainStops: 2, auto: { gainStops: true, aperture: true } }, r.camera, 0.9);
  assert.ok(bright.gainStops < 2, "too bright: gain comes down first");
});
