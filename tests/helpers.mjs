// Shared test helpers: build the same ctx lab-view.js hands to checks, for
// one camera or several, without a browser.
import { getCamera } from "../data/cameras.js";
import { getScene } from "../js/scenes/index.js";
import { derive, normalizeSettings, settingsFromPreset, frameCenter, MAX_FRAME_ZOOM } from "../js/sim/camera-model.js";

export function rig(sceneOrId, cameraId, preset = {}, def = {}) {
  const scene = typeof sceneOrId === "string" ? getScene(sceneOrId) : sceneOrId;
  const camera = getCamera(cameraId);
  const settings = normalizeSettings(settingsFromPreset({ ...scene.defaults, ...preset }, scene), camera, scene);
  const derived = derive(settings, camera, scene);
  return { scene, camera, settings, derived, def, view: frameView(scene, derived, def), recording: !!def.recording, start: settings };
}

// Same as lab-view's frameView: a straight zoom on the subject.
export function frameView(scene, derived, def = {}) {
  const c = frameCenter(def.aim || scene.aim, derived.frameZoom, scene.maxFrameZoom || MAX_FRAME_ZOOM);
  return { x: c.x, y: c.y, zoom: derived.frameZoom };
}

// ctx for a station: rigs = { id: rig(...) }, active = id of the one being driven.
export function ctxFor(rigs, active) {
  const a = rigs[active];
  return { settings: a.settings, derived: a.derived, camera: a.camera, scene: a.scene, view: a.view, rigs, activeRig: active, stats: null, touchedKeys: new Set() };
}

export function allPass(criteria, ctx) {
  return criteria.map((c) => ({ label: c.label, ...c.test(ctx) })).filter((r) => !r.pass);
}
