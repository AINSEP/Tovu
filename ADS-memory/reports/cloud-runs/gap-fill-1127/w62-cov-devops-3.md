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

REPO: Jini only. HEAD = codex/w62-cov-devops-3 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/devops/src/deploy/site/static-publish/adapter-export.ts | lines 6.0 br 100.0 fn 0.0 | uncovered lines: 18-21,23-24,37-42,57-58,65-69,72-84,86-98,104-105
- packages/devops/src/deploy/site/static-publish/adapter-plan.ts | lines 51.92 br 30.0 fn 50.0 | uncovered lines: 38-42,48-51,65,70-80,109-110,122-123
- packages/devops/src/deploy/site/static-publish/adapter.ts | lines 26.49 br 43.75 fn 26.32 | uncovered lines: 209-218,220-221,236-247,250-260,263,266-270,283-284,290,294-295,298-309,312-314,357-358,363-367,369-372,374-378,380-383,391,393-397,400-402,411-421,424-426,430-434,438,440,443-444,…
- packages/devops/src/deploy/site/static-publish/admin-publish-read.ts | lines 98.75 br 52.78 fn 90.0 | uncovered lines: 69
- packages/devops/src/deploy/site/static-publish/credentials.ts | lines 42.68 br 44.0 fn 40.91 | uncovered lines: 24,26-33,76-78,81-83,99-101,105-107,113-122,127-134,162-172,174-179,183-185,187-189,215-226,251,255-257,273-274,279,290-294,331-332,344,351
- packages/devops/src/deploy/site/static-publish/domain-publish-rows.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 18,20-30,33-38,41-47
- packages/devops/src/deploy/site/static-publish/domain-publish-tool.ts | lines 52.17 br 62.5 fn 55.56 | uncovered lines: 49-56,60-62,76-82,96-101,103-111,114-118,124-129
- packages/devops/src/deploy/site/static-publish/inspection.ts | lines 10.87 br 100.0 fn 0.0 | uncovered lines: 27-31,34-51,57,60-67,69-77
- packages/devops/src/deploy/site/static-publish/publish-history.ts | lines 30.43 br 80.95 fn 50.0 | uncovered lines: 135-138,143-145,147-148,151-157,175-184,190,194-198,201-218,235,241-259,272,275-276,278-280,282-285
- packages/devops/src/deploy/site/static-publish/publish-run.ts | lines 84.62 br 33.33 fn 71.43 | uncovered lines: 122,141-144,169,175-176,183,186,188-189,216-217,225,229,231-232
- packages/devops/src/deploy/site/static-publish/verify.ts | lines 16.79 br 90.0 fn 22.22 | uncovered lines: 66-67,70-72,77-85,151-152,166-172,174-176,180-182,185,189-196,199-202,213-214,219-235,237,239-247,286-294,296-300,343-348,350-360,367,370-375
- packages/devops/src/deploy/site/tool-registrations.ts | lines 63.01 br 38.46 fn 50.0 | uncovered lines: 134-137,140-143,147-150,155-158,160-162,177-182,201-202
- packages/devops/src/deploy/target-descriptors.ts | lines 96.91 br 65.69 fn 100.0 | uncovered lines: 94-95,174-175,236-237
- packages/devops/src/dns/site/binding.repo.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 50,66-70,72-76,83-92,94-109
- packages/devops/src/dns/site/dns-changes.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 11-12,36,85-89,95-105,108-110,113-118,122,125-126,129-131,133,136-140,147-152,155-158,161-162,164-169,175-183,186-189,191-192,199-208,211-215,217,219-222,224-225,227-238,244-247,25…
- packages/devops/src/dns/site/dns-tools.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 10,13,15-16,18-20,24-59,62-79,81,83,85-86,88-95,97-99,102-107,109-114,116-120,122-129,131-134,136-139,143-152,154-156,158-169,176-201,203-208,218,221-226,228-232
- packages/devops/src/dns/site/mail-dns-status.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 17,19,22-23,106,113-118,120,123-125,127-130,132,134-136,139-150,152-155,169-178,181-187,191-196,198-201,204-207,211-214,217-227,230,232-238,240-242,245-252,259-272,279-287,289-292
- packages/devops/src/dns/site/mail-dns-tools.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 8-10,12,14-15,17-28,30,32,34-35,37-39,42-48,55-68
- packages/devops/src/dns/site/mail-requirements.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 13,15,21,24,26,37-39,42-44,46-47,50-57,60-63,65-74,82-98
- packages/devops/src/dns/site/tools.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-6,34-55,57,59,61-62,64,74-79,82-91,98-108,115-124,133-155
- packages/devops/src/local-dev/free-port.ts | lines 100.0 br 100.0 fn 75.0 | uncovered lines: 
- packages/devops/src/local-dev/node-runtime.ts | lines 76.92 br 100.0 fn 66.67 | uncovered lines: 11-16
- packages/devops/src/local-dev/server-retirement.ts | lines 96.77 br 89.47 fn 100.0 | uncovered lines: 34
- packages/devops/src/local-dev/source-tree-stamp.ts | lines 95.0 br 70.0 fn 100.0 | uncovered lines: 16
- packages/devops/src/packaging/electron/optional-peers.ts | lines 66.67 br 50.0 fn 66.67 | uncovered lines: 24-29
- packages/devops/src/packaging/electron/staged-closure-node.ts | lines 30.0 br 100.0 fn 0.0 | uncovered lines: 9-15
- packages/devops/src/packaging/electron/staged-closure.ts | lines 7.37 br 100.0 fn 0.0 | uncovered lines: 23-29,31-50,53-67,69-78,87-104,106-123
- packages/devops/src/packaging/electron/staging.ts | lines 100.0 br 99.57 fn 100.0 | uncovered lines: 
- packages/devops/src/packaging/electron/typescript.ts | lines 100.0 br 91.11 fn 100.0 | uncovered lines: 
- packages/devops/src/packaging/electron/update-manifest-merge.ts | lines 100.0 br 97.3 fn 100.0 | uncovered lines: 
- packages/devops/src/react/site-share-expiry/ShareExpiryControls.tsx | lines 100.0 br 100.0 fn 33.33 | uncovered lines: 
