# R7: daemon `src/http` returns `ServerRoute[]`; the host mounts it (design, 2026-11-16)

Docs only. Nothing here was executed. Read with `INDEX.md` (order, prerequisites, estimates) and `R8-RUNTIME.md`.

**Bases read:** Jini `integ/wave-b-r2` @ `02edbb68`, Tovu `integ/wave-b-r2` @ `65302ee5`, Jini `design-d2` @ `f6e1401e` (d2 server-port work), plan `plan/terra-2026-11-15` @ `9152711d`. Every count below was taken with `rg`/a script on those trees; the commands are in §9 so the executor can re-run them.

**One-line result:** LANES says "83 `mountJsonRoute` calls". That is right, but the directory registers **100 routes** (83 JSON + 17 hand-mounted) and **3 path gates**, and 30 files import `express`. The 17 hand-mounted routes hold all the risk: SSE, NDJSON streaming, a raw upload, cookies, loopback checks, and three Express middleware factories.

---

## 1. What is there today (verified)

### 1.1 Totals

| Thing | Count | How counted |
|---|---|---|
| `mountJsonRoute(` calls | **83** in 19 files | `rg -c "mountJsonRoute\("` |
| Hand-mounted routes (`app.get/post/delete`) | **17** from 13 call sites in 10 files | model-proxy's loop makes 5, its catch-all 1 |
| Path gates (middleware with no answer of their own) | **3** | `remote-run-events.ts:269-270` (2 × `app.use`), `frontend-sessions.ts:307` (conditional `app.post(..., next)`) |
| Exported `register*` functions | **28** (+1 private `registerGenericProxyStreamRoute`) | §1.2 |
| Other exports typed with Express | **12** | §1.4 |
| Files importing `express` | **30** (28 type-only; 2 value imports for `express.json`) | `attachment-lookup-routes.ts:18`, `tool-execution-routes.ts:25` |
| http-kit import lines in `src/http` | 41 in 26 files | G-HTTP-AUTH covers 6 of the names |
| WebSocket / `upgrade` / multer / `express.raw` | **0** | `rg -i "upgrade|WebSocket|multer|express\.raw"` |
| `spec.ports` (`authenticate`/`authorize`/`onError`) used by daemon specs | **0** | so the Express-vs-core `JsonRoutePorts` difference does not touch daemon |
| http test files | 54 (25 build an `express()` app, 17 `listen` on a socket, 20 `vi.mock('@jini-ai/core/contracts/server')`) | |

### 1.2 Route inventory by file

`SO` = routes with `requireSameOrigin: true` (JSON) or a hand-called `guardSameOrigin` (raw). "Preset" = `packages/server/src/builtin-features.ts`. "Tovu-scope" = `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts`.

| # | File (lines) | JSON | Raw | Register fn | Production callers | Specifics |
|---|---|---|---|---|---|---|
| 1 | `active-context.ts` (151) | 2 | 0 | `registerActiveContextRoutes` | Preset:389 | SO 2. Builds a store **per registration** (state cell, §3.4). |
| 2 | `agents.ts` (92) | 2 | 0 | `registerAgentRoutes` | Preset:339, Tovu-scope:1476 | SO 1. Type import from agent-runtime (C6). |
| 3 | `component-catalog.ts` (91) | 2 | 0 | `registerComponentCatalogRoutes` | Tovu-scope:1565 | SO 2 (deliberately strict on a GET; "why" at :55, :74). |
| 4 | `connectors.ts` (527) | 14 | 0 | `registerConnectorsRoutes` | Preset:525 | SO 10. File already > 500. |
| 5 | `daemon-status.ts` (109) | 2 | 0 | `registerDaemonStatusRoutes` | Preset:685 | SO 1. Reads `process.*` (1). |
| 6 | `db-ops.ts` (296) | 3 | 0 | `registerDaemonDbRoutes` | Preset:445 | SO 3. `node:crypto`. |
| 7 | `delegated-tools.ts` (392) | 1 | 0 | `registerDelegatedToolRoutes` | Preset:501, Tovu-scope:1519, `apps/desktop/src/desktop-agent.ts` | SO 1. Body up to the host limit (Tovu 6 MB). Hot path. |
| 8 | `health.ts` (131) | 6 | 0 | `registerHealthRoutes` | Preset:246 | SO 0. **Mounted before the body parser and both security gates** (phase `pre-auth`). |
| 9 | `host-tools.ts` (429) | 2 | 0 | `registerHostToolsRoutes` | Preset:357 | SO 1. Second arg is a positional deps bag (not `(required, optional)`). `node:child_process` spawn, `process.*` (5), platform `createCommandInvocation`. |
| 10 | `media.ts` (482) | 4 | 0 | `registerMediaRoutes` | Preset:642, `examples/reference-web/src/daemon.ts` | SO 2. |
| 11 | `research.ts` (300) | 1 | 0 | `registerResearchRoutes` (+ `createResearchSearchRoute`) | Preset:539 | SO 1. `research-tavily.adapter.ts` imports agent-runtime `validateBaseUrl` (C6 `BaseUrlGuardPort`). |
| 12 | `routines.ts` (409) | 7 | 0 | `registerRoutineRoutes` | Preset:625 | SO 4. |
| 13 | `tool-catalog.ts` (113) | 2 | 0 | `registerToolCatalogRoutes` | Preset:466, Tovu-scope:1555, desktop-agent | SO 2. |
| 14 | `xai.ts` (802) | 6 | 0 | `registerXaiRoutes` | Preset:560 | SO 6. 13 agent-runtime values (C6 `XaiOAuthPort`, follow-up F1). File > 500. |
| 15 | `memory.ts` (603) | 15 | 1 SSE | `registerMemoryRoutes`, `registerMemoryEventStream` | Preset:608, reference-web | SO 10 + SSE guard. **Order comment** at :580 (static paths before `/:id`). Three `EventEmitter` subscriptions per stream, removed in `onClose`. File > 500. |
| 16 | `runs.ts` (381) | 5 | 1 SSE | `registerRunRoutes`, `registerRunEventStream` | Preset:290, Tovu-scope:1468 | SO 3; SSE has **no** origin guard. `Last-Event-ID`/`afterCursor` replay. Error-before-open answers JSON, error-after-open ends the stream. |
| 17 | `terminals.ts` (360) | 6 | 1 SSE | `registerTerminalRoutes`, `registerTerminalEventStream` | Preset:416 | SO 5 + SSE guard. Deferred-end gate (:266), `isEndEvent` on `exit`, 404 after `abandon()`. |
| 18 | `frontend-sessions.ts` (339) | 1 | 1 SSE + 1 gate | `registerFrontendSessionRoutes` | Preset:659, `frontend-control.ts:170` | `routePrefix` is configurable. Host hook `deps.resolveOwner({ req, res })` takes **Express objects**. `res.sendStatus(403/429)`. TTL timer per scoped session. Uses http-kit `createSseResponse` (`raw-sse.ts`). |
| 19 | `remote-run-events.ts` (273) | 2 | 2 gates | `registerRemoteRunEventRoutes` | Preset:585 | SO 0 by design; bearer gate `requireRemoteToolBridgeToken`. `process.*` (2). |
| 20 | `model-proxy.ts` (659) | 0 | 6 SSE | `registerModelProxyRoutes` | Preset:374 | Guard inside `runProxyStream` (:418) and in the catch-all (:622). 5 agent-runtime tool-turn values (C6 `ProviderToolTurnPort`, follow-up F3). File > 500. |
| 21 | `attachments.ts` (1639) | 0 | 2 | `registerAttachmentRoutes` | Tovu-scope:1602, reference-web | POST streams the **raw request body** to disk (`for await (chunk of request)`, :762); DELETE reads parsed JSON and answers **204 no body**. Detects an already-consumed stream. Per-registration `activeUploads` counter. Host hook `resolveOwnerId({ req })`. platform `writeJsonFileAtomicAsync`. File is 3× the limit. |
| 22 | `attachment-lookup-routes.ts` (89) | 0 | 1 | `registerAttachmentLookupRoutes` | Tovu `daemon-access.ts` | Own parser `express.json({ limit: '64kb' })`. |
| 23 | `message-relay.ts` (48) | 0 | 1 | `registerMessageRelayRoutes`, `createMessageRelayClaimHandler` | Tovu-scope:1389 | Bearer token; errors go to `next(error)`. Tovu puts a 1 KB parser in front. **d2 already converted this file** (`f6e1401e`). |
| 24 | `frontend-request-route.ts` (69) | 0 | 1 NDJSON | `registerFrontendRequestRoute` | Tovu-scope:1548 | Host hook `resolveOwner({ req, res })`; plain-string error bodies; streams through `streamToolExecution` with keepalive. |
| 25 | `tool-execution-routes.ts` (237) | 0 | 2 (1 NDJSON) | `registerToolExecutionRoutes` | Tovu `modules/assistant-tool-exec.ts` | Chain: gate → `express.json({ limit })` → optional host `authorizeRun: RequestHandler` → handler → body-parser error handler. Loopback peer check on `req.socket.remoteAddress`. `env = process.env` default. 16 MiB limit. 15 s keepalive timer. |
| | **Total** | **83** | **17 + 3 gates** | 28 | | |

