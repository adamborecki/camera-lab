// Scene registry. A scene is data + Canvas2D layer drawings (see stage.js for
// the full shape). Add a scene by creating a module and listing it here.
// Salmon Recital Hall is one room with many programs; each program is its own
// scene id ("salmon-choir"), built by makeSalmonScene.
import { stageScene } from "./stage.js";
import { parkScene } from "./park.js";
import { makeHallScene, SALMON_PROGRAM_IDS } from "./salmon.js";

const salmon = SALMON_PROGRAM_IDS.map((id) => makeHallScene("salmon", id));
const auditorium = ["piano-solo", "voice-strings", "choir", "chamber-orchestra"].map((id) => makeHallScene("auditorium", id));

export const scenes = [stageScene, parkScene, ...salmon, ...auditorium];

export function getScene(id) {
  return scenes.find((s) => s.id === id) || scenes[0];
}
