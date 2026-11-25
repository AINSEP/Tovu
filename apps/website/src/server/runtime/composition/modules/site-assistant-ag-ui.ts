import { EventType } from "@ag-ui/core";
import { closeAgUiRun, createAgUiTranslationState, translateAgentEventToAgUi, type AgUiEvent, type EventIdGenerator } from "@jini-ai/chat/core/ag-ui";

/**
 * @file Negotiated wire construction for the PUBLIC site chat (P6-T1.T): which wire a visitor
 * request asked for, how its body normalizes to one turn, and the AG-UI writer for that turn.
 *
 * Both wires share one POST and one gate order in `site-assistant.ts`; this file only decides
 * shape. A widget bundle already running in an open tab keeps posting the legacy body and reading
 * `event: text|error|end|client_directive` frames — a zero cache age cannot replace a script that
 * is already executing — so the legacy writer stays for the one-release window and AG-UI is chosen
 * only when a client names it explicitly.
 */

/** The one media range that selects AG-UI. A bare `text/event-stream`, a wildcard, an absent header
 *  or this range at `q=0` all keep the legacy wire, so no old client is ever switched by accident. */
export const VISITOR_AG_UI_ACCEPT = "text/event-stream; agui=1";

/** The only interim `CUSTOM` event on the visitor wire: the bounded, resolved directive and the
 *  temporary live approval card. Not a second text or terminal protocol. */
export const VISITOR_DIRECTIVE_EVENT = "client_directive";

/** Thread/run ids are client-minted correlators, never authority; bounded so they cannot bloat logs. */
const MAX_WIRE_ID_CHARS = 128;

export type VisitorChatWire = "legacy" | "ag-ui";

function selectsAgUi({ range }: { range: string }, _optional = {}): boolean {
  const [type, ...params] = range.split(";").map((part) => part.trim().toLowerCase());
  if (type !== "text/event-stream") return false;
  const values = new Map(params.map((param) => {
    const [name = "", value = ""] = param.split("=").map((piece) => piece.trim());
    return [name, value] as const;
  }));
  if (values.get("agui") !== "1") return false;
  const quality = values.get("q");
  return quality === undefined || Number(quality) > 0;
}

/** Picks the wire a visitor request negotiated. Only the explicit AG-UI media range selects it. */
export function selectVisitorChatWire({ accept }: { accept: string | undefined }, _optional = {}): VisitorChatWire {
  if (!accept) return "legacy";
  return accept.split(",").some((range) => selectsAgUi({ range })) ? "ag-ui" : "legacy";
}

export type VisitorChatInput =
  | { ok: true; message: string; rawHistory: unknown; turnId: string | null; wireIds?: { threadId: string; runId: string } }
  | { ok: false; status: 400 | 413; code: "VALIDATION" | "TOO_LARGE"; diagnostic: string };

function boundedId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_WIRE_ID_CHARS ? value : null;
}

function readMessage({ raw, maxMessageChars }: { raw: unknown; maxMessageChars: number }): VisitorChatInput | { ok: true; message: string } {
  const message = typeof raw === "string" ? raw.trim() : "";
  if (message.length === 0) return { ok: false, status: 400, code: "VALIDATION", diagnostic: "message must be a non-empty string" };
  if (message.length > maxMessageChars) return { ok: false, status: 413, code: "TOO_LARGE", diagnostic: `message exceeds ${maxMessageChars} characters` };
  return { ok: true, message };
}

function readAgUiInput({ body, readTurnId, maxMessageChars }: { body: Record<string, unknown>; readTurnId: (required: { body: unknown }) => string | null; maxMessageChars: number }): VisitorChatInput {
  const threadId = boundedId(body.threadId);
  const runId = boundedId(body.runId);
  if (!threadId || !runId) return { ok: false, status: 400, code: "VALIDATION", diagnostic: "threadId and runId must be bounded non-empty strings" };
  const messages = Array.isArray(body.messages) ? body.messages as unknown[] : [];
  const last = messages.at(-1) as { role?: unknown; content?: unknown } | undefined;
  if (last?.role !== "user") return { ok: false, status: 400, code: "VALIDATION", diagnostic: "the last message must be the visitor's" };
  const live = readMessage({ raw: last.content, maxMessageChars });
  if (!live.ok) return live;
  // Prior entries are passive context: `resolveBoundedHistory` drops malformed ones one at a time
  // and applies the count/character limits, exactly as it does for the legacy `history` field.
  // `forwardedProps.turnId` is the only forwarded field read; client tools/context/state are not authority.
  const forwarded = body.forwardedProps && typeof body.forwardedProps === "object" ? body.forwardedProps : {};
  return { ok: true, message: (live as { message: string }).message, rawHistory: messages.slice(0, -1), turnId: readTurnId({ body: forwarded }), wireIds: { threadId, runId } };
}

