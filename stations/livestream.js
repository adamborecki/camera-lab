// Salmon livestream — the multiview from the ATEM Mini Extreme ISO in the
// BH 208/209 booth, and the few buttons a normal recital stream needs.
//
// How Salmon actually runs (per the instructor, Oct 2026): the hall's static
// wide RovoCam comes in on Camera 2; the second RovoCam angle (Camera 1) is
// never used. Nobody switches during a recital — no fades, no title cards —
// so the job is: static wide on program, On Air when it's time, Off Air at
// the end. ATEM Software Control's On Air is the go-live button for the
// Vimeo stream (see MUS 248's Salmon: Livestream activity).
//
// Unverified details (README → Technical verification): the exact multiview
// layout and labels beyond what the booth photo shows, which buttons
// students press in ATEM Software Control vs. the hardware panel, and the
// ATEM Production Studio 4K that sits ahead of the Mini in the chain.
import { Renderer } from "../js/render/renderer.js";
import { getScene } from "../js/scenes/index.js";
import { getCamera } from "../data/cameras.js";
import { derive, normalizeSettings, settingsFromPreset } from "../js/sim/camera-model.js";
import { createActivity } from "../js/lab/activity.js";
import { recordInteraction } from "../js/progress.js";

const SCENE_ID = "salmon-violin-piano";
const MV_W = 1280;
const MV_H = 720;

