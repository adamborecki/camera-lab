// Shared test helpers: build the same ctx lab-view.js hands to checks, for
// one camera or several, without a browser.
import { getCamera } from "../data/cameras.js";
import { getScene } from "../js/scenes/index.js";
import { derive, normalizeSettings, settingsFromPreset, viewFor, withPtzAim } from "../js/sim/camera-model.js";

export function rig(sceneOrId, cameraId, preset = {}, def = {}) {
  const scene = typeof sceneOrId === "string" ? getScene(sceneOrId) : sceneOrId;
  const camera = getCamera(cameraId);
  let settings = normalizeSettings(settingsFromPreset({ ...scene.defaults, ...preset }, scene), camera, scene);
  if (def.ptz) settings = withPtzAim(settings, scene, def.aim);
  const derived = derive(settings, camera, scene);
  return { scene, camera, settings, derived, def, view: viewFor(scene, settings, derived, def.aim), recording: !!def.recording, start: settings };
}

// The same rig with some settings changed (its start kept, as in the lab).
export function moved(r, over) {
  const settings = normalizeSettings({ ...r.settings, ...over }, r.camera, r.scene);
  const derived = derive(settings, r.camera, r.scene);
  return { ...r, settings, derived, view: viewFor(r.scene, settings, derived, r.def.aim) };
}

// ctx for a station: rigs = { id: rig(...) }, active = id of the one being driven.
export function ctxFor(rigs, active) {
  const a = rigs[active];
  return { settings: a.settings, derived: a.derived, camera: a.camera, scene: a.scene, view: a.view, rigs, activeRig: active, stats: null, touchedKeys: new Set() };
}

export function allPass(criteria, ctx) {
  return criteria.map((c) => ({ label: c.label, ...c.test(ctx) })).filter((r) => !r.pass);
}
