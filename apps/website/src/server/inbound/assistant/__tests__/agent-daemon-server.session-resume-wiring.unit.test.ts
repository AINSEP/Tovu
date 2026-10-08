import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

// Load the source-evaluation dependencies before test deadlines start: their cold import
// includes TypeScript and the Jini barrels and can exceed the cleanup test's 2-second limit.
import { captureDaemonRun } from "./helpers/daemon-source.js";

/**
 * @file Wiring proof for the H1/H2 fixes, in the same style as
 * `agent-daemon-installs-unhandled-rejection-guard.unit.test.ts` next to this file: reads the
 * SOURCE of `agent-daemon-server.ts` rather than importing it, because that file is a flat
 * top-level script that opens a real SQLite connection and binds a real port as a side effect of
 * being loaded at all (see that file's own module doc, and
 * `integration/daemon-boots.integration.test.ts` for the real spawn-and-listen proof of its boot
 * path).
 *
 * This is the test M6 says was missing: `agent-session-resume.unit.test.ts` and
 * `agent-run-concurrency.unit.test.ts` prove the two DECISIONS
 * (`shouldClearSessionOnFailedResume`, `createLiveRunTracker`) are correct in isolation, but a
 * correct decision wired to nothing would leave both bugs exactly as broken as before — H1 and H2
 * were both bugs of USAGE, not of the (previously nonexistent, now-extracted) decision logic. This
 * file is the one that would actually fail if `onStarted` stopped calling
 * `AgentSessionStore.clearSessionId` on a failed resume (H1), or stopped consulting
 * `LiveRunTracker.hasConcurrentLiveRun` before resuming (H2), even though every pure-function test
 * kept passing.
 */

const DAEMON_ENTRY_SOURCE = readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

/** Everything from `onStarted`'s own declaration through the end of the file — scopes every
 * assertion below to the handler these bugs actually live in, so a coincidental match elsewhere in
 * the file (a comment, an unrelated helper) could never make a stripped-out wiring pass by
 * accident. */
const ON_STARTED_INDEX = DAEMON_ENTRY_SOURCE.indexOf("const onStarted: RunStartHandler");
const onStartedSource = (() => {
  assert.ok(ON_STARTED_INDEX > -1, "this test's own anchor (the onStarted declaration) must still exist verbatim — update the anchor if that line's shape changes");
  return DAEMON_ENTRY_SOURCE.slice(ON_STARTED_INDEX);
})();

describe("H1 wiring — a failed resume must clear its dead stored session id", () => {
  test("imports shouldClearSessionOnFailedResume from the pure decision module", () => {
    assert.match(
      DAEMON_ENTRY_SOURCE,
      /import\s*\{[^}]*shouldClearSessionOnFailedResume[^}]*\}\s*from\s*["'][^"']*agent-session-preset(\.js)?["']/,
      "onStarted must import the H1 decision function from agent-session-preset.ts, not reimplement the check inline",
    );
  });

  test("the stream subscription calls shouldClearSessionOnFailedResume and, when true, clears the stored session id", () => {
    const clearCallIndex = onStartedSource.indexOf("routeDeps.agentSessions.clearSessionId(");
    assert.ok(clearCallIndex > -1, "onStarted's stream subscription must call routeDeps.agentSessions.clearSessionId — without this call, a dead resumed session id is never removed (H1)");

    const decisionCallIndex = onStartedSource.indexOf("shouldClearSessionOnFailedResume(");
    assert.ok(decisionCallIndex > -1, "onStarted must call shouldClearSessionOnFailedResume to decide when to clear");
    assert.ok(decisionCallIndex < clearCallIndex, "the decision must be checked BEFORE clearSessionId is called, not after (the clear must be conditional on the decision, not unconditional)");
  });

  test("attemptedResumeSessionId is assigned from the gated resume value actually attempted — the value the decision checks must reflect what onStarted really passed to agentExecutor.run, not the raw pre-gating lookup", () => {
    // Post-H2-context-loss-fix: the raw `storedSessionId` lookup is now unconditional (see that
    // fix's own wiring suite below), so it alone no longer tells you what THIS run actually
    // attempted — `effectiveResumeSessionId` (storedSessionId gated by hasConcurrentLiveRun) is the
    // value that must flow into `attemptedResumeSessionId`, same invariant as before this fix, just
    // renamed to keep "the raw lookup" and "what was actually attempted" distinguishable.
    assert.match(
      onStartedSource,
      /attemptedResumeSessionId\s*=\s*effectiveResumeSessionId\s*;/,
      "attemptedResumeSessionId must be set to effectiveResumeSessionId (not the raw storedSessionId) so shouldClearSessionOnFailedResume knows whether THIS run actually attempted a resume",
    );
  });
});

