<<SUBAGENT_DISPATCH>>
# Observability run 2 — adapters OUT of core into provider plugins + PostHog behind an analytics contract (owner 2026-10-25)
Owner decisions (2026-10-25, by name): "the adapter … for OpenTelemetry should be a provider plugin. There's no way it should be in core, because we're gonna want to use it for other projects." And: "since PostHog is free, let's just use that, but it has to be an adapter so we can swap it out later." Prototype on branches; nothing merges. No human is watching: verify by measuring, never ask.

## Start from run 1
Run 1 (same branches) built: a vendor-neutral `ObservabilityPort` extension in Jini diagnostics (operations + error reporting), the assistant tool-call path instrumented through it, an OpenTelemetry adapter and a Sentry adapter, and `OBSERVABILITY-PLAN.md`. READ `ADS-memory/reports/cloud-runs/2026-10-25-observability/{REPORT.md,OBSERVABILITY-PLAN.md,BRIEF.md}` first. If run 1's REPORT.md is missing or says it stopped early, build on whatever it pushed and say so.

## THE WORK
1. **Find how provider plugins are built today** (e.g. email/mail providers, commerce Stripe/LiPay, DNS providers — search `provider plugin`, `extensions.`, `content/agent-plugins/`, `features/plugins/`). Follow that exact pattern; do not invent a new plugin mechanism.
2. **Move the OpenTelemetry adapter out of Tovu core** (`apps/website/src/platform/observability/otel.ts` and run 1's additions) and **the Sentry adapter** into provider plugins that satisfy the Jini port. Core keeps only the port + noop + selection-by-config. Callers don't change. Disabled stays zero-cost (no SDK load). Keep every "why" comment (move, never delete). Boundary test: nothing in core imports `@opentelemetry/*` or `@sentry/*`.
3. **Product analytics contract + PostHog provider plugin.** First check what exists: Jini `packages/analytics` and Tovu `features/analytics` (that's site-visitor analytics for customers' sites). Decide and document whether product analytics (how people use Tovu: events, identify, maybe feature flags) is a new contract or an extension of the existing one — smallest correct answer. Vendor-neutral names (`track`, `identify`, …). PostHog adapter (`posthog-node` server-side; note what the browser side would need) as a provider plugin, lazily loaded only when its key is configured; **consent-gated** (respect Tovu's existing consent system for anything that needs it); PII redaction (reuse Jini `core/src/redact.ts`).
4. **Instrument ONE flow** with product analytics (pick a high-value owner flow: e.g. site created → first page → first publish, or assistant chat started → tool succeeded/failed). Swap proof: same scenario against noop / PostHog (test transport, no network) asserting equivalent events.
5. **Update `OBSERVABILITY-PLAN.md`**: where each adapter lives now, how another project reuses them (the owner's reason), PostHog vs Sentry overlap (PostHog also does error tracking + session replay) and a recommendation, consent/PII rules, rollout order.

## SETUP / BRANCHES
`hostname && nproc`. Node 24 + Tovu setup per `git show origin/cloud/overnight-1024-tovu:ADS-memory/reports/cloud-runs/2026-10-25-overnight/COMMON.md`. Jini: `git clone --branch cloud/observability-1025-jini https://github.com/AINSEP/Jini.git /root/Jini` (fall back to `cloud/overnight-1024-jini` if run 1 never pushed it). Tovu: this branch `cloud/observability-1025-tovu`. Rebuild touched Jini packages; `JINI_PACKAGES_DIR=/root/Jini/packages npm run link:jini`.
Verify: `tsc --noEmit -p` per touched Jini package + Tovu root `tsc -p tsconfig.json`; touched + existing tests of touched files (vitest `--maxWorkers=2`; node --test `--test-concurrency=1 --experimental-test-module-mocks`); `npx eslint --rule 'complexity: ["error", 10]' <files>`. Owner rules: API args `(requiredObj, optionalObj = {})`, deps as ports, CCN ≤ 10, smallest change, generic → Jini, vendor code only in plugins.

## HARD CAPS (first hit → stop, write the report, push, END)
- 3 h wall clock (at 2 h 40 m stop new work). ~1.5M tokens. No subagents.
- Never push main, never force-push, never npm publish, never create/update/run any RemoteTrigger, never self-reschedule. Push only to Tovu `cloud/observability-1025-tovu` and Jini `cloud/observability-1025-jini` (`git pull --rebase` first). Commit + push after each step.
- No real keys/DSNs; no network to PostHog, Sentry or a collector.

## REPORT
`ADS-memory/reports/cloud-runs/2026-10-25-observability/REPORT-2.md`: commits per repo, before/after, test + tsc numbers, swap proofs, top 3 owner questions, what it does NOT cover. End with "OBS2 DONE <UTC>", wall, rough tokens.
