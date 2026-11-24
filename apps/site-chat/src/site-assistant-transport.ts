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
import type { ChatMessage } from "@jini-ai/chat/core";
import type { ChatTransport, RunHandlers, StartRunInput } from "@jini-ai/chat/react";

import { NO_REPLY_REASON, visitorFacingError } from "./site-assistant-errors";
import { parseToolConfirmation } from "./tool-confirmation";
import type { ToolConfirmationDirective } from "@jini-ai/core/contracts/site/client-directives";
import type { AgentEvent } from "@jini-ai/core/contracts/site/chat-core";

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
  readonly onToolConfirmation?: (required: { directive: ToolConfirmationDirective | null }, optional?: Record<string, never>) => void;
