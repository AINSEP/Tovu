import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEarlySessionCapture, sessionIdFromRunEvent } from "../early-run-session.js";
import { verifyAttemptChildDead } from "../attempt-process-identity.js";
import type { DurableRunStore } from "#src/assistant/durable-runs/ports";
import type { AgentSessionStore } from "#src/assistant/persistence/agent-session-store";

for (const [agentId, sessionId] of [["codex", "thread-123"], ["opencode", "session-456"]]) {
  test(`${agentId} first status persists its session and OS child identity without waiting for end`, async () => {
    const calls: unknown[] = [];
    const sessions: AgentSessionStore = { getSessionId: async () => null, clearSessionId: async () => {},
      setSessionId: async (value) => { calls.push(["session", value]); } };
    const durable = { captureSession: async (value: unknown) => { calls.push(["attempt", value]); return true; } } as unknown as DurableRunStore;
    const capture = createEarlySessionCapture({ sessions, durable, readStart: async () => "Tue Oct 6 09:55:00 2026" }, {});
    await capture({ runId: "old", conversationId: "chat", agentId: agentId!, event: { kind: "agent", payload: { type: "status", label: "initializing", sessionId, childPid: 43 } } }, {});
    assert.deepEqual(calls, [
      ["attempt", { runId: "old", sessionId }],
      ["attempt", { runId: "old", sessionId, child: { pid: 43, startedAt: "Tue Oct 6 09:55:00 2026" } }],
    ]);
  });
}

test("stale attempt session capture cannot overwrite the conversation's newer session", async () => {
  let writes = 0;
  const captured: unknown[] = [];
  const processReads: unknown[] = [];
  const sessions = { setSessionId: async () => { writes++; } } as unknown as AgentSessionStore;
  const durable = { captureSession: async (value: unknown) => { captured.push(value); return false; } } as unknown as DurableRunStore;
  await createEarlySessionCapture({ sessions, durable, readStart: async (value) => { processReads.push(value); return "child-start"; } }, {})({ runId: "old", conversationId: "chat", agentId: "codex",
    event: { kind: "agent", payload: { type: "status", sessionId: "stale", childPid: 43 } },
  }, {});
  assert.equal(writes, 0);
  assert.deepEqual(captured, [{ runId: "old", sessionId: "stale" }]);
  assert.deepEqual(processReads, [], "a rejected attempt must not query its child process");
});

test("null and primitive event payloads yield no session locator", () => {
  for (const kind of ["agent", "end"]) {
    for (const payload of [null, undefined, "text", 43, false]) {
      assert.equal(sessionIdFromRunEvent({ event: { kind, payload } }, {}), undefined);
    }
  }
});

test("session locators without a numeric child PID persist without process lookup", async () => {
  for (const childPid of [undefined, "43"]) {
    const captured: unknown[] = [];
    const processReads: unknown[] = [];
    const sessions = { setSessionId: async () => assert.fail("durable capture must own the locator") } as unknown as AgentSessionStore;
    const durable = { captureSession: async (value: unknown) => { captured.push(value); return true; } } as unknown as DurableRunStore;
    await createEarlySessionCapture({ sessions, durable,
      readStart: async (value) => { processReads.push(value); return "child-start"; } }, {})({
      runId: "run", conversationId: "chat", agentId: "codex",
      event: { kind: "agent", payload: { type: "status", sessionId: "session", childPid } },
    }, {});
    assert.deepEqual(captured, [{ runId: "run", sessionId: "session" }]);
    assert.deepEqual(processReads, []);
  }
});

test("end remains compatible but non-status events never fabricate a session locator", () => {
  assert.equal(sessionIdFromRunEvent({ event: { kind: "end", payload: { sessionRef: "legacy" } } }, {}), "legacy");
  assert.equal(sessionIdFromRunEvent({ event: { kind: "agent", payload: { type: "text_delta", sessionId: "wrong" } } }, {}), undefined);
});

test("native resume verifies OS start identity; daemon PID reuse is not evidence", async () => {
  const child = { pid: 43, startedAt: "old-start" };
  assert.equal(await verifyAttemptChildDead(child, { readStart: async () => "old-start" }), false);
  assert.equal(await verifyAttemptChildDead(child, { readStart: async () => "new-start" }), true);
  assert.equal(await verifyAttemptChildDead(child, { readStart: async () => null }), true);
  await assert.rejects(verifyAttemptChildDead(child, { readStart: async () => { throw new Error("process identity unavailable"); } }), { message: "process identity unavailable" });
});

