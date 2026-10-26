// Every grading tolerance in one place, with what it's for. Color is in
// mired (how far apart two white balances are, the way the eye sees it:
// 10 mired is about the same visible step at 3200K as at 5600K) and in
// G/M steps (WB_GM_STEP), never in raw kelvin.

export const TOL = {
  // Two cameras that cut together (matching stations, sgk-gig, Musco).
  // ±5 mired is about where two monitors side by side stop looking
  // different. It's deliberately just under the GH5's built-in lean at the
  // AX100's 3200K (5.5 mired in the sim), so "same kelvin" alone doesn't
  // match a different brand: the point of match-gh5. ±1.5 G/M steps means
  // the RovoCam's green (about 2 steps) still has to be shifted for.
  colorMatch: { mired: 5, gm: 1.5 },
  // Shading Musco's PTZs (all one model) is finer work than matching two
  // brands: R/B gain trims well under a white-balance step, so tighter.
  shadingMatch: { mired: 3, gm: 1 },
  // Same brightness on the performers, in stops: a ⅓-stop jump is visible
  // on a cut.
  brightnessMatch: 0.34,
  // Blacks (pedestal), display units, worst channel.
  blacksMatch: 0.004,
  // "Set the house kelvin" (sgk-gig, the AX100 station): the number itself,
  // so ±100K is just "you dialed 3200".
  whiteBalance: 100,
  // "Right light source" in Homework 2–3 single-camera challenges (wbNear):
  // a coarse ±400K, so any sensible indoor or daylight setting passes.
  // Homework 2 is live coursework and prints this number, so it stays.
  wbNear: 400,
};