describe("H2 wiring — overlapping runs on one conversation must not both resume", () => {
  test("imports createLiveRunTracker and constructs exactly one module-level instance", () => {
    assert.match(
      DAEMON_ENTRY_SOURCE,
      /import\s*\{[^}]*createLiveRunTracker[^}]*\}\s*from\s*["'][^"']*agent-session-preset(\.js)?["']/,
      "agent-daemon-server.ts must import createLiveRunTracker from agent-session-preset.ts",
    );
    assert.match(
      DAEMON_ENTRY_SOURCE,
      /const\s+liveRunTracker\s*=\s*createLiveRunTracker\(\{\},\s*\{\}\)\s*;/,
      "there must be exactly one liveRunTracker instance for this process's whole lifetime, not a fresh one per run",
    );
  });

  test("a run registers itself in the tracker before any await in onStarted's synchronous prefix", () => {
    const registerIndex = onStartedSource.indexOf("liveRunTracker.register(");
    assert.ok(registerIndex > -1, "onStarted must register this run in liveRunTracker — without this, a second concurrent run can never observe the first as live (H2)");

    // The first `await` reachable in onStarted's own body lives inside the `.then(async () => ...)`
    // callback much further down (attachment/plugin-prefix resolution) — everything before that
    // point executes synchronously in one tick, which is what makes registration race-free across
    // two near-simultaneous requests. Asserting register happens before the customInstructionsCache
    // refresh call (the first genuinely async step in onStarted) proves it landed in that
    // synchronous prefix rather than after some other await had already yielded the event loop.
    const refreshIndex = onStartedSource.indexOf("customInstructionsCache");
    assert.ok(refreshIndex > -1, "this test's own anchor (the customInstructionsCache refresh call) must still exist verbatim");
    assert.ok(registerIndex < refreshIndex, "liveRunTracker.register must be called synchronously, before onStarted's first await (the custom-instructions refresh) — a register that runs after an await could lose the single-threaded-ordering guarantee two near-simultaneous requests rely on");
  });

  test("a run unregisters itself from the tracker on its own terminal event", { timeout: 2000 }, async () => {
    // finish() takes lifecycle states; it translates "cancelled" to the wire's "canceled".
    for (const status of ["succeeded", "failed", "cancelled"] as const) {
      const fixture = await sessionFixture();
      const conversationId = "terminal-cleanup-chat";
      const calls: unknown[] = [];
      let cleaned!: () => void;
      const cleanup = new Promise<void>((resolve) => { cleaned = resolve; });
      await captureDaemonRun({ prompt: "Answer", conversationId }, {
        lifecycle: fixture.lifecycle,
        bindings: {
          ...fixture.bindings,
          liveRunTracker: {
            ...fixture.liveRunTracker,
            unregister: ({ conversationId: chatId, runId }: { conversationId: string; runId: string }) => {
              calls.push({ unregister: { conversationId: chatId, runId } });
              fixture.liveRunTracker.unregister({ conversationId: chatId, runId: runId }, {});
            },
          },
          attachmentStore: { cleanupRun: async (input: { runId: string }) => { calls.push({ cleanup: input }); cleaned(); } },
        },
      });
      assert.equal(fixture.liveRunTracker.conversationIdForRun({ runId: "daemon-test-run" }, {}), conversationId);
      assert.deepEqual(calls, [], "a live run must retain its tracker and attachments");
      fixture.liveRunTracker.register({ conversationId: conversationId, runId: "other-live-run" }, {});
      const finished = await fixture.lifecycle.finish({ runId: "daemon-test-run", status, code: status === "succeeded" ? 0 : 1, signal: null, resumable: false });
      assert.equal(finished.state, status, "the lifecycle must reach the requested terminal state");
      await cleanup;
      // Observe the real terminal callback rather than its source spelling: unregister must
      // happen before attachment cleanup in the SAME principal/attachment cleanup block, not
      // an unrelated later callback. Otherwise finished runs appear live forever and force
      // every later turn cold. Only this run's registration may be released.
      assert.deepEqual(calls, [
        { unregister: { conversationId, runId: "daemon-test-run" } },
        { cleanup: { runId: "daemon-test-run" } },
      ]);
      assert.equal(fixture.liveRunTracker.conversationIdForRun({ runId: "daemon-test-run" }, {}), undefined);
      assert.equal(fixture.liveRunTracker.conversationIdForRun({ runId: "other-live-run" }, {}), conversationId);
      fixture.liveRunTracker.unregister({ conversationId: conversationId, runId: "other-live-run" }, {});
      assert.equal(fixture.liveRunTracker.hasConcurrentLiveRun({ conversationId: conversationId, runId: "next-run" }, {}), false);
    }
  });

  test("hasConcurrentLiveRun gates whether this run may read/pass a stored resumeSessionId", () => {
    const hasConcurrentIndex = onStartedSource.indexOf("liveRunTracker.hasConcurrentLiveRun(");
    assert.ok(hasConcurrentIndex > -1, "onStarted must consult liveRunTracker.hasConcurrentLiveRun before resuming — without this check, two overlapping runs for one conversation both resume the same CLI session id (H2)");

    const getSessionIdIndex = onStartedSource.indexOf("routeDeps.agentSessions.getSessionId(");
    assert.ok(getSessionIdIndex > -1, "this test's own anchor (the getSessionId call) must still exist verbatim");

    const runCallIndex = onStartedSource.indexOf("await agentExecutor.run({");
    assert.ok(runCallIndex > -1, "this test's own anchor (the agentExecutor.run call) must still exist verbatim");
    assert.ok(
      hasConcurrentIndex < runCallIndex && getSessionIdIndex < runCallIndex,
      "both the concurrency check and the stored-session lookup must be resolved before agentExecutor.run is called",
    );
  });
});

