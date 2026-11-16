# R7: daemon `src/http` returns `ServerRoute[]`; the host mounts it (design, 2026-11-16)

Docs only. Nothing here was executed. Read with `INDEX.md` (order, prerequisites, estimates) and `R8-RUNTIME.md`.

**Revision 2 (2026-11-16, after the Codex judge).** The judge (`CODEX-JUDGE-r7-routes.md`) returned *needs rework*: 2 blockers, 12 majors, 1 minor. Each finding was re-checked against the code; all 15 hold. §10 is the response table, §11 the corrected design. **Where §1–§9 and §11 disagree, §11 wins.** Lines changed in place are marked *(rev 2)*.

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
| http-kit import lines in `src/http` | **40 in 25 files** *(rev 2: was miscounted as 41/26; `index.ts:1` only names http-kit in a comment)* | G-HTTP-AUTH covers 6 of the names |
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

`'same-origin'` is recorded for a spec with `requireSameOrigin` (no middleware object; `jsonRoute` runs it). *(rev 2)* `route-manifest.ts` is **not** rebuilt from these lists: it stays the inert constant it is today, derived from the exported spec constants (§11.11). `describeRoutes` is a test helper only.

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
3. *(rev 2)* **Commit, production and hand-off are separate events**: see §11.3. The earlier rule ("do the lookup first, then return") was wrong for runs: `lifecycle.stream()` delivers the whole replay before it resolves.
4. **The deferred-end gate goes away, with proof.** `createDeferredEndGate` exists because `channel.end()` before `open()` dropped the queued backlog. `SseStream.end()` is documented "ends the stream after the frames already queued". Phase 0 pins the scenario (attach to an exited terminal → all replay frames then end) against today's code; the same test must pass on the new code. Only then is `createDeferredEndGate` and its test deleted (it has no other caller).
5. *(rev 2)* **Wire bytes and heartbeat.** The two SSE primitives differ in three verified ways: content type (`text/event-stream; charset=utf-8` vs `text/event-stream`), heartbeat (`createSseChannel` has **none**; core always sends `: ping`), and what a burst does (§11.3). `formatEvent`/`headers` fix only the first. §11.4 has the rest.
6. **Queue cap.** Both cap at 1000 queued **live** events and drop the connection. Pin it with a consumer that never reads. Replay is handled in §11.3.

### 3.2 Raw upload (attachments POST)

`handleAttachmentUpload` keeps its order (rate limit → batch dir → bounded stream → signature → register → `finally` tidy). Only its edges change:

- Input `{ request, deps, state }`; output `Promise<Response>`. `respondToUploadFailure` returns a `Response`.
- Body: `writeBoundedAttachmentBody({ request: request.body ?? emptyBody, ... })`. It already takes `AsyncIterable<unknown>`; chunks become `Uint8Array`, which `Buffer.from` handles. The `Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))` line must change to `Buffer.from(chunk as Uint8Array)`. **A `Uint8Array` is not a `Buffer`, and `String(uint8array)` is a comma-joined number list.** This is the single most likely silent corruption in R7. Phase 0 uploads a binary file with bytes ≥ 0x80 and asserts the stored bytes.
- *(rev 2)* Consumed-stream detection: the rule `request.body === null || request.bodyUsed` was wrong (the bridge rebuilds a fresh body from `parsedBody`, so `bodyUsed` is always false). Replaced by §11.5. The route is mounted **at its former line**, not above the parsers.
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

A route group must be **called once per listener**. *(rev 2)* Duplicate registration is **not** "the same failure moved to mount time": the preset's guard is inventory-only today and separate mounts cannot see each other. Policy in §11.11.

### 3.5 Auth and same-origin

| Concern | Attached how | Owner |
|---|---|---|
| Same-origin on JSON routes | `spec.requireSameOrigin` → `jsonRoute` → `guardSameOrigin` with `host.context` | daemon declares, host supplies the policy (C-ORIGIN-PORT) |
| Same-origin on hand-built routes | `sameOriginRefusal({ request, origin: host.context })` first line of the handler (C4-a) | same |
| Tool-exec caller gate (token env + loopback + bearer, constant-time compare) | *(rev 2)* one **decision function** owned by daemon, used by daemon's routes through `withRouteMiddleware` and by Tovu's four Express routes through a Tovu adapter (§11.8). `env` and `timingSafeEqual` are **required**. | daemon decides; each host adapts |
| Remote-bridge token | `withRouteMiddleware` on the two remote-run-event routes; replaces the two `app.use(path, gate)` | daemon |
| Frontend-session ownership (`resolveOwner` + bind token) | `withRouteMiddleware` on the responses route when `deps.resolveOwner` is set | daemon runs it, host supplies `resolveOwner({ request, locals })` |
| Host bearer gate, origin middleware, run-ownership gate, idle-park, 6 MB parser | stay Express middleware in Tovu, above the line where the route list is mounted | Tovu |
| `authorizeRun` (host check between parse and execute; may replace the principal) | typed port `AuthorizeToolRun`, called after the body is parsed (see below) | host supplies, daemon orders |
| Guest cookie (`frontend-guest-scope.ts`) | `issue({ request })` returns `{ tabCredential, setCookie: string }`; the route puts `setCookie` on its `Response`. `secure: req.secure` becomes `isSecureRequest({ request })`, a required host port, because "is this HTTPS" behind a proxy is host policy (Express answered it from `trust proxy`). | daemon builds the cookie text; Tovu answers "secure?" |

**Tool-exec `authorizeRun` is an authorization that also narrows the principal *(rev 2: corrected; the first version of this paragraph described a request that is refused today as accepted)*.** Tovu passes `authorizeRun: requireSiteToolRun(...)` (`modules/assistant-tool-exec.ts:91, 222-238`). That handler:

