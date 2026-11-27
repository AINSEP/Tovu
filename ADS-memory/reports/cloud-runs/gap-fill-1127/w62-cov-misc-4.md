BOOTSTRAP: dispatched job. This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.

ROLE: you are the TDD agent doing a coverage GAP FILL. Read first: /Users/la/Programming/Tovu/AI-Dev-Shop/agents/tdd/skills.md, then the skills it lists for writing tests: AI-Dev-Shop/skills/test-design/SKILL.md, AI-Dev-Shop/skills/adversarial-test-design/references/testing-mistakes.md (lines 1-192: The One Question, the "What I'm about to test" index, Author Checklist; then the entries for what you test), AI-Dev-Shop/skills/coding-foundations/SKILL.md, AI-Dev-Shop/skills/testable-design-patterns/SKILL.md, and AI-Dev-Shop/harness-engineering/quality/coverage-integrity-policy.md (all under /Users/la/Programming/Tovu/). There is no spec/ADR for this work: skip spec-hash/ADR/CIC certification steps; follow the gap-fill path (step 4a).

GOAL: owner target is 100% lines/branches/functions per file. Write HIGH-QUALITY tests that cover the uncovered lines listed below. A test exists to catch a real break, not to raise a number.

HARD - NO RUNNING (owner: running tests here could take down the machine): do NOT run tests, test suites, builds, installs, typechecks of the tests tsconfig, coverage, or mutation runs. This clone has no node_modules; do not install. An Opus cloud run tests and fixes everything after you, so write code that you are confident compiles: check imports, exported names and types by reading the source.
HARD - NO REPO-WIDE SEARCH: no git grep / rg / find over the whole repo. Search only inside the target file's own package or app folder (e.g. `git grep -l <name> -- packages/cms/`), or read exact files.
DO NOT TOUCH: packages/commerce, packages/user-management, packages/integrations (other jobs own them), packages/admin/src/pages/PageEditorChrome.tsx and its tests, coverage configs, thresholds, guard baselines, ratchets.

FOR EACH FILE in the list:
1. Read the source and its existing tests (same folder / __tests__ next to it). Extend an existing test file when it fits; else add a new one that matches the neighbours' runner, location and naming (Jini = vitest; Tovu website/desktop = node:test + node:assert as the neighbours do; Tovu admin = vitest + Testing Library).
2. Cover the listed uncovered lines/branches/functions through the file's real behaviour: outputs, state changes, errors with their messages, calls to INJECTED ports with exact args. Every branch named by an `if`/`??`/`?:` gets the case that takes it.
3. For every new test, record in COMMIT-PLAN.md (repo root, not committed): file:test -> the mutation in the source that must turn it red. Do not run it.
4. Run the Author Checklist on every new test before moving on.
RULES: never vi.mock / mock.module the module under test; prefer real in-memory implementations and injected fakes over module mocks; reuse the package's existing test helpers and fixtures. No snapshot-only tests; no `toBeDefined`/`not.toThrow`/`ok(x)` as the only assertion; no test that only imports a file to bump coverage. No skips, no `.only`, no ts-ignore/expect-error, no `as any`. Never edit an existing assertion to be weaker.
PRODUCTION CODE: do not change it. If a test you write proves a real bug, keep that test (it will be red), and report BUG <file:line> + what is wrong + the fix you propose.
NOT WORTH TESTING: if a line truly cannot be meaningfully tested (type-only module, pure re-export barrel, process entry point), do not write a fake test: list it as EXCEPTION <file:lines> + one-line reason. Data tables (i18n dictionaries, catalogs) ARE testable: assert real invariants (every locale has every key of the source locale, no empty values, placeholders preserved).
Work through the whole list; if you run low on context, finish the file you are on and write the report.

REPORT (final message, <= 700 words): files done (tests added per file), files SKIPPED-ALREADY-COVERED (with the existing test that covers them), EXCEPTION list, BUG list, files left and why, new test files created.

