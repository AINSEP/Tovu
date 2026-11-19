import type { RunPorts } from './agent-daemon-run-start.js';
import { formatRunEndLogLine, formatRunErrorLogLine } from "./run-log-lines.js";
import { resolveResumeSessionField, agentAcceptsHostMintedSessionId, resolveHostMintedSessionId, resolveNewSessionField } from "#src/assistant/agent-session-preset";
import { resolveStoredSessionId } from "./run-start-decisions.js";

/** A run's session-binding decision: the agent it runs and the session fields handed to the CLI. */
export type RunSessionBinding = {
  readonly agentId: string;
  readonly sessionFields: { resumeSessionId?: string; newSessionId?: string };
};
export function subscribeRunSession(ports: RunPorts, _optional = {}) {
  const { conversationId, runLifecycle, run, idlePark, captureEarlySession, durableMessageId, extractSessionRefFromEndEvent, console } = ports;
  // Session-resume capture (Gap 5, `RunEndPayload.sessionRef` — `@jini-ai/protocol`'s doc on that
  // field): watches this run's own event stream for its terminal `end` event and persists whatever
  // agent-CLI session id it reports, so the NEXT turn in this conversation can resume it instead of
  // spawning cold (`agent-session-resume.ts`). A no-op subscription when `conversationId` is absent
  // — any daemon client other than the admin chat pane, today — since there is nowhere to key the
  // stored id by. Subscribed here, before `agentExecutor.run()` is ever called below, so a run that
  // fails immediately after spawn still has its `end` event observed (`stream()`'s own contract:
  // subscribe-before-replay never loses an event to timing).
  if (conversationId !== undefined) {
    const resolvedConversationId = conversationId;
    void runLifecycle.stream({ runId: run.id, onEvent: (event) => {
      const { agentId } = ports.runState;
      logRunSessionEvent({ ...ports, event, resolvedConversationId });
      // Status carries capture-style locators (Codex/opencode) before end. A killed process must
      // not lose its locator; generation checks also prevent a stale attempt changing the session.
      const releaseSessionSave = idlePark.hold({}, {});
      void captureEarlySession({ event, runId: run.id, conversationId: resolvedConversationId, agentId: agentId }, { durableBinding: durableMessageId !== undefined })
        .catch((error: unknown) => console.error(`[agent-daemon] run ${run.id}: failed to persist agent session id`, error)).finally(releaseSessionSave);
      if (extractSessionRefFromEndEvent({ event: event }, {}) !== undefined) return;
      clearFailedRunResume({ ...ports, event, resolvedConversationId });
    } });
  }
}

function logRunSessionEvent({ event, run, resolvedConversationId, console, runState }: RunPorts & { event: Parameters<Parameters<RunPorts["runLifecycle"]["stream"]>[0]["onEvent"]>[0]; resolvedConversationId: string }, _optional = {}) {
  const { agentId, attemptedResumeSessionId } = runState;
  if (event.kind === "error") {
  console.error(formatRunErrorLogLine({ runId: run.id, payload: event.payload }));
}
// Terminal-outcome log line (2026-09-06 chat-death investigation). This subscription already
// exists, already sees every `end` event, and already has `run.id` in scope — so this is the
// cheapest possible place to write down HOW a run ended. Until now nothing did: the daemon
// logged a run that `failed to start` (see the `.catch` at the bottom of this function) but
// said nothing at all about a run that started fine and then died, which is exactly the case
// an operator cannot otherwise diagnose. `@jini-ai/daemon`'s `finish()` emits this `end` event
// as the ONLY record of the terminal status, the event log backing it is in-memory
// (`createInMemoryEventLog()` above), and the admin client discards the status — so without
// this line the exit code exists nowhere durable and nowhere visible.
if (event.kind === "end") {
  const line = formatRunEndLogLine({ runId: run.id, payload: event.payload, agentId: agentId, conversationId: resolvedConversationId, resumeAttempted: attemptedResumeSessionId !== null });
  if (event.payload.status === "succeeded") console.log(line);
  else console.error(line);
}
}

function clearFailedRunResume({ event, run, resolvedConversationId, console, runState, shouldClearSessionOnFailedResume, idlePark, durableMessageId, routeDeps }: RunPorts & { event: Parameters<Parameters<RunPorts["runLifecycle"]["stream"]>[0]["onEvent"]>[0]; resolvedConversationId: string }, _optional = {}) {
  const { agentId, attemptedResumeSessionId } = runState;
  // H1 fix: this run attempted `--resume <attemptedResumeSessionId>` and reached its terminal
  // `end` event without the CLI ever reconfirming a session id — the stored id is unconfirmed
  // at best, and per this repo's own daemon-restarted-from-a-different-cwd hazard, frequently
  // dead. Clear it so the NEXT turn falls back to a cold start instead of retrying the same
  // dead id forever. See `shouldClearSessionOnFailedResume`'s own doc for the full condition.
  if (attemptedResumeSessionId !== null && shouldClearSessionOnFailedResume({ event: event, attemptedResumeSessionId: attemptedResumeSessionId }, {})) {
  const releaseSessionClear = idlePark.hold({}, {});
  const cleared = durableMessageId && routeDeps.chatRunLedger.durable
    ? routeDeps.chatRunLedger.durable.clearSession({ runId: run.id, sessionId: attemptedResumeSessionId }, {})
    : routeDeps.agentSessions.clearSessionId({ conversationId: resolvedConversationId, agentId: agentId });
  void cleared.catch((error: unknown) => {
    console.error(`[agent-daemon] run ${run.id}: failed to clear dead agent session id`, error);
  }).finally(releaseSessionClear);
}
}