Support files with no route of their own: `index.ts` (394 lines, the `./http` entry: a barrel), `route-manifest.ts`, `run-credentials.ts`, `frontend-control.ts`, `frontend-guest-scope.ts`, `surface-callback.ts`, `surface-restoration.ts`, `cancel-owned-runs.ts`, `catalog-route-input.ts`, `model-proxy-fields.ts`, `research-tavily.adapter.ts`, `resource-request.ts`, `workspace-root.ts`.

### 1.3 Callers (every one)

| Caller | Calls | Notes |
|---|---|---|
| Jini `packages/server/src/builtin-features.ts` | 19 `register*` calls (rows 1,2,4–20 minus 3) | Each inside `Pack.http({ app, services })` with `app as Express`. The preset builds `express()` itself (`create-local-node-daemon.ts:374`) and mounts gates in `compose-jini-kernel.ts:284-333`. |
| Jini `packages/daemon/src/http/frontend-control.ts:170` | `registerFrontendSessionRoutes` | `FrontendHttpExtension` is typed `{ app: Express }` (:63). |
| Jini `examples/reference-web/src/daemon.ts` | attachments, media, memory, `createFrontendControl` | An example host. |
| Tovu `agent-daemon-scope.ts` | 9 sites: lines 1389, 1468, 1476, 1519, 1545 (`frontendControl.httpExtension`), 1548, 1555, 1565, 1602 | Interleaved with 12 Express gates and two parsers (1 KB at :1388, 6 MB at :1407). Builds the `adapter` at :1434. |
| Tovu `assistant/daemon-access.ts` | `registerAttachmentLookupRoutes`, `createDaemonAuthMiddleware`, `createRunOwnershipMiddleware`, `createOwnedRunListHandler` | The three factories have **no Jini production caller**. |
| Tovu `apps/desktop/src/desktop-agent.ts` | `registerDelegatedToolRoutes`, `registerToolCatalogRoutes` | Own `adapter` at :371. |
| Tovu `modules/assistant-tool-exec.ts`, `desktop-mcp-handoff.ts`, `agent-daemon-core-rpc.ts` | `registerToolExecutionRoutes`, `requireToolExecutionCaller` | The gate is reused on Tovu's own routes. |
| Tovu `assistant/site/visitor-frontend-control.ts` | `createFrontendControl`, `createFrontendGuestScope` | Guest cookie. |
| Tests | Jini: 54 files in `http/__tests__` + 4 `server` tests. Tovu: 12 files (delegated 3, runs 2, owned-run-list 3, frontend-control 3, component-catalog 1) | |

Not mounted by the preset at all: rows 3, 21–25. They exist only for Tovu and the example host.

### 1.4 Express-only features in use (each needs a named answer in §3)

| Feature | Where | Web-standard answer |
|---|---|---|
| Parsed `req.body` from an upstream `express.json` | all 83 JSON routes, attachments DELETE, message-relay, frontend-request | `readJsonBody({ request }, { maxBytes })` inside the route; the host bridge passes an already-parsed body through (d2 `parsedBody`) |
| Per-route parser with its own limit | attachment-lookup 64 KB, tool-exec 16 MiB, Tovu's 1 KB claim parser | `maxBodyBytes` on the spec, or `readJsonBody(..., { maxBytes })` |
| Raw request stream | attachments POST | `request.body` (`ReadableStream<Uint8Array>`, async-iterable on Node); consumed check = `request.bodyUsed \|\| request.body === null` |
| `req.query` (Express/qs shapes) | 83 JSON routes, attachments (`name`, `batch`), tool catalog (`principalId`), SSE cursor | `readQuery({ request })` (d2 `aa509bd9` keeps the Express 4 shapes); `lastEventCursor` |
| `res.status().json()`, `res.json()` | everywhere | `jsonResponse({ status, body })` |
| 204 with no body | attachments DELETE | `new Response(null, { status: 204 })` |
| `res.sendStatus(403/429)` | frontend-sessions | `new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } })`: the body text and header are part of today's answer and are pinned in Phase 0 |
| SSE via `createSseChannel` (enqueue/open/end/abandon/onClose) | memory, runs, terminals, model-proxy | `createSseStream({ scheduler }, {...})`, return `stream.response` |
| SSE via `createSseResponse` (raw) | frontend-sessions | same |
| NDJSON chunked response + keepalive timer | tool-exec, frontend-request, `surface-restoration.ts` | one daemon-local line stream (§3.3) |
| Client disconnect = `res.on('close')` | `streamToolExecution`, `surface-restoration`, `mountJsonRoute` | `request.signal` (the adapter aborts it on response close; core `json-route.ts` already relies on this) |
| `req.complete`, `res.destroyed`, `res.headersSent`, `res.writableEnded` | tool-exec, attachments, model-proxy, frontend-sessions | disappear: a handler returns exactly one `Response`, chosen before it returns |
| `req.socket.remoteAddress` | tool-exec loopback check | `client.address` (already on `ServerHandler`) |
| `res.cookie(...)`, `req.secure` | `frontend-guest-scope.ts:44` | a `set-cookie` header on the `Response`; "secure" becomes an injected `isSecureRequest` port (§3.5) |
| `req.headers[x] = y` (mutation read by later handlers) | `run-credentials.ts:36` | not expressible on a web `Request`; see D3 |
| `next()` / `next(error)` | gates, message-relay, run-credentials | `ServerMiddleware` `next()`; errors are thrown, the adapter's error path answers |
| Express error-handler middleware | `bodyParserFailure` in tool-exec | `readJsonBody` returns a `Result` (413 / 400); no error middleware |
| Registration order decides a match | memory (`/tree` before `/:id`) | the `Server` contract makes a literal segment win over `:name`, so order stops mattering; pinned in Phase 0 |
| `app.use(path, gate)` | remote-run-events | `withRouteMiddleware` on those two routes (§2.3) |
| Host hooks typed with Express | `resolveOwner({ req, res })`, `resolveOwnerId({ req })`, `allowsRequest({ req })`, `authorizeRun: RequestHandler` | hooks take `{ request: Request }` (+ `locals`); `authorizeRun` becomes the typed `AuthorizeToolRun` port (§3.5): it rewrites the parsed body today |

