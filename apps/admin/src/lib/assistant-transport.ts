import { createAssistantTransportClient } from "@jini-ai/chat/transports/http";
import type { ChatMessage, StartRunInput } from "@jini-ai/chat/core";
import type { ExecutionConfig } from "@jini-ai/ui";
import { promptWithSelectedSkills } from "@/features/plugins/selected-skills";
import { browserQueuedStartPorts, startQueuedDaemonRun } from "./queued-daemon-start";
import { withAcceptanceCancellation } from "./acceptance-cancellation";
import { browserDurableSubscriptionPorts, durableRunBindings, followDurableRun } from "./durable-run-subscription";
import { agUiRunClient } from "./assistant-transport-ag-ui";
import { RUN_NOTICES } from "@tovu/assistant-run-events";
import { adminStreamActivity, trackTransportActivity, type StreamActivity } from "./stream-activity";
import { uniqueId } from "./unique-id";
export { parseUsageEvent, terminalFailureError, terminalOutcomeNotice, terminalReasonNotice, translateRunAgentPayload } from "@tovu/assistant-run-events";
export { parseFrame } from "./sse-frames";

/** Product endpoints and projections; Jini owns the chat transport lifecycle. */
const RUNS_URL = "/api/runs";
const client = createAssistantTransportClient({ ports: {
 runsUrl: RUNS_URL, byokTurnUrl: "/api/admin/v1/assistant/byok-turn", byokRunIdPrefix: "byok:", notices: RUN_NOTICES,
 fetch: (url, init) => fetch(url, init),
 mintId: () => uniqueId(),
 projectPrompt: ({ prompt, context }) => promptWithSelectedSkills(prompt, context),
 projectInput: ({ input }) => withSelectedSkillGuidance(input),
 bindRun: ({ runId, binding }) => { durableRunBindings.set(runId, binding); },
 runBinding: ({ runId }) => durableRunBindings.get(runId),
 followRun: ({ runId, handlers, signal }) => { followDurableRun({ runId, handlers, signal, binding: durableRunBindings.get(runId), ports: browserDurableSubscriptionPorts({}, {}) }, {}); },
 acceptRun: ({ body, signal, requestSignal, messageId, conversationId }) => withAcceptanceCancellation({ signal,
  start: () => startQueuedDaemonRun({ body, signal: requestSignal, ports: browserQueuedStartPorts({}, {}) }, {}),
  cancel: async () => { await fetch(RUNS_URL + "/pending/cancel", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, conversationId }) }); },
 }, {}),
 agUi: agUiRunClient,
} }, {});

