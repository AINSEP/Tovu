# Observability plan: one port, swappable adapters, every feature (2026-10-25, updated run 2)

> **Run 2 update (same day):** the OpenTelemetry and Sentry adapters moved OUT of Tovu core into Jini
> provider subpaths (owner decision), run 1's six review findings are fixed, and product analytics
> (PostHog) landed behind its own vendor-neutral contract. Sections 1, 4, 5 and 9–11 reflect that.

Prototype branches: Tovu `cloud/observability-1025-tovu`, Jini `cloud/observability-1025-jini`. Nothing here is merged.
Every number below was measured in this run on a 4-core cloud VM (Node 24.22.0). How each was measured is stated with it.

## 1. The shape, in one picture

```
 feature code (tool executor, publish, backup, webhooks …)
        │  speaks only the port: trackOperation / reportError (+ trackRequest/DbQuery/OutboundCall/AgentRun)
        ▼
 ObservabilityPort   ← Jini @jini-ai/diagnostics/observability (vendor-neutral, no SDK types)
        │
        ├─ noop (default; shared frozen tracker; decorators return their input untouched)
        ├─ OpenTelemetry provider ─ @jini-ai/diagnostics/observability/opentelemetry (SDK factories, moved
        │       from Tovu core) over Jini otel.ts (SDK-free lifecycle + redaction)
        │       └─ OTLP → any OTel backend: Collector, Grafana Tempo, Datadog, Honeycomb, Jaeger … (no code)
        ├─ Sentry provider ─ @jini-ai/diagnostics/observability/sentry (moved from Tovu core)
        └─ combineObservabilityPorts (Jini) when more than one is configured: fan-out (each adapter isolated)

 Tovu core (apps/website/src/platform/observability): config (env names) + selection only; lazily
 require()s a provider subpath when its env is set and registers its dispose() with site teardown.
 Product analytics is a SEPARATE port (section 9): @jini-ai/analytics/product + ./product/posthog.
```

The rule that makes it swappable: **features never import an SDK and never name a vendor concept**
(span, transaction, breadcrumb). They name *their own* work (`tool.call`) and *their own* outcome
(`completed`, `denied`, `timed-out`). Each adapter decides what that becomes in its vendor's model.

What OpenTelemetry vs Sentry vs Grafana/Datadog actually are:
- **OpenTelemetry** is an instrumentation standard plus SDK, not a backend. Its OTLP output goes to any
  compatible backend. **Grafana (Tempo/Loki/Mimir), Datadog, Honeycomb, New Relic, Jaeger are OTel
  *backends*.** Switching between them is an operator config change (`OTEL_EXPORTER_OTLP_ENDPOINT`, or
  an OTel Collector in between). No code adapter is needed for them.
- **Sentry** is an error tracker with its own SDK, its own data model (issues, transactions) and its
  own wire format. It needs a code adapter, which is `sentry.ts`.
- A future non-OTel system (a new standard, or another SDK-only vendor) is one new adapter file that
  implements the port. No feature changes. Section 7 has the checklist.

## 2. The pattern for any feature (before/after)

### 2a. Where the feature already has a chokepoint: a decorator (preferred)

The assistant tool-call path. This is the prototype, and every call goes through `ToolExecutor.execute`.

**Before** (`apps/website/src/server/inbound/assistant/agent-daemon-server.ts`):
```ts
const toolExecutor = withFederatedRefusalDiagnosis({ inner: createAssistantToolExecutor({ registry, … }, {}),
  getSnapshot: () => toolExtensions?.federation.reports() ?? [] }, {});
```
**After** (the `toolExecutor` line is unchanged; source-anchored wiring tests pin it verbatim):
```ts
const observedToolExecutor = withToolCallObservability({ inner: toolExecutor, observability: routeDeps.observability }, {});
const delegatedToolRouteDeps = { lifecycle, toolExecutor: observedToolExecutor, … };
```
Those two lines are the whole feature-side change. The MCP-UI callback route (a person answering a
surface) still gets the bare executor. Its wiring test pins that line, so covering it is a follow-up.
The BYOK surface got the same change
(`byok-tool-surface.ts` `composeSurfaceExecutor`, fed `routeDeps.observability` from `assistant-byok.ts`).
The decorator itself is generic, so it lives in Jini (`@jini-ai/daemon/tool-recovery` `withToolCallObservability`).
It takes the port structurally, so the daemon gets **no** dependency on diagnostics or on any vendor.
The Tovu wrapper (`assistant/tool-recovery-preset.ts`) returns the executor untouched for the noop port.

