# Working in this repo

Camera Lab: a video camera simulator for MUS 248 (Chapman University). Vanilla HTML/CSS/JS
ES modules + WebGL2 on GitHub Pages. **No framework, no build step, no server, no
dependencies.** `package.json` exists only so `node --test` treats `js/*.js` as modules.

## Before you commit, always

```bash
npm test                                  # physics, station data, every challenge passable
python3 -m http.server 8124 &             # from the repo root
node tools/smoke.mjs                      # every station in Chromium, desktop + phone
```

For anything user-visible, also *look* at it: `node tools/smoke.mjs http://localhost:8124 /tmp/shots`
writes a screenshot of every station at both sizes. Chromium is at `/opt/pw-browsers`. Several
bugs here were only visible on the page (a blank scene from one NaN, a toast peeking out on
phones, monitors too small to tap).

## Hard rules

- **Never ship a step or challenge nobody can pass.** It happened once (the "both sharp" step).
  `tests/stations.test.mjs` brute-forces single-camera challenges on every body they can hand
  out; multi-camera challenges need a known-good answer in `ANSWERS` there. Add one when you add
  a station. If a physics change makes an old challenge impossible, fix it without changing what
  the homework teaches (e.g. Low-Light now excludes the GH5, whose real kit lens is too slow).
- **Homework 1 and 2 are live coursework.** Don't change what they teach or how they read.
  Physics fixes that ripple into them are fine if the tests still pass; say so in the commit.
- **Gear details get verified before they become student instructions.** Anything not from a
  spec sheet or the instructor goes in README → *Technical verification (open)*. Say plainly
  what's unverified; don't write around it.
- **This repo is public.** No student names, passwords, stream keys or account details.
  Performer names in reference photos get cropped; see `docs/reference/README.md`.
- **American spellings** in anything students read: color, center, gray.
- **Mobile is primary.** Every control must work by touch at 390 px wide.

## Where things live

`data/stations.js` (all course content) · `data/cameras.js` (bodies) · `js/sim/` (camera math,
color, auto exposure) · `js/render/renderer.js` (WebGL) · `js/scenes/` (stage, park, Salmon +
auditorium via `hall-kit.js`) · `js/lab/` (lab view, guided/challenge engines, checks) ·
`js/ui/` (dials, HUDs, tools, AX100 panel, bug dialog) · `stations/` (module stations: Finish,
livestream) · `docs/COURSE_PLAN.md` (the weekly arc and why) · `docs/reference/` (real photos,
not published).

## Facts from the instructor (Oct 2026) that the content depends on

- Standard Gear Kit gig anywhere: AX100s at F4 · 3 dB · 1/60 (then correct to the room), 3200K,
  AF. **Both cameras the same** is the rule that matters.
- Salmon: AX100 backup wide at 3800K, A5 G2 — the numbers that match the RovoCam (which runs on
  auto WB) when cut together. 3200 there is "probably fine". With a third camera that has no
  A/G shift, 3200 is the easier common default.
- Salmon livestream: static wide RovoCam on **Camera 2**; Camera 1 (second angle) is never used.
  No cuts, fades or titles during a recital. On Air / Off Air in ATEM Software Control.
- AX100: pressing a selected value again ("double press") makes it auto; MANUAL sends iris,
  shutter and gain to auto and auto exposure overexposes a dark hall.
- The GH5 only has the 14–140 (28 mm eq. at its widest). A wider MFT lens is being considered.
- Musco (from the MUS 248 Musco Gig Checklist): Panasonic UE150 PTZs on an RP150 controller;
  house defaults F5.6 · 0 dB · A/3200K · R/B gain 0 · R/B pedestal 0; set exposure under the
  brightest cue. Multiview map (instructor, Oct 17): **2 static wide — never touch it**, 5
  conductor cam, 7 backstage (useless), 8 PowerPoint/video (usually empty), 1/3/4/6 close-ups, two
  per camera operator (who runs which pair is decided at the gig). Numbers are the Panasonic
  cameras' own, the same on the RP150 and the multiview.

## Git

Work on a `claude/…` branch (it publishes a preview — `docs/BRANCH_PREVIEWS.md`), then merge to
`main` once tests and smoke pass. Fetch and merge before pushing. The instructor reviews on a
phone against the live site, not by reading diffs.
