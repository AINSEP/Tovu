# Server port: no server framework in Jini (Design A)

Status: designed 2026-11-13; revised twice the same day after the Codex reviews (`review-d2.md`, then `review-d2r.md`). **No Terra lane:** both reviews found judgment work (stream lifecycles, gate context, body limits, forms) in rows meant to be literal, so every site is built by Opus in the ordered stages of section 7. The shared pieces and one example site are in the Jini clone (`jini-terra-d2`, branch `design-d2`: `83b0234b1`, review fixes up to `f6e1401ed`).

Owner rule (2026-11-07): Jini code never depends on Express or any other server framework. Route code takes `{ app: Server }`, where `Server` is an interface. The host wires its framework through a thin adapter. Moving the website to Express 5 later must be a one-adapter change.

## 1. What already existed (reused, not reinvented)

- **`@jini-ai/core/contracts/server`** (`packages/core/src/contracts/server.ts`): `Server { route({ method, path, handler }) }`. A `ServerHandler` takes `{ request: Request, params, client? }` and returns a web `Response`. The file also defines the path syntax (`:name` segments) and the precedence rule (a literal segment beats `:param`; registration order never decides). It is types only. Before this work its only users were a typecheck file and `examples/notes-app`.
- **`examples/notes-app/src/node-server.ts`**: a plain `node:http` adapter for that contract. Its matcher and precedence code moved into http-kit (below), so every adapter shares one copy.
- **`@jini-ai/http-kit`**: `defineJsonRoute` / `mountJsonRoute` (`adapter.ts`). The route spec is already framework-neutral (`RouteInputContext`, `Result`, ports). Only the mounting is Express. Changing `mountJsonRoute` to take a `Server` converts ~70% of the daemon sites with no other edit.
- **`Pack.http({ app: unknown, services })`** (`packages/core/src/pack.ts:54`) already keeps the kernel framework-free. `builtin-features.ts` casts `app as Express` at each call; those casts become `app as Server`, and then `Pack.http` is typed `app: Server`.

## 2. The contract (decided)

These are additive changes to `packages/core/src/contracts/server.ts` (the first two are done; `path` lands in stage O2):

```ts
type ServerHandler = (required: { request: Request; params; client?: { address }; locals?: Record<string, unknown> }) => Response | Promise<Response>;
type ServerMiddleware = (required: { request; params; client?; locals: Record<string, unknown>;
  route: { method; path };   // the registered pattern (`/api/runs/:runId`); for a host gate, see section 5a
  path: string;              // the request path exactly as matched, never URL-normalized (O2)
  next: () => Promise<Response> }) => Response | Promise<Response>;
interface Server { route(r: ServerRoute): void }   // unchanged: one method wide
```