### 2b. Where it doesn't: wrap the unit of work

```ts
// deps: { observability: ObservabilityPort } — injected, default createNoopObservabilityPort({})
const op = observability.trackOperation({ name: "site.publish", attributes: { "site.id": siteId, "deploy.target": kind } });
try {
  const result = await op.run(() => publishSite(input));        // DB/fetch spans inside nest under it
  op.end({ outcome: result.status, failed: result.status === "failed" });
  return result;
} catch (error) {
  op.run(() => observability.reportError({ error, context: { operation: "site.publish" } }));
  op.end({ outcome: "threw", failed: true });
  throw error;
}
```
Rules: `name` is a fixed dotted label. Attributes are ids and fixed labels only: no user text, no
paths, no bodies. The feature decides what counts as `failed` (a policy denial is not a failure).
Call `reportError` only for incidents (things someone should look at), never for expected
input/validation errors. Those are counted on the operation. Once the 3rd call site uses this
try/catch shape, extract one `observeOperation({ observability, name, attributes }, fn, { classify })`
helper into Jini diagnostics. Not before (rule of three, no overbuild).

## 3. Features in priority order

The priority is set by how much an operator loses today when the feature fails silently. The effort
assumes the pattern above and a fake-port test per feature, like `tool-call-observability.test.ts`.

| # | Feature / path | Chokepoint | Why first | Effort |
|---|---|---|---|---|
| 0 | **Assistant tool calls** | `ToolExecutor.execute` | **done in this prototype** (daemon + BYOK) | — |
| 1 | Deploy / publish (`features/deployments`, `publish-content`) | publish adapter `publish()` / verify | Customer-visible outage; already uses `trackFetch` for egress, no operation span | S (½ day) |
| 2 | Webhook delivery worker (`server/runtime/composition/webhook-delivery-worker.ts`, `features/webhooks`) | per-delivery attempt | Retries fail silently (3 `console.error` sites in `features/webhooks`) | S |
| 3 | Agent run lifecycle errors (`assistant-run-finalizer.ts`) | already `trackAgentRun` | Add `reportError` on `failed`/`interrupted` so error trackers see run deaths | XS |
| 4 | Site backup / export / database transfer (`site-backup`, `site-export`, `database-transfer`) | service entry points | Long-running, data-loss risk | S each |
| 5 | Mail / newsletter send (`features/mail`, `newsletter`) | mailer port | Silent delivery failures (3 `console.error` in newsletter) | S |
| 6 | Source control sync (`features/source-control`) | provider-kit calls | Already instrumented for egress, no operation | S |
| 7 | External MCP admissions / federation (`external-mcp-admissions.ts`) | admission run | Boot-time failures are hard to see | XS |
| 8 | HTTP 5xx → `reportError` | `server/inbound/shared/observability-middleware.ts` + http-kit `onInternalError` | Every unhandled route error becomes an incident report with request id | S |
| 9 | Remaining `console.error` sites in `features/` (29 counted via `grep -rn console.error features`, excluding tests) | per site | Tail | M total |

Rough total for 1–8: about 3–4 focused days, plus the provider-plugin move (section 4). Not measured: effort is an estimate.

## 4. Where adapters live (done in run 2, owner decision 2026-10-25)

Owner: "the adapter … for OpenTelemetry should be a provider plugin. There's no way it should be in core,
because we're gonna want to use it for other projects."

| Adapter | Now lives in | SDK dependency | Loaded when |
|---|---|---|---|
| OpenTelemetry | Jini `@jini-ai/diagnostics/observability/opentelemetry` (`createOtelObservabilityAdapter`, `createOtelFactories`, `createAsyncLocalSpanScope`) | `@opentelemetry/*`, optional peers | `OTEL_EXPORTER_OTLP_(TRACES_)ENDPOINT` set |
| Sentry | Jini `@jini-ai/diagnostics/observability/sentry` (`createSentryObservabilityAdapter`) | `@sentry/node` 11.6.0, optional peer | `SENTRY_DSN` set |
| PostHog (product analytics) | Jini `@jini-ai/analytics/product/posthog` (`createPostHogProductAnalyticsAdapter`) | `posthog-node` 5.55.1, optional peer | `POSTHOG_API_KEY` set (and nothing is SENT until consent) |

