# Server port: no server framework in Jini (Design A)

Status: designed 2026-11-13; revised the same day after the Codex review (`review-d2.md`: 2 blockers, 14 majors, all verified against source and fixed here). The shared pieces and one example site are in the Jini clone (`jini-terra-d2`, branch `design-d2`: `83b0234b1`, review fixes up to `bec86f159`). The remaining sites are split into a Terra lane (`server-port.terra-prompt.md`, literal edits only) and Opus stages (section 7) for everything that needs judgment.

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
| Request | Web `Request`. Body via the bounded readers below (never an unbounded `request.json()`). Headers via `request.headers.get(name)` (Express `req.get(name)` → `request.headers.get(name) ?? undefined`). Query via `readQuery({ request })` (row "Query parsing"). Disconnect via `request.signal`. |
| Response | Return a web `Response`. Never write to a socket or a framework object. |
| Host context | `locals` starts each request seeded with the trusted values the host already set (`createNodeDispatcher` option `locals`; the Express adapter passes `res.locals`, where Tovu's admin auth puts the principal). Routes read identity from `locals` or from an authentication port, never from a request header the caller controls. (Review finding 5; built in `712993b60`.) |
| next / middleware | `ServerMiddleware` calls `next()` and gets the `Response` back, or returns its own `Response` to refuse. Values for the handler go in `locals` (Express `res.locals`). Middleware wraps routes through the decorator `withServerMiddleware({ server, middleware }, { pathPrefix, exemptPaths })`, so which routes a gate covers depends on where they are registered, not on mount order. Exemptions name the route **pattern**, which closes the trap documented in `api-security-middleware.ts:230` (Express strips the mount prefix from `req.path`). |
| Error path | A handler or middleware **throws**. The adapter answers: Express adapter → `next(error)`, so the host's existing error handler runs (same as Tovu's `asyncRoute`); node adapter → `onUnhandledError` (redacted, stderr) plus a plain-words 500. `handle()` never rejects: a request with no usable URL falls through to the host (`next()`) or gets a plain 400, and anything unexpected is reported and the connection cut (finding 10, `712993b60`). The default stderr sink redacts with the shared redactor plus host-injected `redactionPatterns`; Tovu passes its API-key shape, Jini names none (finding 11). Routes match the request path exactly as received (no `..` resolution, `//` is not an authority), the same path the host framework's own gates see. JSON routes keep http-kit's own SEC-005 path (`ClientFacingError`, redacted `INTERNAL_ERROR` with requestId). It now returns a `Response` instead of writing `res`. |
| Streaming / SSE | Return `new Response(readableStream, { headers: { 'content-type': 'text/event-stream', ... } })`. The adapter flushes headers first and writes chunks as they come, with backpressure: a full socket buffer waits for `drain`, so producers' bounded queues stay the memory ceiling; a client that leaves cancels the stream; a stream failing mid-way cuts the connection (finding 8, `712993b60`). Stop producing on `request.signal` abort. `sse.ts`/`raw-sse.ts` become a `createSseStream()` → `{ response, send, close }` over a `ReadableStream` (Opus lane O-kit). |
| Body size | `readJsonBody({ request }, { maxBytes })` and `readBodyBytes(...)` (done): `{}` for no body, an empty body or a non-JSON type; objects and arrays only (strict); invalid → 400; too big → 413 (checked against content-length and while streaming; reading stops at the limit). **Every route states its limit explicitly; nothing relies on the 100 KiB default** (finding 7). The limit a route gets is the one it has today in production (section 6a). Behind a host parser that already drained the body, the limit applies again to the rebuilt body, so a route's `maxBytes` must be at least the host parser's limit. **Not a parity claim for compressed bodies:** `express.json()` inflates gzip/deflate; the readers do not. O-kit characterizes that no Jini or Tovu client sends a compressed request body and makes the readers answer a non-identity `content-encoding` with 415 and plain words. |
| Cookies / redirects | `Set-Cookie` via `headers.append('set-cookie', serialized)`. The adapter writes each cookie on its own line (tested). Redirect: `new Response(null, { status, headers: { location } })`. |
| Peer address | `client.address`, from the socket. It is never read from `x-forwarded-for`. `req.secure` / `req.protocol` → `new URL(request.url).protocol` (the Express adapter builds the URL from `req.protocol`, so `trust proxy` still applies). |
| Query parsing | `readQuery({ request })` (http-kit `server-port`, built in `aa509bd99`) returns the shapes Express 4's `req.query` gave: one value → string; repeated key or `name[]` → `string[]`; any other bracketed key (`a[b]=1`) → a non-string value, so every route's existing "must be a string" refusal still fires instead of the value looking absent (finding 12). Nested values are not parsed; no Jini route reads them (checked: `rg -n "query\.[a-zA-Z]+\.[a-z]" packages/*/src` → none). `rawInput` (O-kit) and every hand-converted route use it; `searchParams.get` is never used on a route (it silently keeps one of several values). |
| Path params | The contract's `:name` syntax only. No `*`, regex or optional segments. That is also the subset Express 5's path-to-regexp v8 still accepts, so no path breaks on Express 5. |

