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

REPO: Tovu only. HEAD = codex/tv-w62-cov-adm-1 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- apps/admin/src/App.chrome.tsx | lines 93.33 br 95.0 fn 85.71 | uncovered lines: 135
- apps/admin/src/App.hooks.ts | lines 98.97 br 99.22 fn 97.89 | uncovered lines: 899,932
- apps/admin/src/App.tsx | lines 100.0 br 95.92 fn 100.0 | uncovered lines: 
- apps/admin/src/admin-themes/registry.ts | lines 100.0 br 92.31 fn 100.0 | uncovered lines: 
- apps/admin/src/admin-themes/use-admin-theme.hooks.ts | lines 100.0 br 98.51 fn 100.0 | uncovered lines: 
- apps/admin/src/components/AssistantDock/assistant-runtime-preferences.adapter.ts | lines 77.78 br 87.5 fn 71.43 | uncovered lines: 13,19
- apps/admin/src/components/AssistantDock/chat-cleanup-copy.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- apps/admin/src/components/AssistantDock/chat-cleanup-kit.tsx | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- apps/admin/src/components/AssistantDock/hooks/composer-files.hooks.ts | lines 100.0 br 100.0 fn 90.91 | uncovered lines: 
- apps/admin/src/components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts | lines 90.91 br 100.0 fn 85.71 | uncovered lines: 180-181
- apps/admin/src/components/EmbedInsertControl/EmbedInsertControl.hooks.tsx | lines 66.67 br 85.71 fn 66.67 | uncovered lines: 31
- apps/admin/src/features/ai-assistant/hooks/assistant-daemon-restart-dependencies.hooks.ts | lines 88.89 br 100.0 fn 83.33 | uncovered lines: 82
- apps/admin/src/features/ai-assistant/hooks/use-admin-execution-mode.hooks.ts | lines 75.0 br 100.0 fn 50.0 | uncovered lines: 63
- apps/admin/src/features/ai-assistant/hooks/use-admin-subagents.hooks.ts | lines 97.5 br 95.0 fn 95.45 | uncovered lines: 45
- apps/admin/src/features/ai-assistant/hooks/visitor-tools-dependencies.hooks.ts | lines 50.0 br 0.0 fn 0.0 | uncovered lines: 22-23,27
- apps/admin/src/features/ai-assistant/visitor-tools-i18n.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- apps/admin/src/features/auth/auth-host-binding.tsx | lines 85.71 br 100.0 fn 83.33 | uncovered lines: 30
- apps/admin/src/features/auth/hooks/login-dependencies.hooks.ts | lines 66.67 br 50.0 fn 50.0 | uncovered lines: 12
- apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- apps/admin/src/features/content-analysis/hooks/content-analysis-dependencies.hooks.ts | lines 83.33 br 75.0 fn 100.0 | uncovered lines: 19
- apps/admin/src/features/email/email-hooks-host.ts | lines 84.62 br 71.43 fn 72.73 | uncovered lines: 50,55
- apps/admin/src/features/email/email-panel.tsx | lines 90.91 br 100.0 fn 50.0 | uncovered lines: 115
- apps/admin/src/features/fs-files/api/fs-files-api.ts | lines 87.5 br 50.0 fn 100.0 | uncovered lines: 46
- apps/admin/src/features/import-export/ImportExport.tsx | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- apps/admin/src/features/library/hooks/library-dependencies.hooks.ts | lines 70.0 br 100.0 fn 66.67 | uncovered lines: 14-16
- apps/admin/src/features/library/hooks/use-wired-library.hooks.ts | lines 100.0 br 87.5 fn 100.0 | uncovered lines: 
- apps/admin/src/features/media/hooks/media-dependencies.hooks.ts | lines 96.43 br 86.67 fn 95.24 | uncovered lines: 70
- apps/admin/src/features/media/media-i18n.ts | lines 100.0 br 60.0 fn 100.0 | uncovered lines: 
- apps/admin/src/features/media/upload-size-copy.ts | lines 100.0 br 90.0 fn 100.0 | uncovered lines: 
- apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts | lines 100.0 br 50.0 fn 83.33 | uncovered lines: 
- apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts | lines 50.0 br 0.0 fn 0.0 | uncovered lines: 49
- apps/admin/src/features/plugins/AgentPlugins.tsx | lines 50.0 br 100.0 fn 0.0 | uncovered lines: 41
- apps/admin/src/features/plugins/Plugins.tsx | lines 25.0 br 100.0 fn 0.0 | uncovered lines: 35,42,51
- apps/admin/src/features/plugins/hooks/agent-plugins-dependencies.hooks.ts | lines 83.33 br 86.67 fn 66.67 | uncovered lines: 13-15
- apps/admin/src/features/plugins/hooks/plugins-dependencies.hooks.ts | lines 95.95 br 86.59 fn 90.62 | uncovered lines: 18,23-24
- apps/admin/src/features/plugins/hooks/use-agent-plugin-details-modal.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 34-36
- apps/admin/src/features/plugins/hooks/use-agent-plugins.hooks.ts | lines 100.0 br 100.0 fn 75.0 | uncovered lines: 
- apps/admin/src/features/plugins/hooks/use-plugin-provider-settings.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 18-20
- apps/admin/src/features/posts/Posts.tsx | lines 66.67 br 100.0 fn 50.0 | uncovered lines: 24
- apps/admin/src/features/posts/hooks/use-loaded-post-apply.hooks.ts | lines 96.3 br 100.0 fn 87.5 | uncovered lines: 82
- apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts | lines 98.34 br 95.0 fn 98.28 | uncovered lines: 667-670
- apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts | lines 50.0 br 100.0 fn 0.0 | uncovered lines: 20
- apps/admin/src/features/recovery/hooks/recovery-dependencies.hooks.ts | lines 96.43 br 100.0 fn 93.75 | uncovered lines: 34
- apps/admin/src/features/routines/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 18-19,21,23-25,28
- apps/admin/src/features/routines/routines-i18n.ts | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- apps/admin/src/features/routines/use-conversation-deep-link.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- apps/admin/src/features/security/RecoveryCodesCard.hooks.ts | lines 70.0 br 100.0 fn 83.33 | uncovered lines: 19-21
- apps/admin/src/features/security/hooks/access-tokens-dependencies.hooks.ts | lines 95.12 br 96.0 fn 95.12 | uncovered lines: 31,72
- apps/admin/src/features/security/hooks/copy-keys-dependencies.hooks.ts | lines 66.67 br 50.0 fn 50.0 | uncovered lines: 17
- apps/admin/src/features/security/hooks/site-key-dependencies.hooks.ts | lines 100.0 br 100.0 fn 90.91 | uncovered lines: 
- apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts | lines 50.0 br 100.0 fn 0.0 | uncovered lines: 27
- apps/admin/src/features/settings/AdminAppearance.tsx | lines 100.0 br 96.67 fn 100.0 | uncovered lines: 
- apps/admin/src/features/settings/hooks/use-external-mcp-admissions.hooks.ts | lines 85.71 br 100.0 fn 80.0 | uncovered lines: 28
- apps/admin/src/features/settings/hooks/use-settings-ui.hooks.ts | lines 80.0 br 100.0 fn 40.0 | uncovered lines: 117,121,139
- apps/admin/src/features/sites/CredentialWarnings.tsx | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- apps/admin/src/features/sites/SiteExportTab.tsx | lines 100.0 br 97.62 fn 100.0 | uncovered lines: 
- apps/admin/src/features/sites/SiteImportTab.tsx | lines 98.53 br 98.02 fn 96.88 | uncovered lines: 232
- apps/admin/src/features/sites/Sites.tsx | lines 100.0 br 95.24 fn 100.0 | uncovered lines: 
- apps/admin/src/features/sites/SitesHomeSetting.tsx | lines 18.52 br 17.24 fn 14.29 | uncovered lines: 16,34,38-39,46-48,60,65-66,70,78-79,90,93,103,113,123,129,133,136,156
- apps/admin/src/features/sites/StaticExportPicker.tsx | lines 95.0 br 100.0 fn 90.91 | uncovered lines: 28
- apps/admin/src/features/sites/hooks/site-export-actions.ts | lines 100.0 br 92.31 fn 100.0 | uncovered lines: 
- apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts | lines 95.92 br 95.08 fn 94.29 | uncovered lines: 164,210
- apps/admin/src/features/sites/hooks/site-transfer-rules.ts | lines 100.0 br 92.59 fn 100.0 | uncovered lines: 
- apps/admin/src/features/sites/hooks/sites-dependencies.hooks.ts | lines 90.0 br 94.12 fn 86.67 | uncovered lines: 58,100
- apps/admin/src/features/sites/hooks/use-desktop-import.hooks.ts | lines 100.0 br 91.67 fn 100.0 | uncovered lines: 
- apps/admin/src/features/sites/hooks/use-live-import-site.hooks.ts | lines 100.0 br 82.35 fn 84.62 | uncovered lines: 
- apps/admin/src/features/sites/hooks/use-share-credential-gate.hooks.ts | lines 100.0 br 81.58 fn 100.0 | uncovered lines: 
- apps/admin/src/features/sites/hooks/use-share-expiry.hooks.ts | lines 100.0 br 90.0 fn 100.0 | uncovered lines: 
- apps/admin/src/features/sites/hooks/use-site-export-state.hooks.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- apps/admin/src/features/sites/hooks/use-site-import-state.hooks.ts | lines 100.0 br 98.36 fn 100.0 | uncovered lines: 
- apps/admin/src/features/sites/hooks/use-site-list-prefs.hooks.ts | lines 50.0 br 0.0 fn 0.0 | uncovered lines: 19-20,27
- apps/admin/src/features/sites/hooks/use-sites.hooks.ts | lines 95.12 br 100.0 fn 88.89 | uncovered lines: 209,350-352
- apps/admin/src/features/sites/hooks/use-static-export-selection.hooks.ts | lines 100.0 br 90.32 fn 100.0 | uncovered lines: 
- apps/admin/src/features/sites/import-handoff-port.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- apps/admin/src/features/sites/site-export-error.ts | lines 100.0 br 95.24 fn 100.0 | uncovered lines: 
- apps/admin/src/features/sites/site-transfer-i18n.ts | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- apps/admin/src/features/storage/Storage.tsx | lines 81.82 br 100.0 fn 50.0 | uncovered lines: 26,38
- apps/admin/src/features/storage/storage-i18n.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- apps/admin/src/features/themes/HeldBackThemes.tsx | lines 100.0 br 95.31 fn 100.0 | uncovered lines: 
- apps/admin/src/features/themes/ThemeExplore.tsx | lines 100.0 br 99.22 fn 100.0 | uncovered lines: 
- apps/admin/src/features/themes/Themes.tsx | lines 100.0 br 98.81 fn 100.0 | uncovered lines: 
- apps/admin/src/features/themes/hooks/held-back-themes-dependencies.hooks.ts | lines 95.24 br 96.55 fn 92.86 | uncovered lines: 13
- apps/admin/src/features/themes/hooks/use-held-back-themes.hooks.ts | lines 96.3 br 90.0 fn 90.48 | uncovered lines: 189,195
- apps/admin/src/features/themes/hooks/use-theme-explore-file-groups.hooks.ts | lines 100.0 br 96.97 fn 100.0 | uncovered lines: 
- apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts | lines 100.0 br 99.35 fn 100.0 | uncovered lines: 
- apps/admin/src/features/themes/theme-preview-refresh.ts | lines 100.0 br 95.0 fn 100.0 | uncovered lines: 
- apps/admin/src/features/users/hooks/use-wired-users.hooks.ts | lines 100.0 br 50.0 fn 75.0 | uncovered lines: 
- apps/admin/src/features/voice-input/hooks/use-push-to-talk.hooks.ts | lines 100.0 br 97.83 fn 100.0 | uncovered lines: 
- apps/admin/src/features/workspace/hooks/workspace-dependencies.hooks.ts | lines 75.0 br 100.0 fn 71.43 | uncovered lines: 47,55-56
- apps/admin/src/hooks/assistant-chats-dependencies.hooks.ts | lines 90.62 br 92.86 fn 78.12 | uncovered lines: 55-56,248-251
