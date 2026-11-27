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

REPO: Tovu only. HEAD = codex/tv-w62-cov-dsk-2 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- apps/desktop/src/renderer/use-site-actions.hooks.ts | lines 62.75 br 100.0 fn 100.0 | uncovered lines: 1-19
- apps/desktop/src/renderer/use-site-folders.hooks.ts | lines 97.5 br 100.0 fn 100.0 | uncovered lines: 1,29
- apps/desktop/src/renderer/use-site-list-prefs.hooks.ts | lines 82.93 br 100.0 fn 92.31 | uncovered lines: 1-14
- apps/desktop/src/renderer/use-site-locate.hooks.ts | lines 86.15 br 100.0 fn 100.0 | uncovered lines: 1-9
- apps/desktop/src/renderer/use-site-power.hooks.ts | lines 93.0 br 100.0 fn 100.0 | uncovered lines: 1-21
- apps/desktop/src/renderer/use-site-preview.hooks.ts | lines 58.33 br 100.0 fn 100.0 | uncovered lines: 1-5
- apps/desktop/src/renderer/use-site-rename.hooks.ts | lines 87.44 br 100.0 fn 100.0 | uncovered lines: 1-25
- apps/desktop/src/renderer/use-site-start.hooks.ts | lines 95.59 br 100.0 fn 100.0 | uncovered lines: 1-5,136
- apps/desktop/src/renderer/use-site-storage-settings.hooks.ts | lines 95.83 br 100.0 fn 100.0 | uncovered lines: 8
- apps/desktop/src/renderer/use-site-toast.hooks.ts | lines 81.25 br 100.0 fn 100.0 | uncovered lines: 1-5,29
- apps/desktop/src/renderer/use-site-workspace.hooks.ts | lines 99.7 br 98.51 fn 97.37 | uncovered lines: 346
- apps/desktop/src/renderer/use-sites-folders-dialog.hooks.ts | lines 93.75 br 100.0 fn 100.0 | uncovered lines: 1,7,39
- apps/desktop/src/renderer/use-sites-inventory.hooks.ts | lines 96.15 br 100.0 fn 100.0 | uncovered lines: 1-5,162
- apps/desktop/src/renderer/use-start-imported.hooks.ts | lines 85.71 br 94.12 fn 100.0 | uncovered lines: 1-6,44
- apps/desktop/src/renderer/use-tab-close-ask.hooks.ts | lines 93.52 br 85.0 fn 100.0 | uncovered lines: 1-6,51
- apps/desktop/src/renderer/use-update-check.hooks.ts | lines 90.91 br 100.0 fn 100.0 | uncovered lines: 1,17
- apps/desktop/src/renderer/use-workspace-chat-transport.hooks.ts | lines 58.82 br 100.0 fn 100.0 | uncovered lines: 1-6,12
- apps/desktop/src/renderer/use-zoom.hooks.ts | lines 72.0 br 100.0 fn 100.0 | uncovered lines: 1-6,20
- apps/desktop/src/renderer/workspace-chat-transport.ts | lines 100.0 br 99.24 fn 100.0 | uncovered lines: 
- apps/desktop/src/shared-sites.ts | lines 100.0 br 98.84 fn 100.0 | uncovered lines: 
- apps/desktop/src/site-archive-import.ts | lines 100.0 br 90.91 fn 87.5 | uncovered lines: 
- apps/desktop/src/site-child-registry.ts | lines 99.31 br 97.73 fn 95.45 | uncovered lines: 83-84
- apps/desktop/src/site-dir-store.ts | lines 100.0 br 97.0 fn 100.0 | uncovered lines: 
- apps/desktop/src/site-directory-identity.ts | lines 100.0 br 96.77 fn 100.0 | uncovered lines: 
- apps/desktop/src/site-retirement.ts | lines 100.0 br 86.96 fn 80.0 | uncovered lines: 
- apps/desktop/src/site-theme-preview.ts | lines 100.0 br 98.15 fn 100.0 | uncovered lines: 
- apps/desktop/src/sites-mcp-tools.ts | lines 100.0 br 98.08 fn 100.0 | uncovered lines: 
- apps/desktop/src/smoke-bridge.ts | lines 100.0 br 94.68 fn 100.0 | uncovered lines: 
- apps/desktop/src/speech/preload-speech.cts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/desktop/src/stage-payload-lib.ts | lines 100.0 br 99.33 fn 100.0 | uncovered lines: 
- apps/desktop/src/stage-payload-run.ts | lines 100.0 br 97.2 fn 97.73 | uncovered lines: 
- apps/desktop/src/startup-env.ts | lines 100.0 br 96.97 fn 100.0 | uncovered lines: 
- apps/desktop/src/storage/storage-item-ids.ts | lines 100.0 br 94.74 fn 100.0 | uncovered lines: 
- apps/desktop/src/storage/storage-report-cli.ts | lines 100.0 br 93.1 fn 95.24 | uncovered lines: 
- apps/desktop/src/storage/storage-sheet-actions.ts | lines 100.0 br 80.77 fn 100.0 | uncovered lines: 
- apps/desktop/src/storage/storage-sheet-ipc.ts | lines 99.42 br 86.44 fn 100.0 | uncovered lines: 154
- apps/desktop/src/storage/trash-dismissed-folder.ts | lines 100.0 br 90.32 fn 100.0 | uncovered lines: 
- apps/desktop/src/tovu-server.output.ts | lines 100.0 br 89.47 fn 100.0 | uncovered lines: 
- apps/desktop/src/tovu-server.ts | lines 100.0 br 96.64 fn 100.0 | uncovered lines: 
- apps/desktop/src/tracked-sites.ts | lines 99.86 br 100.0 fn 98.25 | uncovered lines: 132
- apps/desktop/src/update-check-now.ts | lines 92.22 br 88.46 fn 88.89 | uncovered lines: 47-48,86-90
