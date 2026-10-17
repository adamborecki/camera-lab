# Course plan: Camera Lab in MUS 248, Fall 2026

Living notes for whoever builds the next homework. Decisions here came from the instructor
(October 14–15, 2026); open questions are marked.

## Where this is going

Students are being built up to be **universally qualified** student recording engineers (MUS
248 lecture 7, "The Big Picture"): a Standard Gear Kit gig anywhere, Salmon recording and
livestream, and a Musco multicam gig as switcher or camera operator. Camera Lab is the
practice space for the camera half of that — the simulator equivalent of reps.

## The arc (one homework per weekly class)

| HW | Status | New | Spaced review |
|---|---|---|---|
| 1 | live | exposure triangle, aperture, shutter, ISO/gain, frame rate | — |
| 2 | live | white balance, ND, focus/DOF, sensor size, challenges | HW1 |
| 3 | built | the AX100's real controls and traps; framing a static wide; matching AX100↔AX100, GH5→AX100, AX100→RovoCam; Salmon livestream (program/preview/On Air); two-camera SGK gig | 3 warm-ups on a random body |
| 4 | built (preview branch `claude/hw4-musco`) | Musco: the multiview and the RP150's camera buttons, reading its screen against the house defaults, R/B gain vs gain, the brightest cue, shading four PTZs to match the static wide | warm-ups: Salmon numbers, AX100 off auto |
| 5 | planned | PTZ operation: joystick (inverted tilt), zoom rocker + speed, focus (AUTO on → off); shot sizes; taking a call ("camera 2, the trumpet solo") | framing, shading |
| 6 | planned | switching: program/preview, CUT/AUTO, calling shots, static wide as the safe shot, ISO vs program recordings | PTZ, matching |
| 7 | planned | capstone: a simulated Musco concert as switcher and as camera operator | everything |

Order principle (instructor): put the hands-on, "what do I actually press at the gig" skills
early; the Musco build is bigger, so it comes after the Standard Gear Kit + Salmon week.

## Design principles (with sources)

- **Spaced, interleaved retrieval.** Every homework opens with short warm-ups that re-use old
  skills on a randomly chosen body. Spaced retrieval beats massed practice (one meta-analysis
  subset g ≈ 0.74 — [summary](https://tipsforteachers.substack.com/p/research-bite-53-a-meta-analytic));
  interleaving helps most when learners must tell similar problems apart
  ([Loughborough](https://blog.lboro.ac.uk/cmc/?p=577)) — "which knob fixes *this*, on *this* body".
- **Whole-task first (4C/ID).** Build toward the real gig in increasingly complete versions,
  with part-task drills only in service of it, and fade support as students progress
  ([overview](https://edutechwiki.unige.ch/en/4C-ID)). Each homework ends in a challenge that's
  a whole (if small) gig.
- **Implicit scaffolding.** Let the interface teach — controls that behave like the real
  camera, feedback that names the consequence — rather than paragraphs of instructions
  ([PhET, Podolefsky et al.](https://arxiv.org/pdf/1306.6544)). Hence the AX100 replica.
- **Authentic tasks.** Real rooms, real gear, real house numbers ([JMTE editorial on music
  production education](https://pure.hud.ac.uk/en/publications/editorial-exploring-audio-and-music-technology-in-education-pedag/)).
- **Formative, not punitive.** The Finish summary records where students got stuck (failed
  Checks per step, time, hints) and their bug reports; the instructor reads it in aggregate.

## Quiz / study cards (MUS 248 repo) — notes, not decisions

The weekly quiz has ~80 camera questions but only 3 on white balance and none on matching
cameras, auto vs. manual, framing for bows, or program/preview. Candidates for a future quiz
session (decide there, not here): `camera_matching`, `ax100_auto_traps`, `static_wide_framing`,
`program_preview`, `focal_length_equivalent`. A note is also left in the mus248 repo.

## Lens shortlist for the GH5 (wider than its 28 mm-eq. 14–140)

Micro Four Thirds: equivalent = 2 × focal length. Prices are rough (Oct 2026); check retailers.

| Lens | Aperture | 35 mm eq. | Notes |
|---|---|---|---|
| Panasonic Lumix G Vario 12–60mm f/3.5–5.6 | variable | 24–120 mm | cheap (often a kit lens; roughly $200–400); only a little wider than the 14–140, but keeps a useful zoom |
| Olympus M.Zuiko 9–18mm f/4–5.6 | variable | 18–36 mm | cheapest autofocus option (often ~$300–450 used); takes 52 mm filters |
| Panasonic Lumix 7–14mm f/4 | constant | 14–28 mm | ~$800–1,100 new, less used; bulbous front, no screw-on ND |
| Laowa 7.5mm f/2 | prime | 15 mm | ~$450–500; manual focus (fine for a static wide); takes filters |
| Panasonic Leica 8–18mm f/2.8–4 | variable | 16–36 mm | ~$1,000; best all-rounder if budget allows |

The **Lens Shopping** station (Free play) puts the 12–60, 9–18 and Laowa 7.5 on the GH5 in Salmon. In
the sim's (estimated) Salmon, the booth needs nothing wider than the 14–140; a camera in the center aisle
~5 m from the stage needs ~24 mm for the choir; down front at the stage edge needs ~18 mm for the
mariachi. So: wider only pays off if the GH5 is going to stand close — which is a question about where
it goes, not about lenses.

Sources: [Panasonic 8–18 vs 7–14](https://mirrorlesscomparison.com/micro-four-thirds-lenses/panasonic-leica-8-18mm-f2-8-4-vs-lumix-7-14mm-f4/),
[Laowa 7.5 vs MFT wide zooms](https://mirrorlesscomparison.com/micro-four-thirds-lenses/laowa-7-5mm-mft-wide-angle-zooms/).

## Open questions for the instructor

- Musco: the map is now 2 static wide, 5 conductor cam, 7 backstage, 8 PowerPoint, 1/3/4/6
  close-ups (instructor, Oct 17) — but the gig checklist says "camera 3 is the static wide". Is
  that an RP150 button number that differs from the ATEM input, or out of date? And which
  operator runs which pair (1+3 and 4+6?).
- RovoCam exposure settings in Salmon; the RovoControl + joystick workflow in detail (photos).
- AX100 MANUAL button vs. PROGRAM AE; close-up photos of its side panel and LCD.
