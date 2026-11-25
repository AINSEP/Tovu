import type { TrackerSpan } from "@jini-ai/core/contracts/site/diagnostics-observability";
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

import { readAgUiLaunchFields, type AgUiLaunchFields } from "./assistant-ag-ui-launch.js";
import { resolveAgUiRunInput, type AgUiChatMessage, type AgUiRunBody, type AgUiRunInput } from "@jini-ai/chat/server/ag-ui/run-input";
import {
  closeAgUiRun,
  confirmationInterrupt,
  createAgUiTranslationState,
  drainRunFramesToAgUi,
  readConfirmationResume,
  type AgUiEvent,
  type CustomEventNames,
  type EventIdGenerator,
} from "@jini-ai/chat/core/ag-ui";

import { RUN_NOTICES } from "#src/contracts/core/assistant-run-events";
import { getAuthedPrincipal, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";
import { cancelDaemonRunBestEffort, fetchAgentDaemon, fetchAgentDaemonEventStream, type DaemonCallOptions } from "./assistant-daemon-client.js";
import { redactedTovuError } from "@tovu/contracts/diagnostics-redaction";
import { assistantDaemonToken } from "../../lifecycle/assistant-daemon-connection.js";
import type { ServerModuleHandle } from "./types.js";
import { acceptOwnedAssistantRun, assistantRunAcceptancePorts, type AssistantRunAcceptancePorts } from "./assistant-run-acceptance.js";
import { SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { MCP_UI_TOOL_CALLS_PATH, RUN_PRINCIPAL_HEADER } from "#src/assistant/index";
import { ADMIN_APPROVAL_EXPIRED, type AdminAgUiApprovals, type AdminApprovalCheckpoint, type AnswerAdminExchange } from "#src/assistant/admin-ag-ui-approvals";
import { getAgentDaemonUrl } from "../../lifecycle/agent-daemon-port.js";
import { readAdminApprovalCard, tapSseCursor } from "./assistant-ag-ui-approval-segment.js";

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

/** The durable identity a durable-aware client sends in `forwardedProps.durableRun`: the
 *  conversation and the assistant message it already created. Bounded here, before acceptance. */
interface AgUiDurableIdentity { readonly conversationId: string; readonly assistantMessageId: string; readonly launch: AgUiLaunchFields }
const DURABLE_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

function readDurableIdentity({ body }: { body: AgUiRunBody }, _optional = {}): AgUiDurableIdentity | undefined {
  const props = body.forwardedProps;
  const durable = typeof props === "object" && props !== null ? (props as { durableRun?: unknown }).durableRun : undefined;
  if (typeof durable !== "object" || durable === null) return undefined;
  const { conversationId, assistantMessageId } = durable as Record<string, unknown>;
  if (typeof conversationId !== "string" || typeof assistantMessageId !== "string") return undefined;
  return DURABLE_ID.test(conversationId) && DURABLE_ID.test(assistantMessageId) ? { conversationId, assistantMessageId, launch: readAgUiLaunchFields({ durable }, {}) } : undefined;
}

/** The daemon context, built only from server-parsed fields: the verified principal is stamped
 *  here, and nothing browser-owned (a claimed principal, recovery mode or recovery session) is
 *  copied through, matching `assistant.ts`'s `proxyRunStart`. */
function agUiContextRef({ run, principalId }: { run: AgUiRunInput; principalId: string }, { identity }: { identity?: AgUiDurableIdentity } = {}): string {
  const prompt = flattenMessagesToPrompt({ messages: run.messages });
  return JSON.stringify({ prompt, userPrompt: run.messages.at(-1)?.content, principalId,
    // Bounded launch fields only (attachments, plugins, model, reasoning); never browser authority.
    ...(identity ? { ...identity.launch, conversationId: identity.conversationId, assistantMessageId: identity.assistantMessageId } : {}),
    ...(run.frontendBindToken ? { frontendBindToken: run.frontendBindToken } : {}),
    ...(run.frontendTabId ? { frontendTabId: run.frontendTabId } : {}),
    ...(run.secretRedacted ? { secretRedacted: true } : {}) });
}

type AgUiRouteDeps = Pick<RouteDeps, "tracker" | "observability" | "chatRunLedger" | "workspaceId">
  & Pick<Parameters<typeof assistantRunAcceptancePorts>[0]["deps"], "assistantDaemonDemand">;

/** The durable start: accept (or replay) the owned run through the same acceptance `/api/runs`
 *  uses, then follow THAT run's events. `RUN_STARTED` carries the durable run id and the accepted
 *  conversation, so a reopened client follows the actual run instead of a per-request segment.
 *
 *  Disconnect here is a detach, never a Stop: it closes only this reader's subscription and the
 *  run keeps going under its finalizer. Explicit Stop is the owned cancel at
 *  `/api/runs/:runId/cancel`, which also covers a Stop that lands before acceptance by message id.
 * @complexity O(h) in bounded history plus the drained run frames. */
async function handleDurableAgUiRun(
  { req, res, run, identity, ports, deps }: { req: Request; res: Response; run: AgUiRunInput; identity: AgUiDurableIdentity; ports: AssistantRunAcceptancePorts; deps: AgUiRouteDeps },
  { approvals }: { approvals?: AdminAgUiApprovals } = {},
): Promise<void> {
  const principalId = getAuthedPrincipal(res).id;
  const accepted = await acceptOwnedAssistantRun({ principalId, workspaceId: deps.workspaceId, ports,
    conversationId: identity.conversationId, messageId: identity.assistantMessageId,
    request: { ...(run.agentId ? { agentId: run.agentId } : {}), contextRef: agUiContextRef({ run, principalId }, { identity }) } }, {});
  if (!accepted) { res.status(404).json({ error: "not found", code: "NOT_FOUND" }); return; }
  if (accepted.message.runStatus === "canceled") { answerStoppedAgUiRun({ req, res, run, accepted }, {}); return; }
  await followDaemonRun({ req, res, requestId: run.requestId, threadId: accepted.conversationId, runId: accepted.runId, daemonRunId: accepted.runId,
    owner: principalId, observability: deps.observability, ...(approvals ? { approvals } : {}) }, {});
}

/** One AG-UI segment of an owned daemon run: subscribe (from `cursor`, when resuming), then drain.
 *  Closing this response detaches the reader only; the run is never cancelled here.
 * @complexity O(n) in the drained run frames. */
async function followDaemonRun(
  { req, res, requestId, threadId, runId, daemonRunId, owner, observability, approvals, parentRunId }: {
    req: Request; res: Response; requestId: string; threadId: string; runId: string; daemonRunId: string; owner: string;
    observability: AgUiRouteDeps["observability"]; approvals?: AdminAgUiApprovals; parentRunId?: string;
  },
  _optional = {},
): Promise<void> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let detached = false;
  res.on("close", () => { detached = true; reader?.cancel().catch(() => undefined); });
  const subscribed = await subscribeToDaemonEvents(req, res, daemonRunId, { observability });
  if (!subscribed) return;
  if (detached) { await subscribed.cancel().catch(() => undefined); return; }
  reader = subscribed;
  beginAgUiStream(req, res, requestId);
  writeAgUiEvent(res, { type: EventType.RUN_STARTED, threadId, runId, ...(parentRunId ? { parentRunId } : {}) });
  await drainAdminSegment({ res, reader: subscribed, threadId, runId, daemonRunId, owner, ...(approvals ? { approvals } : {}) }, {});
}

/**
 * Drains one segment. With the resume path composed, an identified approval card parks FIRST (owner,
 * thread, this segment's run id, daemon run, exchange, stream cursor, deadline); then the card itself
 * streams exactly as on the ordinary path (the existing approval card renders unchanged), and the
 * segment ends with the AG-UI interrupt (`RUN_FINISHED`, `outcome.type: "interrupt"`) naming that
 * card's exchange, so the client routes THAT card's decision to the AG-UI resume.
 * Without it — or when the caps refuse the park — the card streams as an ordinary card, as before.
 * @complexity O(n) in the drained run frames. */
async function drainAdminSegment(
  { res, reader, threadId, runId, daemonRunId, owner, approvals }: {
    res: Response; reader: ReadableStreamDefaultReader<Uint8Array>; threadId: string; runId: string; daemonRunId: string; owner: string; approvals?: AdminAgUiApprovals;
  },
  _optional = {},
): Promise<void> {
  const tap = approvals ? tapSseCursor({ reader }) : { reader, cursor: (): string | undefined => undefined };
  const state = createAgUiTranslationState(AG_UI_TRANSLATION);
  let parked = false;
  const write = (event: AgUiEvent): void => {
    // After the interrupt this segment is over; the drain's own words for the detached stream
    // (an "interrupted" RUN_ERROR) describe our deliberate close, not the turn, so they are dropped.
    if (parked) return;
    const card = approvals ? readAdminApprovalCard({ event, extensionPrefix: AG_UI_TRANSLATION.customEventNames.extensionPrefix }) : undefined;
    const cursor = tap.cursor();
    const interruptId = card ? approvals?.parkAdminApproval({ owner, threadId, runId, daemonRunId, card, ...(cursor ? { cursor } : {}) }) : undefined;
    writeAgUiEvent(res, event);
    if (!card || !interruptId) return;
    parked = true;
    for (const closing of closeAgUiRun({ state })) writeAgUiEvent(res, closing);
    // `metadata.exchangeId` only tells the client which rendered card this interrupt is; it is not
    // authority. The exchange id already rides inside the card HTML today, the resume body never
    // supplies it (the parked record does), and the daemon checks the run principal on every
    // exchange answer — so knowing it lets nobody answer someone else's approval.
    writeAgUiEvent(res, confirmationInterrupt({ threadId, runId,
      interrupt: { id: interruptId, reason: "confirmation", message: card.message, metadata: { exchangeId: card.exchangeId } } }));
    // Detach, never Stop: the held tool call keeps waiting in the daemon for the resume.
    void reader.cancel().catch(() => undefined);
  };
  await drainRunFramesToAgUi({ reader: tap.reader, threadId, runId, state, notices: RUN_NOTICES, write },
    { interruptionMessage: AG_UI_INTERRUPTION_MESSAGE, failureMessage: AG_UI_FAILURE_MESSAGE });
  res.end();
}

/** The daemon's existing guarded answer for one exchange (`mcp-ui/tool-calls`, exchange delivery),
 *  as the parked owner: the bearer says "Tovu's proxy", the principal header says "for this admin",
 *  and the daemon compares it with the exchange's binding. `cancel` is the daemon's deny path.
 * @complexity O(1) plus one daemon request. */
export const answerDaemonApprovalExchange: AnswerAdminExchange = async ({ owner, toolId, exchangeId, allow }) => {
  const token = assistantDaemonToken({}, {});
  const response = await fetch(`${getAgentDaemonUrl()}${MCP_UI_TOOL_CALLS_PATH}`, { method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: owner, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ toolName: toolId, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: allow ? "confirm" : "cancel" } }) }).catch(() => null);
  return response?.ok === true;
};

