import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage } from "@jini-ai/chat/core";
import type { DurableRun } from "@jini-ai/chat/server/durable-runs";
import type { ChatRunLedger } from "#src/assistant/persistence/run-ledger";
import { recoveryLedgerFixture } from "#src/server/__tests__/durable-ledger.fixture";
import { readProcessStart } from "#src/server/inbound/assistant/attempt-process-identity";
import { createAssistantRunFinalizer, type AssistantRunFinalizerOptions } from "../entry.js";
import type { RunDaemonClient } from "../../run-daemon-http-client.js";

// The real durable coordinator (`createDurableRecovery`) runs behind these tests; only the store
// and the daemon are fakes. The recovery binding is reached through the finalizer that builds it.

const ended = (runId: string) => new Response(`event: end\ndata: ${JSON.stringify({ runId, kind: "end", payload: { status: "succeeded", code: 0 } })}\n\n`);

function interruptedRun({ overrides }: { overrides: Partial<DurableRun> }, _optional = {}) {
  const message: ChatMessage = { id: "answer", role: "assistant", content: "Partial", runId: "old", runStatus: "running", events: [{ kind: "text", text: "Partial" }] };
  const { ledger } = recoveryLedgerFixture({ message, now: () => 1234 }, {});
  const durable = ledger.durable!;
  const withOverrides: ChatRunLedger = { ...ledger, durable: { ...durable,
    load: async (...args) => { const run = await durable.load(...args); return run && { ...run, ...overrides }; },
  } };
  return { message, ledger: withOverrides };
}

function recordingDaemon({ withLaunch = true }: { withLaunch?: boolean } = {}) {
  const launched: Array<{ runId: string; contextRef: Record<string, unknown> }> = [];
  const canceled: Array<{ runId: string; principalId: string }> = [];
  const daemon: RunDaemonClient = {
    runStatus: async () => 200,
    openEvents: async ({ runId }) => ended(runId),
    cancel: async (required) => { canceled.push(required); },
    ...(withLaunch ? { launch: async ({ run, request }: Parameters<NonNullable<RunDaemonClient["launch"]>>[0]) => {
      launched.push({ runId: run.runId, contextRef: JSON.parse(request.contextRef) as Record<string, unknown> });
    } } : {}),
  };
  return { daemon, launched, canceled };
}

async function recoverFailedAttempt({ overrides, options = {} }: { overrides: Partial<DurableRun>; options?: Partial<AssistantRunFinalizerOptions> }, _optional = {}) {
  const { ledger, message } = interruptedRun({ overrides });
  const { daemon, launched } = recordingDaemon();
  const finalizer = createAssistantRunFinalizer({ ledger, daemon, now: () => 1234, checkpointIntervalMs: 0, reconnectDelayMs: 0, ...options });
  const decision = await finalizer.recover({ messageId: "answer", trigger: "attempt-failed", expectedRunId: "old" }, {});
  await finalizer.idle();
  return { decision, launched, message };
}

const confirmedSession = (agentId: string, child: { pid: number; startedAt: string }): Partial<DurableRun> => ({
  sessionId: "sess-a", sessionConfirmed: true, child,
  request: { agentId, contextRef: JSON.stringify({ prompt: "Answer", conversationId: "chat", assistantMessageId: "answer" }) },
});

test("a finalizer built without a durable store answers every recovery request with gone", async () => {
  const { ledger } = interruptedRun({ overrides: {} });
  const { daemon } = recordingDaemon();
  const finalizer = createAssistantRunFinalizer({ ledger: { ...ledger, durable: undefined }, daemon, now: () => 1234 });
  assert.equal(await finalizer.recover({ messageId: "answer", trigger: "attempt-failed", expectedRunId: "old" }, {}), "gone");
});

