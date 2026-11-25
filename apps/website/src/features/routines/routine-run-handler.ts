import { redactUserText } from "@jini-ai/chat/core";
import type { ChatStoreFactory } from "@jini-ai/chat/store/runtime";
import type { RoutineRun, RoutineRunCompletion, RoutineRunHandler, RoutineRunHandlerStart } from "@jini-ai/daemon";
import type { AgentSummary } from "@jini-ai/daemon/http";
import { routineUserTurnId, type RoutineActor, type RoutineRunMarker } from "@tovu/contracts/routines";

/**
 * @file Jini's `RoutineRunHandler` for Tovu (P3-T2.T): a routine fire is an ordinary OWNER CHAT turn.
 *
 * Why it only decides and delegates: the handler validates who and what may run, writes the titled
 * conversation and the ordinary stub, then hands the accepted turn to the common owner-chat acceptance
 * seam. It never calls an executor, so a routine run gets the same durable acceptance, recovery and
 * tool-access rules as a person typing in the admin chat (one principal, one message identity).
 *
 * Why `prepare` does the work and the returned handle does none: the scheduler may lose the slot claim
 * after the handler returns. A claim loser must have read and written nothing, so every external
 * effect waits for `prepare`, which only runs after the claim is won.
 */

/** The seam this handler needs from `assistant-run-acceptance.ts` (structural, so tests inject fakes). */
export interface RoutineRunStarter {
  acceptOwnerChatRun(
    required: { principalId: string; workspaceId: string; conversationId: string; messageId: string; context: Record<string, unknown> },
    optional?: { agentId?: string; routine?: RoutineRunMarker },
  ): Promise<{ runId: string } | null>;
  watchSettlement(
    required: { principalId: string; workspaceId: string; messageId: string },
    optional?: { signal?: AbortSignal },
  ): Promise<{ status: "completed" | "failed" | "canceled"; text: string }>;
}

export interface RoutineRunHandlerRequired {
  /** Re-resolves the persisted creator as a CURRENT owner of the mounted workspace, or null. */
  owners: { resolveCurrentOwner(required: { creatorId: string }, optional?: Record<string, never>): Promise<RoutineActor | null> };
  agents: { list(required: Record<string, never>, optional?: Record<string, never>): Promise<readonly AgentSummary[]> };
  chatHistory: ChatStoreFactory;
  runStarter: RoutineRunStarter;
  updateRun: (required: { id: string; patch: Partial<RoutineRun> }) => void;
  now: () => number;
  newId: () => string;
  /** The consumed slot's time in the owner's locale, for the catch-up explanation. */
  localeTime: (required: { at: number }, optional?: Record<string, never>) => string;
  catchUpText: (required: { localTime: string }, optional?: Record<string, never>) => string;
  /** `allowCodex` is a test-only override; production leaves it unset so Codex is refused. */
  agentPolicy: { defaultAgentId?: string; allowCodex?: boolean };
  /** P3-T3.T approval projection: an accepted run is tracked until it settles or is discarded. */
  approvals?: {
    track(run: { routineRunId: string; agentRunId: string; messageId: string; principalId: string; workspaceId: string }): void;
    untrack(required: { agentRunId: string }): unknown;
  };
}

export const CODEX_ROUTINE_REFUSAL = "Codex can't run routines yet. Choose another agent.";
const SUMMARY_MAX = 280;
const NO_AGENT = "No local assistant agent is ready to run routines. Sign in to one in the assistant settings.";

