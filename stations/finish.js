// Finish & Submit — same export pattern as Sound Lab: two reflections, a
// readable summary, and a JSON block with a SHA-256 checksum to paste into
// Canvas. Challenge entries include the student's final camera settings.
import { getState, setReflection, markComplete } from "../js/progress.js";
import { stations, SECTIONS } from "../data/stations.js";

const sectionLabel = Object.fromEntries(SECTIONS);

const STATION_ID = "finish";
const RECEIPT_SCHEMA = "camera-lab-receipt-v1";
const QUESTION_1 = "Describe one setting change that fixed one problem but created another.";
const QUESTION_2 = "If you were filming a real concert tomorrow, what would you set first, and why?";

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const toMinutes = (ms) => Math.round((ms / 60000) * 10) / 10;

export function mount(container) {
  const floor = stations.filter((s) => s.group !== "finish");
  container.innerHTML = `
    <p class="prompt">Two quick reflections, then generate a summary to paste into your Canvas submission.
      It records which stations you opened and finished, your challenge results and final camera
      settings, and roughly how long you spent.</p>
    <label class="reflection-label" for="reflection1">${QUESTION_1}</label>
    <textarea id="reflection1" class="reflection-input" rows="3"></textarea>
    <label class="reflection-label" for="reflection2">${QUESTION_2}</label>
    <textarea id="reflection2" class="reflection-input" rows="3"></textarea>
    <button class="btn btn-start" id="generate-btn" type="button">Generate My Summary</button>
    <div id="receipt-area" hidden>
      <p class="receipt-summary" id="receipt-summary"></p>
      <pre class="receipt-block" id="receipt-text"></pre>
      <button class="btn btn-stop" id="copy-btn" type="button">Copy Submission</button>
      <p class="copy-status" id="copy-status" aria-live="polite"></p>
      <p class="receipt-disclaimer">This is an engagement summary and integrity checksum, not proof of honest
        work — everything here lives in your browser. It gives your instructor a consistent record of what you did.</p>
    </div>`;

  const initial = getState();
  const r1 = container.querySelector("#reflection1");
  const r2 = container.querySelector("#reflection2");
  r1.value = initial.reflections?.reflection1 || "";
  r2.value = initial.reflections?.reflection2 || "";
  r1.addEventListener("change", () => setReflection("reflection1", r1.value));
  r2.addEventListener("change", () => setReflection("reflection2", r2.value));

  const receiptArea = container.querySelector("#receipt-area");
  const receiptSummary = container.querySelector("#receipt-summary");
  const receiptText = container.querySelector("#receipt-text");
  const copyStatus = container.querySelector("#copy-status");

  container.querySelector("#generate-btn").addEventListener("click", async () => {
    setReflection("reflection1", r1.value);
    setReflection("reflection2", r2.value);
    const st = getState();
    const stationReports = floor.map((s) => {
      const p = st.stations[s.id] || {};
      return {
        id: s.id,
        title: s.title,
        section: sectionLabel[s.group] || s.group,
        type: s.mode,
        opened: !!p.opened,
        completed: !!p.completed,
        interactions: p.interactions || 0,
        activeMinutes: toMinutes(p.activeMs || 0),
      };
    });
    const challenges = floor
      .filter((s) => s.mode === "challenge")
      .map((s) => {
        const c = st.challenges?.[s.id];
        return c
          ? { id: s.id, title: s.title, result: c.passed ? "Passed" : "Not passed yet", attempts: c.attempts, finalSettings: c.settings }
          : { id: s.id, title: s.title, result: "Not attempted" };
      });
    const opened = stationReports.filter((s) => s.opened).length;
    const completed = stationReports.filter((s) => s.completed).length;
    const totalInteractions = stationReports.reduce((a, s) => a + s.interactions, 0);
    const totalActiveMinutes = toMinutes(floor.reduce((a, s) => a + (st.stations[s.id]?.activeMs || 0), 0));

    const lines = ["Camera Lab Summary", `Stations completed: ${completed}/${floor.length}`];
    for (const c of challenges) {
      lines.push(`Challenge — ${c.title}: ${c.result}`);
      if (c.finalSettings) {
        const f = c.finalSettings;
        lines.push(`  ${f.camera} · ${f.frameRate} · ${f.shutter} · ${f.aperture} · ${f.gain} · ND ${f.nd} · WB ${f.whiteBalance} · focus ${f.focus}`);
      }
    }
    const payload = {
      schema: RECEIPT_SCHEMA,
      sessionId: st.sessionId,
      startedAt: st.startedAt,
      generatedAt: new Date().toISOString(),
      stationsTotal: floor.length,
      stationsOpened: opened,
      stationsCompleted: completed,
      totalInteractions,
      totalActiveMinutes,
      reflection1: { question: QUESTION_1, answer: r1.value.trim() },
      reflection2: { question: QUESTION_2, answer: r2.value.trim() },
      challenges,
      stations: stationReports,
    };
    const hash = await sha256Hex(JSON.stringify(payload));
    const final = { ...payload, checksum: `sha256:${hash}` };
    receiptSummary.textContent = `Completed ${completed}/${floor.length} stations · ${totalInteractions} interactions · ~${totalActiveMinutes} min tracked`;
    receiptText.textContent = `${lines.join("\n")}\n\n${JSON.stringify(final, null, 2)}`;
    receiptArea.hidden = false;
    copyStatus.textContent = "";
    markComplete(STATION_ID);
  });

  container.querySelector("#copy-btn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(receiptText.textContent);
      copyStatus.textContent = "Copied!";
    } catch (e) {
      const range = document.createRange();
      range.selectNodeContents(receiptText);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      copyStatus.textContent = "Couldn't copy automatically — the text is selected, press Cmd/Ctrl+C.";
    }
  });

  return () => {
    setReflection("reflection1", r1.value);
    setReflection("reflection2", r2.value);
  };
}