/** A durable memory attempt reads its site's locator: local memory sessions deliberately
 * survive only this daemon, while early capture writes at the site owner. Called inside the
 * existing conversation lock. O(1), one session lookup; no identity comes from wire fields. */
async function readPriorSessionId(ports: RunPorts, _required: Record<string, never>, _options = {}): Promise<string | null> {
  const { durableMessageId, routeDeps, run, conversationId } = ports;
  const { agentId } = ports.runState;
  if (durableMessageId && routeDeps.getSessionForAttempt) return routeDeps.getSessionForAttempt({ runId: run.id });
  if (conversationId === undefined) return null;
  return routeDeps.agentSessions.getSessionId({ conversationId, agentId });
}
/*
 * This run's entire session-binding decision, in ONE function so it can be handed to
 * `conversationStartLock` as a single critical section (Defect 1, 2026-09-11). It reads the
 * stored id, applies the H2 concurrency gate, refuses the run when starting cold would
 * silently drop history, mints and persists a fresh id when this is a genuine cold start, and
 * returns the `AgentExecutor.run()` session fields that decision produces — `null` meaning
 * "refused, the run is already finished as failed, stop."
 *
 * Extracted as its own function originally for complexity (2026-09-03 — this handler's async
 * continuation was at cyclomatic 11 against this repo's 9 ceiling) so `onStarted`'s own branch
 * count reflects sequencing, not this decision's own branches. Declared and called right here,
 * inline, rather than hoisted to module scope: this file's own wiring tests
 * (`agent-daemon-server.session-resume-wiring.unit.test.ts` and
 * `agent-daemon-server.session-binding-wiring.unit.test.ts`, which prove ordering by reading
 * this file's raw SOURCE rather than importing it — see their docs for why) assert that
 * `routeDeps.agentSessions.getSessionId(`/`liveRunTracker.hasConcurrentLiveRun(`/
 * `routeDeps.agentSessions.setSessionId(` appear, in this relative order, strictly before
 * `agentExecutor.run` below; keeping this body here preserves that ordering byte-for-byte.
 */