| Concern | Decision |
|---|---|
| Request | Web `Request`. Body via the bounded readers below (never an unbounded `request.json()`). Headers via `request.headers.get(name)` (Express `req.get(name)` → `request.headers.get(name) ?? undefined`). Query via `readQuery({ request })` (row "Query parsing"). Disconnect via `request.signal`. |
| Response | Return a web `Response`. Never write to a socket or a framework object. |
| Host context | `locals` starts each request seeded with the trusted values the host already set (`createNodeDispatcher` option `locals`; the Express adapter passes `res.locals`, where Tovu's admin auth puts the principal). Routes read identity from `locals` or from an authentication port, never from a request header the caller controls. Host params and the verified run principal cross the bridge as in section 5a. |
| next / middleware | `ServerMiddleware` calls `next()` and gets the `Response` back, or returns its own `Response` to refuse. Values for the handler go in `locals` (Express `res.locals`). Middleware wraps routes through the decorator `withServerMiddleware({ server, middleware }, { pathPrefix, exemptPaths })`, so which routes a gate covers depends on where they are registered, not on mount order. Exemptions name the route **pattern**, which closes the trap documented in `api-security-middleware.ts:230` (Express strips the mount prefix from `req.path`). |
| Error path | A handler or middleware **throws**. Express adapter → `next(error)`, so the host's existing error handler runs (same as Tovu's `asyncRoute`). Node adapter → `onUnhandledError({ error, reference })` plus a plain-words 500 that carries the same random `reference` and no error text ("The server could not finish this request. Reference: 3f9a…. Try again; if it keeps failing, send this reference to the site's owner."). A throwing sink is contained (one fixed stderr line naming only the reference), so `handle()` never rejects and the connection is cut in `finally` (d2r finding 5, `f6e1401ed`). A request with no usable URL falls through to the host (`next()`) or gets a plain 400. The default stderr sink redacts with the shared redactor plus host-injected `redactionPatterns`; Tovu passes its API-key shape, Jini names none. Routes match the request path exactly as received (no `..` resolution, `//` is not an authority). JSON routes keep http-kit's own SEC-005 path (`ClientFacingError`, redacted `INTERNAL_ERROR` with requestId), returning a `Response`. |
| Streaming / SSE | Return `new Response(readableStream, { headers: { 'content-type': 'text/event-stream', ... } })`. The adapter flushes headers first and writes chunks with backpressure. Each full-buffer wait adds `drain`/`close`/`error` listeners and removes all three when it settles; there is no per-chunk race against a shared promise, so a long SSE connection holds a fixed number of listeners. A client that leaves cancels the reader (which also ends a read waiting on an idle producer); the reader is always released in `finally`; a stream failing mid-way cuts the connection (d2r finding 4, `f6e1401ed`). Producers stop on `request.signal` abort. `sse.ts`/`raw-sse.ts` become `createSseStream()` → `{ response, send, close }` over a `ReadableStream` with the existing bounded queue (O1). |
| Body size | `readJsonBody({ request }, { maxBytes })` and `readBodyBytes(...)` (done): `{}` for no body, an empty body or a non-JSON type; objects and arrays only (strict); invalid → 400; too big → 413 (checked against content-length and while streaming). **Every body read states its limit; nothing relies on the 100 KiB default.** The value is the route's effective limit today on each host (section 6). Behind a host parser that already drained the body, the limit applies again to the rebuilt body, so a route's `maxBytes` must be at least the host parser's limit. Compressed request bodies: Q5. |
| Cookies / redirects | `Set-Cookie` via `headers.append('set-cookie', serialized)`. The adapter writes each cookie on its own line (tested). Redirect: `new Response(null, { status, headers: { location } })`. |
| Peer address | `client.address`, from the socket. It is never read from `x-forwarded-for`. `req.secure` / `req.protocol` → `new URL(request.url).protocol` (the Express adapter builds the URL from `req.protocol`, so `trust proxy` still applies). A host that resolves the client IP with its own proxy policy passes the result explicitly (forms, section 7 O4). |
| Query parsing | `readQuery({ request })` (http-kit `server-port`) returns the shapes Express 4's `req.query` (qs) gave: one value → string; a repeated key, `name[]` or `name[i]` (i ≤ 20, canonical numbers) in **any mix** → `string[]` in qs's order (`capability=a&capability[]=b` → `['a','b']`, `capability[1]=b&capability[0]=a` → `['a','b']`); any other bracketed key (`a[b]`, `a[21]`, `a[01]`) → a non-string, non-list value, so every existing "must be a string" or "list of strings" refusal still fires (d2r finding 6, `f6e1401ed`). Nested values are not parsed; no Jini route reads them (`rg -n "query\.[a-zA-Z]+\.[a-z]" packages/*/src` → none). `searchParams.get` is never used on a route. |
| Path params | The contract's `:name` syntax only. No `*`, regex or optional segments. That is also the subset Express 5's path-to-regexp v8 still accepts. |

## 3. Where things live

| Piece | Home | Runtime |
|---|---|---|
| Contract types, plus `ReadJsonBody` (the bounded-body-reader port type, below) | `@jini-ai/core/contracts/server` | universal, types only |
| Route table, `withServerMiddleware`, `jsonResponse`, `readJsonBody`, `readBodyBytes`, `readQuery`, `matchServerPath` | `@jini-ai/http-kit/server-port` | universal |
| `createNodeDispatcher` (options `next`, `origin`, `parsedBody`, `locals`, `params`; `onUnhandledError`, `redactionPatterns`), `writeNodeResponse`, `createNodeGate` | `@jini-ai/http-kit/node-bridge` | node |
| Standalone listener for Jini's own daemon (`createNodeServer` = dispatcher + `http.createServer` + listen/close) | `@jini-ai/http-kit/node-bridge` (O6) | node |
| `RUN_PRINCIPAL_LOCAL`, `DAEMON_JSON_BODY_MAX_BYTES` | `@jini-ai/daemon/http` | node |
| **Express adapter** (`createExpressServer`, `expressGate`) | **Tovu**: `apps/website/src/server/inbound/shared/express-server.ts` (section 5) | host |

`node:http` is the runtime, not a framework, so Jini's own daemon (`packages/server`) serves on it with no Express. Express stays only in Tovu and in http-kit's devDependencies (contract tests).

**Layering.** Core is the bottom layer and imports nothing from http-kit (http-kit depends on core). Core code that serves HTTP (settings, stage O4) takes body reading as a **port**: core declares the type, the host passes http-kit's function.

```ts
// @jini-ai/core/contracts/server (types only; http-kit's readJsonBody satisfies it structurally)
export type ReadJsonBody = (required: { readonly request: Request }, optional?: { readonly maxBytes?: number })
  => Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }>;
```

Core builds its responses natively (`new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })`) and maps `PAYLOAD_TOO_LARGE` → 413, other reader errors → 400 itself. No core file imports `@jini-ai/http-kit`.

## 4. Built in the Jini clone (branch `design-d2`)

