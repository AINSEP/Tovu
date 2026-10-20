import assert from "node:assert/strict";
import test, { describe } from "node:test";

import type { AgentExecutorRunInput } from "@jini-ai/daemon";
import type { DurableRun, DurableRunStore } from "#src/assistant/durable-runs/ports";
import type { AgentSessionStore } from "#src/assistant/persistence/agent-session-store";
import { CONCURRENT_RUN_REFUSAL_MESSAGE, createLiveRunTracker } from "../../../../assistant/agent-session-preset.js";
import { captureDaemonRun } from "./helpers/daemon-source.js";

/**
 * @file Behaviour pins for every branch of `onStarted`'s async continuation and its
 * `resolveSessionBinding` critical section (session trust: which CLI session a run resumes, which
 * id it mints and where that id is persisted, and when a run is refused). Executes the real
 * handler's AST through `captureDaemonRun`; importing the entry script would boot the daemon.
 */

const CONVERSATION = "conv-pinned";
const OTHER_RUN = "other-live-run";

type DurableAttempt = Pick<DurableRun, "cancelReason"> & { readonly message: Pick<DurableRun["message"], "runStatus"> };
type DurablePort = Pick<DurableRunStore, "captureSession"> & {
  find(required: { runId: string }, optional: {}): Promise<DurableAttempt | null>;
};

/** Ports for a run inside a conversation: a session store, the live-run gate, and a lifecycle
 * that accepts the stream subscription onStarted opens for conversation runs. */
function conversationRun(
  { stored = null, concurrent = false, durable, setSessionId }: {
    stored?: string | null; concurrent?: boolean; durable?: DurablePort;
    setSessionId?: AgentSessionStore["setSessionId"];
  } = {},
) {
  const calls = { gets: [] as unknown[], sets: [] as unknown[], errors: [] as string[], warnings: [] as string[] };
  const agentSessions: AgentSessionStore = {
    getSessionId: async (input) => { calls.gets.push(input); return stored; },
    setSessionId: setSessionId ?? (async (input) => { calls.sets.push(input); }),
    clearSessionId: async () => {},
  };
  const liveRunTracker = createLiveRunTracker({}, {});
  if (concurrent) liveRunTracker.register({ conversationId: CONVERSATION, runId: OTHER_RUN }, {});
  const lifecycle = { waitForTerminal: () => new Promise(() => {}), stream: async () => {}, onCancelRequested: () => () => {} };
  const bindings = {
    liveRunTracker, waitForStoppingRuns: async () => {}, STOPPING_RUN_WAIT_MS: 0, CONCURRENT_RUN_REFUSAL_MESSAGE,
    routeDeps: { workspaceId: "ws-pinned", agentSessions, chatRunLedger: { durable } },
    console: { error: (...args: unknown[]) => { calls.errors.push(args.map(String).join(" ")); }, log() {}, warn: (...args: unknown[]) => { calls.warnings.push(args.map(String).join(" ")); } },
  };
  return { calls, lifecycle, bindings };
}

function start(context: Record<string, unknown>, run: ReturnType<typeof conversationRun>, extra: Record<string, unknown> = {}, agentId = "claude"): Promise<AgentExecutorRunInput> {
  return captureDaemonRun({ conversationId: CONVERSATION, ...context }, { lifecycle: run.lifecycle, request: { agentId }, bindings: { ...run.bindings, ...extra } });
}

function durablePort(attempt: DurableAttempt | null, captured: unknown[] = []): DurablePort {
  return { find: async () => attempt, captureSession: async (input) => { captured.push(input); return true; } };
}

describe("resolveSessionBinding — which stored session a run resumes", () => {
  test("an ordinary turn resumes the conversation's stored session", async () => {
    const run = conversationRun({ stored: "stored-session" });
    const input = await start({ prompt: "continue" }, run);
    assert.equal(input.resumeSessionId, "stored-session");
    assert.equal(input.newSessionId, undefined);
  });

  test("reconstruction recovery never resumes the stored session and mints a fresh one", async () => {
    const run = conversationRun({ stored: "stored-session" });
    const input = await start({ prompt: "continue", recoveryMode: "reconstruction" }, run);
    assert.equal(input.resumeSessionId, undefined);
    assert.equal(input.newSessionId, "unused-session-id");
    assert.deepEqual(run.calls.gets, [{ conversationId: CONVERSATION, agentId: "claude" }], "the stored lookup still runs unconditionally");
  });

  test("native recovery resumes the recovery session instead of the stored one", async () => {
    const run = conversationRun({ stored: "stored-session" });
    const input = await start({ prompt: "continue", recoveryMode: "native", recoverySessionId: "recovered-session" }, run);
    assert.equal(input.resumeSessionId, "recovered-session");
  });

  test("native recovery without a recovery session starts cold", async () => {
    const run = conversationRun({ stored: "stored-session" });
    const input = await start({ prompt: "continue", recoveryMode: "native" }, run);
    assert.equal(input.resumeSessionId, undefined);
    assert.equal(input.newSessionId, "unused-session-id");
  });

  test("the run's own agent keys the session lookup and is the agent launched", async () => {
    const run = conversationRun({ stored: "codex-session" });
    const input = await start({ prompt: "continue" }, run, {}, "codex");
    assert.deepEqual(run.calls.gets, [{ conversationId: CONVERSATION, agentId: "codex" }]);
    assert.equal(input.agentId, "codex");
    assert.equal(input.resumeSessionId, "codex-session");
  });

  test("a run that names no agent uses the default agent", async () => {
    const run = conversationRun();
    const input = await captureDaemonRun({ conversationId: CONVERSATION, prompt: "first" }, { lifecycle: run.lifecycle, bindings: run.bindings });
    assert.deepEqual(run.calls.gets, [{ conversationId: CONVERSATION, agentId: "claude" }]);
    assert.equal(input.agentId, "claude");
  });

  test("a run outside any conversation never reads or writes a session", async () => {
    const input = await captureDaemonRun({ prompt: "standalone" });
    assert.equal(input.resumeSessionId, undefined);
    assert.equal(input.newSessionId, undefined);
  });
});