export async function resolveSessionBinding(ports: RunPorts, _optional = {}): Promise<RunSessionBinding | null> {
  const { conversationId, recoveryMode, recoverySessionId, waitForStoppingRuns, runLifecycle, run, stoppingRunWaitMs: STOPPING_RUN_WAIT_MS, randomUUID } = ports;
  const { liveRunTracker } = ports.state;
  const { agentId } = ports.runState;
  // Resolved AFTER attachments/prompt, same "no ordering dependency either way" reasoning as
  // the plugin prefix above. Looked up unconditionally (unlike before the H2-context-loss fix
  // below, which needs to know whether a session exists even when `hasConcurrentLiveRun` will
  // refuse to use it) — `null` (no conversationId at all, or nothing on record yet) is what
  // makes `resolveResumeSessionField` a no-op below, so this run starts cold. Since the
  // Defect 1 fix a cold start is no longer id-less: `resolveHostMintedSessionId` below mints
  // one and persists it before the CLI is spawned, which is what this comment used to say was
  // deliberately NOT happening.
  const priorSessionId = await readPriorSessionId(ports, {}, {});
  // Recovery is authoritative about native resume (see `resolveStoredSessionId`).
  const storedSessionId = resolveStoredSessionId({ recoveryMode, recoverySessionId, priorSessionId }, {});
  // A run the user just stopped is still exiting for a few seconds. Wait for it, so a message
  // sent right after Stop resumes the session instead of being refused (2026-09-27).
  if (conversationId !== undefined) {
    await waitForStoppingRuns({ tracker: liveRunTracker, lifecycle: runLifecycle, conversationId, runId: run.id }, { timeoutMs: STOPPING_RUN_WAIT_MS });
  }
  // The H2 fix: refusing to resume when another run for this conversation is already live
  // means at most one process ever holds `--resume <id>` for that CLI session at a time,
  // closing the two-live-`--resume`-processes-on-one-transcript-file hazard even though the
  // two runs' `end` events can still race each other for the store's last write — see
  // `Jini packages/daemon/src/session-coordination.ts`'s own module doc for the full reasoning and why an in-process
  // tracker needs no special handling across a daemon restart.
  const hasConcurrentLiveRun = conversationId !== undefined && liveRunTracker.hasConcurrentLiveRun({ conversationId: conversationId, runId: run.id }, {});

  const refusal = refuseConcurrentMemoryRun({ ...ports, storedSessionId, hasConcurrentLiveRun });
  if (refusal) { await refusal; return null; }

  const effectiveResumeSessionId = hasConcurrentLiveRun ? null : storedSessionId;
  ports.runState.attemptedResumeSessionId = effectiveResumeSessionId;

  /*
   * Defect 1 fix (2026-09-11). BEHAVIOR CHANGE, stated explicitly: a cold start for a def
   * that accepts a host-minted session id now spawns the CLI under an id THIS process chose
   * and wrote down first, instead of letting the CLI choose one and hoping the run survives
   * long enough to report it back on its terminal `end` event.
   *
   * Why the old shape lost conversations: `extractSessionRefFromEndEvent` (the only writer
   * before this) can only run if an `end` event actually arrives. A run killed by a daemon
   * respawn, or one that fails in its first few hundred milliseconds, never produces one —
   * so the conversation stayed unbound even though the CLI had already created a real
   * session, and the NEXT turn started cold and answered with none of the history.
   *
   * The residual risk, disclosed rather than hidden: if the CLI dies before creating its own
   * session file, the id persisted here names a session that does not exist, and the next
   * turn's `--resume` fails. That failure is visible (the run ends failed) and self-healing
   * — `shouldClearSessionOnFailedResume` clears the dead id, so the turn after starts cold.
   * That is a strictly better failure than the silent, permanent history loss it replaces.
   */
  const hostMintedSessionId = resolveHostMintedSessionId({
    conversationId,
    effectiveResumeSessionId,
    acceptsHostMintedSessionId: agentAcceptsHostMintedSessionId({ agentId: agentId }, {}),
    mint: randomUUID,
  }, {});
  const persistence = persistRunSession({ ...ports, hostMintedSessionId });
  if (persistence) await persistence;

  return {
    agentId,
    sessionFields: { ...resolveResumeSessionField({ storedSessionId: effectiveResumeSessionId }, {}), ...resolveNewSessionField({ hostMintedSessionId: hostMintedSessionId }, {}) },
  };
}
function refuseConcurrentMemoryRun(ports: RunPorts & { storedSessionId: string | null; hasConcurrentLiveRun: boolean }, _optional = {}) {
  const { storedSessionId, hasConcurrentLiveRun, conversationId, run, runLifecycle, agentCarriesOwnMemory, wouldForcedColdStartLoseConversationContext, failRunBeforeStart, concurrentRunRefusalMessage: CONCURRENT_RUN_REFUSAL_MESSAGE, console } = ports;
  const { agentId } = ports.runState;
  // H2-context-loss fix: H2 alone silently drops conversation history for a
  // `carriesOwnMemory` agent — see `wouldForcedColdStartLoseConversationContext`'s own doc for
  // the full mechanism. The client already sent only the bare latest message trusting this run
  // to resume; forcing it cold here would answer with none of the conversation `storedSessionId`
  // proves actually exists. Refuse the run outright (same "fail loud, not silently degrade"
  // precedent as the attachment-claim-failure branch above) rather than let the CLI answer
  // blind.
  if (
    wouldForcedColdStartLoseConversationContext({
      storedSessionId,
      hasConcurrentLiveRun,
      carriesOwnMemory: agentCarriesOwnMemory({ agentId: agentId }, {}),
    }, {})
  ) {
    return failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: CONCURRENT_RUN_REFUSAL_MESSAGE }, {}).then(() => {
    console.error(
      `[agent-daemon] run ${run.id}: refused — conversation "${conversationId}" has a live concurrent run holding agent "${agentId}"'s resumable session, and this agent carries its own memory; starting cold would silently drop conversation history`,
    );
    });
  }
}

function persistRunSession(ports: RunPorts & { hostMintedSessionId: string | null }, _optional = {}) {
  const { conversationId, hostMintedSessionId, durableMessageId, routeDeps, run, console } = ports;
  const { agentId } = ports.runState;
  if (conversationId !== undefined && hostMintedSessionId !== null) {
    // Awaited, and inside the conversation lock: the whole point is that the binding is
    // durable BEFORE the CLI is spawned. A failure here is logged and the run continues —
    // losing resumability for one conversation is the pre-fix behavior, where failing the
    // run outright would cost the user a turn over a bookkeeping write.
    const prepared = durableMessageId && routeDeps.chatRunLedger.durable
      ? routeDeps.chatRunLedger.durable.captureSession({ runId: run.id, sessionId: hostMintedSessionId, confirmed: false }, {})
      : routeDeps.agentSessions.setSessionId({ conversationId, agentId, sessionId: hostMintedSessionId });
    return prepared.catch((error: unknown) => {
      console.error(`[agent-daemon] run ${run.id}: failed to persist minted agent session id at dispatch`, error);
    });
  }
}
