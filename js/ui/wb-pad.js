// White-balance shift as the camera shows it: a square grid with a dot you
// move. Left–right is the amber–blue axis, up–down green–magenta; the center
// is no shift. Tap a spot, drag the dot, or use the arrow keys.
//
// Axis orientation (G up, M down, B left, A right) follows Sony's WB shift
// screen as far as we know — unverified on the AX100 itself (README →
// Technical verification).

export class WbPad {
  // opts: { ab, gm (max steps per axis), value: { ab, gm }, onChange(ab, gm) }
  constructor(opts) {
    this.opts = opts;
    this.ab = opts.value.ab || 0;
    this.gm = opts.value.gm || 0;
    this.el = document.createElement("div");
    this.el.className = "wb-pad";
    this.el.innerHTML = `
      <div class="wb-pad-head"><span>WB shift</span><strong class="wb-pad-value"></strong><button type="button" class="hw-btn wb-pad-zero">0</button></div>
      <div class="wb-pad-frame">
        <span class="wb-pad-axis wb-g">G</span>
        <span class="wb-pad-axis wb-m">M</span>
        <span class="wb-pad-axis wb-b">B</span>
        <span class="wb-pad-axis wb-a">A</span>
        <div class="wb-pad-grid" role="slider" tabindex="0" aria-label="White balance shift: left and right is blue to amber, up and down is green to magenta">
          <div class="wb-pad-dot"></div>
        </div>
      </div>`;
    this.grid = this.el.querySelector(".wb-pad-grid");
    this.dot = this.el.querySelector(".wb-pad-dot");
    this.valueEl = this.el.querySelector(".wb-pad-value");
    this.grid.style.setProperty("--cols", 2 * opts.ab + 1);
    this.grid.style.setProperty("--rows", 2 * opts.gm + 1);
    this.bind();
    this.draw();
  }

  bind() {
    const at = (e) => {
      const r = this.grid.getBoundingClientRect();
      const u = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const v = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      // One cell per step: (2·max + 1) across, the center cell is 0.
      const { ab, gm } = this.opts;
      const cell = (t, max) => Math.min(2 * max, Math.floor(t * (2 * max + 1))) - max;
      this.set(cell(u, ab), -cell(v, gm));
    };
    this.grid.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.grid.setPointerCapture(e.pointerId);
      this.dragging = true;
      at(e);
    });
    this.grid.addEventListener("pointermove", (e) => this.dragging && at(e));
    const end = () => (this.dragging = false);
    this.grid.addEventListener("pointerup", end);
    this.grid.addEventListener("pointercancel", end);
    this.grid.addEventListener("keydown", (e) => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (!d) return;
      e.preventDefault();
      this.set(this.ab + d[0], this.gm + d[1]);
    });
    this.el.querySelector(".wb-pad-zero").addEventListener("click", () => this.set(0, 0));
  }

  set(ab, gm) {
    ab = Math.max(-this.opts.ab, Math.min(this.opts.ab, ab));
    gm = Math.max(-this.opts.gm, Math.min(this.opts.gm, gm));
    if (ab === this.ab && gm === this.gm) return;
    this.ab = ab;
    this.gm = gm;
    this.draw();
    // Both axes can change in one tap; the host may redraw in between, so
    // hold the dot where it is until both have landed.
    this.busy = true;
    try {
      this.opts.onChange(ab, gm);
    } finally {
      this.busy = false;
    }
  }

  // From outside (the settings changed some other way): move the dot only.
  setValue(ab, gm) {
    this.ab = ab || 0;
    this.gm = gm || 0;
    this.draw();
  }

  draw() {
    const { ab, gm } = this.opts;
    this.dot.style.left = `${((this.ab + ab + 0.5) / (2 * ab + 1)) * 100}%`;
    this.dot.style.top = `${((gm - this.gm + 0.5) / (2 * gm + 1)) * 100}%`;
    const word = `${shiftWord(this.ab, "A", "B")} ${shiftWord(this.gm, "G", "M")}`.trim();
    this.valueEl.textContent = word || "0 (no shift)";
    this.grid.setAttribute("aria-valuetext", word || "no shift");
  }
}

// "A5", "B2", "G2", "M1" — or "" for no shift.
export function shiftWord(v, pos, neg) {
  if (!v) return "";
  return v > 0 ? `${pos}${v}` : `${neg}${-v}`;
}
