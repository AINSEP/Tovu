/**
 * @file The PUBLIC site chat's implementation of `@jini-ai/chat/core`'s `ChatTransport` port
 * (ADR-054 Task 2), the browser half of `apps/website/src/server/runtime/composition/modules/site-assistant.ts`.
 *
 * Deliberately NOT a copy of `apps/admin/src/lib/assistant-transport.ts`, and not only because this
 * bundle must not import admin code at all (enforced by `vite.config.ts`'s `forbidAdminImports`):
 * the two backends speak different protocols end to end.
 *
 * - The admin transport calls `POST /api/runs` (start) then opens a native `EventSource` against
 *   `GET /api/runs/:runId/events` — a persisted, reattachable run behind an admin-session daemon.
 * - This transport calls `POST /api/site-assistant/chat` exactly once per visitor turn, negotiating
 *   AG-UI with the exact `Accept: text/event-stream; agui=1` range and a `RunAgentInput` body
 *   (`buildVisitorRunInput`); the server's `site-assistant-ag-ui.ts` answers on that SAME request's
 *   response body. Nothing about the RUN is persisted server-side: there is still no run id to
 *   reattach to (see `reattachRun` below). The body carries the latest user turn plus, as of SPEC-046
 *   REQ-3, a bounded list of the turns before it, each keeping its own `role` — not a flattened
 *   transcript string the way `buildTranscript`'s "## user / ## assistant" replay format works (that
 *   is built for a coding-agent transcript, not a natural-language question); the server feeds them
 *   to Gemini as real multi-turn `Content` entries (`assistant/site/history.ts`).
 *   `boundHistoryForRequest` below is a bandwidth/politeness courtesy only — the server treats
 *   whatever arrives as untrusted and re-bounds/validates it independently, so this file's caps do
 *   not need to match the server's exactly.
 *
 * A native `EventSource` cannot POST, so the response body is read by Jini's `createAgUiFetchAgent`
 * (the one SSE parser and AG-UI 1.0 validator); this file owns only HTTP, refusals, the idle policy
 * and what each validated event means for the visitor. Old loaded bundles keep the legacy wire,
 * which the server still serves to any request without the AG-UI range.
 */
import { EventType } from "@ag-ui/core";
import type { AGUIEvent, Message, RunAgentInput } from "@ag-ui/core";
import { assistantContentFromEvents, latestUserPromptFromHistory } from "@jini-ai/chat/core";
import type { ChatMessage } from "@jini-ai/chat/core";
import { createAgUiToAgentTranslationState, translateAgUiEventToAgentEvent } from "@jini-ai/chat/core/ag-ui/reduction";
import type { AgUiToAgentTranslationState } from "@jini-ai/chat/core/ag-ui/reduction";
import type { ChatPaneAgentToolAction, ChatTransport, RunHandlers, StartRunInput } from "@jini-ai/chat/react";
import { createAgUiFetchAgent } from "@jini-ai/chat/transports/ag-ui";

import { NO_REPLY_REASON, UNCLASSIFIED_FAILURE_REASON, visitorFacingError } from "./site-assistant-errors";
import { parseToolConfirmation } from "./tool-confirmation";
import type { ToolConfirmationDirective } from "@jini-ai/core/contracts/site/client-directives";
import type { AgentEvent } from "@jini-ai/core/contracts/site/chat-core";

const CHAT_URL = "/api/site-assistant/chat";
/** The only media range the server answers with AG-UI; anything else gets the legacy wire. */
const VISITOR_AG_UI_ACCEPT = "text/event-stream; agui=1";
/** The server emits no usage/status CUSTOM events to visitors, and every CUSTOM event is
 *  intercepted before reduction, so these names are never consulted; they only satisfy the reducer. */
const UNCONSULTED_CUSTOM_EVENT_NAMES = { usage: "usage", status: "status", extensionPrefix: "ext." } as const;
/** Silence (no bytes at all) this long ends the turn with a visible error instead of an endless
 *  "Replying…". The server sends no keep-alive frames, and a reply can pause while it searches
 *  content, so this is generous; any received chunk restarts it. */