const MAX_WIRE_ID_CHARS = 128;

/** Only the addressing fields of an untrusted resume: one entry, bounded ids. The decision is read
 *  later by Jini against the parked binding. */
function addressedAdminResume({ body }: { body: unknown }, _optional = {}): { interruptId: string; runId: string } | undefined {
  const { resume, runId } = (body ?? {}) as { resume?: unknown; runId?: unknown };
  if (!Array.isArray(resume) || resume.length !== 1) return undefined;
  const interruptId = (resume[0] as { interruptId?: unknown } | null)?.interruptId;
  const bounded = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= MAX_WIRE_ID_CHARS;
  return bounded(interruptId) && bounded(runId) ? { interruptId, runId } : undefined;
}

/** Validates a resume against its parked record before anything is consumed: the session owner (never
 *  a body field), thread, parent run, interrupt id, a fresh run id and a recognized decision. */
function validAdminResume(
  { body, owner, approvals }: { body: unknown; owner: string; approvals: AdminAgUiApprovals }, _optional = {},
): { parked: AdminApprovalCheckpoint; interruptId: string; runId: string; decision: "allow" | "deny" } | undefined {
  const addressed = addressedAdminResume({ body });
  const parked = addressed ? approvals.peekAdminApproval({ interruptId: addressed.interruptId }) : undefined;
  if (!addressed || !parked || parked.owner !== owner || addressed.runId === parked.parentRunId) return undefined;
  const answer = readConfirmationResume({ input: body, threadId: parked.threadId, runId: parked.parentRunId, interruptId: addressed.interruptId });
  return answer ? { parked, ...addressed, decision: answer.decision } : undefined;
}

