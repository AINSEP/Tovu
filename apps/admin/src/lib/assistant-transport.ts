/**
 * Tovu's implementation of `@jini-ai/chat-react`'s `ChatTransport` port (ADR-049).
 *
 * TWO run paths live here, selected per-turn by `getExecutionConfig()` (see
 * `createTovuAssistantTransport`'s own doc):
 *
 * 1. **Local CLI** (the original, unchanged path): binds to the real `@jini-ai/http` run surface
 *    `src/server/modules/assistant.ts` mounts — `POST /api/runs` to start, `GET
 *    /api/runs/:runId/events` (native `EventSource`) to stream, `GET /api/runs/:runId` for status,
 *    `POST /api/runs/:runId/cancel` to stop. Every SSE frame's `data` is a full `@jini-ai/protocol`
 *    `RunProtocolEvent` (`{kind, payload, ...}`), not chat-core's own `AgentEvent` — chat-core's own
 *    module doc is explicit that this reduction is a transport concern ("a host's transport adapter
 *    is responsible for reducing wire deltas... into the persisted/renderable AgentEvent items"), so
 *    `translateRunAgentPayload` below does that translation.
 * 2. **API · BYOK** (2026-08-04, ADR-049's picker): binds to `src/server/modules/assistant-byok.ts`'s
 *    `POST /api/admin/v1/assistant/byok-turn` — one request/response holding the WHOLE turn open,
 *    no separate `EventSource`/reattach/cancel-by-runId (see that route's own header for why, and
 *    what it costs). Its SSE frames carry the SAME `payload.type` vocabulary
 *    (`status`/`text_delta`/`tool_use`/`tool_result`/`usage`/`error`) `translateRunAgentPayload`
 *    already parses for path 1 — deliberately, so this path reuses that exact function rather than
 *    duplicating the translation switch.
 *
 * `text_delta`/`thinking_delta` are forwarded as their own small `AgentEvent` per delta (not
 * accumulated here) — chat-core's own `ChatMessage.events` array is what concatenates them into one
 * growing message, so accumulating twice would double the text.
 */
import { buildTranscript, latestUserPromptFromHistory } from "@jini-ai/chat/core";
import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { ChatTransport, RunHandlers, StartRunInput } from "@jini-ai/chat/react";
import type { ExecutionConfig } from "@jini-ai/ui";

const RUNS_URL = "/api/runs";
const BYOK_TURN_URL = "/api/admin/v1/assistant/byok-turn";
/** Distinguishes a BYOK-run id (client-minted, no server-side run record) from a daemon-run id
 *  (server-minted, reattachable) wherever a bare `runId` string is all a `ChatTransport` method
 *  receives — see `stopRun`/`fetchRunStatus`/`reattachRun` below for why the distinction matters. */
const BYOK_RUN_ID_PREFIX = "byok:";

/**
 * How many trailing messages of a conversation go to the agent.
 *
 * A cap rather than none: each turn cold-boots a fresh subprocess and pays for its whole input, so
 * an uncapped transcript makes every message in a long chat more expensive than the last. 40 is
 * roughly 20 exchanges — beyond what a working session usually needs to stay coherent, and far
 * short of where input cost starts to dominate. `buildTranscript` separately truncates any single
 * oversized message, so this bounds the number of turns, not their size.
 */
const MAX_TRANSCRIPT_TURNS = 40;

interface RunAgentPayload {
  readonly type: string;
  readonly [key: string]: unknown;
}

interface RunProtocolEventWire {
  readonly runId: string;
  readonly kind: "start" | "agent" | "stdout" | "stderr" | "error" | "end";
  readonly payload: unknown;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
}

/**
 * Reduces one wire-level `RunAgentPayload` into zero or one renderable `AgentEvent`s.
 *
 * Exported (a pure function, so directly testable with no `EventSource`/`fetch` stub needed — see
 * `assistant-transport.transcript.test.ts`'s own module doc for the same reasoning applied to
 * `runPrompt`) so `assistant-transport.a2ui.test.ts` can assert the `"a2ui"` branch below in
 * isolation.
 */
