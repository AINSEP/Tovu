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
 * - This transport calls `POST /api/site-assistant/chat` exactly once per visitor turn. The whole
 *   reply streams back on that SAME request's response body (`text`/`error`/`end`/`client_directive`
 *   SSE frames — see `site-assistant.ts`'s `sse()` helper), and nothing about the RUN is persisted
 *   server-side: there is still no run id to reattach to (see `reattachRun` below). `startRun` sends
 *   the latest user
 *   turn as `message` (`latestUserPromptFromHistory`) plus, as of SPEC-046 REQ-3, a bounded `history`
 *   of the turns before it — not a flattened transcript string the way `buildTranscript`'s "## user /
 *   ## assistant" replay format works (that is built for a coding-agent transcript, not a
 *   natural-language question); the server keeps each turn's own `role` and feeds them to Gemini as
 *   real multi-turn `Content` entries (`assistant/site/history.ts`). `boundHistoryForRequest` below
 *   is a bandwidth/politeness courtesy only — the server treats whatever arrives as untrusted and
 *   re-bounds/validates it independently, so this file's caps do not need to match the server's
 *   exactly.
 *
 * Because a native `EventSource` cannot POST, the SSE body is parsed by hand off `fetch`'s
 * `ReadableStream`, matching the exact two-line `event:`/`data:` framing `sse()` writes server-side.
 */
import { assistantContentFromEvents, latestUserPromptFromHistory } from "@jini-ai/chat/core";
import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { ChatTransport, RunHandlers, StartRunInput } from "@jini-ai/chat/react";

import { isNetworkFailure, NO_REPLY_REASON, TRUNCATED_REPLY_MESSAGE, visitorFacingError } from "./site-assistant-errors";
import { parseToolConfirmation, type ToolConfirmation } from "./tool-confirmation";

const CHAT_URL = "/api/site-assistant/chat";
/** Silence (no bytes at all) this long ends the turn with a visible error instead of an endless
 *  "Replying…". The server sends no keep-alive frames, and a reply can pause while it searches
 *  content, so this is generous; any received chunk restarts it. */
const IDLE_TIMEOUT_MS = 90_000;
const TIMEOUT_REASON = "the site took too long to respond";
/** A request that fails before the server sent a single reply byte (dropped connection, 5xx) is tried
 *  once more after this pause — the intermittent first-prompt failure. Never after reply frames began. */
const RETRY_DELAY_MS = 600;
const MAX_MODEL_NAME_CHARS = 80;
/** Oldest-dropped-first turn cap and per-turn character cap for the `history` sent alongside a
 *  message — matches `assistant/site/history.ts`'s server-side defaults in VALUE only (the server is
 *  the actual enforcement point; see this file's header). */
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_MESSAGE_CHARS = 2000;

interface HistoryTurn {
  readonly role: ChatMessage["role"];
  readonly content: string;
}

/**
 * `input.history`'s trailing entry is the message currently being sent — `useConversation.ts`'s
 * `sendMessage` builds `history` as `[...priorMessages, userMessage]` before calling `run.start`, and
 * `latestUserPromptFromHistory` extracts that same trailing user turn as `message`. This returns
 * everything BEFORE it, scanning from the end (the same direction `latestUserPromptFromHistory` scans
 * in) rather than assuming a fixed "drop the last element" so this stays correct even if a future
 * caller's `history` does not end in the user turn.
 */
function priorTurnsBeforeLatestUserMessage({ history }: { history: ChatMessage[] }, _options = {}): ChatMessage[] {
  // Precondition: `history` holds a user turn. `startRun` calls `latestUserPromptFromHistory` first,
  // which throws when there is none and scans for the same condition (last `role === "user"`, from
  // the end) over the same unmutated array — so this scan always stops at an index >= 0. The former
  // "no user turn" fallback (`return history`) was unreachable through the public API and was
  // removed; a caller breaking the precondition now fails fast instead of sending everything.
  let i = history.length - 1;
  while (history[i]!.role !== "user") i -= 1;
  return history.slice(0, i);
}

/** Bounds the prior turns sent alongside a message. Not the security boundary (see file header) —
 *  just keeps a long local conversation from ballooning every request's payload. */
function boundHistoryForRequest({ history }: { history: ChatMessage[] }, _options = {}): HistoryTurn[] {
  const prior = priorTurnsBeforeLatestUserMessage({ history });
  const recent = prior.length > MAX_HISTORY_MESSAGES ? prior.slice(prior.length - MAX_HISTORY_MESSAGES) : prior;
  return recent
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({
      role: m.role,
      content: m.content.length > MAX_HISTORY_MESSAGE_CHARS ? m.content.slice(0, MAX_HISTORY_MESSAGE_CHARS) : m.content,
    }));
}

interface ChatFrameText {
  readonly delta: string;
}
interface ChatFrameError {
  readonly message: string;
}
/** Parses one complete SSE frame's `event:`/`data:` lines (defaulting `event` to `"message"`). */
function parseSseFrame({ frame }: { frame: string }, _options = {}): { event: string; data: string | null } {
  let event = "message";
  let data: string | null = null;
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    if (line.startsWith("data:")) data = line.slice("data:".length).trim();
  }
  return { event, data };
}

