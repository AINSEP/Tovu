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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-2 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/website/src/assistant/site/public-errors.ts | lines 100.0 br 78.57 fn 100.0 | uncovered lines: 
- apps/website/src/assistant/site/tools.ts | lines 80.0 br 67.65 fn 100.0 | uncovered lines: 1-47,150-152
- apps/website/src/assistant/site/visitor-ag-ui-resume.ts | lines 57.33 br 100.0 fn 10.0 | uncovered lines: 51-53,56-64,83-86,91-92,96-101,110-117,123,125-132,142,145-165,172
- apps/website/src/assistant/site/visitor-browser-invocation.ts | lines 79.59 br 86.67 fn 100.0 | uncovered lines: 1-9,42
- apps/website/src/assistant/site/visitor-confirmation-gate.ts | lines 100.0 br 92.86 fn 100.0 | uncovered lines: 
- apps/website/src/assistant/site/visitor-execution-ports.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/assistant/site/visitor-executor.ts | lines 97.75 br 91.67 fn 100.0 | uncovered lines: 3,123-125
- apps/website/src/assistant/site/visitor-frontend-control.ts | lines 99.22 br 83.67 fn 95.0 | uncovered lines: 1
- apps/website/src/assistant/site/visitor-page-tools.ts | lines 98.78 br 81.4 fn 100.0 | uncovered lines: 72
- apps/website/src/assistant/site/visitor-tool-presentation.ts | lines 81.4 br 100.0 fn 100.0 | uncovered lines: 3-10
- apps/website/src/assistant/site/visitor-tool-settings.ts | lines 95.0 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/assistant/site/visitor-turn-dedupe.ts | lines 72.0 br 76.19 fn 88.89 | uncovered lines: 1-27,29
- apps/website/src/assistant/subagent-settings.ts | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- apps/website/src/assistant/surface-answer.ts | lines 80.0 br 50.0 fn 50.0 | uncovered lines: 1-5,31-32
- apps/website/src/assistant/surface-route-host.ts | lines 58.82 br 100.0 fn 50.0 | uncovered lines: 1-7
- apps/website/src/assistant/tool-approval-policy.ts | lines 100.0 br 99.02 fn 95.83 | uncovered lines: 
- apps/website/src/assistant/tool-audit-preset.ts | lines 92.31 br 100.0 fn 100.0 | uncovered lines: 1,33
- apps/website/src/assistant/tool-catalog-principal-scope.ts | lines 78.38 br 100.0 fn 100.0 | uncovered lines: 1-8
- apps/website/src/assistant/tool-catalog-query.ts | lines 99.43 br 89.74 fn 100.0 | uncovered lines: 181
- apps/website/src/assistant/tool-contribution-registry.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/assistant/tool-gaps-tool.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- apps/website/src/assistant/tool-recovery-preset.ts | lines 95.19 br 96.3 fn 86.67 | uncovered lines: 1,95-96,100-101
- apps/website/src/assistant/tool-registrations.ts | lines 99.1 br 91.6 fn 97.87 | uncovered lines: 599-602
- apps/website/src/assistant/tool-search-keywords.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- apps/website/src/cli/commands/adopt.ts | lines 70.47 br 36.36 fn 33.33 | uncovered lines: 72-78,88-95,116-118,126-131,140-153,175-177,179-181,183-184,188-198
- apps/website/src/cli/commands/agent-plugin-tokens.ts | lines 92.16 br 64.29 fn 77.78 | uncovered lines: 47-48,59-62,92-93
- apps/website/src/cli/commands/deploy-config.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- apps/website/src/cli/commands/export.ts | lines 92.39 br 41.38 fn 100.0 | uncovered lines: 76-77,79-80,82-83,107-110,181-184
- apps/website/src/cli/commands/import-local.ts | lines 100.0 br 86.89 fn 84.21 | uncovered lines: 
- apps/website/src/cli/commands/init.ts | lines 95.12 br 86.36 fn 87.5 | uncovered lines: 121-122,129-130,132-133
- apps/website/src/cli/commands/introspect.ts | lines 95.12 br 50.0 fn 100.0 | uncovered lines: 42-43
- apps/website/src/cli/commands/owner-store-import.ts | lines 100.0 br 83.33 fn 86.67 | uncovered lines: 
- apps/website/src/cli/commands/owner-store-mapping.ts | lines 88.24 br 40.0 fn 100.0 | uncovered lines: 15-16
- apps/website/src/cli/commands/owner-store.ts | lines 100.0 br 78.24 fn 91.18 | uncovered lines: 
- apps/website/src/cli/commands/plugin/install.ts | lines 100.0 br 76.92 fn 100.0 | uncovered lines: 
- apps/website/src/cli/commands/reset-owner.ts | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- apps/website/src/cli/commands/serve-listen.ts | lines 49.0 br 80.0 fn 46.15 | uncovered lines: 36-39,54-81,84-100,103-139,142-156,197
- apps/website/src/cli/commands/serve.ts | lines 97.17 br 82.69 fn 94.74 | uncovered lines: 127-128,350-357
- apps/website/src/cli/commands/site-rename.ts | lines 100.0 br 66.67 fn 50.0 | uncovered lines: 
- apps/website/src/cli/commands/stdin-input.ts | lines 21.43 br 100.0 fn 0.0 | uncovered lines: 4-14
- apps/website/src/cli/commands/storage-maintenance.ts | lines 38.87 br 100.0 fn 0.0 | uncovered lines: 74-94,96-99,102-119,121-125,129-133,135-146,150-151,155-161,176-188,190-202,204-207,212-220,231-256,263-270,273-276
- apps/website/src/cli/commands/storage-program.ts | lines 75.0 br 75.0 fn 33.33 | uncovered lines: 50,69-71,78-79,84-99
- apps/website/src/cli/commands/storage-report.ts | lines 46.28 br 100.0 fn 0.0 | uncovered lines: 45-69,71-73,75-80,83-85,87-89,94-100,109-110,112-121,128-133
- apps/website/src/cli/commands/theme/migrate.ts | lines 95.77 br 90.0 fn 100.0 | uncovered lines: 55-57
- apps/website/src/cli/help.ts | lines 32.35 br 100.0 fn 100.0 | uncovered lines: 3-24,26
- apps/website/src/cli/introspect.ts | lines 60.61 br 100.0 fn 50.0 | uncovered lines: 1-10,34-36
- apps/website/src/cli/main.ts | lines 73.33 br 50.0 fn 100.0 | uncovered lines: 1,28-29,34-42
- apps/website/src/cli/program.ts | lines 98.37 br 88.89 fn 85.29 | uncovered lines: 45-47,152,303
- apps/website/src/contracts/core/agent-permission-mode.ts | lines 97.5 br 90.91 fn 33.33 | uncovered lines: 34
- apps/website/src/contracts/core/approval-i18n.ts | lines 96.88 br 80.0 fn 100.0 | uncovered lines: 29
- apps/website/src/contracts/core/assistant-run-events.ts | lines 98.33 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/contracts/core/chat-delete-grant.ts | lines 100.0 br 88.89 fn 62.5 | uncovered lines: 
- apps/website/src/contracts/core/consent-refusal.ts | lines 90.0 br 100.0 fn 75.0 | uncovered lines: 5
- apps/website/src/contracts/core/credential-token.ts | lines 100.0 br 80.0 fn 60.0 | uncovered lines: 
- apps/website/src/contracts/core/entry-refs/unindexed-ref-warning.ts | lines 9.09 br 100.0 fn 100.0 | uncovered lines: 1-8,11-12
- apps/website/src/contracts/core/events/outbox-retry-policies.ts | lines 95.45 br 100.0 fn 100.0 | uncovered lines: 23
- apps/website/src/contracts/core/events/outbox-trace-parent.ts | lines 97.22 br 100.0 fn 100.0 | uncovered lines: 35
- apps/website/src/contracts/core/gated-mutations/composition.ts | lines 97.97 br 100.0 fn 75.0 | uncovered lines: 147,157,160
- apps/website/src/contracts/core/gated-mutations/gateway.ts | lines 54.0 br 100.0 fn 100.0 | uncovered lines: 1-91,212
- apps/website/src/contracts/core/gated-mutations/ports.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/contracts/core/gated-mutations/token.ts | lines 100.0 br 100.0 fn 93.75 | uncovered lines: 
- apps/website/src/contracts/core/human-confirm.ts | lines 100.0 br 94.74 fn 85.0 | uncovered lines: 
- apps/website/src/contracts/core/page-html.ts | lines 95.48 br 100.0 fn 100.0 | uncovered lines: 149-155
- apps/website/src/contracts/core/plugin-credential-card.ts | lines 88.89 br 100.0 fn 100.0 | uncovered lines: 9
- apps/website/src/contracts/core/publish-trust-wire.ts | lines 40.0 br 100.0 fn 100.0 | uncovered lines: 1-6,8-10
- apps/website/src/contracts/core/rate-limit/rate-limit.ts | lines 100.0 br 90.0 fn 27.78 | uncovered lines: 
- apps/website/src/contracts/core/renamed-bundled-plugin-ids.ts | lines 50.0 br 100.0 fn 100.0 | uncovered lines: 1-5,7
- apps/website/src/contracts/core/runtime-mode.ts | lines 100.0 br 91.67 fn 50.0 | uncovered lines: 
- apps/website/src/contracts/core/settings-vocabulary.ts | lines 77.78 br 100.0 fn 100.0 | uncovered lines: 1-2
- apps/website/src/contracts/core/theme-ids.ts | lines 100.0 br 85.71 fn 33.33 | uncovered lines: 
- apps/website/src/contracts/core/tool-failure-diagnostics.ts | lines 77.78 br 100.0 fn 100.0 | uncovered lines: 1-2
- apps/website/src/contracts/core/tool-metadata/agent-pause.ts | lines 100.0 br 66.67 fn 50.0 | uncovered lines: 
- apps/website/src/contracts/core/tool-metadata/content-read.ts | lines 100.0 br 80.0 fn 60.0 | uncovered lines: 
- apps/website/src/contracts/core/tool-metadata/index.ts | lines 100.0 br 66.67 fn 14.29 | uncovered lines: 
- apps/website/src/contracts/core/tool-metadata/storage.ts | lines 100.0 br 75.0 fn 66.67 | uncovered lines: 
- apps/website/src/contracts/core/tool-metadata/theme.ts | lines 100.0 br 75.0 fn 50.0 | uncovered lines: 
- apps/website/src/contracts/headless/assistant-permanent-deletes-policy.ts | lines 100.0 br 80.0 fn 20.0 | uncovered lines: 
- apps/website/src/contracts/headless/assistant-tool-approval-policy.ts | lines 98.18 br 92.86 fn 25.0 | uncovered lines: 54
- apps/website/src/contracts/headless/index.ts | lines 100.0 br 66.67 fn 5.88 | uncovered lines: 
- apps/website/src/contracts/headless/secret-form-cards.ts | lines 100.0 br 50.0 fn 0.0 | uncovered lines: 
- apps/website/src/contracts/site-assistant/visitor-tools.ts | lines 94.74 br 95.74 fn 90.0 | uncovered lines: 92-96
- apps/website/src/features/agent-plugins/access-token-tool.ts | lines 88.7 br 91.67 fn 40.91 | uncovered lines: 98-99,103-107,116-120,123
- apps/website/src/features/agent-plugins/activation-effects.ts | lines 83.33 br 100.0 fn 100.0 | uncovered lines: 1-3
- apps/website/src/features/agent-plugins/admin-surfaces/surfaces.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- apps/website/src/features/agent-plugins/apply-connect-defaults.ts | lines 90.91 br 100.0 fn 100.0 | uncovered lines: 1-5,76
- apps/website/src/features/agent-plugins/apply-tool-renames.ts | lines 83.33 br 100.0 fn 100.0 | uncovered lines: 1-3
- apps/website/src/features/agent-plugins/automatic-agent-plugins.ts | lines 98.15 br 100.0 fn 80.0 | uncovered lines: 1
- apps/website/src/features/agent-plugins/bundled-catalog.ts | lines 99.42 br 78.57 fn 40.0 | uncovered lines: 156
- apps/website/src/features/agent-plugins/bundled-contribution-sources.ts | lines 100.0 br 50.0 fn 33.33 | uncovered lines: 
- apps/website/src/features/agent-plugins/bundled-id-upgrade.ts | lines 51.92 br 100.0 fn 100.0 | uncovered lines: 1-24,47
