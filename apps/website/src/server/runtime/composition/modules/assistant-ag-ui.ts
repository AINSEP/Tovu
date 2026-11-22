import type { TrackerSpan } from "@jini-ai/diagnostics/observability";
import type { AgentRunTrackingOutcome } from "@jini-ai/core/contracts/observability";
/**
 * @file ADR-059 — the admin assistant's AG-UI canary transport (Agent-User Interaction Protocol,
 * https://ag-ui.com). Additive only: the existing Local CLI (`assistant.ts`) and BYOK
 * (`assistant-byok.ts`) paths are untouched, and this module changes none of their behavior.
 *
 * This is a translation layer in front of the SAME daemon-backed run lifecycle `assistant.ts`
 * already proxies — NOT a second execution path (`protocol-surfaces.spec.md`'s standing rule for
 * protocol adapters). One request here: (1) starts a real daemon run via
 * `assistant-daemon-client.ts`'s `fetchAgentDaemon`, the identical `POST /api/runs` shape
 * `assistant.ts`'s `proxyRunStart` uses (same `contextRef.principalId` stamping); (2) subscribes to
 * that run's native SSE stream server-side; (3) translates each daemon wire frame into real AG-UI
 * wire events and streams those back on THIS request's own held-open response. Permission checks
 * (`requireAdminSession`) happen before any of that, at route-registration time, not inside the
 * translator as an afterthought.
 *
 * ADR-059 Decision 3 (AMENDED 2026-08-18): built on the real `@ag-ui/core` (types/schema) and
 * `@ag-ui/encoder` (`EventEncoder.encodeSSE`, the same `data: <json>\n\n` framing this route used
 * by hand before) — no `@ag-ui/client` here (that package's `HttpAgent` is a client-side run
 * driver; this file IS the server the client talks to) and no `@copilotkit/*`. Event shapes come
 * straight from `@ag-ui/core`'s own exported `AGUIEvent` union, not a hand-rolled approximation kept
 * in sync by hand.
 *
 * Translation is two composed pure steps, matching ADR-059 Decision 2's "translate `AgentEvent`,
 * not either backend's raw wire format" — one shared pivot, not two adapters that could drift:
 * Jini's `translateRunFrame` (`@jini-ai/chat/core/run-events`) is the ONE reading of a daemon SSE
 * frame (`agent`, `stdout`, `stderr`, `error`, `end`) into `AgentEvent`s plus the run's ending,
 * shared with the browser and the run finalizer, and {@link translateAgentEventToAgUi} maps that
 * shared `AgentEvent` shape onward into AG-UI events. Tovu supplies only the notice words
 * (`RUN_NOTICES`).
 *
 * Client-supplied run/thread ids (`ADR-059` Consequences): unlike the daemon-backed Local CLI path
 * (server-minted, reattachable), AG-UI's own `RunAgentInput` shape expects the CALLER to supply
 * `runId`/`threadId`. This route accepts them from the request body and echoes them verbatim in
 * every emitted event (spec-conformant); if the caller omits either, one is minted here as a
 * fallback so a well-formed-but-partial request still gets a coherent stream. Internally, the
 * client-supplied `runId` is unrelated to the real daemon run id — no mapping between them is kept
 * beyond this one request's lifetime, since there is no reattach story for this path yet (mirrors
 * BYOK's own disclosed "no reattach" limitation).
 *
 * Tovu's agent-selector value arrives as `body.forwardedProps.agentId`, not a top-level
 * `body.agentId` — a real `RunAgentInput` (what the client's `HttpAgent` actually sends) has no
 * top-level `agentId` field; `forwardedProps` is that schema's own documented passthrough
 * extension point. Jini's `resolveAgUiRunInput` (`@jini-ai/chat/server/ag-ui/run-input`) reads it.
 */
import { randomUUID } from "node:crypto";

import type { Express, NextFunction, Request, Response } from "express";

import { EventType } from "@ag-ui/core";
import { EventEncoder } from "@ag-ui/encoder";

import { resolveAgUiRunInput, type AgUiChatMessage, type AgUiRunBody, type AgUiRunInput } from "@jini-ai/chat/server/ag-ui/run-input";
import {
  createAgUiTranslationState,
  drainRunFramesToAgUi,
  type AgUiEvent,
  type CustomEventNames,
  type EventIdGenerator,
} from "@jini-ai/chat/core/ag-ui";

