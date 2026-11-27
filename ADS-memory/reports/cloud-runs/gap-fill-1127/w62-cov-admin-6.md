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

REPO: Jini only. HEAD = codex/w62-cov-admin-6 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/admin/src/screens/plugins/hooks/use-agent-plugin-install.hooks.ts | lines 52.27 br 62.5 fn 23.81 | uncovered lines: 25-39,41-49,54-62,66-69,80-82,86-91,150-156,167-170,182-199,218-220,222-227
- packages/admin/src/screens/plugins/hooks/use-agent-plugin-memory.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-3,6,9,15-20,22-43,46-61,64,68-92,94-96
- packages/admin/src/screens/plugins/hooks/use-agent-plugin-tab.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,5-6,9-21
- packages/admin/src/screens/plugins/hooks/use-agent-plugin-update.hooks.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/admin/src/screens/plugins/hooks/use-linked-lock-tip.hooks.ts | lines 7.89 br 100.0 fn 0.0 | uncovered lines: 16-18,20-51
- packages/admin/src/screens/plugins/hooks/use-plugin-install.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,5-7,9-11,14-20,22-26,34-37,40-42,50-75,77-85,87-107,109-131
- packages/admin/src/screens/plugins/hooks/use-plugin-package-files.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,6,55-64
- packages/admin/src/screens/plugins/hooks/use-plugin-provider-settings.hooks.ts | lines 55.0 br 71.43 fn 33.33 | uncovered lines: 33-35,64-70,79-95
- packages/admin/src/screens/plugins/hooks/use-plugin-remove-confirm.hooks.ts | lines 25.0 br 100.0 fn 0.0 | uncovered lines: 37-39,41-47,49-50
- packages/admin/src/screens/plugins/hooks/use-plugin-row-focus.hooks.ts | lines 18.18 br 100.0 fn 0.0 | uncovered lines: 14-22
- packages/admin/src/screens/plugins/hooks/use-plugins.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,7,10,13,122-127,129,132-134,148-153,155,157-191,193-194,197-198,201-209,215-217,219,222-230,233-237,239-240,242-261,263-266,271-276
- packages/admin/src/screens/plugins/plugins-memory-i18n.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,5-448
- packages/admin/src/screens/plugins/plugins-visuals.tsx | lines 75.68 br 100.0 fn 66.67 | uncovered lines: 42-46,48,55-56,58
- packages/admin/src/screens/plugins/rules-context.tsx | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/plugins/rules.ts | lines 76.22 br 97.33 fn 58.97 | uncovered lines: 209-210,213,226-228,240-249,304-317,582,621-627,665-670,686-688,708-711,719-725,730-731,740-743,754-758,766-774
- packages/admin/src/screens/providers/AlwaysAllowPanel.tsx | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/admin/src/screens/providers/Providers.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4-6
- packages/admin/src/screens/providers/Providers.tsx | lines 100.0 br 100.0 fn 87.5 | uncovered lines: 
- packages/admin/src/screens/providers/ProvidersTabBody.tsx | lines 98.21 br 84.62 fn 100.0 | uncovered lines: 26
- packages/admin/src/screens/providers/always-allow-rules.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3,9-11,30-44,47-56,59-62
- packages/admin/src/screens/providers/hooks/use-always-allow.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4,36-38,40,45-48,50-59,61,63-74,76-85,87,89-99
- packages/admin/src/screens/providers/providers-i18n.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,28-40,42-54,56-68,70-82,84-96,98-110,112-124,126-138,140-152,154-166,168-180,182-194,196-208,210-222,224-236,238-250,252-264,266-278,280-292,294-306,308-320,322-323,329-335
- packages/admin/src/screens/routines/RoutineForm.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,12,14,18-42,44
- packages/admin/src/screens/routines/Routines.hooks.ts | lines 89.58 br 47.06 fn 100.0 | uncovered lines: 51-52,54-55,75
