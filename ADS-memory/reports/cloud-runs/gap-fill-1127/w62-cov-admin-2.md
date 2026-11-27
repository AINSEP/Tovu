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

REPO: Jini only. HEAD = codex/w62-cov-admin-2 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/admin/src/screens/auth/auth-i18n.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/auth/hooks/use-login.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,43-45,47-51,59-75
- packages/admin/src/screens/collections/CollectionEntries.tsx | lines 100.0 br 90.91 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/collections/EditFieldsDialog.tsx | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/admin/src/screens/collections/LifecycleConfirmDialog.tsx | lines 100.0 br 71.43 fn 50.0 | uncovered lines: 
- packages/admin/src/screens/collections/NewContentTypeDialog.tsx | lines 100.0 br 100.0 fn 80.0 | uncovered lines: 
- packages/admin/src/screens/collections/api/collections-api.ts | lines 28.57 br 100.0 fn 33.33 | uncovered lines: 17-20,22-23,25-28,30-35,37-40,44-45,47,49,53,55-58,60-61,63-66
- packages/admin/src/screens/collections/hooks/collection-entries-dependencies.hooks.ts | lines 70.0 br 100.0 fn 66.67 | uncovered lines: 43-45,47-49
- packages/admin/src/screens/collections/hooks/collection-entry-editor-dependencies.hooks.ts | lines 13.33 br 100.0 fn 75.0 | uncovered lines: 24-39,61,65-67,69-113
- packages/admin/src/screens/collections/hooks/collections-dependencies.hooks.ts | lines 59.26 br 100.0 fn 66.67 | uncovered lines: 46-47,49-57
- packages/admin/src/screens/collections/hooks/edit-fields-dialog-dependencies.hooks.ts | lines 51.85 br 100.0 fn 66.67 | uncovered lines: 44-45,47-57
- packages/admin/src/screens/collections/hooks/new-content-type-dialog-dependencies.hooks.ts | lines 78.57 br 100.0 fn 60.0 | uncovered lines: 49-50,52-55
- packages/admin/src/screens/collections/hooks/use-collection-entries.hooks.ts | lines 62.5 br 25.0 fn 50.0 | uncovered lines: 61-69
- packages/admin/src/screens/collections/hooks/use-collection-entry-editor.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3-4,118-141,143-147,155-156,159,166-174,176-197,199-200,205-208,210-221,223-226,228-229,232,244,248-269,271-274,276-280,286,296-298,302-306,308-329,331-334,336-337,340-359,361-36…
- packages/admin/src/screens/collections/hooks/use-collections.hooks.ts | lines 71.88 br 77.78 fn 20.0 | uncovered lines: 117,123-126,128-129,132-138,141-143,148
- packages/admin/src/screens/collections/hooks/use-edit-fields-dialog.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4-5,9,48-49,55-60,62-65,67-72,74-76,78-80,82-84,86-88,90-94,96-104,106-109,111-112,114-115
- packages/admin/src/screens/collections/hooks/use-new-content-type-dialog.hooks.ts | lines 60.71 br 66.67 fn 28.57 | uncovered lines: 71-73,77,83-84,87-88,91-92,104-112,114-116
- packages/admin/src/screens/collections/rules.ts | lines 83.65 br 83.87 fn 90.48 | uncovered lines: 49-53,119,121-124,143-144,155-156,195-196,200-201,211-212,225-226,242-243,253-254
- packages/admin/src/screens/comments/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 10,27-30
- packages/admin/src/screens/consent/ConsentOverviewTab.tsx | lines 84.62 br 29.41 fn 100.0 | uncovered lines: 41-48,50-51
- packages/admin/src/screens/consent/CookieConsent.tsx | lines 75.0 br 66.67 fn 76.92 | uncovered lines: 102-105,119-126,128-130,132,137-141,171-182,184
- packages/admin/src/screens/consent/consent-autosave.ts | lines 100.0 br 96.15 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/consent/consent-i18n.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/consent/use-consent-page.hooks.ts | lines 100.0 br 94.32 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/content-analysis/content-analysis-i18n.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/content-analysis/hooks/content-analysis-dependencies.hooks.ts | lines 85.19 br 50.0 fn 60.0 | uncovered lines: 39-40,43-44
- packages/admin/src/screens/content-analysis/hooks/use-content-analysis.hooks.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/content-analysis/rules.ts | lines 99.16 br 77.78 fn 100.0 | uncovered lines: 127-128
- packages/admin/src/screens/dashboard/Dashboard.tsx | lines 100.0 br 97.5 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/dashboard/hooks/use-dashboard.hooks.ts | lines 100.0 br 98.48 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/database/Database.tsx | lines 100.0 br 98.55 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/database/api/database-api.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,13-14,16,23-35,38,42-46,48-56,62-68
- packages/admin/src/screens/database/hooks/use-migrate-forward-section.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,4-5,64,100-108,115-123,125-133,135-143,145-150,152-153,155-161,163-164,166-172,178-180,182,186-188,190-191
- packages/admin/src/screens/database/hooks/use-schema-state-section.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-3,6,59-62,64,70-73,75-76
- packages/admin/src/screens/database/hooks/use-timeline-section.hooks.ts | lines 32.39 br 50.0 fn 50.0 | uncovered lines: 164-166,168-178,180-183,187-191,193-196,198-199,201-219
- packages/admin/src/screens/database/rules.ts | lines 91.43 br 100.0 fn 66.67 | uncovered lines: 41-46
- packages/admin/src/screens/email/Email.hooks.ts | lines 77.78 br 100.0 fn 50.0 | uncovered lines: 5-6
- packages/admin/src/screens/email/EmailActivityTab.tsx | lines 53.96 br 51.11 fn 47.06 | uncovered lines: 59-61,88,91-109,111-112,196,208-220,222-231,233,235-248,250-262,264-277,279,281-287,289-312,314-315,317-318,320
- packages/admin/src/screens/email/EmailOverviewTab.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,5,15-21,23-28,31-40,42-62,64,67-78,80-86,88,90-99,101,103-129,131
- packages/admin/src/screens/email/EmailParts.tsx | lines 100.0 br 92.59 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/email/EmailProviderTab.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,5-7,10-12
- packages/admin/src/screens/email/EmailSegments.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 16-24,26
- packages/admin/src/screens/email/EmailSenderTab.tsx | lines 55.83 br 59.09 fn 50.0 | uncovered lines: 72-104,106-107,109,126-137,139,141,143,150-165,167,174-177
- packages/admin/src/screens/email/EmailTemplateEditor.hooks.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 5-7
- packages/admin/src/screens/email/EmailTemplateEditor.tsx | lines 91.3 br 51.85 fn 62.5 | uncovered lines: 45-57,96,135,227-231
- packages/admin/src/screens/email/EmailTemplatesTab.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-4,6-9,16-28,31-45,47-63,65,67-68,70-85,87-107,109-111,113,115
- packages/admin/src/screens/email/api/mail-status-api.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 13-14,16-18
- packages/admin/src/screens/email/email-api.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 28-30,32-37,39-44,47-52,54-55,57-59,61-65,67-70,72-76,78-86,88,90-95
- packages/admin/src/screens/email/email-tabs-i18n.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/email/hooks/email-load.hooks.ts | lines 100.0 br 94.74 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/email/hooks/use-email-activity.hooks.ts | lines 68.39 br 89.74 fn 85.71 | uncovered lines: 89-99,133-134,141-152,155-164,167-168,250-261
- packages/admin/src/screens/email/hooks/use-email-overview.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4,36-42,44-50,52-55,57-58
- packages/admin/src/screens/email/hooks/use-email-provider.hooks.ts | lines 70.54 br 75.76 fn 100.0 | uncovered lines: 72-73,83-85,131-148,157-171
- packages/admin/src/screens/email/hooks/use-email-sender.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4,34,38-46,49-52,55-61,67-77,79-81,83-86,88-106,108-118,120-122
