# OpenTelemetry observability recon — provider-agnostic adapter, four surfaces

- **Type:** recon only. No production code touched (`apps/`, `packages/`, `sites/`, `content/` untouched).
- **Repo:** `/Users/la/Programming/Tovu`, branch `restructure/apps-website-phased`.
- **Method:** direct source reads (file:line cited throughout) plus `mcp__codebase-memory-mcp` graph
  queries (`get_architecture`, `search_graph`) for structural orientation. Every number below is
  either a direct grep/read count (labeled) or explicitly marked inferred — no un-enumerated grep
  counts are reported as facts.
- **Headline finding, stated up front:** this is not a greenfield task. A provider-agnostic
  observability port **already exists, is already wired into the real request path, and already
  ships `@opentelemetry/*` as a dependency.** Sections 1 and 6 below document what's there in full;
  the other three surfaces (admin client, agent daemon, frontend) have nothing yet and are where new
  work actually belongs.

---

## 0. What already exists, in one paragraph

`apps/website/src/platform/observability/{ports,config,noop,otel,index}.ts` (built 2026-08-28,
same day as the groundwork survey that scoped it — `ADS-memory/.local-artifacts/metrics/
2026-08-28-observability-groundwork.md`) defines `ObservabilityPort` — one method, `trackRequest`
— with a `noop` adapter (default) and a real `otel` adapter, lazily loaded only when
`OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set. It's wired into
`createApp()` at `apps/website/src/server/runtime/composition/app.ts:898`
(`applyRequestTracking(app, { observability: routeDeps.observability })`), registered **before**
`applySiteServingGate` (`:903`) and every route module, so it sees 404s and gate-rejected requests
too. Root `package.json:101-106` already lists `@opentelemetry/api`,
`exporter-trace-otlp-http`, `resources`, `sdk-trace-base`, `sdk-trace-node`,
`semantic-conventions` as real (not dev) dependencies. This is a template worth extending, not
replacing — see §5-6.

---

## 1. Surface: the website server (`apps/website`)

### What exists today
- **Inbound HTTP, one signal (`trackRequest`), fully wired.**
  - Port: `apps/website/src/platform/observability/ports.ts:31-68` — `RequestTrackingInput
    {method, path}` → `RequestTracker.end(RequestTrackingOutcome {statusCode, routePattern})`.
    `routePattern` is deliberately the matched route's pattern (`"/api/admin/posts/:id"`) or the
    fixed literal `"unmatched"` for anything no route claimed — never the raw path — specifically to
    keep cardinality bounded against an attacker-controlled path (`ports.ts:43-53`).
  - Middleware: `apps/website/src/server/inbound/shared/observability-middleware.ts:37-48`,
    `applyRequestTracking(app, deps)`. Registers one `app.use()` that opens a tracker on entry and
    calls `.end()` on `res.on("finish")`, reading `req.baseUrl + req.route.path` for the full
    mount-aware pattern (a sub-router's `req.route.path` alone is incomplete).
  - Wiring: `app.ts:898` (before `applySiteServingGate` at `:903`, ahead of all ~308 route
    registrations — the groundwork doc's §3 route count, itself grep-derived and not
    re-verified this session).
  - Real adapter: `apps/website/src/platform/observability/otel.ts` — one `NodeTracerProvider` per
    process (`:61-65`), never globally registered (`provider.getTracer()` taken directly, not
    `trace.setGlobalTracerProvider`, per that file's header, so constructing this adapter can never
    silently steal `@opentelemetry/api`'s process-wide registration from elsewhere in the process).
    `BatchSpanProcessor(new OTLPTraceExporter())` with **no explicit URL** — deliberately, so the
    OTLP SDK's own spec-compliant base-vs-per-signal endpoint resolution runs instead of a
    hand-rolled one (`otel.ts:54-59`, `config.ts:17-26`).
  - Config: `apps/website/src/platform/observability/config.ts:54-62` —
    `resolveObservabilityConfig(env)`. **Off by default.** Enabled only if
    `OTEL_EXPORTER_OTLP_ENDPOINT` or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is non-empty; deliberately
    uses OTel's own standard env-var names, not a `TOVU_OTEL_*` equivalent (file header explains why
    — every other `TOVU_*` var names a Tovu-specific concept, an OTLP endpoint is not one).
  - No-op default: `apps/website/src/platform/observability/noop.ts:8,20-26` — one frozen shared
    tracker object, zero allocation per call, for the common self-hosted-and-never-configured case.
  - Lazy load: `otel.ts` is the **only** file under `platform/observability/` that imports
    `@opentelemetry/*`; `index.ts:33-38`'s `createObservabilityPort()` reaches it via
    `createRequire(import.meta.url).require("./otel.js")`, gated behind `config.enabled`, so a
    process that never sets the env var never loads the OTel SDK at all. Confirmed pattern already
    used twice elsewhere in this same composition root (`app.ts`'s `createSiteAppLazily`,
    `deps.ts`'s `runExportSiteLazily`) — not a one-off.
  - Contract test: `apps/website/src/platform/observability/__tests__/unit/contract.unit.test.ts` —
    table-driven, runs the SAME cases (3 requests × 4 outcomes) against **both** adapters, asserting
    `trackRequest()`/`end()` never throw and two in-flight trackers stay independent. This is the
    right shape to extend for a third (Datadog/Grafana) adapter later, and for new port methods.
  - **Two composition roots, correctly split**: `deps.ts:1314` (`createSqliteRouteDeps`, the real
    running server) calls the real env-driven `createObservabilityPort()`; `app.ts:575`
    (`createRouteDeps`, the hermetic/test composition) always uses `createNoopObservabilityPort()`
    directly — so a stray `OTEL_EXPORTER_OTLP_ENDPOINT` left in a developer's shell can never make a
    hermetic test try to reach a real collector. Mirrors the existing "hermetic root gets the safe
    double, SQLite root gets the real adapter" convention already used for
    `ConsoleMailerAdapter`/`HttpApiMailerAdapter` and `InMemoryPublishHistoryStore`/
    `SqlitePublishHistoryStore`.
  - Constitution: `ADS-memory/governance/constitution.md:126-136`, Article VIII — "Key paths are
    instrumented: errors are structured and machine-readable, meaningful state changes emit events,
    work is correlatable across the write path." `observability-middleware.ts:8` cites this article
    directly as the port's governing rule.

- **Everything else: confirmed absent**, per the 2026-08-28 groundwork survey (methodology:
  direct grep across `apps/website/src`, cited as such in that doc, not re-run this session except
  spot-checks below):
  - **No correlation/request-id mechanism** beyond one local case: `assistant-ag-ui.ts` mints a
    `randomUUID()` per run and echoes `x-tovu-request-id` — **verified directly this session**,
    `apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts:44` (import),
    `:418` (`"x-tovu-request-id": requestId`), `:600-602` (`threadId`/`runId`/`requestId` each a
    fresh `randomUUID()` when absent). Scoped to that one streaming endpoint only — not a
    general Express-layer concern.
  - `server/request-context/` and `server/error-mapping/` are **empty scaffolding** — each holds
    only an `INFO.md` stating future intent, zero implementation (groundwork §4; not re-read this
    session, flagged as inherited).
  - `trackDbQuery`/`trackOutboundCall`/`trackAgentRun` are named directly in `ports.ts:23-24` and
    `observability-middleware.ts:9` as **the port's own designated next additions** — not built.
    **Verified zero call sites this session**: `command grep -rn "trackDbQuery\|trackOutboundCall\|
    trackAgentRun" apps/website` returns only those two doc-comment mentions, no implementation.
  - No structured logging library (`pino`/`winston`/`bunyan`) in `package.json` — confirmed by the
    dependency grep in §4 below.
  - **Two boot paths diverge** (groundwork §1, not re-verified line-by-line this session but load-
    bearing for scope): `tovu serve` (the packaged bin, `cli/commands/serve.ts`) and `npm start`/
    `index.ts` both eventually call `createApp()`, so the one wired signal (`trackRequest`) covers
    both — but `index.ts`-only machinery (production-readiness gate, the `BootModule` lifecycle
    registry, `startAssistantDaemon()`) is **not** exercised by `tovu serve` at all, so any future
    boot-time signal (module readiness, production-gate outcome) built against `index.ts` would
    silently not appear on the actual shipped `tovu serve` path.
  - **The three render paths** (site memory: `project_tovu_theme_build_provenance_model`) all mount
    as ordinary routes on the same single `app` object `applyRequestTracking` already covers, so
    each render request DOES get one span — but the port is too coarse to see *inside* a render:
    `pageShell()` (`apps/website/src/server/inbound/public-http/http/site/render.ts:2519`) is the
    shared `<head>` builder for the "live themed page" and "post/page" render tiers, while
    `renderStaticPage` (used by the static-export/home-route tier) **deliberately bypasses
    `pageShell()` entirely** (`render.ts:2409,2421,2436-2439` — confirmed by direct read: the SEO
    fold and the site-assistant widget each needed their own separate bypass-injection function,
    `injectExtraHeadIntoStaticPage`/`injectSiteAssistantIntoStaticPage`, because `pageShell`'s own
    injection never runs for that tier). Any future per-render-phase span (parse → render → shell)
    would hit the identical three-way-divergence trap those two features already paid for.

### The seam
**`apps/website/src/server/runtime/composition/app.ts:898`, `applyRequestTracking(app, {
observability: routeDeps.observability })`, plus `RouteDeps.observability`'s type in
`server/routes/types.ts`.** This is the single best seam on this surface — already built, already
proven (contract test + both composition roots), and already the pattern to imitate for the next
three signals (`trackDbQuery` at the repo-helper layer — `platform/db/sqlite/repo-helpers.ts`'s
`findOneBy`, fan-in 54 per `get_architecture`; `trackOutboundCall` at the 12 independent raw-`fetch`
call sites the groundwork doc's §3 names; `trackAgentRun` at the composition boundary with the
daemon, see §3 below).

### What would have to change
Nothing to make `trackRequest` work — it already does. To extend: (1) add `trackDbQuery`/
`trackOutboundCall`/`trackAgentRun` to `ObservabilityPort` in `ports.ts`, each with its own
`Input`/`Outcome` pair shaped after the real call site the way `RequestTrackingInput`/`Outcome`
were shaped after Express's actual lifecycle (not a guessed-in-advance generic shape — this is the
port's own stated design rule, `ports.ts:22-27`); (2) implement each in `otel.ts` and `noop.ts`;
(3) extend `contract.unit.test.ts`'s table; (4) call the new methods from the repo-helper layer, the
12 outbound-fetch sites (or accept OTel's `undici`/global-`fetch` auto-instrumentation instead, per
groundwork §5 fork 3 — a real, unevaluated option, not touched further here since it's a vendor-SDK
choice, not a recon finding), and the daemon-client boundary.

---

## 2. Surface: the admin server / admin API

### What exists today
- **Server-side: this is the SAME seam as §1, already covered.** All `admin-http` route modules
  (`apps/website/src/server/inbound/admin-http/routes/**`) register onto the identical single
  `app` object `createApp()` builds — confirmed by direct grep of `app.ts`'s import block (e.g.
  `registerAdminTaxonomyMergeTermRoutes`, `registerAdminModuleStatusRoute`, `registerAdminSitesRoutes`
  and ~15 more `registerAdmin*Routes` imports, all mounted after `applyRequestTracking` at `:898`
  and after `getAuthedPrincipal`'s `requireAdminSession` middleware chain). An admin API request
  today produces exactly the same one `trackRequest` span an ordinary site request does, tagged with
  its own route pattern (e.g. `"/api/admin/v1/workspaces/:workspaceId/posts/:postId"`). No
  admin-specific signal exists beyond that — no span attribute distinguishes "an admin session call"
  from "a machine API-key call" (`getAuthedCredentialKind`, `dev-auth.ts:230-238`, is available but
  unused for this purpose), and no attribute carries the authenticated principal.
- **Client-side (`apps/admin`, the React SPA): nothing.** The single fetch chokepoint every
  `api.*` call in the whole admin app goes through is `apps/admin/src/lib/api.ts:2158`,
  `async function request<T>(...)` — confirmed as the #1 hotspot in `get_architecture`'s fan-in
  ranking (**fan_in 191**, by far the highest in the project). It does exactly three things:
  fetch, parse JSON, throw `ApiError` on non-2xx (`:2159-2166`). Zero timing (no
  `performance.now()`/`Date.now()` anywhere in the file — confirmed by grep), zero client-side
  correlation id, zero span. `describeApiError` (`:2205-2208`, fan-in 78) only turns a thrown error
  into operator-facing copy — it never records anything, it only translates for display.

### The seam
**`apps/admin/src/lib/api.ts:2158`, the `request<T>()` function.** Every one of the ~191 call
sites that use `api.*` funnels through here — this is the client-side mirror of `applyRequestTracking`,
and it is exactly as centralized. Nothing else in the admin app needs touching to instrument every
outbound admin API call.

### What would have to change
`request()` would need to open a client-side span/timer before `fetchOrThrowUnreachable` and close
it after `parseJsonBody`/error-shaping, recording method+path (mirroring `RequestTrackingInput`),
duration, and outcome (status code or thrown `ApiError`'s `code`). This runs in a **browser**, not
Node — it cannot import `platform/observability/otel.ts` (Node-only SDK, and `apps/website` and
`apps/admin` are separate Vite/Node build targets with no shared runtime). It needs either (a) a
genuinely separate browser adapter satisfying a shape-compatible-but-not-identical interface (see
§6), or (b) a lightweight client that just forwards timing+outcome to the server via the existing
`x-tovu-request-id`-style correlation header so the *server-side* span is what actually gets
enriched, with the browser doing no local export of its own. Given this repo's stated "no
first-party collector the owner operates" reality (groundwork §5 fork 1 — unresolved product/legal
question), (b) is the cheaper, lower-risk starting point: it adds zero new client-side dependency or
export path, and reuses the server pipeline that already exists.

---

## 3. Surface: the agentic assistant / agent daemon — dropped chats

**This surface already has its own dedicated, extremely thorough investigation, dated three days
before this recon: `ADS-memory/reports/2026-09-06-chat-death-investigation.md`.** I verified its
central code citations directly rather than re-deriving them; below is what it found plus what I
confirmed still holds today.

### What exists today
- **Daemon spawn/exit breadcrumbs — real, added 2026-09-06, confirmed still in place.**
  `apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts:224`:
  `console.log(`[daemon-supervisor] ${new Date().toISOString()} spawned agent daemon pid=...`)`, and
  `:244-247` on `child.on("exit", ...)`:
  `` `[daemon-supervisor] ... agent daemon pid=... exited (code=..., signal=..., deliberate=...) — any run in flight died with it` ``,
  logged via `console.error` unless `shuttingDown` (deliberate) — comment at `:218-224` explicitly
  frames this as "2026-09-06 chat-death investigation" breadcrumbs: **"a daemon respawn kills every
  run in flight, and until now there was no way to correlate a dead chat against a restart."**
- **Per-run terminal-outcome logging — real, added the same day.**
  `apps/website/src/server/inbound/assistant/agent-daemon-server.ts:771` subscribes to
  `runLifecycle.stream(run.id, ...)`; `:783-785` logs
  `` `[agent-daemon] run ${run.id} ended: ${status} (code=..., signal=..., resumable=..., agent=..., conversation=..., resumeAttempted=...)` ``
  — `console.log` on success, `console.error` otherwise. Scoped to the
  `conversationId !== undefined` branch, which covers every admin chat-pane run (every one sends a
  `conversationId`) but would miss a daemon client that sent none (noted as a known, narrow gap in
  the source investigation, not fixed).
- **A per-run id exists but does not cross the process boundary as a trace context.**
  `assistant-ag-ui.ts` mints `randomUUID()` for `threadId`/`runId`/`requestId` (verified, §1 above) —
  but this is a plain application-level id, not a W3C `traceparent`. Nothing propagates it (or
  anything else) as trace context across the HTTP hop into the daemon process
  (`assistant-daemon-client.ts`), and the daemon runs its own OTel SDK not at all — there is
  currently no way a trace begun in the API process could continue into the daemon even if OTel were
  turned on today, because the daemon has zero `@opentelemetry/*` wiring of its own.
- **The specific, previously-confirmed root cause this surface needs visibility into**: a daemon run
  that exits non-zero is reclassified as a **successful, empty** turn by the time it reaches
  `chat.db` — three confirmed hops of the bug (`assistant-transport.ts`'s `end` listener ignoring
  `payload.status`/`code`/`signal`; `useConversation.ts` mapping any `"done"` status to
  `"succeeded"`; `persistableMessages` writing any terminal status verbatim) — see the cited report
  for full detail; not re-verified line-by-line this session since it lives partly in the sibling
  `Jini` repo (`/Users/la/Programming/Jini/packages/{chat,daemon,http-kit}`), out of this recon's
  write/verify scope, but the Tovu-side citations (`apps/admin/src/lib/assistant-transport.ts`,
  `apps/admin/src/lib/assistant-chats.ts`) are in-repo and match what that report cites.
- **Nothing about a run is durable.** `agent-daemon-server.ts:318` wires `createInMemoryEventLog()`
  — in-memory only, dies with the daemon process (confirmed by that report's citation of
  `@jini-ai/daemon`'s own `event-log.ts` doc comment). The daemon's own stdout/stderr is piped to the
  API's stdout (`daemon-supervisor.ts:461-462`, `stdio: ["ignore","pipe","pipe"]`), and the API's own
  stdio is `"inherit"` from `development/scripts/dev.mjs` — nothing persists it.

### The seams (three, layered)
1. **`daemon-supervisor.ts`'s spawn/exit handlers (`:224`, `:244-247`)** — already the right
   chokepoint for "did the daemon process itself restart," already logging, just not yet emitting a
   structured event/span an observability backend could ingest (today: `console.log`/`console.error`
   text, not a `trackAgentRun`-shaped call).
2. **`agent-daemon-server.ts:771-785`'s `runLifecycle.stream()` subscription** — already the right
   chokepoint for "did this specific run succeed/fail," same gap: text logs, not structured events,
   and no propagated trace id linking it back to the browser-side request that started the run.
3. **`assistant-daemon-client.ts`'s HTTP calls into the daemon** (`getAgentDaemonUrl()`-targeted
   `fetch`s, e.g. `cancelDaemonRunBestEffort` at `:248-249`) — the literal network boundary where a
   W3C `traceparent` header would need to be attached on the way out and read on the way in, for a
   trace to ever cross from the API process into the daemon process. Nothing does this today.

### What would have to change
Turn #1 and #2 above into calls through a new `ObservabilityPort.trackAgentRun`-shaped method
(daemon spawn/exit as one event kind, run start/end as another — the two are genuinely different
signals: one is process lifecycle, one is business-outcome), carrying the daemon's own process
generation (a boot id, incremented per spawn) as an attribute so "this run died because the daemon
under it also died" becomes a direct correlation instead of an inferred one from two separate log
lines' timestamps. For #3, add `traceparent` propagation on the daemon-client's outbound
`fetch` calls and give `agent-daemon-server.ts` its own (lazy, same-pattern-as-`otel.ts`) tracer
provider with a distinct `service.name` (e.g. `tovu-agent-daemon`) so a trace started in the API
process visibly continues into the daemon as a child span, rather than the API seeing "sent, got a
response" as one opaque unit. This is real, additional surface area — groundwork §5 item 4 already
flagged it as "roughly doubles the scope of adding OTel to Tovu" if in scope, and this recon
confirms nothing has closed that gap since.

**Important scoping note carried over from the chat-death report**: the actual product bug (dead
runs recorded as `succeeded`) is a **behavior-change fix**, not an observability gap, and needs the
owner's sign-off before touching `apps/admin/src/lib/assistant-transport.ts`'s `end` handler. This
recon's job is only to name where a trace/event would attach — not to re-propose that fix.

---

## 4. Surface: the frontend — page/site speed, Web Vitals

### What exists today
- **Zero Web Vitals / RUM instrumentation anywhere.** Confirmed by grep across
  `apps/admin/src` and `apps/website/src` for `web-vitals`/`LCP`/`INP`/`CLS`/`PerformanceObserver`/
  `reportWebVitals`/`sendBeacon` (excluding tests): the only `sendBeacon` hits are in the traffic
  analytics feature below, not performance. No `web-vitals` npm package, no PostHog/Mixpanel/
  Amplitude/Segment in either `package.json` (confirmed by grep, zero hits).
- **A real, structurally close precedent exists — but for traffic, not performance.**
  `apps/website/src/features/analytics/` (ADR-035) is a genuine first-party, cookie-less pageview/
  event analytics library: `POST /_analytics/e` (`apps/website/src/server/inbound/public-http/
  routes/site/analytics-ingest.ts:90`), an **unauthenticated** SITE route (deliberately, so
  anonymous visitors' `navigator.sendBeacon()` calls work), wired into `createApp()` at `app.ts:1365`
  — confirmed live, not a stub. Its `IngestBeacon` type (`features/analytics/types.ts:88-104`) is
  deliberately minimal and non-identifying: `host`, `path`, `referrer`, `kind`
  (`"pageview"|"event"`), optional `eventName`/`eventProps`, `dnt`/`gpc` flags. The route always
  returns `204` regardless of accept/reject/failure (`analytics-ingest.ts:101-102`) specifically so
  it can never be used as an oracle to probe a site's exclusion rules. `eventProps` is validated by
  `validateEventProps` (`features/analytics/ingest.ts:87`) to reject PII-shaped keys/values — this
  is a v1 heuristic, not a general classifier, per that file's own doc comment.
  **This is the pattern a future Web Vitals beacon should mirror** (same route shape, same
  fire-and-forget/no-oracle contract, same bounded-input discipline) — but it should be a
  **distinct** signal, not smuggled into `kind: "event"` + `eventProps`: ADR-035 scoped this library
  for traffic analytics specifically, and a metric-shaped payload (`{name: "LCP", value: 2400, id}`)
  reusing an anonymous-visitor traffic-counting pipeline would blur two genuinely different
  concerns the way the groundwork doc's §5 fork 1 already warns against ("telemetry" vs "content
  data" boundary blur).
- **The "different artifact" problem is real and directly verified.** `pageShell()`
  (`render.ts:2519`) is the one shared `<head>` injection point for two of the three render tiers,
  but the third — `renderStaticPage`, used for the static-export/home-route tier — **bypasses it
  entirely** (confirmed at `render.ts:2409,2421,2436-2439`, see §1). Any site-wide perf-beacon
  `<script>` tag injected only via `pageShell()` would silently not reach every themed page; it
  would need the same second bypass-injection treatment the SEO fold and the site-assistant widget
  already needed. The admin SPA (Vite-built, `apps/admin`) is a **third, completely separate**
  artifact from either — it has its own `index.html`/entry, unrelated to `pageShell` or
  `renderStaticPage`, and would need its own, independent Web Vitals wiring (most naturally through
  the same `apps/admin/src/lib/api.ts:2158` seam from §2, or a small dedicated reporter next to it).

### Is real-user monitoring even reachable? — honest answer
**Partially, and it depends entirely on how the site is served, which this codebase supports two
genuinely different ways:**
- **Live-served themed pages** (the two `pageShell`-routed render tiers, running inside the same
  Express process `createApp()` builds) — yes, reachable. A beacon script can point at
  `POST /_analytics/e`-style same-origin route on the SAME process that rendered the page, exactly
  like the existing analytics beacon does today.
- **Statically-exported/published sites** (`apps/website/src/platform/export/site-exporter.ts`,
  deployed via `features/deployments/static-publish/s3-compatible-target.ts` to e.g. S3-compatible
  storage) — **not reachable without extra design work.** Per the groundwork doc's confirmed finding
  (§1, not re-verified this session but architecturally load-bearing): `tovu export` "boots its OWN
  short-lived in-process listener and closes it before returning" — the exported HTML files are then
  served by whatever the operator deploys them to, which is **not** the Tovu Express process at all.
  A beacon baked into that static HTML would have nowhere same-origin to `POST` to; it would need to
  call back cross-origin to wherever the operator's live Tovu instance is (if one is even still
  running), reopening the exact CORS/privacy design question ADR-035 built its same-origin,
  no-oracle beacon specifically to avoid. **This is a real architectural gap, not a code bug**: RUM
  for a purely statically-hosted Tovu site has no current design, and building one is a genuine
  product decision (does the exported bundle carry a beacon pointed at a first-party collector? does
  static export even want RUM?), not an instrumentation wiring task.
- The **admin SPA** is always live-served from the same Node process that would run the API, so it
  has no equivalent reachability problem — only the "nothing built yet" gap from §2.

### The seam
No single best seam exists for this surface the way §1-3 have one — genuinely three separate
attachment points (`pageShell()` for two render tiers, a parallel bypass path for `renderStaticPage`,
and `apps/admin`'s own entry point for the SPA), plus the open "is static export even in scope"
question above. The closest thing to a unifying seam is **the `/_analytics/e` route's own pattern**
(`analytics-ingest.ts`) as a template to clone for a same-origin `/_vitals` (or similar) beacon route
on the live-served path only.

### What would have to change
A client-side `web-vitals`-library (or hand-rolled `PerformanceObserver`) reporter injected via
`pageShell()` (with a matching bypass injection for `renderStaticPage`, following the exact two-call-
site pattern the SEO fold and site-assistant widget already established) sending to a new,
purpose-built ingest route mirroring `analytics-ingest.ts`'s shape and no-oracle contract but with
its own `PerfBeacon` type (metric name, value, navigation id) — kept separate from
`IngestBeacon`/`eventProps` for the reason above. Static-export reachability is out of scope for an
instrumentation change and needs an explicit product decision first.

---

## 5. Existing dependencies (verified, not inferred)

**Root `package.json:101-106`** (real `dependencies`, not `devDependencies`):
```
"@opentelemetry/api": "^1.9.1",
"@opentelemetry/exporter-trace-otlp-http": "^0.221.0",
"@opentelemetry/resources": "^2.10.0",
"@opentelemetry/sdk-trace-base": "^2.10.0",
"@opentelemetry/sdk-trace-node": "^2.10.0",
"@opentelemetry/semantic-conventions": "^1.43.0",
```
This is a single-package.json monorepo at the root — there is no separate `apps/website/package.json`
(confirmed: `find . -maxdepth 4 -name package.json` returns only root, `apps/site-chat`,
`apps/admin`, `apps/desktop`, `packages/sdk`, plus a `dist/` build artifact and a Jini local-backup
dir). `apps/admin/package.json` and `apps/website` (via the root manifest) were both checked by grep
for `otel|opentelemetry|datadog|sentry|newrelic|prom-client|pino|winston|bunyan|statsd` —
**zero hits anywhere except the six lines above.** No metrics SDK (`prom-client`/`statsd`), no
logging library, no Sentry/Datadog/New Relic package, no `web-vitals`/PostHog/Mixpanel/Amplitude/
Segment package, confirmed by direct grep, not inference.

**Practical consequence**: the OTel *tracing* SDK is already an approved, installed dependency for
Node-side work (website + could extend to the daemon process). A *metrics* SDK
(`@opentelemetry/sdk-metrics` specifically, for counters/histograms rather than spans) is **not**
yet installed — if the adapter design below needs a counter primitive, that is a new dependency to
propose explicitly, not one already sitting in `package.json`.

---

## 6. Proposed adapter interface

Justified only by the call sites actually found above — not by OTel's full surface.

```ts
// Extends today's ObservabilityPort (ports.ts) rather than replacing it — trackRequest below is
// VERBATIM what already ships and is already contract-tested.

interface ObservabilityPort {
  /** EXISTING, shipped today. Inbound HTTP request lifecycle (observability-middleware.ts). */
  trackRequest(input: RequestTrackingInput): RequestTracker;

  /**
   * NEW. One DB call. Justified by repo-helpers.ts's findOneBy (fan-in 54) and the sibling
   * SQLite repo functions it's shaped after — a single wrap-point, not a per-repo-method rewrite.
   * Postgres has no live driver today (groundwork §3) — this is SQLite-only in practice for now,
   * and the interface must not assume a dialect.
   */
  trackDbQuery(input: { operation: string; table: string }): { end(outcome: { rowCount?: number; error?: boolean }): void };

  /**
   * NEW. One outbound fetch/HTTP call. Justified by the 12 independent raw-fetch call sites
   * (groundwork §3) with no shared HTTP client today. `target` must be a bounded label
   * (e.g. "s3-compatible-target", "github-git-provider"), never a raw URL — the same
   * cardinality-safety rule trackRequest's routePattern already enforces.
   */
  trackOutboundCall(input: { target: string; method: string }): { end(outcome: { statusCode?: number; error?: boolean }): void };

  /**
   * NEW. One agent-daemon run, spanning the API<->daemon process boundary (§3). Distinct from
   * trackRequest because a run outlives any single HTTP request/response and needs a daemon
   * process-generation attribute (a spawn/boot id) to correlate a dropped run against a daemon
   * restart — the exact gap the 2026-09-06 chat-death investigation found unclosed.
   */
  trackAgentRun(input: { runId: string; agentId: string; daemonGeneration: number }): {
    end(outcome: { status: "succeeded" | "failed" | "canceled"; exitCode: number | null; signal: string | null }): void;
  };

  /**
   * NEW. A structured, leveled event — the minimum needed to replace today's ad hoc
   * console.log/console.error breadcrumbs (daemon-supervisor.ts, agent-daemon-server.ts) with
   * something a backend can actually ingest, without inventing a full logging-library migration.
   * Deliberately NOT a general logger (no .debug/.info/.warn hierarchy) — this port's whole
   * design principle (ports.ts's own header) is "cover only a signal with a real wired call site,"
   * and every current console.* call site in this codebase is really "an outcome happened,"
   * not leveled prose.
   */
  recordEvent(name: string, attributes: Record<string, string | number | boolean>): void;
}
```

**What was deliberately left out, and why**: no `startSpan`/generic span API (the existing
`ports.ts` header already rejects this explicitly — "a port shaped like `startSpan(name,
attributes)` would still be OTel underneath every wrapper"); no metrics/counter primitive (no call
site in this codebase currently aggregates a counter — `@opentelemetry/sdk-metrics` isn't even
installed, §5); no browser-side interface merged into this same type — the browser (admin SPA,
themed pages) needs its own, separate, much smaller interface (see below), because it cannot import
Node-only code and its failure modes (network flakiness, no persistent process) are different enough
that forcing one shape on both would produce the same "generic shape guessed in advance" problem
`ports.ts` was written to avoid.

**Browser-side companion** (separate type, separate package concern — not this same interface):
```ts
interface ClientObservabilityPort {
  trackFetch(input: { method: string; path: string }): { end(outcome: { statusCode?: number; errorCode?: string }): void };
  reportWebVital(metric: { name: "LCP" | "INP" | "CLS" | "FCP" | "TTFB"; value: number }): void;
}
```

### Where it should live, and what the boundary gate will say
- **`ObservabilityPort` (Node-side) stays exactly where it is**: `apps/website/src/platform/
  observability/`. This repo has an established, repeated convention of one `ports.ts`-per-domain
  under `platform/*` (mirrors `platform/mail/ports.ts`, `platform/oauth/ports.ts`,
  `platform/export/ports.ts`) — inventing a new top-level location for this one port would break that
  convention for no benefit, and `check:boundaries` (`.dependency-cruiser.mjs`) is
  **`apps/website`-only** (confirmed: `apps/admin` has no boundaries gate at all, per this repo's own
  established fact) — so extending the port in place stays fully covered by the same gate it's
  covered by today.
- **Concrete finding, not previously known**: `platform/observability` is **not yet in
  `GUARDED_MODULES`** (`.dependency-cruiser.mjs:359-561`, confirmed by direct grep for
  `"observability"` across the whole config file — zero hits outside this one module's own absence).
  `GUARDED_MODULES` is what feeds `noDeepImportRules`'s "a module's public surface is its `index.ts`"
  rule (`.dependency-cruiser.mjs:636-710`, ADR-009 Decision §1). Concretely: **nothing today stops a
  feature module from `import`ing `platform/observability/otel.ts` directly**, bypassing
  `index.ts`'s `createObservabilityPort()` factory and the noop/otel split entirely — the boundary
  gate is currently silent on this, enforced only by the `contract.unit.test.ts` convention and code
  review, not by CI-visible lint. **Recommendation for the implementer**: add
  `"platform/observability"` to `GUARDED_MODULES` when this work lands, at `warn` severity to start
  (matching the file's own stated promotion policy — `PROMOTED_NO_DEEP_IMPORTS` requires the
  Category 1/2/3 triage the boundary-lint plan doc describes before promoting to `error`).
  `only-composition-constructs-concrete-adapters` (`.dependency-cruiser.mjs:194-204`) already exists
  as a rule and already generalizes to any new adapter added here: only `deps.ts`/`app.ts`/`index.ts`
  may call `createObservabilityPort()`/`createOtelObservabilityPort()` directly, so a Datadog/Grafana
  adapter added later inherits this enforcement for free, with zero new rule needed.
- **Cross-package type identity (the ESM-vs-CJS trap this repo has hit before, per project memory)
  is a smaller risk here than it looks, but still worth naming.** `ObservabilityPort` is a pure
  structural interface (no branded/nominal types, no classes) — TypeScript's structural typing means
  two separately-resolved copies of the same interface shape still satisfy each other at the type
  level, unlike the Drizzle branded-type collisions this repo has previously hit. The real risk is
  narrower: if the agent daemon process (§3) needs its OWN adapter instance and that process pulls in
  code from the sibling `Jini` packages (`@jini-ai/daemon` et al., per project memory
  "dispatch engine lives in Jini"), the daemon-side port should be **its own small interface
  definition local to wherever `agent-daemon-server.ts`'s composition lives**, not a value-import
  reaching back across the Tovu/Jini repo boundary — mirroring how `otel.ts` itself is the only file
  permitted to know about `@opentelemetry/*` inside `platform/observability`. A structurally
  compatible, independently-defined interface avoids the cross-repo coupling question entirely
  rather than needing to resolve it.
- **The `ClientObservabilityPort` (browser)** belongs in `apps/admin/src/lib/` next to `api.ts`
  (no boundaries gate there today, so no dependency-cruiser change needed for it), and, separately,
  in whatever module ends up owning the future Web Vitals beacon script for themed pages
  (likely a small new file under `apps/website/src/features/analytics/` siblings, or its own
  `platform/rum/` — undecided, this recon does not need to resolve it, since §4 already found the
  bigger open question is static-export reachability, not file placement).

---

## 7. Cost and risk

- **Hot-path cost**: `trackRequest` is already `O(1)` per request in both adapters (noop: zero
  allocation, shared frozen tracker object, `noop.ts:8`; otel: one `tracer.startSpan()` plus a
  handful of attribute writes, `otel.ts:91-95`'s own complexity doc). The proposed
  `trackDbQuery`/`trackOutboundCall` additions must hold the same bar — SQLite queries and outbound
  fetches are both on genuinely hot paths (every admin screen load is several `findOneBy` calls); a
  synchronous span-creation-plus-attribute-write per call is the right cost shape to hold to, and any
  adapter that does I/O synchronously inside `trackDbQuery`'s call (rather than batching/async-export
  like `BatchSpanProcessor` already does) would be a regression worth catching in review.
- **Secret leakage into span attributes — a real, named risk in this codebase specifically.**
  Per project memory, this repo has a keyring, external MCP credentials, and API tokens.
  `trackOutboundCall`'s `target` field is deliberately specified above as a **bounded label**
  (`"s3-compatible-target"`), never a raw URL — several of the 12 outbound-fetch call sites
  (`features/deployments/static-publish/s3-compatible-target.ts`,
  `inbound/admin-http/routes/external-mcp/admissions.ts`) build URLs from operator-supplied
  credentials/config, and a raw URL attribute could carry a query-string token or an
  embedded-credential URL directly into a span an operator's OTel collector then stores. The same
  discipline `RequestTrackingOutcome.routePattern` already applies to inbound paths (pattern, never
  raw path, `ports.ts:43-53`) must extend to every new signal: **no adapter method should ever accept
  a raw URL, header value, or credential-shaped string as an attribute** — only enum-like labels the
  call site itself chooses. This should be enforced the same way `analytics/ingest.ts`'s
  `validateEventProps` enforces it for the traffic-analytics beacon (§4) — a similar bounded-shape
  guard belongs on any future `recordEvent` attributes map, not left to each call site's own
  discipline.
- **Sampling**: not yet a live concern — `trackRequest` traces every request unconditionally today,
  with no sampler configured (`otel.ts`'s `NodeTracerProvider` construction has no `sampler` option
  set, confirmed by direct read — it uses the SDK default, `AlwaysOnSampler` unless overridden). This
  is fine at current scale (self-hosted, single small VPS instance per groundwork §5) but will need a
  head-based sampler (a `ParentBasedSampler` wrapping a ratio sampler is the standard OTel pattern)
  before any surface with high per-request volume (the admin API's `request()` seam in particular,
  fan-in 191) goes to a real collector — otherwise every keystroke-driven admin fetch becomes an
  exported span.
- **VPS resource budget**: already a documented open question (groundwork §5 item 5) — no
  measurement exists of the OTel Node SDK's own memory/CPU footprint on this repo's target
  entry-level VPS tier, and the lazy-load design (§1) exists specifically to avoid paying that cost
  for operators who never configure an exporter. This recon adds nothing new here beyond confirming
  the lazy-load mechanism is real and already shipped.

---

## 8. Operations nav: the Observability entry

**Confirmed: `soon: true` + `soonPreviewable: true` is exactly the pattern the owner is describing,
and it is a well-established, multi-instance idiom in this exact file — not a one-off.**

Read directly, `apps/admin/src/panels.tsx:434-440` (the `comments` panel's own comment) states the
mechanism explicitly: *"`soon: true` on a panel that DOES render a real screen... `soonPreviewable`
is what makes that combination coherent: without it the row would render as a **disabled link** and
the badge would hide shipped functionality rather than annotate it."* For a panel with **no screen
built at all** (Observability's actual state — nothing exists yet), the closer precedent is the
Commerce section's four entries (`orders`, `products`, `subscriptions`, `billing`,
`panels.tsx:643-728`), each of which pairs a bare `<Placeholder sectionId="..." agentHandle="..." />`
render with `soon: true, soonPreviewable: true` specifically so the row previews as "a real,
clickable link" rather than a disabled one — `billing`'s own comment (`:713-715`) states the owner's
rule directly: *"every Commerce row previews as a real clickable link, so the section never reads as
some rows working and others not."*

**The exact shape a new Observability entry needs** (mirroring `billing`/`orders` verbatim):
```ts
{
  id: "observability",
  render: () => <Placeholder sectionId="observability" agentHandle="observability" />,
  nav: {
    label: "Observability",
    group: "Operations",
    soon: true,
    soonPreviewable: true,
    icon: '<!-- a distinct two-tone line icon, not reused from a sibling Operations row -->',
  },
}
```
Positioned within `panels.tsx`'s existing `// --- Operations ---` block (`:730-899`), which currently
lists `database`, `integrations`, `recovery`, `deployment`, `source-control`, `access-tokens`,
`activity-log`, `import-export` in that order. **Caution, a real trap in this same file**:
`activity-log` (`:870-885`) and `import-export` (`:886-899`) are `soon: true` **without**
`soonPreviewable` — those two currently render as **disabled, non-clickable** links (per the
`comments` comment's own explanation of what bare `soon: true` does). If Observability is inserted
near them without setting `soonPreviewable: true` explicitly, it would silently inherit the wrong
("disabled") behavior rather than the owner's actual ask.

**Tests that move in lockstep** (both must be updated, or a new panel entry breaks CI):
- `apps/admin/src/__tests__/unit/panels-render.unit.test.tsx:69` —
  `expect(ADMIN_PANELS).toHaveLength(45)` and `expect(new Set(ADMIN_PANELS.map(p => p.id)).size).toBe(45)`
  — a hardcoded count that must be bumped to 46, plus `:309`'s "every panel id is exercised by this
  file" completeness check, which needs a new render-thunk assertion added for `observability`
  (the file already has a `Placeholder`-shaped precedent to copy from its `orders`/`products`-style
  cases).
- `apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts` — this file does not currently assert
  Operations-section membership/order the way it pins Commerce (`:82-95`, "exists with exactly
  Payments, Orders, Products, Subscriptions, Billing in that order") and Add-Ons (`:62-70`). If the
  implementer wants the same mutation-proof guarantee the owner required elsewhere in this file
  (`authentication`'s own comment at `:382-391` cites an explicit 2026-08-05 owner requirement for
  this), a new `describe("Operations nav section", ...)` block following the Commerce block's exact
  shape (exact membership + order, plus a "every entry previews as a real link" soon+soonPreviewable
  check) would be a natural, in-pattern addition — but no such test exists today to "move in
  lockstep" automatically; this would be new coverage, not an update to existing coverage.

**Not verified this session** (out of scope for a report-only recon per the "do not add the entry"
instruction): whether `Placeholder.tsx`'s `sectionId`/`agentHandle` props require a matching entry
elsewhere (e.g. an i18n string table) beyond what `orders`/`billing` already demonstrate — the
existing four Commerce entries are strong enough precedent that this is very likely a copy-paste-safe
pattern, but I did not trace `Placeholder.tsx`'s full prop contract to confirm zero additional
wiring.

---

## Sampling notice

**Read directly, in full, this session**: `platform/observability/{ports,config,noop,otel,index}.ts`
and their 4 unit test files (headers/structure, not every test body); `observability-middleware.ts`
and its test's existence (not its body); `app.ts` and `deps.ts` (targeted greps + specific line
reads, not the full 1399/1170 lines); `daemon-supervisor.ts` (full grep sweep + targeted reads);
`agent-daemon-server.ts` (targeted greps + the terminal-log call site); `assistant-daemon-client.ts`
(targeted greps); `assistant-ag-ui.ts` (targeted verification of the request-id claim);
`ADS-memory/.local-artifacts/metrics/2026-08-28-observability-groundwork.md` (full);
`ADS-memory/reports/2026-09-06-chat-death-investigation.md` (full);
`ADS-memory/governance/constitution.md` Article VIII (targeted); `apps/admin/src/lib/api.ts`'s
`request`/`describeApiError` (targeted); `apps/website/src/features/analytics/{types,ingest}.ts` and
`server/inbound/public-http/routes/site/analytics-ingest.ts` (full); `render.ts` (targeted greps for
`pageShell`/`renderStaticPage` divergence, not the full 2800+ lines); `.dependency-cruiser.mjs`
(targeted — `GUARDED_MODULES`, `PROMOTED_NO_DEEP_IMPORTS`, the two composition-adapter rules, full
grep for "observability"); `apps/admin/src/panels.tsx` (targeted reads of the Operations block and
four precedent entries, ~250 of ~1000+ lines); `nav-wiring.unit.test.ts` and
`panels-render.unit.test.tsx` (targeted greps for structure, not full bodies).

**Not read this session, cited only from prior verified reports**: the `Jini` sibling repo's
`packages/{chat,daemon,http-kit,protocol}` sources behind the chat-death investigation's F1-F5
(out of this recon's write/verify scope; that report's own citations were treated as
already-verified prior work, consistent with this repo's stated practice of not re-litigating a
governing doc's already-confirmed findings). `Placeholder.tsx`'s full prop contract (§8, flagged
as not verified). The full 308-route-registration count and the 40-file raw-console-log count from
the groundwork doc (both explicitly attributed to that doc's own grep, not re-run this session).

**Confidence**: High on everything in §0-3, 5-8 (direct reads, specific `file:line` citations,
several claims freshly verified against source rather than taken on the prior reports' word). Medium
on parts of §4 (the render-path bypass mechanism is directly verified; the static-export
non-reachability conclusion is architecturally sound but rests on the groundwork doc's un-re-run
`tovu export` boot-path description rather than a fresh trace of `site-exporter.ts` end to end).
