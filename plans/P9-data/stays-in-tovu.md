# P9K — files in Jini-bound directories that STAY in Tovu (412)

Rules: plan.mjs KEEP_RULES (product screens, desktop packaging, composition, product-named files), Codex FIX/BLOCK 11-22 (Tovu policy files; their types move to core in K4 seam steps), K1 host ports (Express auth/session/static helpers the host turns into `JsonRoutePorts`), K3 (product copy with no args object). Steps may add rows under their STOP rules; each such row names the step.

| file | LOC | why it stays |
|---|---|---|
| `apps/admin/src/features/admin-ui/admin-ui.css` | 4 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/admin-ui/AdminUi.tsx` | 45 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/admin-ui/index.ts` | 2 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/AdminPermanentDeletes.tsx` | 59 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/AdminSubagents.tsx` | 60 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/ai-assistant-i18n.ts` | 2923 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/ai-assistant-layout-i18n.ts` | 639 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/ai-assistant.css` | 217 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/AiAssistant.hooks.ts` | 7 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/AiAssistant.tsx` | 1081 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/api/ai-assistant-api.ts` | 124 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/api/ai-assistant-api.types.ts` | 103 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/AssistantToggleRow.tsx` | 55 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/ai-assistant-dependencies.hooks.ts` | 50 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/ai-assistant-port.hooks.ts` | 16 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/assistant-daemon-restart-dependencies.hooks.ts` | 54 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/assistant-daemon-restart-port.hooks.ts` | 21 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/use-admin-assistant-switch.hooks.ts` | 34 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/use-admin-execution-mode.hooks.ts` | 74 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/use-admin-permanent-deletes.hooks.ts` | 36 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/use-admin-subagents.hooks.ts` | 115 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/use-ai-assistant-locale-sync.hooks.ts` | 52 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/use-ai-assistant.hooks.ts` | 130 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/use-assistant-daemon-restart.hooks.ts` | 131 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/use-assistant-owner-grant.hooks.ts` | 87 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/use-visitor-assistant-panel.hooks.ts` | 49 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts` | 710 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/use-visitor-tools.hooks.ts` | 128 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/visitor-credential-form-dependencies.hooks.ts` | 61 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/hooks/visitor-credential-form-port.hooks.ts` | 23 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/index.ts` | 10 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/OwnerGrantStatus.tsx` | 15 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/rules.ts` | 246 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/visitor-tools-i18n.ts` | 453 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/VisitorAssistantPanel.hooks.ts` | 5 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/VisitorAssistantPanel.tsx` | 116 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/VisitorAssistantTabs.hooks.ts` | 10 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/VisitorAssistantTabs.tsx` | 51 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/ai-assistant/VisitorToolsPanel.tsx` | 173 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/dashboard/dashboard-i18n.ts` | 2218 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/dashboard/Dashboard.tsx` | 366 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/dashboard/hooks/dashboard-dependencies.hooks.ts` | 109 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/dashboard/hooks/dashboard-port.hooks.ts` | 42 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/dashboard/hooks/use-dashboard.hooks.ts` | 289 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/dashboard/hooks/use-recent-activity-disclosure.hooks.ts` | 22 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/dashboard/index.ts` | 10 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/dashboard/rules.ts` | 137 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/playground/hooks/use-playground-canvas.hooks.ts` | 50 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/playground/index.ts` | 8 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/playground/playground-i18n.ts` | 30 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/playground/Playground.hooks.ts` | 7 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/playground/Playground.tsx` | 71 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/AllSitesTab.tsx` | 381 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/api/sites-api.ts` | 92 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/api/sites-api.types.ts` | 210 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/CreateSiteOnboarding.tsx` | 352 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/CredentialWarnings.tsx` | 67 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/site-export-actions.ts` | 107 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/site-import-actions.ts` | 71 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/site-import-controller.ts` | 68 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts` | 192 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/site-transfer-rules.ts` | 69 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/sites-dependencies.hooks.ts` | 46 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/sites-port.hooks.ts` | 23 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-create-site-plugin-tokens.hooks.ts` | 55 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-created-site-return.hooks.ts` | 44 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-desktop-import.hooks.ts` | 56 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-export-password.hooks.ts` | 63 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-live-import-site.hooks.ts` | 125 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-local-sites.hooks.ts` | 155 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-share-credential-gate.hooks.ts` | 109 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-site-card-preview.hooks.ts` | 46 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-site-confirm.hooks.ts` | 43 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-site-export-state.hooks.ts` | 50 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-site-import-state.hooks.ts` | 56 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-site-list-prefs.hooks.ts` | 29 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-site-transfer.hooks.ts` | 168 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-sites-config.hooks.ts` | 53 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-sites-snapshot.hooks.ts` | 28 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-sites.hooks.ts` | 354 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/hooks/use-static-export-selection.hooks.ts` | 60 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/import-handoff-port.ts` | 33 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/index.ts` | 16 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/LocalSiteConfirmDialog.tsx` | 11 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/rules.ts` | 263 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/site-export-error.ts` | 33 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/site-publish-i18n.ts` | 35 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/site-transfer-i18n.ts` | 394 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/site-transfer-rules.ts` | 78 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/SiteExportTab.tsx` | 242 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/SiteImportTab.tsx` | 392 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/sites-i18n.ts` | 366 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/sites-settings-i18n.ts` | 554 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/Sites.hooks.tsx` | 569 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/Sites.tsx` | 412 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/SitesHomeSetting.tsx` | 162 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/SiteTrashTab.tsx` | 44 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/sites/StaticExportPicker.tsx` | 67 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/voice-input/hooks/mic-button-view.hooks.ts` | 80 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/voice-input/hooks/mic-capture.ts` | 103 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/voice-input/hooks/push-to-talk-state.hooks.ts` | 123 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/voice-input/hooks/space-hold-rules.ts` | 87 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/voice-input/hooks/use-composer-voice-input.hooks.ts` | 43 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/voice-input/hooks/use-push-to-talk.hooks.ts` | 247 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/voice-input/hooks/use-space-hold-to-talk.hooks.ts` | 138 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/voice-input/push-to-talk-mic-button.css` | 92 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/voice-input/PushToTalkMicButton.tsx` | 102 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/voice-input/voice-input-config.ts` | 19 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/voice-input/voice-input-port.ts` | 54 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/voice-input/voice-unavailability.ts` | 58 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/voice-input/VoiceInputPlaceholder.tsx` | 18 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/workspace/api/workspace-api.ts` | 14 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/workspace/api/workspace-api.types.ts` | 8 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/workspace/hooks/use-workspace-redirect.hooks.ts` | 38 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/workspace/hooks/use-workspace.hooks.ts` | 126 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/workspace/hooks/workspace-dependencies.hooks.ts` | 54 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/workspace/hooks/workspace-port.hooks.ts` | 17 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/workspace/index.ts` | 11 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/workspace/rules.ts` | 42 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/workspace/workspace-i18n.ts` | 436 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/workspace/Workspace.tsx` | 182 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/features/workspace/WorkspaceRedirect.tsx` | 13 | Tovu product screen (assistant dock / dashboard / sites switcher) |
| `apps/admin/src/lib/i18n-common.ts` | 717 | Tovu product words |
| `apps/admin/src/lib/tovu-execution-policy.ts` | 32 | product-named file (tovu-*) |
| `apps/desktop/src/add-site-pointer.ts` | 207 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/admin-dev-proxy.ts` | 158 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/agent-plugin-tokens.ts` | 155 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/complexity-debt.ts` | 176 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/app-version.ts` | 17 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/chat-attachments.ts` | 36 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/find-in-page.ts` | 37 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/import-handoff.ts` | 50 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/owner-store.ts` | 79 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/product-telemetry.ts` | 7 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/project.ts` | 327 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/resources.ts` | 58 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/runtime-inventory.ts` | 32 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/sections.ts` | 286 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/site-name.ts` | 27 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/site-theme-preview-bridge.ts` | 25 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/site-view-preference.ts` | 30 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/working-directory.ts` | 18 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/workspace-chat.ts` | 128 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/workspace-conversations.ts` | 53 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/contracts/zoom.ts` | 24 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/coverage-floors.ts` | 400 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/desktop-agent-inventory.ts` | 70 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/desktop-agent-service.ts` | 374 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/desktop-agent-tools.ts` | 188 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/desktop-agent.ts` | 518 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/desktop-auth.ts` | 446 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/desktop-capture.ts` | 96 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/desktop-chat-main.ts` | 93 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/desktop-host-signals.ts` | 30 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/desktop-i18n.ts` | 182 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/desktop-mcp-http.ts` | 83 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/desktop-resources.ts` | 236 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/desktop-update-preference.ts` | 43 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/desktop-user-data-dir.ts` | 70 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/dist-import-check.ts` | 39 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/external-site-stop.ts` | 213 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/import-handoff-ipc.ts` | 46 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/live-verify-checks.ts` | 40 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/boot/boot-failure.ts` | 106 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/boot/boot-sequence.ts` | 187 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/boot/boot-steps.ts` | 211 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/boot/own-server-boot.ts` | 201 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/boot/site-backend.ts` | 294 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/boot/site-preview-guests.ts` | 102 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/boot/site-preview.ts` | 117 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/index.ts` | 1164 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/updates/desktop-updater.ts` | 222 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/updates/native-notices.ts` | 81 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/updates/product-telemetry-boot.ts` | 210 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/updates/settings-menu.ts` | 136 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/windows/app-window.ts` | 114 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/windows/dock-icon.ts` | 35 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/windows/guest-navigation.ts` | 71 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/windows/site-folder-prompt.ts` | 72 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/windows/site-open-actions.ts` | 57 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/windows/site-window.ts` | 252 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/main/windows/sites-home-window.ts` | 225 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/move-site-home.ts` | 33 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/move-to-applications.ts` | 241 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/nested-sites-migration.ts` | 89 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/owner-store-cli.ts` | 171 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/owner-store-ipc.ts` | 220 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/packaged-gate-isolation.ts` | 23 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/packaged-paths.ts` | 125 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/product-memory-telemetry.ts` | 98 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/product-telemetry-ipc.ts` | 79 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/product-telemetry-preference.ts` | 97 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/product-telemetry.ts` | 88 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/project-ipc.catalog.ts` | 216 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/project-ipc.create.ts` | 161 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/project-ipc.delete.ts` | 213 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/project-ipc.import.ts` | 125 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/project-ipc.presence.ts` | 54 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/project-ipc.records.ts` | 170 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/project-ipc.rename.ts` | 148 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/project-ipc.server.ts` | 229 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/project-ipc.site-lifecycle.ts` | 365 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/project-ipc.ts` | 239 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/project-ipc.types.ts` | 239 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/quality-gates.ts` | 239 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app-render-harness.ts` | 139 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app-shell-source.ts` | 23 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app.css` | 2310 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/App.hooks.ts` | 55 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/App.tsx` | 398 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/component-harness.ts` | 109 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/CreateWebsiteHost.tsx` | 42 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/FindBar.tsx` | 72 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/LoadedSitesStepper.hooks.ts` | 38 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/LoadedSitesStepper.tsx` | 65 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/MainArea.tsx` | 112 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/MainContent.tsx` | 160 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/MainHeader.tsx` | 73 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/SettingsControl.tsx` | 202 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/SiteStartPanel.tsx` | 110 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/SiteWorkspace.tsx` | 362 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/Spinner.tsx` | 11 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/TabCloseAsk.tsx` | 36 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/TabStrip.tsx` | 107 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/app/TopNav.tsx` | 122 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/chat-attachments.ts` | 57 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/create-website-onboarding-policy.ts` | 15 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/CreateWebsiteOnboarding.tsx` | 441 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/dom-hook-harness.ts` | 58 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/expanded-mode.ts` | 95 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/find-bar-state.ts` | 63 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/find-focus-clock.ts` | 23 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/find-input-focus.ts` | 93 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/find-target.ts` | 158 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/folder-drop.ts` | 95 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/icon-frame.tsx` | 13 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/icons.tsx` | 220 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/import-drop.ts` | 47 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/import-error-details.ts` | 18 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/import-site-entry.ts` | 73 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/ImportWebsite.tsx` | 152 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/jini-kits.ts` | 10 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/jini-surfaces.ts` | 14 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/main.tsx` | 37 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/mount-renderer.ts` | 42 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/nav-availability.ts` | 8 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/product-telemetry.ts` | 31 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/ResourcesPanel.hooks.ts` | 13 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/ResourcesPanel.tsx` | 207 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/runner-api.ts` | 195 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/runner-conversation-controller.ts` | 394 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/SharedKeys.css` | 24 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/SharedKeys.hooks.ts` | 157 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/SharedKeys.tsx` | 154 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/site-port.rules.ts` | 61 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/site-shell-policy.ts` | 60 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/site-status.ts` | 18 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/site-theme-preview.hooks.ts` | 60 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/SiteGrid.hooks.ts` | 168 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/SiteGrid.tsx` | 751 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/sites-home-view.ts` | 100 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/SitesFolders.tsx` | 130 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/SiteToast.tsx` | 22 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/source-test-harness.ts` | 77 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/theme.ts` | 51 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/tool-icons.tsx` | 81 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-add-site.hooks.ts` | 157 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-app-version.hooks.ts` | 24 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-create-site-plugin-tokens.hooks.ts` | 119 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-create-website-form.hooks.ts` | 200 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-delete-confirmation.hooks.ts` | 60 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-dropdown-menu.hooks.ts` | 77 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-expanded-mode.hooks.ts` | 52 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-find-bar-effects.hooks.ts` | 105 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-find-bar-state.hooks.ts` | 50 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-find-focus-reclaim.hooks.ts` | 69 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-find-in-page.hooks.ts` | 170 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-find-input-binding.hooks.ts` | 100 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-import-drop.hooks.ts` | 54 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-import-handoff.hooks.ts` | 43 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-import-website.hooks.ts` | 173 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-live-views.hooks.ts` | 130 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-loaded-sites.hooks.ts` | 63 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-new-site-dir.hooks.ts` | 32 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-product-screen.hooks.ts` | 13 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-project-mutations.hooks.ts` | 130 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-project-tabs.hooks.ts` | 71 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-resources.hooks.ts` | 102 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-runner-conversations.hooks.ts` | 127 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-section-nav.hooks.ts` | 161 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-site-actions.hooks.ts` | 56 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-site-folders.hooks.ts` | 96 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-site-list-prefs.hooks.ts` | 68 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-site-locate.hooks.ts` | 75 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-site-power.hooks.ts` | 352 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-site-preview.hooks.ts` | 113 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-site-rename.hooks.ts` | 221 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-site-start.hooks.ts` | 144 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-site-storage-settings.hooks.ts` | 25 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-site-toast.hooks.ts` | 52 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-site-view-preference.hooks.ts` | 35 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-site-workspace.hooks.ts` | 417 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-sites-folders-dialog.hooks.ts` | 69 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-sites-inventory.hooks.ts` | 165 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-start-imported.hooks.ts` | 53 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-tab-close-ask.hooks.ts` | 113 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-update-check.hooks.ts` | 29 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-webview-load-failure.hooks.ts` | 135 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-workspace-chat-pane.hooks.ts` | 187 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-workspace-chat-transport.hooks.ts` | 81 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/use-zoom.hooks.ts` | 258 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/workspace-chat-transport.ts` | 471 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/renderer/WorkspaceChatPane.tsx` | 144 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/resources-ipc.ts` | 31 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/runner-ipc-stubs.ts` | 118 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/selftest-tracker.ts` | 96 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/shared-sites.ts` | 223 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-archive-import.ts` | 173 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-child-registry.ts` | 291 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-config.ts` | 167 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-dir-store.ts` | 596 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-directory-identity.ts` | 114 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-discovery-scan.ts` | 41 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-discovery-worker.ts` | 7 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-discovery.ts` | 60 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-folders.ts` | 165 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-name-policy.ts` | 33 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-name.ts` | 23 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-power-verify.ts` | 166 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-preview-store.ts` | 215 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-scan-policy.ts` | 41 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-theme-preview-ipc.ts` | 73 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-theme-preview.ts` | 124 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/site-view-preference.ts` | 172 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/sites-mcp-identity.ts` | 11 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/sites-mcp-tools.ts` | 393 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/smoke-bridge.ts` | 292 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/smoke-native.ts` | 310 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/smoke-packaged-chat-gate.ts` | 429 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/smoke-packaged-chat.ts` | 203 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/stage-payload-lib.ts` | 712 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/stage-payload-run.ts` | 476 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/staged-closure-scan.ts` | 23 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/startup-env.ts` | 96 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/supervised-site-url.ts` | 24 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/tovu-server.output.ts` | 66 | product-named file (tovu-*) |
| `apps/desktop/src/tovu-server.ts` | 963 | product-named file (tovu-*) |
| `apps/desktop/src/tracked-site-relocation.ts` | 147 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/tracked-sites.ts` | 705 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/tree-quiet.ts` | 95 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/update-check-now.ts` | 187 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/update-policy.ts` | 22 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/verify-package-cli.ts` | 181 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/webview-guest-policy.ts` | 34 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/window-bounds-store.ts` | 71 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/window-navigation-policy.ts` | 87 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/workspace-chat-ipc.ts` | 220 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/workspace-conversation-store.ts` | 146 | desktop packaging / site management (Tovu product) |
| `apps/desktop/src/zoom-menu.ts` | 52 | desktop packaging / site management (Tovu product) |
| `apps/website/src/contracts/core/admin-locales.ts` | 2 | K3: imports product copy and has no args object to carry it (owner K3: stays) |
| `apps/website/src/contracts/core/approval-i18n.ts` | 118 | Codex FIX/BLOCK 11-22: Tovu policy (approval-i18n); K4 moves only its types to core |
| `apps/website/src/contracts/core/assistant-content-guidance.ts` | 13 | Codex FIX/BLOCK 11-22: Tovu policy (assistant-content-guidance); K4 moves only its types to core |
| `apps/website/src/contracts/core/consent-refusal.ts` | 12 | Codex FIX/BLOCK 11-22: Tovu policy (consent-refusal); K4 moves only its types to core |
| `apps/website/src/contracts/core/credential-store.ts` | 9 | Codex FIX/BLOCK 11-22: Tovu policy (credential-store); K4 moves only its types to core |
| `apps/website/src/contracts/core/custom-credential-categories.ts` | 10 | Codex FIX/BLOCK 11-22: Tovu policy (custom-credential-categories); K4 moves only its types to core |
| `apps/website/src/contracts/core/fs-folder-recovery.ts` | 4 | Codex FIX/BLOCK 11-22: Tovu policy (fs-folder-recovery); K4 moves only its types to core |
| `apps/website/src/contracts/core/gated-mutations/composition.ts` | 164 | Codex FIX/BLOCK 11-22: Tovu policy (gated-mutations/composition); K4 moves only its types to core |
| `apps/website/src/contracts/core/gated-mutations/gateway.ts` | 214 | Codex FIX/BLOCK 11-22: Tovu policy (gated-mutations/gateway); K4 moves only its types to core |
| `apps/website/src/contracts/core/gated-mutations/ports.ts` | 54 | Codex FIX/BLOCK 11-22: Tovu policy (gated-mutations/ports); K4 moves only its types to core |
| `apps/website/src/contracts/core/gated-mutations/token.ts` | 147 | Codex FIX/BLOCK 11-22: Tovu policy (gated-mutations/token); K4 moves only its types to core |
| `apps/website/src/contracts/core/public-page-security-headers.ts` | 49 | Codex FIX/BLOCK 11-22: Tovu policy (public-page-security-headers); K4 moves only its types to core |
| `apps/website/src/contracts/core/publish-history-list-limit.ts` | 25 | Codex FIX/BLOCK 11-22: Tovu policy (publish-history-list-limit); K4 moves only its types to core |
| `apps/website/src/contracts/core/redirect-tables.ts` | 8 | Codex FIX/BLOCK 11-22: Tovu policy (redirect-tables); K4 moves only its types to core |
| `apps/website/src/contracts/core/runtime-mode.ts` | 33 | Codex FIX/BLOCK 11-22: Tovu policy (runtime-mode); K4 moves only its types to core |
| `apps/website/src/contracts/core/scheduled-publish.ts` | 63 | Codex FIX/BLOCK 11-22: Tovu policy (scheduled-publish); K4 moves only its types to core |
| `apps/website/src/contracts/core/secret-redaction.ts` | 2 | K3: imports product copy and has no args object to carry it (owner K3: stays) |
| `apps/website/src/contracts/core/settings-vocabulary.ts` | 12 | Codex FIX/BLOCK 11-22: Tovu policy (settings-vocabulary); K4 moves only its types to core |
| `apps/website/src/contracts/core/site-key-state.ts` | 39 | Codex FIX/BLOCK 11-22: Tovu policy (site-key-state); K4 moves only its types to core |
| `apps/website/src/contracts/core/theme-ids.ts` | 60 | Codex FIX/BLOCK 11-22: Tovu policy (theme-ids); K4 moves only its types to core |
| `apps/website/src/contracts/core/theme-slots.ts` | 42 | Codex FIX/BLOCK 11-22: Tovu policy (theme-slots); K4 moves only its types to core |
| `apps/website/src/contracts/core/tool-metadata/approval-policy.ts` | 12 | Codex FIX/BLOCK 11-22: Tovu policy (tool-metadata/approval-policy); K4 moves only its types to core |
| `apps/website/src/contracts/core/tool-metadata/post.ts` | 120 | Codex FIX/BLOCK 11-22: Tovu policy (tool-metadata/post); K4 moves only its types to core |
| `apps/website/src/contracts/core/tool-metadata/site-evidence.ts` | 14 | Codex FIX/BLOCK 11-22: Tovu policy (tool-metadata/site-evidence); K4 moves only its types to core |
| `apps/website/src/contracts/core/tool-metadata/site-guide.ts` | 14 | Codex FIX/BLOCK 11-22: Tovu policy (tool-metadata/site-guide); K4 moves only its types to core |
| `apps/website/src/contracts/core/tool-metadata/sites.ts` | 59 | Codex FIX/BLOCK 11-22: Tovu policy (tool-metadata/sites); K4 moves only its types to core |
| `apps/website/src/contracts/core/widget-tables.ts` | 3 | Codex FIX/BLOCK 11-22: Tovu policy (widget-tables); K4 moves only its types to core |
| `apps/website/src/contracts/headless/assistant-permanent-deletes-policy.ts` | 40 | Codex FIX/BLOCK 11-22: Tovu policy (assistant-permanent-deletes-policy); K4 moves only its types to core |
| `apps/website/src/features/custom-credentials/tovu-credential-card-identity.ts` | 19 | product-named file (tovu-*) |
| `apps/website/src/features/custom-credentials/tovu-credential-sets.ts` | 61 | product-named file (tovu-*) |
| `apps/website/src/features/publish-content/tovu-publish-ports.ts` | 152 | product-named file (tovu-*) |
| `apps/website/src/features/publish-content/ui/sections.ts` | 104 | Codex FIX/BLOCK 11-22: Tovu policy (sections); K4 moves only its types to core |
| `apps/website/src/features/site-export/export-failure-summary.ts` | 57 | Codex FIX/BLOCK 11-22: Tovu policy (export-failure-summary); K4 moves only its types to core |
| `apps/website/src/features/sites/agent-tools.ts` | 160 | Tovu product: site management / owner guidance |
| `apps/website/src/features/sites/deps.ts` | 125 | Tovu product: site management / owner guidance |
| `apps/website/src/features/sites/index.ts` | 43 | Tovu product: site management / owner guidance |
| `apps/website/src/features/sites/list-tool.ts` | 5 | Tovu product: site management / owner guidance |
| `apps/website/src/features/sites/site-admin.ts` | 337 | Tovu product: site management / owner guidance |
| `apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts` | 154 | Tovu product: site management / owner guidance |
| `apps/website/src/features/sites/site-preview/site-preview-service.ts` | 152 | Tovu product: site management / owner guidance |
| `apps/website/src/features/sites/site-preview/site-preview-store.ts` | 97 | Tovu product: site management / owner guidance |
| `apps/website/src/features/sites/tool-registrations.ts` | 316 | Tovu product: site management / owner guidance |
| `apps/website/src/features/sites/warm-switch.ts` | 37 | Tovu product: site management / owner guidance |
| `apps/website/src/platform/html/menu-render.ts` | 88 | Codex FIX/BLOCK 11-22: Tovu policy (menu-render); K4 moves only its types to core |
| `apps/website/src/platform/html/published-webmcp-strip.ts` | 69 | Codex FIX/BLOCK 11-22: Tovu policy (published-webmcp-strip); K4 moves only its types to core |
| `apps/website/src/platform/html/safe-url.ts` | 149 | Codex FIX/BLOCK 11-22: Tovu policy (safe-url); K4 moves only its types to core |
| `apps/website/src/server/inbound/admin-http/admin-dev-proxy.ts` | 265 | K1 host port: Express auth/session/static helper the host turns into JsonRoutePorts (stays as composition) |
| `apps/website/src/server/inbound/admin-http/admin-static.ts` | 103 | K1 host port: Express auth/session/static helper the host turns into JsonRoutePorts (stays as composition) |
| `apps/website/src/server/inbound/admin-http/authorize-guard.ts` | 90 | K1 host port: Express auth/session/static helper the host turns into JsonRoutePorts (stays as composition) |
| `apps/website/src/server/inbound/admin-http/dev-auth.ts` | 877 | K1 host port: Express auth/session/static helper the host turns into JsonRoutePorts (stays as composition) |
| `apps/website/src/server/inbound/admin-http/local-admin-request.ts` | 28 | K1 host port: Express auth/session/static helper the host turns into JsonRoutePorts (stays as composition) |
| `apps/website/src/server/inbound/admin-http/publish-trust-auth.ts` | 473 | K1 host port: Express auth/session/static helper the host turns into JsonRoutePorts (stays as composition) |
| `apps/website/src/server/inbound/admin-http/sea-runtime.ts` | 41 | K1 host port: Express auth/session/static helper the host turns into JsonRoutePorts (stays as composition) |