export function translateRunAgentPayload(payload: RunAgentPayload): AgentEvent | null {
  switch (payload.type) {
    case "status":
      return { kind: "status", label: asString(payload.label), detail: payload.detail ? asString(payload.detail) : undefined };
    case "text_delta":
      return { kind: "text", text: asString(payload.delta) };
    case "thinking_delta":
      return { kind: "thinking", text: asString(payload.delta) };
    case "tool_use":
      return { kind: "tool_use", id: asString(payload.id), name: asString(payload.name), input: payload.input };
    case "tool_result":
      return {
        kind: "tool_result",
        toolUseId: asString(payload.toolUseId),
        content: asString(payload.content),
        isError: Boolean(payload.isError),
      };
    case "usage": {
      const usage = (payload.usage ?? {}) as Record<string, unknown>;
      return {
        kind: "usage",
        inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
        outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
        costUsd: typeof payload.costUsd === "number" ? payload.costUsd : undefined,
        durationMs: typeof payload.durationMs === "number" ? payload.durationMs : undefined,
      };
    }
    case "raw":
      return { kind: "raw", line: asString(payload.line) };
    // An MCP content block the daemon withheld from the tool result because it is for the HUMAN,
    // not the model (`@jini-ai/daemon`'s `delegated-tool-bridge.ts` → `tool-result-surfaces.ts`).
    // Explicit rather than left to `default` below because the shapes do not line up: the default
    // passes the WHOLE wire payload as `data`, but `@jini-ai/chat`'s `McpUiSurfaceCard` runs
    // `parseUIResource` over each event's `data` and that requires the bare `EmbeddedResource`
    // (`{type:'resource', resource:{uri,mimeType,text}}`). Handing it the envelope instead fails
    // the `type !== 'resource'` check and renders an empty frame — a silent no-op, which is the
    // worst possible failure for a confirmation dialog. Unwrapping here is what makes the two ends
    // meet. `name` must stay `"mcp-ui"` to match `MCP_UI_EXT_EVENT_NAME`.
    case "mcp-ui":
      return { kind: "ext", name: "mcp-ui", data: payload.resource };
    // A2UI's own agent->renderer envelope (`@jini-ai/core`'s `SurfaceEmission` with
    // `channel: "a2ui"`, injected by `@jini-ai/daemon`'s `delegated-tool-bridge.ts` as
    // `{type: "a2ui", message: <AgentToRendererMessage>}`). Unwrapped to the bare `.message` here,
    // not left to the `default` branch below, for the same reason `mcp-ui` above is explicit:
    // `@jini-ai/chat/react`'s `A2uiSurfaceCard` (registered against `'a2ui'` in
    // `AssistantDock.tsx`) runs `extractSurfaceId`/`interpreter.applyAgentMessage` over each event's
    // `data` directly, and both require a bare, spec-shaped envelope — not the `{type, message}`
    // wire wrapper. Mirrors Jini's own reference host's identical `case "a2ui"` in
    // `examples/reference-web/src/daemon-transport.ts`.
    case "a2ui":
      return { kind: "ext", name: "a2ui", data: payload.message };
    // thinking_start/stage_start/stage_end/surface_request/surface_response: no dedicated
    // chat-core variant. Routed through the `ext` escape hatch rather than dropped, so a future
    // renderer can opt in without a transport change.
    case "thinking_start":
      return null;
    default:
      return { kind: "ext", name: payload.type, data: payload };
  }
}

/**
 * Turns a terminal stream `reason` into the one renderable event a human needs to see, or `null`
 * when the reason speaks for itself.
 *
 * Only `max_tool_turns` qualifies today, and it qualifies for a specific reason: it is the one
 * terminal reason that is INDISTINGUISHABLE from success in the pane. `stop`/`end_turn` mean the
 * assistant finished; an `error` reason already renders as an error. A turn that hit the tool-step
 * ceiling just stops — mid-task, with whatever partial text it had, and nothing on screen saying
 * the work was cut short rather than completed. That is the failure this exists to close: the
 * server now reports the loop's real reason (`byok-provider-turn.ts`'s `normalizeTurnResult`
 * captures it instead of echoing the provider's last raw stop code), and until this, the browser
 * received that reason and dropped it.
 *
 * Rendered as a `status` event rather than an `error`, deliberately: nothing failed. The turn did
 * real work and stopped at a budget, and the useful next action is "ask it to continue", which is
 * what the detail says.
 */
export function terminalReasonNotice(reason: string): AgentEvent | null {
  if (reason !== "max_tool_turns") return null;
  return {
    kind: "status",
    label: "Stopped early — tool-step limit reached",
    detail: "This turn used all the tool steps allowed for one message, so it may be unfinished. Ask it to continue to pick up where it left off.",
  };
}

