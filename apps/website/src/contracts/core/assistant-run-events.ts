/**
 * @file The ONE translation from an agent-daemon run stream to chat events, shared by the browser
 * and the server.
 *
 * Purpose:
 * A daemon run streams `@jini-ai/protocol` frames (`agent`/`stdout`/`stderr`/`error`/`end`). A saved
 * chat row stores chat-core `AgentEvent`s plus a text `content` and a `run_status`. Until 2026-09-27
 * the frame-to-event translation lived only in the admin SPA (`apps/admin/src/lib/assistant-transport.ts`),
 * so only a connected browser could turn a run into a saved answer: close the tab, or lose it to a
 * restart, and the row stayed `running` with no content forever (FINDING A,
 * `ADS-memory/reports/2026-09-27-stuck-chat-root-cause.md`).
 *
 * The server-side finalizer (`server/runtime/composition/modules/assistant-run-finalizer.ts`) now
 * saves the finished turn itself, and it must write exactly what the browser would have written. Two
 * copies of this switch would drift, so both import this file: the API directly, the admin through
 * the `@tovu/assistant-run-events` alias (`apps/admin/vite.config.ts`, `vitest.config.ts`,
 * `tsconfig.json` — all three are required).
 *
 * Architectural role:
 * PURE. No I/O, no DOM, no Node built-ins; only type imports. `ReadableStream`/`TextDecoder` in
 * {@link readSseFrames} are globals in both runtimes. Keep it that way — the admin bundle imports it.
 */
import type { AgentEvent, ChatRunStatus, ToolResultMediaBlock } from "@jini-ai/chat/core";

export interface RunAgentPayload {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface RunProtocolEventWire {
  readonly runId: string;
  readonly kind: "start" | "agent" | "stdout" | "stderr" | "error" | "end";
  readonly payload: unknown;
}

export function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
}

/**
 * Parses a `"usage"` wire payload into its renderable `AgentEvent`.
 *
 * The one case in {@link translateRunAgentPayload}'s switch with real branching: four independent
 * optional fields, each `typeof`-checked before use (a malformed/missing field must not throw or
 * silently coerce to `0`/`NaN`). Pulled out (2026-08-06, complexity pass, sixth pass) so those four
 * ternaries are scored in their own scope instead of the switch's — this is the fix for the earlier
 * `@complexityExemption`'s cognitive attribution on `translateRunAgentPayload`, which credited the
 * `mcp-ui`/`a2ui` cases (each a one-line unwrap, zero branching — see their own comments below) for
 * a cost that actually came from here.
 */
export function parseUsageEvent(payload: RunAgentPayload): AgentEvent {
  const usage = (payload.usage ?? {}) as Record<string, unknown>;
  return {
    kind: "usage",
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
    outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
    costUsd: typeof payload.costUsd === "number" ? payload.costUsd : undefined,
    durationMs: typeof payload.durationMs === "number" ? payload.durationMs : undefined,
  };
}

/**
 * Reduces one wire-level `RunAgentPayload` into zero or one renderable `AgentEvent`s.
 *
 * Exported (a pure function, so directly testable with no `EventSource`/`fetch` stub needed — see
 * `assistant-transport.transcript.test.ts`'s own module doc for the same reasoning applied to
 * `runPrompt`) so `assistant-transport.a2ui.test.ts` can assert the `"a2ui"` branch below in
 * isolation.
 *
 * @complexityExemption (2026-08-06, complexity pass, sixth pass; bar is ≤9/≤9) **Score: 12
 * cyclomatic / 3 cognitive. Bar: ≤9 cyclomatic AND ≤9 cognitive. Cyclomatic-only exemption —
 * cognitive already clears the bar since {@link parseUsageEvent} above took the switch's only real
 * branching out of this function's own scope.** (An earlier version of this comment attributed the
 * cognitive cost to the `mcp-ui`/`a2ui` cases below; that was wrong — an independent audit measured
 * that extracting `parseUsageEvent` alone drops cognitive from 11 to 3, which only makes sense if
 * `usage` was the real source. `mcp-ui`/`a2ui` are one-line unwraps with zero branching, exactly as
 * their own comments already said.) Cyclomatic stays over by construction, not by accident: this is
 * a flat `switch` over `RunProtocolEventWire`'s closed `payload.type` vocabulary, one `case` per
 * wire type, and cyclomatic counts every `case` as a branch regardless of shape. Tried and rejected:
 * a `Record<string, (payload) => AgentEvent | null>` lookup table scores lower but loses two things
 * a switch over a TS discriminated union keeps — exhaustiveness checking (a lookup table compiles
 * with a missing key; this switch does not, once `payload.type` is narrowed to the real union rather
 * than the wire's untyped `string`), and the ability to attach a multi-paragraph comment to one case
 * explaining a specific interop bug (the `mcp-ui`/`a2ui` cases' comments each document why THAT case
 * cannot fall through to `default` — see below). A lookup table would have to carry those as a
 * parallel structure, one step removed from the code they explain. Left as a `switch`, documented
 * here rather than only in this session's report.
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
        // Typed media (currently just images) the daemon attached alongside the flattened `content`
        // string — see `@jini-ai/protocol`'s `events.ts` doc on why the wire field is `unknown`
        // rather than a checked type here: the real shape is validated where `ToolCard` renders it.
        // Forwarded verbatim rather than re-validated a second time in this reducer — an
        // `Array.isArray` guard rather than a deep shape check, since a malformed entry inside it
        // is a rendering concern (`ToolCard`'s own `ToolResultMedia` already ignores anything that
        // isn't a recognized block), not a transport one.
        ...(Array.isArray(payload.media) ? { media: payload.media as readonly ToolResultMediaBlock[] } : {}),
      };
    case "usage":
      return parseUsageEvent(payload);
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

/** A daemon `end` frame's non-successful terminal classification, as the daemon itself recorded it
 *  in `@jini-ai/protocol`'s `RunEndPayload`. */
