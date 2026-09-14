// Local, forgiving progress tracking (same shape as Sound Lab). No server, no
// PII — just enough state to know what's been opened/completed, plus the
// final camera settings from each challenge for the Canvas export.
const STORAGE_KEY = "cameralab.progress.v1";

function newSessionId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1) return parsed;
    }
  } catch (e) {
    /* corrupt or unavailable storage — start fresh */
  }
  const now = new Date().toISOString();
  return {
    version: 1,
    sessionId: newSessionId(),
    startedAt: now,
    lastUpdatedAt: now,
    stations: {},
    challenges: {},
    reflections: {},
  };
}

const state = loadState();

function save() {
  state.lastUpdatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* storage full/unavailable — progress just won't persist */
  }
}

function ensureStation(id) {
  if (!state.stations[id]) {
    state.stations[id] = { opened: false, completed: false, interactions: 0, activeMs: 0 };
  }
  return state.stations[id];
}

export function getState() {
  return state;
}

export function recordOpen(id) {
  const s = ensureStation(id);
  if (!s.opened) {
    s.opened = true;
    s.firstOpenedAt = new Date().toISOString();
  }
  save();
}

export function recordInteraction(id) {
  ensureStation(id).interactions += 1;
  save();
}

export function addActiveTime(id, ms) {
  if (!(ms > 0)) return;
  const s = ensureStation(id);
  s.activeMs = (s.activeMs || 0) + ms;
  save();
}

export function isComplete(id) {
  return !!state.stations[id]?.completed;
}

export function markComplete(id) {
  const s = ensureStation(id);
  if (!s.completed) {
    s.completed = true;
    s.completedAt = new Date().toISOString();
    save();
  }
}

// Keeps the best attempt: a pass is never overwritten by a later fail.
export function recordChallenge(id, result) {
  state.challenges = state.challenges || {};
  const prev = state.challenges[id];
  const attempts = (prev?.attempts || 0) + 1;
  if (!prev || result.passed || !prev.passed) {
    state.challenges[id] = { ...result, attempts, at: new Date().toISOString() };
  } else {
    prev.attempts = attempts;
  }
  save();
}

export function setReflection(key, text) {
  state.reflections = state.reflections || {};
  state.reflections[key] = text;
  save();
}

export function completionSummary(ids) {
  return { done: ids.filter((id) => isComplete(id)).length, total: ids.length };
}