---

## 2. Target contract

### 2.1 Shape (per route group)

```ts
// packages/daemon/src/http/memory.ts  (same file; the register function is replaced, not wrapped)
import { jsonRoute, type ServerRoute } from '@jini-ai/core/contracts/server';
import type { DaemonRouteHost } from './route-host.js';

/**
 * Every memory route as data. Static sub-resources and `/api/memory/:id` can be listed in any order:
 * the Server contract matches a literal segment before a `:name` segment, so an `index`/`config`/`extract`
 * slug can never shadow the real handlers. (This replaces the old "mount static routes first" rule.)
 */
export function memoryRoutes(
  { deps, host }: { readonly deps: MemoryHttpDeps; readonly host: DaemonRouteHost },
  _optional: Record<string, never> = {},
): ServerRoute[] {
  const routeDeps: MemoryRouteDeps = { ...deps, reportInternalError: host.reportInternalError };
  const json = <I, O>(spec: JsonRouteSpec<I, O, MemoryRouteDeps>): ServerRoute =>
    jsonRoute({ spec, deps: routeDeps, reportInternalError: host.reportInternalError }, { host: host.context });
  return [
    json(memoryOverviewRoute), json(memoryTreeRoute), /* … 13 more, same order as today … */
    memoryEventStreamRoute({ deps: routeDeps, host }),
  ];
}
```

`_optional: Record<string, never> = {}` is what the package uses today on these functions. Owner practice 2 forbids `?: Record<string, never>`; the default-valued form `= {}` is the one the wave-B lane brief allows. Where a group has real optional settings (`toolExecutionRoutes`: `tokenEnvVar`, `maxBodyBytes`, `runWithContext`, `authorizeRun`, `onInternalError`) they stay in the second object.

```ts
// packages/daemon/src/http/route-host.ts  (NEW, ~30 lines; the one thing every group takes from the host)
import type { ReportRouteInternalError, RouteHostContext, SseSchedulerPort } from '@jini-ai/core/contracts/server';

/** What a host hands every daemon route group. The host builds it once per listener. */
export interface DaemonRouteHost {
  /** Same-origin policy and the incident sink (core's own context; after C-ORIGIN-PORT it carries `originPolicy`). */
  readonly context: RouteHostContext;
  /** SEC-005 reporter: makes the request ID and writes the default log line. Core has no default (it needs a UUID source). */
  readonly reportInternalError: ReportRouteInternalError;
  /** Timers for SSE and NDJSON keepalives. Tests pass a manual-tick fake. */
  readonly scheduler: SseSchedulerPort;
}
```

One user group (25 files) inside one package, so it is declared in daemon (B4), not in core.

### 2.2 Names: old → new (old deleted in the same commit; no alias)

`registerXRoutes({ app, deps, adapter })` → `xRoutes({ deps, host })`. Full list: `activeContextRoutes`, `agentRoutes`, `componentCatalogRoutes`, `connectorsRoutes`, `daemonStatusRoutes`, `daemonDbRoutes`, `delegatedToolRoutes`, `healthRoutes`, `hostToolsRoutes({ deps, host })` (its positional deps bag becomes `deps`), `mediaRoutes`, `researchRoutes`, `routineRoutes`, `toolCatalogRoutes`, `xaiRoutes`, `memoryRoutes`, `runRoutes`, `terminalRoutes`, `frontendSessionRoutes`, `remoteRunEventRoutes`, `modelProxyRoutes`, `attachmentRoutes`, `attachmentLookupRoutes({ store }, { onInternalError })`, `messageRelayRoutes`, `frontendRequestRoutes`, `toolExecutionRoutes`.

The three stream-only registers (`registerMemoryEventStream`, `registerRunEventStream`, `registerTerminalEventStream`) have no production caller outside their own file. They become unexported `*StreamRoute()` builders; their tests go through `memoryRoutes`/`runRoutes`/`terminalRoutes`.

`FrontendHttpExtension` (`frontend-control.ts:63`) becomes `(required: { host: DaemonRouteHost }) => ServerRoute[]`, and `createFrontendControl(...).httpExtension` is renamed `routes`.

### 2.3 What C4 (core `contracts/server`) must still provide

C4 landed the vocabulary (`ServerRoute`, `jsonRoute`, `jsonResponse`, `readJsonBody`, `readQuery`, `createSseStream`, `lastEventCursor`, `withServerMiddleware`, `createRouteTable`, `createInMemoryServer`, `serverConformance`). Four things are missing. Each is small and has more than one user (daemon now, cms in R9).

| # | Addition | Why | Size |
|---|---|---|---|
| C4-a | `sameOriginRefusal({ request, origin }): Response \| undefined` exported from `json-route.ts` (today a private `originRefusal`) | 8 hand-mounted daemon routes call the guard themselves. Without it each rebuilds the `host`/`origin`/`sec-fetch-site` triple. | move 6 lines, 1 export |
| C4-b | `withRouteMiddleware({ route, middleware }): ServerRoute` (the per-route form of `withServerMiddleware`; `runChain` is already written, private, in `middleware.ts`) | A list-returning group must attach its **own** gates (tool-exec caller gate, remote-bridge token, frontend-session ownership) so a host cannot mount the route without them. `withServerMiddleware` needs a `Server`, which the group never sees. | ~12 lines |
| C4-c | `bearerTokenFromHeader` in `core/contracts/server/auth.ts` (G-HTTP-AUTH, verbatim move from `http-kit/api-security-middleware.ts:62`) and `isLoopbackPeerAddress` in `core/net` (G-HTTP-AUTH, `STRICT_IPV4` regex instead of `net.isIP`) | 3 + 1 daemon sites | G-HTTP-AUTH sheet, ~20k |
| C4-d | C-ORIGIN-PORT (`SameOriginPolicyPort`, `createLocalSameOriginPolicy`, `createTestRouteHost`, `allowAllOrigins`, `denyAllOrigins`) | Removes the 20 `vi.mock('@jini-ai/core/contracts/server')` blocks that R7's tests would otherwise carry over. **Not landed at `02edbb68`** (`origin.ts` still has `resolvedPortRef` + env fields). | GAPS §2, ~70k |

