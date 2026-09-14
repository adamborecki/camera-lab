// Activity engines — the teaching layer on top of the lab. They never touch
// the renderer; they read ctx() and ask the lab to change scene/camera/tools.
//
//  guided      step list: each step has text and a `when(ctx)` goal. When a
//              change satisfies it, the step's `done` text appears (+ Next).
//  challenge   a brief and a list of criteria (lab/feedback.js checks), only
//              judged when the student presses "Check my shot".
//  playground  free exploration; completes after some real fiddling.
import { runChecks } from "./feedback.js";
import { markComplete, recordChallenge, isComplete } from "../progress.js";
import { gainOptions, formatDistance } from "../sim/camera-model.js";

export function createActivity(api) {
  const s = api.station;
  if (s.mode === "guided") return guided(api);
  if (s.mode === "challenge") return challenge(api);
  return playground(api);
}

function guided(api) {
  const s = api.station;
  let index = 0;
  let satisfied = false;
  api.el.innerHTML = `
    <div class="step-card">
      ${s.intro ? `<p class="intro">${s.intro}</p>` : ""}
      <p class="step-count"></p>
      <p class="step-text"></p>
      <p class="step-done" hidden></p>
      <div class="step-actions">
        <button type="button" class="chip step-hint-btn">Hint</button>
        <button type="button" class="btn btn-start step-next" hidden>Next →</button>
      </div>
      <p class="step-hint" hidden></p>
    </div>`;
  const q = (sel) => api.el.querySelector(sel);
  const countEl = q(".step-count");
  const textEl = q(".step-text");
  const doneEl = q(".step-done");
  const nextBtn = q(".step-next");
  const hintBtn = q(".step-hint-btn");
  const hintEl = q(".step-hint");

  function show() {
    const step = s.steps[index];
    satisfied = false;
    if (step.enter) {
      if (step.enter.camera) api.setCamera(step.enter.camera);
      if (step.enter.scene) api.setScene(step.enter.scene, step.enter.settings);
      else if (step.enter.settings) api.apply(step.enter.settings);
      if (step.enter.unlock) api.unlock(step.enter.unlock);
      if (step.enter.tool) api.showTool(step.enter.tool);
    }
    countEl.textContent = `Step ${index + 1} of ${s.steps.length}`;
    textEl.innerHTML = step.text;
    doneEl.hidden = true;
    nextBtn.hidden = true;
    hintEl.hidden = true;
    hintBtn.hidden = !step.hint;
    hintEl.textContent = step.hint || "";
    // Some goals may already be true on entry (e.g. after a scene switch).
    if (step.checkOnEnter) evaluate();
  }

  function evaluate() {
    const step = s.steps[index];
    if (satisfied || !step) return;
    if (step.when(api.ctx())) {
      satisfied = true;
      doneEl.hidden = false;
      doneEl.innerHTML = `<span class="ok-mark" aria-hidden="true">✓</span> ${step.done}`;
      if (index < s.steps.length - 1) {
        nextBtn.hidden = false;
        nextBtn.textContent = "Next →";
      } else {
        markComplete(s.id);
        nextBtn.hidden = false;
        nextBtn.textContent = "Station complete — back to the floor";
      }
    }
  }

  nextBtn.addEventListener("click", () => {
    if (index < s.steps.length - 1) {
      index++;
      show();
    } else {
      location.hash = "#/";
    }
  });
  hintBtn.addEventListener("click", () => (hintEl.hidden = !hintEl.hidden));

  return {
    start: show,
    onChange: evaluate,
    debugState: () => ({ step: index, satisfied }),
  };
}

function settingsSummary(ctx) {
  const { settings: st, camera, scene } = ctx;
  const g = gainOptions(camera).reduce((a, b) => (Math.abs(b.value - st.gainStops) < Math.abs(a.value - st.gainStops) ? b : a));
  const nd = camera.nd.steps.find((n) => n.stops === st.nd);
  return {
    scene: scene.title,
    camera: camera.name,
    frameRate: `${st.fps} fps`,
    shutter: `1/${st.shutter}`,
    aperture: `f/${st.aperture}`,
    gain: g.label,
    nd: nd ? nd.label : "OFF",
    whiteBalance: `${Math.round(st.wb)}K`,
    focus: formatDistance(st.focus),
  };
}

function challenge(api) {
  const s = api.station;
  api.el.innerHTML = `
    <div class="step-card challenge-card">
      <p class="step-count">Challenge</p>
      <p class="step-text">${s.brief}</p>
      ${s.goals ? `<ul class="goal-list">${s.goals.map((g) => `<li>${g}</li>`).join("")}</ul>` : ""}
      <div class="step-actions">
        <button type="button" class="btn btn-start submit-btn">Check my shot</button>
      </div>
      <div class="results" aria-live="polite"></div>
    </div>`;
  const results = api.el.querySelector(".results");
  const btn = api.el.querySelector(".submit-btn");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const stats = await api.freshStats();
    const ctx = { ...api.ctx(), stats };
    const res = runChecks(s.criteria, ctx);
    const passed = res.every((r) => r.pass);
    results.innerHTML = `
      <p class="result-head ${passed ? "pass" : "fail"}">${passed ? "✓ Passed — nice camera work." : "✗ Not yet — here's what the footage shows:"}</p>
      <ul class="result-list">${res
        .map((r) => `<li class="${r.pass ? "pass" : "fail"}"><span aria-hidden="true">${r.pass ? "✓" : "✗"}</span> <strong>${r.pass ? "OK" : "Problem"}:</strong> ${r.detail || r.label}</li>`)
        .join("")}</ul>
      ${passed ? `<p class="result-note">Your settings are saved for the Finish page. Other combinations would also have worked — try another camera!</p>` : ""}`;
    recordChallenge(s.id, { title: s.title, passed, settings: settingsSummary(ctx), failed: res.filter((r) => !r.pass).map((r) => r.label) });
    if (passed) markComplete(s.id);
    btn.disabled = false;
  });
  return { start() {}, onChange() {} };
}

function playground(api) {
  const s = api.station;
  let changes = 0;
  api.el.innerHTML = `<div class="step-card"><p class="step-text">${s.intro || "Everything unlocked. Break things. Fix them."}</p></div>`;
  return {
    start() {},
    onChange() {
      changes++;
      if (changes >= 12 && !isComplete(s.id)) markComplete(s.id);
    },
  };
}
