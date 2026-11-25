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
import type { ChatTransport, RunHandlers, StartRunInput } from "@jini-ai/chat/react";
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

export interface SiteAssistantTransportOptions {
  readonly frontend?: {
    headers(): Promise<Record<string, string>>;
    finish(args: { navigation: boolean; messages?: ChatMessage[] }): void;
  };
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
/** `turnId` is minted once in `startRun`, so every POST made for this run (a retry included) reuses it. */
type RunArgs = { input: StartRunInput; handlers: RunHandlers; options: Options; runId: string; turnId: string; controller: AbortController; idleTimeoutMs: number; fetchChat: typeof fetch };

/** Run bookkeeping: one settle, one error at most, and the idle timer. Settled runs stay silent. */
function createRunLifecycle({ input, handlers, options, runId, controller, idleTimeoutMs }: RunArgs, _options = {}) {
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
}
type EventContext = { life: RunLifecycle; args: RunArgs; wire: VisitorWire };

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

function handleRunFinished({ event, ctx }: { event: Extract<AGUIEvent, { type: EventType.RUN_FINISHED }>; ctx: EventContext }, _options = {}) {
  if (!ctx.wire.started || !matchesActiveRun({ event, wire: ctx.wire })) return;
  const { input, options, runId } = ctx.args;
  const { life } = ctx;
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

/** Machine events are intercepted before reduction and never enter the transcript. */
function handleAgUiEvent({ event, ctx }: { event: AGUIEvent; ctx: EventContext }, _options = {}) {
  // End is terminal even for frames coalesced into the same response chunk.
  if (ctx.life.flags.settled) return;
  if (event.type === EventType.RUN_STARTED) {
    if (matchesActiveRun({ event, wire: ctx.wire })) ctx.wire.started = true;
  } else if (event.type === EventType.RUN_FINISHED) {
    handleRunFinished({ event, ctx });
  } else if (event.type === EventType.RUN_ERROR) {
    handleRunError({ event, ctx });
  } else if (event.type === EventType.CUSTOM) {
    // Confirmation directives go to their receiver; retired/unknown machine directives
    // never enter the visitor transcript either way.
    // Any other CUSTOM name is ignored: arbitrary CUSTOM data cannot drive the browser.
    if (event.name === "client_directive") consumeToolConfirmation({ data: event.value, settled: false, receive: ctx.args.options.onToolConfirmation });
  } else if (event.type === EventType.TEXT_MESSAGE_START || event.type === EventType.TEXT_MESSAGE_CONTENT || event.type === EventType.TEXT_MESSAGE_END) {
    handleTextEvent({ event, ctx });
  } else {
    // Ignore event kinds outside this transport's protocol.
  }
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
    const frontendHeaders = await args.options.frontend?.headers() ?? {};
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
      await failOnRefusal({ response, life });
      // The run is already settled with the refusal; this only stops the agent from reading a body.
      throw new Error("refused before streaming");
    }
    wire.streaming = true;
    return response;
  };
}

function handleStreamFailure({ error, ctx }: { error: unknown; ctx: EventContext }, _options = {}) {
  const { life, args, wire } = ctx;
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
async function performRun({ args, life, runInput }: { args: RunArgs; life: RunLifecycle; runInput: RunAgentInput }, _options = {}) {
  // Armed before headers: a server that never answers is as stuck as one that stops mid-reply.
  life.armIdleTimer();
  const wire: VisitorWire = { threadId: runInput.threadId, runId: runInput.runId, started: false, streaming: false,
    reduction: createAgUiToAgentTranslationState({ customEventNames: UNCONSULTED_CUSTOM_EVENT_NAMES }) };
  const ctx: EventContext = { life, args, wire };
  // Any received bytes (a heartbeat or half a frame) restart the idle timer, not only whole events.
  const agent = createAgUiFetchAgent({ request: createVisitorRequest({ ctx }) }, { abortController: args.controller, onBytes: life.armIdleTimer });
  await agent.run(runInput).subscribe({
    next: (event) => handleAgUiEvent({ event, ctx }),
    error: (error) => handleStreamFailure({ error, ctx }),
    // A body that ends without RUN_FINISHED or RUN_ERROR was interrupted: partial text is not a
    // successful reply, so it is never saved as one.
    complete: () => {
      life.fail({ error: UNCLASSIFIED_FAILURE_REASON });
      life.finish();
    },
  });
}

/**
 * Every failure a visitor can hit — non-ok HTTP (incl. the server's JSON `{ error }`), a
 * `RUN_ERROR`, a network/stream failure, a stream that ends with no terminal or no reply, or
 * {@link IDLE_TIMEOUT_MS} of silence — reaches `onError` exactly once, worded by
 * `visitorFacingError`, and the run always finishes so the composer re-enables for another try.
 */
export function createSiteAssistantTransport(_required: Record<string, never> = {}, options: SiteAssistantTransportOptions = {}): ChatTransport {
  const fetchChat: typeof fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
  const idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const newTurnId = options.newTurnId ?? (() => crypto.randomUUID());
  const threadIdFor = createVisitorThreadIds({ newId: () => crypto.randomUUID() });
  return {
    async startRun(input: StartRunInput, handlers: RunHandlers): Promise<{ runId: string }> {
      const message = latestUserPromptFromHistory({ history: input.history as ChatMessage[] });
      if (!message) throw new Error("no user message to send");

      const runId = crypto.randomUUID();
      const controller = new AbortController();
      activeRuns.set(runId, controller);
      const args: RunArgs = { input, handlers, options, runId, turnId: newTurnId(), controller, idleTimeoutMs, fetchChat };
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