Two behaviour questions about landed C4 code that Phase 0 must answer before any route moves (lesson 6: the test must be able to fail):

- **Cursor on repeated query keys.** `requestedAfterCursor` (http-kit) returns `null` for `?afterCursor=a&afterCursor=b` (Express gives an array). `lastEventCursor` (core) returns `'a'` (`searchParams.get`). Pin today's answer; if they differ, C4 changes `lastEventCursor` to `getAll(...).length === 1` first (failing test first).
- **Abort.** Express `mountJsonRoute` writes nothing when the client left; core `jsonRoute` returns a 499 `Response`. No client sees either. The only observable difference is the adapter's access log. Record it as an accepted difference in the commit message; do not pin a status nobody receives.

Nothing else is asked of core. In particular **no `middleware` or `gates` field is added to `ServerRoute`**: one field with one user is not worth a contract change (practice 11).

### 2.4 The route table as data (what the snapshot test reads)

Tests need "method + path + gate order" without booting a server. `ServerRoute` carries only method, path and handler, and a wrapped handler hides its gates. So each daemon route is built through one local helper that also records its gate names:

```ts
// packages/daemon/src/http/route-table.ts (NEW, ~40 lines)
/** A daemon route plus the names of the gates in front of it, in run order. Assignable to ServerRoute. */
export interface DaemonRoute extends ServerRoute { readonly gates: readonly DaemonGateName[] }
export type DaemonGateName = 'same-origin' | 'tool-exec-caller' | 'remote-bridge-token' | 'frontend-session-owner';
export function gated(required: { route: ServerRoute; gates: readonly { name: DaemonGateName; middleware?: ServerMiddleware }[] }): DaemonRoute
export function describeRoutes(required: { routes: readonly ServerRoute[] }): { method: string; path: string; gates: readonly string[] }[]
```

`'same-origin'` is recorded for a spec with `requireSameOrigin` (no middleware object; `jsonRoute` runs it). `route-manifest.ts` then stops hand-copying specs: `JINI_ROUTE_MANIFEST` is built by `describeRoutes` over the same lists, and the `RouteRegistration` type import from http-kit goes away (G-HTTP-AUTH's last site).

---

## 3. How the hard cases fit

### 3.1 SSE (10 routes: memory 1, runs 1, terminals 1, frontend-sessions 1, model-proxy 6)

```ts
function memoryEventStreamRoute({ deps, host }: { deps: MemoryRouteDeps; host: DaemonRouteHost }): DaemonRoute {
  return gated({ gates: [{ name: 'same-origin' }], route: { method: 'GET', path: '/api/memory/events', handler: ({ request }) => {
    const refused = sameOriginRefusal({ request, origin: host.context });   // before anything is subscribed
    if (refused) return refused;
    return openMemoryStream({ deps, scheduler: host.scheduler, signal: request.signal });
  } } });
}
```

Rules, each tied to a line that exists today:

1. **Refuse before subscribing.** Today the guard runs before `createSseChannel`. A refused request must leave `deps.notes.events.listenerCount('change')` at 0.
2. **One `onClose`, every exit.** `createSseStream`'s `onClose` runs once for abort, cancel, overflow and `end()`. All unsubscribes go there (memory's three `off` calls, terminals' `manager.detach`, frontend-sessions' TTL `clearTimeout` and `handle.detach`).
3. **Decide the answer before returning.** `channel.abandon()` + JSON error (runs.ts:345, terminals.ts:339) becomes "do the lookup first, return `jsonResponse(404)` or `stream.response`". For terminals this means `manager.attach` is called **before** the stream is returned, with a sink that writes to an already-created stream. If attach says `not-found`, call `stream.end()` (releases the keepalive timer), then return the 404.
4. **The deferred-end gate goes away, with proof.** `createDeferredEndGate` exists because `channel.end()` before `open()` dropped the queued backlog. `SseStream.end()` is documented "ends the stream after the frames already queued". Phase 0 pins the scenario (attach to an exited terminal → all replay frames then end) against today's code; the same test must pass on the new code. Only then is `createDeferredEndGate` and its test deleted (it has no other caller).
5. **Wire bytes.** Phase 0 golden-files one frame per stream kind (`id:`/`event:`/`data:` lines, the keepalive comment, the response headers). `createSseChannel` and `createSseStream` were written at different times; if the keepalive text or a header differs, pass `formatEvent`/`headers` so the bytes stay the same.
6. **Queue cap.** Both cap at 1000 queued events and drop the connection. Pin it with a consumer that never reads.

### 3.2 Raw upload (attachments POST)

`handleAttachmentUpload` keeps its order (rate limit → batch dir → bounded stream → signature → register → `finally` tidy). Only its edges change:

- Input `{ request, deps, state }`; output `Promise<Response>`. `respondToUploadFailure` returns a `Response`.
- Body: `writeBoundedAttachmentBody({ request: request.body ?? emptyBody, ... })`. It already takes `AsyncIterable<unknown>`; chunks become `Uint8Array`, which `Buffer.from` handles. The `Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))` line must change to `Buffer.from(chunk as Uint8Array)`. **A `Uint8Array` is not a `Buffer`, and `String(uint8array)` is a comma-joined number list.** This is the single most likely silent corruption in R7. Phase 0 uploads a binary file with bytes ≥ 0x80 and asserts the stored bytes.
- Consumed-stream detection (`'attachment-body-consumed'`): today it inspects the Node stream. New rule: `request.body === null || request.bodyUsed`. With the d2 bridge, a host that parsed the body upstream hands it back as `parsedBody`, so the route would see re-serialized JSON, not the original bytes. So **the upload route must be mounted above every parser**; Tovu's comment at `agent-daemon-scope.ts:1596-1601` already explains why its `application/octet-stream` body survives. Phase 0 keeps the existing "host parser ate the body" test and adds "`content-type: application/json` upload behind a JSON parser → `attachment-body-consumed`, not a stored re-serialized file".
- `activeUploads` stays a per-call closure cell of `attachmentRoutes()` (two daemons in one process must not share a budget; the comment at :1605 moves with it).
- `acquireActivity`/`release` wrap the handler in `try/finally` exactly as today.
- Host hook `resolveOwnerId({ req })` becomes `resolveOwnerId({ request, locals })`.

