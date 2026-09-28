/**
 * @file Minimal `text/event-stream` SSE frame parsing — extracted from `assistant-transport.ts`
 * (2026-08-18, ADR-059) so `assistant-transport-ag-ui.ts`'s AG-UI path reuses it instead of
 * duplicating it or creating an import cycle back into `assistant-transport.ts` (which itself
 * imports the AG-UI path's `startRun`/`reattachRun`/`stopRun`/`fetchRunStatus` functions). Pure
 * extraction: both functions have the exact bodies they had inline in that file before this split.
 *
 * A hand-rolled reader rather than `EventSource`, for both callers: `EventSource` only ever issues
 * a GET with no request body, and both the BYOK and AG-UI paths hold one POST's response open on
 * the SAME connection the browser used to send it — there is no separate URL an `EventSource` could
 * subscribe to.
 *
 * The functions themselves moved to `apps/website/src/contracts/core/assistant-run-events.ts`
 * (2026-09-27) with the rest of the daemon-stream translation, because the API's run finalizer reads
 * the same streams server-side. Same bodies; re-exported here so existing importers keep their path.
 */
export { parseFrame, readSseFrames } from "@tovu/assistant-run-events";