/** Collapses whitespace and caps the result at {@link SUMMARY_MAX} characters (ellipsis included). */
export function collapseSummary({ text }: { text: string }, _optional = {}): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= SUMMARY_MAX ? flat : `${flat.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

type Choice = Readonly<{ agentId: string; model: string | null }>;

/** An explicit pick must be usable exactly as asked; there is never a substitute for it. */
function checkExplicit({ agent, id, model, policy }: { agent: AgentSummary | undefined; id: string; model: string | null; policy: RoutineRunHandlerRequired["agentPolicy"] }): Choice {
  if (id === "codex" && !policy.allowCodex) throw new Error(CODEX_ROUTINE_REFUSAL);
  if (!agent || agent.available === false) throw new Error(`The agent "${agent?.name ?? id}" isn't available right now. Choose another agent.`);
  if (agent.authStatus === "missing") throw new Error(`The agent "${agent.name}" isn't signed in. Sign in or choose another agent.`);
  const known = (agent.models ?? []).some((entry) => entry.id === model);
  if (model !== null && !known && !agent.supportsCustomModel) throw new Error(`The model "${model}" isn't available for ${agent.name}. Choose another model.`);
  return { agentId: id, model };
}

/** The routine's pinned agent/model, or the default eligible local CLI when none was pinned. */
export function chooseRoutineAgent(
  { agentId, model, agents }: { agentId: string | null; model: string | null; agents: readonly AgentSummary[] },
  optional: { policy?: RoutineRunHandlerRequired["agentPolicy"] } = {},
): Choice {
  const policy = optional.policy ?? {};
  if (agentId) return checkExplicit({ agent: agents.find((entry) => entry.id === agentId), id: agentId, model, policy });
  const eligible = (agent: AgentSummary) => agent.available !== false && agent.authStatus !== "missing" && (agent.id !== "codex" || policy.allowCodex === true);
  const pick = (policy.defaultAgentId ? agents.find((entry) => entry.id === policy.defaultAgentId && eligible(entry)) : undefined) ?? agents.find(eligible);
  if (!pick) throw new Error(NO_AGENT);
  return checkExplicit({ agent: pick, id: pick.id, model, policy });
}

type Settle = (completion: RoutineRunCompletion) => void;

/** Builds the handler. The returned closures hold all per-run state; nothing is shared between runs. */
export function createRoutineRunHandler(required: RoutineRunHandlerRequired, _optional = {}): RoutineRunHandler {
  return async ({ routine, runId, catchUp = false, slotAt = null }) => {
    const conversationId = `routine-${runId}`;
    const userMessageId = routineUserTurnId({ marker: { runId, slotAt } }, {});
    const assistantMessageId = required.newId();
    let settle!: Settle;
    const completion = new Promise<RoutineRunCompletion>((resolve) => { settle = resolve; });
    const watch = new AbortController();
    const state: { actor?: RoutineActor; choice?: Choice; prompt?: string; created: boolean; accepted: boolean } = { created: false, accepted: false };
    const marker: RoutineRunMarker = { routineId: routine.id, runId, catchUp, slotAt };

    const handle: RoutineRunHandlerStart = {
      projectId: "", conversationId, agentRunId: "", assistantMessageId, completion,
      prepare: async (run) => {
        // `onCreated` fires right after the conversation exists, so a later failed write can still be cleaned up by `discard`.
        const prepared = await prepareRoutineRun({ required, routine, run, ids: { conversationId, userMessageId, assistantMessageId }, catchUp, slotAt,
          onCreated: (actor) => { state.actor = actor; state.created = true; } });
        Object.assign(state, prepared);
      },
      start: async () => {
        const { actor, choice, prompt } = state;
        if (!actor || !choice || prompt === undefined) throw new Error("The routine run was not prepared.");
        const run = await required.runStarter.acceptOwnerChatRun({ principalId: actor.principalId, workspaceId: actor.workspaceId,
          conversationId, messageId: assistantMessageId, context: { prompt, conversationId, assistantMessageId, ...(choice.model ? { model: choice.model } : {}) } },
          { agentId: choice.agentId, routine: marker });
        if (!run) throw new Error("The assistant could not start this routine run.");
        state.accepted = true;
        handle.agentRunId = run.runId;
        // Tracked only after acceptance: approval can be projected for exactly this run and attempt.
        required.approvals?.track({ routineRunId: runId, agentRunId: run.runId, messageId: assistantMessageId, principalId: actor.principalId, workspaceId: actor.workspaceId });
        void completion.then(() => required.approvals?.untrack({ agentRunId: run.runId }));
        void watchToCompletion({ required, actor, assistantMessageId, signal: watch.signal, settle });
      },
      discard: () => {
        watch.abort();
        settle({ status: "canceled" });
        if (state.created && !state.accepted && state.actor) void deleteQuietly({ required, actor: state.actor, conversationId });
      },
      discardUnstarted: () => { watch.abort(); settle({ status: "canceled" }); },
    };
    return handle;
  };
}

