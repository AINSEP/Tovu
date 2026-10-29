### admin own-code cycles
1. lib/api.ts → lib/settings-effective-reads.ts
2. panels.tsx → components/Placeholder.tsx → nav.ts
3. components/WidgetPickerDialog/WidgetPickerDialog.tsx → components/WidgetPickerDialog/WidgetPickerDialog.hooks.tsx
4. components/MediaPickerDialog/MediaPickerDialog.tsx → components/MediaPickerDialog/JiniMediaPicker.hooks.ts
5. integrations/jini-admin/modules.hooks.ts → integrations/jini-admin/seo-module.hooks.ts → components/MediaPickerDialog/MediaPickerDialog.tsx → components/MediaPickerDialog/JiniMediaPicker.hooks.ts
6. panels.tsx → features/comments/index.ts → integrations/jini-admin/modules.hooks.ts
7. features/pages/rules.ts → features/pages/hooks/use-page-editor.hooks.ts → features/pages/hooks/page-editor-dependencies.hooks.ts
8. features/pages/rules.ts → features/pages/hooks/use-page-editor.hooks.ts
9. features/pages/hooks/use-theme-pages.hooks.ts → features/pages/lib/theme-page-publish-state.ts
10. features/pages/rules.ts → features/pages/hooks/use-theme-pages.hooks.ts
11. hooks/use-standing-draft-autosave.hooks.ts → lib/standing-draft-local-backup.ts
12. features/posts/hooks/use-post-editor.hooks.ts → features/posts/hooks/post-editor-save.rules.ts → features/posts/hooks/post-editor-state.rules.ts
13. features/posts/hooks/use-post-editor.hooks.ts → features/posts/hooks/post-editor-save.rules.ts
14. panels.tsx → media-panel.ts
jini-dist cycles: chat/dist/react/hooks/useUserTextGuard.d.ts ↔ chat/dist/react/index.d.ts ; ui/dist/features/panel-kit/helpers/standing-draft-local-backup.d.ts ↔ ui/dist/features/panel-kit/hooks/use-standing-draft-autosave.hooks.d.ts
website files imported by admin (production):
- apps/website/src/platform/html/slug.ts  ← features/menus/hooks/use-menu-editor.hooks.ts
- apps/website/src/features/post/slug.ts  ← features/posts/rules.ts
- apps/website/src/features/site-backup/share-policy.ts  ← features/sites/hooks/use-site-transfer.hooks.ts
- apps/website/src/contracts/core/credential-copy.ts  ← lib/credential-copy.ts
- apps/website/src/contracts/core/credential-token.ts  ← lib/credential-copy.ts
- apps/website/src/contracts/core/admin-locales.ts  ← lib/settings-tabs.ts
### desktop own-code cycles
1. sites-mcp-tools.ts → add-site-pointer.ts → site-dir-store.ts → tovu-server.ts → sites-mcp-registration.ts
2. renderer/use-site-workspace.hooks.ts → renderer/site-theme-preview.hooks.ts
jini-dist cycles: chat/dist/react/hooks/useUserTextGuard.d.ts ↔ chat/dist/react/index.d.ts ; ui/dist/features/panel-kit/helpers/standing-draft-local-backup.d.ts ↔ ui/dist/features/panel-kit/hooks/use-standing-draft-autosave.hooks.d.ts
website files imported by desktop (production):
- apps/website/src/platform/server-logs/redact-local-text.ts  ← ../scripts/check-complexity.ts, ../scripts/check-coverage.ts, ../scripts/check-js-backslide.ts (+6)
- apps/website/src/contracts/core/assistant-native-fallbacks.ts  ← desktop-agent.ts
- apps/website/src/contracts/core/host-signals.ts  ← desktop-agent.ts, desktop-host-signals.ts
- apps/website/src/contracts/core/secret-redaction.ts  ← desktop-agent.ts, tovu-server.ts
- apps/website/src/contracts/headless/assistant-subagents-policy.ts  ← desktop-agent.ts, desktop-chat-main.ts
- apps/website/src/features/agent-plugins/host-signals.ts  ← desktop-host-signals.ts
- apps/website/src/server/runtime/composition/product-telemetry.ts  ← product-memory-telemetry.ts, product-telemetry-preference.ts, product-telemetry.ts
- apps/website/src/server/runtime/composition/product-events.ts  ← product-telemetry-ipc.ts
- renderer/create-website-onboarding-policy.ts  ← renderer/CreateWebsiteOnboarding.tsx
- apps/website/src/platform/server-logs/console-tee.ts  ← tovu-server.ts
