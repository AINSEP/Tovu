import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { createInMemoryEventLog, createRunLifecycle, type AgentExecutorRunInput } from "@jini-ai/daemon";
import type { DurableRun, DurableRunStore } from "@jini-ai/chat/server/durable-runs";
import type { AgentSessionStore } from "@jini-ai/daemon/store/agent-sessions";
import { CONCURRENT_RUN_REFUSAL_MESSAGE } from "../../../../assistant/agent-session-preset.js";
import { createLiveRunTracker } from "@jini-ai/daemon/session-coordination";
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
  const bindings: Record<string, unknown> = {
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

  for (const savedAgentId of ["copilot", "removed-agent"]) {
    test(`saved ${savedAgentId} starts with the default agent without a user error`, async () => {
      const run = conversationRun({ stored: "default-agent-session" });
      const input = await start({ prompt: "continue" }, run, {}, savedAgentId);
      assert.equal(input.agentId, "claude");
      assert.equal(input.resumeSessionId, "default-agent-session");
      assert.deepEqual(run.calls.gets, [{ conversationId: CONVERSATION, agentId: "claude" }]);
      assert.deepEqual(run.calls.errors, []);
      assert.deepEqual(run.calls.warnings, [`[agent-daemon] unknown agent "${savedAgentId}"; using default "claude"`]);
    });
  }

  test("a run outside any conversation never reads or writes a session", async () => {
    const input = await captureDaemonRun({ prompt: "standalone" });
    assert.equal(input.resumeSessionId, undefined);
    assert.equal(input.newSessionId, undefined);
  });
});

