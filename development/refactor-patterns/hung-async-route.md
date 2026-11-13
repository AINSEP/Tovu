# Pattern: requests that hang (async Express handler rejections)

## Problem
Tovu's website runs Express 4.22, which ignores the promise an async route/middleware returns. An `await` that fails before (or outside) the handler's own `try` leaves the request open until the browser times out; `process-error-guards.ts` only logs the rejection. 50 Tovu sites (audit check 5, 2026-11-13); 2 fixed as examples, 48 left for Terra.

## Rule
Every async function passed to `app.get/post/put/patch/delete/all/use` (or a router) whose body can reject is wrapped with `asyncRoute({ handler })` at the registration call. Nothing else in the handler changes: keep its own `try/catch`, comments and responses exactly as they are.

## Mechanism (Tovu only)
`apps/website/src/server/inbound/shared/async-route.ts`
```ts
export type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
export function asyncRoute({ handler }: { handler: AsyncRouteHandler }, _optional: Record<string, never> = {}): RequestHandler;
```
It calls `handler(req, res, next).catch((error) => next(error ?? new Error(...)))` — exactly what Express 5 does natively, so a later Express 5 move makes it a no-op. After `next(error)` the app's existing path answers: `captureRouteError` (`inbound/shared/observability-middleware.ts`) gives admin API paths the plain-words failure with incident details; public paths get Express's default 500 page.

**Why Tovu, not Jini.** (1) All real sites are in Tovu's website. The Jini rows are not bugs on main 0.7.1 (see "Jini facts" below). Jini's own `mountJsonRoute` already catches. (2) The wrapper's only job is an Express 4 gap; in Jini it would be Express-specific code, which the owner's rule forbids, or a 3-line framework-neutral `.catch(fail)` that adds a contract and nothing else. (3) Tovu consumes published `@jini-ai/*`, so a Jini home would block every Tovu fix behind a Jini release.

**Streaming routes (SSE / feeds).** Same wrap, no extra code. Before headers are sent: the normal error response. After `writeHead`: Express's final handler logs the error and closes the connection; the browser's EventSource reconnects as after any drop. Do not write your own error frame, and do not swallow the error.

Unit tests: `apps/website/src/server/inbound/shared/__tests__/async-route.test.ts` (6 tests, all pass: original handler reachable as `.handler`; admin rejection -> 500 JSON without the raw cause; public rejection -> 500; empty rejection -> 500 not fall-through; middleware `next()` unchanged; SSE after headers -> stream closed, not hung).

## Decision table (every variant in the list)
| Variant | Before | After |
|---|---|---|
| H1 inline route | `app.get(P, async (req, res) => { BODY });` | `app.get(P, asyncRoute({ handler: async (req, res) => { BODY } }));` |
| H1 with route middleware before it | `app.put(P, rejectOversizedJsonBody({...}), async (req, res) => { BODY });` | wrap ONLY the async function: `app.put(P, rejectOversizedJsonBody({...}), asyncRoute({ handler: async (req, res) => { BODY } }));` |
| H1 typed params | `async (req: Request, res: Response) => {` | unchanged inside: `asyncRoute({ handler: async (req: Request, res: Response) => { ... } })` |
| H2 named same-file handler | `app.get("/x", page);` | `app.get("/x", asyncRoute({ handler: page }));` (wrap at EVERY registration of that name; do not edit `page` itself) |
| H3 middleware | `app.use(async (req, res, next) => { BODY });` | `app.use(asyncRoute({ handler: async (req, res, next) => { BODY } }));` |
| H4 stream (SSE) | as H1 | as H1; no other change |
| catch block awaits (users/create, purchase, pages `/:slug`) | as H1/H2 | as H1/H2 — the wrapper also covers a rejection thrown from inside `catch` |

Import line to add (path relative to the file, `.js` suffix like its other imports), e.g. from `server/inbound/admin-http/routes/system/*.ts`: `import { asyncRoute } from "../../../shared/async-route.js";`. Check the relative depth by counting folders up to `server/inbound/`.

## Do NOT
- Do not move awaits into the existing `try`, add new `try/catch`, or change any response text — one wrap per registration only.
- Do not wrap non-async (sync) handlers, or handlers already passed through another wrapper.
- No `eslint-disable`, `as any`, `!`; do not delete comments (a comment above the handler stays above the wrapped handler).
- Do not touch `apps/desktop` (Express 5) or Jini.

## Verify a site
1. `node development/scripts/bug-class-audit.mjs --repo tovu=<clone> --out <tmp>` -> the site no longer appears in `<tmp>/hung-express-handler.tsv` (a handler passed through a call is treated as wrapped).
2. `rg -n "asyncRoute\(\{ handler" <file>` shows one hit per fixed registration.

## Status 2026-11-13: ready to dispatch
1. Done: `asyncRoute` returns the Express handler with the original async handler attached as `.handler`; `extractRouteHandler` and `lastRouteHandler` unwrap it (via `__tests__/helpers/unwrap-route-handle.ts`), as does the one test that reads `/:slug` straight from the router (`pages.route.test.ts`). No other test reads a listed route from the router directly. Unit test: "the original handler stays reachable..." in `async-route.test.ts` (6 tests, all pass).
2. Done: two example sites, each red before / green after / red again with the wrap reverted (`asyncRoute(` replaced by an identity unwrapper):
   - `dev-auth.ts` GET `/api/admin/v1/auth/me`: `__tests__/dev-auth-me-rejection.unit.test.ts` (identityReady rejects, cookie `tovu_session=...` -> 500 `INTERNAL_ERROR`, raw cause not in body).
   - `routes/settings/events.ts` (SSE): `routes/settings/__tests__/events-head-rejection.unit.test.ts` (`maxRevisionSeq` rejects after `writeHead` -> the exchange ends, not a 2 s timeout). Note: the head is not flushed before the first write, so a closed stream can show as a fetch "other side closed" error; only a timeout counts as hung.
3. `hung-async-route.terra-prompt.md` is READY: 48 Tovu sites. Jini has no sites (see below).

## Open question for the owner
Public routes fall to Express's default 500 page (generic text). A site-styled error page with a "Copy details" block would be one change in `createApp()`, not per site. Also: moving the website to Express 5 would close this whole class with no per-site edits (desktop already runs 5), at the cost of a path-syntax/`req.query` migration.

## Jini facts (re-checked on Jini main 0.7.1, clone branch `w3-da-main`, 2026-11-13)
The earlier CORRECTION was wrong. `packages/core/src/settings/express/http.ts` `wrap()` does await `resolvePrincipal(...)` before its own `try`, but `resolvePrincipal` (`http-request.ts:17`) wraps both `await required.ready` and the resolver in its own `try/catch` and returns `null`, which `wrap()` turns into the existing 401 envelope. Existing regression test `settings/express/__tests__/settings-http.test.ts` ("readiness/principal failure returns the authentication envelope...") passes on main and goes red (2 tests) when that inner `try` is removed. No Jini change is needed.
The audit still lists 2 Jini rows; both are false positives: `daemon/src/http/runs.ts:372` awaits `handleRunEventStreamRequest`, whose awaits are inside its own `try` (:323); `daemon/src/http/frontend-request-route.ts:49` awaits `streamToolExecution`, whose await is inside `try/catch/finally` (`tool-execution-routes.ts:160`).
