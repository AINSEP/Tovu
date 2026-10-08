import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { agentAcceptsHostMintedSessionId, resolveHostMintedSessionId, resolveNewSessionField } from "../../../../assistant/agent-session-preset.js";
import { resolveResumeSessionField } from "../../../../assistant/agent-session-preset.js";
import { createConversationStartLock } from "../../../../assistant/agent-session-preset.js";

/**
 * @file Wiring proof for the Defect 1 fix (2026-09-11 chat-lifecycle repair), in the same
 * source-reading style as `agent-daemon-server.session-resume-wiring.unit.test.ts` next to it and
 * for the same reason: `agent-daemon-server.ts` is a flat top-level script that opens a real SQLite
 * connection and binds a real port simply by being imported, so a unit test cannot import it.
 *
 * `agent-session-binding.unit.test.ts` and `conversation-start-lock.unit.test.ts` prove the two new
 * DECISIONS are correct in isolation. This file is the one that fails if those decisions are
 * computed and then not used — the same class of usage bug H1 and H2 both were, and the class the
 * observed defect actually is: nothing here was ever *wrong*, the binding was simply never written
 * until a terminal event that a dying run never reaches.
 */

const DAEMON_ENTRY_SOURCE = readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

/** Execute the real handler's AST with isolated ports; importing the entrypoint would boot a daemon. */
function sessionHarness() {
  const source = ts.createSourceFile("daemon.ts", DAEMON_ENTRY_SOURCE, ts.ScriptTarget.Latest, true);
  let initializer: ts.Expression | undefined;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "onStarted") initializer = declaration.initializer;
    }
  }
  assert.ok(initializer, "the actual onStarted function must exist");
  const compiled = ts.transpileModule(`const onStarted = ${initializer.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let stored: string | null = null;
  let minted = 0;
  let writes = 0;
  let releaseWrite!: () => void;
  const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
  const launches: { runId: string; newSessionId?: string; resumeSessionId?: string; stored: string | null }[] = [];
  const failures: unknown[][] = [];
  const lifecycle = { waitForTerminal: () => new Promise(() => {}), stream: () => {} };
  const onStarted = runInNewContext(`${compiled}\nonStarted`, {
    parseRunStartContextRef: () => ({ prompt: "hello", principalId: "principal-1", conversationId: "conv-1", attachmentIds: [], pluginRefIds: [] }),
    assemblePromptWithPluginPrefix: (prompt: string) => prompt,
    buildPageContextPromptBlock: () => "",
    principalByRunId: new Map(), messageAttachmentRefsByRunId: new Map(), durableMessageIdsByRunId: new Map(), runOwners: { record() {} },
    // No live executor in this harness: isolate serialization of the binding, not the live-run gate.
    liveRunTracker: { register() {}, hasConcurrentLiveRun: () => false },
    frontendControl: { bindOnStarted() {} }, customInstructionsCache: { refresh: async () => {} },
    resolveAttachmentRunFields: async () => ({}), resolveAgentPluginPromptPrefix: async () => "",
    buildCapabilityManifestPrefix: () => "", resolveCapabilityManifestArm: () => "off", toolExtensions: undefined,
    routeDeps: { workspaceId: "ws-1", agentSessions: {
      getSessionId: async ({ conversationId, agentId }: { conversationId: string; agentId: string }) => {
        assert.deepEqual([conversationId, agentId], ["conv-1", "claude"]);
        return stored;
      },
      setSessionId: async ({ conversationId, agentId, sessionId }: { conversationId: string; agentId: string; sessionId: string }) => {
        assert.deepEqual([conversationId, agentId], ["conv-1", "claude"]);
        writes += 1;
        await writeGate;
        stored = sessionId;
      },
    } },
    conversationStartLock: createConversationStartLock({}, {}),
    agentAcceptsHostMintedSessionId, resolveHostMintedSessionId, resolveNewSessionField, resolveResumeSessionField,
    randomUUID: () => `minted-${++minted}`, DEFAULT_AGENT_ID: "claude",
    waitForStoppingRuns: async () => {}, STOPPING_RUN_WAIT_MS: 20_000,
    agentCarriesOwnMemory: () => true, wouldForcedColdStartLoseConversationContext: () => false,
    agentExecutor: { run: async (input: { runId: string }, options: { newSessionId?: string; resumeSessionId?: string } = {}) => {
      launches.push({ runId: input.runId, newSessionId: options.newSessionId, resumeSessionId: options.resumeSessionId, stored });
    } },
    process: { env: {}, cwd: () => "/isolated" }, resolvePermissionMode: () => "default",
    ASSISTANT_DISALLOWED_TOOLS: [], ASSISTANT_SETTING_SOURCES: [],
    resolveAssistantRunSettings: () => undefined, homedir: () => "/isolated", existsSync: () => false,
    console: { error: (...args: unknown[]) => failures.push(args), log() {} },
  }) as (input: unknown) => void;
  return {
    start: (runId: string) => onStarted({ request: { agentId: "claude" }, run: { id: runId }, lifecycle }),
    flush: () => new Promise<void>((resolve) => setImmediate(resolve)),
    releaseWrite, launches, failures,
    get stored() { return stored; }, get minted() { return minted; }, get writes() { return writes; },
  };
}

test("runtime: a cold dispatch waits for durable persistence and resumes that exact executor session next turn", async () => {
  const harness = sessionHarness();
  harness.start("first");
  await harness.flush();
  assert.equal(harness.writes, 1, "dispatch must actually write the binding");
  assert.deepEqual(harness.launches, [], "the executor must wait for the unfinished store write");
  harness.releaseWrite();
  await harness.flush();
  assert.deepEqual(harness.launches, [{ runId: "first", newSessionId: "minted-1", resumeSessionId: undefined, stored: "minted-1" }]);
  harness.start("next");
  await harness.flush();
  assert.deepEqual(harness.launches[1], { runId: "next", newSessionId: undefined, resumeSessionId: "minted-1", stored: "minted-1" });
  assert.equal(harness.minted, 1);
  assert.deepEqual(harness.failures, []);
});

test("runtime: concurrent dispatches serialize the lookup and pending write, minting only one session", async () => {
  const harness = sessionHarness();
  harness.start("first");
  harness.start("second");
  await harness.flush();
  assert.equal(harness.minted, 1, "the second lookup must wait for the first pending write");
  assert.equal(harness.writes, 1);
  assert.deepEqual(harness.launches, []);
  harness.releaseWrite();
  await harness.flush();
  assert.equal(harness.minted, 1);
  assert.equal(harness.writes, 1);
  assert.equal(harness.stored, "minted-1");
  assert.deepEqual(harness.launches, [
    { runId: "first", newSessionId: "minted-1", resumeSessionId: undefined, stored: "minted-1" },
    { runId: "second", newSessionId: undefined, resumeSessionId: "minted-1", stored: "minted-1" },
  ]);
  assert.deepEqual(harness.failures, []);
});

const ON_STARTED_INDEX = DAEMON_ENTRY_SOURCE.indexOf("const onStarted: RunStartHandler");
const onStartedSource = (() => {
  assert.ok(
    ON_STARTED_INDEX > -1,
    "this test's own anchor (the onStarted declaration) must still exist verbatim — update the anchor if that line's shape changes",
  );
  return DAEMON_ENTRY_SOURCE.slice(ON_STARTED_INDEX);
})();

describe("Defect 1 wiring — the conversation/session binding must be written at DISPATCH", () => {
  test("imports the host-minting decisions from the pure decision module", () => {
    // `assert.ok(regex.test(...))` rather than `assert.match(source, regex)` throughout this file:
    // a failed `assert.match` embeds the ENTIRE 80 KB daemon source in its own error object, which
    // buries the one-line reason under a screenful of unrelated text.
    for (const name of ["agentAcceptsHostMintedSessionId", "resolveHostMintedSessionId", "resolveNewSessionField"]) {
      assert.ok(
        new RegExp(`import\\s*\\{[^}]*${name}[^}]*\\}\\s*from\\s*["'][^"']*agent-session-preset(\\.js)?["']`, "s").test(DAEMON_ENTRY_SOURCE),
        `onStarted must import ${name} from agent-session-preset.ts, not reimplement that decision inline`,
      );
    }
  });

  test("a binding write exists at dispatch rather than only in the event subscription", () => {
    /*
     * The defect in one assertion. Before the fix the ONLY `setSessionId` call in this file lived
     * in the `runLifecycle.stream(...)` subscription's `end` branch, so the binding was written
     * only by a run that survived long enough to report a terminal `sessionRef`. A run that died
     * first stored nothing at all, and the next turn started cold under a brand-new session.
     *
     * Scoped to resolveSessionBinding: the stream subscription is declared textually ABOVE
     * `agentExecutor.run` even though it fires long after it, so "appears before the run call" is
     * not evidence of anything here — an earlier draft of this test passed against the unfixed
     * file for exactly that reason. Terminal persistence now goes through captureEarlySession;
     * counting raw setSessionId strings would also count comments rather than actual writes.
     */
    const bindingFnIndex = onStartedSource.indexOf("async function resolveSessionBinding(");
    const lockCallIndex = onStartedSource.indexOf("conversationStartLock.run(");
    assert.ok(bindingFnIndex > -1 && lockCallIndex > bindingFnIndex, "the dispatch binding function and its lock call must exist in order");
    const bindingFnSource = onStartedSource.slice(bindingFnIndex, lockCallIndex);
    assert.ok(
      /routeDeps\.(?:agentSessions\.setSessionId|chatRunLedger\.durable\.captureSession)\(/.test(bindingFnSource),
      "onStarted must persist the conversation/session binding at dispatch as well as from events — otherwise a run that dies early still orphans its CLI session (Defect 1)",
    );
  });

  test("the dispatch-time write is awaited, so the binding is durable before the CLI is ever spawned", () => {
    const runCallIndex = onStartedSource.indexOf("await agentExecutor.run({");
    assert.ok(runCallIndex > -1, "the awaited agentExecutor.run call must exist");
    const preDispatch = onStartedSource.slice(0, runCallIndex);
    const bindingFnIndex = preDispatch.indexOf("async function resolveSessionBinding(");
    assert.ok(bindingFnIndex > -1, "the dispatch binding function must exist before agentExecutor.run");
    const bindingFnSource = preDispatch.slice(bindingFnIndex);
    // `await`, specifically: dispatch selects durable captureSession or legacy setSessionId into
    // `prepared`, then awaits prepared.catch(...). Merely starting either write (or void prepared)
    // can lose the race with the CLI; the event subscription's fire-and-forget capture is insufficient.
    const preparedWrite = /const\s+prepared\s*=\s*([^;]+);\s*await\s+prepared(?:\.catch\(|\s*;)/.exec(bindingFnSource);
    assert.ok(
      /await\s+routeDeps\.(?:agentSessions\.setSessionId|chatRunLedger\.durable\.captureSession)\(/.test(bindingFnSource)
        || (preparedWrite !== null
          && /routeDeps\.chatRunLedger\.durable\.captureSession\(/.test(preparedWrite[1])
          && /routeDeps\.agentSessions\.setSessionId\(/.test(preparedWrite[1])),
      "the dispatch-time binding write must be awaited — a fire-and-forget write can lose the race with the run it is supposed to be binding",
    );
    assert.ok(
      /await\s+conversationStartLock\.run\(\{\s*conversationId:\s*conversationId,\s*critical:\s*resolveSessionBinding\s*\},\s*\{\}\)/.test(preDispatch),
      "dispatch must await the locked binding function before agentExecutor.run",
    );
  });

  test("the minted id is both persisted and handed to AgentExecutor.run — one id, not two", () => {
    const runCallIndex = onStartedSource.indexOf("await agentExecutor.run({");
    const mintIndex = onStartedSource.indexOf("resolveHostMintedSessionId({");
    assert.ok(mintIndex > -1, "onStarted must call resolveHostMintedSessionId to decide whether to mint");
    assert.ok(mintIndex < runCallIndex, "the mint decision must be made before agentExecutor.run is called");

    assert.ok(
      /resolveNewSessionField\(\{\s*hostMintedSessionId:\s*hostMintedSessionId\s*\},\s*\{\}\)/.test(onStartedSource),
      "agentExecutor.run must be handed the SAME id that was persisted (via resolveNewSessionField(hostMintedSessionId)) — persisting one id and spawning the CLI under another is the fork this fix exists to prevent",
    );
    assert.ok(
      /setSessionId\(\{\s*conversationId,\s*agentId,\s*sessionId:\s*hostMintedSessionId\s*\}\)/.test(onStartedSource),
      "the persisted value must be the minted id itself, under this run's own (conversationId, agentId)",
    );
  });

  test("the mint decision is gated on the def actually accepting a host-minted id", () => {
    assert.ok(
      /acceptsHostMintedSessionId:\s*agentAcceptsHostMintedSessionId\(\{\s*agentId:\s*agentId\s*\},\s*\{\}\)/.test(onStartedSource),
      "resolveHostMintedSessionId must be told whether THIS run's def accepts a host-minted id — minting for a capture-style def (codex, opencode) would store an id the CLI never uses, which is worse than storing nothing",
    );
  });
});

describe("Defect 1 wiring — run starts must be serialized per conversation", () => {
  test("imports createConversationStartLock and constructs exactly one module-level instance", () => {
    assert.ok(
      /import\s*\{[^}]*createConversationStartLock[^}]*\}\s*from\s*["'][^"']*agent-session-preset(\.js)?["']/s.test(DAEMON_ENTRY_SOURCE),
      "agent-daemon-server.ts must import createConversationStartLock from agent-session-preset.ts",
    );
    assert.ok(
      /const\s+conversationStartLock\s*=\s*createConversationStartLock\(\{\},\s*\{\}\)\s*;/.test(DAEMON_ENTRY_SOURCE),
      "there must be exactly one lock instance for this process's whole lifetime — a fresh one per run would serialize nothing",
    );
  });

  test("the stored-session lookup AND the dispatch-time write both run inside the lock", () => {
    const lockCallIndex = onStartedSource.indexOf("conversationStartLock.run(");
    assert.ok(
      lockCallIndex > -1,
      "onStarted must run its session-binding section through conversationStartLock.run — without it two near-simultaneous turns both read an empty session slot and both mint, forking the conversation",
    );

    const runCallIndex = onStartedSource.indexOf("await agentExecutor.run({");
    assert.ok(lockCallIndex < runCallIndex, "the lock must be entered before agentExecutor.run is reached");

    // The critical section is the function handed to the lock. Both halves of the read-modify-write
    // must be inside it: a `getSessionId` outside the lock reads a slot another run is about to
    // fill, and a `setSessionId` outside it writes after the next run has already read.
    const bindingFnIndex = onStartedSource.indexOf("async function resolveSessionBinding(");
    assert.ok(
      bindingFnIndex > -1,
      "this test's own anchor (the resolveSessionBinding declaration) must still exist verbatim — it is the critical section the lock protects",
    );
    const bindingFnSource = onStartedSource.slice(bindingFnIndex, lockCallIndex);
    assert.ok(
      /routeDeps\.agentSessions\.getSessionId\(/.test(bindingFnSource),
      "the stored-session lookup must live inside the locked critical section",
    );
    assert.ok(
      /routeDeps\.agentSessions\.setSessionId\(/.test(bindingFnSource),
      "the dispatch-time binding write must live inside the same locked critical section as the lookup it is based on",
    );
  });

  test("agentExecutor.run is NOT inside the locked section", () => {
    /*
     * A lock held across the whole run would serialize entire agent runs per conversation: a second
     * tab's turn would hang for however long the first run takes (minutes), with no feedback,
     * instead of being answered by the existing concurrency guards. The lock exists to make the
     * binding atomic, not to queue runs.
     */
    const bindingFnIndex = onStartedSource.indexOf("async function resolveSessionBinding(");
    const lockCallIndex = onStartedSource.indexOf("conversationStartLock.run(");
    assert.ok(
      bindingFnIndex > -1 && lockCallIndex > -1,
      "this test's own anchors (the resolveSessionBinding declaration and the conversationStartLock.run call) must both still exist verbatim — without them this assertion would pass against an empty slice",
    );
    const bindingFnSource = onStartedSource.slice(bindingFnIndex, lockCallIndex);
    assert.ok(
      !bindingFnSource.includes("agentExecutor.run("),
      "agentExecutor.run must not run inside the conversation lock — that would hold the lock for the entire duration of the agent run",
    );
  });
});
