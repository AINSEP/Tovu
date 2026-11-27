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

REPO: Jini only. HEAD = codex/w62-cov-devops-1 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/devops/src/backup/site/archive-extensions.ts | lines 96.97 br 85.48 fn 100.0 | uncovered lines: 141-143
- packages/devops/src/backup/site/archive-manifest.ts | lines 98.4 br 77.78 fn 100.0 | uncovered lines: 113,115
- packages/devops/src/backup/site/archive-media.ts | lines 100.0 br 95.56 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/backup-service.credentials.ts | lines 48.51 br 56.25 fn 60.0 | uncovered lines: 38-39,47-48,51-53,66-67,76-84,106-107,110-112,123-132,137,141-149,152-157,170-172
- packages/devops/src/backup/site/backup-service.plan.ts | lines 77.27 br 55.56 fn 83.33 | uncovered lines: 43-46,49-56,59-68,113-115,201-203,208-210,233-236
- packages/devops/src/backup/site/backup-service.push.ts | lines 83.87 br 65.38 fn 85.71 | uncovered lines: 59-68
- packages/devops/src/backup/site/backup-service.shared.ts | lines 100.0 br 87.5 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/backup-service.ts | lines 100.0 br 73.08 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/bundled-export-file-policy.ts | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/credential-warnings.ts | lines 93.55 br 42.86 fn 100.0 | uncovered lines: 42-43
- packages/devops/src/backup/site/import-backend-steps.ts | lines 92.98 br 98.9 fn 88.89 | uncovered lines: 122-126,205-207
- packages/devops/src/backup/site/import-backend.ts | lines 70.91 br 63.49 fn 81.58 | uncovered lines: 127-131,177-180,207-221,226-227,267-270,298-305,307-315,317-325,327,329-335
- packages/devops/src/backup/site/import-database.ts | lines 100.0 br 95.45 fn 90.48 | uncovered lines: 
- packages/devops/src/backup/site/import-index/admission.ts | lines 100.0 br 89.47 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/import-index/backfill.ts | lines 98.17 br 77.36 fn 100.0 | uncovered lines: 141-142
- packages/devops/src/backup/site/import-index/mode.ts | lines 100.0 br 98.48 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/import-index/open.ts | lines 95.52 br 83.33 fn 90.91 | uncovered lines: 33-35
- packages/devops/src/backup/site/import-index/paging.ts | lines 100.0 br 96.88 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/import-index/payload-namespace.ts | lines 92.24 br 82.09 fn 100.0 | uncovered lines: 54-56,70-72,88-90
- packages/devops/src/backup/site/import-index/rows.ts | lines 73.47 br 62.07 fn 77.78 | uncovered lines: 10-12,26-30,34-36,62-63
- packages/devops/src/backup/site/import-index/schema.ts | lines 68.0 br 55.56 fn 100.0 | uncovered lines: 12-19
- packages/devops/src/backup/site/import-index/store.ts | lines 82.76 br 66.67 fn 66.67 | uncovered lines: 16-18,20-21
- packages/devops/src/backup/site/import-keep-off.ts | lines 100.0 br 90.59 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/import-registry.ts | lines 88.74 br 74.68 fn 85.71 | uncovered lines: 82,89-91,104,131-134,143-146,156-157,189-190
- packages/devops/src/backup/site/import-restore-placement.ts | lines 100.0 br 94.74 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/import-restore.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/import-verifier-inventory.ts | lines 94.44 br 84.76 fn 95.24 | uncovered lines: 132-134,139-144
- packages/devops/src/backup/site/import-verifier-projection.ts | lines 100.0 br 97.56 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/import-verifier.ts | lines 76.92 br 71.43 fn 50.0 | uncovered lines: 82-90
- packages/devops/src/backup/site/push-content.ts | lines 100.0 br 78.57 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/share-backend.ts | lines 59.09 br 78.21 fn 67.65 | uncovered lines: 140,147-152,159-168,174-195,227-238,282-288,330-341,354-358,360-365
- packages/devops/src/backup/site/share-database/projection.media.ts | lines 28.57 br 89.47 fn 26.67 | uncovered lines: 13-18,31-33,46-49,54-58,66-70,72-74,81-85,90-91,94-101,111-117,132-139,143-165,168-174,177-181,183-186
- packages/devops/src/backup/site/share-database/projection.tables.ts | lines 42.06 br 77.42 fn 46.15 | uncovered lines: 23-27,35-46,50-54,59-61,63-67,114-120,127-132,138-145,151-157,161-169,174-179
- packages/devops/src/backup/site/share-database/projection.ts | lines 93.85 br 66.67 fn 77.78 | uncovered lines: 161-164
- packages/devops/src/backup/site/share-file-policy.ts | lines 96.19 br 75.41 fn 100.0 | uncovered lines: 86-87,125-126
- packages/devops/src/backup/site/share-hosting.ts | lines 100.0 br 90.41 fn 94.44 | uncovered lines: 
- packages/devops/src/backup/site/share-preparation-steps.ts | lines 100.0 br 98.0 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/share-preparation.ts | lines 100.0 br 68.0 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/share-registry.ts | lines 97.58 br 86.08 fn 100.0 | uncovered lines: 133,146,155
- packages/devops/src/backup/site/share-retention.ts | lines 87.67 br 76.67 fn 90.91 | uncovered lines: 62,82-83,85-87,119-121
- packages/devops/src/backup/site/share-service.ts | lines 90.23 br 82.98 fn 95.65 | uncovered lines: 122,130,138-140,164-166,176-180
- packages/devops/src/backup/site/share-zip.ts | lines 97.92 br 86.67 fn 100.0 | uncovered lines: 176-177
- packages/devops/src/backup/site/sources.ts | lines 75.0 br 76.92 fn 84.62 | uncovered lines: 217-218,233-235,237-239,241-243,313-315,324-337,351-353,359-372,375-380,382-390,392-413,439-442,481,607-608,624-625,630,634,649-650,732-733,736
- packages/devops/src/backup/site/static-copy.ts | lines 81.51 br 67.35 fn 78.57 | uncovered lines: 78-81,84-87,129-136,145-149,185
- packages/devops/src/backup/site/static-download-html.ts | lines 85.15 br 77.46 fn 90.0 | uncovered lines: 56-60,67-76
- packages/devops/src/backup/site/static-download-landing.ts | lines 95.92 br 61.11 fn 100.0 | uncovered lines: 51-52
- packages/devops/src/backup/site/static-download-layout.ts | lines 70.54 br 60.23 fn 75.86 | uncovered lines: 70,72-82,89-94,121-126,132-135,140-148,190-194,197-203,206-216,231-234,337-338
- packages/devops/src/backup/site/static-export-selection.ts | lines 100.0 br 97.92 fn 100.0 | uncovered lines: 
- packages/devops/src/backup/site/tool-registrations.ts | lines 91.81 br 75.86 fn 84.21 | uncovered lines: 152-154,156-158,170-172,229-233
- packages/devops/src/backup/upload.node.ts | lines 100.0 br 97.56 fn 100.0 | uncovered lines: 
- packages/devops/src/checks/coverage/lcov.ts | lines 100.0 br 98.95 fn 100.0 | uncovered lines: 
- packages/devops/src/checks/env-access.ts | lines 96.94 br 96.47 fn 100.0 | uncovered lines: 122-124
- packages/devops/src/checks/hardwiring.ts | lines 100.0 br 99.68 fn 98.33 | uncovered lines: 
- packages/devops/src/deploy/config-descriptors.ts | lines 100.0 br 88.46 fn 100.0 | uncovered lines: 
- packages/devops/src/deploy/ops-descriptors.ts | lines 100.0 br 90.0 fn 100.0 | uncovered lines: 
- packages/devops/src/deploy/ops-registry.ts | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- packages/devops/src/deploy/ops-runner.ts | lines 65.0 br 45.21 fn 53.12 | uncovered lines: 16-21,34-36,43-45,65-70,75-82,113,116,241-252,254-260,262-264,266-269,271-275,286-303
- packages/devops/src/deploy/ops-secret-card.ts | lines 8.0 br 100.0 fn 0.0 | uncovered lines: 8-18,20-30,32-51,53-56
- packages/devops/src/deploy/ops-secrets.ts | lines 7.97 br 100.0 fn 0.0 | uncovered lines: 26-28,30-34,37-46,48-51,54-59,62-64,77-83,86-93,95-99,101-109,112-117,120-123,125-131,134-137,139-142,154-173,176-180,192-208
- packages/devops/src/deploy/ops-tools.ts | lines 63.95 br 54.55 fn 66.67 | uncovered lines: 17-21,32-38,46-62,77-78
- packages/devops/src/deploy/publish-jobs.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/devops/src/deploy/react/Deployment.tsx | lines 100.0 br 100.0 fn 75.0 | uncovered lines: 
- packages/devops/src/deploy/react/DockerfileTab.tsx | lines 82.44 br 64.29 fn 53.85 | uncovered lines: 79-86,88-91,94-99,101,135,174-180,182-183,243,359-364,366-367,374-379,381-382
- packages/devops/src/deploy/react/OverviewTab.tsx | lines 54.14 br 50.0 fn 50.0 | uncovered lines: 171-176,178,185-187,191-204,206,210-218,220-249,251-256,258-267,269,287-288
- packages/devops/src/deploy/react/StaticCredentialFields.tsx | lines 4.0 br 100.0 fn 0.0 | uncovered lines: 28-31,35-36,38-45,47-55,57-65,67,72-77,79,86-91,96-118,120,124-143,145-149,151
- packages/devops/src/deploy/react/StaticCredentialSteps.tsx | lines 4.0 br 100.0 fn 0.0 | uncovered lines: 20-24,29-37,39-40,42-51,53,112-119,121,124-127,131-142,144-157,159,175-179,183-199,201-208,210,226-230,234-235,238-256,258-269,271,273-292,294,296-304,306
