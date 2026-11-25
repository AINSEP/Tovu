/**
 * @module assistant-transport-ag-ui
 *
 * ADR-059 — the AG-UI canary transport path `assistant-transport.ts` delegates to when its
 * Tovu-local `getAgUiEnabled` toggle is on. A third path alongside that file's existing Local CLI
 * and BYOK branches, talking to a genuinely different server surface:
 * `apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts`'s `AG_UI_RUN_PATH`, which streams real AG-UI wire events
 * — a translation layer in front of the SAME daemon-backed run lifecycle the Local CLI path uses.
 *
 * ADR-059 Decision 3 (AMENDED 2026-08-18): built on the real `@ag-ui/client`'s `HttpAgent`, which
 * owns the whole HTTP request + SSE parsing + per-event zod validation lifecycle — replacing this
 * file's own hand-rolled `fetch`/SSE-frame-parsing loop entirely. `AgUiEvent` mirrors (does not
 * import) `assistant-ag-ui.ts`'s own type of the same name, both now typed against the real
 * `@ag-ui/core` `AGUIEvent` union — `apps/admin/` and `src/server/` are separate deployable apps, so
 * there is no shared module either side can import the other's local types from.
 *
 * Two real-package behaviors that are NOT visible from its type signatures alone (found by reading
 * its compiled source, not guessed):
 *
 * 1. `HttpAgent.run(input)` returns a COLD `Observable<BaseEvent>` — nothing happens until
 *    subscribed, and it never resolves to a Promise. The existing `startRun` contract is "resolve
 *    once the run has STARTED" (matching `startByokRun`'s contract), so `agUiRunClient.startAgUiRun` races
 *    the Observable's first `next`/`error` notification against the returned Promise rather than
 *    trying to `await` the Observable directly.
 * 2. Aborting mid-stream (after headers arrive) does NOT error the Observable — it surfaces as a
 *    synthetic `RUN_ERROR` event carrying `code: "abort"` (the package's own convention), delivered
 *    through the NORMAL event path. `agUiRunClient.handleAgUiEvent` checks for that code and calls
 *    `finish()` instead of `onError`, so an intentional stop never reads as a user-facing error.
 *    Aborting BEFORE headers arrive still rejects the underlying `fetch()` itself, which DOES
 *    surface as a genuine Observable `error()` — the top-level subscription in `agUiRunClient.startAgUiRun`
 *    checks `agent.abortController.signal.aborted` for that earlier-timing case.
 */
import { HttpAgent } from "@ag-ui/client";
import { createAgUiRunClient, type AcceptedAgUiRun, type AgUiDurableLocalCliBinding, type AgUiRunClient } from "@jini-ai/chat/transports/ag-ui";
import type { RunHandlers } from "@jini-ai/chat/core";
import { browserDurableSubscriptionPorts, followDurableRun } from "./durable-run-subscription";
import { uniqueId } from "@jini-ai/admin/shell/lib/unique-id";
/** Must match `apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts`'s `AG_UI_RUN_PATH` exactly. */
export const AG_UI_RUN_PATH = "/api/admin/v1/assistant/ag-ui-run";
const CUSTOM_EVENT_NAMES = { usage: "tovu.usage", status: "tovu.status", extensionPrefix: "tovu.ext." };
/** `localStorage` key for the AG-UI canary toggle — a dev-facing flip, not an admin-settings row:
 *  this is experimental scaffolding (ADR-059), not a product setting, so it lives per-browser-tab
 *  rather than in `core.execution.*`'s settings ledger the "Execution mode" tab reads/writes. */
const AG_UI_TOGGLE_STORAGE_KEY = "tovu:assistant-ag-ui";

/**
 * Reads the AG-UI canary toggle fresh, for `AssistantDock.tsx`'s `getAgUiEnabled` callback (see
 * `CreateTovuAssistantTransportOptions.getAgUiEnabled`'s own doc for why this must be read live,
 * not captured once). `localStorage` over a build-time env var so it can be flipped per-tab from
 * devtools without a rebuild — flip it on with
 * `localStorage.setItem('tovu:assistant-ag-ui', '1')`.
 */
