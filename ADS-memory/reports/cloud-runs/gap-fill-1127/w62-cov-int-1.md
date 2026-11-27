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

REPO: Jini only. HEAD = codex/w62-cov-int-1 = origin/integ/merge-28-2026-11-26.
NOTE: a Codex Cloud task already added packages/user-management/src/members/__tests__/consent-service.test.ts and 4 tests to packages/integrations/src/credentialed-http/sets/__tests__/extract-s8-sets.unit.test.ts on branch codex/ccx-um / codex/ccx-int; do not duplicate those.

## FILES (path | coverage now | uncovered source lines)
- packages/integrations/src/api-connections/budgets.ts | lines 86.67 br 66.67 fn 87.5 | uncovered lines: 30-32,40-41,57-59
- packages/integrations/src/api-connections/connect.ts | lines 5.66 br 100.0 fn 0.0 | uncovered lines: 47-50,71-77,79-82,85-88,112-119,124-138,141-147,149-153,155-160,163,165-170,177-182,185-194,202-207,209-219
- packages/integrations/src/api-connections/contribution.ts | lines 100.0 br 33.33 fn 57.14 | uncovered lines: 
- packages/integrations/src/api-connections/declarations.ts | lines 91.89 br 76.32 fn 76.47 | uncovered lines: 68-70,76-78,101-103
- packages/integrations/src/api-connections/host.ts | lines 3.66 br 100.0 fn 0.0 | uncovered lines: 42-44,47-49,52-54,57-60,63-65,67-69,72-74,79-81,90-98,101-104,106-108,111-113,132-140,143-147,149,152-155,158-162,170-180,183-186,189-192,194,197-200,207-209,211-221,224-226,229-24
- packages/integrations/src/api-connections/hosted-mcp/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 5-6
- packages/integrations/src/api-connections/hosted-mcp/oauth-row-writes.ts | lines 7.41 br 100.0 fn 0.0 | uncovered lines: 25-27,37-48,59-68
- packages/integrations/src/api-connections/hosted-mcp/shared-sign-in.ts | lines 74.07 br 48.65 fn 60.78 | uncovered lines: 152-163,168-177,251-255,257-261,264-274,286-288,290-294,306-319,321-327,342-343,357,415-418,430-436,438-442
- packages/integrations/src/api-connections/hosted-mcp/sign-in-configuration.ts | lines 5.19 br 100.0 fn 0.0 | uncovered lines: 14-17,26-41,43-47,49-50,70-76,78-82,86-88,90-98,106,110-112,124-127,135-138,146,150-158
- packages/integrations/src/api-connections/hosted-mcp/sign-in-discovery.ts | lines 10.34 br 100.0 fn 0.0 | uncovered lines: 26-27,38-46,56-68,83-85,105-108,123-137,143,145-149
- packages/integrations/src/api-connections/hosted-mcp/sign-in-flow.ts | lines 18.75 br 100.0 fn 0.0 | uncovered lines: 18-19,24-25,28-37,50-61
- packages/integrations/src/api-connections/hosted-mcp/sign-in-provider.ts | lines 9.57 br 100.0 fn 0.0 | uncovered lines: 17-19,23-32,38-39,76-82,86-99,106-109,113-119,133-142,147-161,173-176,185-187,191-196
- packages/integrations/src/api-connections/hosted-mcp/sign-in-status.ts | lines 4.08 br 100.0 fn 0.0 | uncovered lines: 21-26,29-37,41-43,97-102,104-105,107-110,116-126,133-147,151-161,163-176,178-180,182,184-192
- packages/integrations/src/api-connections/hosted-mcp/sign-in.ts | lines 9.35 br 100.0 fn 28.57 | uncovered lines: 59-66,68-75,78-83,85-93,95-98,100,103-104,106-114,116-121,123-131,138-140,143-146,148,150,155-158,162-185,187-191,193-205,209-216,218-228,230-238,240-248,251-258,260-265,268-269,27
- packages/integrations/src/api-connections/shared-api.ts | lines 100.0 br 96.0 fn 100.0 | uncovered lines: 
- packages/integrations/src/api-connections/shared-oauth-disconnect.ts | lines 100.0 br 88.89 fn 80.0 | uncovered lines: 
- packages/integrations/src/api-connections/shared-owner.ts | lines 69.49 br 55.56 fn 62.5 | uncovered lines: 71-72,78-80,82-86,96-103
- packages/integrations/src/api-connections/shared.ts | lines 100.0 br 91.07 fn 100.0 | uncovered lines: 
- packages/integrations/src/api-connections/vault-stores.ts | lines 90.71 br 83.82 fn 90.0 | uncovered lines: 104-105,120-121,132,136-143
- packages/integrations/src/credentialed-http/credentialed-request.ts | lines 99.68 br 99.42 fn 100.0 | uncovered lines: 405
- packages/integrations/src/credentialed-http/sets/store.ts | lines 57.63 br 47.06 fn 69.7 | uncovered lines: 103-106,120-123,145,147-154,173-174,194-195,200-201,203-204,211-226,242-246,251-254,271-278,287-291,298,303-304,339-340,355,358-359,423,425-431,434,436-441,448-453,466-469,471-472,
- packages/integrations/src/credentialed-http/sets/vault-repo.ts | lines 60.91 br 77.78 fn 58.82 | uncovered lines: 67-69,88-96,109-110,113-115,120-127,130-132,134-139,141-149
- packages/integrations/src/credentialed-http/tools/credential-copy-tool.ts | lines 1.98 br 100.0 fn 0.0 | uncovered lines: 25,27-36,39-47,50-54,57-61,65-69,72,74-79,84,87-91,93-95,99-104,114-147,150-157
- packages/integrations/src/credentialed-http/tools/index.ts | lines 92.86 br 77.78 fn 100.0 | uncovered lines: 18