/**
 * Normalizes either wire's body to one visitor turn, or a validation refusal the route answers
 * before any spend. The 2,000-character live-message guard applies to both.
 */
export function readVisitorChatInput(
  { body, wire, readTurnId, maxMessageChars }: { body: unknown; wire: VisitorChatWire; readTurnId: (required: { body: unknown }) => string | null; maxMessageChars: number },
  _optional = {},
): VisitorChatInput {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (wire === "ag-ui") return readAgUiInput({ body: record, readTurnId, maxMessageChars });
  const live = readMessage({ raw: record.message, maxMessageChars });
  if (!live.ok) return live;
  return { ok: true, message: (live as { message: string }).message, rawHistory: record.history, turnId: readTurnId({ body: record }) };
}

export type VisitorTurnOutcome = { kind: "ok"; reason: string } | { kind: "error"; message: string; code?: string; errorId?: string };

/** One visitor turn's wire, whichever format was negotiated. */
export interface VisitorTurnWriter {
  start(required?: Record<string, never>, optional?: Record<string, never>): void;
  text(required: { delta: string }, optional?: Record<string, never>): void;
  directive(required: { value: unknown }, optional?: Record<string, never>): void;
  finish(required: { outcome: VisitorTurnOutcome }, optional?: Record<string, never>): void;
  /** The provider returned: a wire that requires a terminal gets one if none was written. */
  settle(required?: Record<string, never>, optional?: Record<string, never>): void;
}

export interface VisitorAgUiCopy {
  /** The turn ended with no visible reply. Matches the widget's existing no-reply wording. */
  readonly noReply: string;
  /** The turn stopped without a terminal (dropped delivery). */
  readonly interrupted: string;
}

/**
 * The AG-UI writer for one visitor turn. One terminal latch spans the provider callback, the
 * navigation branch and the route's outer error boundary: whichever finishes first writes the only
 * `RUN_FINISHED` or `RUN_ERROR`, after closing open text. A turn that ends with no visible text is
 * a `RUN_ERROR` carrying the no-reply copy — never a success. Error messages are the reporter's
 * public message (which already carries the safe incident reference); provider detail never
 * reaches this function.
 */
export function createVisitorAgUiWriter(
  { ids, encode, write, threadId, runId, copy }: {
    ids: EventIdGenerator; encode: (event: AgUiEvent) => string; write: (chunk: string) => void;
    threadId: string; runId: string; copy: VisitorAgUiCopy;
  },
  _optional = {},
): VisitorTurnWriter {
  const state = createAgUiTranslationState({ ids, customEventNames: { usage: "usage", status: "status", extensionPrefix: "ext." } });
  const turn = { terminal: false, visible: false, pendingWhitespace: "" };
  const emit = (events: AgUiEvent[]) => { for (const event of events) write(encode(event)); };
  const terminate = (event: AgUiEvent) => { turn.terminal = true; emit([...closeAgUiRun({ state }), event]); };
  return {
    start: () => { emit([{ type: EventType.RUN_STARTED, threadId, runId }]); },
    text: ({ delta }) => {
      if (turn.terminal) return;
      // Whitespace before any visible text is held back, so a whitespace-only reply opens no
      // message and ends as the no-reply error rather than an empty success.
      if (!turn.visible && delta.trim().length === 0) { turn.pendingWhitespace += delta; return; }
      const text = turn.visible ? delta : turn.pendingWhitespace + delta;
      turn.visible = true;
      emit(translateAgentEventToAgUi({ event: { kind: "text", text }, state }));
    },
    directive: ({ value }) => {
      if (turn.terminal) return;
      emit([{ type: EventType.CUSTOM, name: VISITOR_DIRECTIVE_EVENT, value }]);
    },
    finish: ({ outcome }) => {
      if (turn.terminal) return;
      if (outcome.kind === "error") terminate({ type: EventType.RUN_ERROR, message: outcome.message, ...(outcome.code ? { code: outcome.code } : {}) });
      else if (!turn.visible) terminate({ type: EventType.RUN_ERROR, message: copy.noReply, code: "NO_REPLY" });
      else terminate({ type: EventType.RUN_FINISHED, threadId, runId, result: { reason: outcome.reason } });
    },
    settle: () => {
      if (!turn.terminal) terminate({ type: EventType.RUN_ERROR, message: copy.interrupted, code: "INTERRUPTED" });
    },
  };
}
