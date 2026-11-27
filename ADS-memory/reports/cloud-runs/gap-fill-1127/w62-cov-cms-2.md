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

REPO: Jini only. HEAD = codex/w62-cov-cms-2 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/cms/src/admin-http/routes/settings/protected-namespaces.ts | lines 100.0 br 89.66 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/settings/register-definitions.ts | lines 67.11 br 76.0 fn 92.31 | uncovered lines: 56-66,92-97,100-103,150-151,153-154
- packages/cms/src/admin-http/routes/settings/reset.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/settings/set.ts | lines 100.0 br 96.3 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/settings/shared.ts | lines 100.0 br 96.15 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/sites/local-sites.ts | lines 100.0 br 97.67 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/sites/site-previews.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/sites/sites-home.ts | lines 100.0 br 100.0 fn 90.91 | uncovered lines: 
- packages/cms/src/admin-http/routes/skills/shared.ts | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/assistant-daemon.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/assistant-owner-grant.ts | lines 100.0 br 98.04 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/assistant-subagents.ts | lines 100.0 br 100.0 fn 90.91 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/browser-telemetry.ts | lines 100.0 br 78.95 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/credential-copy.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,20,60,64-71,76-88,90-93,97-104,109-110,112-115,117,119-133,135-150
- packages/cms/src/admin-http/routes/system/custom-credentials.ts | lines 100.0 br 97.96 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/dockerfile-source.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/mail-activity.ts | lines 91.92 br 100.0 fn 91.67 | uncovered lines: 193-195,197-201
- packages/cms/src/admin-http/routes/system/module-status.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/observability-status.ts | lines 100.0 br 90.91 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/publish-credentials/list.ts | lines 90.0 br 76.92 fn 100.0 | uncovered lines: 94-97
- packages/cms/src/admin-http/routes/system/publish-site/destinations.ts | lines 100.0 br 90.91 fn 75.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/publish-site/trigger.ts | lines 90.22 br 80.0 fn 86.67 | uncovered lines: 25-26,37-38,41-42,84-86
- packages/cms/src/admin-http/routes/system/server-logs.ts | lines 100.0 br 90.91 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/site-backups.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 17,55,58-60,64-69,72-82,84,87,90
- packages/cms/src/admin-http/routes/system/site-imports.ts | lines 76.59 br 86.75 fn 77.42 | uncovered lines: 169,175-179,184-187,224,226-228,292-297,302-305,307-312,315-320,328-334,344,351-354
- packages/cms/src/admin-http/routes/system/site-share-password.ts | lines 90.28 br 79.59 fn 100.0 | uncovered lines: 92-94,113-116
- packages/cms/src/admin-http/routes/system/site-shares.ts | lines 100.0 br 94.55 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/sites.ts | lines 100.0 br 96.97 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/source-control-credentials.ts | lines 100.0 br 97.06 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/system/tool-gaps.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/taxonomy/assign-terms.ts | lines 94.37 br 66.67 fn 100.0 | uncovered lines: 73-74,92,133
- packages/cms/src/admin-http/routes/taxonomy/create-taxonomy.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/taxonomy/create-term.ts | lines 97.14 br 66.67 fn 100.0 | uncovered lines: 60
- packages/cms/src/admin-http/routes/taxonomy/list.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/taxonomy/rename-term.ts | lines 93.55 br 42.86 fn 100.0 | uncovered lines: 35,50
- packages/cms/src/admin-http/routes/taxonomy/shared.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/themes/duplicate.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/themes/explore-detail.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/themes/explore-file-put.ts | lines 100.0 br 92.86 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/themes/explore-file-reset.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/themes/explore-shared.ts | lines 100.0 br 95.65 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/themes/held-back.ts | lines 100.0 br 100.0 fn 93.75 | uncovered lines: 
- packages/cms/src/admin-http/routes/widgets/agent-tools-create.ts | lines 87.93 br 84.62 fn 100.0 | uncovered lines: 71,90-95
- packages/cms/src/admin-http/routes/widgets/agent-tools-place.ts | lines 95.83 br 85.71 fn 100.0 | uncovered lines: 31
- packages/cms/src/admin-http/routes/widgets/agent-tools-remove.ts | lines 95.83 br 85.71 fn 100.0 | uncovered lines: 31
- packages/cms/src/admin-http/routes/widgets/create.ts | lines 97.14 br 78.57 fn 100.0 | uncovered lines: 62
- packages/cms/src/admin-http/routes/widgets/embed-insert.ts | lines 96.3 br 85.71 fn 100.0 | uncovered lines: 45
- packages/cms/src/admin-http/routes/widgets/embed-remove.ts | lines 96.0 br 83.33 fn 100.0 | uncovered lines: 40
- packages/cms/src/admin-http/routes/widgets/embed-reorder.ts | lines 96.67 br 90.91 fn 100.0 | uncovered lines: 51
- packages/cms/src/admin-http/routes/widgets/get-by-id.ts | lines 90.48 br 66.67 fn 100.0 | uncovered lines: 35-36
- packages/cms/src/admin-http/routes/widgets/list.ts | lines 100.0 br 87.5 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/widgets/region-bind.ts | lines 79.17 br 75.0 fn 100.0 | uncovered lines: 35-39
- packages/cms/src/admin-http/routes/widgets/region-get.ts | lines 58.33 br 71.43 fn 100.0 | uncovered lines: 50-63,65
- packages/cms/src/admin-http/routes/widgets/region-mutate-placements.ts | lines 98.21 br 96.55 fn 100.0 | uncovered lines: 98
- packages/cms/src/admin-http/routes/widgets/regions-list.ts | lines 92.0 br 50.0 fn 50.0 | uncovered lines: 44-45
- packages/cms/src/admin-http/routes/widgets/shared.ts | lines 100.0 br 60.0 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/widgets/trash.ts | lines 95.0 br 50.0 fn 50.0 | uncovered lines: 32
- packages/cms/src/admin-http/routes/widgets/update.ts | lines 97.14 br 60.0 fn 100.0 | uncovered lines: 57
- packages/cms/src/admin-http/routes/workspace/delete.ts | lines 97.5 br 88.89 fn 100.0 | uncovered lines: 101
- packages/cms/src/asset-transfer/asset-destinations.ts | lines 84.27 br 79.71 fn 87.5 | uncovered lines: 79-80,85-87,102-103,143-144,152-156
- packages/cms/src/asset-transfer/copy-tool.ts | lines 89.63 br 75.0 fn 88.89 | uncovered lines: 83-88,150-151,172,209-213
- packages/cms/src/change-sets/tool-registrations.ts | lines 100.0 br 97.62 fn 100.0 | uncovered lines: 
- packages/cms/src/comments/sanitize.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/cms/src/comments/site/data-module-install.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 8,20-29
- packages/cms/src/comments/site/provider-selection.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3-5,9-10,12-13,15-22,26-31,40-61,64,70-71,76-82,85-104,107-113
- packages/cms/src/comments/tool-registrations.ts | lines 62.07 br 72.92 fn 82.61 | uncovered lines: 35-39,67,78-91,94-96,121-126,147-148,150,152-164,166-167,280-281,316-322,325,327,329-331,333-336,373-375,377,379-381,384-397,399,401
- packages/cms/src/content-duplication/tool-registrations.ts | lines 67.57 br 77.78 fn 83.33 | uncovered lines: 67-68,70-74,76-86,102-107
- packages/cms/src/content-types/site/publish-content.ts | lines 90.91 br 75.0 fn 62.5 | uncovered lines: 73,80-83
- packages/cms/src/core/commands/repo.memory.ts | lines 100.0 br 90.48 fn 100.0 | uncovered lines: 
- packages/cms/src/core/commands/revert.ts | lines 93.3 br 92.86 fn 100.0 | uncovered lines: 223-226,260-264,280-283
- packages/cms/src/core/form-collection.ts | lines 98.25 br 72.5 fn 100.0 | uncovered lines: 69
- packages/cms/src/entries/repo.trash-aware.memory.ts | lines 95.54 br 86.67 fn 94.12 | uncovered lines: 111-112,122-123,219
- packages/cms/src/entries/site/public-list.ts | lines 78.21 br 62.0 fn 73.33 | uncovered lines: 152-167,184,186,188,190,192,236-245,271-272,274-275,281-282,291-292
- packages/cms/src/entries/site/publish-content.ts | lines 78.05 br 84.62 fn 92.31 | uncovered lines: 74-80,82-86,88-97,101-105
- packages/cms/src/entries/site/tool-registrations.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/cms/src/entries/site/unreadable-owner-entries-repair.ts | lines 19.15 br 100.0 fn 40.0 | uncovered lines: 66-72,75-91,103-116
- packages/cms/src/entries/sql/repo.ts | lines 100.0 br 98.86 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/attachment-cleanup.ts | lines 100.0 br 88.24 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/attachment-purge.ts | lines 100.0 br 94.29 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/destination-descriptors.ts | lines 100.0 br 92.31 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/destination-registry.ts | lines 100.0 br 96.43 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/destinations/connection-port.ts | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/destinations/deliver.ts | lines 100.0 br 89.47 fn 83.33 | uncovered lines: 
- packages/cms/src/forms/destinations/port.ts | lines 24.1 br 42.86 fn 33.33 | uncovered lines: 37,47,53-56,60-77,81-90,92-93,97-110,113-122,124-126
- packages/cms/src/forms/destinations/rewrite-actions.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/duplicate-form.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/email-sender-fields.ts | lines 95.65 br 96.67 fn 100.0 | uncovered lines: 44-45
- packages/cms/src/forms/express/handler.ts | lines 100.0 br 97.73 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/form-controls.ts | lines 100.0 br 96.55 fn 100.0 | uncovered lines: 
- packages/cms/src/forms/html-render.ts | lines 100.0 br 98.14 fn 100.0 | uncovered lines: 
