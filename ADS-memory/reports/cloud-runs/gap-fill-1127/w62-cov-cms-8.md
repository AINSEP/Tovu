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

REPO: Jini only. HEAD = codex/w62-cov-cms-8 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/cms/src/seo/tool-registrations.ts | lines 69.57 br 94.44 fn 78.57 | uncovered lines: 55-60,135-137,139-141,144-146,148-150,159-175
- packages/cms/src/seo/write-service.ts | lines 98.06 br 94.25 fn 100.0 | uncovered lines: 211,286,353,360
- packages/cms/src/settings/site/chat-execution-write.ts | lines 95.92 br 58.62 fn 100.0 | uncovered lines: 42-43
- packages/cms/src/settings/site/form-delivery-write.ts | lines 93.33 br 88.89 fn 100.0 | uncovered lines: 58-59
- packages/cms/src/settings/site/form-delivery.ts | lines 95.08 br 65.96 fn 100.0 | uncovered lines: 143-144,152-155
- packages/cms/src/settings/site/form-destination.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/cms/src/settings/site/mail-provider.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3,5,24-26,29,35-43,45-47,53-59,66-73,80-90,98-99,104-111,114-121,127-133
- packages/cms/src/settings/site/mail-sender.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/cms/src/settings/site/publish-content.ts | lines 85.71 br 64.71 fn 60.0 | uncovered lines: 130-137,202-205,219
- packages/cms/src/settings/site/settings-confirm-write.ts | lines 100.0 br 82.35 fn 100.0 | uncovered lines: 
- packages/cms/src/settings/site/site-timezone.ts | lines 100.0 br 85.0 fn 100.0 | uncovered lines: 
- packages/cms/src/settings/site/site-title-write.ts | lines 71.76 br 60.0 fn 81.82 | uncovered lines: 63-66,85-86,173-174,185-186,192-196,204-206,209-210,212-215
- packages/cms/src/settings/site/site-title.ts | lines 100.0 br 78.57 fn 100.0 | uncovered lines: 
- packages/cms/src/settings/site/visitor-tools-configure.ts | lines 94.12 br 80.65 fn 100.0 | uncovered lines: 24-25
- packages/cms/src/settings/site/visitor-tools-registrations.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,6,41-43,46-52,55-61,64-68,71,73-77,84,86-122,125-127
- packages/cms/src/settings/site/visitor-tools-service.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,6-7,25-34,39-50,53-57,64,66-75,81,83-94,99,101-114,121-145
- packages/cms/src/settings/site/visitor-tools-write.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3-4,9,17-22,28-30,37-44,50-58,74,76-87,95,98-109
- packages/cms/src/site-inspection/site-capabilities.ts | lines 100.0 br 91.11 fn 100.0 | uncovered lines: 
- packages/cms/src/site-inspection/site-profile.ts | lines 52.17 br 80.95 fn 41.18 | uncovered lines: 399-406,409-419,452-462,491,516-533,548-561,577-590,597-598,636,639,641,643-648
- packages/cms/src/site-inspection/tool-registrations.ts | lines 43.96 br 66.67 fn 15.38 | uncovered lines: 85-87,110-112,118-120,125-128,146-160,181,185-187,190,194-196,199-206,213,239-244
- packages/cms/src/site/keep-off-content-store.ts | lines 100.0 br 100.0 fn 30.0 | uncovered lines: 
- packages/cms/src/taxonomy/assignment-service.ts | lines 100.0 br 97.92 fn 100.0 | uncovered lines: 
- packages/cms/src/taxonomy/render-entry.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/cms/src/taxonomy/site/publish-content.ts | lines 71.95 br 89.47 fn 69.23 | uncovered lines: 55-63,65-73,105-107,112,119
- packages/cms/src/taxonomy/site/publish-term-ids.ts | lines 67.44 br 91.18 fn 63.64 | uncovered lines: 56-60,93-95,134-152,169
- packages/cms/src/taxonomy/sql/entry-term-repo.ts | lines 100.0 br 96.55 fn 100.0 | uncovered lines: 
- packages/cms/src/taxonomy/sql/term-repo.ts | lines 100.0 br 97.44 fn 100.0 | uncovered lines: 
- packages/cms/src/taxonomy/tool-handlers.ts | lines 96.26 br 80.95 fn 100.0 | uncovered lines: 73-74,78-79,142-143,168-169
- packages/cms/src/themes/files/atomic-write.node.ts | lines 87.3 br 68.0 fn 100.0 | uncovered lines: 90,93-94,110,112-113,163-165,177-180,210-212
- packages/cms/src/themes/files/originals.node.ts | lines 100.0 br 96.97 fn 100.0 | uncovered lines: 
- packages/cms/src/themes/files/read-content.node.ts | lines 100.0 br 97.62 fn 100.0 | uncovered lines: 
- packages/cms/src/themes/files/trash.node.ts | lines 98.51 br 82.69 fn 94.44 | uncovered lines: 79-80
- packages/cms/src/themes/manifest-v2-fields.ts | lines 35.0 br 61.9 fn 75.0 | uncovered lines: 14-15,24-25,29-30,34-35,40-43,77-80,82-86,88-96,111-123,125-133,137-138,142-143,147-148,163-173,177-178,189-195
- packages/cms/src/themes/manifest-v2.ts | lines 61.86 br 33.33 fn 42.86 | uncovered lines: 201-205,228-232,268-269,277-279,286-288,293-295,303-304,311-321,323-333,335-344,346-354,356-365
- packages/cms/src/themes/preview/refresh.node.ts | lines 97.14 br 91.43 fn 100.0 | uncovered lines: 26-27
- packages/cms/src/themes/preview/watcher.node.ts | lines 94.59 br 100.0 fn 91.67 | uncovered lines: 14-17
- packages/cms/src/trash/adapters/directory.node.ts | lines 92.75 br 85.37 fn 100.0 | uncovered lines: 31-32,40-41,44-45,53-54,71-73,94-95,124-125
- packages/cms/src/trash/permanent/tool-registrations.ts | lines 87.23 br 58.33 fn 66.67 | uncovered lines: 91-94,107-108
- packages/cms/src/trash/site/adapters/marker-sql.ts | lines 44.68 br 70.0 fn 75.0 | uncovered lines: 84-96,101-110,143-145
- packages/cms/src/trash/site/adapters/media.ts | lines 41.54 br 50.0 fn 50.0 | uncovered lines: 56-67,78-87,90-99,114-119
- packages/cms/src/trash/site/adapters/member-credential-sql.ts | lines 80.0 br 88.89 fn 83.33 | uncovered lines: 29-34
- packages/cms/src/trash/site/adapters/plugin.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1
- packages/cms/src/trash/site/adapters/post.ts | lines 45.61 br 100.0 fn 40.0 | uncovered lines: 38-47,50-59,80-90
- packages/cms/src/trash/site/adapters/redirect.ts | lines 80.77 br 100.0 fn 80.0 | uncovered lines: 43-52
- packages/cms/src/trash/site/adapters/theme.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3
- packages/cms/src/trash/site/move-to-trash.ts | lines 68.85 br 35.71 fn 75.0 | uncovered lines: 87-91,121-125,130-131,134-136,140-143
- packages/cms/src/trash/site/scheduler.node.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 4-18
- packages/cms/src/trash/sql/entry-sql.ts | lines 100.0 br 90.91 fn 100.0 | uncovered lines: 
- packages/cms/src/trash/sql/not-trashed.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/cms/src/trash/sql/repo.ts | lines 100.0 br 95.35 fn 100.0 | uncovered lines: 
- packages/cms/src/trash/sql/table-adapter.cascade.ts | lines 85.71 br 80.95 fn 88.89 | uncovered lines: 46-52
- packages/cms/src/trash/sql/table-adapter.purge.ts | lines 98.25 br 79.17 fn 100.0 | uncovered lines: 60
- packages/cms/src/trash/sql/table-adapter.rows.ts | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- packages/cms/src/trash/sql/table-adapter.transitions.ts | lines 96.23 br 75.76 fn 100.0 | uncovered lines: 78-79
- packages/cms/src/trash/tool-registrations.ts | lines 100.0 br 96.88 fn 100.0 | uncovered lines: 
- packages/cms/src/trash/trash-item-tool.ts | lines 98.25 br 94.74 fn 65.0 | uncovered lines: 395-397
- packages/cms/src/trash/visibility.ts | lines 92.0 br 92.86 fn 75.0 | uncovered lines: 83-85,95
- packages/cms/src/webmcp/settings.ts | lines 47.62 br 100.0 fn 50.0 | uncovered lines: 15-25
- packages/cms/src/widgets/caption-track.ts | lines 93.94 br 94.59 fn 100.0 | uncovered lines: 53-54
- packages/cms/src/widgets/content-markers.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/cms/src/widgets/document-markers.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/cms/src/widgets/duplicate-embeds.ts | lines 100.0 br 91.3 fn 100.0 | uncovered lines: 
- packages/cms/src/widgets/entry-refs-extractor.ts | lines 65.54 br 90.48 fn 69.23 | uncovered lines: 53-57,143-159,165-167,182-185,187-190,193-194,198-206,365-366,380-383,386-396
- packages/cms/src/widgets/entry-refs.memory.ts | lines 77.42 br 100.0 fn 66.67 | uncovered lines: 34-37,40-42
- packages/cms/src/widgets/html/media-html.ts | lines 91.55 br 76.74 fn 92.86 | uncovered lines: 31-39,73,76-77
- packages/cms/src/widgets/markers/expand-partials.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- packages/cms/src/widgets/media-embed-resolution.ts | lines 99.31 br 89.8 fn 100.0 | uncovered lines: 167
- packages/cms/src/widgets/page-widget-resolution.ts | lines 100.0 br 95.45 fn 100.0 | uncovered lines: 
- packages/cms/src/widgets/resolvers/create-core-resolvers.ts | lines 100.0 br 77.78 fn 100.0 | uncovered lines: 
- packages/cms/src/widgets/site/publish-content.ts | lines 73.77 br 73.08 fn 61.54 | uncovered lines: 74-77,110-119,122-128,149,221-224,226-236,243-250,256,278-279
- packages/cms/src/widgets/tool-handlers.areas.ts | lines 92.65 br 76.27 fn 100.0 | uncovered lines: 50-51,74-75,136,152-153,166-167,178
- packages/cms/src/widgets/tool-handlers.instances.ts | lines 97.96 br 77.78 fn 100.0 | uncovered lines: 131-132
- packages/cms/src/widgets/tool-registrations.ts | lines 85.44 br 78.57 fn 100.0 | uncovered lines: 114-115,120-121,123-124,126-127,130-131,139-143
- packages/cms/src/widgets/widget-slug-normalization.ts | lines 100.0 br 87.5 fn 100.0 | uncovered lines: 
- packages/cms/src/workspace/repo.memory.ts | lines 98.15 br 92.59 fn 100.0 | uncovered lines: 56
- packages/cms/src/workspace/sql/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1
- packages/cms/src/workspace/sql/repo.ts | lines 100.0 br 96.55 fn 100.0 | uncovered lines: 