1. reads `run.id` and `principal.id` from the **parsed body** (POST) or the query (GET); a missing value or missing store → 403;
2. calls `findLiveSiteToolRun` (`:207-217`), which returns the run only when it is this workspace's live answer attempt **and `run.principalId === principalId`** (`:216`). **A caller that names principal A for a run recorded under B is refused with 403 and nothing executes.**
3. only then replaces `req.body.principal` with `{ id: run.principalId }` plus `toolAccess: 'read-only'` when the caller asked for it (`:235`). This step does not change *who* runs the tool (step 2 already proved the id is equal). It **strips every other field the caller put on `principal`** (roles, a wider `toolAccess`) and keeps the one attenuation.

Order today (`tool-execution-routes.ts:234`): caller gate → body parser (413/400) → `authorizeRun` (403) → `parseExecutionRequest` (400, `:183`) → execute. **Authorization comes before shape validation**: a malformed call for a dead run answers 403, not 400.

A web `Request` body cannot be rewritten, so the hook becomes a typed port that sees the parsed JSON **before** validation and returns its verdict as data:

```ts
/** Host check that a tool call belongs to a live run of the same principal. Runs after the body is read and before it is validated. */
export type AuthorizeToolRun = (
  required:
    | { readonly kind: 'execute'; readonly body: unknown }                                   // raw parsed JSON, not yet validated
    | { readonly kind: 'catalog'; readonly query: { readonly runId: unknown; readonly principalId: unknown } },
  optional?: { readonly signal?: AbortSignal },
) => Promise<
  | { readonly allowed: true; readonly principal?: { readonly id: string; readonly toolAccess?: 'read-only' } }
  | { readonly allowed: false; readonly response: Response }
>;
```

The route: gate → `readJsonBody` → `authorizeRun({ kind: 'execute', body })` → if `verdict.principal` is present, replace `body.principal` with it → `parseExecutionRequest` → execute. Tovu's `requireSiteToolRun` body is kept line for line; `refuse()` returns the same 403 JSON as a `Response`. A rejected lookup is thrown and reaches the adapter's error path (today `.catch(next)`).

