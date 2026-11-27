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

REPO: Jini only. HEAD = codex/w62-cov-ui-1 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/ui/src/features/admin-widgets/components/InfoTip.hooks.tsx | lines 100.0 br 96.67 fn 100.0 | uncovered lines: 
- packages/ui/src/features/app-shell/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-7
- packages/ui/src/features/charts/catalog-manifests.ts | lines 100.0 br 100.0 fn 85.71 | uncovered lines: 
- packages/ui/src/features/charts/wire.ts | lines 100.0 br 94.59 fn 100.0 | uncovered lines: 
- packages/ui/src/features/execution/react/components/AgentDiagnosticRow.tsx | lines 96.92 br 95.24 fn 100.0 | uncovered lines: 67-68
- packages/ui/src/features/execution/react/components/ExecutionTab.hooks.ts | lines 100.0 br 97.5 fn 100.0 | uncovered lines: 
- packages/ui/src/features/execution/react/hooks/useReasoningControl.ts | lines 100.0 br 98.86 fn 100.0 | uncovered lines: 
- packages/ui/src/features/execution/rules.ts | lines 100.0 br 99.23 fn 100.0 | uncovered lines: 
- packages/ui/src/features/find-bar/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1
- packages/ui/src/features/find/find-bar-state.ts | lines 90.91 br 92.86 fn 100.0 | uncovered lines: 40-41
- packages/ui/src/features/find/find-focus-clock.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 16-22
- packages/ui/src/features/find/find-target.ts | lines 100.0 br 96.77 fn 100.0 | uncovered lines: 
- packages/ui/src/features/find/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,11-13,25-28
- packages/ui/src/features/find/use-find-bar-effects.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-4,14-18,23-24,27-30,34-35,40-42,46-54,59,63-72,74-78,80,89-96,98-99
- packages/ui/src/features/find/use-find-bar-state.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-4,22-26,30-31,35,38,41,43,45-47,49-55,57-62
- packages/ui/src/features/find/use-find-focus-reclaim.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-3,13-14,18,22-27,31-47,49-53,55,62-65,67-74
- packages/ui/src/features/find/use-find-input-binding.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-3,14-18,23-24,35-41,44-66,70-79,81-85,87-96
- packages/ui/src/features/html-editor/editor-blocks.ts | lines 100.0 br 97.26 fn 100.0 | uncovered lines: 
- packages/ui/src/features/integrations/rules.ts | lines 98.66 br 98.25 fn 100.0 | uncovered lines: 211-212
- packages/ui/src/features/interactive-ui/providers/shadcn/select.tsx | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- packages/ui/src/features/live-views/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3-5
- packages/ui/src/features/live-views/live-views.ts | lines 98.8 br 100.0 fn 100.0 | uncovered lines: 149
- packages/ui/src/features/live-views/use-live-views.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 22-23,32-34,37-44,46-49,51-53,72,79-86,88-90,92-95,97,99-106,108-109
- packages/ui/src/features/live-views/use-site-view-preference.ts | lines 100.0 br 88.24 fn 100.0 | uncovered lines: 
- packages/ui/src/features/mcp-ui/credential-card.ts | lines 100.0 br 55.0 fn 100.0 | uncovered lines: 
- packages/ui/src/features/mcp-ui/surfaces/fields.ts | lines 96.3 br 96.77 fn 100.0 | uncovered lines: 82-83
- packages/ui/src/features/mcp-ui/surfaces/outcome.ts | lines 100.0 br 97.37 fn 100.0 | uncovered lines: 
- packages/ui/src/features/mcp-ui/surfaces/structured-details.ts | lines 100.0 br 99.22 fn 100.0 | uncovered lines: 
- packages/ui/src/features/mcp-ui/surfaces/tool-approval.ts | lines 75.93 br 100.0 fn 80.0 | uncovered lines: 63-75
- packages/ui/src/features/media-providers/dependencies.ts | lines 87.27 br 96.43 fn 90.0 | uncovered lines: 72-78
- packages/ui/src/features/media-providers/react/hooks/useMediaProvidersTab.ts | lines 100.0 br 98.78 fn 100.0 | uncovered lines: 
- packages/ui/src/features/mention-autocomplete/react/hooks/useMentionAutocomplete.ts | lines 100.0 br 97.3 fn 100.0 | uncovered lines: 
- packages/ui/src/features/number-stepper/NumberStepper.tsx | lines 100.0 br 100.0 fn 85.71 | uncovered lines: 
- packages/ui/src/features/number-stepper/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-4
- packages/ui/src/features/panel-kit/fetch-query/use-cursor-pages.hooks.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/ui/src/features/panel-kit/hooks/use-bounded-status-poll.hooks.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/ui/src/features/panel-kit/hooks/use-optimistic-stored-value.hooks.ts | lines 100.0 br 94.74 fn 100.0 | uncovered lines: 
- packages/ui/src/features/project-locations/react/hooks/useProjectLocationsTab.ts | lines 100.0 br 98.44 fn 100.0 | uncovered lines: 
- packages/ui/src/features/resource-monitor/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,7-8
- packages/ui/src/features/site-card/SiteListToolbar.tsx | lines 100.0 br 90.0 fn 100.0 | uncovered lines: 
- packages/ui/src/features/site-card/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-9
- packages/ui/src/features/site-card/site-list-view.ts | lines 100.0 br 95.12 fn 100.0 | uncovered lines: 
- packages/ui/src/features/site-card/use-site-list-prefs.hooks.ts | lines 100.0 br 96.77 fn 100.0 | uncovered lines: 
- packages/ui/src/features/sketch-editor/react/components/SketchEditor.tsx | lines 100.0 br 95.45 fn 100.0 | uncovered lines: 
- packages/ui/src/features/tab-strip/react/components/TabStrip.tsx | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- packages/ui/src/features/tab-strip/react/hooks/useTabStripDragReorder.ts | lines 100.0 br 96.3 fn 100.0 | uncovered lines: 
- packages/ui/src/features/tab-strip/scrollable.ts | lines 100.0 br 96.3 fn 100.0 | uncovered lines: 
- packages/ui/src/features/viewer-shell/react/components/CodeWrapToggle.tsx | lines 23.08 br 100.0 fn 0.0 | uncovered lines: 15-21,23-24,26
- packages/ui/src/features/viewer-shell/react/hooks/useCodeWrap.ts | lines 40.0 br 100.0 fn 0.0 | uncovered lines: 20-22
- packages/ui/src/react/components/CustomSelectMarkup.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-5,11,13-22,25,27-30,33,36-53,55-57,59,61-63,66-89,91-97,99
- packages/ui/src/react/components/PillButton.tsx | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- packages/ui/src/react/components/PopoverMenu.tsx | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- packages/ui/src/react/components/select-popover.ts | lines 100.0 br 99.15 fn 100.0 | uncovered lines: 
- packages/ui/src/react/testing.tsx | lines 78.57 br 100.0 fn 66.67 | uncovered lines: 18-20
- packages/ui/src/utils/design-md.ts | lines 100.0 br 97.22 fn 100.0 | uncovered lines: 
- packages/ui/src/utils/trim-chars.ts | lines 100.0 br 90.0 fn 100.0 | uncovered lines: 
- packages/ui/src/utils/unhandled-case.ts | lines 33.33 br 100.0 fn 0.0 | uncovered lines: 10-11
