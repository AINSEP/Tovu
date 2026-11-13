# Pattern: requests that hang (async Express handler rejections)

## Problem
Tovu's website runs Express 4.22, which ignores the promise an async route/middleware returns. An `await` that fails before (or outside) the handler's own `try` leaves the request open until the browser times out; `process-error-guards.ts` only logs the rejection. 50 Tovu sites (audit check 5, re-run on this clone 2026-11-13).

## Rule
Every async function passed to `app.get/post/put/patch/delete/all/use` (or a router) whose body can reject is wrapped with `asyncRoute({ handler })` at the registration call. Nothing else in the handler changes: keep its own `try/catch`, comments and responses exactly as they are.

## Mechanism (Tovu only)
`apps/website/src/server/inbound/shared/async-route.ts`
```ts
export type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
export function asyncRoute({ handler }: { handler: AsyncRouteHandler }, _optional: Record<string, never> = {}): RequestHandler;
```
It calls `handler(req, res, next).catch((error) => next(error ?? new Error(...)))` — exactly what Express 5 does natively, so a later Express 5 move makes it a no-op. After `next(error)` the app's existing path answers: `captureRouteError` (`inbound/shared/observability-middleware.ts`) gives admin API paths the plain-words failure with incident details; public paths get Express's default 500 page.

**Why Tovu, not Jini.** (1) All 50 real sites are in Tovu's website. The Jini sites from the 11-12 triage are already fixed or not bugs on this branch: core `settings/express/http.ts` `wrap()` now has the principal read inside its own `try` (401 on failure), and daemon `runs.ts:336` awaits `handleRunEventStreamRequest`, whose body is a `try/catch`. Jini's own `mountJsonRoute` already catches. (2) The wrapper's only job is an Express 4 gap; in Jini it would be Express-specific code, which the owner's rule forbids, or a 3-line framework-neutral `.catch(fail)` that adds a contract and nothing else. (3) Tovu consumes published `@jini-ai/*`, so a Jini home would block every Tovu fix behind a Jini release.

**Streaming routes (SSE / feeds).** Same wrap, no extra code. Before headers are sent: the normal error response. After `writeHead`: Express's final handler logs the error and closes the connection; the browser's EventSource reconnects as after any drop. Do not write your own error frame, and do not swallow the error.

Unit tests: `apps/website/src/server/inbound/shared/__tests__/async-route.test.ts` (5 tests, all pass: admin rejection -> 500 JSON without the raw cause; public rejection -> 500; empty rejection -> 500 not fall-through; middleware `next()` unchanged; SSE after headers -> stream closed, not hung).

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

## REMAINING WORK (not done: context limit) — do these BEFORE dispatching Terra
1. **Test helpers must unwrap the wrapper.** `extractRouteHandler` (`apps/website/src/server/__tests__/helpers/http-test-server.ts:148`) and `lastRouteHandler` (`.../helpers/last-route-handler.ts`) return the registered function and many tests `await` it (586 references). A wrapped route returns `undefined` at once, so those tests would assert before the response. Smallest fix: `asyncRoute` returns `Object.assign(fn, { handler })` typed `RequestHandler & { readonly handler: AsyncRouteHandler }`, and both helpers return `handle.handler` when it is a function. Add one unit test for that. Also check `server/inbound/public-http/middleware/__tests__/unit/async-error-forwarding.unit.test.ts` and other files reading `route.stack` directly (list: `rg -l "route\.stack|_router" apps/website/src --glob '*test*'`).
2. **2-3 example site fixes with red/green/mutation** were not done. Planned: `dev-auth.ts` GET `/api/admin/v1/auth/me` (cookie `tovu_session=x`, `identityReady: Promise.reject(...)` -> expect 500 within 2 s), `routes/settings/events.ts` (`settingsRepo.maxRevisionSeq` throws after `writeHead` -> body read ends, not timeout), `public-http/routes/site/newsletter-confirm.ts` (`newsletterReady` rejects -> 500). Pattern for each: real `express()` + `captureRouteError` + `startTestServer` + `fetch(url, { signal: AbortSignal.timeout(2000) })`, as in `async-route.test.ts`.
3. Then dispatch `hung-async-route.terra-prompt.md`.

## Open question for the owner
Public routes fall to Express's default 500 page (generic text). A site-styled error page with a "Copy details" block would be one change in `createApp()`, not per site. Also: moving the website to Express 5 would close this whole class with no per-site edits (desktop already runs 5), at the cost of a path-syntax/`req.query` migration.

## CORRECTION 2026-11-13 (Jini base was stale)
The Jini facts above were read on a stale Jini branch (Oct 20, core 0.4.8). On Jini `main-071` (f6fa96ae3, 0.7.1, what Tovu uses), `packages/core/src/settings/express/http.ts:58` `wrap()` awaits `resolvePrincipal(...)` BEFORE its `try`, so the 8 Jini settings routes DO hang when the session read fails. Fix there (Jini work goes on clone branch `w3-da-main`): move that `await` into a `try` that answers the existing 401 envelope (the stale branch's shape: `try { await required.ready; principal = await required.principalResolver(...) } catch { res.status(401).json({ error: "unauthenticated", code: "UNAUTHENTICATED" }); return; }`). This is one local fix in Jini, not `asyncRoute`, which stays Tovu-only. `daemon/src/http/runs.ts` and the abort-design facts (executor and approval-wrapper signal checks) also need re-checking on `main-071`, and the Jini rows of both Terra prompts need re-running the audit with `--repo jini=<clone on w3-da-main>`. Not done: context limit.