export function isAgUiTransportEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(AG_UI_TOGGLE_STORAGE_KEY) === "1";
}

/** Same minting as `assistant-transport.ts`'s run ids — shared through the import-free
 *  `unique-id.ts`, not imported from that module (it imports FROM this one). */
function mintAgUiId(): string {
  return uniqueId();
}

/** Distinguishes an AG-UI-run id (client-minted, no server-side run record reachable through THIS
 *  path — see module doc) from a daemon-run id or a `byok:`-prefixed id wherever a bare `runId`
 *  string is all a `ChatTransport` method receives. Mirrors `BYOK_RUN_ID_PREFIX`'s exact role. */
const AG_UI_RUN_ID_PREFIX = "agui:";

/** The two durable operations the AG-UI binding borrows from the Local CLI lifecycle: follow the
 *  canonical run through the existing checkpoint subscription, and the existing owned run-cancel. */
export interface AdminAgUiDurablePorts {
  followRun(required: AcceptedAgUiRun & { handlers: RunHandlers; signal: AbortSignal }, optional: Record<string, never>): void;
  cancelRun(required: AcceptedAgUiRun, optional: Record<string, never>): Promise<void>;
}

/** `assistant-ag-ui.ts`'s durable-identity field: a start that carries it gets the owned durable run. */
interface DurableRunProps { readonly conversationId: string; readonly assistantMessageId: string }

function durableRunProps(forwardedProps: unknown): DurableRunProps | undefined {
  const value = (forwardedProps as { durableRun?: Partial<DurableRunProps> } | null | undefined)?.durableRun;
  return typeof value?.conversationId === "string" && typeof value.assistantMessageId === "string"
    ? { conversationId: value.conversationId, assistantMessageId: value.assistantMessageId } : undefined;
}

/**
 * Binds AG-UI starts to the durable Local CLI lifecycle. The wire request names the prepared
 * message/conversation so the server accepts the one owned run for it; `RUN_STARTED` then names
 * that canonical run (not this segment), and from there the saved checkpoint is the only transcript.
 * A start without prepared identity, or a server answer that names only the segment, stays
 * delivery-only rather than pretending to be durable.
 * @complexity O(1). */
export function adminAgUiDurableBinding({ ports }: { ports: AdminAgUiDurablePorts }, _optional: Record<string, never> = {}): AgUiDurableLocalCliBinding {
  return {
    prepareRunInput: ({ wire, launch }) => {
      if (!launch.messageId || !launch.conversationId) return wire;
      const forwarded = typeof wire.forwardedProps === "object" && wire.forwardedProps !== null ? wire.forwardedProps as Record<string, unknown> : {};
      // The prepared launch's agent selection is the one the Local CLI acceptance would send.
      return { ...wire, forwardedProps: { ...forwarded, ...(launch.agentId ? { agentId: launch.agentId } : {}),
        durableRun: { conversationId: launch.conversationId, assistantMessageId: launch.messageId } } };
    },
    readAcceptedRun: ({ event, input }) => {
      const durable = durableRunProps(input.forwardedProps);
      if (!durable || event.runId === input.runId) return undefined;
      return { runId: event.runId, messageId: durable.assistantMessageId, conversationId: event.threadId };
    },
    followAcceptedRun: (required) => ports.followRun(required, {}),
    cancelAcceptedRun: (required) => ports.cancelRun(required, {}),
  };
}

/** What the dock shows when a run ends with nothing to read and nothing to blame. */
const NO_REPLY_MESSAGE = "The assistant did not reply. Send your message again.";

/**
 * One actionable terminal outcome per run for the dock. The shared client reports a repeated
 * `RUN_ERROR` frame once per frame and treats a stream that ends with no events at all as a
 * success, so a flaky or empty run would show two banners or a silent blank reply. This wrapper is
 * host-side on purpose (the shared client is neutral): it forwards the first error only, and turns
 * an empty, error-free completion into a plain error, except after an intentional Stop or a
 * detach, which must never read as a failure.
 * @complexity O(1) per callback.
 */
