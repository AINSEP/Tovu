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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-5 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/website/src/features/settings/site-title-legacy.ts | lines 100.0 br 50.0 fn 0.0 | uncovered lines: 
- apps/website/src/features/settings/tool-registrations.ts | lines 100.0 br 90.0 fn 100.0 | uncovered lines: 
- apps/website/src/features/site-backup/archive-paths.ts | lines 98.9 br 96.15 fn 100.0 | uncovered lines: 87
- apps/website/src/features/site-backup/backup-service.ts | lines 100.0 br 92.31 fn 47.37 | uncovered lines: 
- apps/website/src/features/site-backup/bundled-export-file-policy.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- apps/website/src/features/site-backup/import-backend.ts | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- apps/website/src/features/site-backup/import-database.ts | lines 92.0 br 100.0 fn 100.0 | uncovered lines: 25-26
- apps/website/src/features/site-backup/import-plugin-state.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- apps/website/src/features/site-backup/import-restore-placement.ts | lines 97.87 br 100.0 fn 100.0 | uncovered lines: 46
- apps/website/src/features/site-backup/import-restore.ts | lines 97.33 br 94.74 fn 85.0 | uncovered lines: 47,78
- apps/website/src/features/site-backup/import-verifier-projection.ts | lines 92.86 br 100.0 fn 75.0 | uncovered lines: 42-44
- apps/website/src/features/site-backup/package-file-inventory.ts | lines 100.0 br 60.0 fn 100.0 | uncovered lines: 
- apps/website/src/features/site-backup/push-manifest.ts | lines 96.77 br 80.0 fn 100.0 | uncovered lines: 16
- apps/website/src/features/site-backup/share-expiry.ts | lines 92.86 br 83.33 fn 80.0 | uncovered lines: 38-39,42
- apps/website/src/features/site-backup/share-own-folder.ts | lines 90.91 br 100.0 fn 100.0 | uncovered lines: 9
- apps/website/src/features/site-backup/share-policy.ts | lines 95.56 br 100.0 fn 100.0 | uncovered lines: 37,45
- apps/website/src/features/site-backup/share-zip.ts | lines 97.44 br 100.0 fn 100.0 | uncovered lines: 41
- apps/website/src/features/site-backup/sources.ts | lines 98.61 br 100.0 fn 100.0 | uncovered lines: 82
- apps/website/src/features/site-backup/static-download-host.ts | lines 97.37 br 100.0 fn 100.0 | uncovered lines: 35
- apps/website/src/features/site-backup/static-export-selection.ts | lines 94.74 br 100.0 fn 100.0 | uncovered lines: 17
- apps/website/src/features/site-backup/tool-registrations.ts | lines 100.0 br 100.0 fn 0.0 | uncovered lines: 
- apps/website/src/features/site-evidence/collect-page-evidence.ts | lines 81.21 br 70.0 fn 35.29 | uncovered lines: 1,52-54,58-60,63-66,69-83,86,154
- apps/website/src/features/site-evidence/tool-registrations.ts | lines 96.89 br 86.11 fn 77.78 | uncovered lines: 191-196,218
- apps/website/src/features/site-export/export-failure-summary.ts | lines 3.7 br 100.0 fn 100.0 | uncovered lines: 1-51,56
- apps/website/src/features/site-export/export-preflight-copy.ts | lines 95.65 br 50.0 fn 100.0 | uncovered lines: 3
- apps/website/src/features/site-export/index.ts | lines 33.33 br 100.0 fn 100.0 | uncovered lines: 1-4
- apps/website/src/features/site-export/media-url-bindings.ts | lines 95.24 br 100.0 fn 100.0 | uncovered lines: 18
- apps/website/src/features/site-export/site-exporter.ts | lines 96.15 br 100.0 fn 100.0 | uncovered lines: 59
- apps/website/src/features/site-export/theme-preview-manifest.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- apps/website/src/features/site-export/theme-preview-report.ts | lines 96.0 br 100.0 fn 100.0 | uncovered lines: 6
- apps/website/src/features/site-guide/capability-card.ts | lines 95.24 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/features/site-guide/contracts.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/features/site-guide/facts.ts | lines 100.0 br 87.5 fn 90.91 | uncovered lines: 
- apps/website/src/features/site-inspection/admin-screens.generated.ts | lines 84.13 br 100.0 fn 100.0 | uncovered lines: 1-10
- apps/website/src/features/site-inspection/deps.ts | lines 98.45 br 100.0 fn 83.33 | uncovered lines: 158,174
- apps/website/src/features/site-inspection/index.ts | lines 33.33 br 100.0 fn 100.0 | uncovered lines: 1-16
- apps/website/src/features/site-inspection/tool-registrations.ts | lines 94.29 br 85.71 fn 50.0 | uncovered lines: 31-32
- apps/website/src/features/site-search/cms-search-rules.ts | lines 75.0 br 100.0 fn 100.0 | uncovered lines: 1-6
- apps/website/src/features/site-update/approved-handoff.ts | lines 81.25 br 55.56 fn 100.0 | uncovered lines: 1-6
- apps/website/src/features/site-update/candidate-readiness.ts | lines 86.54 br 100.0 fn 100.0 | uncovered lines: 1-5,8,51
- apps/website/src/features/site-update/configured-runtime.ts | lines 67.86 br 100.0 fn 50.0 | uncovered lines: 1-4,25-28,34
- apps/website/src/features/site-update/github-release-feed.ts | lines 79.17 br 55.56 fn 100.0 | uncovered lines: 1-4,27
- apps/website/src/features/site-update/host-runtime.ts | lines 73.08 br 100.0 fn 100.0 | uncovered lines: 1-6,26
- apps/website/src/features/site-update/operation-update-lock.ts | lines 86.67 br 100.0 fn 100.0 | uncovered lines: 1-4
- apps/website/src/features/site-update/read-status.ts | lines 81.82 br 95.24 fn 100.0 | uncovered lines: 1-6,61-64
- apps/website/src/features/site-update/restore-point-backup.ts | lines 88.57 br 100.0 fn 100.0 | uncovered lines: 1-6,11,69
- apps/website/src/features/site-update/self-hosted-host.ts | lines 61.11 br 100.0 fn 100.0 | uncovered lines: 1-6,23
- apps/website/src/features/site-update/tools.ts | lines 96.3 br 96.0 fn 93.75 | uncovered lines: 1-5
- apps/website/src/features/sites/agent-tools.ts | lines 81.41 br 100.0 fn 100.0 | uncovered lines: 2-23,29-35
- apps/website/src/features/sites/deps.ts | lines 98.53 br 50.0 fn 100.0 | uncovered lines: 116
- apps/website/src/features/sites/index.ts | lines 87.88 br 100.0 fn 100.0 | uncovered lines: 1-4
- apps/website/src/features/sites/list-tool.ts | lines 66.67 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/features/sites/site-admin.ts | lines 97.21 br 65.15 fn 100.0 | uncovered lines: 181-183,211-212,274-275
- apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts | lines 99.24 br 100.0 fn 100.0 | uncovered lines: 133
- apps/website/src/features/sites/site-preview/site-preview-service.ts | lines 81.9 br 100.0 fn 100.0 | uncovered lines: 1-19,22,105
- apps/website/src/features/sites/site-preview/site-preview-store.ts | lines 75.0 br 100.0 fn 100.0 | uncovered lines: 1-21,56
- apps/website/src/features/sites/tool-registrations.ts | lines 89.1 br 92.45 fn 81.25 | uncovered lines: 118-121,146-151,154-157,219-226,230-241
- apps/website/src/features/sites/warm-switch.ts | lines 96.88 br 63.64 fn 100.0 | uncovered lines: 1
- apps/website/src/features/skills/install-adapters.ts | lines 85.71 br 100.0 fn 100.0 | uncovered lines: 7
- apps/website/src/features/skills/site-host.ts | lines 80.0 br 100.0 fn 80.0 | uncovered lines: 1-8
- apps/website/src/features/source-control/commit-site.ts | lines 100.0 br 97.87 fn 100.0 | uncovered lines: 
- apps/website/src/features/source-control/credential-setup.ts | lines 100.0 br 100.0 fn 33.33 | uncovered lines: 
- apps/website/src/features/source-control/index.ts | lines 63.64 br 100.0 fn 100.0 | uncovered lines: 1-4
- apps/website/src/features/source-control/provider-kit-host.ts | lines 96.0 br 83.33 fn 66.67 | uncovered lines: 18
- apps/website/src/features/source-control/provider-registry.ts | lines 100.0 br 93.15 fn 98.0 | uncovered lines: 
- apps/website/src/features/source-control/repo.memory.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- apps/website/src/features/source-control/store.ts | lines 94.44 br 100.0 fn 100.0 | uncovered lines: 17
- apps/website/src/features/source-control/tool-registrations.ts | lines 100.0 br 100.0 fn 0.0 | uncovered lines: 
- apps/website/src/features/source-control/write-port.ts | lines 75.86 br 85.71 fn 100.0 | uncovered lines: 1-7
- apps/website/src/features/storage/agent-tools.ts | lines 81.48 br 100.0 fn 100.0 | uncovered lines: 1-5
- apps/website/src/features/storage/cleanup-gate.ts | lines 98.15 br 90.91 fn 100.0 | uncovered lines: 52
- apps/website/src/features/storage/compact-site.ts | lines 90.0 br 66.67 fn 100.0 | uncovered lines: 35-37
- apps/website/src/features/storage/compaction-marker.ts | lines 100.0 br 71.43 fn 83.33 | uncovered lines: 
- apps/website/src/features/storage/compaction-recovery-ports.ts | lines 91.37 br 73.21 fn 100.0 | uncovered lines: 1-5,31-33,53-55,135
- apps/website/src/features/storage/compaction-recovery.ts | lines 92.14 br 79.63 fn 100.0 | uncovered lines: 1-14,183-186,237-240
- apps/website/src/features/storage/compaction-recovery.types.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/features/storage/measure.ts | lines 91.96 br 100.0 fn 100.0 | uncovered lines: 1-9
- apps/website/src/features/storage/tool-registrations.ts | lines 67.53 br 100.0 fn 33.33 | uncovered lines: 34-43,52-57,62-67,81-83
- apps/website/src/features/taxonomy/gated-hooks.ts | lines 97.83 br 100.0 fn 100.0 | uncovered lines: 52
- apps/website/src/features/theme/active-theme.ts | lines 99.49 br 96.97 fn 57.89 | uncovered lines: 195
- apps/website/src/features/theme/asset-operations.ts | lines 100.0 br 97.3 fn 95.24 | uncovered lines: 
- apps/website/src/features/theme/asset-path-rewrites.ts | lines 50.0 br 75.0 fn 100.0 | uncovered lines: 3-13
- apps/website/src/features/theme/build-conformance.ts | lines 93.46 br 81.25 fn 90.48 | uncovered lines: 301-307,322-325,328-329,396-401,405-410,474-479,516,537-538
- apps/website/src/features/theme/capability-card.ts | lines 96.43 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/features/theme/code-tier-asset-normalizer.ts | lines 38.02 br 100.0 fn 0.0 | uncovered lines: 1-104,160-173,176-185,197-203,231-266,277-296,298-306,310,312-318,324-330,343-346,387-418
- apps/website/src/features/theme/duplicate-theme-tool.ts | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- apps/website/src/features/theme/duplicate-theme.ts | lines 99.74 br 98.99 fn 100.0 | uncovered lines: 406
- apps/website/src/features/theme/entry-list-markup.ts | lines 61.54 br 75.0 fn 50.0 | uncovered lines: 25-39
- apps/website/src/features/theme/file-identity-lock.ts | lines 97.82 br 96.55 fn 100.0 | uncovered lines: 262-267
- apps/website/src/features/theme/file-mutation-tools.ts | lines 100.0 br 94.74 fn 88.89 | uncovered lines: 