describe("resolveSessionBinding — concurrency gate", () => {
  test("a concurrent live run refuses a memory-carrying agent that would lose its stored history", async () => {
    const run = conversationRun({ stored: "stored-session", concurrent: true });
    await assert.rejects(start({ prompt: "continue" }, run), { message: CONCURRENT_RUN_REFUSAL_MESSAGE });
  });

  test("a concurrent live run with nothing stored starts cold under a minted id", async () => {
    const run = conversationRun({ concurrent: true });
    const input = await start({ prompt: "first" }, run);
    assert.equal(input.resumeSessionId, undefined);
    assert.equal(input.newSessionId, "unused-session-id");
  });
});

describe("resolveSessionBinding — where the minted id is persisted", () => {
  test("a non-durable cold start persists the minted id to the conversation's session store", async () => {
    const run = conversationRun();
    await start({ prompt: "first" }, run);
    assert.deepEqual(run.calls.sets, [{ conversationId: CONVERSATION, agentId: "claude", sessionId: "unused-session-id" }]);
  });

  test("a durable cold start captures the minted id on its attempt, unconfirmed, not in the session store", async () => {
    const captured: unknown[] = [];
    const run = conversationRun({ durable: durablePort({ cancelReason: null, message: { runStatus: "running" } }, captured) });
    await start({ prompt: "first", assistantMessageId: "answer-1" }, run);
    assert.deepEqual(captured, [{ runId: "daemon-test-run", sessionId: "unused-session-id", confirmed: false }]);
    assert.deepEqual(run.calls.sets, []);
  });

  test("a failed dispatch-time write is logged and the run still starts", async () => {
    const run = conversationRun({ setSessionId: async () => { throw new Error("disk full"); } });
    const input = await start({ prompt: "first" }, run);
    assert.equal(input.newSessionId, "unused-session-id");
    assert.deepEqual(run.calls.errors, ["[agent-daemon] run daemon-test-run: failed to persist minted agent session id at dispatch Error: disk full"]);
  });

  test("a resumed turn mints and persists nothing", async () => {
    const run = conversationRun({ stored: "stored-session" });
    await start({ prompt: "continue" }, run);
    assert.deepEqual(run.calls.sets, []);
  });
});

describe("onStarted continuation — durable attempt ownership", () => {
  const STALE = "This execution attempt no longer owns the answer.";

  test("a queued durable attempt still owns its answer and starts", async () => {
    const run = conversationRun({ durable: durablePort({ cancelReason: null, message: { runStatus: "queued" } }) });
    const input = await start({ prompt: "go", assistantMessageId: "answer-1" }, run);
    assert.equal(input.runId, "daemon-test-run");
  });

  test("a missing durable attempt is refused", async () => {
    const run = conversationRun({ durable: durablePort(null) });
    await assert.rejects(start({ prompt: "go", assistantMessageId: "answer-1" }, run), { message: STALE });
  });

  test("a cancelled durable attempt is refused", async () => {
    const run = conversationRun({ durable: durablePort({ cancelReason: "user-stop", message: { runStatus: "running" } }) });
    await assert.rejects(start({ prompt: "go", assistantMessageId: "answer-1" }, run), { message: STALE });
  });

  test("a durable attempt whose answer already finished is refused", async () => {
    const run = conversationRun({ durable: durablePort({ cancelReason: null, message: { runStatus: "succeeded" } }) });
    await assert.rejects(start({ prompt: "go", assistantMessageId: "answer-1" }, run), { message: STALE });
  });

  test("a durable attempt with no run status is refused", async () => {
    const run = conversationRun({ durable: durablePort({ cancelReason: null, message: { runStatus: undefined } }) });
    await assert.rejects(start({ prompt: "go", assistantMessageId: "answer-1" }, run), { message: STALE });
  });

  test("a durable message id without a durable ledger skips the ownership check", async () => {
    const run = conversationRun();
    const input = await start({ prompt: "go", assistantMessageId: "answer-1" }, run);
    assert.equal(input.runId, "daemon-test-run");
  });
});

