# Camera Lab

A museum-floor-style **video camera simulator** for learning exposure, motion, focus and color — sibling of Sound Lab. Static HTML/CSS/JS (ES modules + WebGL2), no build step, no backend. Works on phones and laptops.

## Running locally

```bash
python3 -m http.server 8124
```

Then open `http://localhost:8124/`. Add `?debug=1` for the developer panel (every internal number, frame timing) and a `window.cameraLab` console hook: `cameraLab.set("aperture", 1.4)`, `cameraLab.get()`, `cameraLab.setScene("park")`, `cameraLab.setCamera("g50")`, `cameraLab.frame()`.

The original design brief is in [`docs/design-handoff.txt`](docs/design-handoff.txt).

## How it's built

Three layers, kept separate on purpose:

```
SIMULATOR        js/sim (camera math), js/render (WebGL2), js/scenes (layered scenes)
   ↓
ACTIVITY LAYER   js/lab (lab view, guided / challenge / playground engines, feedback checks)
   ↓
COURSE CONTENT   data/stations.js, data/cameras.js
```

### Imaging pipeline (all in linear light)

1. **Scene** — each scene is a stack of illustrated layers (Canvas2D), each at a real distance (meters) and lit by a named light with a color temperature and intensity. Lamps are genuinely many stops brighter than a white shirt, so highlights clip and bloom like real ones.
2. **Exposure** — `EV = log2(N²/t) + ND`. Picture exposure in stops = `scene.ev100 − EV + gainStops`. Aperture uses exact third-stop values, so f/2.8 → f/4 is exactly one stop.
3. **Framing & crop factor** — each scene is drawn at one field of view, written as the 35mm-equivalent focal length that frames it that way (`scene.equivFocal`). The lens setting is in those same equivalent millimetres, so it means the same shot on any body, while the real focal length on the barrel is `focal / crop`. Keep the real lens and switch to a smaller sensor and the shot zooms in by the crop factor, because the sensor only covers the middle of the image circle — the sim does that by cropping into the drawn scene, aimed at `scene.aim`. So it can't frame wider than the scene, and the zoom stops at `MAX_FRAME_ZOOM` (3×) before the 1280px scene image softens — tighter than a 5.6× camcorder crop would really go.
4. **Depth of field** — thin-lens circle of confusion per layer, from focal length, f-number, focus distance and sensor size. At a matched framing a smaller sensor runs a shorter lens, so it gets deeper focus for free; at the same real lens it sees the same blur, just cropped and magnified. "Acceptably sharp" is a blur circle under `SHARP_PX` (2) pixels of the displayed 1280-wide frame — the usual 0.03 mm-on-full-frame criterion is a print standard that works out to ~1 px here, finer than the picture can draw — so the focus map's in-focus band lands exactly where visible blur begins, at any zoom. Blur is computed in scene pixels (the view magnifies it afterwards), and blurred layers are cached and only re-blurred when focus/aperture/lens/camera change.
5. **Motion blur** — moving layers are integrated over the time the shutter is actually open (sub-frame samples), and the picture updates at the chosen frame rate. Shutters slower than a frame repeat frames, like camcorder slow shutter.
6. **Sensor** — photon shot noise + read noise (sensor-size dependent), per-channel clipping, then ISO/dB gain (so gain amplifies noise), white balance as RGB gains from kelvin (blackbody), highlight desaturation, a Rec.709-ish tone curve with a shoulder, sRGB out.
7. **Monitoring** — histogram/waveform read back the rendered frame (before zebras/peaking overlays), so scopes always agree with the picture.

## Adding things

- **A station** — add an entry to [`data/stations.js`](data/stations.js). Guided steps are `{ text, when(ctx) → bool, done, notYet? }`, judged only when the student presses **Check** (never automatically), so idly landing on the right value isn't declared a win; `notYet` can be a string or `fn(ctx) → string` to explain what's still off. Challenges use range-based `checks` from [`js/lab/feedback.js`](js/lab/feedback.js) so many solutions pass.
- **A camera body** — add an entry to [`data/cameras.js`](data/cameras.js) (sensor size, noise, lens range, ISO vs dB gain, ND labels, shutter list) and optionally a HUD style in [`js/ui/hud.js`](js/ui/hud.js).
- **A scene** — create a module like [`js/scenes/stage.js`](js/scenes/stage.js) (lights, `ev100`, `equivFocal`, `aim`, `subjects`, layers with `depth` or `depthRange`, optional `motion`) and list it in [`js/scenes/index.js`](js/scenes/index.js).
- **A monitoring tool** — add a panel factory to [`js/ui/tools.js`](js/ui/tools.js) and a `TOOL_INFO` entry.

## Camera notes

- Sony FDR-AX100: ND switch OFF / 1 / 2 / 3 ≈ 1/4, 1/16, 1/64 (2, 4, 6 stops), gain in dB, 1.0-type sensor.
- Canon VIXIA HF G50: ND is Automatic/Off only (no manual strengths), gain 0–24 dB in 1 dB steps, 1/2.3-type sensor.
- Panasonic GH5: Micro Four Thirds, ISO from 200, no built-in ND (screw-on ND2–ND64).
- Values are simplified for teaching; relationships (stops, angles, crop) are real — except the zoom range, capped at 3× by the scene image's resolution.

## Finish & Canvas

The Finish page produces a readable summary plus a `camera-lab-receipt-v1` JSON block (per-station engagement, challenge results with final settings, reflections, SHA-256 checksum), in the same shape as Sound Lab's export.
