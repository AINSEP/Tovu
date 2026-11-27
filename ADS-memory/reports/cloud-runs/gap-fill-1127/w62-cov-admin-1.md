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

REPO: Jini only. HEAD = codex/w62-cov-admin-1 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/admin/src/browser/server-reconnect.ts | lines 72.41 br 66.67 fn 80.0 | uncovered lines: 70-75,95-96,124,126-132
- packages/admin/src/browser/settings-events.ts | lines 80.36 br 45.45 fn 66.67 | uncovered lines: 71-72,79,81,88-90,98-101
- packages/admin/src/comments/conformance/comments-api.conformance.ts | lines 100.0 br 97.3 fn 100.0 | uncovered lines: 
- packages/admin/src/core/i18n-common.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/admin/src/core/manifest/rules.ts | lines 100.0 br 90.28 fn 100.0 | uncovered lines: 
- packages/admin/src/core/settings-tab-appearance.ts | lines 100.0 br 92.86 fn 100.0 | uncovered lines: 
- packages/admin/src/core/settings-tab-preferences.ts | lines 100.0 br 90.0 fn 100.0 | uncovered lines: 
- packages/admin/src/core/settings-tab-privacy.ts | lines 100.0 br 89.47 fn 100.0 | uncovered lines: 
- packages/admin/src/core/settings-tabs.ts | lines 100.0 br 90.91 fn 100.0 | uncovered lines: 
- packages/admin/src/deployment/api/deployment-api.ts | lines 100.0 br 88.24 fn 100.0 | uncovered lines: 
- packages/admin/src/deployment/deployment-i18n.tsx | lines 98.98 br 100.0 fn 93.75 | uncovered lines: 72-73
- packages/admin/src/forms/adapters/http.ts | lines 100.0 br 96.0 fn 100.0 | uncovered lines: 
- packages/admin/src/forms/adapters/memory.ts | lines 100.0 br 98.92 fn 100.0 | uncovered lines: 
- packages/admin/src/forms/form-editor-refresh.ts | lines 100.0 br 90.7 fn 100.0 | uncovered lines: 
- packages/admin/src/forms/html-rules.ts | lines 100.0 br 98.5 fn 100.0 | uncovered lines: 
- packages/admin/src/forms/react/components/FormProviderSettings.tsx | lines 96.77 br 88.46 fn 100.0 | uncovered lines: 37
- packages/admin/src/forms/react/components/FormSubmissionDetail.tsx | lines 100.0 br 96.55 fn 100.0 | uncovered lines: 
- packages/admin/src/forms/react/hooks/use-form-editor-parts.hooks.ts | lines 99.36 br 93.33 fn 100.0 | uncovered lines: 122
- packages/admin/src/forms/react/hooks/use-form-editor-refresh.hooks.ts | lines 98.73 br 91.8 fn 100.0 | uncovered lines: 129
- packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts | lines 100.0 br 93.75 fn 100.0 | uncovered lines: 
- packages/admin/src/media/adapters/http.ts | lines 89.94 br 79.71 fn 79.41 | uncovered lines: 103-104,106-113,116-121
- packages/admin/src/media/react/hooks/ProvidersTab.hooks.ts | lines 100.0 br 100.0 fn 92.86 | uncovered lines: 
- packages/admin/src/pages/PageEditor.tsx | lines 99.12 br 81.25 fn 72.73 | uncovered lines: 194
- packages/admin/src/pages/PageEditorNotices.tsx | lines 73.83 br 50.0 fn 58.33 | uncovered lines: 21-29,31-37,39-41,43,164-170,179-185,187-188,190,250,253
- packages/admin/src/pages/PageEditorPane.tsx | lines 58.78 br 50.0 fn 66.67 | uncovered lines: 28-38,40,104-105,108-109,113-117,119-142,144,168-181,183
- packages/admin/src/pages/PageEditorPreview.tsx | lines 99.19 br 61.54 fn 60.0 | uncovered lines: 262
- packages/admin/src/pages/Pages.tsx | lines 98.56 br 84.85 fn 90.48 | uncovered lines: 248-250
- packages/admin/src/pages/ThemePageDetailsModal.hooks.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,41-43,45-50,52-55,57-59,61-62
- packages/admin/src/pages/api/pages-api.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 14-22,27-28,34-38,42-47
- packages/admin/src/pages/hooks/page-editor-actions.hooks.ts | lines 75.56 br 66.67 fn 100.0 | uncovered lines: 139-146,148-150,158-168
- packages/admin/src/pages/hooks/page-editor-load.hooks.ts | lines 98.85 br 76.0 fn 85.71 | uncovered lines: 142
- packages/admin/src/pages/hooks/page-editor-preview.hooks.ts | lines 76.54 br 86.21 fn 71.43 | uncovered lines: 27-31,90-94,121,126-132,134
- packages/admin/src/pages/hooks/page-editor-recovery.hooks.ts | lines 88.3 br 90.0 fn 66.67 | uncovered lines: 49-57,85-86
- packages/admin/src/pages/hooks/page-editor-workspace.hooks.ts | lines 92.36 br 86.21 fn 75.0 | uncovered lines: 200,209,213,218-220,247-248,278,280-281,291
- packages/admin/src/pages/hooks/use-editor-html-jump.hooks.ts | lines 100.0 br 96.97 fn 100.0 | uncovered lines: 
- packages/admin/src/pages/hooks/use-interactive-flush.hooks.ts | lines 100.0 br 94.74 fn 100.0 | uncovered lines: 
- packages/admin/src/pages/hooks/use-page-editor.hooks.ts | lines 95.0 br 100.0 fn 75.0 | uncovered lines: 457-458
- packages/admin/src/pages/hooks/use-pages.hooks.ts | lines 66.67 br 82.35 fn 70.0 | uncovered lines: 152-154,185-196,202-204,230-239,242-245,257,266-268
- packages/admin/src/pages/lib/embed-placeholder.ts | lines 100.0 br 96.08 fn 100.0 | uncovered lines: 
- packages/admin/src/pages/lib/page-preview-youtube.ts | lines 78.79 br 53.85 fn 100.0 | uncovered lines: 10-13,28-30
- packages/admin/src/pages/lib/prettify-html.ts | lines 100.0 br 98.28 fn 100.0 | uncovered lines: 
- packages/admin/src/pages/page-editor-i18n.ts | lines 100.0 br 84.62 fn 100.0 | uncovered lines: 
- packages/admin/src/pages/page-editor-rules.ts | lines 100.0 br 95.35 fn 100.0 | uncovered lines: 
- packages/admin/src/posts/PostPublishingFields.tsx | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/admin/src/posts/PostSettingsDialog.tsx | lines 98.04 br 84.62 fn 66.67 | uncovered lines: 73
- packages/admin/src/posts/Posts.tsx | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/admin/src/posts/PostsColumns.tsx | lines 100.0 br 90.0 fn 94.12 | uncovered lines: 
- packages/admin/src/posts/PostsTrashConfirm.tsx | lines 85.0 br 33.33 fn 50.0 | uncovered lines: 12-14
- packages/admin/src/posts/api/posts-api.ts | lines 92.86 br 100.0 fn 92.86 | uncovered lines: 51-54
- packages/admin/src/posts/editor/PostDeleteConfirmDialog.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-4,11-19,27-48,50
- packages/admin/src/posts/editor/template/PostEditorTemplatePicker.tsx | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/admin/src/posts/hooks/use-posts.hooks.ts | lines 73.86 br 77.42 fn 76.92 | uncovered lines: 227,230-241,244-247,253-258
- packages/admin/src/react/components/RowMenu/RowMenu.hooks.tsx | lines 100.0 br 98.31 fn 100.0 | uncovered lines: 
- packages/admin/src/react/entities/EntityField.tsx | lines 100.0 br 98.18 fn 100.0 | uncovered lines: 
- packages/admin/src/react/entities/FailureNotice.tsx | lines 80.0 br 85.71 fn 80.0 | uncovered lines: 23-25,27-28,33-34
- packages/admin/src/react/entities/use-entity-edit.ts | lines 100.0 br 98.96 fn 100.0 | uncovered lines: 
- packages/admin/src/react/settings/SettingsPageLayout.tsx | lines 89.2 br 94.44 fn 70.0 | uncovered lines: 25-29,31,62-73,75
- packages/admin/src/react/shell/Placeholder.tsx | lines 77.19 br 40.0 fn 100.0 | uncovered lines: 46-47,60-61,91,133-137,139-140,142
- packages/admin/src/react/shell/appearance.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- packages/admin/src/react/testing-kit-media-providers.ts | lines 100.0 br 92.54 fn 100.0 | uncovered lines: 
- packages/admin/src/react/testing-kit.tsx | lines 77.05 br 84.87 fn 44.15 | uncovered lines: 14-18,23-27,29-32,47,51-54,63-70,72,77-79,147-149,152-156,164-166,168-183,185-187,190-191,207-209,227-230,277,281,291-293,335-337,380-382
- packages/admin/src/recovery/api/recovery-api.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 12-13,16-39,41-47,49-54
- packages/admin/src/recovery/hooks/use-recovery.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-3,6,8,11,98-107,110-120,122-123,133-144,149-163,169-177,179-180
- packages/admin/src/recovery/hooks/use-restore-flow.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4,8,84-93,95-112,114-115,118-134,136-137,141-154,156-175,177-178,180-186,188-195,197-216
- packages/admin/src/recovery/rules.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,4,21,23-26,28-48,57-61,70-74,76-79,95,98-100,113-115,134-140,160-162
- packages/admin/src/roles/PoliciesSection.tsx | lines 5.8 br 100.0 fn 0.0 | uncovered lines: 34-37,39-62,64-72,74-99,101,103
- packages/admin/src/roles/PolicyPermissionForm.tsx | lines 3.33 br 100.0 fn 0.0 | uncovered lines: 22-24,28-41,43-47,49,57-83,85-91,93
- packages/admin/src/roles/PolicyRow.tsx | lines 7.79 br 100.0 fn 0.0 | uncovered lines: 75-84,86-91,93-95,97-112,114,121-131,133,135-142,144,146-158,160
- packages/admin/src/roles/RoleConfirmDialogs.tsx | lines 79.49 br 33.33 fn 50.0 | uncovered lines: 27-31,62-66,109-114
- packages/admin/src/roles/Roles.hooks.tsx | lines 68.42 br 100.0 fn 50.0 | uncovered lines: 43-47,49,53-57,59
- packages/admin/src/roles/Roles.tsx | lines 72.44 br 84.62 fn 83.33 | uncovered lines: 122-163,165
- packages/admin/src/roles/RolesSection.tsx | lines 75.0 br 57.14 fn 70.0 | uncovered lines: 144-148,155-156,159-166,168-173,175-177,179
- packages/admin/src/roles/hooks/roles-permission-actions.ts | lines 33.7 br 100.0 fn 37.5 | uncovered lines: 27-36,43-49,64-67,73-76,80-82,91-98,113-117,122-132,140-145,147-149
- packages/admin/src/roles/hooks/roles-row-actions.ts | lines 32.48 br 80.0 fn 33.33 | uncovered lines: 28-29,37-49,61-66,71-81,86-96,113,121-125,136-146,160-170,179-184,186-187
- packages/admin/src/roles/hooks/use-roles-mutations.hooks.ts | lines 94.0 br 100.0 fn 22.22 | uncovered lines: 17,33,46
- packages/admin/src/roles/hooks/use-roles.hooks.ts | lines 98.21 br 75.0 fn 100.0 | uncovered lines: 211
- packages/admin/src/roles/rules.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/analytics/api/analytics-api.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,14-21
- packages/admin/src/screens/assistant-settings/AdminSubagents.tsx | lines 100.0 br 96.15 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/assistant-settings/VisitorAssistantPanel.tsx | lines 100.0 br 80.0 fn 60.0 | uncovered lines: 
- packages/admin/src/screens/assistant-settings/use-visitor-assistant-panel.hooks.ts | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- packages/admin/src/screens/assistant-settings/use-visitor-assistant-tabs.hooks.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/assistant-settings/use-visitor-credential-discovery.hooks.ts | lines 82.26 br 94.74 fn 100.0 | uncovered lines: 67-68,104,107-109,117-121
- packages/admin/src/screens/assistant-settings/use-visitor-credential-form.hooks.ts | lines 100.0 br 85.19 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/assistant-settings/use-visitor-tools.hooks.ts | lines 100.0 br 92.86 fn 90.91 | uncovered lines: 
- packages/admin/src/screens/assistant-settings/visitor-credential-form-actions.ts | lines 81.43 br 40.0 fn 100.0 | uncovered lines: 82-83,118-119,147-148,163-165,169-170,185-186
- packages/admin/src/screens/auth/Login.tsx | lines 100.0 br 85.71 fn 40.0 | uncovered lines: 
- packages/admin/src/screens/auth/OwnerRecoverySignIn.hooks.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3,6-17
- packages/admin/src/screens/auth/OwnerRecoverySignIn.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4-5,18-34
- packages/admin/src/screens/auth/api/auth-api.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 13-18,20-24,33-37,41-44,50,54-57