/** Everything that touches the outside world, run only after the slot claim was won. */
async function prepareRoutineRun({ required, routine, run, ids, catchUp, slotAt, onCreated }: {
  required: RoutineRunHandlerRequired; routine: Parameters<RoutineRunHandler>[0]["routine"]; run: RoutineRun;
  ids: { conversationId: string; userMessageId: string; assistantMessageId: string }; catchUp: boolean; slotAt: number | null;
  onCreated: (actor: RoutineActor) => void;
}): Promise<{ actor: RoutineActor; choice: Choice; prompt: string }> {
  const creatorId = routine.creatorId;
  const actor = creatorId ? await required.owners.resolveCurrentOwner({ creatorId }, {}) : null;
  if (!actor) throw new Error("This routine's owner no longer manages this site, so it did not run.");
  const choice = chooseRoutineAgent({ agentId: routine.agentId, model: routine.model ?? null, agents: await required.agents.list({}, {}) }, { policy: required.agentPolicy });
  // The actual choice is recorded before launch so a crash after acceptance still shows what ran.
  run.agentId = choice.agentId; run.model = choice.model; run.conversationId = ids.conversationId; run.assistantMessageId = ids.assistantMessageId;
  required.updateRun({ id: run.id, patch: { agentId: choice.agentId, model: choice.model, conversationId: ids.conversationId, assistantMessageId: ids.assistantMessageId } });
  const redacted = redactUserText({ text: routine.prompt }).text;
  const prompt = catchUp && slotAt !== null ? `${required.catchUpText({ localTime: required.localeTime({ at: slotAt }, {}) }, {})}\n\n${redacted}` : redacted;
  const store = required.chatHistory({ kind: "user", workspaceId: actor.workspaceId, userId: actor.principalId });
  await store.create({ id: ids.conversationId, title: routine.name, titleSource: "fallback" }, {});
  onCreated(actor);
  const at = required.now();
  const user = await store.appendMessage({ conversationId: ids.conversationId, message: { id: ids.userMessageId, role: "user", content: prompt, createdAt: at } }, {});
  const stub = await store.appendMessage({ conversationId: ids.conversationId, message: { id: ids.assistantMessageId, role: "assistant", content: "", agentId: choice.agentId, runStatus: "queued", createdAt: at } }, {});
  if (!user || !stub) throw new Error("The routine conversation could not be saved, so the run did not start.");
  return { actor, choice, prompt };
}

/** Settles the run's completion from the owned durable run; never rejects. */
async function watchToCompletion({ required, actor, assistantMessageId, signal, settle }: {
  required: RoutineRunHandlerRequired; actor: RoutineActor; assistantMessageId: string; signal: AbortSignal; settle: Settle;
}): Promise<void> {
  try {
    const result = await required.runStarter.watchSettlement({ principalId: actor.principalId, workspaceId: actor.workspaceId, messageId: assistantMessageId }, { signal });
    const summary = collapseSummary({ text: result.text });
    if (result.status === "completed") settle({ status: "succeeded", summary });
    else if (result.status === "canceled") settle({ status: "canceled", summary });
    else settle({ status: "failed", summary, error: "The assistant could not finish this routine run." });
  } catch {
    settle({ status: "failed", error: "Tovu could not read the result of this routine run." });
  }
}

async function deleteQuietly({ required, actor, conversationId }: { required: RoutineRunHandlerRequired; actor: RoutineActor; conversationId: string }): Promise<void> {
  try { await required.chatHistory({ kind: "user", workspaceId: actor.workspaceId, userId: actor.principalId }).delete({ id: conversationId }, {}); } catch { /* best effort: a stray empty chat is harmless */ }
}
