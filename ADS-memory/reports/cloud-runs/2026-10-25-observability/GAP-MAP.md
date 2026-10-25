# Step 1 — Gap map: what `ObservabilityPort` covers today (2026-10-25)

Read before writing: Jini `packages/diagnostics/src/observability/{ports,noop,otel,hooks,instrumentation,config,node}.ts`,
Tovu `apps/website/src/platform/observability/{index,config,otel}.ts`, Jini `packages/daemon/src/tool-executor.ts:138-185`,
Jini `packages/daemon/src/http/delegated-tools.ts:225-355`, Tovu `apps/website/src/assistant/tool-recovery-preset.ts:72-125`.

| Concern | Today | Evidence | Gap |
|---|---|---|---|
| Inbound HTTP requests | `trackRequest` → server span; hooks add log + metrics events | `ports.ts:11-24`, `otel.ts` `trackRequest`, `hooks.ts` | none for this prototype |
| DB queries | `trackDbQuery` via `instrumentStorageKernel` (in-place decorator, identity for noop) | `instrumentation.ts` `instrumentStorageKernel` | none |
| Outbound HTTP | `trackOutboundCall` via `trackFetch` / `trackHttpClient` | `instrumentation.ts` | none |
| Agent runs | `trackAgentRun` (root span per run) | `ports.ts:35-40`; Tovu `assistant-byok.ts:587` | none |
| **Feature-level operations** (a tool call, a publish, a backup) | **not expressible** — every signal is tied to one transport (HTTP/DB/fetch/agent). A feature has no way to say "this unit of work happened, with this outcome" | `ports.ts:41-46` (4 methods, all transport-shaped) | **add `trackOperation`** |
| **Errors / exceptions** | Only as span status + `exception` event with `exception.type` on a failing span; no way to report an error that is not the end of a tracked signal; no error-tracker semantics (grouping, stack) | `otel.ts` `finish()`; messages deliberately never exported (`otel.ts` `errorType` doc) | **add `reportError`** |
| Tool-call failures specifically | Go to `console.error` (`[tool-failure] ERR-… tool=… run=…`) via `failurePorts` default `onFailure`; and http-kit `onInternalError` default `console.error` | Tovu `tool-recovery-preset.ts:77-80`; Jini `delegated-tools.ts:149` | not on the port at all |
| Metrics (counters/histograms) | Only `RequestMetricsPort.recordRequest` (request-shaped, hook-only); no OTel metrics SDK | `ports.ts` `RequestMetricsPort`, `hooks.ts` | out of scope here; spans give duration+outcome per op, a Collector `spanmetrics` connector can derive RED metrics with no code (see plan) |
| Log correlation (trace id in logs) | Request id is on the span (`http.request.id`), logs carry request id via hooks | `otel.ts` trackRequest; `hooks.ts` | partial; trace-id-in-log not done — plan item |
| User/session context | None on the port (principal ids never cross it) | `ports.ts` header: "Inputs carry ids and fixed labels only" | intentionally not added; plan proposes an opt-in `actor` attribute with hashing, owner decision |
| PII / secret scrubbing | Adapter-side: `redactSecretShapes` (diagnostics `core/secrets-only.ts`, built on core `SECRET_SHAPE_PATTERNS` from `core/src/redact.ts`) for request targets; outbound URL reduced to scheme/host/port; error **messages never exported** | `otel.ts` `redactRequestTarget`, `outboundTargetAttributes`, `errorType` | `reportError` needs a message for an error tracker → add one shared `describeReportedError` that redacts message+stack with the same `redactSecretShapes`, used by every adapter |
| Vendor isolation | OTel SDK only in Tovu `platform/observability/otel.ts`, lazily `require`d; Jini side is structural (`TracerPort`, `ExporterFactory`) with no SDK import | Tovu `otel.ts` header; Jini `otel.ts` header | Sentry: no adapter, no dependency (`package.json` has only `@opentelemetry/*`) |

Design decision taken for step 2: follow the existing tracker shape (`trackX(input) → { run, end(outcome) }`),
not a callback `trackOperation(input, fn)`. Reason: every existing signal uses it, the noop already
shares one frozen tracker (zero allocation), and the tool-call outcome is computed *from the result*
(status / errorKind), which a callback wrapper would have to re-derive anyway.
