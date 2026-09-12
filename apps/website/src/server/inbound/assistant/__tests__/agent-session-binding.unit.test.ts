import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { AGENT_DEFS } from "@jini-ai/agent-runtime";

import {
  agentAcceptsHostMintedSessionId,
  resolveHostMintedSessionId,
  resolveNewSessionField,
} from "../agent-session-binding.js";

/**
 * @file Regression suite for Defect 1 (2026-09-11 chat-lifecycle repair): a conversation forked
 * across two agent-CLI sessions because the `(conversation, agent) -> session id` binding was
 * persisted ONLY from a run's terminal `end` event.
 *
 * The observed failure, in `sites/tovu-com/chat.db` conversation
 * `9289701c-d56c-47f7-8e7a-f0a824c3ca23`: the opening user message ran in CLI session
 * `56bfd415-de2a-4c21-9912-db96ecf74d0d` (a real, 81-line transcript file — the CLI genuinely
 * created and used it), every later message ran in `76ffce45-3731-4bd7-9497-4b25606fa82a`, and
 * `assistant_agent_sessions` held only the latter. Turn 2 therefore found nothing stored, started
 * cold, and — because the client sends only the bare latest user message to a `carriesOwnMemory`
 * agent — answered with none of turn 1.
 *
 * The fix these tests pin: for a def whose CLI accepts a caller-supplied session id, the HOST mints
 * the id and persists it BEFORE `AgentExecutor.run()` is ever called, so a run that dies before
 * reporting a terminal `sessionRef` (daemon respawn, immediate spawn failure, crash) can no longer
 * orphan its session. `@jini-ai/agent-runtime`'s `types.ts` already specifies this as the default
 * protocol ("the caller mints `RuntimeContext.newSessionId` ... a freshly minted id the caller also
 * persists"); Tovu simply never implemented the caller half.
 */

describe("agentAcceptsHostMintedSessionId — which defs the host may mint a session id for", () => {
  test("claude accepts a host-minted session id", () => {
    // The product default (`DEFAULT_AGENT_ID`) and the agent the observed defect happened under:
    // `resumesSessionViaCli: true` with no `capturesSessionIdFromStream`, which `types.ts` defines
    // as "specify-style — the caller mints the id and the CLI is told to use it".
    assert.equal(agentAcceptsHostMintedSessionId("claude"), true);
  });

  test("codex does NOT — it is capture-style, the CLI mints its own id", () => {
    // `capturesSessionIdFromStream: true`. Minting for this def would persist an id the CLI never
    // uses, which is strictly worse than persisting nothing: the next turn would resume a session
    // that does not exist.
    assert.equal(agentAcceptsHostMintedSessionId("codex"), false);
  });

  test("opencode does NOT — also capture-style", () => {
    assert.equal(agentAcceptsHostMintedSessionId("opencode"), false);
  });

  test("amr does NOT — ACP `session/load` resume, whose handle is the ACP session, not a CLI flag", () => {
    assert.equal(agentAcceptsHostMintedSessionId("amr"), false);
  });

  test("an unknown agent id does NOT — fails closed, same default as agentCarriesOwnMemory", () => {
    assert.equal(agentAcceptsHostMintedSessionId("not-a-real-agent"), false);
  });

  test("every def this returns true for actually consumes newSessionId in its own buildArgs", () => {
    /*
     * The adversarial case this suite exists for: the predicate is derived from DECLARED def
     * capabilities, not from a hand-maintained id list, so it must never claim a def that would
     * silently ignore the id we persisted. `buildArgs` is the only place a def can consume
     * `RuntimeContext.newSessionId`, so calling it with one and asserting the id reaches argv is
     * the end-to-end check — a def that declares specify-style resume but drops the field would
     * leave Tovu storing an id no CLI session was ever created under.
     */
    const accepted = AGENT_DEFS.filter((def) => agentAcceptsHostMintedSessionId(def.id));
    assert.ok(accepted.length > 0, "no def accepts a host-minted session id — the predicate cannot be exercised at all");
    for (const def of accepted) {
      const args = def.buildArgs("hi", [], [], {}, { newSessionId: "minted-abc" });
      assert.ok(
        args.includes("minted-abc"),
        `def "${def.id}" is claimed to accept a host-minted session id but its buildArgs never puts it on the command line`,
      );
    }
  });
});

describe("resolveHostMintedSessionId — when a fresh id is minted at dispatch", () => {
  const mint = (): string => "minted-1";

  test("mints on a cold start for a specify-style agent in a known conversation", () => {
    assert.equal(
      resolveHostMintedSessionId({
        conversationId: "conv-1",
        effectiveResumeSessionId: null,
        acceptsHostMintedSessionId: true,
        mint,
      }),
      "minted-1",
    );
  });

  test("does not mint when this run is resuming — the stored id already binds the conversation", () => {
    assert.equal(
      resolveHostMintedSessionId({
        conversationId: "conv-1",
        effectiveResumeSessionId: "stored-9",
        acceptsHostMintedSessionId: true,
        mint,
      }),
      null,
    );
  });

  test("does not mint for a capture-style agent — the CLI owns the id", () => {
    assert.equal(
      resolveHostMintedSessionId({
        conversationId: "conv-1",
        effectiveResumeSessionId: null,
        acceptsHostMintedSessionId: false,
        mint,
      }),
      null,
    );
  });

  test("does not mint without a conversation id — there is nothing to file the binding under", () => {
    // Any daemon client other than the admin chat pane. Minting here would hand the CLI a
    // `--session-id` nobody could ever resume, and `setSessionId` has no key to write.
    assert.equal(
      resolveHostMintedSessionId({
        conversationId: undefined,
        effectiveResumeSessionId: null,
        acceptsHostMintedSessionId: true,
        mint,
      }),
      null,
    );
  });

  test("mints a DISTINCT id per call — two cold conversations must not share one CLI session", () => {
    let n = 0;
    const counting = (): string => {
      n += 1;
      return `minted-${n}`;
    };
    const input = { conversationId: "conv-1", effectiveResumeSessionId: null, acceptsHostMintedSessionId: true } as const;
    assert.equal(resolveHostMintedSessionId({ ...input, mint: counting }), "minted-1");
    assert.equal(resolveHostMintedSessionId({ ...input, mint: counting }), "minted-2");
  });
});

describe("resolveNewSessionField — the AgentExecutor.run() spread", () => {
  test("carries the minted id", () => {
    assert.deepEqual(resolveNewSessionField("minted-1"), { newSessionId: "minted-1" });
  });

  test("is an EMPTY object for null — not `{ newSessionId: undefined }`", () => {
    // Byte-identical to `resolveResumeSessionField`'s own contract: an explicit `undefined` key
    // would still spread into `AgentExecutor.run()`'s input object, which every other optional
    // field in `onStarted` deliberately avoids.
    const field = resolveNewSessionField(null);
    assert.deepEqual(field, {});
    assert.equal("newSessionId" in field, false);
  });
});