export function guardTerminalOutcome(
  { handlers, intentionalStop }: { handlers: RunHandlers; intentionalStop: () => boolean },
  _optional: Record<string, never> = {},
): RunHandlers {
  let errored = false;
  let sawEvent = false;
  return {
    ...handlers,
    onEvent: (event) => { sawEvent = true; handlers.onEvent(event); },
    onError: (error) => { if (errored) return; errored = true; handlers.onError(error); },
    onDone: (finalEvents) => {
      if (!errored && !sawEvent && finalEvents.length === 0 && !intentionalStop()) { errored = true; handlers.onError(new Error(NO_REPLY_MESSAGE)); }
      handlers.onDone(finalEvents);
    },
  };
}

/** The admin's AG-UI run client over the real `HttpAgent`, with its durable ports injected.
 * @complexity O(1). */
export function createAdminAgUiRunClient({ durable }: { durable: AdminAgUiDurablePorts }, _optional: Record<string, never> = {}): AgUiRunClient {
  const shared = createSharedAdminAgUiRunClient({ durable }, {});
  // A Stop through `stopAgUiRun` aborts the stream without touching the start's signals, so the
  // guard also listens to it; a pending start (no run id yet) counts as the one being stopped.
  const stopped = new Set<string>();
  let stopPending = false;
  return { ...shared,
    startAgUiRun: async (required, optional) => {
      let runId: string | undefined;
      const { input } = required;
      const intentionalStop = () => Boolean(input.signal?.aborted || input.cancelSignal?.aborted || stopPending || (runId && stopped.has(runId)));
      const started = await shared.startAgUiRun({ ...required, handlers: guardTerminalOutcome({ handlers: required.handlers, intentionalStop }, {}) }, optional);
      runId = started.runId;
      return started;
    },
    stopAgUiRun: async (required, optional) => {
      stopped.add(required.runId);
      stopPending = true;
      try { await shared.stopAgUiRun(required, optional); } finally { stopPending = false; }
    } };
}

function createSharedAdminAgUiRunClient({ durable }: { durable: AdminAgUiDurablePorts }, _optional: Record<string, never> = {}): AgUiRunClient {
  return createAgUiRunClient({ ports: { endpoint: AG_UI_RUN_PATH, runIdPrefix: AG_UI_RUN_ID_PREFIX, customEventNames: CUSTOM_EVENT_NAMES,
    mintId: () => mintAgUiId(),
    createAgent: ({ url, threadId }) => new HttpAgent({ url, threadId, fetch: (url, init) => fetch(url, { ...init, credentials: "same-origin" }) }),
    durableLocalCli: adminAgUiDurableBinding({ ports: durable }, {}),
  } }, {});
}

/** Explicit Stop of an accepted AG-UI run: the same owned `/api/runs/:runId/cancel` the Local CLI
 *  path posts to, with the message binding so a Stop racing acceptance still lands. */
async function cancelAcceptedRunOverHttp({ runId, messageId, conversationId }: AcceptedAgUiRun, _optional: Record<string, never> = {}): Promise<void> {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, messageId, conversationId }) });
  // 404: the run is already gone, so nothing is left running to stop.
  if (!response.ok && response.status !== 404) throw new Error(`Stopping the assistant failed (HTTP ${response.status}).`);
}

const client = createAdminAgUiRunClient({ durable: {
  followRun: ({ runId, messageId, conversationId, handlers, signal }) => {
    followDurableRun({ runId, handlers, signal, binding: { messageId, conversationId }, ports: browserDurableSubscriptionPorts({}, {}) }, {});
  },
  cancelRun: (required) => cancelAcceptedRunOverHttp(required, {}),
} }, {});

/** Share the same client with the main transport so stop reaches its in-flight run. */
export const agUiRunClient = client;
