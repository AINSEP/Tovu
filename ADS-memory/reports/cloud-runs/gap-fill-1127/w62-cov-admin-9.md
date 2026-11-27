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

REPO: Jini only. HEAD = codex/w62-cov-admin-9 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/admin/src/shell/components/AssistantDock/agent-failure-scanners.ts | lines 70.44 br 87.76 fn 58.82 | uncovered lines: 26-29,40-46,50-52,54-56,59-63,65-69,74-86,100-101,106-110
- packages/admin/src/shell/components/AssistantDock/agent-failure.ts | lines 90.6 br 96.25 fn 86.96 | uncovered lines: 66-70,99-103,106-109
- packages/admin/src/shell/components/AssistantDock/assistant-dock-props.tsx | lines 100.0 br 56.25 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/components/AssistantDock/dock-header-rules.ts | lines 100.0 br 91.3 fn 66.67 | uncovered lines: 
- packages/admin/src/shell/components/AssistantDock/dock-pane-props.tsx | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/components/AssistantDock/hooks/agents-inventory.hooks.ts | lines 23.14 br 66.67 fn 15.38 | uncovered lines: 35-36,52-53,64-65,72-77,95-96,125-140,144-148,153-161,163-165,167-169,176,180-186,192-202,204-218,235-243
- packages/admin/src/shell/components/AssistantDock/hooks/assistant-mcp-ui.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 24,27-29
- packages/admin/src/shell/components/AssistantDock/hooks/assistant-transport.hooks.ts | lines 10.0 br 100.0 fn 28.57 | uncovered lines: 38-39,47-50,55-64,66-82,111-120,125,130,134,139-146,153-171,179-181,185-188,190-211,214-216,221-223,226-234
- packages/admin/src/shell/components/AssistantDock/hooks/byok-runtime.hooks.ts | lines 43.33 br 87.5 fn 66.67 | uncovered lines: 36-38,81-85,96-98,109-121,132-139,141-142
- packages/admin/src/shell/components/AssistantDock/hooks/chat-package-kind.ts | lines 100.0 br 98.86 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/components/AssistantDock/hooks/composer-discovery.hooks.ts | lines 92.31 br 75.0 fn 72.73 | uncovered lines: 32,59-60,65-66,71-72
- packages/admin/src/shell/components/AssistantDock/hooks/composer-files.hooks.ts | lines 69.74 br 96.15 fn 57.14 | uncovered lines: 112-117,137-141,164,169,173-182
- packages/admin/src/shell/components/AssistantDock/hooks/execution-config-ledger.hooks.ts | lines 98.02 br 77.78 fn 85.71 | uncovered lines: 76,195
- packages/admin/src/shell/components/AssistantDock/hooks/execution-config.hooks.ts | lines 96.77 br 88.89 fn 63.64 | uncovered lines: 79,88-89
- packages/admin/src/shell/components/AssistantDock/hooks/local-cli-selection.hooks.ts | lines 79.66 br 50.0 fn 66.67 | uncovered lines: 39-50
- packages/admin/src/shell/components/AssistantDock/hooks/messages-change.hooks.ts | lines 78.46 br 65.0 fn 100.0 | uncovered lines: 32-33,38-42,75-76,143-147
- packages/admin/src/shell/components/AssistantDock/hooks/runtime-access.hooks.ts | lines 24.39 br 66.67 fn 40.0 | uncovered lines: 29,35-49,51-55,69-75,81-83
- packages/admin/src/shell/components/AssistantDock/hooks/selected-agent-plugins.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,43-44,46-50,52-54,56-57,73-85
- packages/admin/src/shell/components/AssistantDock/hooks/use-assistant-empty-state.hooks.ts | lines 100.0 br 81.82 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/components/AssistantDock/hooks/use-assistant-runtime-preferences.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,15-17,44-45,49-50,52-60,62-68,70,72-88,90-91
- packages/admin/src/shell/components/AssistantDock/hooks/use-chat-agent-plugins.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4,31-32,36-37,39-47,49-55,57,59-74,76-77
- packages/admin/src/shell/components/AssistantDock/hooks/use-chat-display-preferences.hooks.ts | lines 11.11 br 100.0 fn 50.0 | uncovered lines: 50,54-55,57-66,68-74,76,78-94,96-97
- packages/admin/src/shell/components/AssistantDock/hooks/use-composer-send-stop-guard.hooks.ts | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- packages/admin/src/shell/components/AssistantDock/hooks/use-routed-a2ui-surface-card.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4,40,44-53,57-64,66-68,78-80,97,102-106,110-111,115,122,130-132,134-144,146-147
- packages/admin/src/shell/components/AssistantDock/hooks/use-selected-agent-auth-warning.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,36-37,42-51,53-55,57,59-62,65-67,69-75,77-81
- packages/admin/src/shell/components/ChatFab/ChatFab.tsx | lines 100.0 br 92.31 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/components/CodeView/preview-modal-icons.tsx | lines 100.0 br 100.0 fn 0.0 | uncovered lines: 
- packages/admin/src/shell/components/ConfirmActionDialog.tsx | lines 10.0 br 100.0 fn 0.0 | uncovered lines: 19-35,37
- packages/admin/src/shell/components/InstallTabCard/InstallTabCard.tsx | lines 88.24 br 69.57 fn 80.0 | uncovered lines: 33,88-93,95,162-164,170
- packages/admin/src/shell/components/MediaEditDialog/MediaEditDialog.hooks.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4,85-86,95-99,107-108,110-116,118,120-121
- packages/admin/src/shell/components/MediaPickerDialog/JiniMediaPicker.hooks.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/components/SecretInput/SecretInput.tsx | lines 81.25 br 57.14 fn 100.0 | uncovered lines: 43-45
- packages/admin/src/shell/components/SitesSidebarNav.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,23-30,32-39
- packages/admin/src/shell/components/WidgetConfigFields/HtmlAttributeRows.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,37,43-47,49-53,55-58,60-63
- packages/admin/src/shell/components/WidgetConfigFields/WidgetConfigFields.hooks.tsx | lines 87.68 br 93.02 fn 84.38 | uncovered lines: 68-70,72-73,215,260-262,274-278,289-293,296-302
- packages/admin/src/shell/components/WidgetConfigFields/media-content-rules.ts | lines 100.0 br 98.08 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/hooks/use-admin-appearance-snapshot.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,7,10-14,30-36,39-42
- packages/admin/src/shell/hooks/use-admin-document-locale.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,5-10,12-14
- packages/admin/src/shell/hooks/use-agent-screen-context.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,17-19,28-44
- packages/admin/src/shell/hooks/use-assistant-chats.hooks.ts | lines 44.44 br 100.0 fn 87.5 | uncovered lines: 99-102,104-114
- packages/admin/src/shell/hooks/use-conversation-deep-link.ts | lines 100.0 br 63.64 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/hooks/use-desktop-view-release.hooks.ts | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/hooks/use-dock-auto-rail.hooks.ts | lines 100.0 br 93.75 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/hooks/use-external-entry-refresh.hooks.ts | lines 100.0 br 96.0 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/hooks/use-sidebar-empty-click-toggle.hooks.ts | lines 94.55 br 100.0 fn 85.71 | uncovered lines: 29-31
- packages/admin/src/shell/hooks/use-sites-sidebar-nav.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,31-33,45-54,63-69,71-77,79-81,84-85,87-90,93-97,99-114,116-117
- packages/admin/src/shell/lib/addons-routes.ts | lines 100.0 br 91.43 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/lib/admin-failure-reporter.ts | lines 100.0 br 95.0 fn 90.0 | uncovered lines: 
- packages/admin/src/shell/lib/admin-frontend-session.ts | lines 50.0 br 100.0 fn 0.0 | uncovered lines: 15-17,24-27
- packages/admin/src/shell/lib/admin-http/config.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,4
- packages/admin/src/shell/lib/admin-http/request.ts | lines 100.0 br 95.0 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/lib/admin-http/settings-api.ts | lines 84.21 br 85.71 fn 75.0 | uncovered lines: 32-33,35
- packages/admin/src/shell/lib/admin-http/urls.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3-5,10-12
- packages/admin/src/shell/lib/admin-post-list-sort.ts | lines 92.31 br 85.71 fn 100.0 | uncovered lines: 73,81
- packages/admin/src/shell/lib/agent-screen-context.ts | lines 40.62 br 14.29 fn 20.0 | uncovered lines: 62-64,74-78,86-90,100-102,111-113
- packages/admin/src/shell/lib/assistant-daemon-activation.ts | lines 93.48 br 78.12 fn 100.0 | uncovered lines: 25,61-62
- packages/admin/src/shell/lib/assistant-prompt-bus.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,15-16,19-23,26-29,31-32,40-63
- packages/admin/src/shell/lib/browser-stream.ts | lines 100.0 br 98.89 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/lib/browser-working-directory-access.ts | lines 100.0 br 95.24 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/lib/credential-card-guidance.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 4-5,10-11,14-21,25-30
- packages/admin/src/shell/lib/descriptor-i18n.ts | lines 100.0 br 97.67 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/lib/editor-template-options.rules.ts | lines 100.0 br 33.33 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/lib/execution-settings-ledger.ts | lines 95.24 br 69.81 fn 89.47 | uncovered lines: 60-61,83-84,134,290-292
- packages/admin/src/shell/lib/fetch-query/adapter-context.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,5
- packages/admin/src/shell/lib/live-tiptap-editor.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 26-31
- packages/admin/src/shell/lib/media-embed-extension.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,30-32,42-50,62-64,71-85,129-131,137-142,144-167
- packages/admin/src/shell/lib/media-image-extension.hooks.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 7-12,15-20
- packages/admin/src/shell/lib/paint-admin-accent.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/lib/queued-daemon-start.ts | lines 100.0 br 100.0 fn 87.5 | uncovered lines: 
- packages/admin/src/shell/lib/server-failure.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 4-7
- packages/admin/src/shell/lib/settings-effective-reads.ts | lines 93.55 br 86.67 fn 100.0 | uncovered lines: 58-59
- packages/admin/src/shell/lib/status-labels.ts | lines 100.0 br 90.0 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/lib/stored-credential-endpoint.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/lib/stream-activity.ts | lines 62.07 br 100.0 fn 88.89 | uncovered lines: 70-91
- packages/admin/src/shell/lib/unique-id.ts | lines 25.0 br 50.0 fn 50.0 | uncovered lines: 15-16,18-27
- packages/admin/src/shell/lib/viewer-time-zone.ts | lines 100.0 br 0.0 fn 100.0 | uncovered lines: 
- packages/admin/src/shell/lib/widget-embed-placement-content.ts | lines 85.71 br 100.0 fn 75.0 | uncovered lines: 12-13
- packages/admin/src/sites/transfer/use-export-password.hooks.ts | lines 100.0 br 95.24 fn 100.0 | uncovered lines: 
- packages/admin/src/widgets/controllers/regions.controller.ts | lines 100.0 br 86.67 fn 100.0 | uncovered lines: 
- packages/admin/src/widgets/react/components/WidgetInstanceNotices.tsx | lines 96.97 br 92.86 fn 100.0 | uncovered lines: 38
- packages/admin/src/widgets/react/hooks/use-widget-instance-editor.hooks.ts | lines 100.0 br 100.0 fn 92.31 | uncovered lines: 
