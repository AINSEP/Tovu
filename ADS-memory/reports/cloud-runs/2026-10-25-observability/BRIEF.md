<<SUBAGENT_DISPATCH>>
# Observability adapter PROTOTYPE on one feature — OpenTelemetry + Sentry behind one swappable port (owner 2026-10-25)
Owner: "how would we have to refactor a feature to do an adapter for observability… OpenTelemetry, something new might come along later, I want an adapter so we can swap it out… and how would we do it for Sentry also… this is for later, how we need to refactor the whole thing." This is a **prototype on a branch + a plan**. Nothing merges. No human is watching: verify by measuring, never ask.

## What ALREADY exists (read these first — build on them, don't duplicate)
- Jini `packages/diagnostics/src/observability/` — `ObservabilityPort` (vendor-neutral, `trackRequest`, NO OTel types by design), noop port, `instrumentStorageKernel`, `trackFetch`, `trackHttpClient`. Read `ports.ts` + `noop.ts` comments.
- Tovu `apps/website/src/platform/observability/{index,config,otel}.ts` — OTel adapter, lazy `require`, only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; never registers a global tracer. ~10 features already import platform/observability.
- Groundwork survey: `ADS-memory/.local-artifacts/metrics/2026-08-28-observability-groundwork.md` if present in the clone (it may be gitignored — fine if absent).
- Jini `packages/core/src/primitives/logger.ts` (Logger contract), `packages/agent-runtime/src/telemetry-sink.ts`.

## Owner rules that shape the design (non-negotiable)
- Contracts + swappable provider plugins: generic contract in Jini, ONE default provider; **vendor code never in core** — every vendor SDK (OpenTelemetry SDK/exporters, `@sentry/*`) lives in an adapter that can be removed without touching callers. Flag explicitly whether today's `otel.ts` in Tovu core should move to a provider plugin, and how.
- Generic code → Jini; site/app-specific → Tovu. API args `(requiredObj, optionalObj = {})`, deps as ports. CCN ≤ 10. Smallest change; no overbuild. Refactors MOVE "why" comments, never delete them. Disabled observability must stay zero-cost (no SDK load, no allocation on the hot path).

## THE WORK
1. **Gap map** (short): what the port covers today, what it doesn't (errors/exceptions, feature-level operations, metrics, log correlation, user/session context, PII scrubbing/redaction — reuse Jini `core/src/redact.ts`).
2. **Port extension in Jini diagnostics** (vendor-neutral): add the smallest additions needed for (a) recording a feature-level operation (e.g. `trackOperation({ name, attributes }, fn)`) and (b) reporting an error with context (e.g. `reportError({ error, context })`) — names in this codebase's vocabulary, not OTel's/Sentry's. Noop stays zero-alloc. Unit tests.
3. **One feature, end to end:** the **assistant tool-call path** (where a delegated tool is executed: find `execute_delegated_tool` / the tool executor in apps/website/src/assistant + Jini). Every tool call becomes an operation (tool id, outcome, duration, input-validation vs execution error), and failures go through `reportError` with secrets redacted. Show the refactor the feature needs (inject the port, don't import an SDK). Tests with a fake port.
4. **Two adapters, same port, swappable by config:** (a) OpenTelemetry (extend the existing otel.ts: operations → spans, errors → span status + exception event); (b) **Sentry** (`@sentry/node`, transactions/spans + captureException) as a separate module, loaded lazily only when `SENTRY_DSN` is set. Prove the swap: one test suite runs the same feature scenario against fake/OTel(in-memory exporter)/Sentry(test transport, no DSN network) and asserts equivalent output. If both are set, document what happens (fan-out vs pick one) and pick the simplest.
5. **Whole-codebase plan** `OBSERVABILITY-PLAN.md`: the pattern for any feature (before/after code), the list of features in priority order with rough effort, where adapters should live (provider plugins), config/env, sampling, PII, cost/perf budget, and how a future system (or Datadog/Grafana via OTel Collector) slots in without touching features. Note Grafana/Datadog are OTel *backends* (no code adapter needed), Sentry is an error tracker with its own SDK.

## SETUP / BRANCHES
`hostname && nproc`. Node 24 + Tovu setup per `ADS-memory/reports/cloud-runs/2026-10-25-overnight/COMMON.md` (it's on branch cloud/overnight-1024-tovu: `git show origin/cloud/overnight-1024-tovu:ADS-memory/reports/cloud-runs/2026-10-25-overnight/COMMON.md`). Jini: `git clone --branch cloud/overnight-1024-jini https://github.com/AINSEP/Jini.git /root/Jini && cd /root/Jini && git checkout -b cloud/observability-1025-jini`. Tovu work on `cloud/observability-1025-tovu` (this branch). Rebuild touched Jini packages before Tovu tests; `JINI_PACKAGES_DIR=/root/Jini/packages npm run link:jini`.
Verify: `tsc --noEmit -p` for touched Jini packages and Tovu root `tsc -p tsconfig.json`; touched + existing tests of touched files (vitest `--maxWorkers=2`; node --test `--test-concurrency=1 --experimental-test-module-mocks`); complexity `npx eslint --rule 'complexity: ["error", 10]' <files>`.

## HARD CAPS (first hit → stop, write the report, push, END)
- 3 h wall clock (at 2 h 40 m stop new work, write up). ~1.5M tokens. Subagents: none.
- Never push main, never force-push, never npm publish, never create/update/run any RemoteTrigger, never self-reschedule. Push only to Tovu `cloud/observability-1025-tovu` and Jini `cloud/observability-1025-jini`. Commit + push after each step (1–5).
- No real network to Sentry or a collector; no real DSNs or keys anywhere.

## REPORT
`ADS-memory/reports/cloud-runs/2026-10-25-observability/REPORT.md` (+ `OBSERVABILITY-PLAN.md`): what changed (commits per repo), the before/after of the feature, test + tsc numbers, the swap proof, open questions for the owner (top 3), what this does NOT cover. End with "OBS DONE <UTC>", wall, rough tokens.
