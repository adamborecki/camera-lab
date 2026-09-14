// Scene registry. A scene is data + Canvas2D layer drawings (see stage.js for
// the full shape). Add a scene by creating a module and listing it here.
import { stageScene } from "./stage.js";
import { parkScene } from "./park.js";

export const scenes = [stageScene, parkScene];

export function getScene(id) {
  return scenes.find((s) => s.id === id) || scenes[0];
}
