import assert from "node:assert/strict";
import test from "node:test";

import {
  clearAssistantDaemonFailure,
  getAssistantDaemonFailureReasonCode,
  getReadinessSnapshot,
  isAssistantDaemonKnownFailed,
  recordAssistantDaemonFailure,
  setReadinessSnapshot,
} from "../../readiness-state.js";

/**
 * @file Degraded-boot defect fix — unit coverage for the agent daemon's post-listen health being
 * latched into the same snapshot `/readyz` and the module-status route already expose.
 *
 * `recordAssistantDaemonFailure`/`isAssistantDaemonKnownFailed`/`clearAssistantDaemonFailure` are
 * the state `server/modules/assistant.ts` short-circuits on and `index.ts`'s `spawnAgentDaemon()`
 * latches — see those files' own docs for the end-to-end story. This file proves the state module
 * itself in isolation: latch, visibility in the snapshot, clear, and that a daemon failure never
 * flips the rest of the app's own `ok`.
 */

test.afterEach(() => {
  // This module is a process-wide singleton (by design — see its own header), so every test must
  // leave it exactly as it found it or later tests in this same process inherit stale state.
  clearAssistantDaemonFailure();
  setReadinessSnapshot({ ok: true, modules: [] });
});

test("isAssistantDaemonKnownFailed is false before anything has latched", () => {
  assert.equal(isAssistantDaemonKnownFailed(), false);
});

test("recordAssistantDaemonFailure latches a visible, optional, failed module entry", () => {
  recordAssistantDaemonFailure("agent daemon could not bind 127.0.0.1:4319 — address already in use");

  assert.equal(isAssistantDaemonKnownFailed(), true);
  const entry = getReadinessSnapshot().modules.find((m) => m.name === "assistant-daemon");
  assert.ok(entry, "the failure must be visible on the same snapshot /readyz and module-status read");
  assert.equal(entry?.criticality, "optional");
  assert.equal(entry?.lifecycle.status, "failed");
  assert.equal(
    entry?.lifecycle.status === "failed" ? entry.lifecycle.reasonCode : undefined,
    "agent daemon could not bind 127.0.0.1:4319 — address already in use",
    "the specific reason must survive into the snapshot, not just a generic flag"
  );
});

test("recordAssistantDaemonFailure never flips the rest of the app's own readiness to false", () => {
  setReadinessSnapshot({ ok: true, modules: [{ name: "identity", owner: "core", criticality: "critical", lifecycle: { status: "ready" } }] });

  recordAssistantDaemonFailure("agent daemon exited unexpectedly (code 1, signal none)");

  assert.equal(getReadinessSnapshot().ok, true, "an optional daemon failure must not make the rest of the app read as down");
});

test("recordAssistantDaemonFailure called twice replaces the entry rather than duplicating it", () => {
  recordAssistantDaemonFailure("first reason");
  recordAssistantDaemonFailure("second reason");

  const entries = getReadinessSnapshot().modules.filter((m) => m.name === "assistant-daemon");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].lifecycle.status === "failed" ? entries[0].lifecycle.reasonCode : undefined, "second reason");
});

test("clearAssistantDaemonFailure removes the latch", () => {
  recordAssistantDaemonFailure("agent daemon exited unexpectedly (code 1, signal none)");
  assert.equal(isAssistantDaemonKnownFailed(), true);

  clearAssistantDaemonFailure();

  assert.equal(isAssistantDaemonKnownFailed(), false);
  assert.equal(
    getReadinessSnapshot().modules.some((m) => m.name === "assistant-daemon"),
    false,
    "clearing must remove the entry, not merely flip its status, so a stale reasonCode can't linger"
  );
});

test("clearAssistantDaemonFailure on an already-clear snapshot is a safe no-op", () => {
  assert.equal(isAssistantDaemonKnownFailed(), false);
  clearAssistantDaemonFailure();
  assert.equal(isAssistantDaemonKnownFailed(), false);
});

/**
 * `getAssistantDaemonFailureReasonCode` — added 2026-08-17 alongside `server/modules/assistant.ts`'s
 * 503 body fix (Terra's review finding: the old body claimed "failed to start for this boot" for
 * BOTH a never-started daemon and a mid-life crash-loop give-up, which are different situations).
 * This is the seam that lets a caller tell them apart without re-deriving the synthetic module name.
 */
test("getAssistantDaemonFailureReasonCode is null before anything has latched", () => {
  assert.equal(getAssistantDaemonFailureReasonCode(), null);
});

test("getAssistantDaemonFailureReasonCode returns the exact latched string — proving a 'gave up after crash-looping' reason is distinguishable from a 'never started' one, not just a generic true/false", () => {
  recordAssistantDaemonFailure("gave up after 5 attempts in 60s: agent daemon exited unexpectedly (code 1, signal none)");
  assert.equal(
    getAssistantDaemonFailureReasonCode(),
    "gave up after 5 attempts in 60s: agent daemon exited unexpectedly (code 1, signal none)"
  );
});

test("getAssistantDaemonFailureReasonCode returns null again once the latch is cleared", () => {
  recordAssistantDaemonFailure("agent daemon exited unexpectedly (code 1, signal none)");
  clearAssistantDaemonFailure();
  assert.equal(getAssistantDaemonFailureReasonCode(), null);
});
