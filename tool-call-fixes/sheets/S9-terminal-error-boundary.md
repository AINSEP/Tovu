# S9. One terminal JSON error answer on Tovu's daemon app (C3, mechanism M5, server half)

Repo: **Tovu only** (calls existing Jini exports; adds no Jini code). Estimate: 150k Sonnet. Prerequisites: S8.
Landed check: `rg -n "reportFailure" ../Jini/packages/mcp/src/server/daemon-client.ts`.

## Where the code lives (judge finding 3)
An Express error handler is server-framework code. The owner keeps web frameworks out of Jini, and R7 keeps the host
bearer gate, origin middleware, run-ownership gate, idle-park and the 6 MB parser as Express middleware **in Tovu**
(`R7-ROUTES.md` §3.5). So the boundary is a Tovu file. It reuses two existing Jini exports and nothing new:
`reportRouteInternalError` (`@jini-ai/http-kit`, exported from its index) and `createApiError` (`@jini-ai/protocol`).
After R7, Jini's own routes answer body errors as `Result`s through `readJsonBody`; this boundary keeps serving the
host's parser and the host's middleware, which stay Express.

Order with other work: if R7 P1 has landed, the mount point is `composition/jini-routes.ts`
(`rg -n "registerDelegatedToolRoutes|delegatedToolRoutes" apps/website/src`); otherwise the scope file. Either way the
handler file is the same. Error-system E3/E4: this sheet reports through `reportServerFailure` (Tovu's one incident
sink today, `server/inbound/shared/admin-failure.ts`); E4 makes both `reportRouteInternalError` and
`reportServerFailure` call `createErrorReporter`, so this site converts with the others and needs no second change.

## Read first
`../DESIGN.md` §2.5, M5. `rg -n "site scope is closed|a live run is required|express.json\(|requireAgentDaemonToken|next\(error\)" apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` ·
`rg -n "app.use\(\"/s/:scopeKey\"" apps/website/src/server/inbound/assistant/agent-daemon-server.ts` (the parent
forwards `next` into the scope app, so an unhandled scope error falls to Express's default HTML handler) ·
`rg -n "export function reportServerFailure" apps/website/src/server/inbound/shared/admin-failure.ts` ·
Jini `rg -n "export function reportRouteInternalError" packages/http-kit/src/internal-error.ts`.

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
1. → 500, JSON `{ error: { code: "INTERNAL_ERROR", message: "The tool service hit an internal problem before the tool ran. Do not retry the same call; give the user the error ID.", requestId: <id> } }`;
   the body does not contain `PRIVATE-CANARY`; the incident sink fake received the original error **once**, with that id.
2. → 413, `{ error: { code: "PAYLOAD_TOO_LARGE", message: "This tool call's input is larger than 6 MB. Send less content per call." } }`. No incident.
3. → 400, `{ error: { code: "BAD_REQUEST", message: "The request body was not valid JSON." } }`. No incident.
4. unchanged, byte for byte, for all three unauthenticated variants (auth still runs before the parser).
5. the flat answers become nested envelopes: `NOT_FOUND` / `a live run is required`, `SERVICE_UNAVAILABLE` /
   `site scope is closed`. Statuses unchanged. (S8 reads both shapes, so old client × new server and new client × old server both work; assert both pairs.)
6. headers already sent (a streaming route failed midway) → the handler calls `next(error)` and writes nothing (lesson 14).
7. End to end with the S8 client: answer 1 becomes a message containing `Error ID: <id>`, and the sink holds one record with the same id.

## Change (one gated commit per item)
1. New `apps/website/src/server/inbound/assistant/daemon-error-boundary.ts` (≤ 80 lines):
   `createDaemonErrorBoundary({ onInternalError }, {})` → Express `ErrorRequestHandler`. Body-parser failures are
   recognized by their documented fields (`status === 413`; `type === 'entity.parse.failed'`), everything else goes
   through `reportRouteInternalError({ report: { source: 'daemon-app', error }, logSource: 'daemon-app', message }, { onInternalError })`.
   Unit tests with fake `req`/`res` objects for cases 1, 2, 3, 6.
2. Mount it last on the scope app; `onInternalError` = `context => reportServerFailure({ error: context.error, operation: "daemon:app-boundary" }, { errorId: context.correlationId })`.
   The scope file is on the size ratchet: net growth ≤ 3 lines (`npm run check:size`).
3. Replace the three flat `res.status(...).json({ error: "…" })` answers with `createApiError` envelopes (same statuses, same words).

## Acceptance
Seven cases green with exact text; removing the boundary makes case 1 fail and removing the bearer gate makes case 4
fail (README §4.12: prove once, restore, paste); the existing run-stream (SSE) tests pass unchanged; gate green.
