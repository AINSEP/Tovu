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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-11 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/website/src/server/inbound/shared/route-guards.ts | lines 97.14 br 88.89 fn 50.0 | uncovered lines: 30
- apps/website/src/server/inbound/shared/serving-origin.ts | lines 96.0 br 92.86 fn 60.0 | uncovered lines: 18
- apps/website/src/server/routes/route-deps/credentials-deps.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/routes/types.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/runtime/boot/agent-daemon-wanted.ts | lines 68.29 br 100.0 fn 0.0 | uncovered lines: 29-30,33-43
- apps/website/src/server/runtime/boot/boot-readiness-gate.ts | lines 100.0 br 37.5 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/boot/boot-readiness-warnings.ts | lines 99.09 br 96.3 fn 55.56 | uncovered lines: 98
- apps/website/src/server/runtime/boot/bootstrap.ts | lines 87.19 br 75.81 fn 85.71 | uncovered lines: 54-55,67-70,129-130,132-133,137-145,174-175,178-179,196-198,393-394,397-402,406-415,419-425
- apps/website/src/server/runtime/boot/content-db-schema-guard.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/runtime/boot/local-owner-signin.ts | lines 99.36 br 98.95 fn 72.0 | uncovered lines: 165
- apps/website/src/server/runtime/boot/mail-delivery-policy.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/boot/mail-plugin-account-token.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/boot/mail-provider-catalog.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/boot/parent-watchdog-report.ts | lines 81.82 br 100.0 fn 100.0 | uncovered lines: 3-7,9
- apps/website/src/server/runtime/boot/process-error-guards.ts | lines 99.35 br 78.95 fn 87.5 | uncovered lines: 151
- apps/website/src/server/runtime/boot/production-readiness-gate.ts | lines 94.0 br 100.0 fn 100.0 | uncovered lines: 1-8,181
- apps/website/src/server/runtime/boot/resolve-mailer.ts | lines 100.0 br 100.0 fn 95.45 | uncovered lines: 
- apps/website/src/server/runtime/boot/site-boot-readiness.ts | lines 41.3 br 100.0 fn 100.0 | uncovered lines: 1-26,28
- apps/website/src/server/runtime/boot/site-daemon-listener.ts | lines 47.62 br 100.0 fn 0.0 | uncovered lines: 21-42
- apps/website/src/server/runtime/boot/site-key-boot-notice.ts | lines 94.85 br 50.0 fn 100.0 | uncovered lines: 89-93,112-113
- apps/website/src/server/runtime/boot/site-listener-origin.ts | lines 80.77 br 100.0 fn 100.0 | uncovered lines: 1-5
- apps/website/src/server/runtime/composition/admin-assistant-enabled.ts | lines 43.75 br 100.0 fn 100.0 | uncovered lines: 1-23,25-27,43
- apps/website/src/server/runtime/composition/agent-daemon-core-deps.ts | lines 98.88 br 82.14 fn 75.0 | uncovered lines: 1
- apps/website/src/server/runtime/composition/agent-pause-gate.ts | lines 100.0 br 91.3 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/agent-pause-tools.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/agent-plugin-connections.ts | lines 100.0 br 93.33 fn 89.29 | uncovered lines: 
- apps/website/src/server/runtime/composition/agent-plugin-service-ports.ts | lines 100.0 br 89.66 fn 76.92 | uncovered lines: 
- apps/website/src/server/runtime/composition/agent-plugin-uninstall-host.ts | lines 74.07 br 100.0 fn 100.0 | uncovered lines: 1-6,28
- apps/website/src/server/runtime/composition/analytics-providers.ts | lines 87.36 br 100.0 fn 22.22 | uncovered lines: 46-49,57-63
- apps/website/src/server/runtime/composition/app.ts | lines 97.38 br 89.8 fn 76.92 | uncovered lines: 32,71,99,103,210-211,310,324,370-374
- apps/website/src/server/runtime/composition/asset-tool-host.ts | lines 91.76 br 100.0 fn 10.71 | uncovered lines: 1-4,39-40,84
- apps/website/src/server/runtime/composition/assistant-history-tools.ts | lines 85.71 br 100.0 fn 60.0 | uncovered lines: 17-18,22-23
- apps/website/src/server/runtime/composition/authoritative-dns.ts | lines 71.88 br 100.0 fn 100.0 | uncovered lines: 1-9
- apps/website/src/server/runtime/composition/boot-data-repairs.ts | lines 100.0 br 100.0 fn 33.33 | uncovered lines: 
- apps/website/src/server/runtime/composition/browser-analytics-http.ts | lines 33.33 br 100.0 fn 12.5 | uncovered lines: 1,13-16,23-29,33-44,46-52,55,57-64,67,69-75
- apps/website/src/server/runtime/composition/browser-analytics.ts | lines 84.85 br 57.14 fn 75.0 | uncovered lines: 1,16-18,26
- apps/website/src/server/runtime/composition/build-constants.ts | lines 86.52 br 91.67 fn 100.0 | uncovered lines: 1-12
- apps/website/src/server/runtime/composition/build-release.ts | lines 98.11 br 95.65 fn 100.0 | uncovered lines: 52
- apps/website/src/server/runtime/composition/built-in-plugin-sources.ts | lines 91.67 br 100.0 fn 100.0 | uncovered lines: 10
- apps/website/src/server/runtime/composition/chart-providers.ts | lines 98.28 br 88.24 fn 100.0 | uncovered lines: 1
- apps/website/src/server/runtime/composition/charts-recharts-source.ts | lines 99.26 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/server/runtime/composition/collection-list-warnings.ts | lines 96.43 br 87.5 fn 50.0 | uncovered lines: 27
- apps/website/src/server/runtime/composition/commerce-drain.ts | lines 85.71 br 66.67 fn 100.0 | uncovered lines: 3
- apps/website/src/server/runtime/composition/commerce-http.ts | lines 95.08 br 91.67 fn 85.71 | uncovered lines: 1,53-54
- apps/website/src/server/runtime/composition/commerce-worker.ts | lines 100.0 br 77.78 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/commerce.ts | lines 88.58 br 83.04 fn 84.21 | uncovered lines: 1,65-69,261-262,270-273,287-294,354-363,381-383,416-426,454-458
- apps/website/src/server/runtime/composition/content-events.ts | lines 100.0 br 88.46 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/content-target-inputs.ts | lines 100.0 br 87.5 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/create-app-options.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/runtime/composition/credentials-host-ports.ts | lines 100.0 br 100.0 fn 42.86 | uncovered lines: 
- apps/website/src/server/runtime/composition/data-modules.ts | lines 96.55 br 100.0 fn 100.0 | uncovered lines: 1-2
- apps/website/src/server/runtime/composition/declared-content-types.ts | lines 97.44 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/server/runtime/composition/deps.ts | lines 91.76 br 87.1 fn 64.0 | uncovered lines: 202,246-265
- apps/website/src/server/runtime/composition/dns-change-deps.ts | lines 86.67 br 100.0 fn 100.0 | uncovered lines: 1-9,73
- apps/website/src/server/runtime/composition/doc-render-host.ts | lines 100.0 br 83.33 fn 66.67 | uncovered lines: 
- apps/website/src/server/runtime/composition/domain-dns-adapters.ts | lines 100.0 br 98.46 fn 96.15 | uncovered lines: 
- apps/website/src/server/runtime/composition/error-reporter.ts | lines 87.85 br 54.55 fn 76.92 | uncovered lines: 1-10,90-92
- apps/website/src/server/runtime/composition/form-delivery-deliverer.ts | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/form-delivery.ts | lines 100.0 br 75.0 fn 90.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/form-submissions.ts | lines 99.2 br 96.67 fn 86.96 | uncovered lines: 61-62
- apps/website/src/server/runtime/composition/host-signals.ts | lines 100.0 br 75.0 fn 50.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/http-app/module-handles.ts | lines 50.0 br 100.0 fn 100.0 | uncovered lines: 1-3,12,15,20-28
- apps/website/src/server/runtime/composition/http-app/mount-admin-data.ts | lines 91.67 br 100.0 fn 100.0 | uncovered lines: 1-4
- apps/website/src/server/runtime/composition/http-app/mount-admin-features.ts | lines 97.06 br 100.0 fn 50.0 | uncovered lines: 1-4
- apps/website/src/server/runtime/composition/http-app/mount-admin-system.ts | lines 95.29 br 85.71 fn 77.36 | uncovered lines: 2-6,312-319,329-331
- apps/website/src/server/runtime/composition/http-app/mount-assistant.ts | lines 95.5 br 45.45 fn 33.33 | uncovered lines: 1-5
- apps/website/src/server/runtime/composition/http-app/mount-core-content.ts | lines 87.8 br 100.0 fn 100.0 | uncovered lines: 1-5
- apps/website/src/server/runtime/composition/http-app/mount-members-newsletter.ts | lines 96.19 br 100.0 fn 100.0 | uncovered lines: 1-4
- apps/website/src/server/runtime/composition/http-app/mount-public-site.ts | lines 94.95 br 100.0 fn 50.0 | uncovered lines: 1-5
- apps/website/src/server/runtime/composition/http-app/public-middleware.ts | lines 96.55 br 94.74 fn 88.89 | uncovered lines: 1-4
- apps/website/src/server/runtime/composition/http-app/visitor-submit.ts | lines 88.52 br 100.0 fn 50.0 | uncovered lines: 1-5,101-103,113-118
- apps/website/src/server/runtime/composition/import-database/repo.sqlite.ts | lines 99.48 br 77.61 fn 93.1 | uncovered lines: 197
- apps/website/src/server/runtime/composition/installed-extension-tools.ts | lines 77.97 br 96.3 fn 100.0 | uncovered lines: 1-26
- apps/website/src/server/runtime/composition/mail-capture-clear-planner.ts | lines 94.44 br 100.0 fn 100.0 | uncovered lines: 15
- apps/website/src/server/runtime/composition/memory-deps/create-route-deps-options.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/runtime/composition/memory-deps/route-deps/assistant-and-site.ts | lines 100.0 br 100.0 fn 75.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/memory-deps/route-deps/context.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/runtime/composition/memory-deps/route-deps/members-media-newsletter-forms.ts | lines 100.0 br 75.0 fn 83.33 | uncovered lines: 
- apps/website/src/server/runtime/composition/memory-deps/route-deps/model-comments-plugins.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/memory-deps/route-deps/publish-export.ts | lines 100.0 br 93.33 fn 75.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/memory-deps/route-deps/trash-and-content.ts | lines 99.15 br 81.25 fn 75.0 | uncovered lines: 61-62
- apps/website/src/server/runtime/composition/memory-deps/slices/agent-plugins.ts | lines 90.91 br 100.0 fn 50.0 | uncovered lines: 20-22
- apps/website/src/server/runtime/composition/memory-deps/slices/form-attachment-purge.ts | lines 69.35 br 83.33 fn 60.0 | uncovered lines: 42-51,59-67
- apps/website/src/server/runtime/composition/memory-deps/slices/memory-trash.ts | lines 100.0 br 85.71 fn 71.43 | uncovered lines: 
- apps/website/src/server/runtime/composition/memory-deps/slices/publish-apply.ts | lines 98.55 br 100.0 fn 50.0 | uncovered lines: 67
- apps/website/src/server/runtime/composition/memory-deps/slices/trash-adapters-content.ts | lines 92.37 br 100.0 fn 84.0 | uncovered lines: 84-86,92-94,116-118
- apps/website/src/server/runtime/composition/memory-deps/slices/trash-adapters-forms-widgets.ts | lines 87.5 br 100.0 fn 64.29 | uncovered lines: 27-32,81-82,107-110,114-115
- apps/website/src/server/runtime/composition/modules/agent-daemon-core-rpc.ts | lines 84.51 br 80.39 fn 85.71 | uncovered lines: 1,65,70-84,86,88-91
- apps/website/src/server/runtime/composition/modules/agent-plugin-install-route.ts | lines 77.42 br 100.0 fn 25.0 | uncovered lines: 28-33,41-44,50-53
- apps/website/src/server/runtime/composition/modules/agent-plugin-memory-routes.ts | lines 100.0 br 92.31 fn 90.91 | uncovered lines: 