const IDLE_TIMEOUT_MS = 90_000;
const TIMEOUT_REASON = "the site took too long to respond";
/** Oldest-dropped-first turn cap and per-turn character cap for the `history` sent alongside a
 *  message — matches `assistant/site/history.ts`'s server-side defaults in VALUE only (the server is
 *  the actual enforcement point; see this file's header). */
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_MESSAGE_CHARS = 2000;

/**
 * `input.history`'s trailing entry is the message currently being sent — `useConversation.ts`'s
 * `sendMessage` builds `history` as `[...priorMessages, userMessage]` before calling `run.start`, and
 * `latestUserPromptFromHistory` extracts that same trailing user turn as `message`. This returns the
 * index of that turn, scanning from the end (the same direction `latestUserPromptFromHistory` scans
 * in) rather than assuming a fixed "drop the last element" so this stays correct even if a future
 * caller's `history` does not end in the user turn.
 */
function latestUserTurnIndex({ history }: { history: ChatMessage[] }, _options = {}): number {
  // Precondition: `history` holds a user turn. `startRun` calls `latestUserPromptFromHistory` first,
  // which throws when there is none and scans for the same condition (last `role === "user"`, from
  // the end) over the same unmutated array — so this scan always stops at an index >= 0. The former
  // "no user turn" fallback (`return history`) was unreachable through the public API and was
  // removed; a caller breaking the precondition now fails fast instead of sending everything.
  let i = history.length - 1;
  while (history[i]!.role !== "user") i -= 1;
  return i;
}

/** Bounds the prior turns sent alongside a message. Not the security boundary (see file header) —
 *  just keeps a long local conversation from ballooning every request's payload. */
function boundHistoryForRequest({ prior }: { prior: ChatMessage[] }, _options = {}): Message[] {
  const recent = prior.length > MAX_HISTORY_MESSAGES ? prior.slice(prior.length - MAX_HISTORY_MESSAGES) : prior;
  return recent
    .filter((m) => m.content.trim().length > 0)
    .map((m): Message => {
      const content = m.content.length > MAX_HISTORY_MESSAGE_CHARS ? m.content.slice(0, MAX_HISTORY_MESSAGE_CHARS) : m.content;
      return m.role === "user" ? { id: m.id, role: "user", content } : { id: m.id, role: "assistant", content };
    });
}

/**
 * The visitor turn as an AG-UI 1.0 `RunAgentInput`: bounded prior turns with their ids and roles,
 * then the latest user turn. `state`, `tools` and `context` are empty because the server owns the
 * provider, catalog and identity; `forwardedProps.turnId` is the one client field it reads, for
 * turn dedupe (`visitor-turn-dedupe.ts`).
 * @complexity O(n) in the history length.
 */
export function buildVisitorRunInput(
  { input, threadId, runId, turnId }: { input: StartRunInput; threadId: string; runId: string; turnId: string },
  _optional: Record<string, never> = {},
): RunAgentInput {
  const history = input.history as ChatMessage[];
  const latest = latestUserTurnIndex({ history });
  return {
    threadId, runId, state: null, tools: [], context: [], forwardedProps: { turnId },
    messages: [
      ...boundHistoryForRequest({ prior: history.slice(0, latest) }),
      { id: history[latest]!.id, role: "user", content: latestUserPromptFromHistory({ history }) },
    ],
  };
}

/** One thread id per mounted conversation: a turn with nothing before it (first mount, or after
 *  "New thread" cleared the transcript) starts a new thread; every later turn reuses it. */
function createVisitorThreadIds({ newId }: { newId: () => string }, _optional = {}) {
  let current: string | null = null;
  return ({ input }: { input: StartRunInput }): string => {
    if (current === null || latestUserTurnIndex({ history: input.history as ChatMessage[] }) === 0) current = newId();
    return current;
  };
}

/** Tracks the one in-flight fetch per `runId` so `stopRun` can cancel it. Module-scope: the
 *  transport itself is stateless per call, but a cancellation has to reach a specific earlier call. */
