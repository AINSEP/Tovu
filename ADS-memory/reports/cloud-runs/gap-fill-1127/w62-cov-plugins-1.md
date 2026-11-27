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

REPO: Jini only. HEAD = codex/w62-cov-plugins-1 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/plugins/src/host/activation-polling.ts | lines 61.8 br 97.37 fn 83.33 | uncovered lines: 123-129,132-136,138-143,145-153,155-161
- packages/plugins/src/host/admin-response.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/plugins/src/host/capability-tools.ts | lines 92.73 br 94.37 fn 95.83 | uncovered lines: 376-377,641-642,644-650,653-655,681-682
- packages/plugins/src/host/contributions.ts | lines 100.0 br 99.21 fn 100.0 | uncovered lines: 
- packages/plugins/src/host/declarative-content-types.ts | lines 93.09 br 88.68 fn 100.0 | uncovered lines: 122-124,200-202,376-378,411-412,415-416,457-458
- packages/plugins/src/host/hook-registry.ts | lines 99.48 br 98.8 fn 100.0 | uncovered lines: 140
- packages/plugins/src/host/node/archive-policy.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/plugins/src/host/node/discovery.ts | lines 97.58 br 98.13 fn 100.0 | uncovered lines: 294-298
- packages/plugins/src/host/node/integrity-command.ts | lines 25.0 br 100.0 fn 0.0 | uncovered lines: 9-23
- packages/plugins/src/host/node/invocation-binding.ts | lines 100.0 br 95.45 fn 100.0 | uncovered lines: 
- packages/plugins/src/host/node/module-snapshot.ts | lines 96.74 br 94.51 fn 95.24 | uncovered lines: 59-60,243-244,294,296
- packages/plugins/src/host/node/package-files.ts | lines 100.0 br 98.9 fn 100.0 | uncovered lines: 
- packages/plugins/src/host/node/runtime-activation.ts | lines 93.59 br 82.14 fn 88.24 | uncovered lines: 114-115,159-160,208-210,218-220
- packages/plugins/src/host/node/runtime-boot.ts | lines 58.33 br 38.1 fn 45.45 | uncovered lines: 31-37,46-47,73-76,113-118,120-122,125-128,130-135,137-154
- packages/plugins/src/host/node/runtime-conflicts.ts | lines 100.0 br 76.92 fn 100.0 | uncovered lines: 
- packages/plugins/src/host/node/runtime-core.ts | lines 85.54 br 85.19 fn 63.64 | uncovered lines: 102-103,107-108,118-119,125,131-135
- packages/plugins/src/host/node/runtime-load-target.ts | lines 94.12 br 85.71 fn 100.0 | uncovered lines: 70-71
- packages/plugins/src/host/node/runtime-package-location.ts | lines 47.83 br 100.0 fn 50.0 | uncovered lines: 54-65
- packages/plugins/src/host/node/runtime-reload.ts | lines 98.75 br 80.56 fn 84.21 | uncovered lines: 98
- packages/plugins/src/host/provider-contributions.ts | lines 100.0 br 97.84 fn 100.0 | uncovered lines: 
- packages/plugins/src/host/provider-host.ts | lines 100.0 br 95.24 fn 100.0 | uncovered lines: 
- packages/plugins/src/host/provider-revision-watch.ts | lines 88.1 br 88.24 fn 80.0 | uncovered lines: 39-43
- packages/plugins/src/host/tools/contract.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 4-9
- packages/plugins/src/host/tools/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-4,7
- packages/plugins/src/host/tools/install.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,8-11,15,17-23,27,29-37,45-72,75-76,80-81
- packages/plugins/src/host/tools/management.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 19-27,29,47,49-52,56-69,77-78,80,82,84-85,94-98,102-110,134-135,137-149,151-153,155-167,172-187,196-215,223-232,235-247,252-255,257-261,277-286,299-303,308,312-315,320-325,329-331,…
- packages/plugins/src/host/tools/source.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,5,9,11-15,25-37,45-63,65-69,71-73,76-91,95-101
- packages/plugins/src/host/worker/import-policy.ts | lines 91.18 br 80.0 fn 100.0 | uncovered lines: 87-89
- packages/plugins/src/host/worker/start.ts | lines 100.0 br 93.75 fn 100.0 | uncovered lines: 
- packages/plugins/src/react/PluginProviderSettingsDialog.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,5,90-92,95-100,102,105-116,118,121-124,126-129,131-135,137,139-141,143-147,149-170,172
- packages/plugins/src/react/plugin-install-port.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/plugins/src/runtime/built-ins/word-count/plugin.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/plugins/src/runtime/enable-confirmation-ui.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/plugins/src/runtime/install-source.ts | lines 94.23 br 70.37 fn 100.0 | uncovered lines: 28-30
- packages/plugins/src/runtime/plugin-tool-ids.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-3
- packages/plugins/src/runtime/plugin-tool-messages.ts | lines 76.6 br 75.0 fn 80.0 | uncovered lines: 36-37,39-40,42,46-47,57,60,64-65
- packages/plugins/src/runtime/sdk-resolver.ts | lines 46.15 br 100.0 fn 33.33 | uncovered lines: 64-66,93-95,98-100,102-103,105-107