/**
 * The resume branch of the AG-UI route, before any run start or acceptance. The approval owner is
 * the authenticated admin session (the route's session gate ran first; there is no ownerless
 * fallback). Valid → claim and answer the daemon's exchange once → follow the SAME daemon run in a
 * new segment (the resume's own run id, the original thread, `parentRunId` = the interrupted run),
 * reconnecting from the park cursor. Anything else → the one plain refusal, consuming nothing.
 * @complexity O(1) plus the followed segment. */
export async function handleAdminAgUiResume(
  { req, res, ports }: { req: Request; res: Response; ports: { approvals: AdminAgUiApprovals; observability: AgUiRouteDeps["observability"] } },
  _optional = {},
): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const owner = getAuthedPrincipal(res).id;
  const valid = validAdminResume({ body: req.body, owner, approvals: ports.approvals });
  const result = valid ? await ports.approvals.redeemAgUiApproval({ owner, threadId: valid.parked.threadId, parentRunId: valid.parked.parentRunId,
    interruptId: valid.interruptId, decision: valid.decision }) : "expired";
  if (!valid || result === "expired") { if (!res.headersSent) res.status(400).json({ error: ADMIN_APPROVAL_EXPIRED }); return; }
  // The reconnect cursor is the park checkpoint, never a browser-chosen `Last-Event-ID`.
  delete req.headers["last-event-id"];
  if (valid.parked.cursor) req.headers["last-event-id"] = valid.parked.cursor;
  await followDaemonRun({ req, res, requestId: randomUUID(), threadId: valid.parked.threadId, runId: valid.runId, parentRunId: valid.parked.parentRunId,
    daemonRunId: valid.parked.daemonRunId, owner, observability: ports.observability, approvals: ports.approvals }, {});
}

