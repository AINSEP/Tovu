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
  const sessions = { setSessionId: async () => { writes++; } } as unknown as AgentSessionStore;
  const durable = { captureSession: async () => false } as unknown as DurableRunStore;
  await createEarlySessionCapture({ sessions, durable, readStart: async () => null }, {})({ runId: "old", conversationId: "chat", agentId: "codex",
    event: { kind: "agent", payload: { type: "status", sessionId: "stale" } },
  }, {});
  assert.equal(writes, 0);
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
  const sessions = { setSessionId: async (required: unknown) => { calls.push(required); } } as unknown as AgentSessionStore;
  const durable = { captureSession: async () => assert.fail("unbound legacy client reached durable capture") } as unknown as DurableRunStore;
  await createEarlySessionCapture({ sessions, durable, readStart: async () => null }, {})({ runId: "legacy", conversationId: "chat", agentId: "claude",
    event: { kind: "end", payload: { sessionRef: "legacy-session" } },
  }, { durableBinding: false });
  assert.deepEqual(calls, [{ conversationId: "chat", agentId: "claude", sessionId: "legacy-session" }]);
});