/** Reads a terminal frame's `reason` from either stream shape without letting a malformed or absent
 *  body prevent the turn from ending: the daemon path wraps it in a `RunProtocolEventWire.payload`,
 *  the BYOK path sends a bare `{reason}`, and `subscribeToRun`'s `end` event may carry no data at
 *  all. A notice is a nicety; finishing the run is not. */
function readTerminalReason(raw: string | undefined, wrapped: boolean): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const source = wrapped ? ((parsed.payload ?? {}) as Record<string, unknown>) : parsed;
    return asString(source.reason);
  } catch {
    return "";
  }
}

/**
 * The prompt for one run: the whole conversation so far, not just the newest message.
 *
 * This used to send only the latest user turn, which is why the assistant appeared to have no
 * memory — ask it something, then ask a follow-up, and the second run had never seen the first.
 * That looked like a missing capability and was not: `ChatPane` hands the full history to every
 * `startRun`, and it was being discarded here, in the browser, before the request was even built.
 * Nothing server-side had to change.
 *
 * `buildTranscript` rather than a hand-rolled join, because flattening a transcript has more edges
 * than it first appears: it truncates any single oversized message, escapes `## user`/`## assistant`
 * inside message bodies so a user cannot forge a turn boundary by pasting one, summarizes persisted
 * artifacts instead of replaying them, and prepends a warning when prior-run telemetry shows the
 * context was already large. Every admin turn cold-boots a fresh CLI subprocess, so the transcript
 * IS the memory — and the same property makes an unbounded one expensive.
 *
 * Bounded deliberately: each run is billed, and an unbounded transcript grows the input cost of
 * every subsequent turn in a conversation that has no natural end. {@link MAX_TRANSCRIPT_TURNS}
 * keeps a long-running chat from silently becoming the most expensive thing in the product.
 */
function runPrompt(history: StartRunInput["history"]): string {
  const recent = history.slice(-MAX_TRANSCRIPT_TURNS);
  return buildTranscript(recent as ChatMessage[]);
}

/** `@jini-ai/protocol`'s `RunState` -> chat-core's flat `RunStatus` union (different spelling: `cancelled` vs `canceled`, `pending` vs `queued`). */
function toChatCoreRunStatus(state: string): "queued" | "running" | "succeeded" | "failed" | "canceled" | undefined {
  switch (state) {
    case "pending":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "canceled";
    default:
      return undefined;
  }
}

/** `signal` is only available on the `startRun` path (`StartRunInput.signal`) — `reattachRun`'s
 * signature carries no abort signal at all, so a reattached subscription only ever ends via the
 * stream's own `end`/`error` frame. */
function subscribeToRun(runId: string, handlers: RunHandlers, signal?: AbortSignal): void {
  const source = new EventSource(`${RUNS_URL}/${encodeURIComponent(runId)}/events`);
  const collected: AgentEvent[] = [];
  let settled = false;

  const finish = () => {
    if (settled) return;
    settled = true;
    source.close();
    handlers.onDone(collected);
  };

  signal?.addEventListener("abort", () => {
    if (!settled) {
      settled = true;
      source.close();
    }
  });

  source.addEventListener("agent", (event) => {
    const frame = JSON.parse((event as MessageEvent<string>).data) as RunProtocolEventWire;
    const translated = translateRunAgentPayload(frame.payload as RunAgentPayload);
    if (translated) {
      collected.push(translated);
      handlers.onEvent(translated);
    }
  });

  source.addEventListener("stdout", (event) => {
    const frame = JSON.parse((event as MessageEvent<string>).data) as RunProtocolEventWire;
    const chunk = asString((frame.payload as { chunk?: unknown }).chunk);
    const translated: AgentEvent = { kind: "raw", line: chunk };
    collected.push(translated);
    handlers.onEvent(translated);
  });

  source.addEventListener("error", (event) => {
    const raw = (event as MessageEvent<string>).data;
    if (raw) {
      const frame = JSON.parse(raw) as RunProtocolEventWire;
      const message = asString((frame.payload as { message?: unknown }).message);
      handlers.onError(new Error(message || "agent run failed"));
      return;
    }
    // A bare EventSource connection error (no `data`, e.g. the server never responded) rather
    // than a run-level error frame.
    handlers.onError(new Error("assistant stream connection error"));
  });

  source.addEventListener("end", (event) => {
    const notice = terminalReasonNotice(readTerminalReason((event as MessageEvent<string>).data, true));
    if (notice) {
      collected.push(notice);
      handlers.onEvent(notice);
    }
    finish();
  });
}