describe("H2-context-loss wiring — a forced-cold run must not silently drop conversation history", () => {
  /**
   * @file Proves `onStarted` is actually wired to refuse the run BEFORE `agentExecutor.run` is
   * ever called, when `wouldForcedColdStartLoseConversationContext` says starting cold here would
   * silently drop conversation history — the bug: H2 alone forces a run cold whenever another run
   * for the same conversation is already live, with no regard for whether the client already
   * stripped its prompt down to the bare latest message trusting THIS run to resume. See
   * `agent-session-resume.unit.test.ts`'s own suite for the decision function's pure-logic proof;
   * this file proves the decision is not computed and then ignored.
   */

  test("imports agentCarriesOwnMemory and wouldForcedColdStartLoseConversationContext from the pure decision module", () => {
    assert.match(
      DAEMON_ENTRY_SOURCE,
      /import\s*\{[^}]*agentCarriesOwnMemory[^}]*\}\s*from\s*["'][^"']*agent-session-preset(\.js)?["']/,
      "onStarted must import agentCarriesOwnMemory from agent-session-preset.ts, not reimplement the def lookup inline",
    );
    assert.match(
      DAEMON_ENTRY_SOURCE,
      /import\s*\{[^}]*wouldForcedColdStartLoseConversationContext[^}]*\}\s*from\s*["'][^"']*agent-session-preset(\.js)?["']/,
      "onStarted must import wouldForcedColdStartLoseConversationContext from agent-session-preset.ts",
    );
  });

  test("getSessionId is looked up unconditionally (not gated behind !hasConcurrentLiveRun) so the risky case is even detectable", () => {
    const getSessionIdIndex = onStartedSource.indexOf("routeDeps.agentSessions.getSessionId(");
    assert.ok(getSessionIdIndex > -1, "this test's own anchor (the getSessionId call) must still exist verbatim");

    const hasConcurrentDeclIndex = onStartedSource.indexOf("const hasConcurrentLiveRun =");
    assert.ok(hasConcurrentDeclIndex > -1, "onStarted must declare hasConcurrentLiveRun as its own value (no longer inline in the storedSessionId ternary) — needed so the context-loss check can read it independently of whether it gated the lookup");

    // Regression guard for the exact pre-fix shape: `getSessionId` used to appear INSIDE a
    // `!liveRunTracker.hasConcurrentLiveRun(...)` ternary condition, meaning it was never called at
    // all whenever a concurrent run was live — which is exactly the case
    // `wouldForcedColdStartLoseConversationContext` needs a real storedSessionId value to detect.
    assert.ok(
      !/!liveRunTracker\.hasConcurrentLiveRun\([^)]*\)\s*\n?\s*\?\s*await routeDeps\.agentSessions\.getSessionId/.test(onStartedSource),
      "getSessionId must not be conditioned on !hasConcurrentLiveRun any more — that shape silently made the context-loss check unable to see a real stored session id",
    );
  });

  test("the context-loss check runs, and refuses the run (finish + return), strictly before agentExecutor.run is called", () => {
    const decisionCallIndex = onStartedSource.indexOf("wouldForcedColdStartLoseConversationContext({");
    assert.ok(decisionCallIndex > -1, "onStarted must call wouldForcedColdStartLoseConversationContext — without this, H2 silently drops conversation history for a carriesOwnMemory agent");

    const carriesOwnMemoryCallIndex = onStartedSource.indexOf("agentCarriesOwnMemory({ agentId: agentId }, {})");
    assert.ok(carriesOwnMemoryCallIndex > -1, "onStarted must pass agentCarriesOwnMemory({ agentId: agentId }, {}) into the decision — without it every run would look non-resume-capable and the check would never fire");

    const runCallIndex = onStartedSource.indexOf("await agentExecutor.run({");
    assert.ok(runCallIndex > -1, "this test's own anchor (the agentExecutor.run call) must still exist verbatim");

    assert.ok(
      decisionCallIndex < runCallIndex,
      "the context-loss decision must be evaluated before agentExecutor.run is called, not after",
    );

    // The refusal branch: between the decision call and the run call, onStarted must finish the
    // run as failed and return, exactly like the malformed-contextRef and attachment-claim-failure
    // guards earlier in this same handler — never let agentExecutor.run be reached in this branch.
    const refusalBlock = onStartedSource.slice(decisionCallIndex, runCallIndex);
    // `failRunBeforeStart` (agent-session-preset.ts) finishes the run failed, after putting the plain
    // reason on its stream (2026-09-27). Its own unit test pins that it always finishes.
    assert.match(
      refusalBlock,
      /await\s+failRunBeforeStart\(\{\s*lifecycle:\s*runLifecycle,\s*runId:\s*run\.id,\s*message:\s*CONCURRENT_RUN_REFUSAL_MESSAGE\s*\},\s*\{\}\)/,
      "the refusal branch must finish the run as failed, through failRunBeforeStart so the user also sees why",
    );
    assert.match(refusalBlock, /\breturn\s+null\s*;/, "the refusal branch must return before falling through to agentExecutor.run");
    assert.match(refusalBlock, /if\s*\(sessionBinding\s*===\s*null\)\s*return\s*;/, "a refused binding must stop dispatch before agentExecutor.run");
  });

  test("effectiveResumeSessionId (not the raw storedSessionId) is what attemptedResumeSessionId and resolveResumeSessionField consume", () => {
    assert.match(
      onStartedSource,
      /const\s+effectiveResumeSessionId\s*=\s*hasConcurrentLiveRun\s*\?\s*null\s*:\s*storedSessionId\s*;/,
      "onStarted must derive an effectiveResumeSessionId that is null whenever hasConcurrentLiveRun is true, independent of the now-unconditional storedSessionId lookup",
    );
    assert.match(
      onStartedSource,
      /attemptedResumeSessionId\s*=\s*effectiveResumeSessionId\s*;/,
      "attemptedResumeSessionId must reflect what this run actually attempted (effectiveResumeSessionId), not the raw lookup",
    );
    assert.match(
      onStartedSource,
      /resolveResumeSessionField\(\{\s*storedSessionId:\s*effectiveResumeSessionId\s*\},\s*\{\}\)/,
      "agentExecutor.run must be handed the gated effectiveResumeSessionId, not the raw storedSessionId, or H2's own concurrency guard would be defeated",
    );
  });
});