## 3. Where things live

| Piece | Home | Runtime |
|---|---|---|
| Contract types, plus `ReadJsonBody` (the bounded-body-reader port type, below) | `@jini-ai/core/contracts/server` | universal, types only |
| Route table, `withServerMiddleware`, `jsonResponse`, `readJsonBody`, `readBodyBytes`, `readQuery`, `matchServerPath` | `@jini-ai/http-kit/server-port` (`packages/http-kit/src/server-port.ts`) | universal |
| `createNodeDispatcher` (serves a route table from Node `IncomingMessage`/`ServerResponse`; options `next`, `origin`, `parsedBody`, `locals`; `redactionPatterns`) | `@jini-ai/http-kit/node-bridge` | node |
| `writeNodeResponse` (writes a web `Response` to a `ServerResponse`, with backpressure) and `createNodeGate` (runs one `ServerMiddleware` as a host gate, below) | `@jini-ai/http-kit/node-bridge` (O-kit) | node |
| Standalone listener for Jini's own daemon (`createNodeServer` = dispatcher + `http.createServer` + listen/close) | `@jini-ai/http-kit/node-bridge` (O-host) | node |
| **Express adapter** (`createExpressServer`, `expressGate`) | **Tovu**: `apps/website/src/server/inbound/shared/express-server.ts` (section 5) | host |

`node:http` is the runtime, not a framework, so Jini's own daemon (`packages/server`) serves on it with no Express. Express stays only in Tovu and in http-kit's devDependencies (one contract test).

**Layering (review finding 2, blocker).** Core is the bottom layer and imports nothing from http-kit (http-kit depends on core). Core code that serves HTTP (the settings routes, section 7 O-settings) therefore takes body reading as a **port**: core declares the type, the host passes http-kit's function.

```ts
// @jini-ai/core/contracts/server (types only; http-kit's readJsonBody satisfies it structurally)
export type ReadJsonBody = (required: { readonly request: Request }, optional?: { readonly maxBytes?: number })
  => Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }>;
```

Core builds its responses natively (`new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })`) and maps `PAYLOAD_TOO_LARGE` → 413, other reader errors → 400 itself. No core file imports `@jini-ai/http-kit`; the done check below greps for it.

## 4. Built in the Jini clone (branch `design-d2`)

- `83b0234b1`: `packages/core/src/contracts/server.ts` (`ServerMiddleware`, `locals`); `packages/http-kit/src/server-port.ts` and `node-bridge.ts` with tests; example site S2 `packages/daemon/src/http/message-relay.ts` (tests rewritten first: 22 red → 22 green, 4 mutants killed). These ran in the original job.
- Review fixes, each test committed first (expected red), then the fix. **None of these were run** (machine overloaded; the cloud gate runs them, section 8):
  - tests `08537b637`, `7c4e45222`, fix `712993b60` (`node-bridge.ts`): backpressure and stream cancel (finding 8), `handle()` never rejects and a bad Host gets 400 (finding 10), host `locals` (finding 5), host `redactionPatterns` (finding 11), raw-path matching.
  - `dc6f6586b` test, `aa509bd99` + `61d0aa69b` fix (`server-port.ts`): `readQuery` (finding 12).
  - test `ddb5fd1d9`, fix `bec86f159` (`message-relay.ts`): the claim route states its 1 KiB limit (finding 7).

