<<SUBAGENT_DISPATCH>>
# PROVIDER-PLUGIN SET WAVE 2 + observability wiring (owner approved 2026-10-25 ~3:25 PM PT). Unattended: verify by measuring, never ask.

Goal: move the vendor adapters OUT of Jini core packages into first-party PROVIDER PLUGINS (`Jini/packages/provider-plugins`, one asset distribution `@jini-ai/provider-plugins`, regular code plugins on `@jini-ai/plugins`), wire Tovu to load them, and instrument Tovu's chokepoints. Wave 1 (already on your base) built the plugin host extension (`contributes.providers`, `sdk.providers.register`, generation retirement/disposal, init timeout), the pack pipeline (self-contained `server/index.mjs` + integrity map + licenses), neutral AI-trace core and observability/analytics core fixes (consent revision, fan-out isolation, trace finalization).

Owner rules: Opus builds this; Codex will check it after; smallest change (agents overbuild — no speculative abstractions); API args `(requiredObj, optionalObj = {})`; single-object port inputs; CCN ≤ 10; MOVE "why" comments, never delete them; NO vendor code in Jini core or Tovu core; Jini core keeps ports + noop + fan-out + guards only; tests use DI fakes, never live vendor calls; analytics only after consent; every event carries `user.id` (opaque principal id); analytics `capture({ name, properties, userId })` stays GENERIC (no per-event union).

## READ FIRST
- Design: `ADS-memory/reports/cloud-runs/2026-10-25-provider-wave2/PROVIDER-SET-PLAN.md` (this branch). Steps 0–2, 5a/5b are DONE in wave 1. YOUR steps: 3, 4, 6, Stripe MOVE ONLY (conversion to the commerce contract is DEFERRED by the owner — move the code into a plugin, do not convert, do not activate payments), 8 (Tovu side only — OM adoption is OM's own work), and the guard/regression rows for those steps.
- Setup: `ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md` and, from `origin/cloud/overnight-1024-tovu`, `ADS-memory/reports/cloud-runs/2026-10-25-overnight/COMMON.md` (Node 24, Tovu/Jini install + link, test commands, known failures).
- Test anti-patterns: `ADS-memory/reports/cloud-runs/2026-10-25-fixwave/TEST-ANTIPATTERNS.md` on `origin/cloud/fixwave-1025-reports`.
- Reference only (do NOT merge): Tovu `origin/cloud/observability-1025-tovu` (current subpath-based OTel/Sentry/PostHog wiring in `apps/website/src/platform/observability/`) and `origin/cloud/ai-tracing-1025-tovu` (Langfuse wiring notes). Replace their subpath loading with configured provider-plugin selection.

## BASES / BRANCHES
- Jini: start from `origin/cloud/prov-wave2-base` → push to Jini `cloud/prov-wave2-jini`.
- Tovu: start from `origin/cloud/prov-wave2-base` → push to Tovu `cloud/prov-wave2-tovu`. Reports → Tovu `cloud/prov-wave2-tovu` under `ADS-memory/reports/cloud-runs/2026-10-25-provider-wave2/`.
- If a Jini push is refused (403): `git format-patch` into the report folder and say so at the top.

## ORDER OF WORK (stop at the cap wherever you are; commit + push after each numbered step)
0. Two required fixes from Codex's last check of the base (Jini, packages/daemon) — test first, smallest fix:
   a. ai-trace-lifecycle.ts ~:100 — tracing can REOPEN after dispose: call start(), then dispose() before the underlying start resolves; the continuation still calls open(), creating a recorder + subscription after cleanup. Check teardown state before opening; test disposal during a pending start.
   c. (packages/infra) events/outbox/fenced-conformance.ts ~:49 — if a subject's `awaitOverlap` throws SYNCHRONOUSLY, `pending.catch()` is skipped → unhandled reservation rejection + contender never rolled back. Fix exactly: invoke the hook via `Promise.resolve().then(() => awaitOverlap.call(...)).then(resolve, reject)` so existing barrier-failure cleanup handles it; add a test. Also document `awaitOverlap` in packages/infra/README.md (incl. that the timer fallback can't prove overlap for slow concurrent hosts).
   b. run-lifecycle.ts ~:1102 — waitForTerminal() awaits record.startPromise before observing the abort signal; with an explicit run id and a stalled start append, abort (even pre-aborted) leaves the wait pending forever. Make that initial wait abortable while preserving start-failure propagation; test it.
   d. (packages/mcp) tool-server.wire.test.ts ~:439 — known failing case "does not publish failed, mismatched or malformed describes…": 74791593 deliberately made `inputSchema: null` mean a schema-less family (returned as info, not published); drop `null` from that test's malformed list (test-only change) and confirm the case passes.
   e. Tovu: after setup, run these auto-merged files' tests first and fix any real breakage (they could not run locally): apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts, public-site-guide.test.ts, and the suites covering ask-choice-tool.ts, automatic-agent-plugins.ts, admin-http/routes/content/deps.ts, public-http/routes/site/pages.ts, server/routes/types.ts, runtime/composition/deps.ts. Use the Jini base (linked), never published @jini-ai.