const activeRuns = new Map<string, AbortController>();

/** The optional page channel of this document (`createVisitorPageControl`), injected by the host. */
export interface VisitorFrontend {
  /** All-or-nothing page binding headers for one turn's run; rejects when attach or rebind failed. */
  headers(required?: { runId?: string; signal?: AbortSignal }): Promise<Record<string, string>>;
  finish(args: { navigation: boolean; messages?: ChatMessage[] }): void;
  /** Live-only: a delivered page action goes here and nowhere else (never events or storage). */
  acceptBrowserInvocation(required: { runId: string; action: ChatPaneAgentToolAction }, optional?: Record<string, never>): void;
}

/** The only tool call this transport hands to the page; every other tool call name is ignored. */
const PAGE_ACTION_TOOL_NAME = "tovu.page_action";
/** Matches the page bridge's own response cap: a reviewed page action is small. */
const MAX_PAGE_ACTION_ARGS_CHARS = 96_000;

/**
 * Losing the optional page channel does not make a visitor's question unanswerable: a failed attach
 * or rebind (the page control already closed and forgot that binding) sends this turn without any
 * page header, and a Stop during the attach resolves at once so the caller can recheck its signal.
 */
export async function resolvePageHeadersForTurn(
  { frontend, signal, runId }: { frontend: VisitorFrontend | undefined; signal: AbortSignal; runId: string },
  _optional = {},
): Promise<Record<string, string>> {
  if (!frontend || signal.aborted) return {};
  let onAbort = () => {};
  const stopped = new Promise<Record<string, string>>((resolve) => { onAbort = () => resolve({}); });
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([frontend.headers({ runId, signal }).catch(() => ({})), stopped]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export interface SiteAssistantTransportOptions {
  readonly frontend?: VisitorFrontend;
  /** Live UI only: challenges never enter events, persisted messages or provider history. */
  readonly onToolConfirmation?: (required: { directive: ToolConfirmationDirective | null }, optional?: Record<string, never>) => void;
  /** Mints the one turn id a visitor message keeps across every automatic retry of its POST, so the
   *  server can refuse a retry of a turn it already admitted (`visitor-turn-dedupe.ts`). Defaults to
   *  `crypto.randomUUID`. */
  readonly newTurnId?: () => string;
  /** Defaults to the global `fetch`, resolved per call. */
  readonly fetch?: typeof fetch;
  /** Defaults to {@link IDLE_TIMEOUT_MS}. */
  readonly idleTimeoutMs?: number;
}

/** Consume the human-only envelope even when malformed or late. It must never fall through into
 * transcript events, session persistence or a later provider history.
 */
function consumeToolConfirmation({ data, settled, receive }: {
  data: unknown; settled: boolean; receive: SiteAssistantTransportOptions['onToolConfirmation'];
}, _options = {}): boolean {
  if (!data || typeof data !== 'object' || (data as { kind?: unknown }).kind !== 'tool_confirmation') return false;
  const directive = parseToolConfirmation({ value: data });
  if (directive && !settled) receive?.({ directive });
  return true;
}

type Options = SiteAssistantTransportOptions;
/** One live approval's correlators and its single answer. Memory only: the pause is a one-use
 *  right to answer an already-running call, and the challenge addresses that decision but cannot
 *  authenticate it, so it never enters events, persisted messages, provider history or storage. */
interface ParkedApproval { readonly ctx: EventContext; answer?: Promise<boolean> }
/** Host-scoped (one per transport), keyed by challenge id. */
type Approvals = Map<string, ParkedApproval>;
/** `turnId` is minted once in `startRun`, so every POST made for this run (a retry included) reuses it. */
type RunArgs = { input: StartRunInput; handlers: RunHandlers; options: Options; runId: string; turnId: string; controller: AbortController; idleTimeoutMs: number; fetchChat: typeof fetch; approvals: Approvals };

/** Run bookkeeping: one settle, one error at most, and the idle timer. Settled runs stay silent. */
function createRunLifecycle({ input, handlers, options, runId, controller, idleTimeoutMs, approvals }: RunArgs, _options = {}) {
  const collected: AgentEvent[] = [];
  const flags = { settled: false, failed: false, replied: false, timedOut: false };
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  // `input.signal` closes the browser-side subscription (component unmount, pane reset). This
  // backend has no host-side continuation once that happens — the whole run IS this fetch — so
  // unlike the admin transport's `signal` doc, here that also means stopping the run for real.
  const abort = () => controller.abort();
  const armIdleTimer = () => {
    // The response can keep delivering bytes after its terminal frame.
    if (flags.settled) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { flags.timedOut = true; controller.abort(); }, idleTimeoutMs);
  };
  // Settled runs stay silent: an error after `end` (a late frame, a reset socket) must not
  // paint a failure under a reply the visitor already has.
  const fail = ({ error }: { error: unknown }, _failOptions = {}) => {
    if (flags.settled) return;
    flags.failed = true;
    handlers.onError(visitorFacingError({ error }));
  };
  // `expectReply: false` only for an abort: a visitor's own Stop is not a missing reply.
  const finish = ({ expectReply = true }: { expectReply?: boolean } = {}) => {
    if (flags.settled) return;
    if (expectReply && !flags.failed && !flags.replied) fail({ error: NO_REPLY_REASON });
    flags.settled = true;
    options.onToolConfirmation?.({ directive: null });
    clearTimeout(idleTimer);
    input.signal.removeEventListener("abort", abort);
    activeRuns.delete(runId);
    // A settled turn has nothing left to answer: drop its live approvals with it.
    for (const [id, parked] of approvals) if (parked.ctx.args.runId === runId) approvals.delete(id);
    handlers.onDone(collected);
  };
  input.signal.addEventListener("abort", abort);
  return { collected, flags, armIdleTimer, fail, finish };
}
type RunLifecycle = ReturnType<typeof createRunLifecycle>;

/** The active request's correlators. Events for another run, and events before this run's own
 *  `RUN_STARTED`, are ignored rather than trusted. */
interface VisitorWire {
  readonly threadId: string;
  readonly runId: string;
  readonly reduction: AgUiToAgentTranslationState;
  started: boolean;
  streaming: boolean;
  /** This segment ended with an approval interrupt: its body closing is not a lost terminal. */
  interrupted: boolean;
  /** `tovu.page_action` calls opened on this segment, by tool call id, with their arguments so far. */
  readonly toolCalls: Map<string, string>;
}
/** `accepted` reports whether a resume segment's POST was taken; the first report wins. */
type EventContext = { life: RunLifecycle; args: RunArgs; wire: VisitorWire; accepted?: (ok: boolean) => void };

function matchesActiveRun({ event, wire }: { event: { threadId: string; runId: string }; wire: VisitorWire }, _options = {}): boolean {
  return event.threadId === wire.threadId && event.runId === wire.runId;
}

/** Text events go through Jini's reduction; only text reaches the transcript, never its step markers. */
function handleTextEvent({ event, ctx }: { event: AGUIEvent; ctx: EventContext }, _options = {}) {
  if (!ctx.wire.started) return;
  const reduced = translateAgUiEventToAgentEvent({ event: event as Parameters<typeof translateAgUiEventToAgentEvent>[0]["event"], state: ctx.wire.reduction });
  for (const ev of reduced) {
    if (ev.kind !== "text") continue;
    if (ev.text.trim()) ctx.life.flags.replied = true;
    ctx.life.collected.push(ev);
    ctx.args.handlers.onEvent(ev);
  }
}

/**
 * The standard AG-UI interrupt outcome for a visitor approval, as the live card's directive.
 * `undefined` means an ordinary terminal; `{ directive: null }` an interrupt this page cannot answer.
 */
function readApprovalInterrupt({ event }: { event: Extract<AGUIEvent, { type: EventType.RUN_FINISHED }> }, _options = {}): { directive: ToolConfirmationDirective | null } | undefined {
  const outcome = (event as { outcome?: { type?: unknown; interrupts?: unknown } }).outcome;
  if (outcome?.type !== "interrupt") return undefined;
  const interrupts = Array.isArray(outcome.interrupts) ? outcome.interrupts as { id?: unknown; reason?: unknown; message?: unknown }[] : [];
  const first = interrupts.find((interrupt) => interrupt?.reason === "confirmation");
  // The server words the interrupt as "title: summary"; the card shows them as two parts.
  const message = typeof first?.message === "string" ? first.message : "";
  const split = message.indexOf(": ");
  const [title, summary] = split < 0 ? [message, ""] : [message.slice(0, split), message.slice(split + 2)];
  return { directive: parseToolConfirmation({ value: { kind: "tool_confirmation", challengeId: first?.id, title, summary } }) };
}

/** Park the turn on a live approval: the logical turn stays busy across segments until a resume
 *  segment settles it, Stop/unmount/idle aborts it, or the server refuses the answer. */
function parkApproval({ directive, ctx }: { directive: ToolConfirmationDirective; ctx: EventContext }, _options = {}) {
  const { args, life } = ctx;
  ctx.wire.interrupted = true;
  const parked: ParkedApproval = { ctx };
  args.approvals.set(directive.challengeId, parked);
  // No request is in flight while the visitor decides, so nothing else would settle an abort
  // (Stop, unmount, or the idle timer still armed from the last byte) until they answer.
  args.controller.signal.addEventListener("abort", () => {
    if (parked.answer) return;
    if (life.flags.timedOut) life.fail({ error: TIMEOUT_REASON });
    life.finish({ expectReply: false });
  }, { once: true });
  args.options.onToolConfirmation?.({ directive });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The delivered action, only when it names its own tool call: a model call id is not a capability. */
function readPageAction({ toolCallId, json }: { toolCallId: string; json: string }, _options = {}): ChatPaneAgentToolAction | undefined {
  let value: unknown;
  try { value = JSON.parse(json); } catch { return undefined; }
  if (!isRecord(value) || value.invocationId !== toolCallId) return undefined;
  if (typeof value.capabilityId !== "string" || !isRecord(value.input)) return undefined;
  return { invocationId: toolCallId, capabilityId: value.capabilityId, input: value.input };
}

type ToolCallEvent = Extract<AGUIEvent, { type: EventType.TOOL_CALL_START | EventType.TOOL_CALL_ARGS | EventType.TOOL_CALL_END }>;

/**
 * The model can request an effect but cannot deliver one: only a complete `tovu.page_action` the
 * server projected onto this validated segment reaches the page control, under the logical run id
 * the page bound, and as live-only data — it never enters events, the transcript or storage.
 */
function handleToolCallEvent({ event, ctx }: { event: ToolCallEvent; ctx: EventContext }, _options = {}) {
  const { wire } = ctx;
  if (!wire.started || wire.interrupted) return;
  if (event.type === EventType.TOOL_CALL_START) {
    if (event.toolCallName === PAGE_ACTION_TOOL_NAME) wire.toolCalls.set(event.toolCallId, "");
    return;
  }
  const soFar = wire.toolCalls.get(event.toolCallId);
  if (soFar === undefined) return;
  if (event.type === EventType.TOOL_CALL_ARGS) {
    const next = soFar + event.delta;
    if (next.length > MAX_PAGE_ACTION_ARGS_CHARS) wire.toolCalls.delete(event.toolCallId);
    else wire.toolCalls.set(event.toolCallId, next);
    return;
  }
  wire.toolCalls.delete(event.toolCallId);
  const action = readPageAction({ toolCallId: event.toolCallId, json: soFar });
  if (action) ctx.args.options.frontend?.acceptBrowserInvocation({ runId: ctx.args.runId, action });
}

function handleRunFinished({ event, ctx }: { event: Extract<AGUIEvent, { type: EventType.RUN_FINISHED }>; ctx: EventContext }, _options = {}) {
  if (!ctx.wire.started || !matchesActiveRun({ event, wire: ctx.wire })) return;
  const { input, options, runId } = ctx.args;
  const { life } = ctx;
  // Handled before ordinary terminal processing: an interrupt is a pause, not a completed reply.
  const interrupt = readApprovalInterrupt({ event });
  if (interrupt?.directive) return parkApproval({ directive: interrupt.directive, ctx });
  if (interrupt) life.fail({ error: UNCLASSIFIED_FAILURE_REASON });
  life.finish();
  // Only "navigation" releases the deferred page action; any other reason is server telemetry.
  const navigation = (event.result as { reason?: unknown } | undefined)?.reason === "navigation";
  options.frontend?.finish({ navigation, messages: [
    ...input.history, { id: input.assistantMessageId ?? runId, role: 'assistant', content: assistantContentFromEvents({ events: life.collected }), events: life.collected, runStatus: 'succeeded' },
  ] });
}

function handleRunError({ event, ctx }: { event: Extract<AGUIEvent, { type: EventType.RUN_ERROR }>; ctx: EventContext }, _options = {}) {
  // AG-UI 1.0's RUN_ERROR carries no correlators; the settled latch already drops late ones.
  ctx.life.fail({ error: new Error(event.code === "NO_REPLY" ? NO_REPLY_REASON : event.message) });
  ctx.life.finish();
}

function handleCustomEvent({ event, ctx }: { event: Extract<AGUIEvent, { type: EventType.CUSTOM }>; ctx: EventContext }, _options = {}) {
  // Confirmation directives go to their receiver; retired/unknown machine directives
  // never enter the visitor transcript either way.
  // Any other CUSTOM name is ignored: arbitrary CUSTOM data cannot drive the browser.
  if (event.name === "client_directive") consumeToolConfirmation({ data: event.value, settled: false, receive: ctx.args.options.onToolConfirmation });
}

type EventHandler = (args: { event: never; ctx: EventContext }) => void;
/** One handler per event kind this transport speaks; any other kind is ignored. */
const EVENT_HANDLERS: Partial<Record<EventType, EventHandler>> = {
  [EventType.RUN_STARTED]: ({ event, ctx }: { event: Extract<AGUIEvent, { type: EventType.RUN_STARTED }>; ctx: EventContext }) => {
    if (matchesActiveRun({ event, wire: ctx.wire })) ctx.wire.started = true;
  },
  [EventType.RUN_FINISHED]: handleRunFinished,
  [EventType.RUN_ERROR]: handleRunError,
  [EventType.CUSTOM]: handleCustomEvent,
  [EventType.TEXT_MESSAGE_START]: handleTextEvent,
  [EventType.TEXT_MESSAGE_CONTENT]: handleTextEvent,
  [EventType.TEXT_MESSAGE_END]: handleTextEvent,
  [EventType.TOOL_CALL_START]: handleToolCallEvent,
  [EventType.TOOL_CALL_ARGS]: handleToolCallEvent,
  [EventType.TOOL_CALL_END]: handleToolCallEvent,
};

/** Machine events are intercepted before reduction and never enter the transcript. */
function handleAgUiEvent({ event, ctx }: { event: AGUIEvent; ctx: EventContext }, _options = {}) {
  // End is terminal even for frames coalesced into the same response chunk.
  if (ctx.life.flags.settled) return;
  // Ignore event kinds outside this transport's protocol.
  (EVENT_HANDLERS[event.type] as ((args: { event: AGUIEvent; ctx: EventContext }) => void) | undefined)?.({ event, ctx });
}

async function failOnRefusal({ response, life }: { response: Response; life: RunLifecycle }, _options = {}) {
  // A non-JSON refusal still reaches the visitor with its HTTP status below.
  const message = `This site could not answer (HTTP ${response.status})`;
  const body = (await response.json().catch((cause: unknown) => {
    if (cause instanceof SyntaxError) return null;
    throw new Error(message, { cause });
  })) as { error?: string; errorId?: string } | null;
  const reference = body?.errorId ? ` Error ID: ${body.errorId}` : '';
  life.fail({ error: new Error((body?.error || message) + reference) });
  life.finish();
}

/** The fetch agent's injected HTTP: a refusal is settled here, before any stream is read. */
function createVisitorRequest({ ctx }: { ctx: EventContext }, _options = {}) {
  const { args, life, wire } = ctx;
  return async ({ input, signal }: { input: RunAgentInput; signal: AbortSignal }): Promise<Response> => {
    const frontendHeaders = await resolvePageHeadersForTurn({ frontend: args.options.frontend, signal, runId: args.runId });
    // A Stop that raced the page attachment ends the turn; it must never become a page-less chat.
    signal.throwIfAborted();
    const response = await args.fetchChat(CHAT_URL, {
      method: "POST",
      // The exact range is what selects AG-UI; no frontend header may replace it.
      headers: { "Content-Type": "application/json", ...frontendHeaders, Accept: VISITOR_AG_UI_ACCEPT },
      credentials: "same-origin", mode: "same-origin", redirect: "error",
      // ADR-054 Decision 3: only visitor cookie/tab credentials travel here. The provider
      // key stays server-side, and this route requires no admin session.
      body: JSON.stringify(input),
      signal,
    });
    if (!response.ok) {
      ctx.accepted?.(false);
      await failOnRefusal({ response, life });
      // The run is already settled with the refusal; this only stops the agent from reading a body.
      throw new Error("refused before streaming");
    }
    wire.streaming = true;
    ctx.accepted?.(true);
    return response;
  };
}

function handleStreamFailure({ error, ctx }: { error: unknown; ctx: EventContext }, _options = {}) {
  const { life, args, wire } = ctx;
  ctx.accepted?.(false);
  // An abort we caused ourselves (stopRun, or the pane unmounting) is not a failure to
  // report — it is the requested outcome, and `res.on("close")` server-side already turned
  // it into a clean upstream cancellation rather than a wasted completed generation. The
  // idle timer's abort is the exception: the visitor asked nothing to stop, so say why.
  if (args.controller.signal.aborted) {
    if (life.flags.timedOut) life.fail({ error: TIMEOUT_REASON });
    life.finish({ expectReply: false });
    return;
  }
  // Before the body streams, failures are classified (network, refusal body); a broken or
  // invalid stream gets the fixed recovery wording and keeps its cause privately.
  life.fail({ error: wire.streaming ? new Error(UNCLASSIFIED_FAILURE_REASON, { cause: error }) : error });
  life.finish();
}

/** One chat turn end to end: POST, read the AG-UI body, and always settle the run exactly once. */
async function performRun({ args, life, runInput }: { args: RunArgs; life: RunLifecycle; runInput: RunAgentInput }, { accepted }: { accepted?: (ok: boolean) => void } = {}) {
  // Armed before headers: a server that never answers is as stuck as one that stops mid-reply.
  life.armIdleTimer();
  const wire: VisitorWire = { threadId: runInput.threadId, runId: runInput.runId, started: false, streaming: false, interrupted: false, toolCalls: new Map(),
    reduction: createAgUiToAgentTranslationState({ customEventNames: UNCONSULTED_CUSTOM_EVENT_NAMES }) };
  const ctx: EventContext = accepted ? { life, args, wire, accepted } : { life, args, wire };
  // Any received bytes (a heartbeat or half a frame) restart the idle timer, not only whole events.
  const agent = createAgUiFetchAgent({ request: createVisitorRequest({ ctx }) }, { abortController: args.controller, onBytes: life.armIdleTimer });
  await agent.run(runInput).subscribe({
    next: (event) => handleAgUiEvent({ event, ctx }),
    error: (error) => handleStreamFailure({ error, ctx }),
    // A body that ends without RUN_FINISHED or RUN_ERROR was interrupted: partial text is not a
    // successful reply, so it is never saved as one.
    complete: () => {
      if (wire.interrupted) return;
      ctx.accepted?.(false);
      life.fail({ error: UNCLASSIFIED_FAILURE_REASON });
      life.finish();
    },
  });
}

/**
 * The one resume for a parked approval: a fresh run id on the original thread, the original run as
 * parent, and nothing else the server could mistake for a new turn. Read with the same fetch agent
 * and lifecycle, so the resumed segment continues and settles the same logical turn.
 */
function resumeApproval({ parked, challengeId, allow }: { parked: ParkedApproval; challengeId: string; allow: boolean }, _options = {}): Promise<boolean> {
  const { args, life, wire } = parked.ctx;
  const runInput: RunAgentInput = {
    threadId: wire.threadId, runId: crypto.randomUUID(), parentRunId: wire.runId, state: null, messages: [], tools: [], context: [],
    resume: [{ interruptId: challengeId, status: "resolved", payload: allow ? "allow" : "deny" }],
  };
  return new Promise<boolean>((resolve) => { void performRun({ args, life, runInput }, { accepted: resolve }); });
}

/** The visitor transport plus the host-scoped answer for its live approval cards. */
export interface SiteAssistantTransport extends ChatTransport {
  answerApproval(required: { challengeId: string; allow: boolean }, optional?: Record<string, never>): Promise<boolean>;
}

/**
 * Every failure a visitor can hit — non-ok HTTP (incl. the server's JSON `{ error }`), a
 * `RUN_ERROR`, a network/stream failure, a stream that ends with no terminal or no reply, or
 * {@link IDLE_TIMEOUT_MS} of silence — reaches `onError` exactly once, worded by
 * `visitorFacingError`, and the run always finishes so the composer re-enables for another try.
 */
export function createSiteAssistantTransport(_required: Record<string, never> = {}, options: SiteAssistantTransportOptions = {}): SiteAssistantTransport {
  const fetchChat: typeof fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
  const idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const newTurnId = options.newTurnId ?? (() => crypto.randomUUID());
  const threadIdFor = createVisitorThreadIds({ newId: () => crypto.randomUUID() });
  const approvals: Approvals = new Map();
  return {
    /** Unknown, settled or already-answered challenges post nothing new: a double click shares
     *  the first answer's one resume, and there is no automatic retry of an approval. */
    answerApproval({ challengeId, allow }, _optional = {}) {
      const parked = approvals.get(challengeId);
      if (!parked || parked.ctx.life.flags.settled) return Promise.resolve(false);
      parked.answer ??= resumeApproval({ parked, challengeId, allow });
      return parked.answer;
    },

    async startRun(input: StartRunInput, handlers: RunHandlers): Promise<{ runId: string }> {
      const message = latestUserPromptFromHistory({ history: input.history as ChatMessage[] });
      if (!message) throw new Error("no user message to send");

      const runId = crypto.randomUUID();
      const controller = new AbortController();
      activeRuns.set(runId, controller);
      const args: RunArgs = { input, handlers, options, runId, turnId: newTurnId(), controller, idleTimeoutMs, fetchChat, approvals };
      const runInput = buildVisitorRunInput({ input, threadId: threadIdFor({ input }), runId, turnId: args.turnId });
      void performRun({ args, life: createRunLifecycle(args), runInput });
      return { runId };
    },

    /**
     * There is nothing to reattach to: this backend persists no run state once a fetch completes or
     * is aborted (see this file's header). In practice this is never called — the widget never
     * hands `ChatPane` an `initialMessages` entry with a run still "in progress" (no conversation is
     * ever persisted across a page load), which is the only case `ChatPane` calls this for. Resolves
     * immediately with an empty event log rather than throwing, so a call that does happen (a future
     * caller relying on a different assumption) degrades to "nothing more arrived" instead of an
     * unhandled rejection.
     */
    async reattachRun(_runId: string, handlers: RunHandlers): Promise<void> {
      handlers.onDone([]);
    },

    /** No server-side run registry exists to ask — every run's outcome is observed only through its
     *  own `RunHandlers`, never polled after the fact. */
    async fetchRunStatus(): Promise<null> {
      return null;
    },

    async stopRun(runId: string): Promise<void> {
      activeRuns.get(runId)?.abort();
    },
  };
}