R7 does **not** split the 1,639-line file. That is a size lane with its own design; mixing a split with a contract change breaks "one refactor type per change". The new code R7 adds goes in a new sibling file (`attachment-routes.ts`, ≤ 120 lines) so the oversized file only shrinks.

### 3.3 NDJSON streaming (tool-exec POST, frontend-request POST, `surface-restoration.ts`)

Three users in one package → one daemon-local helper, no core change:

```ts
// packages/daemon/src/http/line-stream.ts (NEW, ≤ 70 lines)
export interface LineStream { readonly response: Response; write(required: { line: unknown }): void; end(): void; readonly signal: AbortSignal }
export function createLineStream(
  { scheduler, request }: { scheduler: SseSchedulerPort; request: Request },
  { keepAliveMs }: { keepAliveMs?: number } = {},
): LineStream
```

- Headers `content-type: application/x-ndjson`, `cache-control: no-store`, status 200 (today's values).
- `signal` aborts when `request.signal` aborts or the body is cancelled; it replaces `res.on('close')` + `req.on('error')`.
- Keepalive `{"type":"keepalive"}\n` every 15 s only when `keepAliveMs` is given (frontend-request passes it; tool-exec does not), through `scheduler`. Cancelled in `end()` and on abort.
- `settled` flag semantics stay: a surface emission after the result line is dropped.
- `if (!req.complete || controller.signal.aborted) return;` becomes `if (request.signal.aborted) return closed-empty stream`. `req.complete` has no web equivalent; the body was already read by `readJsonBody` at that point, so "incomplete body" has already surfaced as a 400.

**Flush.** Express `res.flushHeaders()` sends headers before the first line. With a `Response`, the adapter writes headers when the handler returns, which is before the tool runs because the executor is started without `await` (as today: `void streamToolExecution(...)`). Phase 0 asserts "headers arrive while the tool is still pending" with a fake executor that never resolves.

### 3.4 State cells and their owner (lesson 2, 4)

| Cell | Today | After |
|---|---|---|
| Active-context store | created inside `registerActiveContextRoutes` | created inside `activeContextRoutes()`; one per call. The preset calls it once per daemon. A test asserts two calls do not share a store. |
| `activeUploads` | per registration | per `attachmentRoutes()` call |
| Model-proxy provider registry | built once per registration | once per `modelProxyRoutes()` call |
| Frontend-session TTL timers | `setTimeout(...).unref()` per scoped stream | through `host.scheduler`… **no**: `SseSchedulerPort` is an interval port. Keep `setTimeout` (daemon is a Node package), cleared in `onClose`. A one-shot timer port has one user; not added. |
| SSE subscriptions | per request | per request, released in `onClose` |

A route group must be **called once per listener**. Calling it twice now gives two independent route lists instead of a duplicate-registration error from Express, and the `Server` adapter rejects the second `route()` with the same method + path. That is the same failure, moved to mount time.

### 3.5 Auth and same-origin

| Concern | Attached how | Owner |
|---|---|---|
| Same-origin on JSON routes | `spec.requireSameOrigin` → `jsonRoute` → `guardSameOrigin` with `host.context` | daemon declares, host supplies the policy (C-ORIGIN-PORT) |
| Same-origin on hand-built routes | `sameOriginRefusal({ request, origin: host.context })` first line of the handler (C4-a) | same |
| Tool-exec caller gate (token env + loopback + bearer) | `withRouteMiddleware` inside `toolExecutionRoutes`; exported too, because 3 Tovu files reuse `requireToolExecutionCaller` on their own routes. `env` becomes **required** (`{ env }`), no `process.env` default (practice 1). | daemon |
| Remote-bridge token | `withRouteMiddleware` on the two remote-run-event routes; replaces the two `app.use(path, gate)` | daemon |
| Frontend-session ownership (`resolveOwner` + bind token) | `withRouteMiddleware` on the responses route when `deps.resolveOwner` is set | daemon runs it, host supplies `resolveOwner({ request, locals })` |
| Host bearer gate, origin middleware, run-ownership gate, idle-park, 6 MB parser | stay Express middleware in Tovu, above the line where the route list is mounted | Tovu |
| `authorizeRun` (host check between parse and execute; may replace the principal) | typed port `AuthorizeToolRun`, called after the body is parsed (see below) | host supplies, daemon orders |
| Guest cookie (`frontend-guest-scope.ts`) | `issue({ request })` returns `{ tabCredential, setCookie: string }`; the route puts `setCookie` on its `Response`. `secure: req.secure` becomes `isSecureRequest({ request })`, a required host port, because "is this HTTPS" behind a proxy is host policy (Express answered it from `trust proxy`). | daemon builds the cookie text; Tovu answers "secure?" |

**Tool-exec `authorizeRun` is not a gate; it is a decision that rewrites the call (verified).** Tovu passes `authorizeRun: requireSiteToolRun(...)` (`modules/assistant-tool-exec.ts:91, 222-238`). That Express handler (a) reads the **parsed body** (`run.id`, `principal.id`) on POST and the query on GET, (b) looks the run up, and (c) **overwrites `req.body.principal`** with the run's recorded principal before the handler runs. A `ServerMiddleware` cannot do (c): a web `Request` body is immutable and read once. So the order stays exactly as today (caller gate → read + parse body → authorize → execute) and the hook becomes a typed port that returns its verdict as data:

```ts
/** Host check that a tool call belongs to a live run. May replace the principal the call runs as. */
export type AuthorizeToolRun = (
  required: { readonly kind: 'execute'; readonly call: ToolExecutionWireRequest } | { readonly kind: 'catalog'; readonly principalId: string; readonly runId: string | undefined },
  optional?: Record<string, never>,
) => Promise<{ readonly allowed: true; readonly principal?: Principal } | { readonly allowed: false; readonly response: Response }>;
```

The route calls it after `parseExecutionRequest` and uses `verdict.principal ?? call.principal`. Tovu's `requireSiteToolRun` body is kept, with its `refuse()` returning the same 403 JSON as a `Response`. Phase 0 (T9) pins: a body naming principal A for a run recorded under principal B executes as **B**; `toolAccess: 'read-only'` survives the rewrite; an unknown run → 403 with that exact body; the lookup rejecting → the adapter's error path (today `.catch(next)`). This is a security-relevant rewrite: a conversion that drops it lets a caller pick its own principal.

**D3: the three middleware factories leave Jini.** `createDaemonAuthMiddleware`, `createRunOwnershipMiddleware`, `createOwnedRunListHandler` (`http/run-credentials.ts`, 83 lines) are Express glue around decisions the **host** already supplies (`authorize`, `filterOwnedRuns`). Their only production callers are Tovu's `agent-daemon-scope.ts` and `daemon-access.ts`. One of them mutates `req.headers` so later Express handlers see a principal header, which a web `Request` cannot express. They move to Tovu beside their callers (lesson 9: host binding stays in the host), with their test. `RunAccessDecision` is referenced nowhere else in Jini (`rg` at `02edbb68`), so it moves too. This is a move + delete, not a rewrite. See INDEX owner decision O-3 for the alternative.

### 3.6 Body size and the double parse (practice 12)

While Tovu keeps its blanket `express.json({ limit: '6mb' })`, a converted JSON route sees its body twice: parsed by Express, re-serialized by the bridge (`parsedBody`), parsed again by `readJsonBody`. Cost per request: one extra `JSON.stringify` + one extra `JSON.parse` of the body. For `POST /api/delegated-tool-calls` and `POST /api/runs` that can be megabytes, on every tool call.

- During R7: accepted, bounded by the host's limit, behaviour identical. Core's 100 KiB default would otherwise reject bodies Tovu accepts today, so **every daemon spec that can exceed 100 KiB sets `maxBodyBytes`** to the host limit it lives under (a daemon constant, value = owner decision O-2).
- End of R7 (step G3-6): Tovu deletes the blanket parser in the daemon scope and the 1 KB claim parser; the routes read their own bodies once. Phase 0's body-limit matrix (limit−1, limit, limit+1 per route class) proves nothing got looser.

---

## 4. Host mounting

### 4.1 Prerequisite: a bridge from Node `http` to `Server`

Neither host can mount a `ServerRoute` today: nothing at `02edbb68` implements `Server` except the in-memory test server and `examples/notes-app/src/node-server.ts`. The d2 branch has it written and reviewed: `packages/http-kit/src/node-bridge.ts` (`createNodeDispatcher`, with `next`, `parsedBody`, `locals`, backpressure, redacted 500). C4 took d2's `server-port.ts` into core but did not land `node-bridge.ts`. **P-NODE-BRIDGE** (INDEX) lands it on top of C4 (its one import of `./server-port.js` becomes `@jini-ai/core/contracts/server`). R7 reuses it; it writes no bridge of its own.

### 4.2 Tovu (`apps/website/src/server/runtime/composition/jini-routes.ts`, NEW; C4 sheet §6 and §10.4 as decided)

```ts
import type { ServerRoute } from '@jini-ai/core/contracts/server';
import { createNodeDispatcher } from '@jini-ai/http-kit/node-bridge';
import { reportRouteInternalError } from '@jini-ai/http-kit';
import type { DaemonRouteHost } from '@jini-ai/daemon/http';
import type { Express } from 'express';

/** Mount rule: call this ON THE LINE of the former `register*Routes({ app })`, so every Express gate above still runs first. */
export function mountJiniRoutes({ app, routes }: { app: Pick<Express, 'use'>; routes: readonly ServerRoute[] }, _optional: Record<string, never> = {}): void {
  const dispatcher = createNodeDispatcher({}, { redactionPatterns: [TOVU_API_KEY_REDACTION] });
  for (const route of routes) dispatcher.server.route(route);
  app.use((req, res, next) => { void dispatcher.handle({ incoming: req, out: res }, { next, parsedBody: req.body, locals: res.locals }); });
}

/** One per daemon scope; built from the values `agent-daemon-scope.ts:1434` builds `adapter` from today. */
export function daemonRouteHost(required: { context: RouteHostContext }): DaemonRouteHost {
  return { context: required.context, reportInternalError: reportRouteInternalError, scheduler: nodeIntervalScheduler } satisfies DaemonRouteHost;
}
const nodeIntervalScheduler = { every: ({ callback, intervalMs }) => setInterval(callback, intervalMs), cancel: ({ handle }) => clearInterval(handle as NodeJS.Timeout) };
```

Use, one line per former registration (`agent-daemon-scope.ts:1476`):
```ts
-registerAgentRoutes({ app, deps: { listAgents: …, rescanAgents: … }, adapter });
+mountJiniRoutes({ app, routes: agentRoutes({ deps: { listAgents: …, rescanAgents: … }, host }) });
```

`agent-daemon-scope.ts` is one of the files the size designs split (`01-tovu-composition-deps`, daemon scope). R7 edits lines in place and adds one import; it creates no new structure there. If a size lane has moved those lines first, R7's Tovu half follows the moved code (lesson 10).

**Unmatched requests.** The dispatcher calls `next()` for a path it does not own, so Tovu's later routes still match. A request whose path matches but whose method does not must also fall through (Express would have tried later layers). VERIFY in `node-bridge.test.ts` that `method-not-allowed` with `next` given calls `next()` rather than answering 405; the code at `f6e1401e` does (`if (dispatchArgs.options.next) return dispatchArgs.options.next()`).

### 4.3 Jini `server` preset (host-preset, Q1 = yes)

`Pack.http({ app, services })` keeps `app: unknown` in core. The preset passes a `Server`:

```ts
// packages/server/src/builtin-features.ts:339 (one of 19 identical edits)
-http: ({ app, services }) => registerAgentRoutes({ app: app as Express, deps: {...}, adapter: services.context.adapter }),
+http: ({ app, services }) => mount({ app, routes: agentRoutes({ deps: {...}, host: services.context.routeHost }) }),
```

with `mount` a 3-line local (`for (const route of routes) (app as Server).route(route)`) and `services.context.routeHost` built once in `create-local-node-daemon.ts` beside today's `adapter`.

The preset's own `express()` app and its gates (`compose-jini-kernel.ts:284-333`) are **out of R7**: replacing Express in the preset with `createNodeServer` is d2 stage O6/R13 work. During R7 the preset wraps its Express app with the same dispatcher-per-phase mount as Tovu (`mountPhase` creates one dispatcher per `FeaturePhase`, `app.use`d at the position `mountPackHttp` runs today), so `pre-auth` health routes stay above the parser and gates. The preset is a host-preset and may import `express` until R13 removes it (INDEX O-4).

### 4.4 Example host

`examples/reference-web/src/daemon.ts`: same three edits as Tovu, with the dispatcher inline. It is the "second host" check: if mounting needs anything Tovu-specific, the contract is wrong.

---

## 5. Migration: three groups, every commit compiles and passes

A **pair** is one Jini commit + one Tovu commit. The old function is deleted and every caller repointed in the same pair (no shells). Tovu is only ever checked against the Jini SHA named in its commit message; the coordinator does not advance Tovu's Jini link between the halves of a pair. Jini half: daemon + `server` preset + `examples/` + their tests. Tovu half: the callers in §1.3 + their tests.

| Step | Content | Routes | Pairs |
|---|---|---|---|
| **P0** | Characterization tests (§6), no source change. Lands and is green **before** anything else. | — | 1 Jini, 1 Tovu |
| **P1** | `route-host.ts`, `route-table.ts`, `line-stream.ts` + their unit tests; Tovu `jini-routes.ts` + its unit test (moved "mounted in Express" case from d2). Nothing calls them yet. | — | 1 |
| **G1** | JSON-only files, one pair per file, smallest first: `tool-catalog`, `component-catalog`, `agents`, `daemon-status`, `active-context`, `delegated-tools`, `research`, `db-ops`, `health`, `host-tools`, `media`, `routines`, `connectors`, `xai` | 54 | 14 |
| **G2** | JSON + SSE: `remote-run-events` (gates, no SSE: first), `runs`, `memory`, `terminals`, `frontend-sessions` + `frontend-control`, `model-proxy` | 39 | 6 |
| **G3** | Raw body / NDJSON / cookies: `attachment-lookup-routes`, `message-relay` (start from d2's version), `tool-execution-routes`, `frontend-request-route` + `surface-*`, `frontend-guest-scope`, `attachments`; then G3-6 (drop Tovu's blanket parsers, §3.6), then D3 (move `run-credentials.ts` factories to Tovu) | 7 | 8 |
| **Z** | Delete what has no caller left: http-kit `mountJsonRoute`, Express `JsonRouteSpec`/`JsonRoutePorts`/`defineJsonRoute`, `rawInput`, `passesSameOriginGuard`, `sendJson`, `sendApiError`, `sendRawApiError`, `createSseChannel`, `requestedAfterCursor`, `createSseResponse`. **Only if R9 (cms) has also converted**; otherwise Z waits for R9. Drop `express` from daemon `peerDependencies`, `@jini-ai/http-kit` from daemon `dependencies`; remove the retired `injection-debt.json` keys. `route-manifest.ts` rebuilt from the lists. | — | 1 |

Per-file recipe (G1; ≤ 15 minutes of edits):
1. Repoint `defineJsonRoute`/`JsonRouteSpec` imports from `@jini-ai/http-kit` to `@jini-ai/core/contracts/server` (`C4.repoint.tsv` phase `route-conversion` rows for that file).
2. Replace `reportRouteInternalError` (http-kit) with `deps.reportInternalError` (injected through the `*RouteDeps` wrapper, §2.1). The local `reportInternalError({ deps, ... })` helpers keep their name and call sites.
3. Replace the `register*` function with `*Routes` (§2.1). Move its doc comment; rewrite only the sentence about mounting.
4. Delete `import type { Express }`.
5. Update callers and tests in the same pair. A test that built `express()` + `listen` now uses `createInMemoryServer()` and `fetch(new Request(...))`. Assertions do not change. A test that cannot be expressed that way is **SKIP + record**, never loosened.
6. Run the file's tests, the Phase 0 matrix for that file, `tsc --noEmit` in daemon and server, the complexity and size ratchets.

**Group order reasons.** G1 first because it exercises only `jsonRoute` and calibrates cost (LANES: "calibrate on R7's first route group"). `remote-run-events` opens G2 because it introduces `withRouteMiddleware` with no streaming. `attachments` is last because it needs the parser order of G3-6 understood.

**What is deliberately not in R7:** splitting oversized files (`attachments` 1639, `xai` 802, `model-proxy` 659, `memory` 603, `connectors` 527); moving `xai.ts` to its provider (C6 F1) and model-proxy's vendor calls (F3); replacing Express inside the `server` preset; `route-registration-guard`. Each is listed in INDEX with its owner.

**Rollback.** Each pair reverts alone (`git revert` both halves). P0 and P1 stay.

---

## 6. Phase 0: characterization tests (written first, must be able to fail)

All in `packages/daemon/src/http/__tests__/characterization/`, run against **today's** Express code through one harness, then re-run unchanged against the converted code by swapping the harness's mount function. That swap is the only edit these files get.

```ts
// harness.ts: the one seam. Before R7: express() + register*; after: createInMemoryServer + *Routes.
export interface RouteHarness { fetch(request: Request, optional?: { client?: { address: string } }): Promise<Response>; close(): Promise<void> }
```

Before conversion the harness really listens on `127.0.0.1:0` and uses global `fetch` (17 existing tests already do this), with the preset's middleware order (`express.json()` then routes; health first).

| # | Test | Asserts (what would fail) |
|---|---|---|
| T1 | **Route table snapshot** | An inline literal (not a regenerated snapshot, AP5) of all 100 routes: `METHOD path [gates in order]`, grouped by file. Before: read from Express's router stack (`app._router.stack`, method + path + layer order, with handler names for the gates). After: `describeRoutes`. Fails on a lost route, a changed path, a lost or reordered gate. |
| T2 | **Precedence** | `GET /api/memory/tree`, `/index`, `/config`, `/events`, `/extractions`, `/verifications` reach their own handlers and `GET /api/memory/abc` reaches the entry handler. Same for `/api/runs` vs `/api/runs/:runId/events`. Fails if literal-over-param does not reproduce today's order. |
| T3 | **Response matrix, JSON** (one `it.each` row per route = 83 rows) | For each: happy status + `content-type` + body shape; parse failure → 400 + error code; `requireSameOrigin` routes: cross-origin → 403 + `FORBIDDEN` + exact message; handler throws → 500, body has `requestId`, body does **not** contain the thrown message, sink got the original error (SEC-005). Status **and** code asserted (AP1). |
| T4 | **Body limits** | Per limit class (preset 100 KB default, attachment-lookup 64 KB, tool-exec 16 MiB via injected small `maxBodyBytes`, claim 1 KB): limit−1 passes, limit passes, limit+1 → 413 + code (AP9). Malformed JSON → 400. `content-encoding: gzip` → today's answer, recorded (core answers 415; if Express inflated it, this is a behaviour change that needs the owner: STOP). |
| T5 | **Query shapes** | `?a=1&a=2`, `?a[]=1`, `?a[b]=1`, empty value, repeated `afterCursor`: the `RouteInputContext.query` a spec's `parse` receives. Fails if `readQuery` differs from Express for a shape a daemon parser reads. |
| T6 | **SSE** (5 kinds) | Headers; first frame bytes; keepalive frame bytes at 15 s (fake scheduler / fake timers); cursor replay from `Last-Event-ID` and from `?afterCursor=`; end event closes; client abort → listener counts back to 0 and no pending timers (AP10); overflow at 1000 queued; cross-origin → 403 and **zero** listeners added; terminal attach to an exited session → all replay frames then end; run stream error before open → JSON 500, after open → stream ends. |
| T7 | **NDJSON** | tool-exec: headers before result (pending executor), `surface` lines before `result`, a surface after `result` is dropped, thrown executor → `throw` line with name/message/code, client abort → executor's signal aborted; frontend-request: keepalive line at 15 s, plain-string 400/403 bodies byte for byte. |
| T8 | **Upload** | Binary bytes ≥ 0x80 round-trip; too large → code, partial file removed, batch dir tidied; 5th concurrent upload refused (limit 4) and the counter returns to 0 after failure; consumed body → `attachment-body-consumed`; DELETE → 204, empty body, no `content-type`; `acquireActivity` released on success, refusal and throw. |
| T9 | **Gates** | tool-exec: no token configured → code `NOT_CONFIGURED`; non-loopback peer → `FORBIDDEN`; wrong bearer → `UNAUTHORIZED`; right bearer → reaches handler; and **the handler is not called and the body is not read** on each refusal. One case per clause, each breaking only that clause (AP8). Same for remote-bridge token and frontend-session ownership (wrong owner, wrong bind token, resolver throws → 403). |
| T10 | **Cookie** | `issue` sets `HttpOnly; SameSite=Strict; Path=…; Max-Age=…`, `Secure` only when the request is secure, `Cache-Control: no-store`; a tab token never authenticates as the guest cookie. |
| T11 | **Middleware order (host level)**, in `packages/server` and Tovu | Health answers 200 with no token and an oversized body (proves it sits above the parser and gates); an API route with no token → 401 **before** its body is parsed (send malformed JSON + no token → 401, not 400). Tovu: the same two probes on `agent-daemon-scope` plus "claim route with a live run credential passes the 1 KB parser". |
| T12 | **State isolation** | Two `activeContextRoutes()` / `attachmentRoutes()` calls do not share state. |

Clock, UUIDs and timers are pinned (injected `now`, `newRequestId`, fake scheduler). Request IDs are matched by shape and equality between the body and the sink, not by value.

**Fakes (practice 8).**
- **Fake `Server`:** `createInMemoryServer()` from `@jini-ai/core/contracts/server/testing` (exists; passes `client` and `locals`). No new fake server is written.
- **Fake host:** `createTestRouteHost()` (C-ORIGIN-PORT) wrapped by a daemon test helper `fakeDaemonRouteHost({ originPolicy?, onInternalError? })` that adds a recording `reportInternalError` (returns `{ code: 'INTERNAL_ERROR', message, requestId: 'req-1' }` and stores the report) and a manual-tick `SseSchedulerPort`. Lives in `packages/daemon/src/http/__tests__/fakes/route-host.ts`; not published.
- **Deleted with their last user:** `fixtures/same-origin-gate.ts` and the 20 `vi.mock('@jini-ai/core/contracts/server')` blocks (C-ORIGIN-PORT does this before R7).
- Tests stop importing `@jini-ai/http-kit` (3 files) and `express` (25 files). No `vi.mock` of another package is added.

**Test count rule.** Each pair's report states the number of `it(` before and after for the files it touched. The number may only go up, except for `createDeferredEndGate`'s own tests (deleted with the function, replaced by T6's exited-session case) and the same-origin fixture's tests.

---

## 7. Owner practices, checked one by one

| # | Practice | Status in this design |
|---|---|---|
| 1 | DI, no globals | `host` supplies origin policy, reporter, scheduler. `env = process.env` default in tool-exec becomes required. **Left for R8/other lanes:** `process.*` reads in `host-tools.ts` (5), `xai.ts` (2), `workspace-root.ts` (2), `remote-run-events.ts` (2), `daemon-status.ts`, `research.ts`; `nodeSpawn` default in `host-tools.ts` (R8 P-3). |
| 2 | `(required, optional = {})` | All 25 `*Routes`. Fixed in passing: `registerHostToolsRoutes(required, openInDeps = {})` positional deps bag. **Conflict flagged:** existing `_optional: Record<string, never> = {}` is kept (lane-brief form); if the owner reads practice 2 as banning that too, say so (INDEX O-5). |
| 3 | ≤ 50 lines, complexity ≤ 10 | Every new function in §2–§4 is under 30 lines. `memoryRoutes` is a 20-line list. Converted handlers get **smaller** (no `headersSent` branches). Not fixed here: `handleFrontendSessionStream`, `runProxyStream` (measure at dispatch; if conversion pushes either over, extract the stream-opening half first in its own commit). |
| 4 | Feature slicing | Files keep their per-feature names. Three new shared files, one job each. **Not met and not fixed:** 5 files > 500 lines (size lane). |
| 5 | No barrels / shells / aliases | Every old `register*` deleted in its pair. **Conflict flagged:** `http/index.ts` (394 lines) is the package's `./http` entry and is a barrel. B1 allows a package's own public entry; practice 5 read strictly does not. R7 only renames lines in it. INDEX O-6. |
| 6 | "Why" comments move | Listed where they change meaning: memory order comment (reworded to the precedence rule), attachments body-parser note, model-proxy "guard can throw" note (still true: `originPolicy.isSameOrigin` may throw), tool-exec `res` vs `req` close note (reworded to `request.signal`), `mountJsonRoute`'s disconnect comment (already in core). |
| 7 | Boundaries; no server framework in Jini | After Z: daemon imports core + protocol only for HTTP; `express` leaves daemon's manifest. `server` preset still uses Express until R13 (O-4). http-kit keeps `node-bridge` (Node, not a framework). |
| 8 | Fakes of interfaces | §6. No real http-kit, no `vi.mock` of another package. |
| 9 | Errors | SEC-005 path unchanged and pinned (T3). Plain-string bodies in frontend-request and `{ error: { code, message } }` literals in message-relay are kept byte for byte (changing them is a behaviour change for another lane). |
| 10 | No new disables, no silent changes | One known difference is named, not hidden: the abort answer (§2.3). The tool-exec order is kept (§3.5). Any other difference found by Phase 0 is a STOP. |
| 11 | Smallest change, reuse | Reuses d2 `node-bridge`, d2's `message-relay.ts`, core `createInMemoryServer`, core `runChain`. No `ServerRoute` change. |
| 12 | Hot-path cost | §3.6 (double parse, removed at G3-6). SSE queues stay capped at 1000. `describeRoutes` runs once at startup for the manifest, never per request. |

---

## 8. STOP conditions (executor)

- Phase 0 is not green on the unmodified tree, or a Phase 0 case cannot be made to fail by a deliberate one-line break of the thing it names.
- C-ORIGIN-PORT, G-HTTP-AUTH, C4-a/C4-b or P-NODE-BRIDGE is not on the base branch.
- A converted route's Phase 0 row changes (status, code, header, body bytes, frame bytes, listener count) other than the one named difference (abort answer).
- A host hook (`resolveOwner`, `resolveOwnerId`, `allowsRequest`, `authorizeRun`) in Tovu reads something a web `Request` + `locals` + `client` cannot give it.
- A file's blob differs from the base in a way that moves a registration line (size lanes may have split `agent-daemon-scope.ts`): re-read, continue only if the same statement still exists.
- A function would exceed 50 lines or complexity 10 after conversion.
- Any test would need an assertion removed.

## 9. Re-run the counts

```bash
cd packages/daemon/src/http
rg -c "mountJsonRoute\(" *.ts | awk -F: '{s+=$2} END{print s}'                       # 83
rg -n "\bapp\.(get|post|put|patch|delete|use)\(" *.ts                                  # 16 lines → 17 routes + 3 gates
rg -n "^export (async )?function register" *.ts | wc -l                                # 28
rg -l "from 'express'" *.ts | wc -l                                                    # 30
rg -n "ports:\s*\{|authenticate:" *.ts | wc -l                                         # 0
rg -c "requireSameOrigin: true" *.ts                                                   # per-file SO column
rg -n "register[A-Z]\w+\(" ../../../server/src/builtin-features.ts | wc -l             # 19
```
