// A camera-style setting wheel: a tape of values slides under a fixed needle.
// Drag or swipe it, tap a value, use the − / + buttons, the scroll wheel, or
// the keyboard (arrows = one step, PageUp/PageDown = three). It's an ARIA
// slider with a text value, so nothing depends on seeing the tape.
//
// Two flavors:
//  stepped     options: [{ value, label, major }]    — snaps to entries
//  continuous  { toPos, fromPos, min, max, format, ticks: [{ value, label }] }
//              position is a float; used for focus distance and kelvin.

const STEP_SPACING = 30;

export class Dial {
  constructor(opts) {
    this.opts = opts;
    this.onChange = opts.onChange || (() => {});
    this.locked = !!opts.locked;
    this.el = document.createElement("div");
    this.el.className = "dial";
    if (opts.accent) this.el.style.setProperty("--dial-accent", opts.accent);
    this.el.innerHTML = `
      <div class="dial-head">
        <span class="dial-label">${opts.label}</span>
        <span class="dial-value" aria-hidden="true"></span>
        <span class="dial-delta" aria-live="polite"></span>
      </div>
      <div class="dial-body">
        <button type="button" class="dial-step" data-dir="-1" aria-label="${opts.label} down">−</button>
        <div class="dial-window" role="slider" tabindex="0" aria-label="${opts.label}">
          <div class="dial-tape"></div>
          <div class="dial-needle"></div>
        </div>
        <button type="button" class="dial-step" data-dir="1" aria-label="${opts.label} up">+</button>
      </div>
      ${opts.hint ? `<p class="dial-hint">${opts.hint}</p>` : ""}
    `;
    this.valueEl = this.el.querySelector(".dial-value");
    this.deltaEl = this.el.querySelector(".dial-delta");
    this.win = this.el.querySelector(".dial-window");
    this.tape = this.el.querySelector(".dial-tape");
    this.setOptions(opts.options, opts.value);
    this.bind();
    this.setLocked(this.locked);
  }

  get continuous() {
    return !this.options;
  }

  setOptions(options, value) {
    this.options = options || null;
    this.spacing = this.continuous ? this.opts.spacing || 14 : STEP_SPACING;
    this.tape.innerHTML = "";
    const ticks = this.continuous ? this.opts.ticks : this.options.map((o, i) => ({ ...o, pos: i }));
    for (const t of ticks) {
      const pos = t.pos ?? this.opts.toPos(t.value);
      const tick = document.createElement("div");
      tick.className = `dial-tick${t.major ? " major" : ""}`;
      tick.style.left = `${pos * this.spacing}px`;
      if (t.major && t.label) {
        const lab = document.createElement("span");
        lab.textContent = t.tapeLabel || t.label;
        tick.appendChild(lab);
      }
      if (!this.continuous) tick.dataset.index = pos;
      this.tape.appendChild(tick);
    }
    if (this.continuous) {
      // fine ticks between labelled ones
      const lo = this.opts.toPos(this.opts.min);
      const hi = this.opts.toPos(this.opts.max);
      for (let p = Math.ceil(lo); p <= hi; p++) {
        const tick = document.createElement("div");
        tick.className = "dial-tick fine";
        tick.style.left = `${p * this.spacing}px`;
        this.tape.appendChild(tick);
      }
    }
    this.setValue(value ?? this.value, true);
  }

  posOf(value) {
    if (this.continuous) return this.opts.toPos(value);
    let best = 0;
    this.options.forEach((o, i) => {
      if (Math.abs(o.value - value) < Math.abs(this.options[best].value - value)) best = i;
    });
    return best;
  }

  valueAt(pos) {
    if (this.continuous) {
      const lo = this.opts.toPos(this.opts.min);
      const hi = this.opts.toPos(this.opts.max);
      return this.opts.fromPos(Math.min(hi, Math.max(lo, pos)));
    }
    const i = Math.min(this.options.length - 1, Math.max(0, Math.round(pos)));
    return this.options[i].value;
  }

