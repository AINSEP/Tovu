/**
 * @file Test seam extracted out of `agent-daemon-server.ts`'s `onStarted`: the decision logic
 * around resuming an agent's own CLI session across chat turns instead of spawning cold every
 * turn — the round trip `RunEndPayload.sessionRef`'s doc in `@jini-ai/protocol` describes, backed
 * by `assistant/persistence/agent-session-store.ts` (migration `0051`).
 *
 * `agent-daemon-server.ts` cannot be imported directly by a unit test without inheriting its own
 * import-time side effects (opens a DB connection, builds the tool registry, etc — see that file's
 * own module doc, `const routeDeps = ...` at its top level). This module has none, matching
 * `plugin-prompt-prefix.ts`'s identical reasoning next to it.
 *
 * {@link shouldClearSessionOnFailedResume} is the same kind of extraction for the H1 fix: the
 * decision of WHEN a failed resume should clear its stored id lives here, directly testable;
 * `onStarted` only wires the result to `AgentSessionStore.clearSessionId`.
 *
 * Deliberately never mints a fresh `AgentExecutorRunInput.newSessionId`: `claude-stream.ts`
 * (`@jini-ai/agent-runtime`) captures the CLI's own `session_id` off its `init` stream event
 * whether or not `--session-id` was passed explicitly, so a conversation's first turn — the one
 * case with no stored id to resume — needs no id minted up front. It runs cold (there is nothing
 * to resume yet, correctly), and whatever session id the CLI reports at `end` is what
 * {@link extractSessionRefFromEndEvent} captures for the NEXT turn to resume.
 */
import { AGENT_DEFS } from "@jini-ai/agent-runtime";
import type { RunStartHandler } from "@jini-ai/http-kit";

type OnStartedContext = Parameters<RunStartHandler>[0];
/**
 * The event type `RunLifecycle.stream()`'s callback receives — derived structurally from
 * `RunStartHandler`'s own `lifecycle` field rather than imported by name from `@jini-ai/protocol`
 * (the package that actually defines it): Tovu has no direct dependency on `@jini-ai/protocol`
 * (only on `@jini-ai/daemon`/`@jini-ai/http-kit`, which depend on it themselves), so a bare
 * `import ... from "@jini-ai/protocol"` resolves at type-check time only by accident of how those
 * two packages' own `.d.ts` files happen to be laid out, and fails outright at runtime for any
 * non-type-only import. Deriving it via `Parameters<>` needs no new dependency and can never drift
 * from what `onStarted` itself actually receives.
 */
type RunProtocolEvent = Parameters<Parameters<OnStartedContext["lifecycle"]["stream"]>[1]>[0];

/**
 * The `AgentExecutorRunInput` fields a stored session id resolves to.
 *
 * @param storedSessionId - `AgentSessionStore.getSessionId`'s result for this run's
 *   (conversationId, agentId) pair, or `null` when this is the conversation's first turn with this
 *   agent (or its stored session was never captured).
 * @returns `{ resumeSessionId }` to spread into `AgentExecutor.run()`'s input when a prior session
 *   exists; an empty object (no key at all, not `{ resumeSessionId: undefined }`) otherwise —
 *   `computeRuntimeContext`'s own truthiness check (`@jini-ai/daemon`'s `agent-executor.ts`) treats
 *   an explicit `undefined`/`null` identically to omission, but an empty object keeps this
 *   function's output byte-identical to every other run's `...spreadable` field in `onStarted`.
 * @complexity O(1).
 */
export function resolveResumeSessionField(storedSessionId: string | null): { resumeSessionId?: string } {
  return storedSessionId !== null ? { resumeSessionId: storedSessionId } : {};
}

/**
 * The fresh agent-CLI session id a run's terminal event reported, if this event IS that terminal
 * `end` event and it actually carried one.
 *
 * @param event - One event from `RunLifecycle.stream()`'s callback (`@jini-ai/daemon`).
 * @returns The session id to persist via `AgentSessionStore.setSessionId`, or `undefined` when
 *   this is not an `'end'` event, or the run's def has no `resumesSessionViaCli` support, or the
 *   run failed before the CLI ever reported an id — every one of these should leave whatever was
 *   already stored for this (conversation, agent) pair untouched, not overwrite it with nothing.
 * @complexity O(1).
 */
export function extractSessionRefFromEndEvent(event: RunProtocolEvent): string | undefined {
  if (event.kind !== "end") return undefined;
  const { sessionRef } = event.payload;
  return typeof sessionRef === "string" && sessionRef.length > 0 ? sessionRef : undefined;
}

