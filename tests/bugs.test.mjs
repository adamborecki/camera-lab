import test from "node:test";
import assert from "node:assert/strict";
import { BugLog, reportText, issueUrl } from "../js/bugs.js";
import { previewSlug, storageKey, liveUrl } from "../js/deploy-context.js";

function memory() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
}

test("bug reports persist and format", () => {
  const store = memory();
  const log = new BugLog(store, "k");
  log.add({ text: "  the ring   skipped F4  ", station: "ax100-out-of-bag", title: "The AX100, For Real", camera: "Sony FDR-AX100" });
  assert.equal(new BugLog(store, "k").list().length, 1);
  const r = log.list()[0];
  assert.equal(r.text, "the ring   skipped F4");
  assert.match(reportText(r), /What happened: the ring skipped F4/);
  assert.match(issueUrl(r), /^https:\/\/github\.com\/adamborecki\/camera-lab\/issues\/new\?/);
});

test("branch previews keep their own saved data", () => {
  assert.equal(previewSlug("/camera-lab/branch/claude-hw3/"), "claude-hw3");
  assert.equal(previewSlug("/camera-lab/"), null);
  assert.equal(storageKey("x", "claude-hw3"), "x@claude-hw3");
  assert.equal(storageKey("x", null), "x");
  assert.equal(liveUrl("https://a.github.io/camera-lab/branch/claude-hw3/#/station/x"), "https://a.github.io/camera-lab/");
});
