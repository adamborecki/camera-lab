// A rotary knob, like the RP150's shading knobs: drag it (up/right turns it
// clockwise), use the wheel or arrow keys, or tap − / +. Integer steps.
// It's an ARIA slider with a text value.
export class Knob {
  // opts: { label, min, max, step=1, value, format(v), color, disabled, onChange(v) }
  constructor(opts) {
    this.opts = { step: 1, format: (v) => String(v), ...opts };
    this.value = opts.value ?? 0;
    this.el = document.createElement("div");
    this.el.className = "knob";
    if (opts.color) this.el.style.setProperty("--knob-color", opts.color);
    this.el.innerHTML = `
      <span class="knob-label">${opts.label}</span>
      <div class="knob-row">
        <button type="button" class="knob-step" data-dir="-1" aria-label="${opts.label} down">−</button>
        <div class="knob-dial" role="slider" tabindex="0" aria-label="${opts.label}"><span class="knob-mark"></span></div>
        <button type="button" class="knob-step" data-dir="1" aria-label="${opts.label} up">+</button>
      </div>
      <span class="knob-value"></span>`;
    this.dial = this.el.querySelector(".knob-dial");
    this.mark = this.el.querySelector(".knob-mark");
    this.valueEl = this.el.querySelector(".knob-value");
    this.bind();
    this.setDisabled(!!opts.disabled);
    this.render();
  }

  set(v, silent = false) {
    const { min, max, step } = this.opts;
    const nv = Math.max(min, Math.min(max, Math.round(v / step) * step));
    if (nv === this.value) return this.render();
    this.value = nv;
    this.render();
    if (!silent) this.opts.onChange?.(nv);
  }

  render() {
    const { min, max } = this.opts;
    const t = (this.value - min) / (max - min || 1);
    this.mark.style.transform = `rotate(${-135 + t * 270}deg)`;
    const text = this.opts.format(this.value);
    this.valueEl.textContent = text;
    this.dial.setAttribute("aria-valuetext", `${this.opts.label} ${text}`);
  }

  setDisabled(d) {
    this.disabled = d;
    this.el.classList.toggle("disabled", d);
    this.el.querySelectorAll("button").forEach((b) => (b.disabled = d));
    this.dial.setAttribute("aria-disabled", String(d));
  }

  bind() {
    this.el.querySelectorAll(".knob-step").forEach((b) => b.addEventListener("click", () => !this.disabled && this.set(this.value + Number(b.dataset.dir) * this.opts.step)));
    let start = null;
    this.dial.addEventListener("pointerdown", (e) => {
      if (this.disabled) return;
      start = { x: e.clientX, y: e.clientY, v: this.value };
      this.dial.setPointerCapture(e.pointerId);
    });
    this.dial.addEventListener("pointermove", (e) => {
      if (!start) return;
      // 6 px of travel per step; up and right both turn it up
      const d = (e.clientX - start.x - (e.clientY - start.y)) / 6;
      this.set(start.v + Math.round(d) * this.opts.step);
    });
    const end = () => (start = null);
    this.dial.addEventListener("pointerup", end);
    this.dial.addEventListener("pointercancel", end);
    this.dial.addEventListener(
      "wheel",
      (e) => {
        if (this.disabled) return;
        e.preventDefault();
        this.set(this.value + (e.deltaY < 0 ? 1 : -1) * this.opts.step);
      },
      { passive: false },
    );
    this.dial.addEventListener("keydown", (e) => {
      const map = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
      if (e.key in map && !this.disabled) {
        e.preventDefault();
        this.set(this.value + map[e.key] * this.opts.step);
      }
    });
  }

  destroy() {
    this.el.remove();
  }
}