REPO: Jini only. HEAD = codex/w62-cov-misc-4 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/daemon/src/routines/migrations/index.ts | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- packages/daemon/src/routines/routine-errors.ts | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- packages/daemon/src/routines/routine-store.sqlite.ts | lines 87.92 br 74.76 fn 80.0 | uncovered lines: 21,35-45,51-53,202-206,208-210,226-227
- packages/daemon/src/routines/routine-store.ts | lines 97.26 br 97.62 fn 90.91 | uncovered lines: 268-271
- packages/daemon/src/routines/scheduler.ts | lines 99.71 br 88.83 fn 100.0 | uncovered lines: 190
- packages/daemon/src/run-tool-consent.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/daemon/src/surface-exchanges.ts | lines 100.0 br 99.33 fn 100.0 | uncovered lines: 
- packages/daemon/src/surface-exchanges/human-confirm.ts | lines 71.91 br 82.5 fn 80.0 | uncovered lines: 40-42,122,130,137-153,157-159
- packages/daemon/src/surface-exchanges/site-assistant-confirm.ts | lines 100.0 br 96.43 fn 100.0 | uncovered lines: 
- packages/daemon/src/surface-restoration.ts | lines 95.0 br 75.81 fn 89.47 | uncovered lines: 105,107-111
- packages/daemon/src/tool-access-lowering.ts | lines 100.0 br 97.06 fn 100.0 | uncovered lines: 
- packages/daemon/src/tool-recovery/observability.ts | lines 100.0 br 96.34 fn 100.0 | uncovered lines: 
- packages/daemon/src/tool-recovery/surface-lifetime.ts | lines 100.0 br 92.31 fn 100.0 | uncovered lines: 
- packages/daemon/src/tool-result-media.ts | lines 95.45 br 98.31 fn 100.0 | uncovered lines: 145-147
- packages/desktop-host/src/app-version/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2
- packages/desktop-host/src/app-version/loader.ts | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- packages/desktop-host/src/electron/electron-url-capture.ts | lines 98.65 br 94.32 fn 100.0 | uncovered lines: 70-71
- packages/desktop-host/src/electron/partitions/cache-maintenance.ts | lines 99.4 br 83.67 fn 100.0 | uncovered lines: 162
- packages/desktop-host/src/electron/partitions/holder-registry.ts | lines 90.0 br 85.37 fn 88.24 | uncovered lines: 86-88,119-121,126,128-130
- packages/desktop-host/src/electron/partitions/maintenance-marker.ts | lines 100.0 br 82.98 fn 100.0 | uncovered lines: 
- packages/desktop-host/src/electron/partitions/partition-pass.ts | lines 98.13 br 78.79 fn 100.0 | uncovered lines: 117,189,246-248
- packages/desktop-host/src/electron/partitions/partition-root.ts | lines 97.22 br 80.95 fn 100.0 | uncovered lines: 50
- packages/desktop-host/src/electron/partitions/profile-interlock.ts | lines 94.74 br 87.16 fn 94.29 | uncovered lines: 112-115,149-151,155,175,237
- packages/desktop-host/src/electron/partitions/retirement-ledger.ts | lines 100.0 br 96.55 fn 100.0 | uncovered lines: 
- packages/desktop-host/src/electron/selftest/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2
- packages/desktop-host/src/electron/updates/instance-presence-strict.ts | lines 93.75 br 55.0 fn 100.0 | uncovered lines: 57-58
- packages/desktop-host/src/logging.ts | lines 92.63 br 98.25 fn 100.0 | uncovered lines: 42-48
- packages/desktop-host/src/node-toolchain/install-location.ts | lines 100.0 br 100.0 fn 60.0 | uncovered lines: 
- packages/desktop-host/src/shell/node-toolchain.ts | lines 100.0 br 100.0 fn 92.31 | uncovered lines: 
- packages/desktop-host/src/shell/speech/speech-ipc.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/desktop-host/src/shutdown/last-window-quit.ts | lines 100.0 br 97.22 fn 100.0 | uncovered lines: 
- packages/desktop-host/src/sidecar.ts | lines 100.0 br 98.53 fn 100.0 | uncovered lines: 
- packages/desktop-host/src/tauri/tauri-sidecar.ts | lines 100.0 br 97.78 fn 100.0 | uncovered lines: 
- packages/diagnostics/src/browser-diagnostics.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/diagnostics/src/memory-growth.ts | lines 100.0 br 98.0 fn 100.0 | uncovered lines: 
- packages/diagnostics/src/observability/errors.ts | lines 100.0 br 81.82 fn 100.0 | uncovered lines: 
- packages/diagnostics/src/observability/fanout.ts | lines 96.77 br 98.77 fn 86.96 | uncovered lines: 72-74
- packages/diagnostics/src/observability/hooks.ts | lines 100.0 br 95.65 fn 100.0 | uncovered lines: 
- packages/diagnostics/src/observability/instrumentation.ts | lines 36.84 br 100.0 fn 45.45 | uncovered lines: 74-83,96-113,115-119,128-133,141-150,155-165
- packages/diagnostics/src/observability/node.ts | lines 66.67 br 100.0 fn 0.0 | uncovered lines: 14-16
- packages/diagnostics/src/observability/otel.ts | lines 69.23 br 66.67 fn 66.67 | uncovered lines: 40,42-48
- packages/diagnostics/src/observability/tracker.ts | lines 100.0 br 95.0 fn 100.0 | uncovered lines: 
- packages/diagnostics/src/redaction/repo-secret-scan.node.ts | lines 96.6 br 80.0 fn 100.0 | uncovered lines: 24-25,192-194
- packages/diagnostics/src/redaction/repo-secret-scan.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/diagnostics/src/redaction/secret-scan.ts | lines 100.0 br 60.0 fn 100.0 | uncovered lines: 
- packages/diagnostics/src/web-evidence/agent-tools.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 30,32-36,53-67,69-75,80-88,90-94
- packages/diagnostics/src/web-evidence/live-url.ts | lines 97.78 br 93.88 fn 100.0 | uncovered lines: 113-114,121
- packages/diagnostics/src/web-evidence/playwright-page-capture.ts | lines 100.0 br 96.3 fn 96.88 | uncovered lines: 
- packages/diagnostics/src/web-evidence/published-page.ts | lines 97.47 br 97.06 fn 100.0 | uncovered lines: 199-200
- packages/diagnostics/src/web-evidence/web-screenshot/tool-registrations.ts | lines 100.0 br 58.33 fn 100.0 | uncovered lines: 
- packages/http-kit/src/adapter-request.ts | lines 100.0 br 98.0 fn 100.0 | uncovered lines: 
- packages/http-kit/src/adapter.ts | lines 99.07 br 95.83 fn 100.0 | uncovered lines: 199-200
- packages/http-kit/src/deferred-body.ts | lines 100.0 br 85.29 fn 100.0 | uncovered lines: 
- packages/http-kit/src/dev-proxy.ts | lines 100.0 br 97.92 fn 100.0 | uncovered lines: 
- packages/http-kit/src/html-response.ts | lines 100.0 br 89.09 fn 100.0 | uncovered lines: 
- packages/http-kit/src/node-bridge.ts | lines 97.07 br 88.57 fn 100.0 | uncovered lines: 369-370,469-473
- packages/http-kit/src/range.ts | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- packages/http-kit/src/raw-route.ts | lines 94.44 br 90.0 fn 100.0 | uncovered lines: 112-114,217-218,235-237,245
- packages/http-kit/src/request.ts | lines 100.0 br 90.91 fn 100.0 | uncovered lines: 
- packages/infra/src/events/domain-outbox.ts | lines 100.0 br 96.77 fn 100.0 | uncovered lines: 
- packages/infra/src/events/memory-bus.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/infra/src/events/outbox/worker.ts | lines 100.0 br 97.54 fn 100.0 | uncovered lines: 
- packages/node-adapters/src/agent-plugins.ts | lines 100.0 br 100.0 fn 90.0 | uncovered lines: 
- packages/oauth/src/discovery.ts | lines 100.0 br 99.05 fn 100.0 | uncovered lines: 
- packages/protocol/src/a2ui/common-types.ts | lines 95.0 br 100.0 fn 66.67 | uncovered lines: 81-84
- packages/provider-plugins/src/analytics-posthog/browser.ts | lines 100.0 br 91.67 fn 87.5 | uncovered lines: 
- packages/provider-plugins/src/analytics-posthog/consent-adapter.ts | lines 100.0 br 98.77 fn 100.0 | uncovered lines: 
- packages/provider-plugins/src/analytics-posthog/posthog.ts | lines 100.0 br 97.87 fn 77.78 | uncovered lines: 
- packages/provider-plugins/src/charts-echarts/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3
- packages/provider-plugins/src/charts-echarts/mount.ts | lines 100.0 br 96.0 fn 100.0 | uncovered lines: 
- packages/provider-plugins/src/charts-echarts/option.ts | lines 100.0 br 97.14 fn 100.0 | uncovered lines: 
- packages/provider-plugins/src/charts-recharts/descriptor.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/provider-plugins/src/charts-recharts/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3
- packages/provider-plugins/src/formspree/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,4-8
- packages/provider-plugins/src/formspree/provider.ts | lines 77.78 br 80.0 fn 66.67 | uncovered lines: 9-12
- packages/provider-plugins/src/google-forms/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,4-8
- packages/provider-plugins/src/model-proxy-anthropic/index.ts | lines 94.12 br 66.67 fn 100.0 | uncovered lines: 31-32
- packages/provider-plugins/src/model-proxy-azure/index.ts | lines 87.5 br 50.0 fn 100.0 | uncovered lines: 25-26,29-30
- packages/provider-plugins/src/model-proxy-google/index.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/provider-plugins/src/observability-opentelemetry/index.ts | lines 95.65 br 97.87 fn 100.0 | uncovered lines: 100-103
- packages/provider-plugins/src/observability-opentelemetry/opentelemetry.ts | lines 100.0 br 98.96 fn 100.0 | uncovered lines: 
- packages/provider-plugins/src/observability-sentry/configuration.ts | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- packages/provider-plugins/src/observability-sentry/sentry.ts | lines 100.0 br 94.87 fn 100.0 | uncovered lines: 
- packages/provider-plugins/src/xai/index.ts | lines 94.44 br 100.0 fn 85.71 | uncovered lines: 11-12
- packages/registry/src/tool-catalog-builder/input-signature.ts | lines 100.0 br 91.38 fn 100.0 | uncovered lines: 
- packages/registry/src/tool-catalog-builder/scoped-query.ts | lines 99.06 br 84.21 fn 100.0 | uncovered lines: 133
- packages/sandbox/src/e2b/provider.ts | lines 100.0 br 97.5 fn 100.0 | uncovered lines: 
- packages/sandbox/src/e2b/wrap-e2b-sandbox.ts | lines 99.67 br 98.57 fn 100.0 | uncovered lines: 369
- packages/sandbox/src/node-worker/per-call-runner.ts | lines 97.83 br 91.67 fn 100.0 | uncovered lines: 116
- packages/search/src/public-http/routes/site/search.ts | lines 96.55 br 79.41 fn 100.0 | uncovered lines: 116-117