describe("onStarted continuation — early stops and prompt assembly", () => {
  test("a refused attachment claim stops before the executor", async () => {
    await assert.rejects(captureDaemonRun({ prompt: "go" }, { bindings: { resolveAttachmentRunFields: async () => null } }),
      { message: "onStarted did not call the executor" });
  });

  test("a refused plugin prefix stops before the executor", async () => {
    await assert.rejects(captureDaemonRun({ prompt: "go" }, { bindings: { resolveAgentPluginPromptPrefix: async () => null } }),
      { message: "onStarted did not call the executor" });
  });

  test("the automatic plugin prefix joins the pinned plugin prefix ahead of the prompt", async () => {
    const run = conversationRun();
    const input = await start({ prompt: "go" }, run, {
      resolveAgentPluginPromptPrefix: async () => "PINNED",
      automaticPluginRuns: { start: async () => "AUTOMATIC", forget() {} },
    });
    assert.equal(input.prompt, "PINNED\n\nAUTOMATIC\n\n<<SUBAGENT_DISPATCH>>\n\ngo");
  });

  test("the automatic preflight receives the durable message id and the user's own words", async () => {
    const starts: { runId: string; messageId?: string; context: { query: string; conversationId: string } }[] = [];
    const run = conversationRun({ durable: durablePort({ cancelReason: null, message: { runStatus: "running" } }) });
    await start({ prompt: "rendered prompt", userPrompt: "raw words", assistantMessageId: "answer-1" }, run, {
      automaticPluginRuns: { start: async (input: (typeof starts)[number]) => { starts.push(input); return ""; }, forget() {} },
    });
    assert.equal(starts[0]?.messageId, "answer-1");
    assert.equal(starts[0]?.context.query, "raw words");
    assert.equal(starts[0]?.context.conversationId, CONVERSATION);
  });

  test("the automatic preflight falls back to the prompt and omits the message id for a non-durable run", async () => {
    const starts: { messageId?: string; context: { query: string } }[] = [];
    const run = conversationRun();
    await start({ prompt: "rendered prompt" }, run, {
      automaticPluginRuns: { start: async (input: (typeof starts)[number]) => { starts.push(input); return ""; }, forget() {} },
    });
    assert.equal("messageId" in starts[0]!, false);
    assert.equal(starts[0]?.context.query, "rendered prompt");
  });

  test("an unavailable automatic preflight is warned about and the run starts without it", async () => {
    const run = conversationRun();
    const input = await start({ prompt: "go" }, run, {
      automaticPluginRuns: { start: async () => { throw new Error("offline"); }, forget() {} },
    });
    assert.equal(input.prompt, "<<SUBAGENT_DISPATCH>>\n\ngo");
    assert.deepEqual(run.calls.warnings, ["[agent-plugins] automatic preflight unavailable"]);
  });

  test("a run outside any conversation never starts the automatic preflight", async () => {
    const input = await captureDaemonRun({ prompt: "go" }, { bindings: {
      automaticPluginRuns: { start: async () => assert.fail("no conversation, no preflight"), forget() {} },
    } });
    assert.equal(input.prompt, "<<SUBAGENT_DISPATCH>>\n\ngo");
  });

  test("a cold start of a memory-carrying agent replaces the tail prompt with the cold-start context", async () => {
    const run = conversationRun();
    const input = await start({ prompt: "tail", coldStartContext: "full transcript" }, run);
    assert.equal(input.prompt, "<<SUBAGENT_DISPATCH>>\n\nfull transcript");
  });

  test("a resumed turn keeps its tail prompt even when a cold-start context is sent", async () => {
    const run = conversationRun({ stored: "stored-session" });
    const input = await start({ prompt: "tail", coldStartContext: "full transcript" }, run);
    assert.equal(input.prompt, "<<SUBAGENT_DISPATCH>>\n\ntail");
  });

  test("a cold start of an agent without its own memory keeps the prompt it was sent", async () => {
    const run = conversationRun();
    const input = await start({ prompt: "tail", coldStartContext: "full transcript" }, run, { agentCarriesOwnMemory: () => false });
    assert.equal(input.prompt, "<<SUBAGENT_DISPATCH>>\n\ntail");
  });

  test("a cold start without a cold-start context keeps the prompt it was sent", async () => {
    const run = conversationRun();
    const input = await start({ prompt: "tail" }, run);
    assert.equal(input.prompt, "<<SUBAGENT_DISPATCH>>\n\ntail");
  });
});