test("a failed durable resume clears only its attempt's dead session locator", async () => {
  const runId = "durable-resume";
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  await lifecycle.start({ contextRef: "fixture" }, { runId });
  const active = { cancelReason: null, message: { runStatus: "running" as const } };
  const sessions = new Map([[runId, "dead-locator"], ["other-attempt", "other-locator"]]);
  const clears: unknown[] = [];
  const durable = { ...durablePort(active), clearSession: async (input: { runId: string; sessionId: string }) => {
    clears.push(input);
    if (sessions.get(input.runId) !== input.sessionId) return false;
    return sessions.delete(input.runId);
  } };
  const run = conversationRun({ stored: "dead-locator", durable });
  const launch = await captureDaemonRun({ conversationId: CONVERSATION, prompt: "Continue", assistantMessageId: "answer-23" },
    { runId, lifecycle, bindings: { ...run.bindings, RUN_OWNER_RETENTION_MS: 1 } });
  assert.equal(launch.resumeSessionId, "dead-locator");
  await lifecycle.finish({ runId, status: "failed", code: 1, signal: null, resumable: false });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(clears, [{ runId, sessionId: "dead-locator" }]);
  assert.deepEqual([...sessions], [["other-attempt", "other-locator"]]);
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
  test("a malformed run context fails with safe copy before site tools prepare", async () => {
    const run = conversationRun();
    const siteStarts: unknown[] = [];
    await assert.rejects(captureDaemonRun({}, {
      request: { contextRef: JSON.stringify({ prompt: "go" }) },
      bindings: { ...run.bindings, siteTools: { start: async (input: unknown) => { siteStarts.push(input); } } },
    }), { message: "The assistant could not start: the request was malformed." });
    assert.deepEqual(siteStarts, []);
    assert.deepEqual(run.calls.errors, ["[agent-daemon] run daemon-test-run: malformed contextRef contextRef did not decode to a non-empty 'principalId'"]);
  });

  test("a refused attachment claim stops before the executor", async () => {
    await assert.rejects(captureDaemonRun({ prompt: "go" }, { bindings: { resolveAttachmentRunFields: async () => null } }),
      { message: "onStarted did not call the executor" });
  });

  const site = (preflight: () => Promise<{ prefix: string | null; refusalPrefix: string }>) => ({ start: async () => {}, preflight,
    withRun: ({ fn }: { fn: () => unknown }) => fn(), finish() {} });

  test("a CLI removed during preparation cannot launch with the earlier tool admission", async () => {
    let launchPath: string | null = process.execPath;
    const resolutions: Array<string | null> = [];
    await assert.rejects(captureDaemonRun({ prompt: "go" }, { bindings: {
      resolveAgentLaunch: () => { resolutions.push(launchPath); return { launchPath }; },
      siteTools: site(async () => {
        launchPath = null;
        return { prefix: "", refusalPrefix: "" };
      }),
    } }), { message: "Tool access changed before this answer started. Send your message again to review it." });
    assert.deepEqual(resolutions, [process.execPath, null]);
  });

  test("a refused plugin prefix stops before the executor", async () => {
    await assert.rejects(captureDaemonRun({ prompt: "go" }, { bindings: { siteTools: site(async () => ({ prefix: null, refusalPrefix: "" })) } }),
      { message: "The assistant could not start: a selected Agent Plugin could not be loaded." });
  });

  test("the server's joined automatic and pinned prefix reaches the executor ahead of the prompt", async () => {
    const run = conversationRun();
    const input = await start({ prompt: "go" }, run, { siteTools: site(async () => ({ prefix: "PINNED\n\nAUTOMATIC", refusalPrefix: "" })) });
    assert.equal(input.prompt, "PINNED\n\nAUTOMATIC\n\ngo");
  });

  test("the daemon sends only its run id and cancellation signal to server plugin preflight", async () => {
    const starts: Record<string, unknown>[] = [];
    const run = conversationRun({ durable: durablePort({ cancelReason: null, message: { runStatus: "running" } }) });
    await start({ prompt: "rendered prompt", userPrompt: "raw words", assistantMessageId: "answer-1" }, run, { siteTools: {
      ...site(async () => ({ prefix: "", refusalPrefix: "" })),
      preflight: async (input: Record<string, unknown>) => { starts.push(input); return { prefix: "", refusalPrefix: "" }; },
    } });
    assert.equal(starts[0]?.runId, "daemon-test-run");
    assert.deepEqual(Object.keys(starts[0]!).sort(), ["runId", "signal"]);
  });

  test("a site folder with an AGENTS.md startup ceremony gets the dispatch marker as the prompt's first line", async () => {
    const input = await captureDaemonRun({ prompt: "go" }, { agentsMdPresent: true });
    assert.equal(input.prompt, "<<SUBAGENT_DISPATCH>>\n\ngo");
  });

  test("a site folder with no AGENTS.md gets the owner's words with no developer marker", async () => {
    const input = await captureDaemonRun({ prompt: "go" }, {});
    assert.equal(input.prompt, "go");
  });

  test("an unavailable automatic preflight is warned about and the run starts without it", async () => {
    const run = conversationRun();
    const input = await start({ prompt: "go" }, run, { siteTools: site(async () => { throw Object.assign(new Error("boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET"), { code: "EIO" }); }) });
    assert.equal(input.prompt, "go");
    assert.equal(run.calls.warnings.length, 1);
    assert.match(run.calls.warnings[0] ?? '', /automatic preflight unavailable.*Error.*EIO/);
    assert.doesNotMatch(run.calls.warnings[0] ?? '', /boom|SECRETSECRETSECRETSECRET/);
  });

  test("an unavailable preflight cannot silently omit an explicitly selected plugin", async () => {
    await assert.rejects(captureDaemonRun({ prompt: "go", pluginRefIds: ["picked"] }, { bindings: {
      siteTools: site(async () => { throw new Error("offline"); }),
    } }), { message: "The assistant could not start: a selected Agent Plugin could not be loaded." });
  });

  test("a cold start of a memory-carrying agent replaces the tail prompt with the cold-start context", async () => {
    const run = conversationRun();
    const input = await start({ prompt: "tail", coldStartContext: "full transcript" }, run);
    assert.equal(input.prompt, "full transcript");
  });

  test("a resumed turn keeps its tail prompt even when a cold-start context is sent", async () => {
    const run = conversationRun({ stored: "stored-session" });
    const input = await start({ prompt: "tail", coldStartContext: "full transcript" }, run);
    assert.equal(input.prompt, "tail");
  });

  test("a cold start of an agent without its own memory keeps the prompt it was sent", async () => {
    const run = conversationRun();
    const input = await start({ prompt: "tail", coldStartContext: "full transcript" }, run, { agentCarriesOwnMemory: () => false });
    assert.equal(input.prompt, "tail");
  });

  test("a cold start without a cold-start context keeps the prompt it was sent", async () => {
    const run = conversationRun();
    const input = await start({ prompt: "tail" }, run);
    assert.equal(input.prompt, "tail");
  });
});

