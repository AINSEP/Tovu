# S9. One terminal JSON error answer on Tovu's daemon app (C3, mechanism M5, server half)

Repo: **Tovu only** (calls existing Jini exports; adds no Jini code). Estimate: 150k Sonnet. Prerequisites: S8.
Blocking decision: none.
Landed check: `rg -n "reportFailure" ../Jini/packages/mcp/src/server/daemon-client.ts`.

## Where the code lives (judge finding 3)
An Express error handler is server-framework code. The owner keeps web frameworks out of Jini, and R7 keeps the host
bearer gate, origin middleware, run-ownership gate, idle-park and the 6 MB parser as Express middleware **in Tovu**
(`R7-ROUTES.md` §3.5). So the boundary is a Tovu file. It reuses existing exports and adds nothing to Jini:
`createApiError` (`@jini-ai/protocol`), Tovu's `mintToolErrorId` (`apps/website/src/assistant/tool-recovery-preset.ts:71-73`,
a wrapper over core `mintToolErrorId` from `@jini-ai/core/errors/error-id` with `node:crypto` `randomBytes`; the scope
file already imports this module) and Tovu's incident sink `reportServerFailure`.

**One id format with S8 (Opus review B4).** Revision 2 sent the boundary through `reportRouteInternalError`
(`@jini-ai/http-kit`). That function mints its own id with `randomUUID()` (Jini `packages/http-kit/src/internal-error.ts:38`)
and takes no id port, so a boundary 500 would show `Error ID: <uuid>` while S8 shows `Error ID: ERR-…` for an
unreadable answer in the same chain. The boundary therefore does not call it: it mints the id with core's
`ERR-XXXX-XXXX-XXXX-XXXX` function (the format core `createErrorReporter` uses, `core/src/errors/error-id.ts`), passes
that id to `reportServerFailure` (`{ errorId }` option, `server/inbound/shared/admin-failure.ts:52-55`) and puts the
same id in the envelope's `requestId`. Changing `reportRouteInternalError` itself is Jini code and belongs to
error-system E4, not to this sheet.
After R7, Jini's own routes answer body errors as `Result`s through `readJsonBody`; this boundary keeps serving the
host's parser and the host's middleware, which stay Express.

Order with other work: if R7 P1 has landed, the mount point is `composition/jini-routes.ts`
(`rg -n "registerDelegatedToolRoutes|delegatedToolRoutes" apps/website/src`); otherwise the scope file. Either way the
handler file is the same. Error-system E3/E4: this sheet reports through `reportServerFailure` (Tovu's one incident
sink today, `server/inbound/shared/admin-failure.ts`). When E4 makes `reportServerFailure` call `createErrorReporter`,
the boundary file does not change: E4 rebinds the two ports (`mintErrorId`, `onInternalError`) where the scope file
mounts the boundary, with its other call sites.