describe("Send right after Stop — wait for the stopped run, and say why when refusing", () => {
  test("waits for a stopped run on the same chat before deciding whether another run holds the session", () => {
    const waitIndex = onStartedSource.indexOf("await waitForStoppingRuns({");
    assert.ok(waitIndex > -1, "onStarted must wait for a run the user stopped (it takes seconds to exit) before the concurrency check, or a send right after Stop is refused in 0.1 s");
    const hasConcurrentIndex = onStartedSource.indexOf("const hasConcurrentLiveRun =");
    assert.ok(hasConcurrentIndex > -1, "this test's own anchor (the hasConcurrentLiveRun declaration) must still exist verbatim");
    assert.ok(waitIndex < hasConcurrentIndex, "the wait must come before liveRunTracker.hasConcurrentLiveRun is read");
  });

  test("the concurrent-run refusal puts its plain reason on the run's stream", () => {
    assert.ok(
      onStartedSource.includes("await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: CONCURRENT_RUN_REFUSAL_MESSAGE }, {});"),
      "the refusal must go through failRunBeforeStart so the user sees why, not a bare runLifecycle.finish",
    );
  });
});

/** Complete onStarted + real lifecycle/store; fake only the process executor and unrelated I/O. */
async function sessionFixture() {
  const { createInMemoryEventLog, createRunLifecycle } = await import("@jini-ai/daemon");
  const { createInMemoryAgentSessionStore } = await import("@jini-ai/daemon/store/agent-sessions");
  const { createLiveRunTracker, waitForStoppingRuns, STOPPING_RUN_WAIT_MS, failRunBeforeStart, CONCURRENT_RUN_REFUSAL_MESSAGE } = await import("../../../../assistant/agent-session-preset.js");
  const { extractSessionRefFromEndEvent, shouldClearSessionOnFailedResume } = await import("../../../../assistant/agent-session-preset.js");
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  await lifecycle.rehydrate({});
  await lifecycle.start({ contextRef: "session-regression" }, { runId: "daemon-test-run" });
  const agentSessions = createInMemoryAgentSessionStore({});
  const liveRunTracker = createLiveRunTracker({}, {});
  const bindings = {
    routeDeps: { workspaceId: "ws-session-regression", agentSessions }, liveRunTracker,
    extractSessionRefFromEndEvent, shouldClearSessionOnFailedResume,
    waitForStoppingRuns, STOPPING_RUN_WAIT_MS, failRunBeforeStart, CONCURRENT_RUN_REFUSAL_MESSAGE,
    runCredentials: { revoke() {} }, runOwners: { record() {}, forget() {} },
    RUN_OWNER_RETENTION_MS: 0, attachmentStore: undefined,
  };
  return { lifecycle, agentSessions, liveRunTracker, bindings };
}

