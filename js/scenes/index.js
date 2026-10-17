// Scene registry. A scene is data + Canvas2D layer drawings (see stage.js for
// the full shape). Add a scene by creating a module and listing it here.
// Salmon Recital Hall is one room with many programs; each program is its own
// scene id ("salmon-choir"), built by makeSalmonScene.
import { stageScene } from "./stage.js";
import { parkScene } from "./park.js";
import { makeHallScene, SALMON_PROGRAM_IDS, WIDE_VIEWS, WIDE_PROGRAM_IDS } from "./salmon.js";
import { makeMuscoScene } from "./musco.js";

const salmon = SALMON_PROGRAM_IDS.map((id) => makeHallScene("salmon", id));
const auditorium = ["piano-solo", "voice-strings", "choir", "chamber-orchestra"].map((id) => makeHallScene("auditorium", id));

const musco = [makeMuscoScene("concert"), makeMuscoScene("preshow")];

// Salmon drawn at 15 mm from the booth and the aisle, for lens shopping.
const wide = WIDE_VIEWS.flatMap((v) => WIDE_PROGRAM_IDS.map((id) => makeHallScene("salmon", id, v)));

export const scenes = [stageScene, parkScene, ...salmon, ...auditorium, ...musco, ...wide];

export function getScene(id) {
  return scenes.find((s) => s.id === id) || scenes[0];
}
