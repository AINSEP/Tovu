/**
 * @file The PUBLIC site chat's implementation of `@jini-ai/chat/core`'s `ChatTransport` port
 * (ADR-054 Task 2), the browser half of `src/server/modules/site-assistant.ts`.
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
import { latestUserPromptFromHistory } from "@jini-ai/chat/core";
import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { ChatTransport, RunHandlers, StartRunInput } from "@jini-ai/chat/react";

import { NO_REPLY_REASON, visitorFacingError } from "./site-assistant-errors";
import { parseToolConfirmation, type ToolConfirmation } from "./tool-confirmation";

const CHAT_URL = "/api/site-assistant/chat";
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
function priorTurnsBeforeLatestUserMessage(history: ChatMessage[]): ChatMessage[] {
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
function boundHistoryForRequest(history: ChatMessage[]): HistoryTurn[] {
  const prior = priorTurnsBeforeLatestUserMessage(history);
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
interface ChatFrameEnd {
  readonly reason: string;
}

/** SPEC-046 REQ-4: the one new SSE event kind. Carried through `@jini-ai/chat/core`'s `AgentEvent`
 *  via its `{ kind: 'ext', name, data }` escape hatch (`events.ts`'s own doc: "a host can carry its
 *  own product-specific event kinds... through the same envelope without this package knowing about
 *  them") — this is exactly that case, so no fork of chat-core's event union was needed. `data` is
 *  passed through unvalidated at THIS layer; `client-directives.ts`'s `isPageActionDirective` is what
 *  actually narrows it before anything acts on it (see `SiteAssistantWidget.tsx`). */
const CLIENT_DIRECTIVE_EXT_NAME = "client_directive";

/** Parses one complete SSE frame's `event:`/`data:` lines (defaulting `event` to `"message"`). */
function parseSseFrame(frame: string): { event: string; data: string | null } {
  let event = "message";
  let data: string | null = null;
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) data = line.slice("data:".length).trim();
  }
  return { event, data };
}

/**
 * Extracts and dispatches every complete `\n\n`-delimited frame currently in `buffer` via `onFrame`,
 * returning the remaining not-yet-terminated tail for the next read.
 */
function drainCompleteFrames(buffer: string, onFrame: (event: string, data: unknown) => void): string {
  let remaining = buffer;
  let boundary = remaining.indexOf("\n\n");
  while (boundary !== -1) {
    const frame = remaining.slice(0, boundary);
    remaining = remaining.slice(boundary + 2);

    const { event, data } = parseSseFrame(frame);
    // `sse()` always writes both lines together; a frame with no `data:` line is not one of ours
    // (a proxy keep-alive comment, e.g.) and is skipped rather than handed to `JSON.parse(null)`.
    if (data !== null) onFrame(event, JSON.parse(data));

    boundary = remaining.indexOf("\n\n");
  }
  return remaining;
}

/**
 * Parses one `fetch` response body as the `event:`/`data:` SSE framing `sse()` writes
 * (`src/server/modules/site-assistant.ts`), invoking `onFrame` once per complete frame and `onChunk`
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
  response: Response,
  onFrame: (event: string, data: unknown) => void,
  onChunk: () => void,
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
    buffer = drainCompleteFrames(buffer, onFrame);
  }
}

/** Tracks the one in-flight fetch per `runId` so `stopRun` can cancel it. Module-scope: the
 *  transport itself is stateless per call, but a cancellation has to reach a specific earlier call. */
const activeRuns = new Map<string, AbortController>();

export interface SiteAssistantTransportOptions {
  /** Live UI only: challenges never enter events, persisted messages or provider history. */
  readonly onToolConfirmation?: (required: { directive: ToolConfirmation | null }, optional?: Record<string, never>) => void;
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
      // `input.signal` closes the browser-side subscription (component unmount, pane reset). This
      // backend has no host-side continuation once that happens — the whole run IS this fetch — so
      // unlike the admin transport's `signal` doc, here that also means stopping the run for real.
      input.signal.addEventListener("abort", () => controller.abort());

      const collected: AgentEvent[] = [];
      let settled = false;
      let failed = false;
      let replied = false;
      let timedOut = false;
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const armIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { timedOut = true; controller.abort(); }, idleTimeoutMs);
      };
      // Settled runs stay silent: an error after `end` (a late frame, a reset socket) must not
      // paint a failure under a reply the visitor already has.
      const fail = (error: unknown) => {
        if (settled) return;
        failed = true;
        handlers.onError(visitorFacingError({ error }));
      };
      // `expectReply: false` only for an abort: a visitor's own Stop is not a missing reply.
      const finish = ({ expectReply = true }: { expectReply?: boolean } = {}) => {
        if (settled) return;
        if (expectReply && !failed && !replied) fail(NO_REPLY_REASON);
        settled = true;
        options.onToolConfirmation?.({ directive: null });
        clearTimeout(idleTimer);
        activeRuns.delete(runId);
        handlers.onDone(collected);
      };

      (async () => {
        try {
          armIdleTimer();
          const response = await fetchChat(CHAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // No credentials, no key: ADR-054 Decision 3 — the visitor never supplies or sees a
            // provider key, and this route requires no admin session either.
            body: JSON.stringify({ message, history: boundHistoryForRequest(input.history as ChatMessage[]) }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { error?: string } | null;
            fail(new Error(body?.error || `site assistant request failed (${response.status})`));
            finish();
            return;
          }

          await pumpServerSentEvents(response, (event, data) => {
            if (event === "text") {
              const ev: AgentEvent = { kind: "text", text: (data as ChatFrameText).delta };
              if (ev.text.trim()) replied = true;
              collected.push(ev);
              handlers.onEvent(ev);
            } else if (event === "error") {
              fail(new Error((data as ChatFrameError).message || "site assistant error"));
            } else if (event === "end") {
              void (data as ChatFrameEnd); // reason is server telemetry only; nothing here branches on it.
              finish();
            } else if (event === "client_directive") {
              if (consumeToolConfirmation({ data, settled, receive: options.onToolConfirmation })) return;
              const ev: AgentEvent = { kind: "ext", name: CLIENT_DIRECTIVE_EXT_NAME, data };
              // A page action alone (e.g. "take me there") is a real answer, not an empty reply.
              replied = true;
              collected.push(ev);
              handlers.onEvent(ev);
            }
          }, armIdleTimer);
          // Stream ended without an explicit "end" frame (e.g. the connection just closed) —
          // finish anyway so the pane never shows a run stuck "in progress" forever.
          finish();
        } catch (error) {
          // An abort we caused ourselves (stopRun, or the pane unmounting) is not a failure to
          // report — it is the requested outcome, and `res.on("close")` server-side already turned
          // it into a clean upstream cancellation rather than a wasted completed generation. The
          // idle timer's abort is the exception: the visitor asked nothing to stop, so say why.
          if (error instanceof DOMException && error.name === "AbortError") {
            if (timedOut) fail(TIMEOUT_REASON);
            finish({ expectReply: false });
            return;
          }
          fail(error);
          finish();
        }
      })();

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
