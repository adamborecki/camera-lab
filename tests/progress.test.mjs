// Challenge attempt counting, as it lands in the Canvas receipt.
import test from "node:test";
import assert from "node:assert/strict";
import { recordChallenge, getState } from "../js/progress.js";

test("a Check on unchanged settings isn't a new attempt; a pass is kept", () => {
  recordChallenge("t-attempts", { passed: false, failed: ["B: Recording"] });
  recordChallenge("t-attempts", { passed: false, failed: ["B: Recording"], repeat: true });
  assert.equal(getState().challenges["t-attempts"].attempts, 1, "same settings checked twice = 1 attempt");
  recordChallenge("t-attempts", { passed: true, failed: [] });
  recordChallenge("t-attempts", { passed: false, failed: ["A: Recording"] });
  const c = getState().challenges["t-attempts"];
  assert.equal(c.attempts, 3);
  assert.equal(c.passed, true, "a later fail doesn't overwrite the pass");
  assert.ok(c.at && c.lastCheckedAt, "timestamps for the receipt");
  assert.equal("repeat" in c, false, "the flag isn't stored");
});

test("the first Check counts even if nothing was touched", () => {
  recordChallenge("t-first", { passed: false, failed: [], repeat: true });
  assert.equal(getState().challenges["t-first"].attempts, 1);
});
