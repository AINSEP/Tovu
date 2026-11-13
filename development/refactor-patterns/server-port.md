# Server port: no server framework in Jini (Design A)

Status: designed 2026-11-13. The shared pieces and one example site are built and tested in the Jini clone (`jini-terra-d2`, commit `83b0234b1`). The remaining sites are split into a Terra lane (`server-port.terra-prompt.md`) and an Opus lane (section 7 here).

Owner rule (2026-11-07): Jini code never depends on Express or any other server framework. Route code takes `{ app: Server }`, where `Server` is an interface. The host wires its framework through a thin adapter. Moving the website to Express 5 later must be a one-adapter change.

## 1. What already existed (reused, not reinvented)

- **`@jini-ai/core/contracts/server`** (`packages/core/src/contracts/server.ts`): `Server { route({ method, path, handler }) }`. A `ServerHandler` takes `{ request: Request, params, client? }` and returns a web `Response`. The file also defines the path syntax (`:name` segments) and the precedence rule (a literal segment beats `:param`; registration order never decides). It is types only. Before this work its only users were a typecheck file and `examples/notes-app`.
- **`examples/notes-app/src/node-server.ts`**: a plain `node:http` adapter for that contract. Its matcher and precedence code moved into http-kit (below), so every adapter shares one copy.
- **`@jini-ai/http-kit`**: `defineJsonRoute` / `mountJsonRoute` (`adapter.ts`). The route spec is already framework-neutral (`RouteInputContext`, `Result`, ports). Only the mounting is Express. Changing `mountJsonRoute` to take a `Server` converts ~70% of the daemon sites with no other edit.
- **`Pack.http({ app: unknown, services })`** (`packages/core/src/pack.ts:54`) already keeps the kernel framework-free. `builtin-features.ts` casts `app as Express` at each call; those casts become `app as Server`, and then `Pack.http` is typed `app: Server`.

## 2. The contract (decided)

These are additive changes to `packages/core/src/contracts/server.ts` (done):

```ts
type ServerHandler = (required: { request: Request; params; client?: { address }; locals?: Record<string, unknown> }) => Response | Promise<Response>;
type ServerMiddleware = (required: { request; params; client?; locals: Record<string, unknown>;
  route: { method; path }; next: () => Promise<Response> }) => Response | Promise<Response>;
interface Server { route(r: ServerRoute): void }   // unchanged: one method wide
```

| Concern | Decision |
|---|---|
| Request | Web `Request`. Body via `request.json()/text()/arrayBuffer()` or the bounded readers below. Headers via `request.headers.get(name)` (Express `req.get(name)` → `request.headers.get(name) ?? undefined`). Query via `new URL(request.url).searchParams`. Disconnect via `request.signal`. |
| Response | Return a web `Response`. Never write to a socket or a framework object. |
| next / middleware | `ServerMiddleware` calls `next()` and gets the `Response` back, or returns its own `Response` to refuse. Values for the handler go in `locals` (Express `res.locals`). Middleware wraps routes through the decorator `withServerMiddleware({ server, middleware }, { pathPrefix, exemptPaths })`, so which routes a gate covers depends on where they are registered, not on mount order. Exemptions name the route **pattern**, which closes the trap documented in `api-security-middleware.ts:230` (Express strips the mount prefix from `req.path`). |
| Error path | A handler or middleware **throws**. The adapter answers: Express adapter → `next(error)`, so the host's existing error handler runs (same as Tovu's `asyncRoute`); node adapter → `onUnhandledError` (redacted, stderr) plus a plain-words 500. JSON routes keep http-kit's own SEC-005 path (`ClientFacingError`, redacted `INTERNAL_ERROR` with requestId). It now returns a `Response` instead of writing `res`. |
| Streaming / SSE | Return `new Response(readableStream, { headers: { 'content-type': 'text/event-stream', ... } })`. The adapter flushes headers first and writes chunks as they come (tested). Stop producing on `request.signal` abort. `sse.ts`/`raw-sse.ts` become a `createSseStream()` → `{ response, send, close }` over a `ReadableStream` (Opus lane O-kit). |
| Body size | `readJsonBody({ request }, { maxBytes })` and `readBodyBytes(...)` (done). They match `express.json()`: `{}` for no body, an empty body or a non-JSON type; objects and arrays only (strict); invalid → 400; too big → 413 (checked against content-length and while streaming, and reading stops at the limit); default 100 KiB like Express. They replace per-route `express.json({ limit })`, `express.raw(...)` and `rejectOversizedJsonBody`. |
| Cookies / redirects | `Set-Cookie` via `headers.append('set-cookie', serialized)`. The adapter writes each cookie on its own line (tested). Redirect: `new Response(null, { status, headers: { location } })`. |
| Peer address | `client.address`, from the socket. It is never read from `x-forwarded-for`. `req.secure` / `req.protocol` → `new URL(request.url).protocol` (the Express adapter builds the URL from `req.protocol`, so `trust proxy` still applies). |
| Query parsing | **Behavior change, accepted:** Express 4 parses `a[b]=1` with `qs` into nested objects. `rawInput` (O-kit) builds `query` from `URLSearchParams`: one value → string, repeated → `string[]`, no bracket nesting. Assumption to verify in O-kit: `rg -n "query\.[a-zA-Z]+\[|query\)\.[a-z]+\." packages/*/src` finds no parser reading nested query objects. |
| Path params | The contract's `:name` syntax only. No `*`, regex or optional segments. That is also the subset Express 5's path-to-regexp v8 still accepts, so no path breaks on Express 5. |