export interface CreateTovuAssistantTransportOptions {
  /**
   * Read fresh on every `startRun` call, never captured once — matching `AssistantDock.tsx`'s own
   * `runContext` convention (see that file's doc on why `frontendBindToken` is read the same way):
   * the operator can flip the runtime picker's mode mid-session, and a captured value would keep
   * routing every later turn through whichever mode was selected when the transport was first
   * built (`AssistantDock.tsx` memoizes the transport once, for the reason its own comment gives —
   * rebuilding it would drop in-flight runs).
   */
  getExecutionConfig?: () => ExecutionConfig;
  /**
   * ADR-059's AG-UI canary toggle — deliberately NOT a value on {@link ExecutionConfig}: that type
   * is `@jini-ai/ui`'s own closed `'local-cli' | 'byok'` union, a separate repo/package, and
   * extending it would mean a cross-repo edit this ADR explicitly avoids (Decision 1: "a zero-touch
   * addition to Jini"). Read fresh on every `startRun` call, same "never captured" convention
   * {@link getExecutionConfig} already establishes, for the same reason: an operator can flip this
   * mid-session without rebuilding the memoized transport.
   */
  getAgUiEnabled?: () => boolean;
  /**
   * Agent ids whose own CLI/ACP session already carries multi-turn conversation memory across
   * spawns — `@jini-ai/agent-runtime`'s `resumesSessionViaCli`/`resumesSessionViaAcpLoad`, projected
   * client-safe as `AssistantAgentSummary.carriesOwnMemory` (`assistant/agents.ts`, Tovu server-side).
   * {@link runPrompt}'s own doc has the full "used to send only the newest message" background; this
   * option is the inverse regression it introduced for exactly these agents — see `startRun`'s Local
   * CLI branch below, which resends the doc's own contract instead of the full transcript ONLY for an
   * agentId this set contains: "the caller trusts this adapter's CLI to carry its own multi-turn
   * conversation memory... and should skip resending the rendered transcript on follow-up turns"
   * (`types.ts`). Resending it anyway would duplicate everything the daemon's own `--resume`/
   * `session/load` already restores (`agent-session-resume.ts`).
   *
   * Read fresh on every `startRun` call, same "never captured" convention {@link getExecutionConfig}/
   * {@link getAgUiEnabled} already establish: the admin's own `/api/agents` probe resolves
   * asynchronously and can still be in flight when this transport is first built, and an operator can
   * switch the Local CLI agent pick mid-session.
   *
   * Omitted, or an agentId absent from the returned set, keeps today's behavior — the full transcript
   * is sent. That is the SAFE default for a def this option's source has not resolved as resume-capable
   * yet: sending redundant history to a resume-capable def costs extra tokens, but withholding history
   * from a stateless def would silently erase its memory — the two failure directions are not
   * symmetric, so "unknown" must resolve to "send everything," not to "send only the latest message."
   */
  getResumeCapableAgentIds?: () => ReadonlySet<string>;
  /**
   * This pane's conversation id, adopting one if none is active yet —
   * `useAssistantChats.ensureConversationId` (`hooks/use-assistant-chats.hooks.ts`), wired through
   * `AssistantDock`'s `useAssistantTransport`. Awaited by `startRun` ONLY when `input.context` names
   * no conversation, which in practice means the first turn of a chat.
   *
   * Why the transport has to be the one to ask: the admin adopts a conversation lazily, from the
   * first message delta — and `@jini-ai/chat`'s `useChatPane.sendPrompt` freezes `runContext(...)`
   * into `input.context` BEFORE calling `conversation.sendMessage(...)`, the very call that produces
   * that delta. So on turn 1 there is no id to capture yet, and `runContext` (synchronous by
   * contract) has no way to wait for one. `startRun` is the last point in the chain that can still
   * `await`, which makes it the only place the run can acquire the identity its agent-CLI session id
   * gets filed under. Without it, `agent-daemon-server.ts`'s `onStarted` skipped its entire
   * session-capture subscription for turn 1, and turn 2 — sent only the bare latest user message,
   * trusting a resume that had nothing stored — answered with none of the conversation.
   *
   * Contract: resolves `null` rather than rejecting when creation fails. `startRun` treats that as
   * "send the turn anyway, with no conversationId" — one run with no resumable session is a far
   * smaller loss than a run that never happens.
   */
  ensureConversationId?: () => Promise<string | null>;
  /**
   * Writes one user message to durable storage — `useAssistantChats.persistUserTurn`
   * (`hooks/use-assistant-chats.hooks.ts`), wired through `AssistantDock`'s `useAssistantTransport`.
   * Awaited by `startRun` on the Local CLI path before `POST /api/runs`, including a delta's pending
   * PUT. Acceptance persists the same message with its stub if the browser write fails. See
   * {@link persistUserTurnBeforeDispatch} for the defect and the idempotency contract.
   *
   * Optional for transports without the dock's persistence hook; acceptance still receives the
   * exact user message, and the delta-driven `flush` can write the same ID afterward.
   * Its rejection is swallowed at the call site rather than failing the turn.
   */
  persistUserTurn?: (conversationId: string, message: ChatMessage) => Promise<void>;
}

/** Track all execution modes through one host activity owner; dispatch behavior stays in Jini.
 * The first options object is retained for existing dock callers; the second injects adapter ports.
 */
export function createTovuAssistantTransport(options: CreateTovuAssistantTransportOptions = {}, {
 createTransport = client.createAssistantTransport, activity = adminStreamActivity,
}: { createTransport?: typeof client.createAssistantTransport; activity?: StreamActivity } = {}) {
 return trackTransportActivity({ activity, transport: createTransport({ options: jiniHostOptions(options) }, {}) }, {});
}

type JiniHostOptions = NonNullable<Parameters<typeof client.createAssistantTransport>[0]["options"]>;

/**
 * Adapts the dock's host callbacks to Jini's port shape. Jini calls each port as `port({}, {})`;
 * every wrapper re-reads the option on each call and invokes it with exactly the arguments its own
 * signature declares, so a callback with optional parameters never receives Jini's port objects.
 * @param options The dock's callbacks; absent ones stay `undefined` so Jini keeps its defaults.
 * @returns Jini host options. No side effects.
 */
function jiniHostOptions(options: CreateTovuAssistantTransportOptions): JiniHostOptions {
 return {
  getExecutionConfig: options.getExecutionConfig && (() => options.getExecutionConfig!()),
  getAgUiEnabled: options.getAgUiEnabled && (() => options.getAgUiEnabled!()),
  getResumeCapableAgentIds: options.getResumeCapableAgentIds && (() => options.getResumeCapableAgentIds!()),
  ensureConversationId: options.ensureConversationId && (() => options.ensureConversationId!()),
  persistUserTurn: options.persistUserTurn && (({ conversationId, message }) => options.persistUserTurn!(conversationId, message)),
 };
}

/** Provider dispatch receives an augmented copy; persistence/title derivation sees the original. */
function withSelectedSkillGuidance(input: StartRunInput): StartRunInput {
  // Jini refuses a turn with no user message before projecting, so the newest user message exists.
  const userIndex = input.history.map((message) => message.role).lastIndexOf("user");
  return { ...input, history: input.history.map((message, index) => index === userIndex ? { ...message, content: promptWithSelectedSkills(message.content, input.context) } : message) };
}