/** A Stop that beat acceptance (by message id) leaves a terminal tombstone the acceptance replays
 *  without launching anything, so there is no daemon stream to follow. Answer it as the ordinary
 *  end of an intentionally stopped run — never as an error banner — and let the client read the
 *  saved "Stopped." message from the existing checkpoint.
 * @complexity O(1). */
function answerStoppedAgUiRun(
  { req, res, run, accepted }: { req: Request; res: Response; run: AgUiRunInput; accepted: { runId: string; conversationId: string } }, _optional = {},
): void {
  beginAgUiStream(req, res, run.requestId);
  writeAgUiEvent(res, { type: EventType.RUN_STARTED, threadId: accepted.conversationId, runId: accepted.runId });
  writeAgUiEvent(res, { type: EventType.RUN_FINISHED, threadId: accepted.conversationId, runId: accepted.runId });
  res.end();
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
  daemon: DaemonCallOptions & { reporter: Pick<RouteDeps["tracker"], "error"> },
): Promise<{ ok: true; daemonRunId: string } | { ok: false }> {
  const startUpstream = await fetchAgentDaemon(req, res, {
    path: "/api/runs",
    method: "POST",
    body: { contextRef: agUiContextRef({ run, principalId }), agentId: run.agentId },
    observability: daemon.observability,
  });
  if (!startUpstream) return { ok: false }; // fetchAgentDaemon already wrote a 503/502.

  if (!startUpstream.ok) {
    await refuseDaemonStart({ res, upstream: startUpstream, reporter: daemon.reporter });
    return { ok: false };
  }
  const { run: daemonRun } = (await startUpstream.json()) as { run: { id: string } };
  return { ok: true, daemonRunId: daemonRun.id };
}