// F1.4/F6.3: dead-code clearSessionId and clearing by run.id both leave this seeded binding alive.
for (const terminal of ["failed-unconfirmed", "succeeded-reconfirmed"] as const) {
  test(`onStarted's real stream ${terminal === "failed-unconfirmed" ? "clears only the resumed conversation-agent binding" : "persists the CLI's reconfirmed session"}`, async () => {
    const fixture = await sessionFixture();
    const key = { conversationId: "conversation-original", agentId: "claude" };
    await fixture.agentSessions.setSessionId({ ...key, sessionId: "dead-resume-id" });
    await fixture.agentSessions.setSessionId({ conversationId: "conversation-other", agentId: "claude", sessionId: "other-conversation-id" });
    await fixture.agentSessions.setSessionId({ conversationId: key.conversationId, agentId: "codex", sessionId: "other-agent-id" });
    const input = await captureDaemonRun({ prompt: "Continue", conversationId: key.conversationId }, { lifecycle: fixture.lifecycle, bindings: fixture.bindings, request: { agentId: "claude" } });
    assert.equal(input.resumeSessionId, "dead-resume-id");
    assert.equal(Object.hasOwn(input, "newSessionId"), false);
    await fixture.lifecycle.finish({ runId: "daemon-test-run", status: terminal === "failed-unconfirmed" ? "failed" : "succeeded", code: terminal === "failed-unconfirmed" ? 1 : 0, signal: null, resumable: false }, terminal === "succeeded-reconfirmed" ? { sessionRef: "reconfirmed-cli-id" } : {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(await fixture.agentSessions.getSessionId(key), terminal === "failed-unconfirmed" ? null : "reconfirmed-cli-id");
    assert.equal(await fixture.agentSessions.getSessionId({ conversationId: "conversation-other", agentId: "claude" }), "other-conversation-id");
    assert.equal(await fixture.agentSessions.getSessionId({ conversationId: key.conversationId, agentId: "codex" }), "other-agent-id");
    assert.equal(fixture.liveRunTracker.conversationIdForRun({ runId: "daemon-test-run" }, {}), undefined);
    if (terminal === "failed-unconfirmed") {
      const next = await sessionFixture();
      const nextInput = await captureDaemonRun({ prompt: "Retry after recovery", conversationId: key.conversationId }, {
        lifecycle: next.lifecycle, request: { agentId: "claude" },
        bindings: { ...next.bindings, routeDeps: { workspaceId: "ws-session-regression", agentSessions: fixture.agentSessions } },
      });
      assert.equal(Object.hasOwn(nextInput, "resumeSessionId"), false, "the next turn must not retry the dead id");
      assert.equal(nextInput.newSessionId, "unused-session-id");
      assert.equal(await fixture.agentSessions.getSessionId(key), "unused-session-id");
      await next.lifecycle.finish({ runId: "daemon-test-run", status: "succeeded", code: 0, signal: null, resumable: false }, { sessionRef: "unused-session-id" });
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });
}

test("onStarted refuses a concurrent memory-carrying run and never dispatches a cold executor call", async () => {
  const fixture = await sessionFixture();
  const key = { conversationId: "conversation-contended", agentId: "claude" };
  await fixture.agentSessions.setSessionId({ ...key, sessionId: "existing-history-id" });
  fixture.liveRunTracker.register({ conversationId: key.conversationId, runId: "already-answering-run" }, {});
  const dispatched: unknown[] = [];
  const events: { kind: string; payload: unknown }[] = [];
  await fixture.lifecycle.stream({ runId: "daemon-test-run", onEvent: (event) => { events.push(event); } });
  await assert.rejects(captureDaemonRun({ prompt: "Only the latest message", conversationId: key.conversationId }, {
    lifecycle: fixture.lifecycle, terminalFailure: true, request: { agentId: "claude" },
    bindings: { ...fixture.bindings, agentExecutor: { run: async (...args: unknown[]) => { dispatched.push(args); } } },
  }), /onStarted failed the run before executor dispatch/);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(dispatched, []);
  assert.equal((await fixture.lifecycle.get({ runId: "daemon-test-run" }))?.state, "failed");
  const error = events.find((event) => event.kind === "error");
  assert.ok(error);
  assert.deepEqual(error.payload, { message: "Another answer in this chat is still running. This turn could not start." });
  assert.equal(await fixture.agentSessions.getSessionId(key), "existing-history-id");
});

test("onStarted registers the conversation synchronously while instruction refresh is held", async () => {
  const fixture = await sessionFixture();
  const key = { conversationId: "conversation-before-refresh", agentId: "claude" };
  await fixture.agentSessions.setSessionId({ ...key, sessionId: "session-before-refresh" });
  let release!: () => void;
  const refresh = new Promise<void>((resolve) => { release = resolve; });
  let dispatched = false;
  const started = captureDaemonRun({ prompt: "Continue", conversationId: key.conversationId }, {
    lifecycle: fixture.lifecycle, request: { agentId: "claude" },
    bindings: { ...fixture.bindings, customInstructionsCache: { refresh: () => refresh } },
  }).then((input) => { dispatched = true; return input; });
  try {
    assert.equal(fixture.liveRunTracker.conversationIdForRun({ runId: "daemon-test-run" }, {}), key.conversationId);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(dispatched, false, "no executor dispatch until refresh settles");
  } finally {
    release();
    const input = await started;
    assert.equal(input.resumeSessionId, "session-before-refresh");
    await fixture.lifecycle.finish({ runId: "daemon-test-run", status: "succeeded", code: 0, signal: null, resumable: false }, { sessionRef: "session-before-refresh" });
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
});