## Read first
`../DESIGN.md` §2.5, M5. `rg -n "site scope is closed|a live run is required|express.json\(|requireAgentDaemonToken|next\(error\)" apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` ·
`rg -n "app.use\(\"/s/:scopeKey\"" apps/website/src/server/inbound/assistant/agent-daemon-server.ts` (the parent
forwards `next` into the scope app, so an unhandled scope error falls to Express's default HTML handler) ·
`rg -n "export function reportServerFailure" apps/website/src/server/inbound/shared/admin-failure.ts` ·
`rg -n "export function mintToolErrorId" apps/website/src/assistant/tool-recovery-preset.ts` ·
Jini `rg -n "export function mintToolErrorId" packages/core/src/errors/error-id.ts`.

## Security trace first (write it in the report before editing; lesson 13)
List, in order, every middleware a `POST /api/delegated-tool-calls` request passes: scope-closed check, idle park,
bearer gate (`requireAgentDaemonToken`), 6 MB parser, run-scope middleware, run-ownership gate, durable guard, route.
The boundary is mounted **after** all of them and after every route. It must not: answer an unauthenticated caller
with anything other than today's answer; echo request bodies, headers, paths with queries or exception text; change
the status or body of any existing well-formed answer.

## Characterization (passes today), `agent-daemon-scope.error-boundary.characterization.test.ts` (harness of the durable-binding tests)
1. a registry whose `withRun` throws `new Error("PRIVATE-CANARY /home/owner/site/secret-draft.md")` → 500, HTML, not JSON.
2. a 7 MB JSON body with a valid bearer → 413, HTML.
3. malformed JSON with a valid bearer → 400, HTML.
4. no bearer, any body (including 7 MB and malformed) → today's exact status and body. Pin it; it must not change.
5. the three flat answers: 404 `{ error: "a live run is required" }` (two sites), 503 `{ error: "site scope is closed" }`.

## Red-first (fails: bodies are HTML or flat)
1. → 500, JSON `{ error: { code: "INTERNAL_ERROR", message: "The tool service hit an internal problem before the tool ran. Do not retry the same call; give the user the error ID.", requestId: "ERR-AAAA-BBBB-CCCC-DDDD" } }`
   (fake `mintErrorId` returns that value); the body does not contain `PRIVATE-CANARY`; the incident sink fake received
   the original error **once**, with that id. With the real binding the id matches `/^ERR-[0-9A-F]{4}(-[0-9A-F]{4}){3}$/`.
2. → 413, `{ error: { code: "PAYLOAD_TOO_LARGE", message: "This tool call's input is larger than 6 MB. Send less content per call." } }`. No incident.
3. → 400, `{ error: { code: "BAD_REQUEST", message: "The request body was not valid JSON." } }`. No incident.
4. unchanged, byte for byte, for all three unauthenticated variants (auth still runs before the parser).
5. the flat answers become nested envelopes: `NOT_FOUND` / `a live run is required`, `SERVICE_UNAVAILABLE` /
   `site scope is closed`. Statuses unchanged. (S8 reads both shapes, so old client × new server and new client × old server both work; assert both pairs.)
6. headers already sent (a streaming route failed midway) → the handler calls `next(error)` and writes nothing (lesson 14).
7. End to end with the S8 client: answer 1 becomes a message containing `Error ID: ERR-` followed by the id, and the
   sink holds one record with the same id. A throwing sink still yields answer 1 (the answer is never replaced).

## Change (one gated commit per item)
1. New `apps/website/src/server/inbound/assistant/daemon-error-boundary.ts` (≤ 80 lines):
   `createDaemonErrorBoundary({ mintErrorId, onInternalError }, {})` → Express `ErrorRequestHandler`, with
   `mintErrorId: () => string` and `onInternalError: (required: { error: unknown; errorId: string }) => void`.
   Body-parser failures are recognized by their documented fields (`status === 413`; `type === 'entity.parse.failed'`).
   Everything else: `errorId = mintErrorId()`, `onInternalError({ error, errorId })` inside a `try` whose `catch`
   still sends the answer and writes one `console.error` line with the id and the sink's failure class (a throwing sink
   never replaces the answer, the same rule `reportRouteInternalError` keeps), then
   `createApiError({ code: "INTERNAL_ERROR", message }, { requestId: errorId })`.
   Unit tests with fake `req`/`res` objects and a fake `mintErrorId` for cases 1, 2, 3, 6 and the throwing sink.
2. Mount it last on the scope app; `mintErrorId` = `() => mintToolErrorId({}, {})` (Tovu `tool-recovery-preset.ts`),
   `onInternalError` = `({ error, errorId }) => reportServerFailure({ error, operation: "daemon:app-boundary" }, { errorId })`.
   The scope file is on the size ratchet: net growth ≤ 3 lines (`npm run check:size`).
3. Replace the three flat `res.status(...).json({ error: "…" })` answers with `createApiError` envelopes (same statuses, same words).

## Acceptance
Seven cases green with exact text; every id this sheet shows has core's `ERR-` format (no `randomUUID` in the new file:
`rg -n "randomUUID" apps/website/src/server/inbound/assistant/daemon-error-boundary.ts` prints nothing); removing the boundary makes case 1 fail and removing the bearer gate makes case 4
fail (README §4.12: prove once, restore, paste); the existing run-stream (SSE) tests pass unchanged; gate green.
