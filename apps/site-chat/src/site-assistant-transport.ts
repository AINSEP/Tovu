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
 *   reply streams back on that SAME request's response body (`text`/`error`/`end` SSE frames — see
 *   `site-assistant.ts`'s `sse()` helper), and nothing about the run is persisted server-side: there
 *   is no run id to reattach to, and no per-turn conversation memory (the route takes one
 *   `{ message: string }`, not a history). `startRun` below therefore sends only the latest user
 *   turn (`latestUserPromptFromHistory`), not a flattened transcript — `buildTranscript`'s "## user /
 *   ## assistant" replay format is built for a coding-agent transcript, not a natural-language
 *   question, and the system preamble server-side expects the latter (`Visitor: ${message}`).
 *   Follow-up questions therefore do not carry prior turns into the model today; fixing that is a
 *   server-side contract change (giving the route a history param) out of this slice's scope.
 *
 * Because a native `EventSource` cannot POST, the SSE body is parsed by hand off `fetch`'s
 * `ReadableStream`, matching the exact two-line `event:`/`data:` framing `sse()` writes server-side.
 */
import { latestUserPromptFromHistory } from "@jini-ai/chat/core";
import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { ChatTransport, RunHandlers, StartRunInput } from "@jini-ai/chat/react";

const CHAT_URL = "/api/site-assistant/chat";

interface ChatFrameText {
  readonly delta: string;
}
interface ChatFrameError {
  readonly message: string;
}
interface ChatFrameEnd {
  readonly reason: string;
}

/**
 * Parses one `fetch` response body as the `event:`/`data:` SSE framing `sse()` writes
 * (`src/server/modules/site-assistant.ts`), invoking `onFrame` once per complete frame.
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
): Promise<void> {
  const body = response.body;
  if (!body) throw new Error("site assistant response had no stream body");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let event = "message";
      let data: string | null = null;
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice("event:".length).trim();
        else if (line.startsWith("data:")) data = line.slice("data:".length).trim();
      }
      // `sse()` always writes both lines together; a frame with no `data:` line is not one of ours
      // (a proxy keep-alive comment, e.g.) and is skipped rather than handed to `JSON.parse(null)`.
      if (data !== null) onFrame(event, JSON.parse(data));

      boundary = buffer.indexOf("\n\n");
    }
  }
}

/** Tracks the one in-flight fetch per `runId` so `stopRun` can cancel it. Module-scope: the
 *  transport itself is stateless per call, but a cancellation has to reach a specific earlier call. */
const activeRuns = new Map<string, AbortController>();

export function createSiteAssistantTransport(): ChatTransport {
  return {
    async startRun(input: StartRunInput, handlers: RunHandlers): Promise<{ runId: string }> {
      const message = latestUserPromptFromHistory(input.history as ChatMessage[]);
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
      const finish = () => {
        if (settled) return;
        settled = true;
        activeRuns.delete(runId);
        handlers.onDone(collected);
      };

      (async () => {
        try {
          const response = await fetch(CHAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // No credentials, no key: ADR-054 Decision 3 — the visitor never supplies or sees a
            // provider key, and this route requires no admin session either.
            body: JSON.stringify({ message }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { error?: string } | null;
            handlers.onError(new Error(body?.error || `site assistant request failed (${response.status})`));
            finish();
            return;
          }

          await pumpServerSentEvents(response, (event, data) => {
            if (event === "text") {
              const ev: AgentEvent = { kind: "text", text: (data as ChatFrameText).delta };
              collected.push(ev);
              handlers.onEvent(ev);
            } else if (event === "error") {
              handlers.onError(new Error((data as ChatFrameError).message || "site assistant error"));
            } else if (event === "end") {
              void (data as ChatFrameEnd); // reason is server telemetry only; nothing here branches on it.
              finish();
            }
          });
          // Stream ended without an explicit "end" frame (e.g. the connection just closed) —
          // finish anyway so the pane never shows a run stuck "in progress" forever.
          finish();
        } catch (error) {
          // An abort we caused ourselves (stopRun, or the pane unmounting) is not a failure to
          // report — it is the requested outcome, and `res.on("close")` server-side already turned
          // it into a clean upstream cancellation rather than a wasted completed generation.
          if (error instanceof DOMException && error.name === "AbortError") {
            finish();
            return;
          }
          handlers.onError(error instanceof Error ? error : new Error(String(error)));
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