  label(value) {
    if (this.continuous) return this.opts.format(value);
    return this.options[this.posOf(value)].label;
  }

  render() {
    const w = this.win.clientWidth || 280;
    this.tape.style.transform = `translateX(${w / 2 - this.pos * this.spacing}px)`;
    const text = this.label(this.value);
    this.valueEl.textContent = text;
    this.win.setAttribute("aria-valuetext", `${this.opts.label} ${text}`);
    if (!this.continuous) {
      this.tape.querySelectorAll(".dial-tick").forEach((t) => {
        t.classList.toggle("current", Number(t.dataset.index) === Math.round(this.pos));
      });
    }
  }

  setValue(value, silent = false) {
    const prev = this.value;
    this.value = this.continuous ? value : this.valueAt(this.posOf(value));
    this.pos = this.posOf(this.value);
    this.render();
    if (!silent && prev !== this.value) this.onChange(this.value, prev);
  }

  // Drag to a floating position; stepped dials only emit on index change.
  dragTo(pos) {
    this.pos = pos;
    const v = this.valueAt(pos);
    const prev = this.value;
    this.value = v;
    this.render();
    if (this.continuous) this.pos = pos;
    if (v !== prev) this.onChange(v, prev);
  }

  step(dir) {
    if (this.locked) return;
    if (this.continuous) {
      this.setValue(this.valueAt(this.pos + dir * (this.opts.keyStep || 1)));
    } else {
      this.setValue(this.valueAt(this.posOf(this.value) + dir));
    }
  }

  setLocked(locked) {
    this.locked = locked;
    this.el.classList.toggle("locked", locked);
    this.el.querySelectorAll("button").forEach((b) => (b.disabled = locked));
    this.win.setAttribute("aria-disabled", String(locked));
  }

  flash(text, tone = "") {
    this.deltaEl.textContent = text;
    this.deltaEl.className = `dial-delta show ${tone}`;
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => (this.deltaEl.className = "dial-delta"), 1800);
  }

  bind() {
    this.el.querySelectorAll(".dial-step").forEach((b) =>
      b.addEventListener("click", () => this.step(Number(b.dataset.dir))),
    );
    let startX = 0;
    let startPos = 0;
    let moved = false;
    let dragging = false;
    this.win.addEventListener("pointerdown", (e) => {
      if (this.locked) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startPos = this.pos;
      this.win.setPointerCapture(e.pointerId);
      this.el.classList.add("dragging");
    });
    this.win.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 3) moved = true;
      if (moved) this.dragTo(startPos - dx / this.spacing);
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      this.el.classList.remove("dragging");
      if (!moved) {
        // tap: jump to the tapped spot on the tape
        const rect = this.win.getBoundingClientRect();
        const offset = (e.clientX - rect.left - rect.width / 2) / this.spacing;
        this.dragTo(this.pos + offset);
      }
      if (!this.continuous) {
        this.pos = this.posOf(this.value);
        this.render();
      }
    };
    this.win.addEventListener("pointerup", end);
    this.win.addEventListener("pointercancel", end);
    let wheelAcc = 0;
    this.win.addEventListener(
      "wheel",
      (e) => {
        if (this.locked) return;
        e.preventDefault();
        wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(wheelAcc) > 40) {
          this.step(Math.sign(wheelAcc));
          wheelAcc = 0;
        }
      },
      { passive: false },
    );
    this.win.addEventListener("keydown", (e) => {
      const map = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -3, PageUp: 3 };
      if (e.key in map) {
        e.preventDefault();
        this.step(map[e.key]);
      } else if (e.key === "Home" && !this.continuous) {
        e.preventDefault();
        this.setValue(this.options[0].value);
      } else if (e.key === "End" && !this.continuous) {
        e.preventDefault();
        this.setValue(this.options[this.options.length - 1].value);
      }
    });
    this.ro = new ResizeObserver(() => this.render());
    this.ro.observe(this.win);
  }

  destroy() {
    this.ro.disconnect();
    this.el.remove();
  }
}
