// Rough time-on-task tracking, one active station at a time. Not fussy: it
// pauses while the tab is hidden (Page Visibility API) and after IDLE_MS
// with no input (a tab left open on a station overnight logged 128 "active"
// minutes once), and starts again on the next touch, key or scroll. Good
// enough for an approximate homework-engagement signal, not a stopwatch.
import { addActiveTime } from "./progress.js";

const IDLE_MS = 3 * 60 * 1000; // reading a brief or watching the picture counts; longer doesn't

let currentId = null;
let segmentStart = null;
let lastInput = Date.now();

// Ends the running segment at `end` (idle: the last input plus the grace).
function commit(end = Date.now()) {
  if (currentId && segmentStart != null) {
    addActiveTime(currentId, Math.max(0, end - segmentStart));
  }
  segmentStart = null;
}

function resumeSegment() {
  if (currentId && !document.hidden) segmentStart = Date.now();
}

export function setActiveStation(id) {
  commit();
  currentId = id;
  lastInput = Date.now();
  resumeSegment();
}

export function clearActiveStation() {
  commit();
  currentId = null;
}

document.addEventListener("visibilitychange", () => {
  commit();
  resumeSegment();
});

for (const type of ["pointerdown", "keydown", "wheel", "input"]) {
  document.addEventListener(
    type,
    () => {
      lastInput = Date.now();
      if (segmentStart == null) resumeSegment();
    },
    { capture: true, passive: true },
  );
}

setInterval(() => {
  if (segmentStart != null && Date.now() - lastInput > IDLE_MS) commit(Math.max(segmentStart, lastInput + IDLE_MS));
}, 15000);

// Best-effort flush before the tab actually closes/unloads.
window.addEventListener("pagehide", commit);
