import assert from "node:assert/strict";
import test from "node:test";

import {
  notifyExternalMcpRosterChanged,
  onExternalMcpRosterChanged,
  resetExternalMcpRosterChangeListenersForTests,
} from "../external-mcp-roster-change.js";

/**
 * @file RED-first coverage for the roster-change notifier's three load-bearing properties: last-wins
 * registration, the `waitMs` cap, and tolerance for a throwing listener. See
 * `external-mcp-roster-change.ts`'s own header for why each property exists.
 */

test.beforeEach(() => {
  resetExternalMcpRosterChangeListenersForTests();
});

test("registering the same key twice keeps only the last listener, so one call", async () => {
  let firstCalls = 0;
  let secondCalls = 0;
  onExternalMcpRosterChanged("agent-daemon", () => {
    firstCalls += 1;
  });
  onExternalMcpRosterChanged("agent-daemon", () => {
    secondCalls += 1;
  });

  await notifyExternalMcpRosterChanged();

  assert.equal(firstCalls, 0, "the replaced listener must never fire");
  assert.equal(secondCalls, 1, "the replacement listener fires exactly once");
});

test("a listener that never resolves makes notify({waitMs: 20}) resolve within 200ms", async () => {
  onExternalMcpRosterChanged("stuck", () => new Promise(() => {}));

  const startedAt = Date.now();
  await notifyExternalMcpRosterChanged({ waitMs: 20 });
  const elapsedMs = Date.now() - startedAt;

  assert.ok(elapsedMs < 200, `expected notify to resolve within 200ms, took ${elapsedMs}ms`);
});

test("a throwing listener does not reject notify", async () => {
  onExternalMcpRosterChanged("throws-sync", () => {
    throw new Error("boom");
  });
  onExternalMcpRosterChanged("rejects-async", async () => {
    throw new Error("also boom");
  });

  await assert.doesNotReject(() => notifyExternalMcpRosterChanged());
});
