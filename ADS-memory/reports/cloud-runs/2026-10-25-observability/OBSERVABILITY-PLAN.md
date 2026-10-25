# Observability plan: one port, swappable adapters, every feature (2026-10-25)

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
        ├─ OpenTelemetry adapter ─ Jini otel.ts (lifecycle, redaction) + host SDK factories (Tovu otel.ts today)
        │       └─ OTLP → any OTel backend: Collector, Grafana Tempo, Datadog, Honeycomb, Jaeger … (no code)
        ├─ Sentry adapter ─ Tovu sentry.ts today (private NodeClient, lazily required)
        └─ combineObservabilityPorts (Jini) when more than one is configured: fan-out
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
**After:**
```ts
const toolExecutor = withToolCallObservability({ inner: withFederatedRefusalDiagnosis({ inner: createAssistantToolExecutor({ registry, … }, {}),
  getSnapshot: () => toolExtensions?.federation.reports() ?? [] }, {}), observability: routeDeps.observability }, {});
```
That one line is the whole feature-side change. The BYOK surface got the same change
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

## 4. Where adapters should live (owner decision, 2026-10-25)

The owner decided (`BRIEF-2.md`, "the adapter … for OpenTelemetry should be a provider plugin. There's
no way it should be in core") that **both** adapters move out of core into provider plugins. Run 2
(BRIEF-2) does the move. This run kept them in place, isolated so that the move is mechanical.

- **Should today's Tovu `platform/observability/otel.ts` move? Yes.** Nothing in it is Tovu-specific.
  It is SDK factory glue (OTLP exporter, `NodeTracerProvider`, span adaptation, AsyncLocalStorage
  scope) that any other project would copy verbatim. The only Tovu facts are the service and tracer
  names, and those come from `config.ts`, which stays. Proposed target: a Jini provider package
  (e.g. `@jini-ai/observability-otel`) exporting `createOtelObservabilityPort({ config }, options)`.
  It would carry the `@opentelemetry/*` dependencies, which today sit in Tovu root `package.json:154-159`.
- **Sentry:** same treatment, `@jini-ai/observability-sentry` with `@sentry/node`.
- **Core keeps:** the port, noop, `combineObservabilityPorts`, `describeReportedError`, decorators
  (Jini diagnostics), and in Tovu only config resolution plus selection (`index.ts`, `config.ts`).
- **Lazy loading survives the move.** Selection still requires or imports the provider module only when
  its env is set. The `no-first-party-require` allow-list entry then points at the plugin specifier.
  Run 2 must follow the repo's existing provider-plugin mechanism (BRIEF-2 step 1), not invent one.
- Boundary test to add in run 2: nothing in core imports `@opentelemetry/*` or `@sentry/*`.

## 5. Configuration

| Env (operator) | Effect | Default |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | enables OTel adapter (existing) | off |
| `OTEL_SERVICE_NAME` | service identity (existing) | `tovu` |
| `SENTRY_DSN` | enables Sentry adapter (new) | off |
| `SENTRY_ENVIRONMENT` | Sentry environment tag (new) | unset |
| `SENTRY_TRACES_SAMPLE_RATE` | fraction of operations sent as Sentry spans, clamped to [0,1] (new) | **0** (errors only) |

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
- User/session context is deliberately absent. If wanted, add an opt-in hashed `actor` attribute.
  That needs a consent decision first.

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
2. Non-OTel SDK (a new error tracker, a successor to OTel): one provider module implementing
   `ObservabilityPort`. Spread the noop for signals it doesn't model. Map `trackOperation` and
   `reportError`. Use `describeReportedError` for anything textual.
3. Add `resolveXConfig({ env })` and one lazy `createXPort` in selection. It joins
   `combineObservabilityPorts`.
4. Run the existing swap scenario against it: add one normalizer to
   `tool-call-observability.swap.test.ts`. If `EXPECTED_OPERATIONS` matches, the adapter is equivalent.
5. No feature file changes. That is the acceptance criterion.

## 8. Not covered (yet)

Metrics instruments (counters and histograms beyond span-derived ones). Trace-id-in-log correlation.
The browser/admin UI side (Sentry browser SDK or OTel web). Flushing the Sentry client and the OTel
provider on graceful shutdown (buffered events can be lost on exit). Status route. Run-2 items:
provider-plugin move, PostHog/product analytics.
