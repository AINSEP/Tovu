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

REPO: Jini only. HEAD = codex/w62-cov-admin-4 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/admin/src/screens/library/hooks/use-library.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-4,6,108,110-114,116-124,126-130,132,134-136,138-156,158-168,170-172,174-175,177-179,182-185,187-190,192-217,219-220,223-232,234-246,251-256,258-272,274-275,278-282,284-286,288-29…
- packages/admin/src/screens/media/Media.tsx | lines 62.5 br 40.0 fn 80.0 | uncovered lines: 259-260,262-264,271,274-275,277-278,282-297,299
- packages/admin/src/screens/media/MediaCards.tsx | lines 92.5 br 59.09 fn 50.0 | uncovered lines: 34-38,40
- packages/admin/src/screens/media/MediaEditChildren.tsx | lines 19.05 br 100.0 fn 0.0 | uncovered lines: 47-50,52-59,61-64,66
- packages/admin/src/screens/media/MediaEditFields.tsx | lines 1.65 br 100.0 fn 0.0 | uncovered lines: 7-9,15-29,31,33-58,60,62-77,79,81-106,108,113-114,118-121,128-129,136-137,139,141-178,180,182-194,196,198-215,217,222,229-239,241,244,252-253,258-263,265-266,271-276,278-279,281-28…
- packages/admin/src/screens/media/MediaEditPanel.tsx | lines 5.36 br 100.0 fn 0.0 | uncovered lines: 30-55,57-58,60,62-69,71-78,82-88,90
- packages/admin/src/screens/media/MediaGridOrEmpty.tsx | lines 53.73 br 66.67 fn 50.0 | uncovered lines: 21-27,29,31-32,65-76,78,97-98,103-107,109
- packages/admin/src/screens/media/MediaLibraryPanel.tsx | lines 100.0 br 84.62 fn 60.0 | uncovered lines: 
- packages/admin/src/screens/media/MediaLightbox.tsx | lines 13.33 br 100.0 fn 0.0 | uncovered lines: 35-53,55-56,63-66,68
- packages/admin/src/screens/media/MediaPreview.tsx | lines 3.16 br 100.0 fn 0.0 | uncovered lines: 66-70,75-81,83-85,87-89,91,97-99,101,103-111,113,121-131,133,135-139,141,143-144,146,150,157-162,166-173,175-179,181,184-186,189-192,194,199-201,203-204,207,210-212
- packages/admin/src/screens/media/MediaPurgeDialog.tsx | lines 3.85 br 100.0 fn 0.0 | uncovered lines: 8-12,18-29,31-37,39
- packages/admin/src/screens/media/MediaToolbar.tsx | lines 4.88 br 100.0 fn 0.0 | uncovered lines: 25-27,29,31-32,34-44,46,48-54,56-67,69,71-81,83,94-121,123,134-138,142-146,148-156,158,161-165,167-171,173,182-187,189
- packages/admin/src/screens/media/api/media-api.ts | lines 48.96 br 100.0 fn 31.82 | uncovered lines: 52,61,83-91,123-128,130-131,133-136,138-139,141-144,146-147,157,159-162,164-166,168-170,175-178,181-183
- packages/admin/src/screens/media/hooks/use-edit-media-panel.hooks.ts | lines 71.63 br 78.12 fn 36.36 | uncovered lines: 178-179,181-182,184-185,187-188,190-191,193-194,196-197,203-207,211-212,215-220,223-224,227-231,236-237,246-248,254
- packages/admin/src/screens/media/hooks/use-media-card-details.hooks.ts | lines 100.0 br 72.73 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/media/hooks/use-media-item-link.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4,30-32,39-41,43-45,49-52,55-56,58-59
- packages/admin/src/screens/media/hooks/use-media-preview.hooks.ts | lines 77.78 br 100.0 fn 66.67 | uncovered lines: 80-82,84-86
- packages/admin/src/screens/media/hooks/use-media.hooks.ts | lines 94.85 br 79.31 fn 61.54 | uncovered lines: 178-179,208-209,262
- packages/admin/src/screens/media/media-providers-port.ts | lines 63.33 br 100.0 fn 75.0 | uncovered lines: 93-96,106-110,114-115
- packages/admin/src/screens/media/pinned-media-providers.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 5
- packages/admin/src/screens/media/rules.ts | lines 64.61 br 70.83 fn 44.44 | uncovered lines: 119-120,139-140,142-143,145-146,202-207,225-232,261-265,298-311,327-328,333-334,360-369,374-376,398-400,489-490
- packages/admin/src/screens/menus/MenuEditor.tsx | lines 100.0 br 100.0 fn 63.64 | uncovered lines: 
- packages/admin/src/screens/menus/MenuItemFields.tsx | lines 98.39 br 95.24 fn 82.35 | uncovered lines: 105
- packages/admin/src/screens/menus/MenuItemRow.tsx | lines 98.41 br 90.0 fn 71.43 | uncovered lines: 56
- packages/admin/src/screens/menus/MenuModeTabs.tsx | lines 100.0 br 100.0 fn 33.33 | uncovered lines: 
- packages/admin/src/screens/menus/Menus.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-3,26-28,30-31,33-58,60,63-82,84
- packages/admin/src/screens/menus/api/menus-api.ts | lines 72.73 br 100.0 fn 80.0 | uncovered lines: 16-17,19-22
- packages/admin/src/screens/menus/hooks/menu-tree.ts | lines 44.23 br 40.0 fn 50.0 | uncovered lines: 33-43,46-52,55-62,67,86-87
- packages/admin/src/screens/menus/hooks/menus-dependencies.hooks.ts | lines 63.77 br 63.16 fn 75.0 | uncovered lines: 56-57,68-83,105-111
- packages/admin/src/screens/menus/hooks/use-menu-editor-state.hooks.ts | lines 87.5 br 100.0 fn 66.67 | uncovered lines: 86-88,96-97,99-100,102-103
- packages/admin/src/screens/menus/hooks/use-menu-editor-writes.hooks.ts | lines 93.75 br 45.45 fn 88.89 | uncovered lines: 43,105-108
- packages/admin/src/screens/menus/hooks/use-menu-editor.hooks.ts | lines 94.74 br 75.0 fn 85.71 | uncovered lines: 104,114-115,172,175
- packages/admin/src/screens/menus/hooks/use-menus.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-3,8,68-79,81-93,99,103-106,108-110,113-131,133-143
- packages/admin/src/screens/menus/html-rules.ts | lines 26.67 br 50.0 fn 28.57 | uncovered lines: 10-16,20-23,25-27,29-43,58-61
- packages/admin/src/screens/menus/page-link-rules.ts | lines 100.0 br 98.18 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/observability/Observability.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-3,5,8-10,12-13,16-18,24-28,32-37,39-54,56,62-64,67-71,73-91,102-103,105-116,118-123,125-135,137-142,144-147,149,161-172,174,234,237-249,279,281-286,288-319,321-330,332-340,342-35…
- packages/admin/src/screens/observability/api/observability-api.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,20-21,28-30,32,37-43
