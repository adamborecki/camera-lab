// The Sony FDR-AX100, laid out the way it works rather than as generic
// dials. Everything goes through one MANUAL ring: pick what it controls by
// tapping the value on the touchscreen (or the matching button on the side
// of the body), then turn the ring.
//
// The quirks are the lesson:
//  • Tapping an item that's on auto makes it manual, at the value auto had
//    picked. Tapping the selected item again — a "double press" — puts it
//    back on auto. An "A" next to a value means the camera is choosing it.
//  • The MANUAL button flips iris, shutter AND gain to auto together (the
//    trap: in a dark hall auto exposure brightens until the stage blows out,
//    while the camera's own meter happily reads 0). Pressing it again locks
//    all three at whatever auto had picked.
//  • White balance lives behind the WB button: Auto, Outdoor, Indoor, One
//    Push, or Color Temp — plus the WB shift, a square you move a dot on
//    (A–B across, G–M up and down), used to match Salmon's RovoCams
//    (3800K, A5 G2).
//
// Unverified against the body (README → Technical verification): button
// names and positions, the MANUAL button behavior as described by the
// instructor, the WB shift ranges, and the exact LCD layout.
import { Dial } from "./dial.js";
import { WbPad, shiftWord } from "./wb-pad.js";
import { apertureOptions, shutterOptions, gainOptions, maxApertureAt, exactAperture, WB_RANGE, formatDistance } from "../sim/camera-model.js";

// In the order they sit on the body and the screen: iris, gain, shutter.
const EXPOSURE_ITEMS = [
  { id: "aperture", label: "IRIS", button: "IRIS" },
  { id: "gainStops", label: "GAIN", button: "GAIN/ISO" },
  { id: "shutter", label: "SHUTTER", button: "SHUTTER SPEED" },
];
const WB_MODES = [
  { id: "auto", label: "Auto" },
  { id: "outdoor", label: "Outdoor ☀︎" },
  { id: "indoor", label: "Indoor 💡" },
  { id: "onepush", label: "One Push" },
  { id: "temp", label: "Color Temp" },
];

export class Ax100Panel {
  // host: { camera, get(): settings, change(key, value), setAuto(key, on),
  //         note(key) (activity bookkeeping), say(text), oneShotWhite():kelvin,
  //         lcdEl (overlay container on the viewport), panelEl }
  constructor(host) {
    this.host = host;
    this.selected = null;
    this.wbMenu = false;
    this.lcd = document.createElement("div");
    this.lcd.className = "ax-lcd";
    host.lcdEl.appendChild(this.lcd);
    this.el = document.createElement("div");
    this.el.className = "body-panel ax-panel";
    this.el.innerHTML = `
      <p class="body-panel-title">Sony AX100 · <span>tap a value on the screen (or a side button), then turn the ring</span></p>
      <div class="ax-ring"></div>
      <div class="ax-buttons" role="group" aria-label="Side buttons">
        ${EXPOSURE_ITEMS.map((i) => `<button type="button" class="hw-btn" data-item="${i.id}">${i.button}</button>`).join("")}
        <button type="button" class="hw-btn" data-wb>WB</button>
        <button type="button" class="hw-btn hw-manual" data-manual>MANUAL</button>
      </div>
      <div class="ax-row">
        <div class="hw-switch" role="radiogroup" aria-label="ND filter switch">
          <span class="hw-switch-label">ND FILTER</span>
          ${[["OFF", 0], ["1", 2], ["2", 4], ["3", 6]].map(([l, v]) => `<button type="button" role="radio" data-nd="${v}">${l}</button>`).join("")}
        </div>
        <button type="button" class="hw-btn" data-af>AF/MF</button>
        <div class="hw-rocker" aria-label="Zoom lever">
          <button type="button" data-zoom="-1" aria-label="Zoom out (W)">W</button><span>ZOOM</span><button type="button" data-zoom="1" aria-label="Zoom in (T)">T</button>
        </div>
      </div>
      <div class="ax-wbmenu" hidden></div>`;
    host.panelEl.appendChild(this.el);
    this.ringWrap = this.el.querySelector(".ax-ring");
    this.wbMenuEl = this.el.querySelector(".ax-wbmenu");
    this.bind();
    this.buildRing();
    this.update();
  }