/** Client-minted, not server-minted — see module doc's path-2 section: a BYOK run has no server-side
 *  run record to name it. Prefixed so `stopRun`/`fetchRunStatus`/`reattachRun` below can tell a
 *  BYOK-run id apart from a daemon-run id without any other context. */
function mintByokRunId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${BYOK_RUN_ID_PREFIX}${random}`;
}

/** In-flight BYOK turns' abort controllers, keyed by the client-minted runId — the ONLY way
 *  `stopRun` can cancel a BYOK turn: unlike the daemon path, there is no server-side run record to
 *  `POST .../cancel` against, so cancellation has to reach back into THIS tab's own in-flight
 *  `fetch`. Entries are removed as soon as a turn settles (normally, on error, or on abort) so a
 *  stale id can never resurrect a finished controller. */
const byokAbortControllers = new Map<string, AbortController>();

/**
 * Parses one blank-line-delimited SSE frame's raw text into `{event, data}` — the field-by-field
 * half of `readSseFrames` below, split out (2026-08-06, complexity pass) as its own pure function
 * so it is directly testable with a plain string, no `ReadableStream`/reader involved, and so the
 * outer while-loop in `readSseFrames` reads as "find the next boundary, parse it, yield it" rather
 * than a parser nested three loops deep inside it.
 *
 * Returns `null` for a frame with no `data:` lines — `readSseFrames` skips yielding those, same as
 * it did before this split (a bare `event: ping` keepalive, for example, or a frame carrying only an
 * `id:` field `assistant-byok.ts` never sends).
 */
export function parseFrame(rawFrame: string): { event: string; data: string } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of rawFrame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  return dataLines.length > 0 ? { event, data: dataLines.join("\n") } : null;
}

/**
 * Splits a `text/event-stream` response body into `{event, data}` frames.
 *
 * A hand-rolled reader rather than `EventSource`: `EventSource` only ever issues a GET with no
 * request body, and this path's whole point (see module doc's path-2 section) is one POST holding
 * the turn open on the SAME connection the browser used to send it — there is no separate URL an
 * `EventSource` could subscribe to. Frames are blank-line-delimited per the SSE spec; per-frame
 * field parsing (`event:`/`data:`, no `id:`/`retry:` support — that route sends neither) lives in
 * {@link parseFrame} above.
 *
 * @complexity O(n) in response body bytes; O(1) additional buffering per chunk beyond the
 * not-yet-terminated tail of the current frame.
 * @overallScore 100
 */
async function* readSseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawFrame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const frame = parseFrame(rawFrame);
      if (frame) yield frame;
      boundary = buffer.indexOf("\n\n");
    }
  }
}

/**
 * Dispatches one parsed BYOK SSE frame to the right `RunHandlers` call — the `"agent"`/`"error"`/
 * `"end"` handling pulled out of `startByokRun`'s stream-consumer IIFE (2026-08-06, complexity
 * pass), where it sat four levels of nesting deep (async IIFE > `try` > `for await` > `if`/
 * `else if`, with a further nested `if` inside the `"agent"` and `"end"` cases). At module scope it
 * is a single, independently testable function: a plain `{event, data}` frame in, a fake
 * `RunHandlers` to assert against, no `ReadableStream`/`fetch`/timers required.
 *
 * @param ctx.collected - This turn's running event log — the same array `startByokRun` hands to
 *   `handlers.onDone` once the stream ends.
 * @param ctx.finish - `startByokRun`'s own idempotent finish (closes out the turn, deletes its abort
 *   controller, calls `onDone`). Called on `"end"`, exactly as the inline version did.
 */
export function handleByokFrame(
  frame: { event: string; data: string },
  ctx: { collected: AgentEvent[]; handlers: RunHandlers; finish: () => void },
): void {
  if (frame.event === "agent") {
    const payload = JSON.parse(frame.data) as RunAgentPayload;
    const translated = translateRunAgentPayload(payload);
    if (translated) {
      ctx.collected.push(translated);
      ctx.handlers.onEvent(translated);
    }
  } else if (frame.event === "error") {
    const payload = JSON.parse(frame.data) as { message?: unknown };
    ctx.handlers.onError(new Error(asString(payload.message) || "BYOK turn failed"));
  } else if (frame.event === "end") {
    const notice = terminalReasonNotice(readTerminalReason(frame.data, false));
    if (notice) {
      ctx.collected.push(notice);
      ctx.handlers.onEvent(notice);
    }
    ctx.finish();
  }
}

/**
 * The BYOK run path (2026-08-04) — one held-open `POST` to `assistant-byok.ts`, no separate
 * `EventSource`/reattach. See module doc's path-2 section for why this shape differs from
 * `subscribeToRun`'s daemon-path pattern, and what it costs (no reattach after a reload; `stopRun`
 * works via the abort-controller map above instead of a server-side cancel endpoint).
 *
 * @complexity Dominated by the network/stream cost of the turn itself; per-frame parsing is O(1).
 * @overallScore 100
 */
async function startByokRun(
  input: StartRunInput,
  handlers: RunHandlers,
  byok: ExecutionConfig["byok"],
): Promise<{ runId: string }> {
  const runId = mintByokRunId();
  const controller = new AbortController();
  byokAbortControllers.set(runId, controller);
  input.signal?.addEventListener("abort", () => controller.abort());

  const messages = (input.history as ChatMessage[])
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({ role: message.role, content: message.content }));

  let response: Response;
  try {
    response = await fetch(BYOK_TURN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        messages,
        byok: {
          protocol: byok.protocol,
          apiKey: byok.apiKey,
          ...(byok.baseUrl ? { baseUrl: byok.baseUrl } : {}),
          model: byok.model,
          ...(byok.maxTokens !== undefined ? { maxTokens: byok.maxTokens } : {}),
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    byokAbortControllers.delete(runId);
    throw error instanceof Error ? error : new Error(String(error));
  }

  if (!response.ok || !response.body) {
    byokAbortControllers.delete(runId);
    const detail = await response.text().catch(() => "");
    throw new Error(`BYOK turn failed to start (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }

  const collected: AgentEvent[] = [];
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    byokAbortControllers.delete(runId);
    handlers.onDone(collected);
  };

  // Deliberately not awaited: `startRun`'s contract (matching the daemon path immediately above)
  // is to resolve `{runId}` once the turn has STARTED, not once it has finished — the response
  // headers (hence this function reaching this point at all) arrive as soon as
  // `assistant-byok.ts` calls `beginStream`, well before generation completes.
  void (async () => {
    try {
      for await (const frame of readSseFrames(response.body!)) {
        handleByokFrame(frame, { collected, handlers, finish });
      }
      finish();
    } catch (error) {
      byokAbortControllers.delete(runId);
      if (controller.signal.aborted) {
        // Cancelled via `stopRun` or the composer's own signal — an expected exit, not a
        // reportable failure. `subscribeToRun`'s `EventSource` has no equivalent branch because
        // `.close()` doesn't reject a promise the way an aborted `fetch`'s body reader does; this
        // mirrors what a cancelled daemon run already looks like to the rest of the pane: silence,
        // not an error toast.
        finish();
        return;
      }
      handlers.onError(error instanceof Error ? error : new Error(String(error)));
    }
  })();

  return { runId };
}

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
}

