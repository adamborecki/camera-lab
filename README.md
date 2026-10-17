Check it out live!

https://adamborecki.github.io/camera-lab


# Camera Lab

A museum-floor-style **video camera simulator** for learning exposure, motion, focus and color — sibling of Sound Lab and Mixer Lab. Static HTML/CSS/JS (ES modules + WebGL2), no build step, no backend. Works on phones and laptops.

Built for MUS 248 at Chapman University (student recording engineers), so the cameras and rooms are Chapman's — the Standard Gear Kit's Sony AX100s, the GH5 and G50, Salmon Recital Hall's AJA RovoCams and its ATEM livestream — but nothing here is Chapman-only: the physics and the habits transfer to any camera and any hall. Built almost entirely by "vibe coding" with Claude, with the instructor reviewing on a phone against the live site.

## The homework

Stations are grouped into weekly homeworks (the `SECTIONS` in `data/stations.js`), each a mix of guided stations and range-graded challenges, ending in a Finish page that produces a summary to paste into Canvas.

| Section | What it's for |
|---|---|
| Homework 1 — Exposure Basics | aperture, shutter, ISO/gain, frame rate, the exposure triangle |
| Homework 2 — Go Further | white balance, ND, focus & depth of field, sensor size, three challenges |
| Homework 3 — Standard Gear Kit & Salmon | warm-ups on a random body (spaced retrieval of HW1–2), the AX100's real controls and traps, framing a static wide, matching cameras (AX100↔AX100, GH5→AX100, AX100→RovoCam), the Salmon livestream, a two-camera gig challenge |
| Homework 4 — Musco: Many Cameras, One Look | warm-ups from HW3; one RP150 controller for five UE150 PTZs on a multiview; reading the controller's screen against the house defaults; R/B gain vs gain; setting exposure under the brightest cue (not work lights); shading four cameras to match the static wide |
| Free play | the Playground (everything unlocked), and **Lens Shopping**: the GH5 with the owned 14–140 and three wider candidates (Lumix 12–60, Olympus 9–18, Laowa 7.5) from the booth, the center aisle and down front in Salmon — find the longest lens that still fits everyone |

Planned next (not built): PTZ operation (joystick, zoom, focus, taking a call), switching on the ATEM Constellation (program/preview, calling shots, ISOs), and a Musco capstone. Pedagogy notes and the arc are in [`docs/COURSE_PLAN.md`](docs/COURSE_PLAN.md).

## Running locally

```bash
python3 -m http.server 8124
```

Then open `http://localhost:8124/`. Add `?debug=1` for the developer panel (every internal number, frame timing) and a `window.cameraLab` console hook: `cameraLab.set("aperture", 1.4)`, `cameraLab.get()`, `cameraLab.setScene("park")`, `cameraLab.setCamera("g50")`, `cameraLab.frame()`.

The original design brief is in [`docs/design-handoff.txt`](docs/design-handoff.txt).

## Checks

```bash
npm test                     # node --test: physics, station data, every challenge is passable
python3 -m http.server 8124 &
node tools/smoke.mjs         # headless Chromium: every station, desktop + phone, AX100, livestream & lens-shopping walkthroughs
```

`npm test` brute-forces each single-camera challenge on every body it can hand out, and checks a known-good answer for each multi-camera one — an impossible step has shipped before. See [`CLAUDE.md`](CLAUDE.md).

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
6. **Sensor** — photon shot noise + read noise (sensor-size dependent), per-channel clipping, then ISO/dB gain (so gain amplifies noise), white balance as RGB gains from kelvin (blackbody) plus the A–B / G–M shift and each body's own color lean, highlight desaturation, a Rec.709-ish tone curve with a shoulder, sRGB out.
7. **Monitoring** — histogram/waveform read back the rendered frame (before zebras/peaking overlays), so scopes always agree with the picture.
8. **Auto functions** — auto exposure (`js/sim/auto-exposure.js`) meters the *whole* rendered frame and pushes its average toward mid grey, like a camcorder — so in a dark hall it brightens until the performers blow out while the camera's own meter (the blue line on the Meter) reads "fine". Autofocus focuses on whatever is in the middle of the frame. Auto white balance lands where the scene says a camcorder's AWB settles (`scene.awb`).
9. **Several cameras** — a station with `rigs` puts several cameras on one stage (each with its own settings, angle and aim) on a monitor wall. One WebGL context renders them all: each camera keeps its own depth-of-field cache (a renderer "slot"), and a camera off to one side is faked with per-layer parallax (near layers slide more than far ones).

