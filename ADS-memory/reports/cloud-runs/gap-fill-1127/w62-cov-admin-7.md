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

REPO: Jini only. HEAD = codex/w62-cov-admin-7 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/admin/src/screens/routines/Routines.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,7-8,37,39,41-51,53-56,58,60-71,73,75-88,90,94-122,124
- packages/admin/src/screens/routines/RoutinesMount.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,11,15-20
- packages/admin/src/screens/routines/project-routine-row.ts | lines 77.78 br 53.33 fn 83.33 | uncovered lines: 18-20,24-28
- packages/admin/src/screens/routines/routines-api.ts | lines 36.67 br 100.0 fn 33.33 | uncovered lines: 48-58,60-64,75-96
- packages/admin/src/screens/settings/ExternalMcpSharedChoice.hooks.ts | lines 93.94 br 72.73 fn 100.0 | uncovered lines: 57,63
- packages/admin/src/screens/settings/ExternalMcpSharedChoice.tsx | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/settings/ExternalMcpToolPicker.hooks.tsx | lines 73.77 br 93.75 fn 42.86 | uncovered lines: 24-25,64-70,78-80,89-91,118
- packages/admin/src/screens/settings/ExternalMcpToolPicker.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,5,15,18,73,80-84,86-104,110-120,127-134,136-138,140-141,143,148,156-177,179-186,188-198,200-202,204,211,221-230,232-242,244-251,253-256,258,265,275-276,278-282,284,286-290,292,…
- packages/admin/src/screens/settings/ExternalMcpToolsModal.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,6,61-75,77-85,87-91,94-100,102-122,124
- packages/admin/src/screens/settings/SettingsUi.hooks.ts | lines 81.82 br 100.0 fn 80.0 | uncovered lines: 77-79,81
- packages/admin/src/screens/settings/SettingsUi.tsx | lines 92.16 br 77.78 fn 88.89 | uncovered lines: 169-172,174,211-213
- packages/admin/src/screens/settings/SettingsUiTabs.tsx | lines 97.45 br 86.67 fn 76.47 | uncovered lines: 24-28,30,125
- packages/admin/src/screens/settings/external-mcp-tool-picker-rules.ts | lines 97.08 br 96.36 fn 87.5 | uncovered lines: 83-84,431-432
- packages/admin/src/screens/settings/hooks/use-external-mcp-oauth-connect.hooks.ts | lines 89.01 br 79.41 fn 75.0 | uncovered lines: 48-52,116-117,132,148-149
- packages/admin/src/screens/settings/hooks/use-settings-active-tab-scroll.hooks.ts | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- packages/admin/src/screens/settings/rules.ts | lines 92.66 br 100.0 fn 80.95 | uncovered lines: 469-471,477-482,491-495,500-501
- packages/admin/src/screens/sites/AllSitesTab.tsx | lines 98.15 br 87.5 fn 100.0 | uncovered lines: 185-186
- packages/admin/src/screens/sites/SiteCardView.tsx | lines 100.0 br 68.42 fn 88.89 | uncovered lines: 
- packages/admin/src/screens/sites/SiteTrashTab.tsx | lines 100.0 br 93.75 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/sites/use-local-sites.hooks.ts | lines 100.0 br 98.68 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/skills/SkillInstallConfirmation.tsx | lines 96.43 br 62.5 fn 100.0 | uncovered lines: 19
- packages/admin/src/screens/skills/SkillRemoveConfirmDialog.tsx | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/skills/SkillRow.tsx | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/skills/Skills.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,5-7
- packages/admin/src/screens/skills/Skills.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-5,7-8,11-29,31,34-57,59,62-68,70,73,78-88,90-104,106
- packages/admin/src/screens/skills/skill-drop.ts | lines 3.64 br 100.0 fn 0.0 | uncovered lines: 12-46,50,55-56,58-61,67-69,71-78
- packages/admin/src/screens/skills/skill-failure.ts | lines 100.0 br 33.33 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/skills/skill-upload.ts | lines 100.0 br 96.3 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/skills/skills-page-dictionary.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/skills/use-skill-confirmation.hooks.ts | lines 76.67 br 100.0 fn 50.0 | uncovered lines: 28-34
- packages/admin/src/screens/skills/use-skills-tabs.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,5-6,9-20
- packages/admin/src/screens/storage/ScreenshotCleanupSection.tsx | lines 83.33 br 14.29 fn 33.33 | uncovered lines: 16-18
- packages/admin/src/screens/storage/StoragePanel.tsx | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/storage/api/screenshot-cleanup-api.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 24-30
- packages/admin/src/screens/storage/api/storage-api.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 57-65
- packages/admin/src/screens/storage/hooks/use-screenshot-cleanup.hooks.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/storage/hooks/use-storage.hooks.ts | lines 96.43 br 61.64 fn 100.0 | uncovered lines: 36-37,55
- packages/admin/src/screens/storage/storage-screen-bindings.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,6,9-11,13,18-23,25,32-33,35-50
- packages/admin/src/screens/taxonomy/Taxonomy.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-4,7-8,92-94,96-118,122-125,127-135,137,149-156,158-164,167-175,177-180,182,193-202,204-209,211,222-242,244-249,251,263-267,269-274,276,283-284,287-296,298-300,302-305,307-316,325…
- packages/admin/src/screens/taxonomy/TaxonomyTermList.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3-5,29-31,37-46,48-49,51,53-54,57,62-86,88-95,98-102,104-111,113-121,123,164,168,175,178-180,182-184,187-197,199-200,202,205,211-223,230-234,236-243,245,248,252-273,275,282,285-286…
- packages/admin/src/screens/taxonomy/TermDetailPanel.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3-4,35-45,47-53,57-65,67-69,71,82-100,102-104,106,115-118,120-128,130-132,134,136-142,144,146-149,151-153,155-163,165-166,168,180-182,184-217,219-226,228
- packages/admin/src/screens/taxonomy/TermPicker.tsx | lines 100.0 br 81.25 fn 73.68 | uncovered lines: 
- packages/admin/src/screens/taxonomy/api/taxonomy-api.ts | lines 75.93 br 100.0 fn 72.73 | uncovered lines: 25-26,28-31,35,54-55,57-60
- packages/admin/src/screens/taxonomy/hooks/merge-term-section-dependencies.hooks.ts | lines 22.22 br 100.0 fn 40.0 | uncovered lines: 38-40,42-56,58-61,63-68
- packages/admin/src/screens/taxonomy/hooks/new-taxonomy-form-dependencies.hooks.ts | lines 22.22 br 100.0 fn 66.67 | uncovered lines: 30,34-35,37-38,40-55
- packages/admin/src/screens/taxonomy/hooks/new-term-form-dependencies.hooks.ts | lines 22.22 br 100.0 fn 66.67 | uncovered lines: 39-40,42-43,45-61
- packages/admin/src/screens/taxonomy/hooks/taxonomy-dependencies.hooks.ts | lines 35.42 br 100.0 fn 28.57 | uncovered lines: 24-30,64-69,79-85,88-92,95-100
- packages/admin/src/screens/taxonomy/hooks/term-picker-dependencies.hooks.ts | lines 27.91 br 100.0 fn 42.86 | uncovered lines: 54-65,67-85
