/**
 * @file The dispatch-time half of the conversation/agent-CLI-session binding — Defect 1 of the
 * 2026-09-11 chat-lifecycle repair.
 *
 * `agent-session-resume.ts` next to this file owns the READ side (which stored id a run may resume,
 * and when a failed resume should clear a dead one). Until now nothing owned the WRITE side at
 * dispatch: the binding was persisted only from a run's terminal `end` event
 * (`RunEndPayload.sessionRef`), so a run that died before reporting one — a daemon respawn, a spawn
 * that failed, a crash — left `assistant_agent_sessions` with nothing at all for that conversation.
 * The next turn found no session, started cold under a brand-new CLI session, and (because
 * `assistant-transport.ts` sends only the bare latest user message to a `carriesOwnMemory` agent)
 * answered with none of the conversation. Observed live in `sites/tovu-com/chat.db` conversation
 * `9289701c-d56c-47f7-8e7a-f0a824c3ca23`, whose opening message ran inside a real, 81-line CLI
 * session no later turn ever referenced again.
 *
 * The mechanism the fix uses is not new machinery — it is the protocol `@jini-ai/agent-runtime`'s
 * `types.ts` already specifies and Tovu never implemented the caller half of: for a def that does
 * NOT declare `capturesSessionIdFromStream`, "the caller mints `RuntimeContext.newSessionId` (a
 * freshly minted id the caller also persists) and the CLI is told to use it." Minting at dispatch
 * makes the binding exist before the CLI is even spawned, so nothing about how the run ends can
 * orphan it.
 *
 * Split into its own module, and pure but for an injected `mint`, for the same reason
 * `agent-session-resume.ts` and `plugin-prompt-prefix.ts` are: `agent-daemon-server.ts` opens a
 * real SQLite connection and binds a real port as a side effect of being imported, so nothing
 * declared inside it can be unit tested directly.
 */
import { AGENT_DEFS } from "@jini-ai/agent-runtime";

/**
 * Whether `agentId`'s def expects the HOST to mint its session id and hand it over, rather than
 * minting its own and reporting it back on the stream.
 *
 * Derived from declared def capabilities rather than a hand-kept id list, because the capability
 * IS the contract (`@jini-ai/agent-runtime`'s `types.ts`):
 *  - `resumesSessionViaCli` — the def resumes through its CLI's own session flag at all. Without
 *    it there is no `--resume`/`--session-id` pair for a minted id to participate in.
 *  - NOT `capturesSessionIdFromStream` — that flag is the def declaring itself "capture-style":
 *    the CLI generates its own id and reports it, and `newSessionId` is deliberately not passed to
 *    it. Minting for such a def (codex, opencode today) would persist an id no CLI session was
 *    ever created under, which is strictly worse than persisting nothing: the next turn would
 *    resume a session that does not exist.
 *
 * `resumesSessionViaAcpLoad` defs (amr today) are excluded by the first clause on their own — they
 * do not set `resumesSessionViaCli`, because their durable handle is the ACP session obtained from
 * `session/load`, not a CLI flag.
 *
 * @param agentId - The run's resolved agent id (`request.agentId ?? DEFAULT_AGENT_ID`).
 * @returns `false` for an unknown agentId — fails closed, matching `agentCarriesOwnMemory`'s own
 *   default for the same input.
 * @complexity O(d) in `AGENT_DEFS.length` (24 today) — a linear scan, run once per run start.
 */
export function agentAcceptsHostMintedSessionId(agentId: string): boolean {
  const def = AGENT_DEFS.find((candidate) => candidate.id === agentId);
  if (!def) return false;
  return Boolean(def.resumesSessionViaCli) && !def.capturesSessionIdFromStream;
}

/**
 * The fresh session id this run should be started under and bound to its conversation, or `null`
 * when this run must not mint one.
 *
 * Minting is correct only on a genuine COLD start: `effectiveResumeSessionId` being `null` means
 * this run is about to spawn a CLI session that does not exist yet, and nothing is on record for
 * the conversation to lose. A resuming run already has a binding — overwriting it with a fresh id
 * would be the fork this whole fix exists to prevent.
 *
 * @param input.conversationId - This run's conversation, or `undefined` for a daemon client with
 *   none (anything other than the admin chat pane). Nothing to file a binding under means nothing
 *   to mint: the CLI would be handed a `--session-id` no later turn could ever resume.
 * @param input.effectiveResumeSessionId - The id this run is actually resuming, AFTER the H2
 *   concurrency gate (`agent-daemon-server.ts`'s own `effectiveResumeSessionId`), or `null` for a
 *   cold start.
 * @param input.acceptsHostMintedSessionId - {@link agentAcceptsHostMintedSessionId} for this run's
 *   def. Passed in rather than looked up here so the decision stays testable without the registry.
 * @param input.mint - Fresh-id source, injected (`randomUUID` in production) so this function is
 *   deterministic under test.
 * @returns The id to persist AND pass as `AgentExecutorRunInput.newSessionId` — one value used for
 *   both, never two — or `null` to change nothing.
 * @complexity O(1).
 */
export function resolveHostMintedSessionId(input: {
  conversationId: string | undefined;
  effectiveResumeSessionId: string | null;
  acceptsHostMintedSessionId: boolean;
  mint: () => string;
}): string | null {
  if (input.conversationId === undefined) return null;
  if (input.effectiveResumeSessionId !== null) return null;
  if (!input.acceptsHostMintedSessionId) return null;
  return input.mint();
}

/**
 * The `AgentExecutorRunInput` field a host-minted session id resolves to — the mirror of
 * `agent-session-resume.ts`'s `resolveResumeSessionField`, and deliberately the same shape.
 *
 * @param hostMintedSessionId - {@link resolveHostMintedSessionId}'s result.
 * @returns `{ newSessionId }` when there is one; an empty object (no key at all, not
 *   `{ newSessionId: undefined }`) otherwise, so the spread at the call site is byte-identical to
 *   every other optional `AgentExecutor.run()` field in `onStarted`.
 * @complexity O(1).
 */
export function resolveNewSessionField(hostMintedSessionId: string | null): { newSessionId?: string } {
  return hostMintedSessionId !== null ? { newSessionId: hostMintedSessionId } : {};
}