## 5. The Tovu Express adapter (exact code, lands in Wave 4 after the Jini publish)

Tovu's installed Jini is 0.7.0, which lacks `node-bridge`. This file lands in Wave 4. `node-bridge.test.ts` › "mounted in Express" proves the same wiring.

```ts
// apps/website/src/server/inbound/shared/express-server.ts
import type { RequestHandler, Router } from "express";
import type { Server, ServerMiddleware } from "@jini-ai/core/contracts/server";
import { createNodeDispatcher, createNodeGate } from "@jini-ai/http-kit/node-bridge";
import { TOVU_API_KEY_REDACTION } from "#src/features/identity/api-key-secret";

const hostOptions = (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1], next: Parameters<RequestHandler>[2]) =>
  ({ next, origin: `${req.protocol}://${req.get("host") ?? "localhost"}`, parsedBody: req.body, locals: res.locals });

/** Serves Jini `Server` routes at THIS point of the Express stack: every gate mounted before this
 * call runs before these routes, every host route mounted after it runs after. Create one per
 * Jini registration call, on that call's line (section 5, mount rule). Unmatched requests and
 * handler errors fall through to Express (`next()` / `next(error)`), so Express 4 and 5 behave the same. */
export function createExpressServer({ app }: { app: Pick<Router, "use"> }, _optional: Record<string, never> = {}): Server {
  const dispatcher = createNodeDispatcher({}, { redactionPatterns: [TOVU_API_KEY_REDACTION] });
  app.use((req, res, next) => { void dispatcher.handle({ incoming: req, out: res }, hostOptions(req, res, next)); });
  return dispatcher.server;
}