/**
 * Whether a run's terminal event means the `AgentSessionStore` entry it attempted to resume should
 * be cleared (`AgentSessionStore.clearSessionId`) rather than left for the next turn to retry as-is
 * — the H1 fix: a resume that fails before the CLI ever reports a session id (e.g. this repo's own
 * daemon-restarted-from-a-different-cwd hazard) previously left the dead stored id in place, so
 * every later turn retried the identical `--resume <deadId>` and failed the same way forever, with
 * no recovery short of editing the database by hand.
 *
 * True only when ALL of:
 *  - `attemptedResumeSessionId` is non-null — this run actually passed `resumeSessionId` to
 *    `AgentExecutor.run()` (via {@link resolveResumeSessionField}), so there is a stored id whose
 *    validity this run's outcome can actually speak to. A cold first turn (`null`) has nothing
 *    stored yet to protect, so it is never a candidate for clearing.
 *  - `event` is the run's terminal `'end'` event — any earlier event (e.g. a `'status'`/`'agent'`
 *    progress update) says nothing about whether the resume ultimately succeeded.
 *  - {@link extractSessionRefFromEndEvent} returns `undefined` for that event — the CLI never
 *    reconfirmed a session id before the run ended, whether it failed outright or (for a
 *    non-`resumesSessionViaCli` def) simply never reports one.
 *
 * Deliberately does not itself distinguish "the CLI session is actually dead" from "this run
 * failed for an unrelated reason and just didn't get far enough to reconfirm it" — `RunEndPayload`
 * carries no such signal, and the cost of the two outcomes is asymmetric: clearing a session that
 * might have still resumed on a later attempt only costs one conversation one cold turn, where
 * leaving a genuinely dead id in place costs every later turn in that conversation forever (H1).
 *
 * @param event - One event from `RunLifecycle.stream()`'s callback (`@jini-ai/daemon`).
 * @param attemptedResumeSessionId - The `resumeSessionId` this run actually attempted (the
 *   `storedSessionId` `onStarted` resolved before calling `AgentExecutor.run()`), or `null` if this
 *   run started cold.
 * @complexity O(1).
 */
export function shouldClearSessionOnFailedResume(
  event: RunProtocolEvent,
  attemptedResumeSessionId: string | null,
): boolean {
  if (attemptedResumeSessionId === null) return false;
  if (event.kind !== "end") return false;
  return extractSessionRefFromEndEvent(event) === undefined;
}

/**
 * Whether `agentId`'s own CLI/ACP session already carries multi-turn conversation memory across
 * spawns — the same static, per-def property `assistant/agents.ts`'s `probeAssistantAgents`
 * derives as `AssistantAgentSummary.carriesOwnMemory` (client-side, from `GET /api/agents`) and
 * `apps/admin/src/lib/assistant-transport.ts`'s `startRun` reads to decide whether to send the
 * full rendered transcript or just the newest user message for a turn. Duplicated here (rather
 * than imported from `assistant/agents.ts`) because that module's only export is the async,
 * PATH-probing `listAssistantAgents()`/`rescanAssistantAgents()` pair — this needs the same
 * boolean synchronously, off `@jini-ai/agent-runtime`'s static `AGENT_DEFS` alone, with no I/O.
 *
 * @param agentId - The run's resolved agent id (`request.agentId ?? DEFAULT_AGENT_ID`).
 * @returns `false` for an unknown agentId (matches `Boolean(undefined)`, the same "not resume
 *   capable" default an absent def's fields would produce).
 * @complexity O(d) in `AGENT_DEFS.length` (24 today) — a linear scan, not indexed, since this
 *   runs once per run start, not per event.
 */
export function agentCarriesOwnMemory(agentId: string): boolean {
  const def = AGENT_DEFS.find((candidate) => candidate.id === agentId);
  return Boolean(def?.resumesSessionViaCli) || Boolean(def?.resumesSessionViaAcpLoad);
}

/**
 * Whether this run must be refused outright rather than started cold, to avoid silently
 * answering with none of the conversation's prior turns.
 *
 * The H2 fix (`agent-run-concurrency.ts`) already refuses to pass a stored session id to a run
 * that observes another run already live for the same conversation, so at most one process ever
 * holds `--resume <id>` on one CLI transcript file at a time — necessary, but for a
 * {@link agentCarriesOwnMemory} agent it has a side effect H2 itself never accounted for: the
 * CLIENT (`assistant-transport.ts`'s `startRun`) already decided, independently and before this
 * run was even dispatched, to send ONLY the newest user message instead of the full rendered
 * transcript — trusting THIS run to resume the CLI's own carried memory. If H2 then forces this
 * run cold, the CLI starts a brand-new session whose only input is that bare latest message: the
 * rest of the conversation is gone, silently — no error, and nothing left to react to, since the
 * client already sent what it sent.
 *
 * True only when ALL of:
 *  - `storedSessionId` is non-null — a PRIOR turn already established a session for this
 *    (conversationId, agentId) pair. A genuine first turn (`null`) has no history to lose:
 *    `latestUserPrompt` already IS the whole conversation.
 *  - `hasConcurrentLiveRun` is true — the H2 guard is about to force this run cold despite that
 *    stored session existing.
 *  - `carriesOwnMemory` is true — this agent def is one the client trusts to have stripped the
 *    prompt down to the bare latest message. For any other def the client already sent the full
 *    transcript regardless of what this run does, so forcing it cold loses nothing.
 *
 * @complexity O(1).
 */
export function wouldForcedColdStartLoseConversationContext(input: {
  storedSessionId: string | null;
  hasConcurrentLiveRun: boolean;
  carriesOwnMemory: boolean;
}): boolean {
  return input.storedSessionId !== null && input.hasConcurrentLiveRun && input.carriesOwnMemory;
}
