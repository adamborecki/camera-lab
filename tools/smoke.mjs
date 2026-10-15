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

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`smoke ok: ${stations.length} stations × 2 viewports, AX100 + livestream walkthroughs`);
