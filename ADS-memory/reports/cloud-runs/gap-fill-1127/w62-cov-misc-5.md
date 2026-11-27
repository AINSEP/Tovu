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

REPO: Jini only. HEAD = codex/w62-cov-misc-5 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/search/src/site/access.ts | lines 16.33 br 100.0 fn 25.0 | uncovered lines: 34-40,44-52,61-77,79-86
- packages/search/src/site/cms-document-source.ts | lines 85.26 br 97.78 fn 93.33 | uncovered lines: 197-202,204-205,207-210,212-213
- packages/search/src/site/media-search-source.ts | lines 61.63 br 75.0 fn 54.55 | uncovered lines: 81,87-93,123-129,132-138,154-159,161-165
- packages/server/src/create-local-node-daemon.ts | lines 100.0 br 98.99 fn 100.0 | uncovered lines: 
- packages/server/src/kernel-base.ts | lines 100.0 br 100.0 fn 92.31 | uncovered lines: 
- packages/server/src/mount-routes.ts | lines 100.0 br 86.67 fn 100.0 | uncovered lines: 
- packages/server/src/route-host.ts | lines 84.0 br 100.0 fn 83.33 | uncovered lines: 24-27
- packages/server/src/shutdown/close-store-on-shutdown.ts | lines 98.0 br 85.29 fn 100.0 | uncovered lines: 131-132
- packages/sidecar/src/json-ipc.ts | lines 100.0 br 98.68 fn 100.0 | uncovered lines: 
- packages/sidecar/src/supervision/child-readiness.ts | lines 100.0 br 93.75 fn 100.0 | uncovered lines: 
- packages/sidecar/src/supervision/child-registry.ts | lines 100.0 br 98.15 fn 100.0 | uncovered lines: 
- packages/sidecar/src/supervision/child-stop.ts | lines 100.0 br 91.67 fn 100.0 | uncovered lines: 
- packages/sidecar/src/supervision/supervisor-node.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- packages/sidecar/src/supervision/supervisor.ts | lines 100.0 br 96.11 fn 100.0 | uncovered lines: 
- packages/ui-kit/src/react/SecretInput.tsx | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- packages/ui-kit/src/react/agent-attrs.hooks.ts | lines 100.0 br 96.36 fn 100.0 | uncovered lines: 
- packages/ui-kit/src/react/native/Controls.hooks.ts | lines 100.0 br 98.39 fn 100.0 | uncovered lines: 
- packages/ui-kit/src/react/native/Navigation.hooks.ts | lines 100.0 br 97.8 fn 100.0 | uncovered lines: 
- packages/ui-kit/src/react/secret-reveal.hooks.ts | lines 100.0 br 77.78 fn 100.0 | uncovered lines: 
- packages/vibecoding/src/html/node/parse5-region-parser.ts | lines 100.0 br 98.9 fn 100.0 | uncovered lines: 
- packages/vibecoding/src/node/paths.ts | lines 100.0 br 97.56 fn 100.0 | uncovered lines: 
- packages/vibecoding/src/node/project.ts | lines 98.41 br 95.22 fn 91.67 | uncovered lines: 203-205,386-387
- packages/vibecoding/src/node/store.ts | lines 96.88 br 94.41 fn 98.41 | uncovered lines: 57,63,223,318,408-409,440-441,461-464,479
