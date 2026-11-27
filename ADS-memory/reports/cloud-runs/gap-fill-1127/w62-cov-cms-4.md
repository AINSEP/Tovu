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

REPO: Jini only. HEAD = codex/w62-cov-cms-4 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/cms/src/pages/html-document-store.ts | lines 68.14 br 34.69 fn 85.0 | uncovered lines: 85,138-149,177-178,221-222,228-230,238-239,283-285,297-310,353-364,388-389,402-406,411-416,430-431,437-438,455,471-473
- packages/cms/src/pages/html-inverse.ts | lines 73.68 br 69.23 fn 75.0 | uncovered lines: 45-46,54-56
- packages/cms/src/pages/html-reverter.ts | lines 70.73 br 22.22 fn 50.0 | uncovered lines: 33-36,40-41,49,63-67
- packages/cms/src/pages/tool-registrations.read.ts | lines 11.54 br 100.0 fn 0.0 | uncovered lines: 10-14,19,23,27,29-40,43-51,56-57,59-60,62-64,68-77
- packages/cms/src/pages/tool-registrations.regions.ts | lines 35.35 br 57.14 fn 66.67 | uncovered lines: 31,37-40,43-46,65-66,74-78,82-87,95-96,98-102,104-112,114-117,119-140
- packages/cms/src/pages/tool-registrations.shared.ts | lines 44.44 br 56.52 fn 52.63 | uncovered lines: 23-24,44,47-48,96-103,108-109,122-124,128-131,134-138,142,157-163,181-182,199-202,205,213-215,219,228-235,243-249,251,297-309,318-319,322-324
- packages/cms/src/pages/tool-registrations.ts | lines 94.87 br 100.0 fn 50.0 | uncovered lines: 115-116
- packages/cms/src/pages/tool-registrations.write.ts | lines 72.41 br 46.15 fn 100.0 | uncovered lines: 67-68,74-78,108,112-115,118-121
- packages/cms/src/posts/content-stats-tool.ts | lines 83.48 br 55.56 fn 90.0 | uncovered lines: 62-63,87-94,115-118,120-121,138,172-173
- packages/cms/src/posts/email-template-store.ts | lines 46.43 br 85.71 fn 37.5 | uncovered lines: 44-47,49-51,53-56,92-94,99-114,121-127,129-133,139-141
- packages/cms/src/posts/featured-image.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3,41,44-54,56-58,60-61,72,75-82
- packages/cms/src/posts/go-live-sweep.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 4,6,17,22,50-52,56-89
- packages/cms/src/posts/post-before-save.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 38-44,54-57,61-65
- packages/cms/src/posts/post-create.ts | lines 95.61 br 40.0 fn 100.0 | uncovered lines: 146-147,155-156,198
- packages/cms/src/posts/post-import.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,4-6,12-20,63-64,70-76,78,82-91,100-101,142,145-147,149,151,153,158-167,169-175,180-184,186-188,192-195,197-198
- packages/cms/src/posts/post-read.ts | lines 16.98 br 100.0 fn 10.0 | uncovered lines: 22-37,85-91,94-101,116-127,130-135,137-142,145-147,182-190,203-211,234-239,241-246
- packages/cms/src/posts/post-retire.ts | lines 70.77 br 33.33 fn 75.0 | uncovered lines: 82-83,85-86,88-93,99-101,110-112,144-146
- packages/cms/src/posts/post-slugs.ts | lines 7.22 br 100.0 fn 0.0 | uncovered lines: 29-31,40-44,59-65,68-69,77-85,100-108,134-152,169-183,186-188,192-194,204-218
- packages/cms/src/posts/post-tool-delete.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,4,19-28,35-36,42-43,45-46,50
- packages/cms/src/posts/post-tool-duplicate.ts | lines 80.47 br 42.86 fn 69.23 | uncovered lines: 28-38,82-83,87-88,91,184-185,187-188,199-200,225-227
- packages/cms/src/posts/post-tool-errors.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-4,12-14,18-19,64,66-71
- packages/cms/src/posts/post-tool-input.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,7,11,14-16,23-26,28-30,32-35,37-40,46-48,55-58,64-67,74-76,85-100
- packages/cms/src/posts/post-tool-list.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,4-8,19-22,34,37,51-58,67-71,80-82,89-95,98-100,105-126
- packages/cms/src/posts/post-tool-policy.ts | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- packages/cms/src/posts/post-tool-update.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,6,8,29-33,36-43,46-50,53-55,58-66,74-78,82-85,92-99,114-121,130-143
- packages/cms/src/posts/post-tool-views.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3,6,51-57,63-78,104-107,136-141,148-150,160-164,167-172
- packages/cms/src/posts/post-trash.ts | lines 88.33 br 38.46 fn 100.0 | uncovered lines: 87-88,113,115-116,119-120
- packages/cms/src/posts/post-update.ts | lines 88.14 br 31.43 fn 100.0 | uncovered lines: 151-152,154-155,210-211,264-265,298-299,301,304-306
- packages/cms/src/posts/post-write-effects.ts | lines 24.32 br 85.71 fn 27.27 | uncovered lines: 23-32,35-41,57-64,71-72,96-103,105-106,108-115,122-124,142-146,148-152,167-168,171-178,187-198,201-204
- packages/cms/src/posts/post-write-fields.ts | lines 18.09 br 100.0 fn 0.0 | uncovered lines: 11-12,31-37,43-49,56-62,66-70,76-80,100-101,138-145,156-159,163-164,169-173,175-182,192-204,207-208
- packages/cms/src/posts/preview-tool.ts | lines 93.42 br 75.0 fn 83.33 | uncovered lines: 72-73,83-84,115
- packages/cms/src/posts/publish-content.retire.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-3,11-13,31,35-38,40-41,43-44,46-52,79,84-91,94-96,98-99,101,103-105,107-128,130-132,136-142,144,147-150,153-155,157-158,160,164-176,179-182,184-188,195-197