export interface TerminalOutcome {
  readonly status: "failed" | "canceled";
  readonly code: string;
  readonly signal: string;
  readonly resumable: string;
}

/**
 * Reads that classification off a raw `end` frame, or `null` when the run succeeded, sent nothing,
 * or sent something unparseable.
 *
 * `code`/`signal`/`resumable` come back pre-rendered as display strings rather than as their wire
 * types, because both callers ({@link terminalOutcomeNotice} and {@link terminalFailureError}) want
 * the same human-facing rendering of an absent value (`"none"`/`"no"`) and neither does arithmetic
 * on them. Rendering once, here, is what stops the operator-facing notice and the persisted error
 * from describing the same dead run in two different ways.
 *
 * Every field is `typeof`-checked before use, and a malformed body returns `null` rather than
 * throwing: this runs inside an `EventSource` listener whose other job is to END the run, and a
 * throw there would strand the pane mid-turn over a cosmetic detail.
 */
export function readTerminalOutcome(raw: string | undefined): TerminalOutcome | null {
  if (!raw) return null;
  let payload: Record<string, unknown>;
  try {
    payload = ((JSON.parse(raw) as Record<string, unknown>).payload ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }
  const status = payload.status;
  if (status !== "failed" && status !== "canceled") return null;
  return {
    status,
    code: typeof payload.code === "number" ? String(payload.code) : "none",
    signal: typeof payload.signal === "string" ? payload.signal : "none",
    resumable: payload.resumable === true ? "yes" : "no",
  };
}

/**
 * Turns a daemon `end` frame's terminal outcome into a visible `status` event when — and only when —
 * the run did NOT succeed.
 *
 * WHY THIS EXISTS (2026-09-06 chat-death investigation, `ADS-memory/reports/2026-09-06-chat-death-investigation.md`):
 * `@jini-ai/protocol`'s `RunEndPayload` carries `status`/`code`/`signal`/`resumable`, and
 * `@jini-ai/daemon`'s `finish()` is the ONLY event a terminal run emits — there is no separate
 * `error` frame for a failed run. {@link subscribeToRun}'s `end` listener read only `reason` (a
 * field `RunEndPayload` does not even have — it is BYOK-only), so a run the daemon had already
 * classified `failed` arrived here indistinguishable from a completed one, was reported through
 * `onDone`, and was persisted to `chat.db` as `run_status='succeeded'` with empty content. Two such
 * rows exist in `sites/tovu-com/chat.db` — one `codex`, one `claude`, 578 ms and 552 ms — and they
 * are what "the chat just craps out with no error" actually looks like on disk.
 *
 * This is the SEEN half of that fix; {@link terminalFailureError} below is the WRITTEN-DOWN half
 * (2026-09-07, owner-approved). An earlier version of this comment said the persistence change was
 * deliberately NOT made and was out of scope until the owner signed off — that is no longer true,
 * and the two halves stayed separate functions only because they disagree on exactly one input:
 * `canceled` earns a notice but is not a failure.
 *
 * Returns `null` for a successful or absent status so a normal turn gains no extra event.
 */
export function terminalOutcomeNotice(raw: string | undefined): AgentEvent | null {
  const outcome = readTerminalOutcome(raw);
  if (!outcome) return null;
  const { status, code, signal, resumable } = outcome;
  return {
    kind: "status",
    label: status === "canceled" ? "Run canceled" : "Run failed \u2014 the agent process exited without answering",
    detail: `exit code ${code}, signal ${signal}, resumable ${resumable}. The agent CLI's own stderr is shown above when it printed anything; otherwise check the server log for \`[agent-daemon] run <id> ended\`.`,
  };
}

/**
 * The reportable `Error` for a daemon `end` frame the daemon itself classified as `failed`, or
 * `null` for every other terminal outcome.
 *
 * WHY THIS EXISTS (2026-09-07, owner-approved): it is what makes a dead run RECOVERABLE FROM THE
 * DATABASE ALONE. Until now a failed run was reported only through `onDone`, so the durable record
 * said `run_status='succeeded'` with empty content: the live transcript was the ONLY place the
 * failure was visible, and once it was gone the row was indistinguishable from a successful turn
 * that happened to answer with nothing. That lie is why diagnosing chat deaths burned multiple
 * sessions and carried a wrong premise through two handoffs. `f682eff2` deliberately left it in
 * place ("a behavior change to what the product writes down... out of scope until the owner signs
 * off"); the owner has now signed off, and this is that change.
 *
 * NOTHING IN THIS FILE COMPUTES `runStatus`. Three pieces of `@jini-ai/chat` do, and the whole
 * effect of this function rests on all three:
 *   1. `useRunStream`'s `onError` sets the run's status to `'error'` — and its `onDone` is written
 *      as `prev.status === 'error' ? prev.status : 'done'`, so an `onDone` arriving AFTER this
 *      preserves the failure instead of overwriting it. That is what lets {@link subscribeToRun}
 *      report the failure and STILL settle the run through `finish()` with its collected events
 *      intact, rather than having to choose between the two. The call order in that listener is
 *      load-bearing, not incidental.
 *   2. `useConversation` maps run status `'error'` to `ChatMessage.runStatus: 'failed'`.
 *   3. `isTerminalRunStatus` already counts `'failed'` as terminal, so `assistant-chats.ts`'s
 *      `persistableMessages` KEEPS the message (it discards only still-streaming turns) and
 *      `AssistantDock/hooks/AssistantDock.hooks.tsx`'s `shouldPublishOnMessagesChange` still
 *      settles the dock. A failed run therefore cannot hang the pane waiting for a terminal state
 *      that never arrives — which is the failure this change would otherwise have traded the wrong
 *      record for.
 *
 * `canceled` is excluded on purpose: a run the operator stopped is not a failure, and
 * `useRunStream.cancel()` already stamps its own `'canceled'` status. Marking it `failed` would
 * swap one wrong record for another.
 *
 * Historical rows are NOT retrofitted. `sites/tovu-com/chat.db` held 2 such rows on 2026-09-07 and
 * the pre-split `sites/tovu-com/content.db` copy held 6; nothing distinguishes a genuinely empty
 * successful answer from a death after the fact, so a migration could only guess. Going-forward
 * correctness is the goal.
 */
export function terminalFailureError(raw: string | undefined): Error | null {
  const outcome = readTerminalOutcome(raw);
  if (!outcome || outcome.status !== "failed") return null;
  return new Error(
    `The agent process exited without answering (exit code ${outcome.code}, signal ${outcome.signal}, resumable ${outcome.resumable}).`,
  );
}

/** Reads a terminal frame's `reason` from either stream shape without letting a malformed or absent
 *  body prevent the turn from ending: the daemon path wraps it in a `RunProtocolEventWire.payload`,
 *  the BYOK path sends a bare `{reason}`, and `subscribeToRun`'s `end` event may carry no data at
 *  all. A notice is a nicety; finishing the run is not. */
export function readTerminalReason(raw: string | undefined, wrapped: boolean): string {
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
 * Parses one blank-line-delimited SSE frame's raw text into `{event, data}`, split out as its own
 * pure function so it is directly testable with a plain string, no `ReadableStream`/reader involved.
 *
 * Returns `null` for a frame with no `data:` lines — {@link readSseFrames} skips yielding those
 * (a bare `event: ping` keepalive, for example, or a frame carrying only an `id:` field).
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
 * Splits a `text/event-stream` response body into `{event, data}` frames. Frames are
 * blank-line-delimited per the SSE spec; per-frame field parsing lives in {@link parseFrame} above.
 *
 * @complexity O(n) in response body bytes; O(1) additional buffering per chunk beyond the
 * not-yet-terminated tail of the current frame.
 * @overallScore 100
 */
export async function* readSseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
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

/** Run-id prefixes minted for runs the agent daemon does not hold: BYOK turns (`byok:`) and AG-UI
 *  turns (`agui:`). Mirrors `assistant-transport.ts`'s `BYOK_RUN_ID_PREFIX` and
 *  `assistant-transport-ag-ui.ts`'s `AG_UI_RUN_ID_PREFIX`. */
const NON_DAEMON_RUN_ID_PREFIXES = ["byok:", "agui:"] as const;

/**
 * Whether the agent daemon holds this run, so its event stream can be read at
 * `/api/runs/:id/events`. A BYOK or AG-UI run id names a turn that lived on one browser request, and
 * there is nothing server-side to watch.
 */
export function isDaemonRunId(runId: string): boolean {
  return runId.length > 0 && !NON_DAEMON_RUN_ID_PREFIXES.some((prefix) => runId.startsWith(prefix));
}

/** The plain message a run killed by a restart ends with, wherever that is noticed. */
export const RUN_INTERRUPTED_LABEL = "The assistant restarted while this answer was running, so it stopped.";
export const RUN_INTERRUPTED_DETAIL = "Anything it wrote before the restart is kept above. Send your message again to retry.";

/**
 * The visible, saved notice for a run that died with its process (a daemon or API restart).
 *
 * An event, not only an error: a run's error is live-only state, while `events_json` is what the pane
 * renders after a reload. Without the event, a restarted run reads as a bare "failed" with no reason.
 * Used by the browser (daemon answers 404), the server finalizer (the same 404), the finalizer's
 * exit flush, and the boot-time reconcile — so every path describes the same death the same way.
 */
export function runInterruptedNotice(): AgentEvent {
  return { kind: "status", label: RUN_INTERRUPTED_LABEL, detail: RUN_INTERRUPTED_DETAIL };
}

/**
 * A chat message's `content` for a list of events: its text deltas, concatenated. The exact rule
 * `@jini-ai/chat`'s `useConversation` (`assistantContentFromEvents`) applies to a live turn, so a
 * row the server finalizes reads the same as one the browser saved.
 */
export function runContentFromEvents(events: readonly AgentEvent[]): string {
  let out = "";
  for (const event of events) {
    if (event.kind === "text") out += event.text;
  }
  return out;
}

/** What one daemon stream frame means for the turn: events to append, a failure, and whether it ended. */
export interface RunFrameOutcome {
  readonly events: AgentEvent[];
  /** Set when the frame reports a failure. Once any frame has, the turn is `failed` (the browser's
   *  `useRunStream` keeps an `'error'` status through a later `onDone`). */
  readonly error?: Error;
  /** Set only on the `end` frame: the daemon's own terminal classification. */
  readonly terminal?: Extract<ChatRunStatus, "succeeded" | "failed" | "canceled">;
}

function parseWire(raw: string | undefined): RunProtocolEventWire | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RunProtocolEventWire;
  } catch {
    return null;
  }
}

