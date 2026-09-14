import { stations, getStation } from "../data/stations.js";
import { mountLab } from "./lab/lab-view.js";
import { recordOpen, isComplete, completionSummary } from "./progress.js";
import { setActiveStation, clearActiveStation } from "./time-tracker.js";

const floorEl = document.getElementById("floor");
const stageEl = document.getElementById("stage");
let currentUnmount = null;

const GROUPS = [
  ["learn", "Learn the controls"],
  ["challenge", "Challenges"],
  ["play", "Free play"],
  ["finish", "Finish"],
];

function stationCard(station) {
  const card = document.createElement("a");
  card.className = "station-card";
  card.href = `#/station/${station.id}`;
  card.style.setProperty("--accent", station.accent);
  const badge = isComplete(station.id) ? '<span class="badge badge-complete">✓ Done</span>' : "";
  card.innerHTML = `${badge}<h3>${station.title}</h3><p>${station.purpose}</p><span class="enter-hint">Enter →</span>`;
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

  for (const [group, heading] of GROUPS) {
    const list = stations.filter((s) => s.group === group && !s.hidden);
    if (!list.length) continue;
    const h = document.createElement("h2");
    h.className = "floor-section-heading";
    h.textContent = heading;
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
  stageEl.classList.toggle("stage-lab", !station.module);

  const header = document.createElement("div");
  header.className = "stage-header";
  header.innerHTML = `<a class="back-link" href="#/">← Floor</a><h2>${station.title}</h2>`;
  stageEl.appendChild(header);

  const body = document.createElement("div");
  body.className = "stage-body";
  stageEl.appendChild(body);

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
    renderFloor();
    floorEl.hidden = false;
    stageEl.hidden = true;
  }
}

window.addEventListener("hashchange", route);
route();