test("unbound legacy clients retain end-session persistence without weakening durable generation guards", async () => {
  const calls: unknown[] = [];
  const processReads: unknown[] = [];
  const sessions = { setSessionId: async (required: unknown) => { calls.push(required); } } as unknown as AgentSessionStore;
  const durable = { captureSession: async () => assert.fail("unbound legacy client reached durable capture") } as unknown as DurableRunStore;
  await createEarlySessionCapture({ sessions, durable, readStart: async (value) => { processReads.push(value); return "child-start"; } }, {})({ runId: "legacy", conversationId: "chat", agentId: "claude",
    event: { kind: "end", payload: { sessionRef: "legacy-session", childPid: 43 } },
  }, { durableBinding: false });
  assert.deepEqual(calls, [{ conversationId: "chat", agentId: "claude", sessionId: "legacy-session" }]);
  assert.deepEqual(processReads, []);
});

test("an unreadable child process identity still keeps the committed session locator, and records no child", async () => {
  const calls: unknown[] = [];
  const sessions: AgentSessionStore = { getSessionId: async () => null, clearSessionId: async () => {}, setSessionId: async () => {} };
  const durable = { captureSession: async (value: unknown) => { calls.push(value); return true; } } as unknown as DurableRunStore;
  const capture = createEarlySessionCapture({ sessions, durable, readStart: async () => { throw new Error("ps unavailable"); } }, {});
  await capture({ runId: "run-1", conversationId: "chat", agentId: "codex", event: { kind: "agent", payload: { type: "status", sessionId: "thread-9", childPid: 77 } } });
  assert.deepEqual(calls, [{ runId: "run-1", sessionId: "thread-9" }]);
});

test("an empty child start identity is not recorded as the child", async () => {
  const calls: unknown[] = [];
  const sessions: AgentSessionStore = { getSessionId: async () => null, clearSessionId: async () => {}, setSessionId: async () => {} };
  const durable = { captureSession: async (value: unknown) => { calls.push(value); return true; } } as unknown as DurableRunStore;
  await createEarlySessionCapture({ sessions, durable, readStart: async () => null })({
    runId: "run-2", conversationId: "chat", agentId: "codex", event: { kind: "agent", payload: { type: "status", sessionId: "thread-10", childPid: 78 } },
  });
  assert.deepEqual(calls, [{ runId: "run-2", sessionId: "thread-10" }]);
});

test("only a string end sessionRef and a non-empty string status sessionId count as a session locator", () => {
  assert.equal(sessionIdFromRunEvent({ event: { kind: "end", payload: { sessionRef: 7 } } }), undefined);
  assert.equal(sessionIdFromRunEvent({ event: { kind: "end", payload: {} } }), undefined);
  assert.equal(sessionIdFromRunEvent({ event: { kind: "agent", payload: { type: "status", sessionId: "" } } }), undefined);
  assert.equal(sessionIdFromRunEvent({ event: { kind: "agent", payload: { type: "status", sessionId: 12 } } }), undefined);
  assert.equal(sessionIdFromRunEvent({ event: { kind: "agent", payload: { type: "status", sessionId: "thread-1" } } }), "thread-1");
  assert.equal(sessionIdFromRunEvent({ event: { kind: "tool", payload: { type: "status", sessionId: "thread-1" } } }), undefined);
});

test("a host with no durable run store persists the locator through the session store and never reads the child identity", async () => {
  const calls: unknown[] = [];
  const sessions: AgentSessionStore = { getSessionId: async () => null, clearSessionId: async () => {}, setSessionId: async (value) => { calls.push(value); } };
  const reads: unknown[] = [];
  await createEarlySessionCapture({ sessions, readStart: async (value) => { reads.push(value); return "start"; } })({
    runId: "run-3", conversationId: "chat-3", agentId: "codex", event: { kind: "agent", payload: { type: "status", sessionId: "thread-3", childPid: 79 } },
  });
  assert.deepEqual(calls, [{ conversationId: "chat-3", agentId: "codex", sessionId: "thread-3" }]);
  assert.deepEqual(reads, []);
});