  bind() {
    this.el.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      if (t.dataset.item) this.press(t.dataset.item);
      else if ("wb" in t.dataset) this.toggleWbMenu();
      else if ("manual" in t.dataset) this.manualButton();
      else if (t.dataset.nd != null) this.host.change("nd", Number(t.dataset.nd));
      else if ("af" in t.dataset) this.toggleAf();
      else if (t.dataset.wbmode) this.pickWb(t.dataset.wbmode);
    });
    this.lcd.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      e.stopPropagation();
      if (t.dataset.item) this.press(t.dataset.item);
      else if ("wb" in t.dataset) this.toggleWbMenu();
      else if ("af" in t.dataset) this.toggleAf();
      else if ("manual" in t.dataset) this.manualButton();
    });
    // hold the zoom lever
    this.el.querySelectorAll("[data-zoom]").forEach((b) => {
      let timer = 0;
      const dir = Number(b.dataset.zoom);
      const go = () => {
        const s = this.host.get();
        this.host.change("focal", s.focal * (dir > 0 ? 1.035 : 1 / 1.035));
      };
      const stop = () => clearInterval(timer);
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        go();
        clearInterval(timer);
        timer = setInterval(go, 60);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, stop));
    });
  }

  // Touchscreen value or side button: auto → manual (selected); selected
  // manual → auto (the double press); other manual → just select it.
  press(id) {
    const s = this.host.get();
    const auto = !!s.auto?.[id];
    const item = EXPOSURE_ITEMS.find((i) => i.id === id);
    if (auto) {
      this.host.setAuto(id, false);
      this.select(id);
      this.host.say(`${item.label} is manual now — held at what auto had picked. Turn the ring to change it. (Press ${item.label} again to hand it back to auto.)`);
    } else if (this.selected === id) {
      this.host.setAuto(id, true);
      this.select(null);
      this.host.say(`${item.label} → auto ("A"). The camera chooses it again — pressing a selected item twice does that.`);
    } else {
      this.select(id);
    }
    this.host.note(`press:${id}`);
  }

  manualButton() {
    const s = this.host.get();
    const anyManual = EXPOSURE_ITEMS.some((i) => !s.auto?.[i.id]);
    for (const i of EXPOSURE_ITEMS) this.host.setAuto(i.id, anyManual);
    this.select(null);
    this.host.say(
      anyManual
        ? "MANUAL: iris, gain and shutter all went back to automatic. Watch the stage — and the camera's meter."
        : "MANUAL: iris, gain and shutter are locked at what auto picked. Tap one to adjust it.",
    );
    this.host.note("manual-button");
  }

  toggleAf() {
    const s = this.host.get();
    this.host.setAuto("focus", !s.auto?.focus);
    this.host.say(s.auto?.focus ? "Manual focus: tap the picture to focus." : "Autofocus: the camera focuses on whatever is in the middle of the frame.");
    this.host.note("af");
  }

  toggleWbMenu() {
    this.wbMenu = !this.wbMenu;
    this.renderWbMenu();
    this.host.note("wb-menu");
  }

  pickWb(mode) {
    const s = this.host.get();
    if (mode === "onepush") {
      // Aim at something white, press: the camera measures the light.
      this.host.change("wb", this.host.oneShotWhite());
    } else if (mode === "indoor" || mode === "outdoor") {
      // A preset is a kelvin value; keep the dial on it so everything that
      // reads the setting agrees with what the camera applies.
      this.host.change("wb", mode === "indoor" ? 3200 : 5600);
    }
    void s;
    this.host.change("wbMode", mode);
    if (mode === "temp") this.select("wb");
    else if (this.selected === "wb") this.select(null);
    this.renderWbMenu();
  }

  select(id) {
    this.selected = id;
    this.buildRing();
    this.update();
  }

  buildRing() {
    if (this.ring) this.ring.destroy();
    this.ring = null;
    this.ringWrap.innerHTML = "";
    const s = this.host.get();
    const cam = this.host.camera;
    const id = this.selected;
    if (!id) {
      this.ringWrap.innerHTML = `<p class="ax-ring-idle">MANUAL ring — nothing selected. Tap IRIS, GAIN or SHUTTER on the screen.</p>`;
      return;
    }
    let opts = null;
    let cont = null;
    let label = "";
    if (id === "aperture") {
      const widest = exactAperture(maxApertureAt(cam, s.focal));
      opts = apertureOptions(cam)
        .filter((o) => exactAperture(o.value) >= widest * 0.985)
        .map((o) => ({ ...o, label: `F${o.value.toFixed(1)}` }));
      label = "MANUAL ring · IRIS";
    } else if (id === "shutter") {
      opts = shutterOptions(cam).map((o) => ({ ...o, label: String(o.value) }));
      label = "MANUAL ring · SHUTTER";
    } else if (id === "gainStops") {
      opts = gainOptions(cam).map((o) => ({ ...o, label: `${o.shown}dB` }));
      label = "MANUAL ring · GAIN";
    } else if (id === "wb") {
      cont = {
        min: WB_RANGE.min,
        max: WB_RANGE.max,
        spacing: 10,
        toPos: (k) => (k - 2000) / 100,
        fromPos: (p) => Math.round((2000 + p * 100) / 100) * 100,
        format: (k) => `${Math.round(k)}K`,
        ticks: [2300, 3200, 4000, 5000, 5600, 6500, 8000].map((v) => ({ value: v, label: `${v}K`, major: true })),
      };
      label = "MANUAL ring · COLOR TEMP";
    }
    const key = id;
    this.ring = new Dial({
      label,
      options: opts,
      ...(cont || {}),
      value: s[key],
      onChange: (v) => this.host.change(key, v, { fromRing: true }),
    });
    this.ring.el.classList.add("ring-dial");
    this.ringWrap.appendChild(this.ring.el);
  }

  renderWbMenu() {
    this.wbMenuEl.hidden = !this.wbMenu;
    if (!this.wbMenu) {
      this.pad = null;
      return;
    }
    const s = this.host.get();
    const mode = s.wbMode || "temp";
    this.wbMenuEl.innerHTML = `
      <p class="ax-menu-title">White Balance</p>
      <div class="ax-menu-row">${WB_MODES.map((m) => `<button type="button" class="hw-btn${m.id === mode ? " on" : ""}" data-wbmode="${m.id}">${m.label}</button>`).join("")}</div>
      <p class="ax-menu-title">WB shift (fine trim) — move the dot</p>
      <div class="ax-pad"></div>
      <div class="ax-menu-row"><button type="button" class="hw-btn" data-wb>Done</button></div>`;
    const max = this.host.camera.wbShift || { ab: 7, gm: 7 };
    this.pad = new WbPad({
      ab: max.ab,
      gm: max.gm,
      value: { ab: s.wbAB, gm: s.wbGM },
      onChange: (ab, gm) => {
        const now = this.host.get();
        if (ab !== now.wbAB) this.host.change("wbAB", ab);
        if (gm !== now.wbGM) this.host.change("wbGM", gm);
      },
    });
    this.wbMenuEl.querySelector(".ax-pad").appendChild(this.pad.el);
  }

  // Redraw the LCD and button states from the current settings.
  update(extra = {}) {
    const s = this.host.get();
    const cam = this.host.camera;
    const a = (k) => (s.auto?.[k] ? `<b class="ax-a">A</b>` : "");
    const sel = (k) => (this.selected === k ? " sel" : "");
    const gain = gainOptions(cam).reduce((b, o) => (Math.abs(o.value - s.gainStops) < Math.abs(b.value - s.gainStops) ? o : b));
    const wbMode = s.wbMode || "temp";
    const wbText =
      wbMode === "auto" ? "AWB" : wbMode === "outdoor" ? "☀︎" : wbMode === "indoor" ? "💡" : wbMode === "onepush" ? "◢◣ One Push" : `${Math.round(s.wb)}K`;
    const shift = s.wbAB || s.wbGM ? ` ${shiftWord(s.wbAB, "A", "B")} ${shiftWord(s.wbGM, "G", "M")}` : "";
    const nd = s.nd ? `<span class="ax-box">ND${s.nd / 2}</span>` : "";
    const html = `
      <div class="ax-top"><span class="${extra.recording ? "ax-rec" : "ax-stby"}">${extra.recording ? "● REC" : "STBY"}</span><span>${extra.time || "0:00:00"}</span><span class="ax-batt">AC ⏻</span></div>
      <div class="ax-left">${nd}<button type="button" class="ax-item${sel("wb")}" data-wb>${wbText}${shift}</button><button type="button" class="ax-item" data-af>${s.auto?.focus ? "AF" : `MF ${formatDistance(s.focus)}`}</button></div>
      <div class="ax-bottom">
        <button type="button" class="ax-item ax-manual" data-manual>MANUAL</button>
        <button type="button" class="ax-item${sel("aperture")}" data-item="aperture"><small>IRIS</small>F${s.aperture.toFixed(1)}${a("aperture")}</button>
        <button type="button" class="ax-item${sel("gainStops")}" data-item="gainStops"><small>GAIN</small>${gain.shown}dB${a("gainStops")}</button>
        <button type="button" class="ax-item${sel("shutter")}" data-item="shutter"><small>SHUTTER</small>${s.shutter}${a("shutter")}</button>
      </div>`;
    if (html !== this.lastLcd) {
      this.lcd.innerHTML = html;
      this.lastLcd = html;
    }
    this.el.querySelectorAll("[data-item]").forEach((b) => {
      b.classList.toggle("on", this.selected === b.dataset.item);
      b.classList.toggle("auto", !!s.auto?.[b.dataset.item]);
    });
    this.el.querySelectorAll("[data-nd]").forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.nd) === s.nd)));
    this.el.querySelector("[data-af]").classList.toggle("on", !!s.auto?.focus);
    if (this.ring && this.selected) {
      const v = s[this.selected];
      if (v !== this.ring.value) this.ring.setValue(v, true);
    }
    if (this.wbMenu) {
      // Rebuild for a mode change; just move the dot for a shift change, so a
      // drag in progress isn't interrupted.
      const key = `${s.wbMode}|${this.selected}`;
      if (key !== this.wbKey) {
        this.wbKey = key;
        this.renderWbMenu();
      } else if (this.pad && !this.pad.dragging && (s.wbAB !== this.pad.ab || s.wbGM !== this.pad.gm)) this.pad.setValue(s.wbAB, s.wbGM);
    }
  }

  setVisible(v) {
    this.lcd.hidden = !v;
  }

  destroy() {
    if (this.ring) this.ring.destroy();
    this.lcd.remove();
    this.el.remove();
  }
}

export { shiftWord };