function chunkEvent(raw: string | undefined): AgentEvent[] {
  const frame = parseWire(raw);
  if (!frame) return [];
  return [{ kind: "raw", line: asString((frame.payload as { chunk?: unknown } | null)?.chunk) }];
}

function endOutcome(raw: string | undefined): RunFrameOutcome {
  // Order matters and matches the browser's `end` listener: the `max_tool_turns` notice first, then
  // the failed/canceled notice, then the failure itself.
  const events: AgentEvent[] = [];
  const reasonNotice = terminalReasonNotice(readTerminalReason(raw, true));
  if (reasonNotice) events.push(reasonNotice);
  const outcomeNotice = terminalOutcomeNotice(raw);
  if (outcomeNotice) events.push(outcomeNotice);
  const error = terminalFailureError(raw);
  const outcome = readTerminalOutcome(raw);
  const terminal = outcome?.status ?? "succeeded";
  return error ? { events, error, terminal } : { events, terminal };
}

/**
 * Translates one named daemon SSE frame (`event:` name plus raw `data:` text) into its effect on the
 * turn. The browser's `subscribeToRun` dispatches the result to `RunHandlers`; the server finalizer
 * folds it into the row it saves. Never throws: a malformed frame yields no events rather than
 * stranding either reader mid-turn.
 *
 * An `error` frame with no data is a connection error, not a run error — the browser's
 * `EventSource` reports those on the same event name, so it must check for data before calling this.
 *
 * @complexity O(size of the frame).
 */
export function translateRunFrame(kind: string, raw: string | undefined): RunFrameOutcome {
  switch (kind) {
    case "agent": {
      const frame = parseWire(raw);
      const translated = frame ? translateRunAgentPayload(frame.payload as RunAgentPayload) : null;
      return { events: translated ? [translated] : [] };
    }
    case "stdout":
    case "stderr":
      // The agent CLI's own output. `stderr` is where a dying CLI says WHY it is dying.
      return { events: chunkEvent(raw) };
    case "error": {
      const frame = parseWire(raw);
      const message = asString((frame?.payload as { message?: unknown } | null)?.message);
      return { events: [], error: new Error(message || "agent run failed") };
    }
    case "end":
      return endOutcome(raw);
    default:
      return { events: [] };
  }
}