export function createTovuAssistantTransport(options: CreateTovuAssistantTransportOptions = {}): ChatTransport {
  return {
    async startRun(input: StartRunInput, handlers: RunHandlers): Promise<{ runId: string }> {
      // Guard on the newest USER turn, not on the assembled transcript: a history containing only
      // assistant messages would still produce a non-empty transcript, and sending that as a
      // prompt asks the agent to reply to itself. Shared by both paths below.
      if (!latestUserPromptFromHistory(input.history as ChatMessage[])) {
        throw new Error("no user message to send");
      }

      const executionConfig = options.getExecutionConfig?.();
      // Dispatches on MODE alone, not on whether a key is typed in this browser right now
      // (2026-08-05). `executionConfig.byok.apiKey` is write-only server-side — it is empty on
      // every fresh load even when a credential IS stored — so gating on it here would make BYOK
      // mode permanently unable to dispatch for exactly the case the server-side store exists to
      // support. `assistant-byok.ts`'s route already resolves the credential correctly either way
      // (a locally-typed key wins when present; an empty/omitted one falls back to this admin's own
      // stored row), so an empty `byok.apiKey` is a legitimate turn, not a reason to fall through to
      // the Local CLI path. A turn with genuinely no usable credential anywhere still fails, just one
      // level down — the route's own 400 `"no usable BYOK credential..."` — which is a real,
      // actionable answer instead of the mode picker silently refusing to try.
      if (executionConfig?.mode === "byok") {
        return startByokRun(input, handlers, executionConfig.byok);
      }

      // Local CLI path (unchanged) below.
      const prompt = runPrompt(input.history);

      /**
       * Which browser tab this run should be allowed to drive, from `ChatPane`'s `runContext`
       * prop (`AssistantDock.tsx` supplies it from the live `FrontendSessionBridge`).
       *
       * Read by name rather than spreading the whole `input.context` blob: `contextRef` is a
       * shared envelope that Tovu's proxy also writes `principalId` into
       * (`src/server/modules/assistant.ts`), and a spread would let any future `runContext` key
       * silently shadow it — an identity field being overwritten by a UI prop is not a failure
       * mode worth leaving open to save one line.
       *
       * Omitted entirely when absent, which is a normal state, not an error: the daemon treats a
       * run with no bind token as one with no screen to drive (`agent-daemon-server.ts`).
       */
      const frontendBindToken = input.context?.["frontendBindToken"];
      const contextRef: Record<string, unknown> = { prompt };
      if (typeof frontendBindToken === "string" && frontendBindToken.length > 0) {
        contextRef.frontendBindToken = frontendBindToken;
      }

      /**
       * The Local CLI picker's live model selection, from `ChatPane`'s `runContext` prop
       * (`AssistantDock.tsx`'s `resolveRunContext`). Same "read by name, not spread" reasoning as
       * `frontendBindToken` above, and the same "omit when absent" convention. Forwarded as an
       * opaque string — `agent-daemon-server.ts` forwards it the same way, and
       * `AgentExecutor.run()`'s def-level `buildArgs` is what decides what an absent or `'default'`
       * value means for a given CLI (`@jini-ai/agent-runtime`'s `models.ts`/`resolveModelForAgent`).
       */
      const model = input.context?.["model"];
      if (typeof model === "string" && model.length > 0) {
        contextRef.model = model;
      }

      /**
       * Opaque `attachment:<uuid>` capability ids (`ChatAttachment.path` — never a real filesystem
       * path this early; see `@jini-ai/http-kit`'s `attachments.ts` trust-model doc), not the
       * attachments themselves — `contextRef` is the one channel `prompt`/`frontendBindToken`
       * already ride on to reach `agent-daemon-server.ts`'s `onStarted`, which is where these ids
       * get exchanged for real, re-validated paths via `AttachmentStore.claim()`. Nothing on this
       * side of the wire is trusted; the id is inert until the daemon claims it.
       *
       * Omitted entirely when there are none, same convention as `frontendBindToken` above — a run
       * with no attachments is the overwhelmingly common case and should not carry a key for it.
       */
      if (input.attachments && input.attachments.length > 0) {
        contextRef.attachmentIds = input.attachments.map((attachment) => attachment.path);
      }

      const response = await fetch(RUNS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ contextRef: JSON.stringify(contextRef), agentId: input.agentId }),
        signal: input.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`agent run failed to start (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
      }

      const { run } = (await response.json()) as { run: { id: string } };
      subscribeToRun(run.id, handlers, input.signal);
      return { runId: run.id };
    },

    async reattachRun(runId: string, handlers: RunHandlers): Promise<void> {
      // A BYOK run has no server-side record to reattach to (module doc's path-2 section) — the
      // stream lived entirely on the original `fetch()`'s response body, which a reload has already
      // discarded. Reporting the run as simply over (an empty `onDone`) is the honest answer: there
      // is no way to resume it, and pretending otherwise would hang the pane waiting for events that
      // can never arrive.
      if (runId.startsWith(BYOK_RUN_ID_PREFIX)) {
        handlers.onDone([]);
        return;
      }
      subscribeToRun(runId, handlers);
    },

    async fetchRunStatus(runId: string) {
      // Same reasoning as `reattachRun` above — no server-side run record exists for a BYOK run id,
      // so there is no status to fetch. `null` is this port's existing "unknown/not trackable"
      // value (see the daemon branch below's own `!response.ok` case), not a new state.
      if (runId.startsWith(BYOK_RUN_ID_PREFIX)) return null;
      const response = await fetch(`${RUNS_URL}/${encodeURIComponent(runId)}`, { credentials: "same-origin" });
      if (!response.ok) return null;
      const { run } = (await response.json()) as { run: { state: string } };
      return toChatCoreRunStatus(run.state) ?? null;
    },

    async stopRun(runId: string): Promise<void> {
      // A BYOK run's only cancellation handle is the abort controller `startByokRun` registered for
      // this exact id — there is no server-side run to `POST .../cancel` against.
      if (runId.startsWith(BYOK_RUN_ID_PREFIX)) {
        byokAbortControllers.get(runId)?.abort();
        return;
      }
      await fetch(`${RUNS_URL}/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ runId }),
      });
    },
  };
}