- `83b0234b1`: contract (`ServerMiddleware`, `locals`); `server-port.ts` and `node-bridge.ts` with tests; example site `packages/daemon/src/http/message-relay.ts` (22 red → 22 green, 4 mutants killed). These ran in the original job.
- First review fixes (tests first, **not run**): `08537b637`, `7c4e45222` → `712993b60` (backpressure, `handle()` never rejects, host `locals`, `redactionPatterns`, raw-path matching); `dc6f6586b` → `aa509bd99`, `61d0aa69b` (`readQuery`); `ddb5fd1d9` → `bec86f159` (claim route's 1 KiB limit).
- Second review fixes (tests first, **not run**): `c7e237df0` → `f6e1401ed`: removable wait listeners and reader cancel/release in `finally` (d2r 4); contained sink, connection cut in `finally`, referenced 500 (d2r 5); mixed/indexed query lists, checked against the daemon's `parseCapabilityQuery` (d2r 6).

## 5. The Tovu Express adapter (exact code, lands in O7 after the Jini publish)

Tovu's installed Jini is 0.7.0, which lacks `node-bridge`. `node-bridge.test.ts` › "mounted in Express" proves the same wiring.

```ts
// apps/website/src/server/inbound/shared/express-server.ts
import type { RequestHandler, Router } from "express";
import type { Server, ServerMiddleware } from "@jini-ai/core/contracts/server";
import { createNodeDispatcher, createNodeGate } from "@jini-ai/http-kit/node-bridge";
import { TOVU_API_KEY_REDACTION } from "#src/features/identity/api-key-secret";

const hostOptions = (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1], next: Parameters<RequestHandler>[2]) =>
  ({ next, origin: `${req.protocol}://${req.get("host") ?? "localhost"}`, parsedBody: req.body, locals: res.locals, params: { ...req.params } });

/** Serves Jini `Server` routes at THIS point of the Express stack: every gate mounted before this
 * call runs before these routes, every host route mounted after it runs after. Create one per
 * Jini registration call, on that call's line (mount rule below). Unmatched requests and
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

`TOVU_API_KEY_REDACTION` is a new export next to `PREFIX_PATTERN` in `features/identity/api-key-secret.ts`: `{ name: "tovu_api_key", regex: /tovu_ak_[0-9a-f]{12}\.[A-Za-z0-9_-]+/g }`. `void` is safe: `handle()` never rejects (tested, including a throwing sink).

`createNodeGate` (O1): runs one `ServerMiddleware` against a Node request. A `Response` returned without calling `next()` is written. If it calls `next()`, values it wrote to `locals` are copied into the host's `locals` object, the host's `next()` is called, and the middleware's `next()` resolves to a `Response` the gate never writes. Only middleware that refuses or returns `next()` unchanged can be a host gate; middleware that reads the downstream response (observability) is mounted with `withServerMiddleware`. A gate that throws → host `next(error)`.

**Express 5:** `req`/`res` are still Node's `IncomingMessage`/`ServerResponse`, `next(err)` is unchanged, and the adapter never registers an Express path string. The upgrade touches no Jini code and no line of this adapter.

### Mount rule

**One `createExpressServer({ app })` per existing Jini registration call, created on that call's line.** Express runs layers in registration order, so a dispatcher created at the line of today's `registerXRoutes({ app })` call sits at exactly that point of the stack. Every gate mounted above it keeps running in front of those routes, and host routes mounted above it (the owned-run list override) still answer first. Cost: each request passes through every dispatcher until one matches (O(routes × segments) string compares each); the web `Request` is built only on a match.

`apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` (lines at design commit `b9be22800`):

| Line | Jini registration | Gates and host routes that run before it today (must still) |
|---|---|---|
| 1389 | `registerMessageRelayRoutes` | closed-scope guard (1369), idle park (1374), plugin events (1375); claim route only: `createDaemonAuthMiddleware` + 1 KiB parser (1380–1388) |
| 1468 | `registerRunRoutes` | the above, `requireAgentDaemonToken` (1398), 6 MiB parser (1407), delegated re-check (1433), `requireRunOwnership` on `/api/runs/:runId` (1445), owned-run list `GET /api/runs` (1446), credential run intake and durable start (1448–1449) |
| 1476 | `registerAgentRoutes` | bearer gate (1398), 6 MiB parser (1407) |
| 1519 | `registerDelegatedToolRoutes` | bearer gate, parser, run-scoped discovery (1424), delegated re-check with `validateDelegatedRunId` (1433) |
| 1545 | `frontendControl.httpExtension` | bearer gate, parser |
| 1548 | `registerFrontendRequestRoute` | bearer gate, parser |
| 1555 | `registerToolCatalogRoutes` | bearer gate, parser, run-scoped discovery (1424) |
| 1565 | `registerComponentCatalogRoutes` | the above plus the `/api/components` gate (1556) |
| 1595, 1602 | `registerDaemonAttachmentLookup`, `registerAttachmentRoutes` | bearer gate; raw upload bodies (O5) |

The same rule applies in every other Tovu file in the O7 inventory. O7 re-reads the line numbers; the order in the table is what must hold.

### 5a. Gate context across the bridge (d2r blocker 1)

Two run gates depend on context that a plain web `Request` does not carry. Copying `locals` alone does not preserve them.

| Gate today (`run-credentials.ts`) | Context it reads | Failure if lost |
|---|---|---|
| `createDaemonAuthMiddleware` (`:21`) | `req.path` (exact, for exemptions and the foreign-run check); on allow, **writes** the verified principal into `req.headers[x-tovu-principal-id]` (`:33`) | a forged principal header survives a run-scoped credential |
| `createRunOwnershipMiddleware` (`:49`) | `req.params.runId` from the Express mount `/api/runs/:runId`; `req.path` (mount-relative, `…/events` → SSE refusal shape); the principal header | `runId` undefined → `authorizeRunOwnership` allows (`run-credentials.ts:216` in `src/`): a foreign run passes |
| `createOwnedRunListHandler` (`:71`) | the principal header; `req.query.contextRef` | lists by an unverified principal |

Contract (stage O2):

1. **Params.** `NodeDispatchOptions.params` carries the host framework's matched params (Express `req.params`; `hostOptions` above). `createNodeGate` gives them to the middleware as `params`. A dispatcher ignores them (its own table matches params). Native mounting (`withServerMiddleware` in the standalone daemon) gets params from the matched pattern, so both hosts feed the same field.
2. **Path.** Middleware gets `path`: the request path exactly as the dispatcher or gate matched it, never URL-normalized. Behind `app.use(prefix, gate)` it is mount-relative, exactly like the `req.path` the gate reads today (Express rewrites `req.url` inside a mounted layer, and the bridge reads `incoming.url`). `route.path` stays the registered pattern; a host gate, which matched no pattern, gets `route.path === path`.
3. **Verified principal.** The policy result becomes `{ allowed: true; principalId?: string }` (replacing `principalHeader`). `authorizeDaemonRequest` sets it to the run-scoped credential's principal, or for the proxy credential to the principal header the proxy asserted (the gate now passes that header to `authorize` too); an exempt path with no credential sets nothing. `createDaemonAuthMiddleware` writes it to `locals[RUN_PRINCIPAL_LOCAL]` (`'runPrincipalId'`, exported from `@jini-ai/daemon/http`). **Every Jini reader takes the principal from that local only, never from the header:** the ownership gate, the owned-run list, and any converted route.
4. **Fail closed on a missing run id.** The ownership middleware throws a wiring error ("the run ownership gate is mounted where no :runId is matched; refusing instead of skipping the check") when `params.runId` is missing or empty. It is only ever mounted on `:runId` paths, so this changes nothing on a correct mount and turns a lost param into a 500, never a pass. `authorizeRunOwnership`'s own `!runId → allowed` stays for its other callers.
5. **Tovu host routes keep the header.** Five Tovu Express routes read `req.get(RUN_PRINCIPAL_HEADER)` after the gate (`mcp-ui-tool-calls-route.ts:105`, `a2ui-actions-route.ts:79`, `admin-frontend-owner.ts:10`, `durable-run-routes.ts:35`, `agent-daemon-scope.ts:1609`). O7 mounts, right after `expressGate(requireAgentDaemonToken)`, a 3-line Tovu layer that writes `res.locals[RUN_PRINCIPAL_LOCAL]` into `req.headers[RUN_PRINCIPAL_HEADER]` when present: the same overwrite the gate does today, so those routes change no line.

**Characterization tests (written first; Jini in O2, Tovu in O7):**
- Forged principal: run-scoped bearer for run A plus `x-tovu-principal-id: <other>` → the owned list shows only A's principal's runs; a converted Jini route sees the credential's principal in `locals`; Tovu's `durable-run-routes` sees it in the header. No bearer plus a forged header → 401. Exempt path, no credential, forged header → `locals` has no principal and a run route behind it answers 401.
- Foreign run: run-scoped credential for run A calling `/api/runs/B/...` → the same 404 as today (path check); proxy principal P calling a run owned by Q → the same 404/SSE refusal as today, through `expressGate` with params; ownership gate fed no params → 500 via `next(error)`, never the route.
- Mount-relative path: `/api/runs/:runId/events` refusal keeps the SSE shape through the gate.

## 6. Body limits and spec-field edits (d2r finding 3)

A converted route reads its own body, so the limit it had from the host's parser must become its own `maxBytes`. Effective limits **today**, per host (a later parser is a no-op once an earlier one parsed the body, so the first parser decides):

| Route group | Tovu host | Jini standalone daemon | After |
|---|---|---|---|
| Claim route (`message-relay`) | 1 KiB (`agent-daemon-scope.ts:1388`) | 100 KiB blanket | states 1 KiB (`bec86f159`) on both |
| Every other daemon JSON route in `packages/daemon/src/http` | 6 MiB (`:1407`, screenshots; why-comment `:1399–1406`) | 100 KiB (`compose-jini-kernel.ts:303`, `installJsonBodyParser`) | `DAEMON_JSON_BODY_MAX_BYTES` = 6 MiB on Tovu; standalone = **Q4** |
| Attachment lookup (`attachment-lookup-routes.ts:72`, declares 64 KiB) | **6 MiB** (Tovu's blanket parser runs first; the 64 KiB parser is a no-op) | 100 KiB (same reason) | `DAEMON_JSON_BODY_MAX_BYTES`: keeps Tovu's effective limit. Restoring the declared 64 KiB would be a behavior change; it is part of Q4 |
| Tool execution (`tool-execution-routes.ts:223`) | its own parser after its gate, `DEFAULT_TOOL_EXEC_MAX_BODY_BYTES` 16 MiB (or the host's `maxBodyBytes`) | same | same value, read after the gate |
| Settings (`core/src/settings`) | 15 MiB (`AUTHENTICATED_JSON_BODY_LIMIT`, parsed inside `requireAdminSession`) | not mounted | `registerSettingsRoutes` takes a required `maxBodyBytes`; Tovu passes 15 MiB |
| Forms / comments (Tovu-owned parsing) | forms: urlencoded 1 MiB, multipart 12 MiB, JSON 128 KiB public; comments: JSON 128 KiB public | not mounted | unchanged: Tovu keeps parsing (O4) |
| Payments webhook | raw 1 MiB default (`payments-webhook.ts:131`) | — | `readBodyBytes` with the same `optional.limit ?? 1 MiB` |

**Spec-field edits.** `maxBodyBytes` becomes a **required** `defineJsonRoute` spec field for every method except GET/HEAD (no silent default). The specs that need it, at design commit `83b0234b1` (`rg -c "method: ['\"](post|put|patch|delete)['\"]" packages/daemon/src/http --glob '!**/__tests__/**'`): 50 specs in 16 files: active-context 1 (incl. `:132`), agents 1, connectors 10, daemon-status 1, db-ops 2, delegated-tools 1, frontend-sessions 1, host-tools 1, media 2, memory 10, remote-run-events 2, research 1, routines 4, runs 3, terminals 5, xai 5. Each gets `maxBodyBytes: DAEMON_JSON_BODY_MAX_BYTES`. No spec outside `packages/daemon/src/http` has a body method. The edit lands in O5, the same commit as the file's conversion; O1 adds the field as optional, O6 makes it required once every spec states it, so each stage still type-checks.

## 7. Opus stages (ordered; no Terra)

Every stage: Opus at high effort, one dispatch per stage, Jini clone only (O7: Tovu). Characterization tests are written and committed first (red where the contract is new); the cloud gate runs the listed test files one at a time; the builder runs none (machine rule). Each stage leaves Jini type-checking: new pieces are added beside the old, callers move, and the old Express pieces are deleted only in O6. Conversion mapping for hand-written routes is in section 8.

**O1 — kit (`packages/http-kit/src`, `packages/daemon/src/http/body-limits.ts`)**
- Files: `adapter.ts`, `types.ts`, `request.ts`, `response.ts`, `origin.ts`, `observability.ts`, `route-registration-guard.ts`, `sse.ts`, `raw-sse.ts`, `node-bridge.ts`, `server-port.ts`, `middleware.ts`; new `daemon/src/http/body-limits.ts`.
- Contract: `mountJsonRoute({ app: Server, … })` registers `app.route(...)`; today's Express version is renamed `mountExpressJsonRoute` (`@deprecated`, deleted in O6) in one mechanical commit across its callers. `rawInput({ request, params })` with `query: readQuery(...)`; `readJsonBody` with `spec.maxBodyBytes` (optional field for now). `JsonRoutePorts.authenticate({ raw, request, locals, deps })`; `jsonResponse` / `apiErrorResponse`; `guardSameOrigin({ request })`; `createSseStream()`; `writeNodeResponse`, `createNodeGate` (section 5; options include `params`). `rejectOversizedJsonBody` is copied verbatim to Tovu in O7 (13 Tovu users); Jini's copy is deleted in O6. Non-identity `content-encoding` per Q5. `DAEMON_JSON_BODY_MAX_BYTES = 6 * 1024 * 1024` with Tovu's why-comment.
- Tests first: `createNodeGate` refusal / pass-through / locals copy-back / throw → `next(error)`, all through real Express (devDependency); `createSseStream` against a slow client (bounded pulls, as in `node-bridge.test.ts`) and a client that leaves mid-stream (producer stops, queue released); `mountJsonRoute` on a `Server`: 400/413/415, `rawInput` query shapes, SEC-005 redacted 500 with requestId.
- Done: every touched http-kit test file green in the cloud gate; `rg -n "from ['\"]express['\"]" packages/http-kit/src --glob '!**/__tests__/**'` lists only the deprecated Express pieces.

**O2 — gates, one trust boundary at a time (`packages/daemon/src/http`: `run-credentials.ts`, `remote-run-events.ts` middleware, `tool-execution-routes.ts` gate; `daemon/src/run-credentials.ts` policy; `http-kit` `local-daemon-request.ts`, `api-security-middleware.ts`; `cms/src/redirects/express`; core contract `path`)**
- Contract: section 5a, items 1–4. Each gate becomes a `ServerMiddleware` with the same checks in the same order and the same refusal bodies. `requireToolExecutionCaller` is a `ServerMiddleware` (Tovu mounts it with `expressGate`). The http-kit API gates become `withServerMiddleware(…, { pathPrefix: '/api', exemptPaths: OPEN_PROBE_PATHS })`. `cms/redirects` moves to `./redirects/http` (CHANGELOG "Breaking").
- Tests first: section 5a's Jini list; for each gate, one test per refusal branch through both mountings (`withServerMiddleware` and `createNodeGate` under Express), plus one mutant per refusal `if` (each must turn a test red).
- Done: no gate in these files imports `express`; the owner-rules audit's `server-framework-in-jini` count drops by these files.

**O3 — streaming routes (`daemon/src/http`: `frontend-sessions.ts`, `surface-restoration.ts`, `surface-callback.ts`, `model-proxy.ts`, `frontend-request-route.ts`, and the hand-written routes in `memory.ts:549`, `runs.ts:313`, `terminals.ts:322`)**
- Contract: `res.write`/`flushHeaders`/`on('close')` → a returned `ReadableStream` response plus `request.signal`; producers keep their bounded queues and stop on abort. `parseCapabilityQuery({ raw: readQuery({ request }).capability })` keeps arrays and refusals. `model-proxy.ts` is not a byte proxy: it keeps `entry.parse`, `entry.run`, `toStreamEvent`, sequencing, redaction and the single terminal `end` event; only the channel changes to `createSseStream()`. `surface-callback.ts` returns a `Response` (Tovu writes it with `writeNodeResponse`).
- Tests first: per stream, a slow client (pulls stay bounded), a client leaving mid-stream (producer stops, listeners and timers gone), a producer failing mid-stream (connection cut, one report), the terminal-event order of `model-proxy`; capability query forms (`capability-query-forms.unit.test.ts`, already committed) through the real route.
- Done: the stream files import no `express`; their existing tests, rewritten to `Request`/`Response`, green.

**O4 — forms, comments, settings (`cms/src/forms/express/*`, `cms/src/comments/express/*`, `core/src/settings/express/*`, `cms/src/settings/express/index.ts`, both `package.json` export maps)** (d2r finding 9)
- Forms contract: `createFormSubmitHandler(deps)` returns `({ request, params, body, client }) => Promise<Response>`. `body` is **the existing flat field map**, exactly the `req.body` Tovu's parsers produce today (urlencoded fields, multipart fields with attachment values from `parseFormMultipartMiddleware`, or JSON), typed `Record<string, unknown>`; `params` holds the **decoded** `slug` (Express-decoded today; Tovu passes `req.params`); `client` is `{ ip: string; secure: boolean }`, resolved by Tovu with its own proxy policy (`resolveClientIp(req)`, `isHttpsRequest(req)`), replacing the two request-taking callbacks. `wantsHtmlResponse`, referer checks and host reads use `request.headers`. Every refusal, 303 redirect, flash cookie, 409/507 retry page and status stays byte-identical.
- Comments contract: `createCommentSubmitHandler(deps, optional)` returns `({ request, body, client }) => Promise<Response>`; `clientIp` is replaced by `client.ip`; `formRedirect` and `onAccepted` take the web `request`. Tovu adapts its two callbacks in O7.
- Settings contract: `registerSettingsRoutes({ app: Server, readJsonBody: ReadJsonBody, maxBodyBytes, authenticate, … }, optional)`; the principal comes from `authenticate({ request, locals })`, where Tovu's `getAuthedPrincipal` reads `locals.principal`; `PrincipalResolver({ request, locals })`. `stream.ts` builds its `ReadableStream` natively in core. The two scalar query reads use a core-local reader with `String(x ?? "")` semantics (stated in the commit). Subpaths move to `./forms/http`, `./comments/http`, `./settings/http`; the cms forwarding file re-exports `@jini-ai/core/settings/http` in the same commit.
- Tests first: the current Express tests of all three, rewritten to call the new handlers with the same inputs, asserting byte-identical status, headers (`Cache-Control`, `Location`, `Set-Cookie`) and bodies; forms: one urlencoded, one multipart-with-attachment and one JSON body, an encoded slug (`a%20b`), and an IP that differs from the socket's; settings: a request with no `locals.principal` → the same 401.
- Done: no file under these folders imports `express`; `rg -n "@jini-ai/http-kit" packages/core/src` → no hits.

**O5 — remaining routes (`daemon/src/http`: the type-swap files `active-context`, `agents`, `component-catalog`, `connectors`, `daemon-status`, `db-ops`, `delegated-tools`, `frontend-control`, `health`, `host-tools`, `media`, `research`, `routines`, `tool-catalog`, `xai` (type only; its model constant is another job), the rest of `memory`/`runs`/`terminals`, `attachment-lookup-routes.ts`, `frontend-guest-scope.ts`, `attachments.ts`; `commerce/src/http/payments-webhook.ts`)**
- Contract: `{ app: Server }`; section 6's spec-field edits; `attachments.ts` streams uploads via `request.body` with `readBodyBytes`-style limits and its own `readQuery` reads; `payments-webhook.ts` reads the exact signed bytes with `readBodyBytes`, and its doc states the host must create this route's `Server` before any blanket parser. `packages/server` keeps its Express app for now and serves each converted registration through a `createNodeDispatcher` mounted at that registration's line (mount rule), so the standalone daemon stays green.
- Tests first: per hand-written route, its existing tests rewritten to the contract (copy `message-relay.test.ts`), red, then green, then one mutant per refusal; one test per file that a body over its stated limit gets 413 and one at the limit passes; the webhook's signature check against bytes that a JSON round trip would change.
- Done: `rg -n "from ['\"]express['\"]" packages/daemon/src packages/commerce/src --glob '!**/__tests__/**'` → no hits.

**O6 — Express removal from Jini (`packages/server/src`, `core/src/pack.ts`, `http-kit` deprecated pieces, `examples/notes-app`, `package.json` files)**
- Contract: `create-local-node-daemon.ts` / `compose-jini-kernel.ts` take an injectable `server?: ListeningServer` (default `createNodeServer()`); `express()`, `app.listen`, `x-powered-by` and the blanket `express.json()` go; the gates it mounts with `app.use` today are re-mounted with `withServerMiddleware` in the same order; `LocalNodeHttpExtension` becomes `(app: Server, ctx)`; `builtin-features.ts` casts become `app as Server`; `Pack.http` is typed `{ app: Server }`. Delete `mountExpressJsonRoute`, `sendJson`, `sendApiError`, `rejectOversizedJsonBody`; make `maxBodyBytes` required. `express`/`@types/express` stay devDependencies of http-kit only. CHANGELOG "Breaking" entries. Publish.
- Tests first: the standalone daemon refuses an unauthenticated request with today's status and body; serves one route of each group; Q4's chosen limit (a body just over it → 413); the notes example on `createNodeServer`.
- Done: in Jini, `rg -n "from ['\"]express['\"]" packages/*/src --glob '!**/__tests__/**'` → no hits; `rg -n "@jini-ai/http-kit" packages/core/src` → no hits; owner-rules audit `server-framework-in-jini` = 0.

**O7 — Tovu (after the publish; every item is a trust boundary)**
- Bump Jini; add `express-server.ts`, `TOVU_API_KEY_REDACTION`, the principal-header layer (5a item 5) and the moved `reject-oversized-json-body.ts`. Characterization tests first: for each row of the section 5 table, one request without credentials gets the same status and body as before; `GET /api/runs` with a proxy principal returns only that principal's runs; a `/api/tools` request with no live run gets the same refusal; section 5a's Tovu list.
- Consumers of changed public contracts, each with the mount rule:

| Tovu file | Changed Jini contract | Change |
|---|---|---|
| `server/inbound/assistant/agent-daemon-scope.ts` | all `register*Routes`, `httpExtension`, `createDaemonAuthMiddleware` on the claim route | one `createExpressServer` per row of the section 5 table; claim gate via `expressGate` |
| `assistant/daemon-access.ts:70–96` | `createDaemonAuthMiddleware`, `createRunOwnershipMiddleware`, `createOwnedRunListHandler`, `registerAttachmentLookupRoutes` | `requireAgentDaemonToken`/`requireRunOwnership` return `expressGate({ middleware })` (params via `hostOptions`); the owned list is registered on a dispatcher at its current line; attachment lookup registers through `withServerMiddleware({ server, middleware: [gate] })` |
| `server/runtime/composition/modules/assistant-tool-exec.ts`, `agent-daemon-core-rpc.ts`, `desktop-mcp-handoff.ts` | `requireToolExecutionCaller`, `registerToolExecutionRoutes` | gate via `expressGate`; routes on a dispatcher at the current line of the `router` |
| `assistant/mcp-ui-tool-calls-route.ts:230` | `deliverSurfaceCallback` returns a `Response` | write it with `writeNodeResponse` |
| `assistant/site/visitor-frontend-control.ts:63` | `FrontendHttpExtension` (`app: Server`) | dispatcher at that line |
| `server/inbound/admin-http/routes/settings/shared.ts` | `mountJsonRoute`, `@jini-ai/core/settings/http`, `authenticate` port, `maxBodyBytes` | settings `Server` created where `mountJsonRoute` is called today; `authenticate: ({ locals }) => getAuthedPrincipal({ locals })`; 15 MiB |
| `server/inbound/public-http/routes/site/forms-submit.ts`, `comments-submit.ts` | O4 handler shapes | keep parsers and admission; pass `params`, the parsed flat body and `client: { ip: resolveClientIp(req), secure: isHttpsRequest(req) }`; adapt `formRedirect`/`onAccepted`; `writeNodeResponse` |
| `server/error-mapping/respond.ts`, `server/inbound/shared/body-size-limit.ts` | `sendApiError`, `rejectOversizedJsonBody` | inline / import from the moved Tovu file |

- Done: the characterization tests pass in the cloud gate; Tovu `rg -n "@jini-ai/(core/settings|cms/(forms|comments|redirects|settings))/express"` → no hits.

## 8. Conversion mapping (reference for O2–O5)

| Express | Server contract |
|---|---|
| `req.params.x` | `params.x` |
| `req.query.x` | `readQuery({ request }).x`, read once where the old code first read `req.query`; keep the old type checks exactly |
| `req.get('h')` / `req.headers['h']` | `request.headers.get('h') ?? undefined` |
| `req.path` | `path` in middleware (5a item 2); in a handler, the pattern is known, so compare params instead |
| `req.body` | `readJsonBody({ request }, { maxBytes })` with the section 6 value, read after the auth checks, where the old code first used it |
| `res.status(s).json(b)` / `res.json(b)` | `return jsonResponse({ status: s, body: b })` |
| `res.sendStatus(s)` / `res.redirect(s, url)` | `new Response(null, { status: s })` / `new Response(null, { status: s, headers: { location: url } })` |
| `res.cookie(...)` | `headers.append('set-cookie', serialize(...))` with the file's existing serializer |
| `res.set(h, v)` | the response's headers |
| `next(error)` | `throw error` |
| `res.locals.k` (set by this file's own middleware) | `locals.k` |

Rules for every stage: keep every refusal message, status and body; the only allowed difference is a bare JSON `null`/string body now refused by `readJsonBody` (as in `message-relay.test.ts`). Move "why" comments with their code; comments that say "Express" say "the host adapter". No `eslint-disable`, no `as any`, no non-null `!`; arguments `(required, optional = {})`; functions ≤ 50 lines; cyclomatic and cognitive complexity ≤ 10.

## 9. Assumptions (for the reviewer)

- A1 (verified): no Jini route reads a nested query object; `readQuery` keeps every flat and list shape qs gave and makes other bracketed keys non-strings.
- A2: every Tovu Express app that mounts Jini routes has its blanket parser before them; the adapter rebuilds the body from `req.body`. Semantically equal for JSON routes; wrong only for signature checks (payments webhook, O5).
- A3: per-request cost of a web `Request` (one `Headers` copy, one `Readable.toWeb`) is small next to a JSON route's work and is paid only on a match. About 10 dispatchers in the daemon scope → about 10 table scans for an unmatched request. If profiling ever shows it, index by first segment.
- A4: Jini 0.x allows removing `./<area>/express` subpaths with a CHANGELOG "Breaking" entry instead of aliases.
- A5: no Jini or Tovu client sends a compressed request body (O1 verifies before Q5's choice lands).
- A6: inside `app.use(prefix, layer)`, Express rewrites `req.url` to the mount-relative path, so the bridge's `path` for a host gate equals the `req.path` the gate reads today (5a item 2; pinned by the `/events` test).

## 10. Owner decisions

Made here (the owner can override):
1. The Express adapter lives in **Tovu** (host wiring), not in a Jini `@jini-ai/http-express` package. It is ~20 lines because the generic part is in Jini.
2. Jini's daemon serves on plain `node:http` by default. A host may inject its own `ListeningServer`.
3. Nested query parsing (`qs`) is dropped; `readQuery` keeps the flat and list shapes and the refusals (A1).
4. No Terra lane for this design; Opus builds O1–O7 in order.

Open (need the owner):
- **Q4. One body limit per route on every host.** Jini's standalone daemon accepts 100 KiB today; Tovu's daemon host accepts 6 MiB for the same routes (screenshots). Recommended: **yes**, every daemon route states `DAEMON_JSON_BODY_MAX_BYTES` (6 MiB) on both hosts (every route there is token-gated). Alternative: the standalone daemon keeps 100 KiB through a host option, at the cost of one more option on every daemon route. Same question for attachment lookup: recommended to keep its effective 6 MiB rather than restore its never-enforced 64 KiB. Waits: O5 (attachment lookup) and O6 only.
- **Q5. Compressed request bodies.** Recommended: refuse with 415 and plain words (no known client sends them). Alternative: inflate gzip/deflate with the limit applied to inflated bytes. Waits: O1's reader change only.
  - **DECIDED (owner 2026-11-14): refuse with 415, never unzip.** Why (keep this as the why-comment at the refusal, and the 415 message says it in plain words): (1) zip bombs: a small compressed body can inflate to gigabytes and freeze or crash the server before any size limit sees it; (2) decompression code is a known attack surface (bugs in unzip libraries have been exploited), so not running it removes that risk; (3) a compressed body hides its real content and size from our checks and logs, which helps someone smuggle in oversized or malicious input, including text aimed at hijacking the AI. Unzipping data does not run it, but none of these risks is worth it: no known client sends compressed bodies.