/**
 * Extracts and dispatches every complete `\n\n`-delimited frame currently in `buffer` via `onFrame`,
 * returning the remaining not-yet-terminated tail for the next read.
 */
function drainCompleteFrames({ buffer, onFrame }: { buffer: string; onFrame: (event: string, data: unknown) => void }, _options = {}): string {
  let remaining = buffer;
  let boundary = remaining.indexOf("\n\n");
  while (boundary !== -1) {
    const frame = remaining.slice(0, boundary);
    remaining = remaining.slice(boundary + 2);

    const { event, data } = parseSseFrame({ frame });
    // `sse()` always writes both lines together; a frame with no `data:` line is not one of ours
    // (a proxy keep-alive comment, e.g.) and is skipped rather than handed to `JSON.parse(null)`.
    if (data !== null) onFrame(event, JSON.parse(data));

    boundary = remaining.indexOf("\n\n");
  }
  return remaining;
}

/**
 * Parses one `fetch` response body as the `event:`/`data:` SSE framing `sse()` writes
 * (`apps/website/src/server/runtime/composition/modules/site-assistant.ts`), invoking `onFrame` once per complete frame and `onChunk`
 * once per received chunk (any bytes, complete frame or not — the idle timer's "still alive" signal).
 *
 * Hand-rolled rather than a library SSE client because `fetch` is required here (a POST body), and
 * the browser's native `EventSource` only ever issues GET — the same constraint the admin transport
 * itself does not have, since its run-events endpoint IS a GET.
 *
 * @complexity O(n) in response bytes; buffers only the not-yet-terminated tail between reads.
 * @overallScore 100
 */
async function pumpServerSentEvents(
  { response, onFrame, onChunk }: { response: Response; onFrame: (event: string, data: unknown) => void; onChunk: () => void }, _options = {},
): Promise<void> {
  const body = response.body;
  if (!body) throw new Error("site assistant response had no stream body");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk();
    buffer += decoder.decode(value, { stream: true });
    buffer = drainCompleteFrames({ buffer, onFrame });
  }
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
  readonly onToolConfirmation?: (required: { directive: ToolConfirmation | null }, optional?: Record<string, never>) => void;
  /** The model answering this turn: `{ model: null }` when a run starts, then the server's `meta` frame. */
  readonly onModel?: (required: { model: string | null }, optional?: Record<string, never>) => void;
  /** `{ prompt: null }` when a run starts; `{ prompt }` (the visitor's question) when it finally fails, so
   *  the panel can offer a retry. Not called for a cut-off reply, which has nothing to retry. */
  readonly onFailure?: (required: { prompt: string | null }, optional?: Record<string, never>) => void;
  /** Pause before the one automatic retry of a request that failed before any reply bytes. Defaults to {@link RETRY_DELAY_MS}. */
  readonly retryDelayMs?: number;
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
type RunArgs = { input: StartRunInput; handlers: RunHandlers; options: Options; runId: string; controller: AbortController; idleTimeoutMs: number; fetchChat: typeof fetch; prompt: string };

/** Run bookkeeping: one settle, one error at most, and the idle timer. Settled runs stay silent. */
function createRunLifecycle({ input, handlers, options, runId, controller, idleTimeoutMs, prompt }: RunArgs, _options = {}) {
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
    options.onFailure?.({ prompt });
  };
  // The reply stopped at the server's length limit: its partial text stays, with a notice that is not
  // "couldn't get an answer" and no retry offer (resending the same question would cut off again).
  const failTruncated = () => {
    if (flags.settled) return;
    flags.failed = true;
    handlers.onError(new Error(TRUNCATED_REPLY_MESSAGE));
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
  options.onModel?.({ model: null });
  options.onFailure?.({ prompt: null });
  return { collected, flags, armIdleTimer, fail, failTruncated, finish };
}
type RunLifecycle = ReturnType<typeof createRunLifecycle>;

function handleTextFrame({ data, life, handlers }: { data: unknown; life: RunLifecycle; handlers: RunHandlers }, _options = {}) {
  const ev: AgentEvent = { kind: "text", text: (data as ChatFrameText).delta };
  if (ev.text.trim()) life.flags.replied = true;
  life.collected.push(ev);
  handlers.onEvent(ev);
}

function handleEndFrame({ data, life, args }: { data: unknown; life: RunLifecycle; args: RunArgs }, _options = {}) {
  const { input, options, runId } = args;
  // Only `truncated` is branched on: the reply stopped at the length limit, so say so.
  if ((data as { reason?: string }).reason === "truncated") life.failTruncated();
  life.finish();
  options.frontend?.finish({ navigation: (data as { reason?: string }).reason === 'navigation', messages: [
    ...input.history, { id: input.assistantMessageId ?? runId, role: 'assistant', content: assistantContentFromEvents({ events: life.collected }), events: life.collected, runStatus: 'succeeded' },
  ] });
}

