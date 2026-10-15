// Shared test helpers: build the same ctx lab-view.js hands to checks, for
// one camera or several, without a browser.
import { getCamera } from "../data/cameras.js";
import { getScene } from "../js/scenes/index.js";
import { derive, normalizeSettings, settingsFromPreset } from "../js/sim/camera-model.js";

export function rig(sceneOrId, cameraId, preset = {}, def = {}) {
  const scene = typeof sceneOrId === "string" ? getScene(sceneOrId) : sceneOrId;
  const camera = getCamera(cameraId);
  const settings = normalizeSettings(settingsFromPreset({ ...scene.defaults, ...preset }, scene), camera, scene);
  const derived = derive(settings, camera, scene);
  return { scene, camera, settings, derived, def, view: frameView(scene, derived, def), recording: !!def.recording };
}

// Same as lab-view's frameView: aimed at the subject, clamped inside the scene.
export function frameView(scene, derived, def = {}) {
  const frame = derived.frameZoom;
  const half = 0.5 / frame;
  const [ax, ay] = def.aim || scene.aim || [0.5, 0.5];
  const clamp = (v) => Math.min(1 - half, Math.max(half, v));
  return { x: clamp(ax), y: clamp(ay), zoom: frame };
}

// ctx for a station: rigs = { id: rig(...) }, active = id of the one being driven.
export function ctxFor(rigs, active) {
  const a = rigs[active];
  return { settings: a.settings, derived: a.derived, camera: a.camera, scene: a.scene, view: a.view, rigs, activeRig: active, stats: null, touchedKeys: new Set() };
}

export function allPass(criteria, ctx) {
  return criteria.map((c) => ({ label: c.label, ...c.test(ctx) })).filter((r) => !r.pass);
}