export function mount(container, { station }) {
  container.innerHTML = `
    <div class="lab livestream">
      <div class="lab-main">
        <div class="mv-frame">
          <canvas class="mv-canvas" width="${MV_W}" height="${MV_H}" aria-label="ATEM multiview: cameras 1 to 8, program, preview, audio meters, recording and stream status"></canvas>
          <p class="mv-caption">HDMI 2 · ATEM Mini Extreme ISO multiview</p>
        </div>
        <div class="atem-panel" role="group" aria-label="Switcher">
          <div class="atem-row"><span class="atem-label">PROGRAM</span><div class="atem-buttons" data-bus="program"></div></div>
          <div class="atem-row"><span class="atem-label">PREVIEW</span><div class="atem-buttons" data-bus="preview"></div></div>
          <div class="atem-row atem-actions">
            <button type="button" class="atem-btn atem-cut" data-cut>CUT</button>
            <button type="button" class="atem-btn atem-auto" data-auto>AUTO</button>
            <span class="atem-spacer"></span>
            <button type="button" class="atem-btn atem-onair" data-onair aria-pressed="false">ON AIR</button>
          </div>
        </div>
      </div>
      <div class="lab-side">
        <div class="activity"></div>
        <p class="feed" aria-live="polite"></p>
      </div>
    </div>`;

  const mv = container.querySelector(".mv-canvas");
  const g = mv.getContext("2d");
  const feedEl = container.querySelector(".feed");
  const say = (t) => (feedEl.textContent = t);

  // ---- the two RovoCams, rendered off screen ----
  const glCanvas = document.createElement("canvas");
  let renderer = null;
  try {
    renderer = new Renderer(glCanvas);
    renderer.resize(640, 360);
  } catch (e) {
    container.querySelector(".mv-frame").insertAdjacentHTML("beforeend", `<p class="gl-error">This browser can't run WebGL2, so the camera pictures are blank — the switcher still works.</p>`);
  }
  const scene = getScene(SCENE_ID);
  const rovo = getCamera("rovocam");
  const cams = {
    // Camera 2: the static wide everybody uses.
    2: { slot: 0, preset: { fps: 30, aperture: 4, gainDb: 3, shutter: 60, wbMode: "auto", focal: 34, focus: 13 }, view: null, parallax: null },
    // Camera 1: the second angle nobody uses — parked on the wall, tight.
    1: { slot: 1, preset: { fps: 30, aperture: 4, gainDb: 3, shutter: 60, wbMode: "auto", focal: 80, focus: 17 }, view: { x: 0.72, y: 0.36 }, parallax: { shift: 0.6, aimDepth: 15 } },
  };
  for (const c of Object.values(cams)) {
    c.settings = normalizeSettings(settingsFromPreset({ ...scene.defaults, ...c.preset }, scene), rovo, scene);
    c.derived = derive(c.settings, rovo, scene);
    c.canvas = document.createElement("canvas");
    c.canvas.width = 640;
    c.canvas.height = 360;
  }
  if (renderer) renderer.setScene(scene);

  // ---- switcher state ----
  const st = { program: 1, preview: 4, onAir: false, wasOnAir: false, onAirAt: 0, lastTap: null, mix: null };

  function busButtons(bus) {
    const wrap = container.querySelector(`[data-bus="${bus}"]`);
    wrap.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, "BLK"].map((n) => `<button type="button" class="atem-btn" data-src="${n === "BLK" ? 0 : n}">${n}</button>`).join("");
    wrap.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const src = Number(b.dataset.src);
      if (bus === "program") {
        st.program = src;
        say(src === 0 ? "Program row → BLACK. That went straight out, live." : `Program row → Camera ${src}. That went straight out, live, with no look first.`);
      } else {
        st.preview = src;
        say(src === 0 ? "Preview → black." : `Preview → Camera ${src}. Nothing changed on the stream — preview is just for you.`);
      }
      changed(`${bus}:${src}`);
    });
  }
  busButtons("program");
  busButtons("preview");

  container.querySelector("[data-cut]").addEventListener("click", () => {
    [st.program, st.preview] = [st.preview, st.program];
    say(`CUT: Camera ${st.program || "BLK"} is on program now.`);
    changed("cut");
  });
  container.querySelector("[data-auto]").addEventListener("click", () => {
    st.mix = { from: st.program, to: st.preview, start: performance.now() };
    [st.program, st.preview] = [st.preview, st.program];
    say(`AUTO: a one-second mix to Camera ${st.program || "BLK"}.`);
    changed("auto");
  });
  const onAirBtn = container.querySelector("[data-onair]");
  onAirBtn.addEventListener("click", () => {
    st.onAir = !st.onAir;
    if (st.onAir) {
      st.onAirAt = performance.now();
      st.wasOnAir = true;
      say("ON AIR — the stream is going to Vimeo now.");
    } else say("Off air — the stream has ended.");
    changed(st.onAir ? "onair" : "offair");
  });

  // tap a multiview box
  mv.addEventListener("click", (e) => {
    const r = mv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * MV_W;
    const y = ((e.clientY - r.top) / r.height) * MV_H;
    let hit = null;
    if (x < 640) hit = `cam${1 + Math.floor(y / 180) * 2 + Math.floor(x / 320)}`;
    else if (y < 360) hit = "program";
    else if (y < 540) hit = x < 960 ? "preview" : "audio";
    else hit = x < 960 ? "record" : "stream";
    st.lastTap = hit;
    const words = { program: "the Program window — what's going out", preview: "the Preview window — what's next", audio: "the audio meters", record: "the Mini's own recorder (Salmon records on the HyperDeck instead)", stream: "the stream status" };
    say(hit.startsWith("cam") ? `Camera ${hit.slice(3)}${Number(hit.slice(3)) === st.program ? " — on program (red)" : Number(hit.slice(3)) === st.preview ? " — on preview (green)" : ""}.` : `That's ${words[hit]}.`);
    changed(`tap:${hit}`);
  });

  function changed(key) {
    recordInteraction(station.id);
    syncButtons();
    activity.onChange(key);
  }

  function syncButtons() {
    container.querySelectorAll('[data-bus="program"] .atem-btn').forEach((b) => b.classList.toggle("lit-red", Number(b.dataset.src) === st.program));
    container.querySelectorAll('[data-bus="preview"] .atem-btn').forEach((b) => b.classList.toggle("lit-green", Number(b.dataset.src) === st.preview));
    onAirBtn.classList.toggle("lit-red", st.onAir);
    onAirBtn.setAttribute("aria-pressed", String(st.onAir));
  }

  // ---- drawing the multiview ----
  const levels = new Float32Array(11).fill(0);
  function drawSource(src, x, y, w, h) {
    const c = cams[src];
    if (c) g.drawImage(c.canvas, x, y, w, h);
    else {
      g.fillStyle = "#000";
      g.fillRect(x, y, w, h);
    }
  }
  function label(text, x, y, w, h, tally) {
    g.font = "600 17px system-ui, sans-serif";
    const tw = g.measureText(text).width + 16;
    const lx = x + w / 2 - tw / 2;
    const ly = y + h - 30;
    g.fillStyle = tally === "red" ? "#e0262f" : tally === "green" ? "#1f9e3a" : "rgba(0,0,0,0.55)";
    g.fillRect(lx, ly, tw, 22);
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.fillText(text, x + w / 2, ly + 16);
  }
  function box(x, y, w, h, tally) {
    g.lineWidth = tally ? 5 : 2;
    g.strokeStyle = tally === "red" ? "#e0262f" : tally === "green" ? "#1fbf46" : "#c8d0e8";
    g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  }
  function hms(ms) {
    const s = Math.floor(ms / 1000);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  }

  function drawMultiview(now) {
    g.fillStyle = "#0b0d14";
    g.fillRect(0, 0, MV_W, MV_H);
    for (let n = 1; n <= 8; n++) {
      const x = ((n - 1) % 2) * 320;
      const y = Math.floor((n - 1) / 2) * 180;
      drawSource(n, x, y, 320, 180);
      const tally = n === st.program ? "red" : n === st.preview ? "green" : null;
      box(x, y, 320, 180, tally);
      label(`Camera ${n}`, x, y, 320, 180, tally);
    }
    // program (with a one-second mix if AUTO is running)
    if (st.mix) {
      const k = Math.min(1, (now - st.mix.start) / 1000);
      drawSource(st.mix.from, 640, 0, 640, 360);
      g.globalAlpha = k;
      drawSource(st.mix.to, 640, 0, 640, 360);
      g.globalAlpha = 1;
      if (k >= 1) st.mix = null;
    } else drawSource(st.program, 640, 0, 640, 360);
    box(640, 0, 640, 360);
    label("Program", 640, 0, 640, 360);
    drawSource(st.preview, 640, 360, 320, 180);
    box(640, 360, 320, 180);
    label("Preview", 640, 360, 320, 180);
    // audio meters: CAM1–8, MIC1, MIC2, PGM (the board feed rides in on an input)
    box(960, 360, 320, 180);
    const names = ["CAM1", "CAM2", "CAM3", "CAM4", "CAM5", "CAM6", "CAM7", "CAM8", "MIC1", "MIC2", "PGM"];
    const t = now / 1000;
    names.forEach((nm, i) => {
      const live = i === 1 || i === 10; // the board feed is on the static wide's input
      const target = live ? 0.55 + 0.25 * Math.sin(t * 2.1 + i) * Math.sin(t * 0.7) + 0.1 * Math.random() : 0.02;
      levels[i] += (target - levels[i]) * 0.35;
      const x = 972 + i * 27;
      g.fillStyle = "#1c2030";
      g.fillRect(x, 392, 14, 120);
      const hgt = Math.max(0, Math.min(1, levels[i])) * 120;
      const grad = g.createLinearGradient(0, 512, 0, 392);
      grad.addColorStop(0, "#2fd36b");
      grad.addColorStop(0.75, "#e3d84a");
      grad.addColorStop(1, "#ff4040");
      g.fillStyle = grad;
      g.fillRect(x, 512 - hgt, 14, hgt);
      g.fillStyle = i === 10 ? "#fff" : "#9aa4c4";
      g.font = "600 9px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText(nm, x + 7, 386);
    });
    // record status (the Mini's own recorder isn't used in Salmon)
    box(640, 540, 320, 180);
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.font = "700 30px system-ui, sans-serif";
    g.fillText("STOP", 800, 585);
    g.font = "600 15px system-ui, sans-serif";
    g.fillText("00:00:00", 800, 606);
    for (const [cx, n] of [[750, 1], [850, 2]]) {
      g.strokeStyle = "#5f8ad8";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(cx, 660, 30, 0, Math.PI * 2);
      g.stroke();
      g.font = "600 12px system-ui, sans-serif";
      g.fillText("00:00", cx, 664);
      g.font = "600 10px system-ui, sans-serif";
      g.fillText("NO DISK", cx, 708);
      g.fillText(String(n), cx - 34, 628);
    }
    // stream status
    box(960, 540, 320, 180);
    g.font = "700 30px system-ui, sans-serif";
    g.fillStyle = st.onAir ? "#ff4040" : "#fff";
    g.fillText(st.onAir ? "ON AIR" : "OFF", 1120, 585);
    g.fillStyle = "#fff";
    g.font = "600 15px system-ui, sans-serif";
    g.fillText(st.onAir ? hms(now - st.onAirAt) : "00:00:00", 1120, 606);
    g.font = "600 11px system-ui, sans-serif";
    g.fillText("DATA RATE Mb/s", 1060, 640);
    g.fillText("CACHE", 1180, 640);
    g.font = "700 30px system-ui, sans-serif";
    g.fillText(st.onAir ? (8.8 + 0.6 * Math.sin(now / 900)).toFixed(2) : "0.00", 1060, 676);
    g.fillText("OK", 1180, 676);
    g.font = "600 15px system-ui, sans-serif";
    g.fillText("Vimeo", 1120, 704);
  }

  // ---- loop ----
  let raf = 0;
  let lastCam = 0;
  const t0 = performance.now();
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    if (renderer && now - lastCam > 66) {
      lastCam = now;
      const time = (now - t0) / 1000;
      for (const c of Object.values(cams)) {
        renderer.render({
          settings: c.settings,
          derived: c.derived,
          time: Math.floor(time * 30) / 30,
          frameIndex: Math.floor(time * 30),
          view: c.view ? { ...c.view, zoom: c.derived.frameZoom } : { x: scene.aim[0], y: scene.aim[1], zoom: c.derived.frameZoom },
          parallax: c.parallax,
          slot: c.slot,
        });
        c.canvas.getContext("2d").drawImage(glCanvas, 0, 0, 640, 360);
      }
    }
    drawMultiview(now);
  }

  // ---- the guided steps ----
  const steps = [
    {
      text: "This is the multiview from the <strong>ATEM Mini Extreme ISO</strong> in the booth: eight camera inputs on the left, <strong>Program</strong> (what's going out) top right, <strong>Preview</strong> (what's next) under it. Which camera is on program right now? <strong>Tap its box.</strong>",
      when: (c) => c.lastTap === `cam${c.program}`,
      notYet: "Look for the red border (it matches the big Program window).",
      done: "Red border = program, live. Green border = preview, next. Same colors as the buttons.",
    },
    {
      text: "Camera 1 is the second RovoCam angle — Salmon never uses it. Put <strong>Camera 2, the static wide</strong>, on program the safe way: press <strong>2</strong> on the <strong>PREVIEW</strong> row, check the Preview window, then press <strong>CUT</strong>.",
      when: (c) => c.program === 2,
      notYet: (c) => (c.preview === 2 ? "Camera 2 is on preview — now press CUT." : "Press 2 on the PREVIEW row first."),
      done: (c) =>
        [...c.touchedKeys].some((k) => k.startsWith("program:"))
          ? "Camera 2 is on program — but pressing the program row cuts live, with no look first. On a stream, pick it on preview, look, then CUT."
          : "Preview, look, CUT. That's the habit, even when there's only one camera that matters.",
    },
    {
      text: "It's a real gig: the Vimeo event exists, its stream key is in ATEM Software Control, and the house is open. Go live: press <strong>ON AIR</strong>.",
      when: (c) => c.onAir && c.program === 2,
      notYet: (c) => (c.program !== 2 ? "Get the static wide (Camera 2) on program first." : "Press ON AIR."),
      done: "The stream box says ON AIR, the timer's running and data is flowing to Vimeo. That one button is the whole go-live — there's no separate step in Vimeo. (On a <em>practice</em> run you never press it.)",
    },
    {
      text: "During the recital, the static wide stays up the whole time — no cuts, no fades. Prove to yourself that preview is safe: press a few different cameras on the <strong>PREVIEW</strong> row (try 3, then 1) without touching program, and watch the Program window.",
      when: (c) => [...c.touchedKeys].some((k) => k.startsWith("preview:")) && c.program === 2 && c.onAir,
      notYet: (c) => (c.program !== 2 ? "Program changed — the stream just cut away from the static wide. Put Camera 2 back on program." : !c.onAir ? "You went off air — press ON AIR again." : "Press a button on the PREVIEW row."),
      done: "Preview changed; the stream didn't. Only the program row, CUT and AUTO touch what goes out.",
    },
    {
      text: "The last piece is over and the applause has died down. End the stream.",
      when: (c) => c.wasOnAir && !c.onAir,
      notYet: "Press ON AIR again to go off air.",
      done: "Off air: the Vimeo event ends. Then the usual end-of-gig checklist — recorders stopped, media verified, room reset.",
    },
  ];
  const activity = createActivity({
    el: container.querySelector(".activity"),
    station: {
      ...station,
      mode: "guided",
      intro:
        "Today's Salmon stream is deliberately simple: one static wide on program the whole time — no fades, no title cards. (Walk-in music, title cards and audio monitoring may join the procedure later.)",
      steps,
    },
    ctx: () => ({ ...st }),
    say,
  });

  syncButtons();
  activity.start();
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    if (renderer) renderer.dispose();
  };
}