**Which "plugin" mechanism, and why this one.** Tovu has two provider-plugin shapes:
1. **Agent Plugins** (`content/agent-plugins/<id>/` + a `tovu-*.json` contribution file + a plain-JS `.mjs`
   module, loaded by `@jini-ai/agent-plugins` contribution loaders): mail (Resend), site search
   (Meilisearch), object stores / deploy targets (S3, Vercel …), visitor-analytics forwarders. These are
   runtime-installed, trust-gated (shipped digest), per-workspace, loaded **async**, and **cannot import npm
   packages** ("Plain JS, no npm imports: an installed plugin has none", every such module's header).
2. **Jini vendor provider subpaths** with optional peer SDKs: `@jini-ai/capability-providers/adapters/stripe`,
   `./adapters/ws`, `@jini-ai/diagnostics/web-evidence/playwright`. The port subpath never imports the vendor;
   only a host that imports the vendor subpath loads its SDK.

Observability and product analytics need a vendor **npm SDK**, are **process-level** (one client per process
or site, not per workspace), and are built in the **synchronous** composition roots. Shape 1 can satisfy none
of the three without inventing a new mechanism (an SDK injected by the host would put the vendor name back in
core). Shape 2 satisfies all three and is exactly the owner's reason: any other project installs
`@jini-ai/diagnostics` + the SDK and calls the same provider. So run 2 used shape 2. If the owner wants
separate packages (`@jini-ai/observability-otel`, …) instead of subpaths, the split is mechanical: the files
have no sibling imports beyond the port, `otel.ts` and `errors.ts` (owner question 1 in REPORT-2).

**Core keeps:** the port, noop, `combineObservabilityPorts`, `describeReportedError`, decorators (Jini
diagnostics/daemon), and in Tovu only config resolution and selection (`platform/observability/{index,config}.ts`,
`platform/product-analytics/index.ts`). Boundary test: `observability-vendor-boundary.unit.test.ts` (no production
file in `apps/website/src` imports `@opentelemetry/*`, `@sentry/*` or `posthog-*`; the guard self-tests its regex).

**How another project reuses them** (the owner's reason):
```ts
import { createRequire } from "node:module";
import { combineObservabilityPorts, createNoopObservabilityPort } from "@jini-ai/diagnostics/observability";
const require = createRequire(import.meta.url);
const adapters = [];
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) adapters.push(require("@jini-ai/diagnostics/observability/opentelemetry")
  .createOtelObservabilityAdapter({ config: { enabled: true, serviceName: "my-app", tracerName: "my-app", endpoint } }));
if (process.env.SENTRY_DSN) adapters.push(require("@jini-ai/diagnostics/observability/sentry")
  .createSentryObservabilityAdapter({ config: { enabled: true, dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 } }));
const observability = adapters.length ? combineObservabilityPorts({ ports: adapters.map((a) => a.port) }) : createNoopObservabilityPort({});
onShutdown(() => Promise.all(adapters.map((a) => a.dispose())));
// tool executors: withToolCallObservability / withToolCallAnalytics from @jini-ai/daemon/tool-recovery
```
The project adds the SDK packages it uses to its own `package.json` (they are optional peers).

**Lifecycle (review #6).** Every provider returns `{ port, dispose }`. Tovu registers each `dispose` with the
site store's `onClose` (`deps.ts`): OTel shuts its provider down (flush + stop the batch timer), Sentry closes
its private client (removes the SDK's `beforeExit` listeners), PostHog flushes and shuts down. Measured:
5 open/close cycles leave the `beforeExit` listener count at baseline.

**Process-wide state (review #5).** The Sentry provider never calls `Sentry.init()` NOR `NodeClient#init()`
(in 11.6.0 the latter sets the process's async-context strategy), and passes `enableRuntimeChannelInjection: false`.
A host that already runs Sentry passes its own client (`options.client`): reused, never closed by `dispose`.

## 5. Configuration

| Env (operator) | Effect | Default |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | enables OTel adapter (existing) | off |
| `OTEL_SERVICE_NAME` | service identity (existing) | `tovu` |
| `SENTRY_DSN` | enables Sentry adapter (new) | off |
| `SENTRY_ENVIRONMENT` | Sentry environment tag (new) | unset |
| `SENTRY_TRACES_SAMPLE_RATE` | fraction of operations sent as Sentry spans, clamped to [0,1] (new) | **0** (errors only) |
| `POSTHOG_API_KEY` | enables the PostHog product-analytics provider (run 2) | off |
| `POSTHOG_HOST` | PostHog ingestion host (EU cloud or self-hosted) | `https://us.i.posthog.com` |
| setting `core.privacy.telemetry.metrics` | the operator's consent; product events are sent only when `true` | **false** |

These are vendor-standard names, the same rule `config.ts` already documents for OTLP.
**Both set:** fan-out (`combineObservabilityPorts`). OTel gets every signal, and Sentry gets
operations and error reports. Sentry ignores request/DB/outbound/agent-run signals by design (its
adapter spreads the noop for those), so nothing is double-traced. A test proves both receive the full
scenario (`tool-call-observability.swap.test.ts`, "both configured"). Fan-out was chosen over "pick one"
because the realistic combination is exactly "OTel for traces + Sentry for incidents". It costs nothing
when only one adapter is configured: `combineObservabilityPorts` returns that adapter itself.

Not done: `observability-status` admin route still reports OTel only. Add `sentry: { enabled }`
(never the DSN).

## 6. Sampling, PII, cost

**Sampling.**
- OTel today exports every span (BatchSpanProcessor, no sampler). Plan: honour the standard
  `OTEL_TRACES_SAMPLER`/`_ARG` (parent-based ratio) in the SDK factory, and sample at the Collector
  (tail sampling: keep all errors, 10% of successes) for cost.
- Sentry traces default to 0, and errors are always sent. Sentry bills per span.

**PII and secrets** (enforced in adapters, so a careless call site cannot leak):
- Inputs carry ids and fixed labels only (port docs). Tool **inputs and outputs never cross the port**.
- OTel: error *messages are never exported*, only the type (existing `errorType` rule, kept for `reportError`).
- Sentry needs a message to group issues. It gets `describeReportedError`, which runs message and stack
  through `redactSecretShapes` (built on core `SECRET_SHAPE_PATTERNS`, `core/src/redact.ts`), redacts
  first, then caps (1024 chars, 30 stack lines).
- Tool failures reach the port already redacted by Tovu's `withRedactedToolFailures` (an `ERR-…` id
  replaces secrets). Tests check the secret is absent at both layers.
- Sentry `dataCollection` is turned off: no user, IP, cookies, headers, query strings, bodies or local
  variables. There are no default integrations, so nothing is auto-captured.
- **Gap (owner question 2):** `redactSecretShapes` does not remove e-mails or hostnames. Error messages
  that contain them reach Sentry.
- **`user.id` (owner, run 2):** every tool-call operation and product event carries WHO did it as the
  principal's opaque id. Pseudonymous only: an id containing `@`, longer than 128 chars or secret-shaped is
  replaced by `unidentified` (observability) or the event is dropped (product analytics). Never e-mail or name.
- **Unregistered tool ids (review #1):** observation starts before the registry lookup, so `tool.id` is the id
  only when `registry.has()` knows it (and it is shape- and secret-clean), else the fixed label `unregistered`.
  Every adapter also redacts and caps every attribute string (`redactOperationAttributes`) before the SDK.
- **`Error.name` (review #2):** writable, so it is redacted and capped (64) in `errorType`, used by OTel and Sentry.

**Cost and performance budget** (all measured here):

| What | Measurement | Result |
|---|---|---|
| Disabled (default) per tool call | decorator returns the same executor object (identity test), 20k-call loop | 0.96 µs/call = the bare executor's own cost. No wrapper, no allocation, no SDK load |
| SDK load, OTel (6 `@opentelemetry/*` modules) | `node --expose-gc`, `require` delta, 3 runs | ~155 ms, +21 MB RSS, +4 MB heap |
| SDK load, `@sentry/node` 11.6.0 | same | ~465 ms, +40 MB RSS, +9.8 MB heap |
| Enabled per tool call, OTel | 20k calls, in-memory exporter with SimpleSpanProcessor (retains every span, so this is pessimistic) | ~45 µs/call |
| Enabled per tool call, Sentry errors-only / traces=1 | 20k calls, recording transport that drops | ~30 / ~25 µs/call |

Caveats: these are single-process micro-benchmarks. Real tool calls take milliseconds to seconds, so
tens of µs is noise. The Sentry SDK's +40 MB RSS matters on small VPS installs. That is why it stays
lazy and off by default, and why it is the first argument for "Sentry only if you need it" (open
question 1).

## 7. Adding a new system later (checklist)

1. OTel-compatible backend (Grafana, Datadog, Honeycomb, …): **no code.** Point
   `OTEL_EXPORTER_OTLP_ENDPOINT` at it, or at an OTel Collector that fans out to it. Collector
   connectors (`spanmetrics`) also derive request/error/duration metrics from these spans with no code.
2. Non-OTel SDK (a new error tracker, a successor to OTel): one Jini provider subpath
   (`@jini-ai/diagnostics/observability/<vendor>`, SDK as an optional peer) returning `{ port, dispose }`.
   Spread the noop for signals it doesn't model. Map `trackOperation` and `reportError`. Use
   `describeReportedError` for anything textual and `redactOperationAttributes` for every attribute. Never
   install process-wide state (global init, context strategy, instrumentation hooks); accept a host client.
3. Add `resolveXConfig({ env })` and one lazy `require("<subpath>")` in Tovu selection, registering `dispose`
   via `onDispose`. It joins `combineObservabilityPorts`. Extend the vendor-boundary regex if the SDK has a new scope.
   (A product-analytics vendor: same, under `@jini-ai/analytics/product/<vendor>`, wrapped in `withProductAnalyticsGuards`.)
4. Run the existing swap scenario against it: add one normalizer to
   `tool-call-observability.swap.test.ts`. If `EXPECTED_OPERATIONS` matches, the adapter is equivalent.
5. No feature file changes. That is the acceptance criterion.

## 9. Product analytics (run 2): a separate, small contract

**New contract or extension? New** — `@jini-ai/analytics/product`, a subpath of the existing analytics package.
`@jini-ai/analytics` (root) and Tovu `features/analytics` are VISITOR analytics for customers' sites (cookie-less
pageview hits, salted visitor hashes, the visitor's cookie consent, ADR-035). Product analytics is how OWNERS
use Tovu: an identified (pseudonymous) person, the operator's telemetry consent, event-tool vendors. Extending
the hit contract would put visitor fields on product events and identity on hits. Reused, not duplicated:
`validateEventProps` (PII-shaped keys and e-mail values, size bounds) and core `redactSecrets`.

```ts
interface ProductAnalyticsPort {
  capture({ name, userId, properties }): void;   // owner 12:33: single objects, fields can be added later
  identify({ userId, traits }): void;
}
withProductAnalyticsGuards({ inner, consent })    // consent per event, fixed snake_case names, pseudonymous ids,
                                                  // PII/secret property rules, never throws; noop stays noop
```
Naming: the owner's own example (`capture({ name, properties, userId })`) was followed; `capture`/`identify`
cover Segment-, Amplitude- and PostHog-style tools alike (Segment's `track` is the same call).

**Consent** reuses the existing system: `core.privacy.telemetry.metrics` (Jini core settings, default OFF,
withheld from agent writes because "its entire purpose is to attest that a HUMAN decided"). It had been
registered with "no adapter to gate"; `createTelemetryConsent` is that gate. Read per event (a settings read,
async), so revoking stops the next event. Visitor cookie consent (`readRequestConsentChoices`) is NOT used:
it is a visitor's choice about a site, not an operator's choice about Tovu.

**Instrumented flow:** assistant tool calls (`withToolCallAnalytics`, Jini daemon, generic; Tovu wraps the
delegated-tool route inside the observability decorator). Event `tool_call` with `tool_id`, `outcome`,
`failed`, `error_kind`; no input, output or error text. Swap proof: `tool-call-product-analytics.swap.test.ts`
(noop → executor untouched; fake and real `posthog-node` with a recording fetch → the same 5 events; consent
unset or false in the real settings ledger → zero batches).

**Browser side (not built):** `posthog-js` would add autocapture, session replay and web vitals for the admin
UI. It needs (a) a client-side consent read of the same setting before init, (b) replay masking of all inputs
(`maskAllInputs`, `maskTextSelector: "*"` for the editor) since owners type site content and keys, (c) a CSP
allowance for the ingestion host, (d) `person_profiles: "identified_only"` and the same pseudonymous id.

**Cost (measured, Node 24, 4 cores):** `posthog-node` load ~70–100 ms, +19 MB RSS (3 runs). Noop
`capture` 0.03 µs; guarded `capture` ~25 µs (PII check + secret redaction of property strings; 100k-call loop,
delivery excluded). Delivery is batched in the background by the SDK (default 20 events / 10 s).

## 10. PostHog vs Sentry overlap, and a recommendation

PostHog also does error tracking (exception capture, issues) and session replay; Sentry also does
performance traces and (browser) replay. Overlap is real for **errors**.

| Need | OTel | Sentry | PostHog |
|---|---|---|---|
| Traces / latency across services | **yes** (standard, any backend) | yes (billed spans) | no |
| Server error issues with stack + grouping | exception events only | **best** (grouping, releases, alerts) | yes (younger) |
| Product events, funnels, retention | no | no | **yes** |
| Session replay (admin UI) | no | yes | yes |
| Feature flags / experiments | no | no | yes |
| Free tier (from memory of the vendors' pricing pages; NOT verified this run, no vendor network) | backend-dependent | ~5k errors/mo | ~1M events + ~100k exceptions/mo |
| Process cost when enabled (measured) | ~155 ms, +21 MB | ~465 ms, +40 MB | ~85 ms, +19 MB |

**Recommendation:** OTel for traces (vendor-neutral, already built), PostHog for product analytics, and
**start with ONE error tracker: PostHog**, behind a small `reportError` adapter (a PostHog
`ObservabilityPort` adapter that maps only `reportError` → `captureException`, same redaction as Sentry). It
reuses the client and consent path already loaded, saves Sentry's +40 MB / ~0.5 s, and one vendor fewer for
self-hosters. Keep the Sentry provider (it is built, tested and costs nothing unless `SENTRY_DSN` is set) for
operators who want Sentry's grouping/alerting. Caveat: PostHog error tracking is consent-gated in this design
(it is the vendor-telemetry consent), so an operator who declines telemetry gets no remote error reports unless
they configure Sentry or OTel themselves; that is the honest consequence and is owner question 2 in REPORT-2.
The PostHog `reportError` adapter is NOT built in run 2.

## 11. Rollout order

1. Merge Jini (diagnostics + daemon + analytics minor bumps; `observability` port gained `trackOperation` /
   `reportError` in run 1, a breaking change for hand-written ports), then Tovu.
2. Ship with everything off (default). Verify the noop path: no SDK in `require.cache` (boundary test + identity tests).
3. Turn on OTel to a Collector on a staging box; check `tool.call` spans, `user.id`, `unregistered`.
4. Add the Settings → Privacy UI copy for `telemetry.metrics` ("share anonymous usage data with Tovu's developers:
   which features you use; never your content, e-mail or keys"), then enable `POSTHOG_API_KEY` on Tovu-operated
   instances only; self-hosters stay off unless they set a key AND opt in.
5. Decide Sentry vs PostHog for errors (section 10); build the PostHog `reportError` adapter if PostHog.
6. Extend instrumentation per section 3 (publish, webhooks, …): one `trackOperation` + one product event each.
7. Browser side (`posthog-js`) last, after the consent read and replay masking in section 9.

## 12. Not covered (yet)

Metrics instruments (counters and histograms beyond span-derived ones). Trace-id-in-log correlation.
The browser/admin UI side (Sentry browser SDK or OTel web). Flushing the Sentry client and the OTel
provider on graceful shutdown beyond site teardown (`dispose` runs on store close; a hard process kill still
loses buffered events). Status route. The MCP-UI callback route and BYOK surface emit no product events (only
the delegated-tool route does). PostHog `reportError` adapter. Browser `posthog-js`.