Phase 0 (T9, Tovu side, against today's Express router) and the one-line break that must turn each case red:

| Case | Expect | Must fail when |
|---|---|---|
| body names principal **A**, run recorded under **B** | **403** `FORBIDDEN`, exact message, executor called **0** times | `run.principalId === principalId` is removed from `:216` |
| principal matches, body also carries `roles: ['admin']`, `toolAccess: 'full'` | executor receives exactly `{ id: B }` | the rewrite at `:235` is removed |
| principal matches, `toolAccess: 'read-only'` | executor receives `{ id: B, toolAccess: 'read-only' }` | the attenuation spread is removed |
| run of another workspace / not the live attempt / unknown run | 403, 0 executions; `plugins.controller.forget` called for the stale run | either workspace or liveness clause is removed (one case per clause, AP8) |
| no run store configured | 403 | the `!runStore` guard is removed |
| malformed call (no `toolId`) for a **dead** run | **403**, not 400 | authorize is moved after `parseExecutionRequest` |
| malformed call for a live run | 400 `BAD_REQUEST` | — (pins the other side of the order) |
| catalog GET with a mismatched `principalId` | 403, `listToolsFor` not called | the gate is dropped from the GET route |
| lookup rejects | the host error path answers; 0 executions | the rejection is swallowed |

This is the security-relevant part of R7: a conversion that keeps the rewrite but loses the equality check lets a caller run a tool as any principal of any live run.

**D3: the three middleware factories leave Jini.** `createDaemonAuthMiddleware`, `createRunOwnershipMiddleware`, `createOwnedRunListHandler` (`http/run-credentials.ts`, 83 lines) are Express glue around decisions the **host** already supplies (`authorize`, `filterOwnedRuns`). Their only production callers are Tovu's `agent-daemon-scope.ts` and `daemon-access.ts`. One of them mutates `req.headers` so later Express handlers see a principal header, which a web `Request` cannot express. They move to Tovu beside their callers (lesson 9: host binding stays in the host), with their test. `RunAccessDecision` is referenced nowhere else in Jini (`rg` at `02edbb68`), so it moves too. This is a move + delete, not a rewrite. See INDEX owner decision O-3 for the alternative.

### 3.6 Body size and the double parse (practice 12)

While Tovu keeps its blanket `express.json({ limit: '6mb' })`, a converted JSON route sees its body twice: parsed by Express, re-serialized by the bridge (`parsedBody`), parsed again by `readJsonBody`. Cost per request: one extra `JSON.stringify` + one extra `JSON.parse` of the body. For `POST /api/delegated-tool-calls` and `POST /api/runs` that can be megabytes, on every tool call.

- *(rev 2)* Both bullets that stood here are withdrawn: a shared daemon constant cannot hold two hosts' policies, and **Tovu's blanket parser cannot be deleted** (a credential re-check and five Tovu-owned routes read `req.body`). Limits and the parser are in §11.2 and §11.6.

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

*(rev 2)* The two sentences that stood here contradicted each other ("the preset passes a `Server`" and "the preset wraps its Express app"). The mixed-state mechanism is in §11.9: `Pack.http` keeps receiving the Express `app` for the whole of R7; a converted pack mounts its list through one preset helper. The preset's own `express()` app and its gates stay until R13 (**owner decision O-4, accepted**: daemon code sees only `ServerRoute`).

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
| **G3** | Raw body / NDJSON / cookies: `attachment-lookup-routes`, `message-relay` (start from d2's version), `tool-execution-routes` (+ the four Tovu gate sites, §11.8), `frontend-request-route` + `surface-*` (+ the two Tovu helper callers, §11.7), `frontend-guest-scope`, `attachments`; then D3 (move `run-credentials.ts` factories to Tovu). *(rev 2: step G3-6 "drop Tovu's parsers" is deleted.)* | 7 | 7 |
| **Z** | Delete what has no caller left: http-kit `mountJsonRoute`, Express `JsonRouteSpec`/`JsonRoutePorts`/`defineJsonRoute`, `rawInput`, `passesSameOriginGuard`, `sendJson`, `sendApiError`, `sendRawApiError`, `createSseChannel`, `requestedAfterCursor`, `createSseResponse`. **Only if R9 (cms) has also converted**; otherwise Z waits for R9. Drop `express` from daemon `peerDependencies`, `@jini-ai/http-kit` from daemon `dependencies`; remove the retired `injection-debt.json` keys. *(rev 2: `route-manifest.ts` is not rebuilt.)* | — | 1 |

Per-file recipe (G1; ≤ 15 minutes of edits):
1. Repoint `defineJsonRoute`/`JsonRouteSpec` imports from `@jini-ai/http-kit` to `@jini-ai/core/contracts/server` (`C4.repoint.tsv` phase `route-conversion` rows for that file).
2. Replace `reportRouteInternalError` (http-kit) with `deps.reportInternalError` (injected through the `*RouteDeps` wrapper, §2.1). The local `reportInternalError({ deps, ... })` helpers keep their name and call sites.
3. Replace the `register*` function with `*Routes` (§2.1). Move its doc comment; rewrite only the sentence about mounting.
4. Delete `import type { Express }`.
5. *(rev 2)* Update callers and tests in the same pair. A test of **handler logic** that built `express()` + `listen` moves to `createInMemoryServer()`. A test of a **transport fact** (headers flushed before the body, socket backpressure, fall-through to the next Express layer, chunked body limits) stays on a real socket and goes through the Node bridge (§11.13). No test is skipped because the in-memory server cannot express it.
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
| T6 | **SSE** (5 kinds) | *(rev 2)* Headers incl. the exact `content-type`; first frame bytes; **heartbeat per kind** (frontend-sessions: `: ping` at 15 s; memory, runs, terminals, model-proxy: **no bytes** in 60 s of idle fake time); cursor replay from `Last-Event-ID` and `?afterCursor=`; **1,167-event replay arrives whole** (`runs.test.ts:994`, kept); end event closes; client abort → listener counts back to 0 and no pending timers (AP10); overflow at 1000 queued live events; origin **per stream**: memory, terminals, frontend-sessions, model-proxy cross-origin → 403 and **zero** listeners; **runs stream has no origin guard today (`runs.ts:362`) and must still answer cross-origin**; terminal attach to an exited session → all replay frames then end; run stream error before commit → JSON 500, after commit → stream ends; client leaves while `lifecycle.stream()` is pending → unsubscribe called once. |
| T7 | **NDJSON** | tool-exec: headers before result (pending executor), `surface` lines before `result`, a surface after `result` is dropped, thrown executor → `throw` line with name/message/code, client abort → executor's signal aborted; frontend-request: keepalive line at 15 s, plain-string 400/403 bodies byte for byte. |
| T8 | **Upload** | Binary bytes ≥ 0x80 round-trip; too large → code, partial file removed, batch dir tidied; 5th concurrent upload refused (limit 4) and the counter returns to 0 after failure; consumed body → `attachment-body-consumed`; DELETE → 204, empty body, no `content-type`; `acquireActivity` released on success, refusal and throw. |
| T9 | **Gates** | tool-exec: no token configured → `NOT_CONFIGURED`; non-loopback peer → `FORBIDDEN`; wrong bearer → `UNAUTHORIZED`; right bearer → reaches handler; **the handler is not called and the body is not read** on each refusal. One case per clause (AP8). Same for remote-bridge token and frontend-session ownership. *(rev 2)* plus the `authorizeRun` table in §3.5 and the full gate matrix in §11.15. |
| T10 | **Cookie** | `issue` sets `HttpOnly; SameSite=Strict; Path=…; Max-Age=…`, `Secure` only when the request is secure, `Cache-Control: no-store`; a tab token never authenticates as the guest cookie. |
| T11 | **Middleware order (host level)**, in `packages/server` and Tovu, on a real socket | *(rev 2, per security profile)* Health answers 200 with no token and an oversized body in every profile. **`sidecar-strict`:** no token + malformed JSON → 401 (gate is above the parser, `compose-jini-kernel.ts:294`). **`jini-local`:** the parser is mounted first (`:303` then `:314`), so the same request answers **400**; that is today's behaviour and is pinned as it is, not "fixed". Tovu: no token + malformed JSON → 401 (`agent-daemon-scope.ts:1398` is above `:1407`); the claim route with a live run credential passes its 1 KB parser; the delegated route's post-parse credential re-check (`:1433`) per §11.2. |
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

---

## Judge response

`#` = finding number in `CODEX-JUDGE-r7-routes.md`. Every finding was re-read against Jini `02edbb68`, Tovu `65302ee5` and d2 `f6e1401e`. **15 accepted, 0 rebutted.** Two are accepted in part (14, and the third bullet of 10) where an owner decision already covers some of the ground.

| # | Sev. | Verdict | What I checked | What changed |
|---|---|---|---|---|
| 1 | Blocker | **Accepted** | `assistant-tool-exec.ts:216` returns the run only when `run.principalId === principalId`; the rewrite at `:235` runs after it. `tool-execution-routes.ts:234` runs `authorizeRun` before the handler that calls `parseExecutionRequest` (`:183`). My T9 case ("A named, B recorded → runs as B") describes a request that answers 403 today. | §3.5 rewritten in place: equality is the gate, the rewrite only strips fields; `AuthorizeToolRun` now takes the **unvalidated** parsed body so authorize stays before validate; nine T9 cases, each with the break that must fail it. |
| 2 | Blocker | **Accepted** | `agent-daemon-scope.ts:1433` re-checks the run credential against the parsed `body.runId` (`run-credentials.ts:30, :154`). `:1424` re-resolves the caller after parsing. Tovu-owned routes at `:1408`, `:1448`, `:1449`, `:1531`, `:1538` read `req.body`. | G3-6 deleted. The 6 MB parser and the 1 KB claim parser **stay**. §11.2 lists every parser consumer and the tests that fail if the parser or the re-check goes. |
| 3 | Major | **Accepted**, and it is worse than stated | `run-lifecycle.ts:1140` delivers the replay in one synchronous loop before `stream()` resolves. Core's stream closes at 1000 queued frames **and clears the queue** (`sse.ts:74, 84`), so a long replay would deliver nothing and the client would reconnect from the same cursor for ever. | §11.3: four separate events (validate, commit, produce, hand off), a commit latch, and core change C4-e (`backlog` frames). `runs.test.ts:994` kept. |
| 4 | Major | **Accepted** | `http-kit/sse.ts` has no timer; core `sse.ts:88` always schedules `: ping`; `raw-sse.ts:92` (frontend-sessions only) pings. | §11.4: C4-e adds `keepAliveMs: false`; per-stream heartbeat table; T6 pins "no bytes while idle" for four kinds. |
| 5 | Major | **Accepted** | d2 `node-bridge.ts:107`: `incoming.readableEnded ? consumedBody(parsedBody) : stream`; `:69` re-serializes an object. The rebuilt `Request` has a fresh unused body. My two mounting rules contradicted each other. | §11.5: raw-body routes are mounted with **no** `parsedBody`; a drained request then has `body === null`, which is the consumed signal. Mounted at the former line, below the bearer gate. |
| 6 | Major | **Accepted** | Preset `express.json()` default (100 KB) at `compose-jini-kernel.ts:303`; Tovu 6 MB at `:1407`, with the screenshot reason at `:1399`. `DaemonRouteHost` had no limit field. | §11.6: `DaemonRouteHost.jsonBodyMaxBytes` (required, per host). The shared constant is withdrawn. O-2 is answered by "each host keeps today's number". |
| 7 | Major | **Accepted** | Tovu `modules/assistant.ts:513` calls `tryRestoreSurface`; `mcp-ui-tool-calls-route.ts:227` calls `deliverSurfaceCallback`. `surface-restoration.ts:29` returns `false` with nothing written; its heartbeat starts only after the first frame (`:23`). | §11.7: result contract `{ handled: false } \| { handled: true, response }`, lazy commit, both callers and their tests in the same pair. |
| 8 | Major | **Accepted** | Four Tovu sites take an Express `RequestHandler`: `assistant-tool-exec.ts:95, :97`, `agent-daemon-core-rpc.ts:29`, `desktop-mcp-handoff.ts:26`. | §11.8: decision function in daemon, Express adapter in Tovu, all four sites and their tests in the tool-exec pair. |
| 9 | Major | **Accepted** | `compose-jini-kernel.ts:186` already mounts **one pack per call**; `pack-http.ts:34` forwards `app` unchanged. | §11.9: `app` stays Express for all of R7; `mountRoutes` helper lands in P1, before the first conversion. |
| 10 | Major | **Accepted** | `route-table.ts:35` needs equal segment counts, `:41` compares literals exactly; a bad `%` escape is "no match" (`:21-26`). Express 4 default is case-insensitive, lenient on a trailing slash, answers 400 on a bad escape and answers OPTIONS itself. | §11.10: five classes characterized in P0; per-class decision; owner decision O-12. |
| 11 | Major | **Accepted** | `route-manifest.ts:75` is a module constant built from exported spec constants (`fromSpecs`). It copies no path strings. | §11.11: manifest untouched except the type import. `describeRoutes` is test-only. A parity test replaces the idea. |
| 12 | Major | **Accepted** | `tool-execution-routes.ts:75` and `remote-run-events.ts:88` call http-kit's `timingSafeTokenMatch`, which binds `node:crypto`. Core's (`token.ts:46`) needs an injected `timingSafeEqual`. | §11.12: `DaemonRouteHost.timingSafeEqual` (required), core matcher reused, a fake that proves the port is called. |
| 13 | Major | **Accepted** | `runs.ts:362` mounts its stream with no guard. `jini-local` parses before the bearer gate (`:303`, `:314`). `createInMemoryServer` calls the handler directly (`testing.ts:26`). | T6 and T11 rewritten in place, per stream and per profile; §11.13 keeps socket tests. |
| 14 | Major | **Accepted in part** | Five files stay > 500 lines; ambient `setTimeout`/`process.*`/fs defaults stay; `http/index.ts` re-exports. B1 is about imports, not re-export shells. | Owner has since accepted O-4 (Express in the preset until R13) and O-1 (vendor code leaves after R7). The rest is no longer called compliant: §11.14 moves the ambient defaults **into** R7 and lists the two exceptions still needing an owner answer (O-6 barrel, O-14 file size). The "complete" claim is withdrawn. |
| 15 | Minor | **Accepted** | `rg` gives 40 statements in 25 files. `route-registration-guard.ts:69` defaults to an empty guarded set; the preset passes none (`create-local-node-daemon.ts:376`). | Count fixed in §1.1. Duplicate policy in §11.11. |

The judge's "recurring mistake classes" and the 11 lessons were applied as a checklist: §11.16.

---

## 11. Revision 2 design (supersedes the text it names)

### 11.1 `DaemonRouteHost`, final shape

```ts
// packages/daemon/src/http/route-host.ts
import type { ReportRouteInternalError, RouteHostContext, SseSchedulerPort } from '@jini-ai/core/contracts/server';
import type { TimingSafeByteComparison } from '@jini-ai/core';

/** What a host hands every daemon route group. Built once per listener. Every field is required: daemon has no default for any. */
export interface DaemonRouteHost {
  readonly context: RouteHostContext;
  readonly reportInternalError: ReportRouteInternalError;
  readonly scheduler: SseSchedulerPort;
  /** Constant-time equal-length byte compare (the host binds `node:crypto.timingSafeEqual`). Used only through core's `timingSafeTokenMatch`. */
  readonly timingSafeEqual: TimingSafeByteComparison;
  /** Largest JSON body a daemon route reads. A host with a parser in front passes a value at or above that parser's limit (§11.6). */
  readonly jsonBodyMaxBytes: number;
}
```
Five fields, each with two or more route groups using it. No optional field, so a host that forgets one fails typecheck.

### 11.2 Tovu's parsers stay (finding 2)

Every reader of the parsed body in the daemon scope, in mount order (`agent-daemon-scope.ts`):

| Line | Reader | Owner | After R7 |
|---|---|---|---|
| 1388 | 1 KB parser on the claim route, behind the run-credential gate | Tovu | **stays** |
| 1398 | `requireAgentDaemonToken` (reads headers only) | Tovu | stays, above the parser |
| 1407 | `express.json({ limit: '6mb' })` | Tovu | **stays** |
| 1408 | `registerToolAccessLoweringRoute` | Tovu route | untouched |
| 1424 | discovery-caller re-resolve on `/api/tools`, `/api/components`, delegated path | Tovu | stays |
| 1433 | `requireAgentDaemonToken({ validateDelegatedRunId: true })`: run credential must equal `body.runId` | Tovu, **security gate** | stays; needs `req.body` |
| 1448, 1449 | credential run intake, durable run start | Tovu routes | untouched |
| 1531, 1538 | MCP-UI tool calls, A2UI actions | Tovu routes | untouched |
| converted Jini JSON routes | read through the bridge's `parsedBody` | Jini | bridge re-serializes; `readJsonBody` parses again |

The cost of keeping the parser is the double parse (§3.6): one `JSON.stringify` + one `JSON.parse` of a body up to 6 MiB on each delegated tool call. It is measured in G1 on the `delegated-tools` pair (1 MiB and 6 MiB bodies, before and after) and reported; removing it is a follow-up that must first move every reader above (owner decision O-13). Nothing in R7 depends on that follow-up.

Tovu Phase 0 for this chain (real Express, real socket; each must fail on today's code with the named break):

| Case | Expect | Must fail when |
|---|---|---|
| delegated call, run credential for run X, `body.runId = X` | reaches the handler | the 6 MB parser is removed (legitimate call is refused) |
| run credential for X, `body.runId = Y` | refused with today's status and body; handler and tool called 0 times | `validateDelegatedRunId` is removed from `:1433` |
| run credential revoked between the two gates | refused | the second gate is removed |
| proxy token + any `runId` | passes (proxy keeps its authority) | — pins the other side |
| no token + malformed JSON | 401, body never parsed | the gate at `:1398` is moved below `:1407` |
| each Tovu-owned route in the table | its happy path still parses its body | the parser is scoped to Jini paths only |

### 11.3 SSE: validate, commit, produce, hand off (finding 3)

Four events that the first version ran together:

1. **Validate** (may still answer JSON): origin guard, params, cursor. Starts nothing.
2. **Commit**: the handler's promise resolves with `stream.response`. After this the only possible outcomes are frames and an end.
3. **Produce**: the subscription or provider call starts emitting.
4. **Hand off**: the unsubscribe function is stored; if the stream already closed, it is called at once.

Runs cannot validate fully before producing (`lifecycle.stream()` reports unknown-run and bad-cursor itself, and delivers replay before resolving), so commit is **lazy**, exactly as `channel.open()` inside `onEvent` is today (`runs.ts:316`):

```ts
// packages/daemon/src/http/sse-commit.ts (NEW, ≤ 45 lines; users: runs, terminals, surface restoration)
/** Resolves once with the first answer offered. Later offers are ignored. */
export function createCommitLatch(): { readonly response: Promise<Response>; commit(required: { response: Response }): boolean; readonly committed: boolean }
```
```ts
// runs: handler body, ≤ 35 lines
const latch = createCommitLatch();
const stream = createSseStream({ scheduler: host.scheduler }, { signal: request.signal, keepAliveMs: false, headers: SSE_CHARSET_HEADER, isEndEvent, onClose: () => unsubscribe?.() });
let live = false;                                             // false while lifecycle.stream() is still delivering replay
deps.lifecycle.stream({ runId, onEvent: (event) => { latch.commit({ response: stream.response }); stream.send({ event }, { backlog: !live }); } }, { afterCursor })
  .then((subscribed) => {
    live = true;
    if (subscribed.kind !== 'ok') { stream.end(); latch.commit({ response: streamFailureResponse(subscribed) }); return; }
    if (stream.closed) { subscribed.unsubscribe(); return; }  // client left while we were subscribing
    unsubscribe = subscribed.unsubscribe;
    latch.commit({ response: stream.response });               // a run with no history commits here
  })
  .catch((error) => { stream.end(); latch.commit({ response: jsonResponse({ status: 500, body: { error: report(error) } }) }); });   // after commit: commit() is a no-op and the stream just ends
return latch.response;
```
`stream.end()` on a never-committed stream releases its timer and runs `onClose`; nobody reads its body.

**Core change C4-e (failing test first, in core):** `send({ event }, { backlog: true })` queues a frame without counting it against `maxQueuedEvents`. The caller states "this frame is history I already hold in memory". Without it a pull-based stream cannot take a synchronous burst larger than the cap, whenever the response is committed. Cost: transient memory of one formatted frame per replayed event, the same order as `replay.entries`, which the event log has already built in one array (complexity note goes on the option). Live frames keep the cap. This is a deliberate difference from a real socket today, where a burst gets "socket buffer + 1000" and then drops; it is recorded as owner decision **O-11** because it trades a silent truncate-and-reconnect for more memory per connection.

Terminals: `manager.attach` is called with a sink that sends `{ backlog: true }` until `attach` returns, then live. `not-found` → `stream.end()` + JSON 404 through the latch. Memory events and frontend-sessions have no replay: validate, create the stream, subscribe, return.

**Model proxy** (`model-proxy.ts:431-433` opens, then awaits the provider): validate (origin, parse) → create stream → `void entry.run(...).catch(reportThenEnd)` → `return stream.response`. The provider is **not awaited** before the return. Errors before the stream exists answer JSON (403, 400, 500); errors after it end the stream the way today's `catch` does. P0 pins both sides with a provider fake that rejects before and after its first event.

### 11.4 Heartbeat per stream (finding 4)

| Stream | Today | After |
|---|---|---|
| memory, runs, terminals, model-proxy (6) | none (`createSseChannel`) | `keepAliveMs: false` (C4-e: no timer scheduled, `scheduler.every` not called) |
| frontend-sessions | `: ping\n\n` every 15 s (`raw-sse.ts:92`) | core default, same bytes |

C4-e's second half: `keepAliveMs?: number | false`. If the owner would rather give the nine quiet streams a heartbeat, that is a behaviour change for another lane; R7 does not make it silently.

### 11.5 Upload: raw-body provenance (finding 5)

- `mountJiniRoutes({ app, routes }, { rawBody: true })` builds its dispatcher call **without `parsedBody`**. The bridge then gives the route the untouched stream, or `null` when something upstream drained it (`readableEnded` with no `parsedBody` → `consumedBody(undefined)` → `null`).
- The route's rule is one line: `request.body === null` → `attachment-body-consumed`. `bodyUsed` is not consulted.
- Mount position: the **former line** (`agent-daemon-scope.ts:1602`), below the bearer gate (`:1398`) and below the 6 MB parser, as today. An `application/octet-stream` upload passes the parser untouched because `express.json` only reads JSON content types (the comment at `:1596-1601` moves with the line).
- Phase 0, real socket: octet-stream with bytes ≥ 0x80 → stored bytes equal; `content-type: application/json` upload → `attachment-body-consumed` and **no file written**; no token → 401 and the temp directory is empty (auth before any byte is stored); mounted with `parsedBody` by mistake → the JSON-typed case stores re-serialized bytes, which is the break that must turn the second case red.
- P-NODE-BRIDGE gains one test for the same fact at its own level: drained request + no `parsedBody` → `request.body === null`.

### 11.6 Body limits (finding 6)

There is no new policy. Each host keeps the number it enforces today and states it once:

| Host | Parser today | `host.jsonBodyMaxBytes` | Effective limit |
|---|---|---|---|
| `server` preset | `express.json()` = 100 KB (102,400 bytes) | 128 KiB | the parser's 100 KB |
| Tovu daemon scope | 6 MB (6,291,456 bytes) | 8 MiB | the parser's 6 MB |
| a host with no parser (after R13) | — | its own choice | that value |

Every converted spec sets `maxBodyBytes: host.jsonBodyMaxBytes`, so core's 100 KiB default never applies by accident (frontend-session responses carry screenshots well over it, `:1399`). The headroom exists because the bridge re-serializes: `1e21` parses and prints one byte longer, so a route limit **equal** to the parser's could refuse a body the parser accepted. Fixed per-route limits keep their own numbers: attachment-lookup 64 KB, tool-exec `maxBodyBytes` (16 MiB default, no parser in front), claim 1 KB (Tovu's parser).

T4 is run on a real socket per host and per class: limit−1, limit, limit+1, plus a chunked body with no `content-length` that crosses the limit mid-stream. The assertion is the **effective** limit, so it fails if either layer gets looser or stricter.

### 11.7 Surface helpers and their two Tovu callers (finding 7)

`tryRestoreSurface` and `deliverSurfaceCallback` are called only from Tovu's own Express handlers (plus each other). They take an Express `res` today.

```ts
export type SurfaceHttpResult = { readonly handled: false } | { readonly handled: true; readonly response: Response };
export function restoreSurface(required: { store; exchangeId; principalId; toolId; scheduler: SseSchedulerPort; signal: AbortSignal }, optional?: { params?: Record<string, unknown> }): Promise<SurfaceHttpResult>
export function deliverSurfaceCallback(required: { /* today's fields minus res */ signal: AbortSignal; scheduler: SseSchedulerPort }, optional?: …): Promise<Response>
```
- `{ handled: false }` is returned with nothing committed, so Tovu's remote fallback (`assistant.ts:521`) still runs. It is a distinct value, not `undefined` (lesson 7).
- Lazy commit through the same latch: the first `emit` creates the line stream and commits 200; a result before any frame commits the 409 JSON or `{ handled: false }`. The keepalive belongs to the line stream, so it cannot start before the first frame (today's `if (res.headersSent)` guard, `:23`).
- A thrown restore still answers `{ type: 'restored', ok: false }` and never the error text (the comment at `:36` moves).
- Tovu writes the `Response` with `sendWebResponse({ response, res })`, exported by the Node bridge (it exists there as a private `writeWebResponse`; P-NODE-BRIDGE exports it). Its `signal` comes from `res.on('close')`.
- Same pair: `surface-restoration.ts`, `surface-callback.ts`, `assistant.ts:513`, `mcp-ui-tool-calls-route.ts:227`, their tests. Phase 0 first: unhandled → fallback reached with `res.headersSent === false`; 409; first-frame-then-keepalive; client abort → store `signal` aborted.

### 11.8 Caller gate: one decision, two adapters (finding 8)

```ts
// packages/daemon/src/http/tool-execution-caller.ts
/** The whole gate as a decision. Null = allowed. No Express, no web types. */
export function toolExecutionCallerRefusal(
  required: { readonly authorization: string | undefined; readonly peerAddress: string | undefined; readonly env: Readonly<Record<string, string | undefined>>; readonly timingSafeEqual: TimingSafeByteComparison },
  optional: { readonly tokenEnvVar?: string } = {},
): { readonly status: number; readonly error: ApiError } | null
```
- Daemon's two routes: `withRouteMiddleware` calls it with `request.headers.get('authorization')` and `client.address`, before the body is read.
- Tovu's four sites: one 12-line Express middleware in Tovu (`requireToolExecutionCallerExpress`, beside its callers) calls the same function with `req.get('authorization')` and `req.socket.remoteAddress`. Each site keeps its literal order `gate, json({ limit })`, so token-before-parser holds by construction.
- The old `requireToolExecutionCaller` export is deleted in the same pair as `tool-execution-routes`; the four sites and their tests move with it. The decision has one owner (guardrails rule 4: a security sequence is not copied).
- `client.address` must be the socket's address. P-NODE-BRIDGE pins: a non-loopback peer sending `x-forwarded-for: 127.0.0.1` is still refused.

### 11.9 Preset: mixed state, one pack at a time (finding 9)

`mountFeaturePhase` already mounts one pack per call (`compose-jini-kernel.ts:184-187`), so coexistence needs no new mechanism in core or in `mountPackHttp`:

```ts
// packages/server/src/mount-routes.ts (NEW in P1, ≤ 25 lines; the preset's twin of Tovu's mountJiniRoutes)
export function mountRoutes(required: { readonly app: unknown; readonly routes: readonly ServerRoute[] }, optional: { readonly rawBody?: boolean } = {}): void
// builtin-features.ts, one pack per pair:
-http: ({ app, services }) => registerAgentRoutes({ app: app as Express, deps: {...}, adapter: services.context.adapter }),
+http: ({ app, services }) => mountRoutes({ app, routes: agentRoutes({ deps: {...}, host: services.context.routeHost }) }),
```
- `Pack.http`'s `app` argument is the Express app from the first commit of R7 to the last. Unconverted packs and caller-owned packs never see a change. R13 changes the argument, once, when no pack calls an Express method.
- Each `mountRoutes` call makes one dispatcher and one `app.use`, at the position the pack mounted before, so `pre-auth` health stays above the parser and gates.
- Commit graph: P1 lands `mountRoutes` + `routeHost` with a test (a list mounted between two Express routes keeps its position; an unmatched path falls through). Only then G1.

### 11.10 Path matching (finding 10)

Characterized on today's Express in P0 (T2b), per host, on a real socket:

| Class | Express 4 today | Core table + bridge | Decision |
|---|---|---|---|
| `HEAD` on a GET route | answered, no body | answered from the GET route (`route-table.ts`, bridge `headOnly`) | must be equal; pinned |
| trailing slash `/api/runs/` | matches | no match → falls through → 404 | **O-12** |
| case `/API/runs` | matches | no match → 404 | **O-12** |
| bad escape `/api/runs/%E0%A4%A/events` | 400 | no match → 404 | **O-12** |
| `OPTIONS` on a routed path | Express answers 200 + `Allow` unless a CORS layer answered first | falls through → 404 | pinned; if a host has no CORS layer above, P-NODE-BRIDGE answers OPTIONS for a matched path the way Express did |

O-12 recommendation: accept the three stricter answers **if** the P0 client census finds no caller that sends them (every in-repo URL builder and Tovu's proxy forward list are generated from constants). If the census finds one, the fix goes in the one shared place (the bridge's dispatch), never in a host mount helper. Either way the difference is written in the pair's commit message; it is not silent.

### 11.11 Manifest and duplicate registration (findings 11, 15)

- `JINI_ROUTE_MANIFEST` stays a module constant built by `fromSpecs(...)` over exported spec constants and path constants. No route group is called at import time; no startup registry. Its only R7 edit is the `RouteRegistration` type (declared in `route-manifest.ts`, 4 lines, instead of imported from http-kit).
- New test, `route-manifest.parity.test.ts`: for each family, `describeRoutes(xRoutes({ deps: fakes, host: fakeHost }))` equals the manifest entry. It fails when a group gains a route the manifest lacks, which is the bug the manifest's own doc describes.
- Duplicates: **inside one list** the route table refuses a second method + path shape at mount (new, fail-fast). **Across mounts** Express's first-match order decides, as today. Tovu relies on that on purpose: its `GET /api/runs` owned-list handler (`:1446`) shadows Jini's. T1's snapshot includes that pair in order. The preset's guard is inventory-only today and gets no new behaviour.
- Dispatch check (not verified here): who reads the guard's inventory (`route-registration-guard.ts:105`). Converted routes no longer pass through `app.get`, so a reader would see fewer routes; if one exists, `mountRoutes` appends to the same inventory in P1.

### 11.12 Constant-time compare (finding 12)

Both bearer gates call `timingSafeTokenMatch({ presented, expected, timingSafeEqual: host.timingSafeEqual })` from `@jini-ai/core`. The length check and the reason for it stay in core's doc (`token.ts:36-45`). No `===`, no new native default in daemon. Fake: `fakeTimingSafeEqual()` records its calls and compares byte by byte. Tests: wrong token of the **same length** → refused and the fake was called once with two equal-length arrays; wrong token of another length → refused and the fake was **not** called; right token → allowed. Replacing the matcher with `===` leaves the fake uncalled, so the first case fails. G-HTTP-AUTH lands the fake with the move.

### 11.13 Transport tests stay on a socket (finding 13)

Three layers, each testing what only it can see:

| Layer | Harness | Covers |
|---|---|---|
| handler logic | `createInMemoryServer` | status, body, codes, gate decisions, state |
| bridge | `http.createServer` + `createNodeDispatcher` (http-kit suite) | header flush before first chunk, backpressure, fall-through, HEAD, body provenance, client address |
| host order | the real preset / Tovu scope on `127.0.0.1:0` | gate order per profile, effective body limits incl. chunked, parser consumers |

The 17 existing `listen` tests are sorted into these three at P0; none is deleted and none is skipped.

### 11.14 What R7 does not make compliant (finding 14)

| Practice | Gap at the end of R7 | Status |
|---|---|---|
| 7 (no framework in Jini) | `server` preset keeps `express()` | **approved** (O-4): daemon sees only `ServerRoute`; R13 removes it |
| 7 (no vendor code) | `xai.ts`, model-proxy tool turns in daemon | **approved order** (O-1): they leave after R7 |
| 1 (no ambient reach) | **now in R7**: every `process.env`/`process.platform`, `setTimeout`, fs or env default in a converted file becomes a required field of that group's `deps` in its own pair (`frontend-sessions.ts:336` timer, `host-tools.ts:103` fs/env defaults, `remote-run-events`, `daemon-status`, `workspace-root`, `xai`, `research`: 15 reads in 8 files). The one-shot timer is a required `setTimer` dep of the frontend-session group (one user; practice 1 outranks practice 11 here, flagged). | in scope, +35k |
| 5 (no barrel) | `http/index.ts` re-exports ~390 lines | **open, O-6**; B1 does not cover it. Not claimed compliant. |
| 3/4 (file ≤ 500) | `attachments` 1639, `xai` 802, `model-proxy` 659, `memory` 603, `connectors` 527 | **open, O-14**: an exception until the size lane, or the size lane first |

R7's exit statement is therefore "the HTTP contract is converted", not "daemon `src/http` meets every practice".

### 11.15 Security gates: one test each that fails when the gate is removed

For every row the executor first applies the named break to today's code, sees the test fail, and restores it (recorded in the P0 report).

| Gate | Where | Test | Break that must fail it |
|---|---|---|---|
| Tool-exec caller: token configured / loopback / bearer | `tool-execution-routes.ts:68-80` | T9, one case per clause; body not read | delete each clause in turn |
| Constant-time compare | `:75`, `remote-run-events.ts:88` | §11.12 | swap for `===` |
| Remote-bridge token on both routes | `remote-run-events.ts:269-270` | refusal on each path; T1 gate snapshot | drop the gate from one route |
| Same-origin, per route | 55 specs + 8 hand-called guards | T3/T6 cross-origin → 403; **and** the routes with no guard today (runs stream, health, remote-run-events) still answer | remove one `requireSameOrigin`; add a guard to the runs stream |
| Body limits | §11.6 | T4 effective limit ± 1, chunked | raise or lower either layer |
| `authorizeRun` equality, workspace, liveness, attenuation, order | Tovu `assistant-tool-exec.ts:207-238` | §3.5 table | each row's break |
| Post-parse run-credential re-check | Tovu `agent-daemon-scope.ts:1433` | §11.2 | drop `validateDelegatedRunId`; drop the parser |
| Token before parser | Tovu `:1398`; preset `sidecar-strict` | T11 | reorder |
| Discovery caller re-resolve | Tovu `:1424` | no live run → 404 `a live run is required` | drop the layer |
| Run ownership, owned list shadowing | Tovu `:1445-1446` | another admin's run → 404; list shows only own runs | mount after the Jini list |
| Principal header rewrite (D3) | `run-credentials.ts:36` | a caller-sent principal header is replaced by the credential's principal | delete the assignment; the test moves to Tovu with the code |
| Frontend-session owner + bind token | `frontend-sessions.ts` | wrong owner, wrong token, resolver throws → 403 | each clause |
| Upload: auth first, consumed body refused | §11.5 | no token → empty temp dir; JSON-typed upload refused | mount with `parsedBody`; mount above the gate |
| Loopback uses the socket address | bridge | forged `x-forwarded-for` refused | read the header |
| Guest cookie flags | `frontend-guest-scope.ts:44` | T10 | drop `HttpOnly`/`SameSite`/`Secure` |
| SEC-005 redaction | all JSON routes | T3: thrown message absent from the body | return `error.message` |

### 11.16 Checklists

Judge's recurring classes: predicate traced before the rewrite (§3.5) · parser consumers across the whole chain (§11.2) · commit, produce, backpressure, cleanup as separate events (§11.3) · every intermediate state designed (§11.9: `app` never changes type mid-lane) · inert metadata kept (§11.11) · expectations from deployed behaviour per profile (T6, T11) · constraints are acceptance criteria, exceptions listed (§11.14).

Lessons 1–11: unchanged from INDEX §7 except lesson 2 (inventory now includes helper consumers, parser consumers and the Express-typed gate's four sites), lesson 5 (P1 lands both mount helpers and C4-e before G1), lesson 6 (§11.15: each test names its break), lesson 7 (`SurfaceHttpResult`, authorize verdict, `backlog` vs live), lesson 9 (the Express gate adapter and `run-credentials` factories live in Tovu).

### 11.17 Updated prerequisites and order for R7

`C-ORIGIN-PORT`, `G-HTTP-AUTH` (+ timing-safe fake), `C4-a`, `C4-b`, **`C4-e`** (`keepAliveMs: false`, `backlog`), **`P-NODE-BRIDGE`** (+ exported `sendWebResponse`, body-provenance test, client-address test, HEAD/OPTIONS cases) → **P0** (incl. Tovu's parser-chain and `authorizeRun` suites, T2b) → **P1** (`route-host`, `route-table`, `line-stream`, `sse-commit`, Tovu `mountJiniRoutes`, preset `mountRoutes`) → G1 → G2 → G3 → Z. STOP additions: C4-e not on the base; any §11.15 test that cannot be made to fail by its named break; the P0 census for O-12 finds a caller.