/** A daemon refusal code the browser can act on (a busy slot, a missing agent). Anything that is
 *  not a bare upper-snake code — prose, paths, keys — stays private. */
const SAFE_REFUSAL_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

function readSafeRefusalCode({ body }: { body: string }, _optional = {}): string | undefined {
  try {
    const code = (JSON.parse(body) as { code?: unknown } | null)?.code;
    return typeof code === "string" && SAFE_REFUSAL_CODE.test(code) ? code : undefined;
  } catch {
    return undefined; // A non-JSON refusal still answers with the daemon's status and the report id.
  }
}

/** Answers a daemon start refusal without its raw body: the public route carries the daemon's
 *  status, a known refusal code and a report reference; the redacted detail goes only to the host
 *  reporter under that same reference, so support can find it without the browser ever seeing it.
 * @complexity O(n) in the bounded refusal body. */
async function refuseDaemonStart(
  { res, upstream, reporter }: { res: Response; upstream: globalThis.Response; reporter: Pick<RouteDeps["tracker"], "error"> }, _optional = {},
): Promise<void> {
  const reportId = randomUUID();
  const body = (await upstream.text().catch(() => "")).slice(0, 4096);
  const exactSecrets = [assistantDaemonToken({}, {})].filter((value): value is string => Boolean(value));
  reporter.error({ error: redactedTovuError({ error: new Error(`AG-UI daemon start refused: HTTP ${upstream.status}; ${body}`) }, { exactSecrets }) },
    { context: { operation: "assistant.run", exactSecrets, attributes: { "tovu.report_id": reportId } } });
  const reason = readSafeRefusalCode({ body });
  res.status(upstream.status).json({ error: AG_UI_START_REFUSAL_MESSAGE, code: "DAEMON_START_FAILED", ...(reason ? { reason } : {}), reportId });
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

async function handleAgUiRun(req: Request, res: Response, deps: AgUiRouteDeps, { approvals }: { approvals?: AdminAgUiApprovals } = {}): Promise<void> {
  // A resume answers a parked approval and starts nothing. Without the composed resume path no
  // interrupt was ever emitted, so a resume-shaped body keeps today's handling.
  if (approvals && Array.isArray((req.body as { resume?: unknown } | undefined)?.resume)) {
    return handleAdminAgUiResume({ req, res, ports: { approvals, observability: deps.observability } }, {});
  }
  const body = (req.body ?? {}) as AgUiRunBody;
  const run = resolveAgUiRunInput({ body, maxHistoryMessages: MAX_HISTORY_MESSAGES, ids: { newId: randomUUID } });
  if (!run) {
    res.status(400).json({ error: "'messages' must end with a non-empty user message", code: "VALIDATION_ERROR" });
    return undefined;
  }
  // Clients that send durable identity get the owned durable run; clients without it keep the
  // legacy per-request start during the handoff (they do not have parity, and are not told so).
  const identity = readDurableIdentity({ body });
  const ports = identity ? assistantRunAcceptancePorts({ deps, principalId: getAuthedPrincipal(res).id }, {}) : null;
  if (identity && ports) return handleDurableAgUiRun({ req, res, run, identity, ports, deps }, approvals ? { approvals } : {});
  return handleLegacyAgUiRun({ req, res, run, deps }, {});
}

/** The legacy per-request run's mutable lifecycle, shared by its close handler and its stream. */
interface LegacyAgUiRunState {
  daemonRunId: string | null;
  // One agent-run span per daemon run (its own trace root, like the finalizer's), ended exactly once:
  // canceled by the close handler, failed if the subscribe fails, else the drain's own outcome.
  runTracker: TrackerSpan<AgentRunTrackingOutcome>;
  runFinished: boolean;
  closedEarly: boolean;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
}

type LegacyDaemonCall = DaemonCallOptions & { reporter: Pick<RouteDeps["tracker"], "error"> };

/** Arms the legacy run's close handler before either daemon call.
 *
 * Cancels the DAEMON run, not just this response's own SSE subscription (MEDIUM audit finding,
 * 2026-08-19 Codex sol bug/architecture audit; RE-AUDITED 2026-08-19 by both `gpt-5.6-sol` and
 * `gpt-5.6-terra`): the first fix armed `res.on("close")` only after BOTH `startDaemonRun` and
 * `subscribeToDaemonEvents` had already resolved. Two windows still leaked an orphaned daemon run:
 * (1) a client abort while either of those `await`s was still pending was missed permanently,
 * since nothing was listening for `"close"` yet; (2) a subscribe HTTP failure (the 502 branch
 * of `subscribeToDaemonEvents`) ends this response NORMALLY from the server's own point of view, so it looked identical
 * to a successful `drainRunFramesToAgUi` finish and never triggered a cancel either.
 *
 * The handler is registered here, before either daemon call, so no window is uncovered. It cannot
 * cancel before a daemon run actually exists, so `daemonRunId` starts `null`; if `"close"` fires
 * in that gap, `closedEarly` remembers it and the check right after `startDaemonRun` resolves
 * fires the cancel retroactively — the two can't race because JS's single-threaded execution
 * serializes "close fires first" against "the await resolves first," and either ordering leaves
 * the daemon run cancelled exactly once.
 *
 * `runFinished` (not `res.writableEnded`) is what distinguishes "the run reached its own terminal
 * state" from "this response ended early while the run is still executing" — both leave
 * `writableEnded === true`, which is exactly why the previous fix's guard missed case (2) above.
 * It is set `true` only once `drainRunFramesToAgUi` has actually driven the run to completion (terminal
 * frame, natural stream close, or a read error that already unwound the daemon side), synchronously
 * before this function returns and therefore strictly before the async `"close"` event can fire —
 * so an ordinary successful run still issues zero cancel calls, per this fix's own regression test.
 * @complexity O(1). */
function armLegacyCancelOnClose(
  { req, res, state, daemon }: { req: Request; res: Response; state: LegacyAgUiRunState; daemon: LegacyDaemonCall }, _optional = {},
): void {
  res.on("close", () => {
    // Closing the response already ends this reader; cancellation is best-effort cleanup.
    state.reader?.cancel().catch(() => undefined);
    if (state.runFinished) return;
    if (state.daemonRunId) {
      state.runTracker.setOutcome({ status: "canceled" });
      cancelDaemonRunBestEffort(req, res, state.daemonRunId, daemon);
    } else state.closedEarly = true;
  });
}

/** The legacy start for canary clients without durable identity: one per-request daemon run whose
 *  response close cancels it.
 * @complexity O(h) in bounded history plus the drained run frames. */
async function handleLegacyAgUiRun(
  { req, res, run, deps }: { req: Request; res: Response; run: AgUiRunInput; deps: AgUiRouteDeps }, _optional = {},
): Promise<void> {
  const daemon: LegacyDaemonCall = { observability: deps.observability, reporter: deps.tracker };
  const state: LegacyAgUiRunState = { daemonRunId: null, runTracker: UNSTARTED_RUN, runFinished: false, closedEarly: false, reader: null };
  armLegacyCancelOnClose({ req, res, state, daemon }, {});

  // Start the real daemon run BEFORE switching this response into SSE mode — a daemon failure at
  // this point can still answer with an ordinary JSON error status, which is no longer possible
  // once headers have been flushed for the event stream below.
  const principal = getAuthedPrincipal(res);
  const started = await startDaemonRun(req, res, run, principal.id, daemon);
  if (!started.ok) return undefined;
  state.daemonRunId = started.daemonRunId;
  return deps.tracker.trace({ name: "assistant.run",
    run: (span) => streamLegacyDaemonRun({ req, res, run, daemonRunId: started.daemonRunId, span, state, daemon }, {}) },
  { agent: { runId: started.daemonRunId, conversationId: run.threadId, agentName: run.agentId } });
}

/** Subscribes and drains one started legacy daemon run under its tracker span.
 * @complexity O(n) in the drained run frames. */
async function streamLegacyDaemonRun(
  { req, res, run, daemonRunId, span, state, daemon }:
  { req: Request; res: Response; run: AgUiRunInput; daemonRunId: string; span: TrackerSpan<AgentRunTrackingOutcome>; state: LegacyAgUiRunState; daemon: LegacyDaemonCall },
  _optional = {},
): Promise<void> {
  state.runTracker = span;
  if (state.closedEarly) {
    span.setOutcome({ status: "canceled" });
    cancelDaemonRunBestEffort(req, res, daemonRunId, daemon);
    return;
  }

  const subscribedReader = await subscribeToDaemonEvents(req, res, daemonRunId, daemon);
  if (!subscribedReader) {
    span.setOutcome({ status: "failed" });
    return;
  }
  state.reader = subscribedReader;

  beginAgUiStream(req, res, run.requestId);
  writeAgUiEvent(res, { type: EventType.RUN_STARTED, threadId: run.threadId, runId: run.runId });

  const translation = createAgUiTranslationState(AG_UI_TRANSLATION);
  const outcome = await drainRunFramesToAgUi({ reader: subscribedReader, threadId: run.threadId, runId: run.runId, state: translation,
    notices: RUN_NOTICES, write: (event) => writeAgUiEvent(res, event) }, { interruptionMessage: AG_UI_INTERRUPTION_MESSAGE, failureMessage: AG_UI_FAILURE_MESSAGE });
  state.runFinished = true;
  res.end();
  span.setOutcome(outcome);
}

/** The owner-approved RUN_ERROR words for a daemon stream that drops mid-run (bugs1 T4). The
 *  transport's own message stays private: Jini's drain returns it to the run tracker only. */
const AG_UI_INTERRUPTION_MESSAGE = "The assistant’s response was interrupted. Send your request again.";

/** The plain sentence for a run the daemon refused to start; its own reason stays at the reporter. */
const AG_UI_START_REFUSAL_MESSAGE = "The assistant could not start that request. Send it again; if it keeps failing, restart the site.";

/** The plain sentence for a run the daemon reported as failed. The daemon's own wording (exit
 *  codes, transport errors) is not shown here; it stays in the run's status line and the logs. */
const AG_UI_FAILURE_MESSAGE = "The assistant could not finish that request. Send it again, or try a shorter request.";

/** `approvals` composes the approval park/resume (P6-T2.T). Absent, approval cards stream as
 *  ordinary cards and no interrupt is ever emitted — the pre-resume behavior. */
export function createAssistantAgUiModule(routeDeps: RouteDeps & AgUiRouteDeps, { approvals }: { approvals?: AdminAgUiApprovals } = {}): ServerModuleHandle {
  return {
    name: "assistant-ag-ui",
    registerRoutes: ({ app }, _options = {}) => {
      app.use(AG_UI_RUN_PATH, requireAdminSession(routeDeps));
      app.post(AG_UI_RUN_PATH, (req: Request, res: Response, next: NextFunction) => {
        void handleAgUiRun(req, res, routeDeps, approvals ? { approvals } : {}).catch((error: unknown) => {
          console.error("[assistant-ag-ui] unhandled error", error);
          routeDeps.tracker.error({ error: error instanceof Error ? error : redactedTovuError({ error }) }, { context: { operation: "assistant.run" } });
          if (res.headersSent) {
            writeAgUiEvent(res, { type: EventType.RUN_ERROR, message: AG_UI_FAILURE_MESSAGE });
            res.end();
          } else {
            next(error);
          }
        });
      });
    },
  };
}
