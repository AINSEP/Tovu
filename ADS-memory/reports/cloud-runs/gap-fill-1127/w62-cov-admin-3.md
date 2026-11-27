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

REPO: Jini only. HEAD = codex/w62-cov-admin-3 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/admin/src/screens/email/hooks/use-email-template-editor.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4,41-43,46-49,52-54,62-70,72-78,80-83,85-86,90-97,100-107,109-118,120-127,129-130,132-149,151-152,154-167,170-178,180-185
- packages/admin/src/screens/email/hooks/use-email-template-view.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,33-38
- packages/admin/src/screens/email/hooks/use-email-templates.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4,13-15,38-49,51-62,64-68,70-87,89-102,104-107
- packages/admin/src/screens/email/hooks/use-email.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,40-45,47-49,57-74
- packages/admin/src/screens/forms/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 11,29-32,35-39
- packages/admin/src/screens/import-export/GitBackupCard.tsx | lines 100.0 br 96.0 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/import-export/api/import-export-api.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 13-14,21-25,28-30
- packages/admin/src/screens/import-export/hooks/use-git-backup.hooks.ts | lines 100.0 br 98.0 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/integrations/api/integrations-api.ts | lines 80.37 br 100.0 fn 53.85 | uncovered lines: 135,140-143,147-150,161-164,176,178,181-184,210,230
- packages/admin/src/screens/integrations/hooks/use-integrations-redirect.hooks.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/integrations/i18n/integrations-dict-es-to-ko.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-399
- packages/admin/src/screens/integrations/i18n/integrations-dict-pl-to-bn.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-363
- packages/admin/src/screens/integrations/integrations-i18n.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3-5,23-26,29-31,34-57,59-66,68,71-94,96-98
- packages/admin/src/screens/library/Library.hooks.tsx | lines 15.69 br 100.0 fn 0.0 | uncovered lines: 17-18,21-38,42-46,49-61,64-68
- packages/admin/src/screens/library/Library.tsx | lines 14.92 br 25.0 fn 7.14 | uncovered lines: 46-67,70-81,83,85-96,102-103,118-121,123-127,137-148,151-156,158-164,170,173-180,183,185-192,194-218,220,223-236,238-240,242-246,248-249,251-265,267-271,273-276,278,283-285,287-290…
- packages/admin/src/screens/library/hooks/library-api-port.hooks.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 27-43