test("default recovery ports resume natively only for a memory-carrying agent whose recorded child the OS proves is gone", async () => {
  const reusedPid = { pid: process.pid, startedAt: "Thu Jan  1 00:00:00 1970" };
  const native = await recoverFailedAttempt({ overrides: confirmedSession("claude", reusedPid) });
  assert.equal(native.decision, "continued");
  assert.equal(native.launched.length, 1);
  assert.equal(native.launched[0]!.contextRef.recoveryMode, "native");
  assert.equal(native.launched[0]!.contextRef.recoverySessionId, "sess-a");

  // Same dead child, but an agent with no known session-resume capability: rebuild from the transcript.
  const memoryless = await recoverFailedAttempt({ overrides: confirmedSession("unlisted-agent", reusedPid) });
  assert.equal(memoryless.launched[0]!.contextRef.recoveryMode, "reconstruction");
  assert.equal(memoryless.launched[0]!.contextRef.recoverySessionId, undefined);

  // The recorded child is this very process (same OS start identity): it is alive, so no native resume.
  const startedAt = await readProcessStart({ pid: process.pid }, {});
  assert.equal(typeof startedAt, "string");
  const alive = await recoverFailedAttempt({ overrides: confirmedSession("claude", { pid: process.pid, startedAt: startedAt! }) });
  assert.equal(alive.launched[0]!.contextRef.recoveryMode, "reconstruction");
});

test("injected child-death and native-resume ports replace the defaults", async () => {
  const childChecks: Array<{ pid: number; startedAt: string }> = [];
  const refused = await recoverFailedAttempt({ overrides: confirmedSession("claude", { pid: 4242, startedAt: "fake-start" }),
    options: { verifyChildDead: async (child) => { childChecks.push(child); return false; } } });
  assert.deepEqual(childChecks, [{ pid: 4242, startedAt: "fake-start" }]);
  assert.equal(refused.launched[0]!.contextRef.recoveryMode, "reconstruction");

  const agents: string[] = [];
  const allowed = await recoverFailedAttempt({ overrides: confirmedSession("unlisted-agent", { pid: 4242, startedAt: "fake-start" }),
    options: { verifyChildDead: async () => true, supportsNativeResume: ({ agentId }) => { agents.push(agentId); return true; } } });
  assert.deepEqual(agents, ["unlisted-agent"]);
  assert.equal(allowed.launched[0]!.contextRef.recoveryMode, "native");
});

test("a recovery that reaches a run with no principal stops it without asking the daemon to cancel for nobody", async () => {
  const { ledger, message } = interruptedRun({ overrides: { principalId: "" } });
  const { daemon, canceled, launched } = recordingDaemon();
  const finalizer = createAssistantRunFinalizer({ ledger, daemon, now: () => 1234 });
  assert.equal(await finalizer.recover({ messageId: "answer", trigger: "boot" }, {}), "finalized");
  assert.deepEqual(canceled, []);
  assert.deepEqual(launched, []);
  assert.equal(message.runStatus, "canceled");

  // Control: the same stop with a principal does cancel the attempt on the daemon.
  const owned = interruptedRun({ overrides: { cancelReason: "user" } });
  const ownedDaemon = recordingDaemon();
  const ownedFinalizer = createAssistantRunFinalizer({ ledger: owned.ledger, daemon: ownedDaemon.daemon, now: () => 1234 });
  assert.equal(await ownedFinalizer.recover({ messageId: "answer", trigger: "boot" }, {}), "finalized");
  assert.deepEqual(ownedDaemon.canceled, [{ runId: "old", principalId: "owner" }]);
});

test("a daemon without a continuation port records an unconfirmed start that names the missing port", async () => {
  const { ledger, message } = interruptedRun({ overrides: {} });
  const { daemon } = recordingDaemon({ withLaunch: false });
  const finalizer = createAssistantRunFinalizer({ ledger, daemon, now: () => 1234, checkpointIntervalMs: 0, reconnectDelayMs: 0 });
  assert.equal(await finalizer.recover({ messageId: "answer", trigger: "attempt-failed", expectedRunId: "old" }, {}), "continued");
  await finalizer.idle();
  const unconfirmed = (message.events ?? []).find((event) => event.kind === "status" && event.code === "run_launch_unconfirmed");
  assert.equal(unconfirmed?.kind, "status");
  assert.match(unconfirmed?.kind === "status" ? unconfirmed.detail ?? "" : "", /Startup stage: recovery launch\nCause: daemon continuation port is unavailable/);
});