## 3. Where things live

| Piece | Home | Runtime |
|---|---|---|
| Contract types | `@jini-ai/core/contracts/server` | universal, types only |
| Route table, `withServerMiddleware`, `jsonResponse`, `readJsonBody`, `readBodyBytes`, `matchServerPath` | `@jini-ai/http-kit/server-port` (`packages/http-kit/src/server-port.ts`) | universal |
| `createNodeDispatcher` (serves a route table from Node `IncomingMessage`/`ServerResponse`; optional `next`) | `@jini-ai/http-kit/node-bridge` (`packages/http-kit/src/node-bridge.ts`) | node |
| Standalone listener for Jini's own daemon (`createNodeServer` = dispatcher + `http.createServer` + listen/close) | `@jini-ai/http-kit/node-bridge` (O-host) | node |
| **Express adapter** | **Tovu**: `apps/website/src/server/inbound/shared/express-server.ts` (section 5) | host |

`node:http` is the runtime, not a framework, so Jini's own daemon (`packages/server`) serves on it with no Express. Express stays only in Tovu and in http-kit's devDependencies (one contract test).

## 4. Built and tested in this job (Jini clone, commit `83b0234b1`)

- `packages/core/src/contracts/server.ts`: `ServerMiddleware` and `locals`. `args-convention.typecheck.ts` adds two compile checks; core builds clean.
- `packages/http-kit/src/server-port.ts` and `src/__tests__/server-port.test.ts` (11 tests).
- `packages/http-kit/src/node-bridge.ts` and `src/__tests__/node-bridge.test.ts` (5 tests: plain `node:http`; Express with and without a blanket `express.json()`; fall-through to host routes; host error handler; Set-Cookie lines; SSE streaming; abort on hang-up).
- Mutation proof, each mutant killed by a named test: dropping the drained-body fallback; ignoring precedence; ignoring `exemptPaths`; not forwarding errors to `next`.
- **Example site S2**: `packages/daemon/src/http/message-relay.ts` now takes `{ app: Server }` and returns `jsonResponse`. Its two test files were rewritten to the contract first. They ran **red: 22 failed** against the Express code (`app.post is not a function`, `next is not a function`). After the conversion they ran **green: 22 passed**. 4 mutants (auth refusal, body validation, path-runId check, body-reader failure) were killed by 2, 10, 2 and 2 tests. Shared test helper: `__tests__/message-relay-test-helpers.ts`.
- Not run: the whole-package typecheck and suites (out of scope). http-kit and core built with `tsc -p` and were clean.

## 5. The Tovu Express adapter (exact code, lands after the Jini publish)

Tovu's installed Jini is 0.7.0, which lacks `node-bridge`. This file lands in Wave 4, after Jini publishes. It is the same wiring that `node-bridge.test.ts` › "mounted in Express" already proves:

```ts
// apps/website/src/server/inbound/shared/express-server.ts
import type { Express } from "express";
import type { Server } from "@jini-ai/core/contracts/server";
import { createNodeDispatcher } from "@jini-ai/http-kit/node-bridge";

/** Serves Jini `Server` routes from this Express app. Mount position = where this is called:
 * call it after the auth/origin middleware that must gate these routes and BEFORE any body
 * parser whose raw bytes a route needs (a drained body is rebuilt from `req.body`). Unmatched
 * requests and handler errors fall through to Express (`next()` / `next(error)`), so Express 4
 * and 5 behave the same. */
export function createExpressServer({ app }: { app: Express }, _optional: Record<string, never> = {}): Server {
  const dispatcher = createNodeDispatcher();
  app.use((req, res, next) => {
    void dispatcher.handle({ incoming: req, out: res }, { next, origin: `${req.protocol}://${req.get("host") ?? "localhost"}`, parsedBody: req.body });
  });
  return dispatcher.server;
}
```

**Express 5:** `req`/`res` are still Node's `IncomingMessage`/`ServerResponse`, `next(err)` is unchanged, and the adapter never registers an Express path string. The upgrade therefore touches no Jini code and no line of this adapter. The only Express-5 edits are in Tovu's own Express routes.

## 6. Site variants (Terra lane: 36 sites + 1 done)

| Variant | Before | After |
|---|---|---|
| **S1 type swap** (route code only calls `mountJsonRoute`/`register*Routes`) | `import type { Express } from 'express'` … `{ app: Express }` | `import type { Server } from '@jini-ai/core/contracts/server'` … `{ app: Server }`. Nothing else changes. Needs O-kit's `mountJsonRoute({ app: Server })`. |
| **S2 hand-written handler** | `app.post(P, (req, res, next) => { … res.status(s).json(b) … next(e) })` | `app.route({ method: 'POST', path: P, handler: async ({ request, params }) => { … return jsonResponse({ status: s, body: b }); } })`. See the mapping table in the Terra prompt. Errors are thrown, not passed to `next`. Copy `message-relay.ts`. |
| **S3 middleware** | `(req, res, next) => { …; next(); }` with `res.locals.x` | A `ServerMiddleware`: `async ({ request, locals, next }) => { …; return next(); }`. Mount with `withServerMiddleware`. |
| **S4 helper over req/res** | `fn({ req }: { req: Request })` reading `req.get`/`req.secure`, or `fn({ res })` writing headers | Takes `{ request }: { request: Request }`, or returns `Headers`/`Response` instead of writing. |
| **S6 folder/subpath rename** | `src/<area>/express/…`, export `./<area>/express` | `src/<area>/http/…`, export `./<area>/http`. The old subpath is removed (CHANGELOG "Breaking"); Tovu imports update in Wave 4. The owner rule forbids `<domain>/express` homes. |

## 7. Opus lane (judgment; not for Terra): 20 sites

- **O-kit (10, `packages/http-kit/src`)**, done first in Wave 1:
  - `adapter.ts`: `mountJsonRoute({ app: Server, … })` registers `app.route({ method: spec.method.toUpperCase(), path, handler })`. Inside: `rawInput` from `request`/`params`; JSON body via `readJsonBody({ request }, { maxBytes: spec.maxBodyBytes })` (a new optional spec field, default 100 KiB); the abort signal = `request.signal`; returns `Response`.
  - `types.ts`: `JsonRoutePorts.authenticate({ raw, request, deps })`; `onError({ error }) → Response`; `HttpMethod` stays lowercase in specs (no churn at ~200 `defineJsonRoute` sites).
  - `request.ts`: `rawInput({ request, params })`.
  - `response.ts`: `jsonResponse` and `apiErrorResponse({ status, error })`. `sendJson`/`sendApiError` are deleted; Tovu's `server/error-mapping/respond.ts` inlines `res.status(..).json(createApiErrorResponse(..))`.
  - `origin.ts`: `guardSameOrigin({ request })`.
  - `local-daemon-request.ts` / `api-security-middleware.ts`: return `ServerMiddleware`s; `registerApi*Middleware({ app })` becomes `withServerMiddleware(…, { pathPrefix: '/api', exemptPaths: OPEN_PROBE_PATHS })`.
  - `observability.ts`: a middleware reading `route.path` and `(await next()).status`.
  - `route-registration-guard.ts`: a `Server` decorator that records `{ method, path }`.
  - `middleware.ts`: `rejectOversizedJsonBody` moves verbatim to Tovu `apps/website/src/server/inbound/shared/reject-oversized-json-body.ts` (13 Tovu Express users). Jini routes use `readJsonBody` `maxBytes`.
  - `sse.ts`/`raw-sse.ts`: `ReadableStream` based.
  - `package.json`: `express` and `@types/express` stay devDependencies only, for `node-bridge.test.ts`.
- **O-host (3, `packages/server/src`)**:
  - `create-local-node-daemon.ts` / `compose-jini-kernel.ts`: replace `express()` + `app.listen` + `app.disable('x-powered-by')` with an injectable `server?: ListeningServer` (default `createNodeServer()` from `node-bridge`). Delete `app.use(express.json())`: routes read their own bodies. `LocalNodeHttpExtension` becomes `(app: Server, ctx)`; `onAfterApiRoutes(app: Server, …)`.
  - `builtin-features.ts`: `app as Express` → `app as Server`, then type `Pack.http` as `{ app: Server }` in core.
- **O-stream (5)**:
  - `core/src/settings/express/stream.ts`, `daemon/src/http/surface-restoration.ts`, `frontend-sessions.ts`: `res.write`/`flushHeaders`/`on('close')` → `ReadableStream` plus `request.signal`.
  - `model-proxy.ts`: pipe the upstream `fetch` body straight through: `new Response(upstream.body, { status, headers })`.
  - `tool-execution-routes.ts`: gate → bounded body → handler as a middleware chain; the `ErrorRequestHandler` body-parser-failure mapping becomes `readJsonBody`'s 400/413.
- **O-upload (1)**: `attachments.ts` (1651 lines). Upload streams via `request.body` with `readBodyBytes`-style limits; `req.readableEnded` checks → stream completion.
- **O-raw-body (1)**: `commerce/src/http/payments-webhook.ts`. Use `readBodyBytes({ request }, { maxBytes })` for the exact signed bytes. The registration-order trick in its header comment is gone: a converted route always reads its own raw bytes. The Express host must still mount `createExpressServer` before a blanket parser, or the adapter's drained-body fallback hands the signature check re-serialized JSON. **Tovu wiring must create the webhook's Server before `express.json()`.**

## 8. Waves

1. **Opus, Jini:** O-kit. Gate: every http-kit test file touched passes, one at a time.
2. **Terra, Jini:** `server-port.terra-prompt.md` (S1–S6, 36 sites).
3. **Opus, Jini:** O-host, O-stream, O-upload, O-raw-body; update `examples/notes-app/src/node-server.ts` to import `matchServerPath`/the route table from http-kit; publish.
4. **Terra or Opus, Tovu:** bump Jini; add `express-server.ts`; in `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts`, create `const daemonServer = createExpressServer({ app })` right after `createDaemonAuthMiddleware` is mounted and pass `daemonServer` to every `register*Routes({ app })` from `@jini-ai/daemon/http` (message relay at `:1389`); `settings/shared.ts` → `mountJsonRoute({ app: settingsServer, … })` and `@jini-ai/core/settings/http`; `respond.ts`; move `rejectOversizedJsonBody`; update `__tests__/agent-daemon-server.message-relay.unit.test.ts`.

Done check for the whole design: `rg -n "from ['\"]express['\"]" packages/*/src --glob '!**/__tests__/**'` in Jini → no hits, and the owner-rules audit's `server-framework-in-jini` count is 0.

## 9. Assumptions (for the reviewer)

- A1: no Jini route parser depends on `qs` nested query objects (verify in O-kit with the `rg` above).
- A2: every Tovu Express app that mounts Jini routes has its blanket `express.json()` before them. The adapter rebuilds the body from `req.body` (`JSON.stringify`); that is semantically equal for JSON routes and wrong only for signature checks (payments webhook, handled above).
- A3: the per-request cost of building a web `Request` (one `Headers` copy, one `Readable.toWeb`) is small next to a JSON route's work. The route table match is O(routes × segments) per request, a few hundred string compares. If profiling ever shows it, index by first segment.
- A4: Jini 0.x allows removing the `./<area>/express` subpaths with a CHANGELOG "Breaking" entry instead of keeping aliases. That follows "generic absorbs old paths".

## 10. Owner decisions (made here; the owner can override)

1. The Express adapter lives in **Tovu** (host wiring), not in a Jini `@jini-ai/http-express` package. It is ~15 lines because the generic part (`createNodeDispatcher`) is in Jini. Alternative: an opt-in Jini adapter package if a second host wants Express.
2. Jini's daemon serves on plain `node:http` by default (no Express anywhere in Jini). A host may inject its own `ListeningServer`.
3. Nested query parsing (`qs`) is dropped (A1).