### Scenes

- **Concert Stage** and **Sunny Park** — the original illustrated scenes.
- **Salmon Recital Hall** (`js/scenes/salmon.js`) — the hall from the booth, drawn in real perspective (`js/scenes/hall-kit.js` projects every wall, riser and performer from meters) after the instructor's photos in `docs/reference/`. Fourteen programs: solo piano, violin/clarinet/brass with piano, piano duo, solo guitar, choir on risers, mariachi, vocal jazz (singers at mics with piano, bass, drums, guitar), CME (band with keys, guitars, drums, singers, horn, wedges and PA), percussion setup, early music in low light, chamber orchestra, singer with string quartet. Exposure is set so the AX100's Salmon numbers (F4 · 3 dB · 1/60) are correct.
- **Auditorium** — the same programs in a generic dark proscenium hall: a Standard Gear Kit gig anywhere, and the room where auto exposure fails.

### Camera bodies with their real controls

`bodyControls: true` on a station swaps the generic dials for a replica of the body. For Musco's UE150s it's the **Panasonic AW-RP150 controller** (`js/ui/rp150-panel.js`, after the booth photo): camera selection buttons that switch which camera you control, the screen (iris/zoom/focus bars, R/B gain and pedestal values, gain, color temp), A/3200K · B/5600K · ATW · AWB, knobs for R/B GAIN, R/B PED, M.PED, IRIS (+ AUTO) and gain on F1, the zoom lever and FOCUS AUTO. A rig marked `readOnly` (Camera 2, the static wide) can be selected to read, never changed. For an AX100 (`js/ui/ax100-panel.js`): values on the touchscreen (tap to select, tap again to hand back to auto), the side buttons, the MANUAL ring, the MANUAL button (all three to auto — the trap), WB menu with Color Temp and A–B / G–M shift, ND switch, AF/MF, zoom lever. Other bodies use the generic dials for now.

## Adding things

- **A station** — add an entry to [`data/stations.js`](data/stations.js). Guided steps are `{ text, when(ctx) → bool, done, notYet? }`, judged only when the student presses **Check** (never automatically), so idly landing on the right value isn't declared a win; `notYet` can be a string or `fn(ctx) → string` to explain what's still off. Challenges use range-based `checks` from [`js/lab/feedback.js`](js/lab/feedback.js) so many solutions pass.
- **A multi-camera station** — give it `rigs: [{ id, label, camera, start, reference?, angle: { shift }, aim: [u, v] }]`; checks like `checks.colorMatches("A", { rig: "B" })` compare them. Add a known-good answer to `tests/stations.test.mjs`.
- **A hall program** — add an entry to `PROGRAMS` in [`js/scenes/salmon.js`](js/scenes/salmon.js) (performers and furniture at real positions in meters); it appears in Salmon and can be added to the auditorium list in `js/scenes/index.js`.
- **A camera body** — add an entry to [`data/cameras.js`](data/cameras.js) (sensor size, noise, lens range, ISO vs dB gain, ND labels, shutter list) and optionally a HUD style in [`js/ui/hud.js`](js/ui/hud.js).
- **A scene** — create a module like [`js/scenes/stage.js`](js/scenes/stage.js) (lights, `ev100`, `equivFocal`, `aim`, `subjects`, layers with `depth` or `depthRange`, optional `motion`) and list it in [`js/scenes/index.js`](js/scenes/index.js).
- **A monitoring tool** — add a panel factory to [`js/ui/tools.js`](js/ui/tools.js) and a `TOOL_INFO` entry.

## Camera notes

Spec-sheet values where they exist; teaching values otherwise. Relationships (stops, angles, crop) are real.