/** The server's `meta` frame names the answering model; blank or oversized values are ignored, never shown. */
function handleMetaFrame({ data, args }: { data: unknown; args: RunArgs }, _options = {}) {
  const model = (data as { model?: unknown } | null)?.model;
  if (typeof model !== "string") return;
  const trimmed = model.trim();
  if (trimmed && trimmed.length <= MAX_MODEL_NAME_CHARS) args.options.onModel?.({ model: trimmed });
}

function handleFrame({ event, data, life, args }: { event: string; data: unknown; life: RunLifecycle; args: RunArgs }, _options = {}) {
  // End is terminal even for frames coalesced into the same response chunk.
  if (life.flags.settled) return;
  if (event === "text") {
    handleTextFrame({ data, life, handlers: args.handlers });
  } else if (event === "error") {
    life.fail({ error: new Error((data as ChatFrameError).message || "site assistant error") });
  } else if (event === "end") {
    handleEndFrame({ data, life, args });
  } else if (event === "meta") {
    handleMetaFrame({ data, args });
  } else if (event === "client_directive") {
    // Confirmation directives go to their receiver; retired/unknown machine directives
    // never enter the visitor transcript either way.
    consumeToolConfirmation({ data, settled: life.flags.settled, receive: args.options.onToolConfirmation });
  } else {
    // Ignore event kinds outside this transport's protocol.
  }
}

function postChat({ args, message, frontendHeaders }: { args: RunArgs; message: string; frontendHeaders: Record<string, string> }, _options = {}): Promise<Response> {
  return args.fetchChat(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...frontendHeaders },
    credentials: "same-origin", mode: "same-origin", redirect: "error",
    // ADR-054 Decision 3: only visitor cookie/tab credentials travel here. The provider
    // key stays server-side, and this route requires no admin session.
    body: JSON.stringify({ message, history: boundHistoryForRequest({ history: args.input.history as ChatMessage[] }) }),
    signal: args.controller.signal,
  });
}

/** One POST, retried once — and only before any reply byte exists — on a network failure or a 5xx. */
async function postChatWithOneRetry({ args, message, frontendHeaders }: { args: RunArgs; message: string; frontendHeaders: Record<string, string> }, _options = {}): Promise<Response> {
  const delay = args.options.retryDelayMs ?? RETRY_DELAY_MS;
  let response: Response | undefined;
  try {
    response = await postChat({ args, message, frontendHeaders });
    if (response.status < 500) return response;
    void response.body?.cancel();
  } catch (error) {
    if (!isNetworkFailure({ error })) throw error;
  }
  await new Promise<void>((resolve) => { setTimeout(resolve, delay); });
  return postChat({ args, message, frontendHeaders });
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

/** One chat turn end to end: POST, pump the SSE body, and always settle the run exactly once. */
async function performRun({ args, life, message }: { args: RunArgs; life: RunLifecycle; message: string }, _options = {}) {
  try {
    life.armIdleTimer();
    const frontendHeaders = await args.options.frontend?.headers() ?? {};
    const response = await postChatWithOneRetry({ args, message, frontendHeaders });
    if (!response.ok) {
      await failOnRefusal({ response, life });
      return;
    }
    await pumpServerSentEvents({ response, onFrame: (event, data) => handleFrame({ event, data, life, args }), onChunk: life.armIdleTimer });
    // Stream ended without an explicit "end" frame (e.g. the connection just closed) —
    // finish anyway so the pane never shows a run stuck "in progress" forever.
    life.finish();
  } catch (error) {
    // An abort we caused ourselves (stopRun, or the pane unmounting) is not a failure to
    // report — it is the requested outcome, and `res.on("close")` server-side already turned
    // it into a clean upstream cancellation rather than a wasted completed generation. The
    // idle timer's abort is the exception: the visitor asked nothing to stop, so say why.
    if (error instanceof DOMException && error.name === "AbortError") {
      if (life.flags.timedOut) life.fail({ error: TIMEOUT_REASON });
      life.finish({ expectReply: false });
      return;
    }
    life.fail({ error });
    life.finish();
  }
}

/**
 * Every failure a visitor can hit — non-ok HTTP (incl. the server's JSON `{ error }`), an SSE
 * `error` frame, a network/stream failure, a stream that settles with no reply, or
 * {@link IDLE_TIMEOUT_MS} of silence — reaches `onError` exactly once, worded by
 * `visitorFacingError`, and the run always finishes so the composer re-enables for another try.
 */
export function createSiteAssistantTransport(_required: Record<string, never> = {}, options: SiteAssistantTransportOptions = {}): ChatTransport {
  const fetchChat: typeof fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
  const idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  return {
    async startRun(input: StartRunInput, handlers: RunHandlers): Promise<{ runId: string }> {
      const message = latestUserPromptFromHistory({ history: input.history as ChatMessage[] });
      if (!message) throw new Error("no user message to send");

      const runId = crypto.randomUUID();
      const controller = new AbortController();
      activeRuns.set(runId, controller);
      const args: RunArgs = { input, handlers, options, runId, controller, idleTimeoutMs, fetchChat, prompt: message };
      void performRun({ args, life: createRunLifecycle(args), message });
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
