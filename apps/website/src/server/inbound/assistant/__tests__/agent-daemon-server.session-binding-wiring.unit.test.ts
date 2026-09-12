import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

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
        new RegExp(`import\\s*\\{[^}]*${name}[^}]*\\}\\s*from\\s*["'][^"']*agent-session-binding(\\.js)?["']`, "s").test(DAEMON_ENTRY_SOURCE),
        `onStarted must import ${name} from agent-session-binding.ts, not reimplement that decision inline`,
      );
    }
  });

  test("a SECOND setSessionId call site exists, reached at dispatch rather than from the terminal end event", () => {
    /*
     * The defect in one assertion. Before the fix the ONLY `setSessionId` call in this file lived
     * in the `runLifecycle.stream(...)` subscription's `end` branch, so the binding was written
     * only by a run that survived long enough to report a terminal `sessionRef`. A run that died
     * first stored nothing at all, and the next turn started cold under a brand-new session.
     *
     * Counted rather than located by index: the stream subscription is declared textually ABOVE
     * `agentExecutor.run` even though it fires long after it, so "appears before the run call" is
     * not evidence of anything here — an earlier draft of this test passed against the unfixed
     * file for exactly that reason.
     */
    const callSites = onStartedSource.split("routeDeps.agentSessions.setSessionId(").length - 1;
    assert.ok(
      callSites >= 2,
      `onStarted must persist the conversation/session binding at dispatch as well as from the terminal end event — found ${callSites} setSessionId call site(s), meaning a run that dies early still orphans its CLI session (Defect 1)`,
    );
  });

  test("the dispatch-time write is awaited, so the binding is durable before the CLI is ever spawned", () => {
    const runCallIndex = onStartedSource.indexOf("await agentExecutor.run({");
    const preDispatch = onStartedSource.slice(0, runCallIndex);
    // `await`, specifically: the terminal-event call site is a fire-and-forget `void ...setSessionId`,
    // so this also distinguishes the new call site from the old one rather than re-matching it.
    assert.ok(
      /await\s+routeDeps\.agentSessions\.setSessionId\(/.test(preDispatch),
      "the dispatch-time setSessionId must be awaited — a fire-and-forget write can lose the race with the run it is supposed to be binding",
    );
  });

  test("the minted id is both persisted and handed to AgentExecutor.run — one id, not two", () => {
    const runCallIndex = onStartedSource.indexOf("await agentExecutor.run({");
    const mintIndex = onStartedSource.indexOf("resolveHostMintedSessionId({");
    assert.ok(mintIndex > -1, "onStarted must call resolveHostMintedSessionId to decide whether to mint");
    assert.ok(mintIndex < runCallIndex, "the mint decision must be made before agentExecutor.run is called");

    assert.ok(
      /resolveNewSessionField\(hostMintedSessionId\)/.test(onStartedSource),
      "agentExecutor.run must be handed the SAME id that was persisted (via resolveNewSessionField(hostMintedSessionId)) — persisting one id and spawning the CLI under another is the fork this fix exists to prevent",
    );
    assert.ok(
      /setSessionId\(conversationId,\s*agentId,\s*hostMintedSessionId\)/.test(onStartedSource),
      "the persisted value must be the minted id itself, under this run's own (conversationId, agentId)",
    );
  });

  test("the mint decision is gated on the def actually accepting a host-minted id", () => {
    assert.ok(
      /acceptsHostMintedSessionId:\s*agentAcceptsHostMintedSessionId\(agentId\)/.test(onStartedSource),
      "resolveHostMintedSessionId must be told whether THIS run's def accepts a host-minted id — minting for a capture-style def (codex, opencode) would store an id the CLI never uses, which is worse than storing nothing",
    );
  });
});

describe("Defect 1 wiring — run starts must be serialized per conversation", () => {
  test("imports createConversationStartLock and constructs exactly one module-level instance", () => {
    assert.ok(
      /import\s*\{[^}]*createConversationStartLock[^}]*\}\s*from\s*["'][^"']*conversation-start-lock(\.js)?["']/s.test(DAEMON_ENTRY_SOURCE),
      "agent-daemon-server.ts must import createConversationStartLock from conversation-start-lock.ts",
    );
    assert.ok(
      /const\s+conversationStartLock\s*=\s*createConversationStartLock\(\)\s*;/.test(DAEMON_ENTRY_SOURCE),
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
