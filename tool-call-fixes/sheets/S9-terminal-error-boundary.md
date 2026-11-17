# S9. One terminal JSON error boundary on the daemon app (C3, mechanism M5, server half)

Repos: Jini (`http-kit`), Tovu. Estimate: 170k Sonnet. Prerequisites: S8 merged. Preferred after error-system E4
(then the boundary's incident goes through the reporter with no further change). If E4 has not landed, use
`reportRouteInternalError` as it is today; E4 converts it with its other call sites. Also order after R7 P1 if that has
landed (the mount point moves to `composition/jini-routes.ts`); otherwise mount in the scope file and tell R7's owner.

## Read first
`../DESIGN.md` §2.5, M5. Jini `http-kit/src/internal-error.ts` (`reportRouteInternalError`), `http-kit/src/adapter.ts`
(`mountJsonRoute`). Tovu `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` (the middleware chain from
"site scope is closed" to `registerDelegatedToolRoutes`), `agent-daemon-server.ts` (does the parent app handle errors?).

## Security trace first (write it in the report before editing)
List, in order, every middleware a `POST /api/delegated-tool-calls` request passes (bearer gate, body parser and its
limit, run-credential match, run-scope middleware, route). The boundary is mounted **after** all routes. It must not:
answer before the bearer gate for an unauthenticated caller with anything more than today's answer; echo request
bodies, headers or paths with queries; change any status of an existing well-formed answer.

## Characterization (passes today)
`agent-daemon-scope.error-boundary.characterization.test.ts` (same harness as the existing durable-binding tests):
1. a registry whose `withRun` throws → status 500, `content-type` is HTML, body is not JSON.
2. a 7 MB JSON body → status 413, HTML.
3. malformed JSON → status 400, HTML.
4. an unauthenticated request → today's exact status and body (pin it; must not change).

## Red-first (fails: bodies are HTML / flat)
1. → 500, JSON `{ error: { code: "INTERNAL_ERROR", message: "The tool service hit an internal problem before the tool ran. Do not retry the same call; give the user the error ID.", requestId: <id> } }`, and the host sink fake received the original error once.
2. → 413, `{ error: { code: "PAYLOAD_TOO_LARGE", message: "This tool call's input is larger than 6 MB. Send less content per call." } }`.
3. → 400, `{ error: { code: "BAD_REQUEST", message: "The request body was not valid JSON." } }`.
4. unchanged, byte for byte.
5. the three flat answers become envelopes with codes: `NOT_FOUND` / `a live run is required`, `SERVICE_UNAVAILABLE` / `site scope is closed`, `COMPONENT_CATALOG_UNAVAILABLE` unchanged in text.
End to end: the S8 client turns answer 1 into a message containing `Error ID: <id>`.

## Change
1. Jini `http-kit/src/json-error-boundary.ts` (new): `mountJsonErrorBoundary({ app }, { onInternalError, logSource, bodyLimitLabel })`. A four-argument Express handler; maps body-parser error types by their documented `type`/`status` fields, everything else through `reportRouteInternalError`. If headers were already sent it delegates to `next(error)` (streaming routes: lesson 14).
2. Tovu: mount it last on the daemon app; replace the three flat `res.status(...).json({ error: "…" })` answers with `createApiError` envelopes.
3. Wire `onInternalError` to the same sink the delegated route already uses.

## Acceptance
All five red-first cases green with exact text; removing the boundary makes case 1 fail; removing the bearer gate makes an existing auth test fail (name it); SSE routes still stream (run the existing run-stream tests); `check:size` shows the scope file did not grow.
