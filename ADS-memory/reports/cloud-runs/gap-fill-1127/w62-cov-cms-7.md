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

REPO: Jini only. HEAD = codex/w62-cov-cms-7 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/cms/src/react/media/chrome-playback-note.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 4,8,10-11,14-16
- packages/cms/src/react/media/hooks/use-grid-pages.hooks.ts | lines 94.12 br 73.33 fn 90.91 | uncovered lines: 96-97,144-145
- packages/cms/src/react/media/hooks/use-media-writes.hooks.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 45-57,59-64,71-76,78,83-85,87-92,94,103-105,107-112,114,116-118,120-127,129,136-139,141-142
- packages/cms/src/react/media/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2
- packages/cms/src/react/media/media-icons.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3-8,10,15-20,22,26-30,32,35-39,41,44-48,50
- packages/cms/src/react/media/use-media-provider-catalog.hooks.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 15-30
- packages/cms/src/react/pages/hooks/page-editor-save.ts | lines 63.08 br 81.82 fn 71.43 | uncovered lines: 31,48-55,58-60,167-171,173,178-183
- packages/cms/src/react/pages/hooks/use-preview-embed-ids.hooks.ts | lines 63.16 br 92.31 fn 60.0 | uncovered lines: 48-53,58,63-69
- packages/cms/src/react/posts/PostCoverImage.tsx | lines 60.94 br 63.64 fn 40.0 | uncovered lines: 76,84-88,90,92-97,99-105,107-110,112
- packages/cms/src/react/posts/editor/header/PostEditorActions.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,21-34,52-59,64-78,80-82,84,86-90,94-103,106,108-110,112,114-121,132-134,141-149,152,154-162,164-173,176,178-180,182,184-189,191
- packages/cms/src/react/posts/editor/header/PostEditorHeader.tsx | lines 90.22 br 42.86 fn 42.86 | uncovered lines: 100-101,146-147,163-166,168
- packages/cms/src/react/posts/editor/notices/PostEditorNotices.tsx | lines 64.44 br 77.78 fn 20.0 | uncovered lines: 76-83,87-94
- packages/cms/src/react/posts/editor/preview/PostPreview.tsx | lines 89.41 br 50.0 fn 100.0 | uncovered lines: 179-185,187,224
- packages/cms/src/react/posts/editor/preview/PostPreviewFrame.tsx | lines 81.97 br 75.0 fn 100.0 | uncovered lines: 64-73,75
- packages/cms/src/react/posts/editor/view-bar/PostEditorViewBar.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,15-28,44-58,60-67,75-84,86
- packages/cms/src/react/posts/hooks/post-editor-messages.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,16,19,22-24,27-34,41-43,51-52,55-58,61,64,75,79-88
- packages/cms/src/react/posts/hooks/post-editor-save.rules.ts | lines 71.43 br 72.22 fn 50.0 | uncovered lines: 84-90,99-101,110-111
- packages/cms/src/react/posts/hooks/post-editor-state.rules.ts | lines 25.0 br 50.0 fn 16.67 | uncovered lines: 43-49,58-59,70-75,80,87,90-96,106-120,136-141
- packages/cms/src/react/posts/hooks/use-post-featured-image.hooks.ts | lines 100.0 br 92.31 fn 85.71 | uncovered lines: 
- packages/cms/src/react/posts/hooks/use-post-url-dialog.hooks.ts | lines 86.96 br 88.24 fn 80.0 | uncovered lines: 36-37,76-82
- packages/cms/src/react/posts/post-editor-input.rules.ts | lines 85.84 br 42.86 fn 53.33 | uncovered lines: 64-66,70-72,79-80,91-92,229-230,311-312,318-319
- packages/cms/src/react/posts/post-editor-rules.ts | lines 22.22 br 100.0 fn 0.0 | uncovered lines: 16-23,65-68,71,93-94,99,132-137,147-152,162-165,170-171,175-180,184-185
- packages/cms/src/react/posts/posts-list-rules.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 16,40,73-83,95-100
- packages/cms/src/react/publish-content/PublishContentActions.tsx | lines 83.15 br 88.89 fn 100.0 | uncovered lines: 99-111,113-114
- packages/cms/src/react/publish-content/PublishContentDialog.tsx | lines 86.84 br 60.0 fn 33.33 | uncovered lines: 137,139-142
- packages/cms/src/react/publish-content/PublishContentReport.tsx | lines 14.84 br 30.0 fn 33.33 | uncovered lines: 16-18,21-23,26-28,31-33,36-43,46-48,55-60,68-80,83-85,88,94-95,97-116,118-121,123-124,126,128-129,132-139,142-162,164,166-167,169-174,177-192,194
- packages/cms/src/react/publish-content/api/publish-content-api.ts | lines 98.25 br 73.33 fn 77.78 | uncovered lines: 32
- packages/cms/src/react/publish-content/hooks/publish-completion.rules.ts | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- packages/cms/src/react/publish-content/hooks/publish-confirm-view.ts | lines 99.56 br 91.03 fn 92.86 | uncovered lines: 357
- packages/cms/src/react/publish-content/hooks/publish-content-confirm.rules.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 13-21,29-32,36-40,48-50
- packages/cms/src/react/publish-content/hooks/publish-execution.hooks.ts | lines 86.57 br 72.73 fn 100.0 | uncovered lines: 16-23,39-41,101-103,132,138-140
- packages/cms/src/react/publish-content/hooks/publish-lifecycle.hooks.ts | lines 89.31 br 90.48 fn 76.92 | uncovered lines: 71-72,107-109,127-129,178-184,189-190
- packages/cms/src/react/publish-content/hooks/publish-peers.hooks.ts | lines 86.41 br 70.83 fn 100.0 | uncovered lines: 66-69,76-79,106-109,144-145
- packages/cms/src/react/publish-content/hooks/publish-plan.hooks.ts | lines 88.15 br 84.21 fn 100.0 | uncovered lines: 60-66,172,190-197
- packages/cms/src/react/widgets/EmbedInsertControl/EmbedInsertControl.hooks.ts | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- packages/cms/src/react/widgets/EmbedInsertControl/EmbedInsertControl.tsx | lines 84.24 br 47.83 fn 42.31 | uncovered lines: 202-208,211-213,253-255,263-265,278-281,288-292,336
- packages/cms/src/react/widgets/WidgetConfigFields/HtmlAttributeRows.tsx | lines 100.0 br 81.82 fn 80.0 | uncovered lines: 
- packages/cms/src/react/widgets/WidgetConfigFields/MediaContentEditor.hooks.ts | lines 78.34 br 60.61 fn 48.39 | uncovered lines: 137-138,152-154,158-164,187-193,209-217,237-239,260-262
- packages/cms/src/react/widgets/WidgetConfigFields/MediaContentEditor.tsx | lines 80.74 br 56.45 fn 47.37 | uncovered lines: 46-52,117-120,172,184,203-206,340-342,348-353,357-371,373-383,385,394-397
- packages/cms/src/react/widgets/WidgetConfigFields/WidgetConfigFields.controls.tsx | lines 88.18 br 68.0 fn 58.33 | uncovered lines: 30-32,155-164
- packages/cms/src/react/widgets/WidgetConfigFields/WidgetConfigFields.tsx | lines 40.95 br 63.16 fn 33.33 | uncovered lines: 111,116-127,129,132,137-140,142-167,169-177,179-181,183,301-309,311-312,314-326,328-335,337,342-350,352-353,355-367,369-385,387,402,404,406,414
- packages/cms/src/react/widgets/WidgetConfigFields/media-content-rules.ts | lines 68.75 br 84.81 fn 76.92 | uncovered lines: 97-102,233-241,270-277,287-297,304-308,316-322,327-330
- packages/cms/src/react/widgets/WidgetPickerDialog/WidgetPickerDialog.hooks.tsx | lines 52.76 br 78.57 fn 37.5 | uncovered lines: 73,170-176,179-185,227-235,246-249,257,260-280,282-289,291-292
- packages/cms/src/react/widgets/WidgetPickerDialog/WidgetPickerDialog.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,5,54-56,61-63,68-70,95-100,102,104-112,114,116-117,119-120,122-127,129,131-132,135-144,146-149,151,153-154,158-185,187,189-190,194-206,209-218,220,254-257,259-262,266,268-281,283…
- packages/cms/src/redirects/redirects.ts | lines 100.0 br 99.52 fn 100.0 | uncovered lines: 
- packages/cms/src/redirects/site/publish-content.ts | lines 100.0 br 90.32 fn 100.0 | uncovered lines: 
- packages/cms/src/redirects/tool-registrations.ts | lines 98.84 br 94.12 fn 100.0 | uncovered lines: 225-226
- packages/cms/src/seo/content-analysis/analyze-content.ts | lines 97.24 br 76.19 fn 100.0 | uncovered lines: 162-163,223-224
- packages/cms/src/seo/content-analysis/summary.ts | lines 83.78 br 68.75 fn 55.56 | uncovered lines: 28,30,32,34,38,57
- packages/cms/src/seo/content-analyzer-plugin/plugin.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/cms/src/seo/cover-image.ts | lines 14.29 br 66.67 fn 16.67 | uncovered lines: 12-25,30-39,48-61,73-74,77-82,89-96
- packages/cms/src/seo/feed.ts | lines 90.91 br 100.0 fn 100.0 | uncovered lines: 52-55
- packages/cms/src/seo/html-plain-text.ts | lines 100.0 br 97.14 fn 100.0 | uncovered lines: 
- packages/cms/src/seo/seo.ts | lines 100.0 br 99.17 fn 100.0 | uncovered lines: 
- packages/cms/src/seo/site/page-head-contributor.ts | lines 72.73 br 50.0 fn 100.0 | uncovered lines: 31-33,38-40
- packages/cms/src/seo/site/settings.ts | lines 84.45 br 83.08 fn 87.5 | uncovered lines: 248-249,258-263,274-275,280-281,284-298,302-311
- packages/cms/src/seo/site/tool-registrations.ts | lines 66.67 br 100.0 fn 75.0 | uncovered lines: 55-58,72-85
