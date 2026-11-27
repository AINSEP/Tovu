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

REPO: Jini only. HEAD = codex/w62-cov-admin-8 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/admin/src/screens/taxonomy/hooks/use-merge-term-section.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3-4,60-71,73-74,76-77,81-88,94-104,106-107,111-128,130-148,150-151,153-160,162-167,169-173,187-191,195-211
- packages/admin/src/screens/taxonomy/hooks/use-new-taxonomy-form.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-3,48-54,56-60,62-74,76-77,79-80,82-83
- packages/admin/src/screens/taxonomy/hooks/use-new-term-form.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3-4,57-64,66-71,73-89,91-92,94-95,97-98
- packages/admin/src/screens/taxonomy/hooks/use-taxonomy-html-embed.hooks.ts | lines 40.0 br 100.0 fn 50.0 | uncovered lines: 13-27
- packages/admin/src/screens/taxonomy/hooks/use-taxonomy.hooks.ts | lines 64.63 br 100.0 fn 41.67 | uncovered lines: 140-155,158-159,200-202,211-217,219-225,255-257,260-266,269-275
- packages/admin/src/screens/taxonomy/hooks/use-term-detail-panel.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3-4,51-59,61-65,79-81,85-92,94-112,114-115
- packages/admin/src/screens/taxonomy/hooks/use-term-list-reveal.hooks.ts | lines 85.71 br 100.0 fn 50.0 | uncovered lines: 38-40
- packages/admin/src/screens/taxonomy/hooks/use-term-picker.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3-5,9,92-93,96-98,106,112-116,123,127-132,145,149-151,153-157,159-166,168-171,173-181,183-185,187-193,195-196,198-199,207-209,211,213-215,217-219,221-224,226-233,235-239,241-242,…
- packages/admin/src/screens/taxonomy/rules.ts | lines 50.0 br 60.0 fn 38.46 | uncovered lines: 99-110,118-119,134-139,164-173,195-202,211-212,222-228,230-232,241-242
- packages/admin/src/screens/trash/Trash.tsx | lines 95.65 br 66.67 fn 71.43 | uncovered lines: 184-189,191,301-303
- packages/admin/src/screens/trash/api/trash-api.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,14-15,24-35,39-42
- packages/admin/src/screens/trash/hooks/use-trash.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4-6,106-109,112-113,119-125,131-144,146-153,158-159,166-171,179-182,184,189-197,199-213,217-222,225-228,237-240,243-245,247-264,266-282,284-308
- packages/admin/src/screens/trash/rules.ts | lines 88.24 br 82.22 fn 64.29 | uncovered lines: 174-177,189-190,194-195,221,236-238
- packages/admin/src/screens/voice-input/hooks/mic-button-view.hooks.ts | lines 78.57 br 100.0 fn 50.0 | uncovered lines: 74-79
- packages/admin/src/screens/voice-input/hooks/push-to-talk-state.hooks.ts | lines 76.47 br 50.0 fn 8.33 | uncovered lines: 50-52,82-84,118-119
- packages/admin/src/screens/voice-input/voice-input-config.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 18
- packages/admin/src/screens/webmcp/webmcp-i18n.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/admin/src/screens/widgets/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 10,31-34,36-39,41-44,46-51
- packages/admin/src/screens/workspace/hooks/use-workspace.hooks.ts | lines 100.0 br 90.0 fn 100.0 | uncovered lines: 
- packages/admin/src/security/adapters/http.ts | lines 100.0 br 96.04 fn 100.0 | uncovered lines: 
- packages/admin/src/security/adapters/memory.ts | lines 100.0 br 92.0 fn 100.0 | uncovered lines: 
- packages/admin/src/security/conformance/security-api.conformance.ts | lines 100.0 br 96.15 fn 100.0 | uncovered lines: 
- packages/admin/src/security/controllers/access-tokens.controller.ts | lines 100.0 br 98.67 fn 100.0 | uncovered lines: 
- packages/admin/src/security/controllers/root-key-reveal.ts | lines 100.0 br 93.94 fn 100.0 | uncovered lines: 
- packages/admin/src/security/controllers/root-key.controller.ts | lines 100.0 br 97.83 fn 100.0 | uncovered lines: 
- packages/admin/src/security/controllers/shared-keys.controller.ts | lines 100.0 br 93.1 fn 88.89 | uncovered lines: 
- packages/admin/src/security/credential-failure.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/admin/src/security/credential-forms.rules.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/admin/src/security/custom-credential-forms.ts | lines 96.83 br 93.33 fn 100.0 | uncovered lines: 130-131
- packages/admin/src/security/host/AccessTokenDialogs.tsx | lines 95.07 br 69.57 fn 57.14 | uncovered lines: 50-54,56-58,161-163
- packages/admin/src/security/host/AccessTokenFields.tsx | lines 76.33 br 68.42 fn 50.0 | uncovered lines: 50,197,203-218,220-224,226,228-242,244
- packages/admin/src/security/host/AccessTokenRows.tsx | lines 62.02 br 24.14 fn 36.84 | uncovered lines: 40-45,58-60,69-72,93-102,108-109,111-112,114,163-183,185,243-245,251-257,263-264,266-273,275-282,284
- packages/admin/src/security/host/AccessTokensGroups.tsx | lines 87.23 br 75.0 fn 58.82 | uncovered lines: 67-71,204-205,207-215,223,230,232-236,238
- packages/admin/src/security/host/AccessTokensTab.hooks.ts | lines 100.0 br 80.95 fn 100.0 | uncovered lines: 
- packages/admin/src/security/host/AccessTokensTab.tsx | lines 67.5 br 75.0 fn 50.0 | uncovered lines: 132-135,144-147,153-157
- packages/admin/src/security/host/CopyKeysDialog.tsx | lines 100.0 br 88.24 fn 100.0 | uncovered lines: 
- packages/admin/src/security/host/hooks/access-token-actions.ts | lines 50.49 br 55.0 fn 62.5 | uncovered lines: 28-46,49-57,63,76-89,106-107,110,115-116,134,162-163
- packages/admin/src/security/host/hooks/access-token-add-actions.ts | lines 11.4 br 100.0 fn 0.0 | uncovered lines: 13-16,19-21,24-37,39-70,73-81,84-87,92-126
- packages/admin/src/security/host/hooks/access-token-groups.hooks.ts | lines 94.59 br 90.91 fn 100.0 | uncovered lines: 26-27
- packages/admin/src/security/host/hooks/access-token-refresh.hooks.ts | lines 100.0 br 71.43 fn 100.0 | uncovered lines: 
- packages/admin/src/security/host/hooks/access-token-replace-actions.ts | lines 10.81 br 100.0 fn 0.0 | uncovered lines: 18-39,41-42,50-55,57-68,74-91,95-100
- packages/admin/src/security/host/hooks/access-token-rows.hooks.ts | lines 100.0 br 80.0 fn 33.33 | uncovered lines: 
- packages/admin/src/security/host/hooks/access-token-state.hooks.ts | lines 81.82 br 88.89 fn 87.5 | uncovered lines: 33-40
- packages/admin/src/security/host/hooks/access-token-store-operations.ts | lines 51.79 br 58.33 fn 50.0 | uncovered lines: 16,24-31,41,48-52,104-106,109-115,119-120
- packages/admin/src/security/host/hooks/access-token-stores.hooks.ts | lines 100.0 br 77.27 fn 100.0 | uncovered lines: 
- packages/admin/src/security/host/hooks/other-credential-store-operations.ts | lines 60.0 br 80.95 fn 68.75 | uncovered lines: 44-47,59-68,71-79,101-102,165-171,191-200
- packages/admin/src/security/host/hooks/use-access-tokens.hooks.ts | lines 84.09 br 100.0 fn 21.43 | uncovered lines: 290-296
- packages/admin/src/security/host/hooks/use-copy-keys.hooks.ts | lines 100.0 br 82.05 fn 85.71 | uncovered lines: 
- packages/admin/src/security/host/hooks/use-other-credentials.hooks.ts | lines 89.0 br 85.71 fn 91.67 | uncovered lines: 182-183,195-196,238-244
- packages/admin/src/security/messages.en.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/admin/src/security/react/components/CredentialEditor.tsx | lines 100.0 br 92.86 fn 100.0 | uncovered lines: 
- packages/admin/src/security/react/components/OtherCredentialRow.tsx | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/admin/src/security/react/components/SharedKeysDialog.tsx | lines 100.0 br 91.67 fn 100.0 | uncovered lines: 
- packages/admin/src/security/react/components/other-credential-rows.ts | lines 100.0 br 95.45 fn 100.0 | uncovered lines: 
- packages/admin/src/security/react/hooks/AccessTokensTab.hooks.ts | lines 100.0 br 95.62 fn 97.5 | uncovered lines: 
- packages/admin/src/security/react/hooks/CredentialEditor.hooks.ts | lines 100.0 br 96.61 fn 100.0 | uncovered lines: 
- packages/admin/src/security/react/hooks/SecurityPage.hooks.ts | lines 100.0 br 95.65 fn 100.0 | uncovered lines: 
- packages/admin/src/security/react/hooks/SharedKeysDialog.hooks.ts | lines 100.0 br 97.78 fn 91.67 | uncovered lines: 
- packages/admin/src/security/react/index.ts | lines 100.0 br 79.17 fn 100.0 | uncovered lines: 
- packages/admin/src/security/react/live/Security.tsx | lines 100.0 br 87.5 fn 55.56 | uncovered lines: 
- packages/admin/src/security/react/tabs/AccessTokensTab.tsx | lines 100.0 br 90.24 fn 100.0 | uncovered lines: 
- packages/admin/src/security/rules.ts | lines 100.0 br 98.71 fn 100.0 | uncovered lines: 
- packages/admin/src/security/security-i18n.ts | lines 75.5 br 100.0 fn 16.67 | uncovered lines: 27-38,41-43,45-47,49-51,57-61,67-71,84-87,103-104,114-115,122-123,132-133,215-216,246-247,277-278
- packages/admin/src/seo/adapters/memory.ts | lines 100.0 br 97.96 fn 100.0 | uncovered lines: 
- packages/admin/src/seo/react/components/SeoIcons.tsx | lines 34.29 br 100.0 fn 0.0 | uncovered lines: 22-28,30,34-40,42,46-51,53
- packages/admin/src/shell/components/AdminByokKeyPanel.hooks.ts | lines 50.0 br 100.0 fn 0.0 | uncovered lines: 5-6
- packages/admin/src/shell/components/AssistantDock/AgentFailureCard.hooks.ts | lines 12.28 br 100.0 fn 0.0 | uncovered lines: 17-37,39-42,44-49,51-52,58-59,65-72,74-77,80-82
- packages/admin/src/shell/components/AssistantDock/AgentFailureCard.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,9,15-26,28,30-32
- packages/admin/src/shell/components/AssistantDock/AssistantDock.state.hooks.ts | lines 100.0 br 77.78 fn 85.71 | uncovered lines: 
- packages/admin/src/shell/components/AssistantDock/DockChatPane.tsx | lines 100.0 br 83.33 fn 80.0 | uncovered lines: 
- packages/admin/src/shell/components/AssistantDock/DockHeader.tsx | lines 93.42 br 95.0 fn 71.43 | uncovered lines: 136-140
- packages/admin/src/shell/components/AssistantDock/DockHeaderTip.hooks.ts | lines 91.67 br 100.0 fn 66.67 | uncovered lines: 45-46
- packages/admin/src/shell/components/AssistantDock/DockLeadingAccessory.tsx | lines 16.0 br 100.0 fn 0.0 | uncovered lines: 46-48,51-53,56-60,62,65-72,74
- packages/admin/src/shell/components/AssistantDock/DockSettingsMenu.tsx | lines 100.0 br 100.0 fn 70.0 | uncovered lines: 
- packages/admin/src/shell/components/AssistantDock/FolderDropConfirmation.tsx | lines 96.0 br 60.0 fn 100.0 | uncovered lines: 40
- packages/admin/src/shell/components/AssistantDock/FolderDropNotice.tsx | lines 26.32 br 100.0 fn 0.0 | uncovered lines: 26-36,38-40
- packages/admin/src/shell/components/AssistantDock/FolderDropPathHint.tsx | lines 8.7 br 100.0 fn 0.0 | uncovered lines: 19-35,37-39,41
- packages/admin/src/shell/components/AssistantDock/MessageOverflowModal.tsx | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/components/AssistantDock/SelectedAgentPluginTray.tsx | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/components/AssistantDock/SubagentsIndicator.tsx | lines 63.64 br 50.0 fn 50.0 | uncovered lines: 18-21
- packages/admin/src/shell/components/AssistantDock/agent-failure-hints.ts | lines 77.78 br 100.0 fn 0.0 | uncovered lines: 12-13
