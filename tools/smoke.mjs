// Browser smoke test: opens every station in headless Chromium, fails on any
// page error, and clicks through the AX100 and livestream stations the way a
// student would. Not part of `npm test` (it needs a browser); run it before
// shipping anything user-visible:
//
//   python3 -m http.server 8124 &   # from the repo root
//   node tools/smoke.mjs [http://localhost:8124] [screenshot-dir]
//
// Uses the Playwright that cloud sessions have preinstalled (falls back to a
// local `npm i playwright`). Chromium path: /opt/pw-browsers.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = createRequire("/opt/node-tools/node_modules/")("playwright"));
}
const base = process.argv[2] || "http://localhost:8124";
const shots = process.argv[3] || "";
if (shots) mkdirSync(shots, { recursive: true });
const { stations } = await import("../data/stations.js");

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const failures = [];

async function open(page, id) {
  await page.goto(`${base}/?debug=1#/station/${id}`);
  await page.waitForTimeout(900);
}
async function check(page, expectPass, label) {
  await page.click(".step-check");
  await page.waitForTimeout(150);
  const ok = await page.locator(".step-feedback.pass").isVisible();
  if (ok !== expectPass) failures.push(`${label}: expected ${expectPass ? "pass" : "fail"} — ${await page.locator(".step-feedback").innerText()}`);
  if (ok) await page.click(".step-next");
}

