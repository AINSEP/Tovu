import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";
import { createLiveRunTracker } from "@jini-ai/daemon/session-coordination";
import type { AgentSessionStore } from "@jini-ai/daemon/store/agent-sessions";
import { CONCURRENT_RUN_REFUSAL_MESSAGE } from "../../../../assistant/agent-session-preset.js";
import { captureDaemonRun } from "./helpers/daemon-source.js";

/**
 * @file Session-locator branches of `agent-daemon-run-session.ts` not pinned elsewhere: a durable
 * attempt reads its own attempt locator instead of the conversation's, and a dead-session clear
 * that fails is logged rather than lost. Drives the real `createRunStartHandler` and a real lifecycle.
 */

const CONVERSATION = "conv-session";

function conversationBindings(agentSessions: AgentSessionStore, errors: string[], extraDeps: Record<string, unknown> = {}) {
  return {
    liveRunTracker: createLiveRunTracker({}, {}), waitForStoppingRuns: async () => {}, STOPPING_RUN_WAIT_MS: 0, CONCURRENT_RUN_REFUSAL_MESSAGE,
    RUN_OWNER_RETENTION_MS: 1,
    routeDeps: { workspaceId: "ws-session", agentSessions, chatRunLedger: {}, ...extraDeps },
    console: { error: (...args: unknown[]) => { errors.push(args.map(String).join(" ")); }, log() {}, warn() {} },
  };
}

test("a failed resume whose dead-session clear rejects is logged with the run id", async () => {
  const runId = "resume-clear-fails";
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  await lifecycle.start({ contextRef: "fixture" }, { runId });
  const errors: string[] = [];
  const clears: unknown[] = [];
  const agentSessions: AgentSessionStore = {
    getSessionId: async () => "dead-locator", setSessionId: async () => {},
    clearSessionId: async (input) => { clears.push(input); throw new Error("store offline"); },
  };
  const launch = await captureDaemonRun({ conversationId: CONVERSATION, prompt: "Continue" },
    { runId, lifecycle, bindings: conversationBindings(agentSessions, errors) });
  assert.equal(launch.resumeSessionId, "dead-locator");
  await lifecycle.finish({ runId, status: "failed", code: 1, signal: null, resumable: false });
  const deadline = Date.now() + 2000;
  while (!errors.some(line => line.includes("failed to clear")) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(clears, [{ conversationId: CONVERSATION, agentId: "claude" }]);
  assert.ok(errors.includes(`[agent-daemon] run ${runId}: failed to clear dead agent session id Error: store offline`), JSON.stringify(errors));
});

test("a durable attempt resumes its own attempt locator, not the conversation's stored session", async () => {
  const attemptLookups: unknown[] = [];
  const conversationLookups: unknown[] = [];
  const agentSessions: AgentSessionStore = {
    getSessionId: async (input) => { conversationLookups.push(input); return "conversation-locator"; },
    setSessionId: async () => {}, clearSessionId: async () => {},
  };
  const durable = { find: async () => ({ cancelReason: null, message: { runStatus: "running" as const } }), captureSession: async () => true };
  const launch = await captureDaemonRun({ conversationId: CONVERSATION, prompt: "Continue", assistantMessageId: "answer-7" }, {
    runId: "durable-attempt", lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async () => {}, onCancelRequested: () => () => {} },
    bindings: conversationBindings(agentSessions, [], {
      chatRunLedger: { durable },
      getSessionForAttempt: async (input: unknown) => { attemptLookups.push(input); return "attempt-locator"; },
    }),
  });
  assert.equal(launch.resumeSessionId, "attempt-locator");
  assert.deepEqual(attemptLookups, [{ runId: "durable-attempt" }]);
  assert.deepEqual(conversationLookups, []);
});