1. OTel + Sentry → `packages/provider-plugins/src/observability-opentelemetry` and `.../observability-sentry` (plan step 3, incl. Obs #1 error-label redaction regression). Remove vendor exports, SDK deps/peers and vendor tests from `@jini-ai/diagnostics`; neutral contracts/noop/fan-out stay.
2. PostHog → `.../analytics-posthog` (plan step 4: extract `validateEventProps` to a platform-neutral owner; browser-target import of product analytics works without Node shims). Remove vendor code from `@jini-ai/analytics`.
3. Langfuse → `.../ai-trace-langfuse` (plan step 6; Langfuse #10). Runtime core imports with Langfuse NOT installed.
4. Stripe → `.../payments-stripe` MOVE ONLY from `packages/capability-providers/src/adapters/stripe/**`; record in the plugin README that commerce's payment contract is canonical and conversion is deferred. Not registered/activated anywhere.
5. Each plugin: canonical manifest (tier-3, engine 1, version, integrity map, provider declaration, registration capability), self-contained bundle via the wave-1 pack pipeline, isolated packed install + load test WITHOUT vendor SDKs in core; SDK range must accept BOTH host ABIs (Tovu plugin SDK `0.1.0`, OM `1.0.0`). Core boundary scan: no vendor SDK import in any core package. Patch changesets.
6. Tovu: add `providers` to Tovu's public `packages/sdk` `PluginSdk` type; replace observability/analytics/AI-trace subpath loading with "installed + enabled + configured → load provider plugin, else noop"; composition order: provider plugins initialise (awaited, bounded) before app work; dispose on shutdown. Keys only via the plugin's secure settings card (never env-in-code, never chat). OTel exporter must accept a generic OTLP endpoint + headers (owner uses Grafana Cloud OTLP — no Grafana-specific code).
7. Tovu chokepoints: incoming HTTP requests, assistant runs → AI trace, publish/deploy, outbox/job queue — through the neutral ports; plus ≤ 8 `track()` one-liners on key owner actions via the admin hooks' existing dependency ports (consent-gated). Tests for each with fakes.
8. Measure: touched non-UI files → 100% lines+branches (list exceptions with reason); CCN ≤ 10 on touched files.

## TESTS
Run only touched packages' suites + the packed-install tests; Tovu: the touched node:test shards per COMMON.md. Never leave test processes running (kill your vitest/node --test/playwright by pid before stopping).

## HARD CAPS (first hit → stop new work, write the report, push, END — never "just finish")
- 5 h wall clock (at 4 h 30 m stop new work). ~2.5M tokens. No subagents.
- Never push main, never force-push, never npm publish, never create/update/run any RemoteTrigger, never self-reschedule. Kill by pid only. Never cat big logs/JSON whole. Small commits by explicit paths; messages end with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".
- Minor findings outside these steps: LIST them, don't fix them.

## REPORT — `ADS-memory/reports/cloud-runs/2026-10-25-provider-wave2/REPORT.md` (update + push after each step)
1. Headline: steps done / not done, plugins built, vendor imports left in core (must be 0 for done steps), tests added, packed-install results, coverage + CCN on touched files, wall, rough tokens. 2. BEFORE/AFTER per vendor (OTel, Sentry, PostHog, Langfuse, Stripe): where the code lived → where it lives now, how a host enables it. 3. Public API changes (Jini exports removed/added; Tovu SDK type) — OM reads this. 4. Tovu wiring map (chokepoint → port → plugin). 5. NOT done list. 6. Commits (Jini + Tovu). End with "WAVE2 DONE <UTC>", wall, rough tokens.
