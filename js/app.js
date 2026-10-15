import { stations, getStation, SECTIONS } from "../data/stations.js";
import { mountLab } from "./lab/lab-view.js";
import { recordOpen, isComplete, completionSummary } from "./progress.js";
import { setActiveStation, clearActiveStation } from "./time-tracker.js";
import { BugLog } from "./bugs.js";
import { BugView } from "./ui/bug-view.js";
import { current } from "./lab/current.js";
import { PREVIEW, liveUrl } from "./deploy-context.js";

const floorEl = document.getElementById("floor");
const stageEl = document.getElementById("stage");
let currentUnmount = null;

function stationCard(station) {
  const card = document.createElement("a");
  card.className = "station-card";
  card.href = `#/station/${station.id}`;
  card.style.setProperty("--accent", station.accent);
  const badges = [
    isComplete(station.id) ? '<span class="badge badge-complete">✓ Done</span>' : "",
    station.mode === "challenge" ? '<span class="badge badge-challenge">Challenge</span>' : "",
  ]
    .filter(Boolean)
    .join(" ");
  card.innerHTML = `${badges}<h3>${station.title}</h3><p>${station.purpose}</p><span class="enter-hint">Enter →</span>`;
  return card;
}

function renderFloor() {
  floorEl.innerHTML = "";
  const intro = document.createElement("p");
  intro.className = "floor-intro";
  intro.textContent = "Pick a station. Change a setting. Watch what happens.";
  floorEl.appendChild(intro);

  const countable = stations.filter((s) => s.group !== "finish").map((s) => s.id);
  const { done, total } = completionSummary(countable);
  const summary = document.createElement("p");
  summary.className = "floor-summary";
  summary.textContent = done >= total ? `All ${total} stations done ✓` : `${done}/${total} stations completed`;
  floorEl.appendChild(summary);

  for (const [group, heading] of SECTIONS) {
    const list = stations.filter((s) => s.group === group && !s.hidden);
    if (!list.length) continue;
    const h = document.createElement("h2");
    h.className = "floor-section-heading";
    const done = list.filter((s) => isComplete(s.id)).length;
    h.textContent = group === "finish" || group === "play" ? heading : `${heading} · ${done}/${list.length}`;
    floorEl.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "station-grid";
    list.forEach((s) => grid.appendChild(stationCard(s)));
    floorEl.appendChild(grid);
  }
}

async function renderStation(id) {
  const station = getStation(id);
  if (!station) {
    location.hash = "#/";
    return;
  }
  if (currentUnmount) {
    currentUnmount();
    currentUnmount = null;
  }
  stageEl.innerHTML = "";
  stageEl.style.setProperty("--accent", station.accent);
  stageEl.classList.toggle("stage-lab", !station.module || !!station.wide);

  const header = document.createElement("div");
  header.className = "stage-header";
  header.innerHTML = `<a class="back-link" href="#/">← Home</a><h2>${station.title}</h2>`;
  stageEl.appendChild(header);

  const body = document.createElement("div");
  body.className = "stage-body";
  stageEl.appendChild(body);

  currentStation = station;
  recordOpen(station.id);
  setActiveStation(station.id);
  if (station.module) {
    const mod = await import(station.module);
    currentUnmount = mod.mount(body, { station });
  } else {
    currentUnmount = mountLab(body, station);
  }
  window.scrollTo(0, 0);
}

function route() {
  const m = (location.hash || "#/").match(/^#\/station\/([\w-]+)/);
  if (m) {
    floorEl.hidden = true;
    stageEl.hidden = false;
    renderStation(m[1]);
  } else {
    if (currentUnmount) {
      currentUnmount();
      currentUnmount = null;
    }
    clearActiveStation();
    currentStation = null;
    renderFloor();
    floorEl.hidden = false;
    stageEl.hidden = true;
  }
}

// ---------- bug reports ----------
export const bugs = new BugLog();
let currentStation = null;
const toastEl = document.getElementById("toast");
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove("show"), 3200);
}
const bugView = new BugView(document.getElementById("bug"), {
  bugs,
  getContext: () => ({
    station: currentStation?.id || "home",
    title: currentStation?.title || "",
    ...(current.get ? current.get() : {}),
    url: location.href,
  }),
  onSaved: () => toast("Bug report saved — it'll be in your Finish summary. Thank you!"),
});
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-report-bug]")) bugView.open();
});

// ---------- branch previews ----------
if (PREVIEW) {
  document.documentElement.classList.add("is-preview");
  document.title = `[preview] ${document.title}`;
  const bar = document.createElement("div");
  bar.className = "preview-banner";
  const live = document.createElement("a");
  live.href = liveUrl(location.href);
  live.textContent = "Go to the live site";
  bar.append(`Preview: ${PREVIEW} · not the Canvas assignment · `, live);
  document.body.prepend(bar);
}

window.addEventListener("hashchange", route);
route();