- **Sony FDR-AX100** — 1.0-type sensor (2.7× crop); lens 29–348 mm equivalent, F2.8 wide → F4.5 tele, iris to F11 (Sony spec sheet); ND switch OFF / 1 / 2 / 3 ≈ 1/4, 1/16, 1/64 (2, 4, 6 stops); gain in dB.
- **Canon VIXIA HF G50** — 1/2.3-type (5.6× crop); lens 29.3–601 mm equivalent in UHD 4K, f/1.8 wide → f/2.8 tele (Canon spec sheet); gain 0–24 dB; built-in ND treated as automatic-only.
- **Panasonic GH5** — Micro Four Thirds (2×); wears the department's Lumix G Vario 14–140 mm f/3.5–5.6 (28–280 mm eq.); ISO from 200; screw-on ND.
- **Panasonic AW-UE150** (Musco PTZs) — 1-type MOS (2.7×), 20× zoom, 8.8–176 mm = 24.5–490 mm eq., F2.8–4.5, gain to 42 dB (retail spec listings). Shading: R/B gain and R/B/master pedestal, 0 = house default.
- **AJA RovoCam** (Salmon, reference only) — Sony FCB-ER8300 block, 1/2.3-type, F1.8 (AJA spec sheet); runs on auto white balance in Salmon.
- Generic **Camera Lab S35** and **Full-Frame Mirrorless** bodies have no lens limits.
- The sim's zoom stops at 3× (3.5× in the halls) because of the 1280 px scene images.

### Technical verification (open)

Not yet checked on the real gear — confirm before treating as instructions:

- AX100: button names and positions; that the **MANUAL** button sends iris, shutter and gain to auto together (instructor's description; Sony's guide describes a PROGRAM AE button for that); double-press-to-auto on the touchscreen; gain range and step (sim: 0–33 dB in 3 dB steps); WB shift ranges (sim: ±7) and step size (sim: 5 mireds per A–B step, 1.5% green per G–M step).
- GH5 WB adjust range (sim: ±9) and how it's written on the body.
- G50: whether the ND can be set manually.
- RovoCam: its exposure settings in Salmon (sim: F4 · 3 dB · 1/60 — unknown) and the iris range at tele.
- Salmon's AWB result (`scene.awb` = 3800K A5 G2) encodes the instructor's observation that an AX100 at those numbers matches the RovoCam — not a measurement.
- Each body's `colorBias` is illustrative, not measured.
- Salmon's geometry: length and width now follow the hall's floor plan (adamborecki/salmon `docs/FLOOR_PLAN.md`: 18.8 m from the back-of-house apex to the upstage wall, 16.6 m wide; the sim's camera is ~19 m from the upstage wall). Still estimated: the booth camera's height (sim 5 m), where the performers stand (sim 12–17 m from the booth), and the aisle and down-front spots in Lens Shopping. Its answers (booth: anything; aisle at 5 m: 24 mm or wider; down front: 18 mm or wider) depend on those.
- Salmon livestream: the multiview layout beyond the booth photo, Camera 1 vs 2 assignment, and the Production Studio 4K → Mini Extreme ISO chain.
- Musco: the camera map, from the instructor (Oct 17) by multiview box: 1, 3, 4, 6 close-ups (two per operator), 2 static wide, 5 conductor cam, 7 backstage, 8 PowerPoint/video. **Disagrees with the gig checklist** (mus248 `musco-gig-checklist.md`: "Camera 3 is the static wide") — is the checklist's number an RP150 button that differs from the ATEM input, or out of date? The sim assumes RP150 buttons = multiview boxes. Which operator runs which pair, and what each close-up usually covers, are made up (sim: 1 flutes house left, 3 center over the conductor, 4 brass house left, 6 horns & percussion house right). RP150 knob ranges and step sizes (sim: ±200; R/B gain step 0.15% of the channel, pedestal step 0.15% of full scale — teaching values); gain on F1; what holding A/3200K does; the stage's real color temperature and the pre-show work lights (sim: 3200K concert, ~4300K work lights about 2⅓ stops darker).

## Finish & Canvas

The Finish page produces a readable summary plus a `camera-lab-receipt-v2` JSON block (per-station engagement; for guided steps, failed Checks and seconds per step; hints and resets; challenge results with every camera's final settings; reflections; optional app feedback; bug reports from the 🐞 button; SHA-256 checksum), in the same shape as Sound Lab's export. It's formative: the point is to see where students got stuck, and what's broken.

## Branch previews

Any `claude/…`, `feature/…`, `preview/…` or `skin/…` branch publishes at `https://adamborecki.github.io/camera-lab/branch/<slug>/` — see [`docs/BRANCH_PREVIEWS.md`](docs/BRANCH_PREVIEWS.md) (needs Pages set to deploy from GitHub Actions, once).
