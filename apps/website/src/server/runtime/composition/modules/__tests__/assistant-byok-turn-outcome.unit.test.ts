import assert from "node:assert/strict";
import test from "node:test";

import { byokTurnOutcome } from "../assistant-byok.js";

/**
 * @file `byokTurnOutcome` — the agent-run outcome a BYOK turn's span ends with. The route-level span
 * tests (`assistant-byok-routes.test.ts`) reach succeeded, failed-by-reported-error and canceled
 * through real turns; a provider adapter that THROWS without an abort has no route-level trigger
 * (adapters report failures as events), so the throw arm is pinned here.
 */

test("an abort is canceled whatever else happened — a reported error or a throw does not make it a failure", () => {
  assert.deepEqual(byokTurnOutcome({ aborted: true, reportedError: true }, { thrown: { error: new Error("aborted") } }), { status: "canceled" });
  assert.deepEqual(byokTurnOutcome({ aborted: true, reportedError: false }), { status: "canceled" });
});

test("a throw is failed and carries the error, so the span records its type", () => {
  const error = new TypeError("boom");
  assert.deepEqual(byokTurnOutcome({ aborted: false, reportedError: false }, { thrown: { error } }), { status: "failed", error });
});

test("a turn that resolved after reporting a provider error is failed; a clean one succeeded", () => {
  assert.deepEqual(byokTurnOutcome({ aborted: false, reportedError: true }), { status: "failed" });
  assert.deepEqual(byokTurnOutcome({ aborted: false, reportedError: false }), { status: "succeeded" });
});
