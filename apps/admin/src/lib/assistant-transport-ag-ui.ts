/**
 * @module assistant-transport-ag-ui
 *
 * ADR-059 — the AG-UI canary transport path `assistant-transport.ts` delegates to when its
 * Tovu-local `getAgUiEnabled` toggle is on. A third path alongside that file's existing Local CLI
 * and BYOK branches, talking to a genuinely different server surface:
 * `src/server/modules/assistant-ag-ui.ts`'s `AG_UI_RUN_PATH`, which streams real AG-UI wire events
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
 *    once the run has STARTED" (matching `startByokRun`'s contract), so {@link startAgUiRun} races
 *    the Observable's first `next`/`error` notification against the returned Promise rather than
 *    trying to `await` the Observable directly.
 * 2. Aborting mid-stream (after headers arrive) does NOT error the Observable — it surfaces as a
 *    synthetic `RUN_ERROR` event carrying `code: "abort"` (the package's own convention), delivered
 *    through the NORMAL event path. {@link handleAgUiEvent} checks for that code and calls
 *    `finish()` instead of `onError`, so an intentional stop never reads as a user-facing error.
 *    Aborting BEFORE headers arrive still rejects the underlying `fetch()` itself, which DOES
 *    surface as a genuine Observable `error()` — the top-level subscription in {@link startAgUiRun}
 *    checks `agent.abortController.signal.aborted` for that earlier-timing case.
 */
import { HttpAgent } from "@ag-ui/client";
import { createAgUiRunClient } from "@jini-ai/chat/transports/ag-ui";
import { createAgUiToAgentTranslationState as createState, translateAgUiEventToAgentEvent as translateEvent } from "@jini-ai/chat/core/ag-ui";
import type { AgUiEvent, AgUiToAgentTranslationState } from "@jini-ai/chat/core/ag-ui";
import type { StartRunInput, RunHandlers } from "@jini-ai/chat/core";
export type { AgUiEvent, AgUiToAgentTranslationState } from "@jini-ai/chat/core/ag-ui";
/** Must match `src/server/modules/assistant-ag-ui.ts`'s `AG_UI_RUN_PATH` exactly. */
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


/** Same fallback as `mintByokRunId` (`assistant-transport.ts`) for a browser without
 *  `crypto.randomUUID`. Kept as its own copy rather than imported, to avoid the same import-cycle
 *  concern `sse-frames.ts`'s extraction was made to avoid (`assistant-transport.ts` imports FROM
 *  this module). */
function mintAgUiId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}


/** Distinguishes an AG-UI-run id (client-minted, no server-side run record reachable through THIS
 *  path — see module doc) from a daemon-run id or a `byok:`-prefixed id wherever a bare `runId`
 *  string is all a `ChatTransport` method receives. Mirrors `BYOK_RUN_ID_PREFIX`'s exact role. */
const AG_UI_RUN_ID_PREFIX = "agui:";

const client = createAgUiRunClient({ ports: { endpoint: AG_UI_RUN_PATH, runIdPrefix: AG_UI_RUN_ID_PREFIX, customEventNames: CUSTOM_EVENT_NAMES,
 mintId: () => mintAgUiId(),
 createAgent: ({ url, threadId }) => new HttpAgent({ url, threadId, fetch: (url, init) => fetch(url, { ...init, credentials: "same-origin" }) }),
} }, {});


export function isAgUiRunId(runId: string) { return client.isAgUiRunId({ runId }, {}); }
export function createAgUiToAgentTranslationState() { return createState({ customEventNames: CUSTOM_EVENT_NAMES }, {}); }
export function translateAgUiEventToAgentEvent(event: AgUiEvent, state: AgUiToAgentTranslationState) { return translateEvent({ event, state }, {}); }
export function handleAgUiEvent(event: AgUiEvent, ctx: Parameters<typeof client.handleAgUiEvent>[0]["ctx"]) { return client.handleAgUiEvent({ event, ctx }, {}); }
export function startAgUiRun(input: StartRunInput, handlers: RunHandlers) { return client.startAgUiRun({ input, handlers }, {}); }
export function reattachAgUiRun(handlers: RunHandlers) { return client.reattachAgUiRun({ handlers }, {}); }
export function fetchAgUiRunStatus() { return client.fetchAgUiRunStatus({}, {}); }
export function stopAgUiRun(runId: string) { return client.stopAgUiRun({ runId }, {}); }

/** Share the same client with the main transport so stop reaches its in-flight run. */
export const agUiRunClient = client;
