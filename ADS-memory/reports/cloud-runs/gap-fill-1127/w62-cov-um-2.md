BOOTSTRAP: dispatched job. This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.

ROLE: you are the TDD agent doing a coverage GAP FILL. Read first: /Users/la/Programming/Tovu/AI-Dev-Shop/agents/tdd/skills.md, then the skills it lists for writing tests: AI-Dev-Shop/skills/test-design/SKILL.md, AI-Dev-Shop/skills/adversarial-test-design/references/testing-mistakes.md (lines 1-192: The One Question, the "What I'm about to test" index, Author Checklist; then the entries for what you test), AI-Dev-Shop/skills/coding-foundations/SKILL.md, AI-Dev-Shop/skills/testable-design-patterns/SKILL.md, and AI-Dev-Shop/harness-engineering/quality/coverage-integrity-policy.md (all under /Users/la/Programming/Tovu/). There is no spec/ADR for this work: skip spec-hash/ADR/CIC certification steps; follow the gap-fill path (step 4a).

GOAL: owner target is 100% lines/branches/functions per file. Write HIGH-QUALITY tests that cover the uncovered lines listed below. A test exists to catch a real break, not to raise a number.

HARD - NO RUNNING (owner: running tests here could take down the machine): do NOT run tests, test suites, builds, installs, typechecks of the tests tsconfig, coverage, or mutation runs. This clone has no node_modules; do not install. An Opus cloud run tests and fixes everything after you, so write code that you are confident compiles: check imports, exported names and types by reading the source.
HARD - NO REPO-WIDE SEARCH: no git grep / rg / find over the whole repo. Search only inside the target file's own package or app folder (e.g. `git grep -l <name> -- packages/cms/`), or read exact files.
DO NOT TOUCH: packages/commerce, packages/admin/src/pages/PageEditorChrome.tsx and its tests, coverage configs, thresholds, guard baselines, ratchets.

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

REPO: Jini only. HEAD = codex/w62-cov-um-2 = origin/integ/merge-28-2026-11-26.
NOTE: a Codex Cloud task already added packages/user-management/src/members/__tests__/consent-service.test.ts and 4 tests to packages/integrations/src/credentialed-http/sets/__tests__/extract-s8-sets.unit.test.ts on branch codex/ccx-um / codex/ccx-int; do not duplicate those.

## FILES (path | coverage now | uncovered source lines)
- packages/user-management/src/members/repo.rows.ts | lines 48.13 br 44.0 fn 43.75 | uncovered lines: 155-161,175-187,189-190,252-265,267-268,271-288,291-301,303-304,323-329,331-337,341-354,357-370,373-386
- packages/user-management/src/members/repo.sessions.ts | lines 30.19 br 68.75 fn 42.86 | uncovered lines: 38-48,51-60,74-75,84-92,98-99,102-112,114-120,139-149,152-160,165-171,180-211
- packages/user-management/src/members/repo.ts | lines 49.83 br 87.5 fn 50.0 | uncovered lines: 106-110,114-118,122-126,149-152,178-189,193-197,201-205,218-227,244-245,264-274,277-287,298-300,302-316,328-338,360-372,375-383,419-427,442-453,456-457
- packages/user-management/src/members/tool-registrations.ts | lines 72.56 br 52.94 fn 60.0 | uncovered lines: 238-247,250-256,263,265,267-270,273-278,281-283,303-304,309,311,313-316,345-346,359,394-395
- packages/user-management/src/members/trash-member.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3,13-27
- packages/user-management/src/newsletter/campaign-write-service.ts | lines 17.34 br 37.5 fn 27.27 | uncovered lines: 49-54,56-57,69-84,121-125,127-132,137,142-173,176,180-202,204-210,212-215,217-221,224,227-230,237-241,244,247-254,256,258-261,263-273
- packages/user-management/src/newsletter/confirmation.ts | lines 89.22 br 45.45 fn 100.0 | uncovered lines: 58-59,157-158,163-164,180-182,188-189
- packages/user-management/src/newsletter/delivery/tool-registrations.ts | lines 67.06 br 69.57 fn 56.25 | uncovered lines: 99-101,104-107,127-138,149-152,157,159-161,163-171,183-185,187,208-218,220-222,240-241
- packages/user-management/src/newsletter/repo-sends.ts | lines 30.29 br 81.82 fn 37.5 | uncovered lines: 33-45,62-65,77-87,90-102,109-124,130-144,162-171,175-179,189-202,218-238
- packages/user-management/src/newsletter/repo-subscribers.ts | lines 36.19 br 92.31 fn 45.0 | uncovered lines: 39-49,52-64,80-89,101-111,117-131,140-157,175-184,187-195,222-235,238-250,254-263
- packages/user-management/src/newsletter/repo.memory.ts | lines 60.18 br 83.02 fn 63.04 | uncovered lines: 44-45,58-62,69,97-102,162-167,170-173,180-181,192-193,195,198-199,203-206,217-218,221-224,226,241-242,250-259,262-265,268-269,272-273,283-289,305-320,340-342
- packages/user-management/src/newsletter/repo.rows.ts | lines 27.78 br 90.0 fn 16.67 | uncovered lines: 209-229,238-240,256-266,270-280,284-286,290-303,307-320,324-331,335-343,347-355,359-375,379-395,399-408,412-422,426-436
- packages/user-management/src/newsletter/repo.ts | lines 43.65 br 85.71 fn 41.67 | uncovered lines: 70-73,106-115,118-131,134-145,149-153,167-192