for (const [w, h, tag] of [
  [1280, 900, "desktop"],
  [390, 844, "phone"],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("pageerror", (e) => failures.push(`${tag} pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && failures.push(`${tag} console: ${m.text()}`));
  for (const s of stations) {
    await open(page, s.id);
    if (shots) await page.screenshot({ path: `${shots}/${tag}-${s.id}.png`, fullPage: true });
  }
  await page.close();
}

// ---- AX100, for real: drive it through the touchscreen and side panel ----
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => failures.push(`ax100 pageerror: ${e.message}`));
  await open(page, "ax100-out-of-bag");
  await check(page, false, "zebras not on yet");
  await page.click(".tool-chip:has-text('Zebras')");
  await check(page, true, "step 1 zebras");
  await page.click(".ax-lcd [data-item=aperture]");
  await check(page, true, "step 2 iris manual");
  await page.click(".ax-lcd [data-item=shutter]");
  await page.click(".ax-lcd [data-item=gainStops]");
  await check(page, true, "step 3 all manual");
  // set F4.0 / 60 / 3 dB through the ring (debug hook for speed — the ring is a Dial)
  await page.evaluate(() => {
    cameraLab.set("aperture", 4);
    cameraLab.set("shutter", 60);
    cameraLab.set("gainStops", 0.5);
  });
  await check(page, true, "step 4 house default");
  await page.evaluate(() => cameraLab.set("aperture", 2.8));
  await check(page, true, "step 5 correct to the room");
  await page.click(".ax-panel [data-wb]");
  await page.click(".ax-wbmenu [data-wbmode=temp]");
  await page.evaluate(() => cameraLab.set("wb", 3200));
  await check(page, true, "step 6 3200K");
  const af = await page.evaluate(() => cameraLab.get().settings.auto.focus);
  if (!af) await page.click(".ax-panel [data-af]");
  await check(page, true, "step 7 AF");
  // double press + MANUAL trap
  await open(page, "ax100-double-press");
  await page.click(".ax-lcd [data-item=gainStops]");
  await page.click(".ax-lcd [data-item=gainStops]");
  await check(page, true, "double press → auto");
  await page.click(".ax-lcd [data-item=gainStops]");
  await page.evaluate(() => cameraLab.set("gainStops", 0.5));
  await check(page, true, "back to 3 dB");
  await page.click(".ax-panel [data-manual]");
  await page.waitForTimeout(1500);
  const meter = await page.evaluate(() => cameraLab.get().derived.exposureStops);
  if (!(meter > 0.7)) failures.push(`MANUAL trap should overexpose the stage, got ${meter.toFixed(2)} stops`);
  await check(page, true, "MANUAL → all auto");
  await page.close();
}

// ---- Musco: the RP150, knob by knob ----
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => failures.push(`musco pageerror: ${e.message}`));
  await open(page, "musco-read-the-screen");
  const knob = (label) => page.locator(".knob").filter({ has: page.locator(`.knob-label:text-is("${label}")`) });
  await knob("IRIS").locator('[data-dir="-1"]').click(); // F5.0 → F5.6 (turning down closes)
  for (let i = 0; i < 8; i++) await knob("B PED").locator('[data-dir="1"]').click();
  await check(page, true, "RP150: camera 1 iris + B ped");
  await page.click('.rp-cam[data-cam="3"]');
  await page.evaluate(() => cameraLab.set("rGain", 1));
  await knob("R GAIN").locator('[data-dir="-1"]').click();
  await check(page, true, "RP150: camera 3 R gain");
  // camera 2 (the static wide) can be selected but not changed
  await page.click('.rp-cam[data-cam="2"]');
  const disabled = await knob("R GAIN").locator(".knob-step").first().isDisabled();
  if (!disabled) failures.push("camera 2 (static wide) knobs should be disabled");
  await page.click('.rp-cam[data-cam="4"]');
  await page.click('[data-wb="indoor"]');
  await check(page, true, "RP150: camera 4 A/3200K");
  // shade everything and pass the challenge
  await open(page, "musco-shade-all");
  await page.evaluate(() => {
    for (const i of [0, 2, 3, 4]) {
      cameraLab.rig(i);
      for (const [k, v] of Object.entries({ aperture: 5.6, gainStops: 0, wb: 3200, wbMode: "indoor", rGain: 0, bGain: 0, rPed: 0, bPed: 0, mPed: 0 })) cameraLab.set(k, v);
      cameraLab.auto("aperture", false);
    }
  });
  await page.click(".submit-btn");
  await page.waitForTimeout(400);
  if (!(await page.locator(".result-head.pass").isVisible())) failures.push(`musco shade-all: ${await page.locator(".results").innerText()}`);
  // Which Button: opens on Camera 4 (finished); a knob turned there fails it
  await open(page, "musco-which-button");
  if (!(await page.locator('.rp-cam.on[data-cam="4"]').isVisible())) failures.push("musco which-button: should open with button 4 lit");
  await knob("IRIS").locator('[data-dir="-1"]').click();
  await page.click(".submit-btn");
  await page.waitForTimeout(400);
  if (!/Camera 4 was changed/.test(await page.locator(".results").innerText())) failures.push("musco which-button: turning Camera 4 should fail");
  // Looks Off: whichever camera was picked, house defaults everywhere pass
  await open(page, "musco-looks-off");
  await page.evaluate(() => {
    for (const i of [0, 2, 3, 4]) {
      cameraLab.rig(i);
      for (const [k, v] of Object.entries({ aperture: 5.6, gainStops: 0, rGain: 0, bGain: 0, mPed: 0 })) cameraLab.set(k, v);
    }
  });
  await page.click(".submit-btn");
  await page.waitForTimeout(400);
  if (!(await page.locator(".result-head.pass").isVisible())) failures.push(`musco looks-off: ${await page.locator(".results").innerText()}`);
  await page.close();
}

// ---- Homework 5: the RP150 joystick, the tally, the switcher ----
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => failures.push(`hw5 pageerror: ${e.message}`));
  const aim = () => page.evaluate(() => [cameraLab.get().settings.aimU, cameraLab.get().settings.aimV]);
  // Point the active rig at a named target (parallax included), at a focal length.
  const frame = (rigId, target, focal) =>
    page.evaluate(
      async ([rigId, target, focal]) => {
        const { getScene } = await import("/js/scenes/index.js");
        const sc = getScene("musco-concert");
        const t = sc.targets[target];
        const a = cameraLab.get().rigs[rigId].def.angle;
        const du = a ? a.shift * (1 / t.depth - 1 / a.aimDepth) : 0;
        cameraLab.set("focal", focal);
        cameraLab.set("aimU", (t.x0 + t.x1) / 2 + du);
        cameraLab.set("aimV", (t.y0 + t.y1) / 2);
        cameraLab.set("focus", t.depth);
      },
      [rigId, target, focal],
    );
  const drag = async (dx, dy, ms = 500) => {
    await page.locator(".rp-joy").scrollIntoViewIfNeeded();
    const b = await page.locator(".rp-joy").boundingBox();
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 4 });
    await page.waitForTimeout(ms);
    await page.mouse.up();
  };
  await open(page, "musco-drive-ptz");
  const a0 = await aim();
  await drag(-50, 0);
  const a1 = await aim();
  if (!(a1[0] < a0[0] - 0.01)) failures.push(`joystick left should pan left: ${a0} → ${a1}`);
  await drag(0, 50);
  const a2 = await aim();
  if (!(a2[1] > a1[1] + 0.01)) failures.push(`joystick down should tilt down: ${a1} → ${a2}`);
  await check(page, false, "drive-ptz: not on the trumpets yet");
  await frame("4", "trumpets", 80);
  await check(page, true, "drive-ptz step 1");
  const speed = page.locator(".rp-speed .knob-step");
  await speed.first().click();
  await speed.first().click();
  await page.focus(".rp-joy");
  await page.keyboard.press("ArrowLeft");
  await frame("4", "trumpets", 80);
  await check(page, true, "drive-ptz step 2 (slow)");
  await frame("4", "trumpets", 130);
  await page.evaluate(() => cameraLab.set("focus", 8));
  await check(page, true, "drive-ptz step 3 (section)");
  await page.click("[data-focus-auto]");
  await page.waitForTimeout(2500);
  await page.click("[data-focus-auto]");
  await check(page, true, "drive-ptz step 4 (focus auto on → off)");

  // Red means live: touching the program camera fails the step once.
  await open(page, "musco-red-means-live");
  if (!(await page.locator(".monitor-tile.pgm .monitor-name").innerText()).includes("Camera 3")) failures.push("red-means-live: Camera 3 should have the red tally");
  await page.click('.rp-cam[data-cam="3"]');
  await drag(30, 0, 200);
  if (!/on PROGRAM/.test(await page.locator(".feed").innerText())) failures.push("moving the program camera should warn");
  await page.click('.rp-cam[data-cam="1"]');
  await frame("1", "flutes", 125);
  await check(page, false, "red-means-live: moved the live camera");
  await check(page, true, "red-means-live step 1 after the warning");
  if (!(await page.locator(".monitor-tile.pgm .monitor-name").innerText()).includes("Camera 1")) failures.push("red-means-live: step 2 should put Camera 1 on program");

  // Ready… Take: the student switches.
  await open(page, "musco-ready-take");
  await page.click('[data-bus="preview"] [data-src="3"]');
  await check(page, true, "ready 3");
  await page.click("[data-cut]");
  await check(page, true, "take 3");
  await page.waitForTimeout(300);
  await page.click('[data-bus="program"] [data-src="4"]');
  await check(page, false, "took camera 4 mid-move");
  await page.click('[data-bus="program"] [data-src="2"]');
  await check(page, true, "safe shot: 2");
  await page.waitForTimeout(14500);
  await page.click('[data-bus="preview"] [data-src="4"]');
  await page.click("[data-cut]");
  await check(page, true, "take 4 after it landed");
  await page.click('[data-bus="preview"] [data-src="2"]');
  await page.click("[data-cut]");
  await check(page, true, "back to 2");
  await page.close();
}

// ---- Salmon livestream ----
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => failures.push(`livestream pageerror: ${e.message}`));
  await open(page, "salmon-livestream");
  const box = await page.locator(".mv-canvas").boundingBox();
  await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.12); // Camera 1
  await check(page, true, "tap program box");
  await page.click('[data-bus="preview"] [data-src="2"]');
  await page.click("[data-cut]");
  await check(page, true, "static wide on program");
  await page.click("[data-onair]");
  await check(page, true, "on air");
  await page.click('[data-bus="preview"] [data-src="1"]');
  await check(page, true, "preview is safe");
  await page.click("[data-onair]");
  await check(page, true, "off air");
  await page.close();
}

// ---- AX100 WB shift square: tap the A5 G2 cell, read it back ----
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => failures.push(`wb pad pageerror: ${e.message}`));
  await open(page, "match-rovocam");
  await page.click(".ax-buttons [data-wb]");
  await page.click('[data-wbmode="temp"]');
  const grid = page.locator(".wb-pad-grid");
  await grid.scrollIntoViewIfNeeded();
  const g = await grid.boundingBox();
  // 15 × 15 cells for ±7: A5 is column 12 of 15, G2 is row 5 of 15 (from the top)
  await grid.click({ position: { x: g.width * (12.5 / 15), y: g.height * (5.5 / 15) } });
  await page.waitForTimeout(150);
  const val = await page.locator(".wb-pad-value").innerText();
  const lcd = await page.locator(".ax-lcd [data-wb]").innerText();
  if (val !== "A5 G2" || !lcd.includes("A5 G2")) failures.push(`WB pad: tapped A5 G2, got "${val}" (screen "${lcd}")`);
  const dot = await page.locator(".wb-pad-dot").boundingBox();
  const cx = dot.x + dot.width / 2 - g.x;
  if (Math.abs(cx / g.width - 12.5 / 15) > 0.02) failures.push(`WB pad: dot not centered in its cell (${(cx / g.width).toFixed(3)})`);
  await page.click(".wb-pad-zero");
  if ((await page.locator(".wb-pad-value").innerText()) !== "0 (no shift)") failures.push("WB pad: 0 didn't clear the shift");
  await page.close();
}

// ---- Lens Shopping (phone size: the lens menu has to work there) ----
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => failures.push(`lens-shopping pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && failures.push(`lens-shopping console: ${m.text()}`));
  await open(page, "lens-shopping");
  const widest = () => page.evaluate(() => cameraLab.set("focal", 1));
  const lens = async (id) => {
    await page.selectOption(".picker select", id);
    await page.waitForTimeout(150);
    await widest();
  };
  await check(page, false, "booth: not zoomed out yet");
  await widest();
  await check(page, true, "booth: zoomed out");
  await widest();
  await check(page, true, "aisle: zoomed out");
  await check(page, false, "aisle: 14–140 can't fit the orchestra");
  await lens("gh5-7-5");
  await check(page, false, "aisle: Laowa fits but is wider than needed");
  await lens("gh5-12-60");
  await check(page, true, "aisle: 12–60");
  await lens("gh5-12-60");
  await check(page, false, "front: 12–60 too long");
  await lens("gh5-9-18");
  await check(page, true, "front: 9–18");
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`smoke ok: ${stations.length} stations × 2 viewports, AX100, WB pad, RP150, HW5 PTZ/tally/switcher, livestream and lens-shopping walkthroughs`);