import { RUN_NOTICES } from "#src/contracts/core/assistant-run-events";
import { getAuthedPrincipal, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";
import { cancelDaemonRunBestEffort, fetchAgentDaemon, fetchAgentDaemonEventStream, type DaemonCallOptions } from "./assistant-daemon-client.js";
import { redactedError } from "@jini-ai/diagnostics/observability/node";
import type { ServerModuleHandle } from "./types.js";

export const AG_UI_RUN_PATH = "/api/admin/v1/assistant/ag-ui-run";

/** Bounds one AG-UI turn's history, mirroring `assistant-byok.ts`'s `MAX_HISTORY_MESSAGES` — same
 *  reasoning: each turn re-sends its whole history, so an unbounded one makes every later message
 *  in a long chat more expensive than the last. */
const MAX_HISTORY_MESSAGES = 40;

/**
 * Flattens an AG-UI message history into the single prompt string the daemon's `contextRef.prompt`
 * expects (`assistant-transport.ts`'s `buildLocalCliContextRef` does the equivalent client-side for
 * the Local CLI path). Deliberately simpler than that path's own `buildTranscript`: no boundary
 * escaping, truncation-per-message, or artifact summarization — this history arrives fresh on every
 * AG-UI POST from a client this project also controls, not replayed from persisted storage. A known
 * simplification for this first canary slice, not an oversight.
 */
function flattenMessagesToPrompt({ messages }: { messages: AgUiChatMessage[] }, _optional = {}): string {
  return messages.map((m) => `## ${m.role}\n${m.content}`).join("\n\n");
}

// ---------------------------------------------------------------------------------------------
// AgentEvent -> AG-UI event translation
// ---------------------------------------------------------------------------------------------

/**
 * Jini's narrowed `@ag-ui/core` event union is authoritative, including the required reasoning
 * `messageId` and literal `role: "reasoning"`; the host keeps only its IDs and custom wire names.
 *
 * Mutable state belongs to ONE run, threaded through every translation call — never a singleton,
 * which would merge concurrent admins/tabs. ADR-059 Decision 6: Tovu's boundary-less deltas have
 * no signal for a new text/thinking run except a change in `AgentEvent.kind`. Jini synthesizes the
 * strict START/CONTENT/END lifecycle; it closes reasoning before text (thinking to answering), text
 * before reasoning, and either before a tool call, avoiding a double START without an END.
 *
 * Text/thinking/tool-result events carry no message ID, so a monotonic per-run counter mints one.
 * Complete `tool_use` input emits START/ARGS/END back-to-back rather than incremental argument deltas.
 * Usage can arrive mid-stream: buffering it into RUN_FINISHED would lose that signal. Status labels
 * have no matched end, so CUSTOM is used instead of STEP_STARTED/STEP_FINISHED. Extension events
 * (`mcp-ui`/`a2ui`/unmodeled types) remain inert side-channels (ADR-059 Decision 5).
 *
 * Jini owns the exhaustive AgentEvent projection; this host supplies only the two values below,
 * its id format and its custom wire names, as one config for every run's translation state.
 * @complexity O(1) per state creation or translated event.
 */
export const AG_UI_TRANSLATION: { readonly ids: EventIdGenerator; readonly customEventNames: CustomEventNames } = {
  ids: { next: ({ prefix, ordinal }) => `${prefix}_${ordinal}` },
  customEventNames: { usage: "tovu.usage", status: "tovu.status", extensionPrefix: "tovu.ext." },
};

// ---------------------------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------------------------

/** No `accept` param — this route always answers plain SSE JSON, never protobuf, so
 *  `acceptsProtobuf` stays `false` for the module's lifetime; sharing one instance across requests
 *  is safe because `EventEncoder` holds no per-request state beyond that fixed flag. */
const agUiEncoder = new EventEncoder();

/** AG-UI's documented wire format: `data: <json>\n\n` — no `event:` field, unlike Tovu's own
 *  internal `sse()` helper in `assistant-byok.ts`. Delegates the actual framing to
 *  `@ag-ui/encoder`'s `EventEncoder.encodeSSE` rather than hand-formatting it, so this route's wire
 *  output tracks the package's own encoding, not a manually-kept-in-sync copy of it. */
function writeAgUiEvent(res: Response, event: AgUiEvent): void {
  res.write(agUiEncoder.encodeSSE(event));
}

function beginAgUiStream(req: Request, res: Response, requestId: string): void {
  res.status(200).set({
    "content-type": agUiEncoder.getContentType(),
    "cache-control": "no-cache, no-transform",
    // Same reasoning as `site-assistant.ts`'s identical guard: HTTP/2 throws
    // `ERR_HTTP2_INVALID_CONNECTION_HEADER` on a `connection` header, and dropping it changes
    // nothing observable for an HTTP/1.1 client (keep-alive is already its default there).
    ...(req.httpVersionMajor < 2 ? { connection: "keep-alive" } : {}),
    "x-accel-buffering": "no",
    // Correlation for audit tooling (`protocol-surfaces.spec.md`'s `requestId`), carried as a
    // response header rather than folded into the wire body — AG-UI's own `runId`/`threadId`
    // already serve that spec's `jobId` role, and adding a non-spec field to every event would cost
    // wire conformance for no benefit a header doesn't already give.
    "x-tovu-request-id": requestId,
  });
  res.flushHeaders?.();
}

/** Starts the real daemon run for one AG-UI request — the identical `POST /api/runs` shape
 *  `assistant.ts`'s `proxyRunStart` uses. Split out of `handleAgUiRun` so its own two failure shapes
 *  (transport-level via `fetchAgentDaemon`, and a non-ok daemon status) don't add to that function's
 *  branch count. `res` has already had an error response written on `{ ok: false }` — the caller's
 *  contract is to return immediately without touching `res` again.
 * @complexity O(h) time and space in bounded history plus the existing daemon request.
 * @overallScore 100 */
async function startDaemonRun(
  req: Request,
  res: Response,
  run: AgUiRunInput,
  principalId: string,
  daemon: DaemonCallOptions,
): Promise<{ ok: true; daemonRunId: string } | { ok: false }> {
  const prompt = flattenMessagesToPrompt({ messages: run.messages });
  const startUpstream = await fetchAgentDaemon(req, res, {
    path: "/api/runs",
    method: "POST",
    body: { contextRef: JSON.stringify({ prompt, userPrompt: run.messages.at(-1)?.content, principalId,
      ...(run.frontendBindToken ? { frontendBindToken: run.frontendBindToken } : {}),
      ...(run.frontendTabId ? { frontendTabId: run.frontendTabId } : {}),
      ...(run.secretRedacted ? { secretRedacted: true } : {}) }), agentId: run.agentId },
    observability: daemon.observability,
  });
  if (!startUpstream) return { ok: false }; // fetchAgentDaemon already wrote a 503/502.

  if (!startUpstream.ok) {
    const detail = await startUpstream.text().catch(() => "");
    res.status(startUpstream.status).json({ error: "agent run failed to start", code: "DAEMON_START_FAILED", detail });
    return { ok: false };
  }
  const { run: daemonRun } = (await startUpstream.json()) as { run: { id: string } };
  return { ok: true, daemonRunId: daemonRun.id };
}

/** Subscribes to one daemon run's native SSE stream, returning a reader ready for
 *  {@link streamFromReader}, or `null` once an error response has already been written (same
 *  contract as {@link startDaemonRun}). Split out of `handleAgUiRun` for the same reason.
 *
 * Built on {@link fetchAgentDaemonEventStream} rather than `fetchAgentDaemon` — see that function's
 * own doc for why this specific stream needs `node:http`'s no-default-timeout transport: a parked
 * tool call can leave the daemon silent well past `fetch`'s default idle-body timeout, which is not a
 * stall on this endpoint, it's the normal shape of a human-in-the-loop wait. */
async function subscribeToDaemonEvents(req: Request, res: Response, daemonRunId: string, daemon: DaemonCallOptions): Promise<ReadableStreamDefaultReader<Uint8Array> | null> {
  const eventsUpstream = await fetchAgentDaemonEventStream(req, res, `/api/runs/${encodeURIComponent(daemonRunId)}/events`, daemon);
  if (!eventsUpstream) return null; // fetchAgentDaemonEventStream already wrote a 503/502.
  if (eventsUpstream.statusCode < 200 || eventsUpstream.statusCode >= 300) {
    res.status(502).json({ error: "assistant is unavailable", code: "BAD_GATEWAY" });
    return null;
  }
  return eventsUpstream.body.getReader();
}

/** Stands in for the run's tracker until the daemon run exists, so `runTracker` is never null. Never
 *  ended: the close handler only ends a tracker once a daemon run exists. */
const UNSTARTED_RUN: TrackerSpan<AgentRunTrackingOutcome> = { setOutcome() {} };

async function handleAgUiRun(req: Request, res: Response, deps: Pick<RouteDeps, "tracker" | "observability">): Promise<void> {
  const body = (req.body ?? {}) as AgUiRunBody;
  const run = resolveAgUiRunInput({ body, maxHistoryMessages: MAX_HISTORY_MESSAGES, ids: { newId: randomUUID } });
  if (!run) {
    res.status(400).json({ error: "'messages' must end with a non-empty user message", code: "VALIDATION_ERROR" });
    return undefined;
  }

  // Cancels the DAEMON run, not just this response's own SSE subscription (MEDIUM audit finding,
  // 2026-08-19 Codex sol bug/architecture audit; RE-AUDITED 2026-08-19 by both `gpt-5.6-sol` and
  // `gpt-5.6-terra`): the first fix armed `res.on("close")` only after BOTH `startDaemonRun` and
  // `subscribeToDaemonEvents` had already resolved. Two windows still leaked an orphaned daemon run:
  // (1) a client abort while either of those `await`s was still pending was missed permanently,
  // since nothing was listening for `"close"` yet; (2) a subscribe HTTP failure (the 502 branch
  // below) ends this response NORMALLY from the server's own point of view, so it looked identical
  // to a successful `drainRunFramesToAgUi` finish and never triggered a cancel either.
  //
  // The handler is registered here, before either daemon call, so no window is uncovered. It cannot
  // cancel before a daemon run actually exists, so `daemonRunId` starts `null`; if `"close"` fires
  // in that gap, `closedEarly` remembers it and the check right after `startDaemonRun` resolves
  // fires the cancel retroactively — the two can't race because JS's single-threaded execution
  // serializes "close fires first" against "the await resolves first," and either ordering leaves
  // the daemon run cancelled exactly once.
  //
  // `runFinished` (not `res.writableEnded`) is what distinguishes "the run reached its own terminal
  // state" from "this response ended early while the run is still executing" — both leave
  // `writableEnded === true`, which is exactly why the previous fix's guard missed case (2) above.
  // It is set `true` only once `drainRunFramesToAgUi` has actually driven the run to completion (terminal
  // frame, natural stream close, or a read error that already unwound the daemon side), synchronously
  // before this function returns and therefore strictly before the async `"close"` event can fire —
  // so an ordinary successful run still issues zero cancel calls, per this fix's own regression test.
  const daemon: DaemonCallOptions = { observability: deps.observability };
  let daemonRunId: string | null = null;
  // One agent-run span per daemon run (its own trace root, like the finalizer's), ended exactly once:
  // canceled by the close handler, failed if the subscribe fails, else the drain's own outcome.
  let runTracker = UNSTARTED_RUN;
  let runFinished = false;
  let closedEarly = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  res.on("close", () => {
    // Closing the response already ends this reader; cancellation is best-effort cleanup.
    reader?.cancel().catch(() => undefined);
    if (runFinished) return;
    if (daemonRunId) {
      runTracker.setOutcome({ status: "canceled" });
      cancelDaemonRunBestEffort(req, res, daemonRunId, daemon);
    } else closedEarly = true;
  });

  // Start the real daemon run BEFORE switching this response into SSE mode — a daemon failure at
  // this point can still answer with an ordinary JSON error status, which is no longer possible
  // once headers have been flushed for the event stream below.
  const principal = getAuthedPrincipal(res);
  const started = await startDaemonRun(req, res, run, principal.id, daemon);
  if (!started.ok) return undefined;
  daemonRunId = started.daemonRunId;
  return deps.tracker.trace({ name: "assistant.run", run: async (span) => {
    runTracker = span;
    if (closedEarly) {
      runTracker.setOutcome({ status: "canceled" });
      cancelDaemonRunBestEffort(req, res, started.daemonRunId, daemon);
      return;
    }

    const subscribedReader = await subscribeToDaemonEvents(req, res, started.daemonRunId, daemon);
    if (!subscribedReader) {
      runTracker.setOutcome({ status: "failed" });
      return;
    }
    reader = subscribedReader;

    beginAgUiStream(req, res, run.requestId);
    writeAgUiEvent(res, { type: EventType.RUN_STARTED, threadId: run.threadId, runId: run.runId });

    const state = createAgUiTranslationState(AG_UI_TRANSLATION);
    const outcome = await drainRunFramesToAgUi({ reader: subscribedReader, threadId: run.threadId, runId: run.runId, state,
      notices: RUN_NOTICES, write: (event) => writeAgUiEvent(res, event) });
    runFinished = true;
    res.end();
    runTracker.setOutcome(outcome);
  } }, { agent: { runId: daemonRunId, conversationId: run.threadId, agentName: run.agentId } });
}

export function createAssistantAgUiModule(routeDeps: RouteDeps): ServerModuleHandle {
  return {
    name: "assistant-ag-ui",
    registerRoutes: ({ app }, _options = {}) => {
      app.use(AG_UI_RUN_PATH, requireAdminSession(routeDeps));
      app.post(AG_UI_RUN_PATH, (req: Request, res: Response, next: NextFunction) => {
        void handleAgUiRun(req, res, routeDeps).catch((error: unknown) => {
          console.error("[assistant-ag-ui] unhandled error", error);
          routeDeps.tracker.error({ error: error instanceof Error ? error : redactedError({ error }) }, { context: { operation: "assistant.run" } });
          if (res.headersSent) {
            writeAgUiEvent(res, { type: EventType.RUN_ERROR, message: "assistant failed" });
            res.end();
          } else {
            next(error);
          }
        });
      });
    },
  };
}
