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

REPO: Jini only. HEAD = codex/w62-cov-admin-5 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/admin/src/screens/observability/hooks/observability-status-dependencies.hooks.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 17-25,37-46
- packages/admin/src/screens/observability/hooks/recent-server-errors-dependencies.hooks.ts | lines 53.85 br 100.0 fn 50.0 | uncovered lines: 14-21,38-41
- packages/admin/src/screens/observability/hooks/use-observability-status.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,5,8,53-72
- packages/admin/src/screens/observability/hooks/use-queries-tab.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,18-26,28-31
- packages/admin/src/screens/observability/hooks/use-recent-server-errors.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-3,6-7,18,27,75-84,86-88,90-96,100-102,104-121
- packages/admin/src/screens/observability/observability-visuals.tsx | lines 85.42 br 100.0 fn 85.71 | uncovered lines: 47-52,54
- packages/admin/src/screens/observability/queries-panel.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,12,16-18,22-28
- packages/admin/src/screens/observability/recent-errors-panel.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,6,44,46-48,50-61,63-65,67-69,71-78,80,83-92,98-100,102-119,121-126,128,131-142,144,150-152,155-166,168,170-173,175
- packages/admin/src/screens/observability/recent-errors-rules.ts | lines 95.83 br 95.16 fn 100.0 | uncovered lines: 86-90
- packages/admin/src/screens/observability/tool-gaps-panel.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,4,11-26
- packages/admin/src/screens/plugins/AddAgentPluginPanel.tsx | lines 4.3 br 100.0 fn 0.0 | uncovered lines: 22-28,30-65,67-78,80,83-101,103,106-114,116-118,120
- packages/admin/src/screens/plugins/AddPluginPanel.tsx | lines 4.44 br 100.0 fn 0.0 | uncovered lines: 20-74,76,78-80,82,85-109,111
- packages/admin/src/screens/plugins/AgentPluginDisableConfirmDialog.tsx | lines 11.43 br 100.0 fn 0.0 | uncovered lines: 66-79,81,84-98,100
- packages/admin/src/screens/plugins/AgentPluginLinkedLock.tsx | lines 42.11 br 100.0 fn 0.0 | uncovered lines: 21-22,25-26,28-33,35
- packages/admin/src/screens/plugins/AgentPluginLists.tsx | lines 81.38 br 52.63 fn 66.67 | uncovered lines: 47-49,53-55,58-60,174,243-251,254-262,264-267,269,312,323
- packages/admin/src/screens/plugins/AgentPluginManageButton.tsx | lines 25.0 br 100.0 fn 0.0 | uncovered lines: 27-35,37-38,40
- packages/admin/src/screens/plugins/AgentPluginMaturity.tsx | lines 100.0 br 60.0 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/plugins/AgentPluginMemoryPanel.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 4-30
- packages/admin/src/screens/plugins/AgentPluginRow.tsx | lines 4.63 br 100.0 fn 0.0 | uncovered lines: 98-107,116-117,122-124,128-135,137,141-148,150-153,155-164,169-172,174-176,178,180-181,185-197,199-200,202,209-221,223,226-228,231-234,237-240,242,244-246,249-251,253,258,263-267,2…
- packages/admin/src/screens/plugins/AgentPluginSurfaceFrame.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 4,22-35,37-47,49
- packages/admin/src/screens/plugins/AgentPluginUpdateControl.tsx | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/plugins/AgentPlugins.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,12,23-26,30-36,41-43,45-46
- packages/admin/src/screens/plugins/AgentPlugins.tsx | lines 32.08 br 100.0 fn 60.0 | uncovered lines: 134-136,138-142,145,147-148,150,152-153,155,161-168,177-188,190
- packages/admin/src/screens/plugins/AgentPluginsOverlays.tsx | lines 96.15 br 50.0 fn 66.67 | uncovered lines: 32
- packages/admin/src/screens/plugins/AgentPluginsTabs.tsx | lines 100.0 br 100.0 fn 72.73 | uncovered lines: 
- packages/admin/src/screens/plugins/PackageFilesModal.tsx | lines 10.1 br 100.0 fn 0.0 | uncovered lines: 57-68,70,89-98,106-114,122-126,128-130,132-156,158-161,163-164,166,181-187,193-195,197-208,210,212-217,219-221,230-258,260,263-278,281-285,287-312,314-318,320
- packages/admin/src/screens/plugins/PluginLists.tsx | lines 89.18 br 54.55 fn 58.82 | uncovered lines: 118-124,126,146-156,158,197
- packages/admin/src/screens/plugins/PluginPackageFilesModal.tsx | lines 12.5 br 100.0 fn 0.0 | uncovered lines: 31,33-44,46
- packages/admin/src/screens/plugins/PluginProviderSettingField.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,5,8-17
- packages/admin/src/screens/plugins/PluginProviderSettingField.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,4,7,28-41,43,46-52,55-57,59-61,63-73,75
- packages/admin/src/screens/plugins/PluginRemoveConfirmDialog.tsx | lines 13.33 br 100.0 fn 0.0 | uncovered lines: 29-38,40,42-55,57
- packages/admin/src/screens/plugins/PluginRow.tsx | lines 8.04 br 100.0 fn 0.0 | uncovered lines: 66-76,78,86-117,119,122-125,127-137,139-144,149-165,167-173,176-177,179-188,190
- packages/admin/src/screens/plugins/Plugins.tsx | lines 93.75 br 62.07 fn 100.0 | uncovered lines: 261-263,269-271
- packages/admin/src/screens/plugins/PluginsOverlays.tsx | lines 95.83 br 70.0 fn 100.0 | uncovered lines: 16
- packages/admin/src/screens/plugins/agent-plugins-visuals.tsx | lines 56.86 br 100.0 fn 38.46 | uncovered lines: 45-46,48,53-54,56,73-77,79,83-88,90,94-100,102,106-111,113,130-131,133,149-154,156
- packages/admin/src/screens/plugins/api/plugins-api.ts | lines 50.0 br 100.0 fn 28.57 | uncovered lines: 31,34-36,38-41,44-47,52
- packages/admin/src/screens/plugins/composer-capabilities.ts | lines 98.0 br 91.38 fn 100.0 | uncovered lines: 255-256
- packages/admin/src/screens/plugins/composer-skills.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,4,8-19,30,32-34,39-41,43-54,56,59-62,67,71-81
- packages/admin/src/screens/plugins/hooks/use-admin-surface-frame.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,5,34-37,54-56,59,62-64,66-68,74-75,82-92,94,96-97,99-110,113-116,118-121,123,125-130,132-149,151-155
- packages/admin/src/screens/plugins/hooks/use-agent-plugin-details-modal.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,5,7,40-42,45-51,54-55
- packages/admin/src/screens/plugins/hooks/use-agent-plugin-disable-confirm.hooks.ts | lines 23.53 br 100.0 fn 0.0 | uncovered lines: 41-44,46-52,54-55