describe("terminal waits — a lost completion signal still releases and cleans up", () => {
  async function settle(done: () => boolean) {
    const deadline = Date.now() + 2000;
    while (!done()) {
      if (Date.now() > deadline) throw new Error("terminal cleanup never settled");
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  test("a rejected terminal wait is logged for both holds, attachment cleanup still runs, and its failure is logged without stranding a hold", async () => {
    const run = conversationRun();
    // The completion signal is lost only once the run has launched; preparation sees an ordinary pending wait.
    const pendingWaits: Array<(error: Error) => void> = [];
    const lifecycle = { ...run.lifecycle, waitForTerminal: () => new Promise((_resolve, reject) => { pendingWaits.push(reject); }) };
    const holds = { acquired: 0, released: 0 };
    const cleaned: unknown[] = [];
    await start({ prompt: "go" }, { ...run, lifecycle }, {
      idlePark: { hold: () => { holds.acquired += 1; let once = false; return () => { if (!once) { once = true; holds.released += 1; } }; } },
      attachmentStore: { cleanupRun: async (input: unknown) => { cleaned.push(input); throw new Error("disk gone"); } },
    });
    assert.equal(pendingWaits.length, 2);
    for (const lose of pendingWaits) lose(new Error("event log closed"));
    await settle(() => cleaned.length === 1 && holds.acquired > 0 && holds.released === holds.acquired);
    assert.deepEqual(cleaned, [{ runId: "daemon-test-run" }]);
    // describeErrorForLog keeps only the error's class, never its message, in the daemon log.
    assert.deepEqual([...run.calls.errors].sort(), [
      "[agent-daemon] run daemon-test-run: attachment cleanup failed Error: disk gone",
      "[agent-daemon] run daemon-test-run: could not wait for completion before cleaning up: Error",
      "[agent-daemon] run daemon-test-run: could not wait for completion before releasing activity: Error",
    ]);
  });
});

describe("onStarted — trace input, decode failures and run telemetry", () => {
  for (const [capture, expected] of [["full", [{ runId: "daemon-test-run", input: "traced words" }]], ["metadata", []]] as const) {
    test(`a ${capture} AI trace sink ${expected.length ? "records" : "does not record"} the decoded prompt as the run input`, async () => {
      const noted: unknown[] = [];
      await captureDaemonRun({ prompt: "traced words" }, { bindings: {
        tracing: { noteRunInput: (input: unknown) => { noted.push(input); } },
        routeDeps: { aiTraceSink: { capture } },
      } });
      assert.deepEqual(noted, expected);
    });
  }

  test("a context decoder that throws a non-Error value is logged verbatim and fails the run with safe copy", async () => {
    const run = conversationRun();
    await assert.rejects(captureDaemonRun({ prompt: "go" }, { bindings: { ...run.bindings, parseRunStartContextRef: () => { throw "envelope-not-json"; } } }),
      { message: "The assistant could not start: the request was malformed." });
    assert.deepEqual(run.calls.errors, ["[agent-daemon] run daemon-test-run: malformed contextRef envelope-not-json"]);
  });

  test("a standalone run reports its start and each end event, with the outcome only when the end carries a status", async () => {
    const captures: Array<{ name: string; userId: string; properties: unknown }> = [];
    const listeners: Array<(event: unknown) => void> = [];
    const lifecycle = { waitForTerminal: () => new Promise(() => {}), onCancelRequested: () => () => {},
      stream: async ({ onEvent }: { onEvent: (event: unknown) => void }) => { listeners.push(onEvent); } };
    await captureDaemonRun({ prompt: "go" }, { lifecycle, bindings: { routeDeps: { tracker: {
      capture: async ({ name, userId }: { name: string; userId: string }, { properties }: { properties: unknown }) => { captures.push({ name, userId, properties }); },
    } } } });
    for (const deliver of listeners) {
      deliver({ kind: "stdout", payload: { chunk: "working" } });
      deliver({ kind: "end", payload: { status: "failed" } });
      deliver({ kind: "end", payload: {} });
    }
    const runEvents = captures.filter(entry => entry.name.startsWith("assistant_run_"));
    assert.deepEqual(runEvents, [
      { name: "assistant_run_started", userId: "daemon-test-principal", properties: { chatSurface: "daemon", logicalRunId: "daemon-test-run", eventId: "assistant-start:daemon-test-run" } },
      { name: "assistant_run_finished", userId: "daemon-test-principal", properties: { chatSurface: "daemon", logicalRunId: "daemon-test-run", outcome: "failed", eventId: "assistant-finish:daemon-test-run" } },
      { name: "assistant_run_finished", userId: "daemon-test-principal", properties: { chatSurface: "daemon", logicalRunId: "daemon-test-run", eventId: "assistant-finish:daemon-test-run" } },
    ]);
  });
});

describe("onStarted — argv-bound adapters receive offered plugin guidance as prompt variants", () => {
  const POINTER = "Agent Plugins may have guidance for this request. Find them with search_agent_plugin_local starting at offset: 0, follow the returned nextOffset to see more, and load one with load_agent_plugin({ pluginId }) before acting in its domain.";
  const offer = { offerId: "offer-1", fullSections: [{ pluginId: "auto-b", text: "AUTO" }], fullPrefix: "AUTO FULL", catalogPrefix: "AUTO ROW" };
  const argvLastClaude = async () => {
    const { getAgentDef } = await import("@jini-ai/agent-runtime");
    return ({ id }: { id: string }) => {
      const def = getAgentDef({ id });
      return def ? { ...def, argvPromptPosition: "last" as const, mcpIsolation: { perRun: "fixture@2026-11-05" } } : def;
    };
  };

  test("the pinned prefix leads the prompt, every variant keeps it, and only the full variant commits the offered ids", async () => {
    const offers: unknown[] = [];
    const commits: unknown[] = [];
    const preflights: unknown[] = [];
    const input = await captureDaemonRun({ prompt: "go", pluginRefIds: ["pinned-a", "picked-c"] }, { bindings: {
      getAgentDef: await argvLastClaude(),
      siteTools: { start: async () => {}, withRun: ({ fn }: { fn: () => unknown }) => fn(), finish() {},
        preflight: async (input: unknown) => { preflights.push(input); return { prefix: "", refusalPrefix: "", pluginIds: [] }; },
        offerPluginGuidance: async (required: unknown, optional: { signal?: AbortSignal }) => {
          offers.push([required, optional.signal instanceof AbortSignal]);
          return { prefix: "PINNED", refusalPrefix: "", pluginIds: ["pinned-a"], offer };
        },
        commitPluginGuidance: async (required: unknown) => { commits.push(required); } },
    } });
    assert.deepEqual(preflights, [], "an argv-last adapter is offered guidance instead of one-shot preflight");
    assert.deepEqual(offers, [[{ runId: "daemon-test-run" }, true]]);
    assert.equal(input.prompt, "PINNED\n\ngo");
    const selection = (input as { argvPromptVariants?: { candidates: Array<{ id: string; prompt: string }>; onSelected: (required: { runId: string; id: string }) => Promise<void> } }).argvPromptVariants;
    assert.deepEqual(selection?.candidates, [
      { id: "full", prompt: "PINNED\n\nAUTO FULL\n\ngo" },
      { id: "catalog", prompt: "PINNED\n\nAUTO ROW\n\ngo" },
      { id: "pointer", prompt: `PINNED\n\n${POINTER}\n\ngo` },
      { id: "base", prompt: "PINNED\n\ngo" },
    ]);
    assert.deepEqual((input as { subagentStartContext?: { ids: readonly string[] } }).subagentStartContext?.ids, ["pinned-a", "picked-c"]);
    await selection?.onSelected({ runId: "daemon-test-run", id: "full" });
    assert.deepEqual(commits, [{ runId: "daemon-test-run", offerId: "offer-1", deliveredIds: ["auto-b"] }]);
  });

  test("an offer whose pinned prefix could not be loaded refuses the run", async () => {
    const offers: unknown[] = [];
    await assert.rejects(captureDaemonRun({ prompt: "go", pluginRefIds: ["pinned-a"] }, { bindings: {
      getAgentDef: await argvLastClaude(),
      siteTools: { start: async () => {}, withRun: ({ fn }: { fn: () => unknown }) => fn(), finish() {},
        offerPluginGuidance: async (required: unknown) => { offers.push(required); return { prefix: null, refusalPrefix: "", pluginIds: ["pinned-a"], offer: null }; } },
    } }), { message: "The assistant could not start: a selected Agent Plugin could not be loaded." });
    assert.deepEqual(offers, [{ runId: "daemon-test-run" }], "the refusal comes from the offer itself, not from a failed one-shot preflight");
  });
});

describe("onStarted — a run that ends while it is still being prepared", () => {
  async function settle(done: () => boolean) {
    const deadline = Date.now() + 2000;
    while (!done()) {
      if (Date.now() > deadline) throw new Error("condition never settled");
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  test("a run cancelled during the agent inventory read fails at the tool-access stage instead of launching without its record", async () => {
    let endRun!: () => void;
    const terminal = new Promise(resolve => { endRun = () => resolve({ state: "cancelled" }); });
    const failures: Array<{ runId: string; message: string; startup?: { stage: string; error: unknown } }> = [];
    const errors: string[] = [];
    let launched = false;
    await assert.rejects(captureDaemonRun({ prompt: "go" }, { lifecycle: { waitForTerminal: () => terminal }, bindings: {
      assistantInventory: { listAssistantAgents: async () => {
        endRun();
        await new Promise(resolve => setImmediate(resolve));
        return [{ id: "claude", available: true, authStatus: "unknown" }];
      } },
      agentExecutor: { run: async () => { launched = true; } },
      console: { error: (...args: unknown[]) => { errors.push(args.map(String).join(" ")); }, log() {}, warn() {} },
      failRunBeforeStart: async (input: { runId: string; message: string; startup?: { stage: string; error: unknown } }) => { failures.push(input); },
    } }), { message: "onStarted did not call the executor" });
    assert.equal(launched, false);
    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.runId, "daemon-test-run");
    assert.equal(failures[0]?.message, "The assistant could not start this execution attempt.");
    assert.equal(failures[0]?.startup?.stage, "tool access consent");
    assert.equal((failures[0]?.startup?.error as Error).message, "agent run has no tool access record after preparation");
    assert.deepEqual(errors, ["[agent-daemon] run daemon-test-run failed to start Error: agent run has no tool access record after preparation"]);
  });

  test("a staged attachment cleanup that rejects at terminal is logged and removed from the staging map", async () => {
    let endRun!: () => void;
    const terminal = new Promise(resolve => { endRun = () => resolve({ state: "succeeded" }); });
    const staged = new Map<string, () => Promise<void>>();
    const errors: string[] = [];
    let cleanups = 0;
    await captureDaemonRun({ prompt: "go" }, { lifecycle: { waitForTerminal: () => terminal }, bindings: {
      stagedAttachmentCleanupByRunId: staged,
      resolveAttachmentRunFields: async ({ run }: { run: { id: string } }) => {
        staged.set(run.id, async () => { cleanups += 1; throw new Error("rm failed"); });
        return {};
      },
      console: { error: (...args: unknown[]) => { errors.push(args.map(String).join(" ")); }, log() {}, warn() {} },
    } });
    assert.equal(staged.size, 1, "the staged cleanup waits for the run's terminal state");
    endRun();
    await settle(() => errors.length > 0);
    assert.equal(cleanups, 1);
    assert.equal(staged.size, 0);
    assert.deepEqual(errors, ["[agent-daemon] staged attachment cleanup failed"]);
  });
});
