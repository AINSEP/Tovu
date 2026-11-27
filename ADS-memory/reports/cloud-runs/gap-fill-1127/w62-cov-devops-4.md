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

REPO: Jini only. HEAD = codex/w62-cov-devops-4 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/devops/src/source-control/react/ProvidersTab.tsx | lines 76.57 br 81.82 fn 75.0 | uncovered lines: 121-125,173-180,182-183,185,353-368,370-374,440-458
- packages/devops/src/source-control/react/SourceControl.tsx | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- packages/devops/src/source-control/react/hooks/use-source-control-credentials.hooks.ts | lines 88.89 br 68.57 fn 69.23 | uncovered lines: 104-105,167-168,184-189
- packages/devops/src/source-control/react/rules.ts | lines 89.87 br 58.62 fn 100.0 | uncovered lines: 102-105,195-198
- packages/devops/src/source-control/react/source-control-visuals.tsx | lines 56.25 br 100.0 fn 66.67 | uncovered lines: 28-33,35
- packages/devops/src/source-control/repository-path.ts | lines 100.0 br 95.65 fn 100.0 | uncovered lines: 
- packages/devops/src/source-control/site/commit-target.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,15,20-24,41-44,51-60
- packages/devops/src/source-control/site/credential-setup.ts | lines 67.61 br 35.0 fn 43.48 | uncovered lines: 77-91,127-128,141-150,168-169,185-188,210-212,231-245,266-267,290-293
- packages/devops/src/source-control/site/provider-kit.ts | lines 100.0 br 75.0 fn 27.27 | uncovered lines: 
- packages/devops/src/source-control/site/saved-key-bindings.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3
- packages/devops/src/source-control/site/store.ts | lines 64.34 br 46.15 fn 62.5 | uncovered lines: 74-77,80-83,106-116,119,228-229,250-252,260-261,275-277,292-299,308-313,316-319,362-368,393-394,412-415,426-427,431-435,439-443,447-452,454-456,458-462
- packages/devops/src/source-control/site/store.validation.ts | lines 70.8 br 36.96 fn 77.78 | uncovered lines: 14-15,17-18,23-28,34-38,49-50,73,101-102,105-106,128,149-150,156,159-165
- packages/devops/src/source-control/site/tool-registrations.ts | lines 66.81 br 44.0 fn 74.07 | uncovered lines: 118-120,126-130,137-139,142-144,151,153-160,254-255,259,275-276,294-309,314-316,328-329,332,335,337-338,360-361,370-380,417-422,428-430,435-436,496-497
- packages/devops/src/static-export/html-url-locations.ts | lines 96.05 br 92.0 fn 100.0 | uncovered lines: 102-104
- packages/devops/src/static-export/site/export-preflight.ts | lines 100.0 br 87.8 fn 100.0 | uncovered lines: 
- packages/devops/src/static-export/site/media-original-urls.ts | lines 42.25 br 46.15 fn 83.33 | uncovered lines: 33-37,39,55-76,79-86,98-102
- packages/devops/src/static-export/site/public-origin-policy.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/devops/src/static-export/site/route-manifest.ts | lines 88.24 br 87.1 fn 100.0 | uncovered lines: 131-136,143-148
- packages/devops/src/static-export/site/site-exporter.ts | lines 88.76 br 86.79 fn 60.0 | uncovered lines: 78-80,154-156,180-183
- packages/devops/src/static-export/transforms.ts | lines 100.0 br 98.22 fn 100.0 | uncovered lines: 