/** A Jini `ServerMiddleware` used as an Express gate: refusal answered here, `next()` continues the Express chain. */
export function expressGate({ middleware }: { middleware: ServerMiddleware }, _optional: Record<string, never> = {}): RequestHandler {
  const gate = createNodeGate({ middleware }, { redactionPatterns: [TOVU_API_KEY_REDACTION] });
  return (req, res, next) => { void gate.handle({ incoming: req, out: res }, hostOptions(req, res, next)); };
}
```

`TOVU_API_KEY_REDACTION` is a new export next to `PREFIX_PATTERN` in `features/identity/api-key-secret.ts`: `{ name: "tovu_api_key", regex: /tovu_ak_[0-9a-f]{12}\.[A-Za-z0-9_-]+/g }`. `void` is safe: `handle()` never rejects (tested).

`createNodeGate` (O-kit, node-bridge): runs one `ServerMiddleware` against a Node request. If it returns a `Response` without calling `next()`, that response is written. If it calls `next()`, values it wrote to `locals` are copied into the host's `locals` object, the host's `next()` is called, and the middleware's `next()` resolves to a `Response` the gate never writes. So only middleware that refuses or returns `next()` unchanged can be a host gate; middleware that reads the downstream response (observability) is mounted with `withServerMiddleware` instead. A gate that throws → host `next(error)`.

**Express 5:** `req`/`res` are still Node's `IncomingMessage`/`ServerResponse`, `next(err)` is unchanged, and the adapter never registers an Express path string. The upgrade touches no Jini code and no line of this adapter.

### Mount rule (review finding 1, blocker)

**One `createExpressServer({ app })` per existing Jini registration call, created on that call's line.** Express runs layers in registration order, so a dispatcher created at the line of today's `registerXRoutes({ app })` call sits at exactly that point of the stack. Every authentication, scoping, validation and ownership gate mounted above it keeps running in front of those routes, and host routes mounted above it (the owned-run list override) still answer first. One dispatcher for a whole file, or one created early, is never allowed. Cost: each request passes through every dispatcher until one matches; one match is O(routes × segments), a few dozen string compares per dispatcher, and the web `Request` is built only on a match.

`apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` (lines at design commit `b9be22800`):

| Line | Jini registration | Gates and host routes that run before it today (must still) |
|---|---|---|
| 1389 | `registerMessageRelayRoutes` | closed-scope guard (1369), idle park (1374), plugin events (1375); for the claim route only: `createDaemonAuthMiddleware` + 1 KiB parser (1380–1388) |
| 1468 | `registerRunRoutes` | the above, `requireAgentDaemonToken` (1398), 6 MiB parser (1407), `requireRunOwnership` on `/api/runs/:runId` (1445), owned-run list `GET /api/runs` (1446, answers before the dispatcher), credential run intake and durable start (1448–1449) |
| 1476 | `registerAgentRoutes` | bearer gate (1398), 6 MiB parser (1407) |
| 1519 | `registerDelegatedToolRoutes` | bearer gate, parser, run-scoped discovery (1424), delegated re-check with `validateDelegatedRunId` (1433) |
| 1545 | `frontendControl.httpExtension` | bearer gate, parser |
| 1548 | `registerFrontendRequestRoute` | bearer gate, parser |
| 1555 | `registerToolCatalogRoutes` | bearer gate, parser, run-scoped discovery (1424) |
| 1565 | `registerComponentCatalogRoutes` | the above plus the `/api/components` gate (1556) |
| 1595, 1602 | `registerDaemonAttachmentLookup`, `registerAttachmentRoutes` | bearer gate; raw upload bodies (see O-upload) |

The same rule applies in every other Tovu file in the Wave 4 inventory (section 8). The Wave 4 job re-reads the line numbers; the order in the table is what must hold.

**Required characterization tests (Wave 4, written before the switch, red-first for the new adapter):** in `apps/website/src/server/inbound/assistant/__tests__/`, for each row above, one request without credentials to one route behind that dispatcher gets the same status and body as before the switch; `GET /api/runs` with a proxy principal returns only that principal's runs; a `/api/tools` request with no live run gets the same refusal as before. These pin gate order; they run in the cloud gate.

## 6. Site variants (Terra lane)

| Variant | Before | After |
|---|---|---|
| **S1 type swap** (route code only calls `mountJsonRoute`/`register*Routes`) | `import type { Express } from 'express'` … `{ app: Express }` | `import type { Server } from '@jini-ai/core/contracts/server'` … `{ app: Server }`. Nothing else changes. Needs O-kit's `mountJsonRoute({ app: Server })`. |
| **S2 hand-written handler** | `app.post(P, (req, res, next) => { … res.status(s).json(b) … next(e) })` | `app.route({ method: 'POST', path: P, handler: async ({ request, params }) => { … return jsonResponse({ status: s, body: b }); } })`. Mapping table in the Terra prompt. Errors are thrown. Copy `message-relay.ts`. |
| **S3 middleware** | `(req, res, next) => { …; next(); }` with `res.locals.x` | A `ServerMiddleware`: `async ({ request, locals, next }) => { …; return next(); }`. |
| **S4 helper over req/res** | `fn({ req })` reading `req.get`/`req.secure`, or `fn({ res })` writing a final answer | Takes `{ request }`, or returns a `Response`. |
| **S6 folder/subpath rename** | `src/<area>/express/…`, export `./<area>/express` | `src/<area>/http/…`, export `./<area>/http`. CHANGELOG "Breaking". Tovu imports update in Wave 4. Terra does S6 only for `cms/redirects`; core settings and cms forms/comments/settings move in their Opus stages. |

### 6a. Body limits (review finding 7)

A converted route reads its own body, so the limit it had from the host's parser must become its own `maxBytes`. Effective limits today:

| Where | Limit today | After |
|---|---|---|
| Tovu daemon, claim route | 1 KiB (`agent-daemon-scope.ts:1388`) | `message-relay.ts` states 1 KiB (`bec86f159`) |
| Tovu daemon, every Jini route after `:1407` | 6 MiB blanket (screenshots on `/api/frontend-sessions/:id/responses`; why-comment at `:1399–1406`) | `DAEMON_JSON_BODY_MAX_BYTES = 6 * 1024 * 1024`, exported from `@jini-ai/daemon/http` (O-host adds it, with the why-comment moved there). Every daemon route that reads a JSON body passes it. |
| Jini standalone daemon (`create-local-node-daemon.ts`) | 100 KiB blanket `express.json()` | Same constant: **owner question Q4** (recommended: yes, one limit per route on every host; every route there is token-gated). |
| A Jini route with its own `express.json({ limit })` | as declared | `maxBytes` = that limit. |
| Tovu-owned routes (`agent-daemon-core-rpc.ts:29` 16 MiB, forms 1 MiB / 12 MiB) | as declared | unchanged; they stay Express routes or keep host parsing (O-forms). |

Behind Tovu's drained-body path the reader re-applies `maxBytes` to the re-serialized body; using the constant above keeps the 6 MiB ceiling. Compressed request bodies: see section 2 (415, characterized in O-kit).

## 7. Opus stages (judgment; never Terra)

Each stage has a fixed contract below; Terra does not touch its files.

- **O-kit (`packages/http-kit/src`)**, Wave 1:
  - `adapter.ts`: `mountJsonRoute({ app: Server, … })` registers `app.route({ method: spec.method.toUpperCase(), path, handler })`; `rawInput` from `request`/`params`/`readQuery`; JSON body via `readJsonBody({ request }, { maxBytes: spec.maxBodyBytes })` — `maxBodyBytes` becomes a **required** spec field for methods with a body (no silent default); abort signal = `request.signal`; returns `Response`.
  - `types.ts`: `JsonRoutePorts.authenticate({ raw, request, locals, deps })` (finding 5: `locals` carries the host's verdict, e.g. Tovu's principal); `onError({ error }) → Response`; `HttpMethod` stays lowercase in specs.
  - `request.ts`: `rawInput({ request, params })` with `query: readQuery({ request })`.
  - `response.ts`: `jsonResponse` and `apiErrorResponse({ status, error })`. `sendJson`/`sendApiError` are deleted; Tovu's `server/error-mapping/respond.ts` inlines `res.status(..).json(createApiErrorResponse(..))`.
  - `origin.ts`: `guardSameOrigin({ request })`. `observability.ts`: middleware reading `route.path` and `(await next()).status`. `route-registration-guard.ts`: a `Server` decorator recording `{ method, path }`.
  - `local-daemon-request.ts` / `api-security-middleware.ts`: return `ServerMiddleware`s; `registerApi*Middleware({ app })` becomes `withServerMiddleware(…, { pathPrefix: '/api', exemptPaths: OPEN_PROBE_PATHS })`.
  - `middleware.ts`: `rejectOversizedJsonBody` moves verbatim to Tovu `apps/website/src/server/inbound/shared/reject-oversized-json-body.ts` (its Tovu wrapper `body-size-limit.ts` imports it from there; 13 Tovu Express users unchanged).
  - `sse.ts`/`raw-sse.ts`: `createSseStream()` → `{ response, send, close }` over a `ReadableStream` with the existing bounded queue; `afterCursor` via `readQuery`.
  - `node-bridge.ts`: export `writeNodeResponse` (today's internal `writeWebResponse`) and `createNodeGate` (section 5).
  - `server-port.ts` readers: non-identity `content-encoding` → 415 with plain words; characterization test first.
  - `package.json`: `express`/`@types/express` stay devDependencies only.
- **O-host (`packages/server/src`)**: `create-local-node-daemon.ts` / `compose-jini-kernel.ts`: replace `express()` + `app.listen` + `app.disable('x-powered-by')` with an injectable `server?: ListeningServer` (default `createNodeServer()`); delete `app.use(express.json())` (routes read their own bodies with `DAEMON_JSON_BODY_MAX_BYTES`); `LocalNodeHttpExtension` becomes `(app: Server, ctx)`. Gates the standalone daemon mounts with `app.use` today are re-mounted with `withServerMiddleware` in the same order, and its test pins that an unauthenticated request is refused. `builtin-features.ts`: `app as Express` → `app as Server`; type `Pack.http` as `{ app: Server }` in core. Add `DAEMON_JSON_BODY_MAX_BYTES` (section 6a).
- **O-settings (`packages/core/src/settings/express/*`, `cms/src/settings/express/index.ts`, both `package.json` exports)** (finding 2 + finding 5): move to `core/src/settings/http/` (subpath `./settings/http`; the `cms` forwarding file re-exports `@jini-ai/core/settings/http` in the same commit). Contract: `registerSettingsRoutes({ app: Server, readJsonBody: ReadJsonBody, authenticate, … }, optional)`; the principal comes from `authenticate({ request, locals })`, where Tovu's `getAuthedPrincipal` reads `locals.principal` (the adapter passes `res.locals`); `PrincipalResolver({ request, response })` → `({ request, locals })`. `stream.ts` (settings change SSE) → `createSseStream`-style `ReadableStream` built natively in core (core cannot import http-kit's). Query reads: `String(req.query.x ?? "")` keeps its exact meaning via a core-local 5-line equivalent of `readQuery` for the two scalar params, or the reader passed as a port — the stage picks one and states it. No core file imports `@jini-ai/http-kit`.
- **O-forms (`packages/cms/src/{forms,comments}/express/*`)** (finding 4): forms and comments are not JSON. Tovu parses URL-encoded and multipart bodies (with attachment values) behind rate admission, then hands the parsed body to Jini's handler, which answers JSON or an HTML retry page. Contract: `createFormSubmitHandler(deps)` / `createCommentSubmitHandler(deps)` become `({ request, body, locals }) => Promise<Response>`, where `body` is the host-parsed `{ fields, attachments }` value (typed in cms, same shape the handler reads from `req.body` today) and every refusal, retry page and status stays byte-identical (characterization tests first, from the current Express tests). Tovu's `forms-submit.ts` / `comments-submit.ts` keep their Express parsers and admission, and write the returned `Response` with `writeNodeResponse`. Subpaths move to `./forms/http`, `./comments/http`.
- **O-stream (5)**: `daemon/src/http/surface-restoration.ts`, `frontend-sessions.ts`: `res.write`/`flushHeaders`/`on('close')` → `ReadableStream` plus `request.signal`; `parseCapabilityQuery({ raw: readQuery({ request }).capability })` keeps its array and refusal behavior. **`model-proxy.ts` (finding 9) is not a byte proxy:** it keeps `entry.parse`, `entry.run`, `toStreamEvent`, sequencing, redaction and the single terminal `end` event exactly; only the channel changes from `createSseChannel({ res })` to O-kit's `createSseStream()`, whose `response` the handler returns. `tool-execution-routes.ts`: gate → bounded body → handler as a middleware chain; `requireToolExecutionCaller` becomes a `ServerMiddleware` (Tovu uses it as an Express gate via `expressGate`, section 8); the body-parser error mapping becomes `readJsonBody`'s 400/413.
- **O-upload**: `attachments.ts`. Upload streams via `request.body` with `readBodyBytes`-style limits; `req.readableEnded` checks → stream completion; `req.query.name`/`batch` via `readQuery`.
- **O-raw-body**: `commerce/src/http/payments-webhook.ts`. `readBodyBytes({ request }, { maxBytes })` for the exact signed bytes. The Tovu host must create this route's `Server` before any blanket parser, or the drained-body fallback hands the signature check re-serialized JSON.

## 8. Waves

1. **Opus, Jini:** O-kit. Gate: the touched http-kit test files pass, one at a time, in the cloud gate.
2. **Terra, Jini:** `server-port.terra-prompt.md` (literal sites only).
3. **Opus, Jini:** O-host, O-settings, O-forms, O-stream, O-upload, O-raw-body; update `examples/notes-app/src/node-server.ts` to use http-kit's route table; publish.
4. **Opus, Tovu (not Terra: every item is a trust boundary):** bump Jini; add `express-server.ts` and `TOVU_API_KEY_REDACTION`; characterization tests first (section 5); then migrate every consumer of a changed public contract (review finding 6), each with the mount rule:

| Tovu file | Changed Jini contract | Change |
|---|---|---|
| `server/inbound/assistant/agent-daemon-scope.ts` | all `register*Routes`, `httpExtension`, `createDaemonAuthMiddleware` on the claim route | one `createExpressServer` per row of the section 5 table; claim gate via `expressGate` |
| `assistant/daemon-access.ts:70–96` | `createDaemonAuthMiddleware`, `createRunOwnershipMiddleware`, `createOwnedRunListHandler`, `registerAttachmentLookupRoutes` | `requireAgentDaemonToken`/`requireRunOwnership` return `expressGate({ middleware })`; owned list is registered on a dispatcher at its current line; attachment lookup registers through `withServerMiddleware({ server, middleware: [gate] })` instead of the `app.post` wrapper |
| `server/runtime/composition/modules/assistant-tool-exec.ts`, `agent-daemon-core-rpc.ts`, `desktop-mcp-handoff.ts` | `requireToolExecutionCaller`, `registerToolExecutionRoutes` | gate via `expressGate`; routes on a dispatcher at the current line of the `router` |
| `assistant/mcp-ui-tool-calls-route.ts:230` | `deliverSurfaceCallback` (S4: returns a `Response`) | write it with `writeNodeResponse` |
| `assistant/site/visitor-frontend-control.ts:63` | `FrontendHttpExtension` (`app: Server`) | dispatcher at that line |
| `server/inbound/admin-http/routes/settings/shared.ts` | `mountJsonRoute`, `@jini-ai/core/settings/http`, `authenticate` port | settings `Server` created where `mountJsonRoute` is called today; `authenticate: ({ locals }) => getAuthedPrincipal({ locals })` |
| `server/inbound/public-http/routes/site/forms-submit.ts`, `comments-submit.ts` | O-forms handler shape | keep parsers and admission; pass the parsed body; `writeNodeResponse` |
| `server/error-mapping/respond.ts`, `server/inbound/shared/body-size-limit.ts` | `sendApiError`, `rejectOversizedJsonBody` | inline / import from the moved Tovu file |

Done check for the whole design: in Jini, `rg -n "from ['\"]express['\"]" packages/*/src --glob '!**/__tests__/**'` → no hits; `rg -n "@jini-ai/http-kit" packages/core/src` → no hits; the owner-rules audit's `server-framework-in-jini` count is 0. In Tovu, the section 5 characterization tests pass.

## 9. Assumptions (for the reviewer)

- A1 (verified): no Jini route reads a nested query object; `readQuery` keeps every flat shape and makes bracketed keys non-strings.
- A2: every Tovu Express app that mounts Jini routes has its blanket parser before them; the adapter rebuilds the body from `req.body`. Semantically equal for JSON routes; wrong only for signature checks (payments webhook, O-raw-body).
- A3: per-request cost of a web `Request` (one `Headers` copy, one `Readable.toWeb`) is small next to a JSON route's work, and is paid only on a match. With one dispatcher per mount point (about 10 in the daemon scope), an unmatched request costs about 10 table scans. If profiling ever shows it, index by first segment.
- A4: Jini 0.x allows removing `./<area>/express` subpaths with a CHANGELOG "Breaking" entry instead of aliases.
- A5: no Jini or Tovu client sends a compressed request body (O-kit verifies before the 415 lands).

## 10. Owner decisions

Made here (the owner can override):
1. The Express adapter lives in **Tovu** (host wiring), not in a Jini `@jini-ai/http-express` package. It is ~20 lines because the generic part is in Jini.
2. Jini's daemon serves on plain `node:http` by default. A host may inject its own `ListeningServer`.
3. Nested query parsing (`qs`) is dropped; `readQuery` keeps the flat shapes and refusals (A1).

Open (need the owner):
- **Q4. One body limit per route on every host.** Jini's standalone daemon accepts 100 KiB today; Tovu's daemon host accepts 6 MiB for the same routes (screenshots). Recommended: every daemon route states `DAEMON_JSON_BODY_MAX_BYTES` (6 MiB) on both hosts. Alternative: the standalone daemon keeps 100 KiB through a host option, at the cost of one more option on every daemon route. Waits: O-host only.
- **Q5. Compressed request bodies.** Recommended: refuse with 415 and plain words (no known client sends them). Alternative: inflate gzip/deflate with the limit applied to inflated bytes. Waits: O-kit's reader change only.
