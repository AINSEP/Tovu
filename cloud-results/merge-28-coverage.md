# MERGE-28 coverage report (measure only — no coverage tests written)

Target: 100% per file on lines/branches/functions. Method, denominators and traps: see `merge-28.md`. Website numbers cover shards 0–4 of 8 (2120 of 3392 test files) and are a LOWER BOUND; shards 5–7 remain.

## Totals

| scope | files (measured / denominator) | lines% | branches% | functions% | files at 100/100/100 | uncovered lines / branches / functions |
|---|---|---|---|---|---|---|
| Jini (all packages) | 7161 / 7162 | 89.68 | 95.36 | 91.54 | 4988 | 46740 / 7572 / 3671 |
| Tovu website (5/8 shards) | 1449 / 1519 | 93.25 | 89.71 | 79.44 | 302 | 8964 / 2659 / 2916 |
| Tovu admin | 504 / 504 | 97.72 | 96.01 | 95.05 | 385 | 149 / 213 / 160 |
| Tovu desktop | 224 / 226 | 95.88 | 96.58 | 91.02 | 95 | 1290 / 240 / 257 |

Node coverage (website, desktop) has no statements column (statements = lines). Admin's own vitest summary agrees (lines 97.72, branches 96.01, functions 95.02, statements 96.75).

## Jini per package

| package | files | vitest pass/fail (+node:test) | lines% | branches% | functions% | uncovered lines |
|---|---|---|---|---|---|---|
| admin | 1360 | 6572/8 | 88.09 | 93.81 | 85.39 | 12656 |
| agent-plugins | 266 | 2544/0 (+1408/0) | 88.54 | 95.44 | 91.44 | 2825 |
| agent-runtime | 265 | 4734/11 | 98.20 | 99.25 | 97.13 | 340 |
| agentic | 55 | 1240/0 | 94.39 | 96.16 | 91.67 | 163 |
| analytics | 24 | 294/0 | 88.66 | 97.90 | 99.29 | 126 |
| artifacts | 10 | 248/0 | 100.00 | 100.00 | 100.00 | 0 |
| capability-providers | 27 | 198/0 | 100.00 | 100.00 | 100.00 | 0 |
| chat | 287 | 4787/3 | 99.47 | 98.24 | 98.78 | 121 |
| cli | 20 | 619/0 | 99.83 | 99.71 | 100.00 | 2 |
| cms | 1290 | 9167/22 | 87.14 | 91.39 | 88.92 | 9041 |
| commerce | 96 | 12/0 (+63/0) | 17.89 | 91.18 | 69.43 | 4857 |
| cookie-consent | 49 | 295/0 | 85.29 | 93.88 | 87.68 | 358 |
| core | 499 | 3236/3 | 97.66 | 97.71 | 96.91 | 327 |
| daemon | 207 | 4896/0 | 98.57 | 97.10 | 98.15 | 212 |
| db | 147 | 1124/6 | 88.29 | 95.16 | 89.07 | 930 |
| desktop-host | 126 | 1051/0 | 99.11 | 95.51 | 98.87 | 41 |
| devops | 283 | 2043/3 | 75.53 | 87.13 | 80.77 | 4793 |
| diagnostics | 78 | 1295/0 | 97.14 | 98.32 | 97.81 | 126 |
| http-kit | 33 | 882/2 | 99.07 | 95.90 | 100.00 | 18 |
| infra | 15 | 188/1 | 100.00 | 98.64 | 100.00 | 0 |
| integrations | 188 | 2353/1 | 78.32 | 93.21 | 82.35 | 2759 |
| mcp | 137 | 1992/1 | 91.02 | 93.98 | 91.77 | 853 |
| memory | 11 | 409/0 | 100.00 | 100.00 | 100.00 | 0 |
| node-adapters | 3 | 41/0 | 100.00 | 100.00 | 94.44 | 0 |
| oauth | 36 | 824/0 | 100.00 | 99.90 | 100.00 | 0 |
| platform | 178 | 3552/0 | 95.04 | 97.61 | 96.93 | 621 |
| plugins | 100 | 1116/0 | 85.85 | 96.13 | 95.02 | 876 |
| protocol | 24 | 795/0 | 99.73 | 100.00 | 99.22 | 4 |
| provider-plugins | 61 | 1064/9 | 98.82 | 98.54 | 98.66 | 30 |
| registry | 20 | 406/0 | 99.92 | 97.79 | 100.00 | 1 |
| sandbox | 13 | 193/0 | 99.67 | 98.64 | 100.00 | 2 |
| search | 26 | 417/0 | 95.79 | 99.04 | 96.91 | 90 |
| server | 20 | 506/0 | 99.67 | 98.88 | 99.01 | 6 |
| sidecar | 26 | 460/0 | 100.00 | 97.87 | 100.00 | 0 |
| ui | 823 | 9028/0 | 99.14 | 99.60 | 99.51 | 414 |
| ui-kit | 29 | 232/0 | 100.00 | 98.76 | 100.00 | 0 |
| user-management | 303 | 2061/8 | 78.63 | 92.76 | 82.92 | 4130 |
| vibecoding | 27 | 364/0 | 99.06 | 97.18 | 97.67 | 18 |

commerce: 17.89% lines even with its node:test catalog suite merged — most of `src/` has no test. agent-plugins includes the 97 plugin-content `.mjs` files measured by the content suite.

## Missing from lcov (why)

- Jini (1): `packages/agent-plugins/scripts/build-cloudflare.mjs` — build script no test loads.
- desktop (2): `src/renderer/main.tsx` (renderer entry, mounts the app; no test imports it), `src/speech/preload-speech.cts` (esbuild-bundled preload; tests load the bundle).
- website (70): `packages/contracts/src` 23 and `packages/sdk/src` 3 — tests import the built `dist/` (excluded; no source map back to src); `apps/website/src` 44 — not loaded by shards 0–4 (shards 5–7 not run) or entry points no test imports. List: `awk -F'\t' '$2=="MISSING"' coverage-28/tovu-website.tsv`.

## Suspected mock-illusion (a test imports AND module-mocks the same unit)

- jini: 44 — `coverage-28/jini.mock-illusion.tsv` (file, lines%, test). High lines% on these files can come from other tests; the named test exercises a mock, not the unit.
- tovu-website: 12 — `coverage-28/tovu-website.mock-illusion.tsv` (file, lines%, test). High lines% on these files can come from other tests; the named test exercises a mock, not the unit.
- tovu-admin: 32 — `coverage-28/tovu-admin.mock-illusion.tsv` (file, lines%, test). High lines% on these files can come from other tests; the named test exercises a mock, not the unit.
- tovu-desktop: 0 — `coverage-28/tovu-desktop.mock-illusion.tsv` (file, lines%, test). High lines% on these files can come from other tests; the named test exercises a mock, not the unit.


## Detail: jini

- files in denominator: 7162; measured: 7161; missing from lcov: 1
- lines 89.68% (406187/452927), branches 95.36% (155757/163329), functions 91.54% (39715/43386)
- files at 100/100/100: 4988 of 7161 measured; distance to target: 46740 uncovered lines, 7572 uncovered branches, 3671 uncovered functions (+ 1 unmeasured files)

### 40 biggest gaps by uncovered lines (jini)

| file | lines% | br% | fn% | uncovered |
|---|---|---|---|---|
| `packages/plugins/src/host/tools/management.ts` | 0.0 | 100.0 | 100.0 | 450 |
| `packages/admin/src/screens/plugins/plugins-memory-i18n.ts` | 0.0 | 0.0 | 0.0 | 446 |
| `packages/integrations/src/credentialed-http/tools/tool-registrations.ts` | 2.15 | 100.0 | 0.0 | 409 |
| `packages/admin/src/screens/integrations/i18n/integrations-dict-es-to-ko.ts` | 0.0 | 100.0 | 100.0 | 398 |
| `packages/admin/src/screens/integrations/i18n/integrations-dict-pl-to-bn.ts` | 0.0 | 100.0 | 100.0 | 362 |
| `packages/commerce/src/payments/ledger/repo.memory.ts` | 0.0 | 0.0 | 0.0 | 341 |
| `packages/commerce/src/payments/ledger/repo.sql.ts` | 0.0 | 0.0 | 0.0 | 317 |
| `packages/admin/src/screens/providers/providers-i18n.ts` | 0.0 | 0.0 | 0.0 | 284 |
| `packages/user-management/src/newsletter/send-pipeline.ts` | 28.23 | 53.57 | 41.67 | 267 |
| `packages/agent-plugins/src/connect/connect-tool.ts` | 5.67 | 50.0 | 6.25 | 266 |
| `packages/admin/src/screens/collections/hooks/use-collection-entry-editor.hooks.ts` | 0.0 | 0.0 | 0.0 | 265 |
| `packages/commerce/src/payments/accounting/apply-evidence.ts` | 0.0 | 100.0 | 100.0 | 259 |
| `packages/commerce/src/catalog/repo.ts` | 0.0 | 0.0 | 0.0 | 254 |
| `packages/admin/src/screens/library/Library.tsx` | 14.92 | 25.0 | 7.14 | 251 |
| `packages/cms/src/publish/content/tool-registrations.ts` | 17.22 | 100.0 | 8.33 | 250 |
| `packages/admin/src/screens/media/MediaEditFields.tsx` | 1.65 | 100.0 | 0.0 | 239 |
| `packages/integrations/src/api-connections/host.ts` | 3.66 | 100.0 | 0.0 | 237 |
| `packages/agent-plugins/src/lifecycle/host-tools/skill-tool.ts` | 21.4 | 40.0 | 23.08 | 235 |
| `packages/integrations/src/api-connections/hosted-mcp/sign-in.ts` | 9.35 | 100.0 | 28.57 | 223 |
| `packages/cms/src/posts/publish-content.ts` | 0.0 | 0.0 | 0.0 | 222 |
| `packages/admin/src/screens/taxonomy/TaxonomyTermList.tsx` | 0.0 | 100.0 | 100.0 | 214 |
| `packages/admin/src/screens/settings/ExternalMcpToolPicker.tsx` | 0.0 | 0.0 | 0.0 | 213 |
| `packages/admin/src/screens/library/hooks/use-library.hooks.ts` | 0.0 | 0.0 | 0.0 | 212 |
| `packages/admin/src/screens/taxonomy/hooks/use-term-picker.hooks.ts` | 0.0 | 0.0 | 0.0 | 209 |
| `packages/devops/src/deploy/site/publish-tool-execution.ts` | 10.34 | 66.67 | 13.33 | 208 |
| `packages/admin/src/screens/observability/Observability.tsx` | 0.0 | 100.0 | 100.0 | 206 |
| `packages/admin/src/screens/plugins/AgentPluginRow.tsx` | 4.63 | 100.0 | 0.0 | 206 |
| `packages/db/src/data-modules/data-module.ts` | 52.82 | 66.67 | 64.29 | 201 |
| `packages/admin/src/screens/taxonomy/Taxonomy.tsx` | 0.0 | 100.0 | 100.0 | 199 |
| `packages/devops/src/deploy/react/StaticPublishForm.tsx` | 2.55 | 100.0 | 0.0 | 191 |
| `packages/admin/src/screens/plugins/PackageFilesModal.tsx` | 10.1 | 100.0 | 0.0 | 187 |
| `packages/devops/src/dns/site/dns-changes.ts` | 0.0 | 100.0 | 100.0 | 184 |
| `packages/mcp/src/external/tool-registrations.ts` | 17.43 | 100.0 | 13.33 | 180 |
| `packages/cms/src/posts/tool-registrations.ts` | 0.0 | 0.0 | 0.0 | 179 |
| `packages/devops/src/dns/site/dns-tools.ts` | 0.0 | 100.0 | 100.0 | 178 |
| `packages/commerce/src/payments/ledger/row-decoders.ts` | 0.0 | 100.0 | 100.0 | 177 |
| `packages/cms/src/react/widgets/WidgetPickerDialog/WidgetPickerDialog.tsx` | 0.0 | 100.0 | 100.0 | 175 |
| `packages/db/src/recovery/journal-repo.sql.ts` | 25.0 | 83.33 | 30.0 | 174 |
| `packages/agent-plugins/meilisearch/providers/meilisearch.mjs` | 73.73 | 50.0 | 43.33 | 171 |
| `packages/agent-plugins/src/site/memory-i18n.ts` | 0.0 | 0.0 | 0.0 | 171 |

### Files at 0% lines (jini): 380

`packages/admin/src/pages/ThemePageDetailsModal.hooks.tsx`, `packages/admin/src/pages/api/pages-api.ts`, `packages/admin/src/posts/editor/PostDeleteConfirmDialog.tsx`, `packages/admin/src/recovery/api/recovery-api.ts`, `packages/admin/src/recovery/hooks/use-recovery.hooks.ts`, `packages/admin/src/recovery/hooks/use-restore-flow.hooks.ts`, `packages/admin/src/recovery/rules.ts`, `packages/admin/src/screens/analytics/api/analytics-api.ts`, `packages/admin/src/screens/auth/OwnerRecoverySignIn.hooks.ts`, `packages/admin/src/screens/auth/OwnerRecoverySignIn.tsx`, `packages/admin/src/screens/auth/api/auth-api.ts`, `packages/admin/src/screens/auth/hooks/use-login.hooks.ts`, `packages/admin/src/screens/collections/hooks/use-collection-entry-editor.hooks.ts`, `packages/admin/src/screens/collections/hooks/use-edit-fields-dialog.hooks.ts`, `packages/admin/src/screens/comments/index.ts`, `packages/admin/src/screens/database/api/database-api.ts`, `packages/admin/src/screens/database/hooks/use-migrate-forward-section.hooks.ts`, `packages/admin/src/screens/database/hooks/use-schema-state-section.hooks.ts`, `packages/admin/src/screens/email/EmailOverviewTab.tsx`, `packages/admin/src/screens/email/EmailProviderTab.hooks.ts`, `packages/admin/src/screens/email/EmailSegments.tsx`, `packages/admin/src/screens/email/EmailTemplateEditor.hooks.ts`, `packages/admin/src/screens/email/EmailTemplatesTab.tsx`, `packages/admin/src/screens/email/api/mail-status-api.ts`, `packages/admin/src/screens/email/email-api.ts`, `packages/admin/src/screens/email/hooks/use-email-overview.hooks.ts`, `packages/admin/src/screens/email/hooks/use-email-sender.hooks.ts`, `packages/admin/src/screens/email/hooks/use-email-template-editor.hooks.ts`, `packages/admin/src/screens/email/hooks/use-email-template-view.hooks.ts`, `packages/admin/src/screens/email/hooks/use-email-templates.hooks.ts`, `packages/admin/src/screens/email/hooks/use-email.hooks.ts`, `packages/admin/src/screens/forms/index.ts`, `packages/admin/src/screens/import-export/api/import-export-api.ts`, `packages/admin/src/screens/integrations/i18n/integrations-dict-es-to-ko.ts`, `packages/admin/src/screens/integrations/i18n/integrations-dict-pl-to-bn.ts`, `packages/admin/src/screens/integrations/integrations-i18n.tsx`, `packages/admin/src/screens/library/hooks/library-api-port.hooks.ts`, `packages/admin/src/screens/library/hooks/use-library.hooks.ts`, `packages/admin/src/screens/media/hooks/use-media-item-link.hooks.ts`, `packages/admin/src/screens/media/pinned-media-providers.ts`, `packages/admin/src/screens/menus/Menus.tsx`, `packages/admin/src/screens/menus/hooks/use-menus.hooks.ts`, `packages/admin/src/screens/observability/Observability.tsx`, `packages/admin/src/screens/observability/api/observability-api.ts`, `packages/admin/src/screens/observability/hooks/observability-status-dependencies.hooks.ts`, `packages/admin/src/screens/observability/hooks/use-observability-status.hooks.ts`, `packages/admin/src/screens/observability/hooks/use-queries-tab.hooks.ts`, `packages/admin/src/screens/observability/hooks/use-recent-server-errors.hooks.ts`, `packages/admin/src/screens/observability/queries-panel.tsx`, `packages/admin/src/screens/observability/recent-errors-panel.tsx`, `packages/admin/src/screens/observability/tool-gaps-panel.tsx`, `packages/admin/src/screens/plugins/AgentPluginMemoryPanel.tsx`, `packages/admin/src/screens/plugins/AgentPluginSurfaceFrame.tsx`, `packages/admin/src/screens/plugins/AgentPlugins.hooks.ts`, `packages/admin/src/screens/plugins/PluginProviderSettingField.hooks.ts`, `packages/admin/src/screens/plugins/PluginProviderSettingField.tsx`, `packages/admin/src/screens/plugins/composer-skills.hooks.ts`, `packages/admin/src/screens/plugins/hooks/use-admin-surface-frame.hooks.ts`, `packages/admin/src/screens/plugins/hooks/use-agent-plugin-details-modal.hooks.ts`, `packages/admin/src/screens/plugins/hooks/use-agent-plugin-memory.hooks.ts`, `packages/admin/src/screens/plugins/hooks/use-agent-plugin-tab.hooks.ts`, `packages/admin/src/screens/plugins/hooks/use-plugin-install.hooks.ts`, `packages/admin/src/screens/plugins/hooks/use-plugin-package-files.hooks.ts`, `packages/admin/src/screens/plugins/hooks/use-plugins.hooks.ts`, `packages/admin/src/screens/plugins/plugins-memory-i18n.ts`, `packages/admin/src/screens/providers/Providers.hooks.ts`, `packages/admin/src/screens/providers/always-allow-rules.ts`, `packages/admin/src/screens/providers/hooks/use-always-allow.hooks.ts`, `packages/admin/src/screens/providers/providers-i18n.ts`, `packages/admin/src/screens/routines/RoutineForm.tsx`, `packages/admin/src/screens/routines/Routines.tsx`, `packages/admin/src/screens/routines/RoutinesMount.tsx`, `packages/admin/src/screens/settings/ExternalMcpToolPicker.tsx`, `packages/admin/src/screens/settings/ExternalMcpToolsModal.tsx`, `packages/admin/src/screens/skills/Skills.hooks.ts`, `packages/admin/src/screens/skills/Skills.tsx`, `packages/admin/src/screens/skills/use-skills-tabs.hooks.ts`, `packages/admin/src/screens/storage/api/screenshot-cleanup-api.ts`, `packages/admin/src/screens/storage/api/storage-api.ts`, `packages/admin/src/screens/storage/storage-screen-bindings.tsx`, `packages/admin/src/screens/taxonomy/Taxonomy.tsx`, `packages/admin/src/screens/taxonomy/TaxonomyTermList.tsx`, `packages/admin/src/screens/taxonomy/TermDetailPanel.tsx`, `packages/admin/src/screens/taxonomy/hooks/use-merge-term-section.hooks.ts`, `packages/admin/src/screens/taxonomy/hooks/use-new-taxonomy-form.hooks.ts`, `packages/admin/src/screens/taxonomy/hooks/use-new-term-form.hooks.ts`, `packages/admin/src/screens/taxonomy/hooks/use-term-detail-panel.hooks.ts`, `packages/admin/src/screens/taxonomy/hooks/use-term-picker.hooks.ts`, `packages/admin/src/screens/trash/api/trash-api.ts`, `packages/admin/src/screens/trash/hooks/use-trash.hooks.ts`, `packages/admin/src/screens/voice-input/voice-input-config.ts`, `packages/admin/src/screens/widgets/index.ts`, `packages/admin/src/shell/components/AssistantDock/AgentFailureCard.tsx`, `packages/admin/src/shell/components/AssistantDock/hooks/assistant-mcp-ui.ts`, `packages/admin/src/shell/components/AssistantDock/hooks/selected-agent-plugins.hooks.ts`, `packages/admin/src/shell/components/AssistantDock/hooks/use-assistant-runtime-preferences.hooks.ts`, `packages/admin/src/shell/components/AssistantDock/hooks/use-chat-agent-plugins.hooks.ts`, `packages/admin/src/shell/components/AssistantDock/hooks/use-routed-a2ui-surface-card.hooks.ts`, `packages/admin/src/shell/components/AssistantDock/hooks/use-selected-agent-auth-warning.hooks.ts`, `packages/admin/src/shell/components/MediaEditDialog/MediaEditDialog.hooks.tsx`, `packages/admin/src/shell/components/SitesSidebarNav.tsx`, `packages/admin/src/shell/components/WidgetConfigFields/HtmlAttributeRows.hooks.ts`, `packages/admin/src/shell/hooks/use-admin-appearance-snapshot.hooks.ts`, `packages/admin/src/shell/hooks/use-admin-document-locale.hooks.ts`, `packages/admin/src/shell/hooks/use-agent-screen-context.hooks.ts`, `packages/admin/src/shell/hooks/use-sites-sidebar-nav.hooks.ts`, `packages/admin/src/shell/lib/admin-http/config.ts`, `packages/admin/src/shell/lib/admin-http/urls.ts`, `packages/admin/src/shell/lib/assistant-prompt-bus.ts`, `packages/admin/src/shell/lib/credential-card-guidance.ts`, `packages/admin/src/shell/lib/fetch-query/adapter-context.ts`, `packages/admin/src/shell/lib/live-tiptap-editor.ts`, `packages/admin/src/shell/lib/media-embed-extension.hooks.ts`, `packages/admin/src/shell/lib/media-image-extension.hooks.ts`, `packages/admin/src/shell/lib/server-failure.ts`, `packages/agent-plugins/src/admin-surfaces/connections/index.ts`, `packages/agent-plugins/src/connect/connect-destination.ts`, `packages/agent-plugins/src/connect/connect-sign-in-wait.ts`, `packages/agent-plugins/src/connect/connection-status.ts`, `packages/agent-plugins/src/connect/executable/approval.ts`, `packages/agent-plugins/src/connect/executable/host-capabilities.ts`, `packages/agent-plugins/src/connect/executable/index.ts`, `packages/agent-plugins/src/connect/executable/register.ts`, `packages/agent-plugins/src/connect/index.ts`, `packages/agent-plugins/src/connect/new-site-agent-plugin-tokens.ts`, `packages/agent-plugins/src/connect/switch-on-saved-token.ts`, `packages/agent-plugins/src/connect/token-sign-in.ts`, `packages/agent-plugins/src/core/token-sign-in-list.ts`, `packages/agent-plugins/src/site/activation-effects.ts`, `packages/agent-plugins/src/site/customize-tool.ts`, `packages/agent-plugins/src/site/exports/diagnostics.ts`, `packages/agent-plugins/src/site/exports/runtime.ts`, `packages/agent-plugins/src/site/memory-i18n.ts`, `packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/remotion.config.ts`, `packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/Root.tsx`, `packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/chatSpec.ts`, `packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/ChatMotionOverlay.tsx`, `packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/DeviceFrame.tsx`, `packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/index.ts`, `packages/agentic/src/react/skills/use-skill-files.hooks.ts`, `packages/analytics/src/site/config.settings.ts`, `packages/analytics/src/site/tool-registrations.ts`, `packages/chat/src/react/features/bridged-chat/index.ts`, `packages/chat/src/react/features/conversation-chat-pane/index.ts`, `packages/chat/src/react/features/conversations/index.ts`, `packages/cms/src/admin-http/http/posts.ts`, `packages/cms/src/admin-http/limits.ts`, `packages/cms/src/admin-http/routes/agent-plugins/admin-surfaces.ts`, `packages/cms/src/admin-http/routes/settings/preview-feed-access.ts`, `packages/cms/src/admin-http/routes/system/credential-copy.ts`, `packages/cms/src/admin-http/routes/system/site-backups.ts`, `packages/cms/src/comments/site/data-module-install.ts`, `packages/cms/src/comments/site/provider-selection.ts`, `packages/cms/src/forms/site/form-file-storage.ts`, `packages/cms/src/forms/site/rate-limit-profile.ts`, `packages/cms/src/media/site-generation/media-provider-registry.ts`, `packages/cms/src/media/site/content-type-resolution.ts`, `packages/cms/src/media/site/derived-media-link.ts`, `packages/cms/src/media/site/list-pending-chat-attachments.ts`, `packages/cms/src/media/site/purge-media.ts`, `packages/cms/src/media/site/where-used.ts`, `packages/cms/src/posts/featured-image.ts`, `packages/cms/src/posts/go-live-sweep.ts`, `packages/cms/src/posts/post-before-save.ts`, `packages/cms/src/posts/post-import.ts`, `packages/cms/src/posts/post-tool-delete.ts`, `packages/cms/src/posts/post-tool-errors.ts`, `packages/cms/src/posts/post-tool-input.ts`, `packages/cms/src/posts/post-tool-list.ts`, `packages/cms/src/posts/post-tool-update.ts`, `packages/cms/src/posts/post-tool-views.ts`, `packages/cms/src/posts/publish-content.retire.ts`, `packages/cms/src/posts/publish-content.ts`, `packages/cms/src/posts/reverters.ts`, `packages/cms/src/posts/sql/index.ts`, `packages/cms/src/posts/sql/kernel-statements.ts`, `packages/cms/src/posts/tiptap-text-schema.ts`, `packages/cms/src/posts/tool-registrations.handlers.ts`, `packages/cms/src/posts/tool-registrations.ts`, `packages/cms/src/posts/tool-registrations.update.ts`, `packages/cms/src/public-http/routes/site/pages/listing/listing-state.ts`, `packages/cms/src/public-http/routes/site/pages/render-context/taxonomy.ts`, `packages/cms/src/publish/content/ui/PublishContentReportRow.tsx`, `packages/cms/src/publish/trust/provisioning.node-io.ts`, `packages/cms/src/react/media/ExternalProvidersPanel.tsx`, `packages/cms/src/react/media/MediaLoadMore.tsx`, `packages/cms/src/react/media/chrome-playback-note.tsx`, `packages/cms/src/react/media/hooks/use-media-writes.hooks.ts`, `packages/cms/src/react/media/index.ts`, `packages/cms/src/react/media/media-icons.tsx`, `packages/cms/src/react/media/use-media-provider-catalog.hooks.ts`, `packages/cms/src/react/posts/editor/header/PostEditorActions.tsx`, `packages/cms/src/react/posts/editor/view-bar/PostEditorViewBar.tsx`, `packages/cms/src/react/posts/hooks/post-editor-messages.ts`, `packages/cms/src/react/posts/posts-list-rules.ts`, `packages/cms/src/react/publish-content/hooks/publish-content-confirm.rules.ts`, `packages/cms/src/react/widgets/WidgetPickerDialog/WidgetPickerDialog.tsx`, `packages/cms/src/settings/site/mail-provider.ts`, `packages/cms/src/settings/site/visitor-tools-registrations.ts`, `packages/cms/src/settings/site/visitor-tools-service.ts`, `packages/cms/src/settings/site/visitor-tools-write.ts`, `packages/cms/src/trash/site/adapters/plugin.ts`, `packages/cms/src/trash/site/adapters/theme.ts`, `packages/cms/src/trash/site/scheduler.node.ts`, `packages/cms/src/workspace/sql/index.ts`, `packages/commerce/src/browser/checkout.ts`, `packages/commerce/src/catalog/repo.order-payments.ts`, `packages/commerce/src/catalog/repo.price-refs.ts`, `packages/commerce/src/catalog/repo.storefront.ts`, `packages/commerce/src/catalog/repo.ts`, `packages/commerce/src/http/index.ts`, `packages/commerce/src/http/payments-webhook.ts`, `packages/commerce/src/http/purchase.ts`, `packages/commerce/src/index.ts`, `packages/commerce/src/payments/accounting/apply-evidence.ts`, `packages/commerce/src/payments/accounting/plan-evidence.ts`, `packages/commerce/src/payments/client.ts`, `packages/commerce/src/payments/contract/alerts.ts`, `packages/commerce/src/payments/contract/checkout-client.ts`, `packages/commerce/src/payments/contract/provider.ts`, `packages/commerce/src/payments/contract/risk.ts`, `packages/commerce/src/payments/contract/tokens.ts`, `packages/commerce/src/payments/ingest/outbox-relay.ts`, `packages/commerce/src/payments/ingest/receive.ts`, `packages/commerce/src/payments/ingest/settlement-worker.ts`, `packages/commerce/src/payments/ingest/worker.ts`, `packages/commerce/src/payments/kernel.ts`, `packages/commerce/src/payments/ledger/migrations/0001_payments_ledger.ts`, `packages/commerce/src/payments/ledger/migrations/0002_payments_operator_actions.ts`, `packages/commerce/src/payments/ledger/migrations/0004_payments_attempt_recovery.ts`, `packages/commerce/src/payments/ledger/migrations/0005_payments_intent_replay.ts`, `packages/commerce/src/payments/ledger/migrations/checksums.ts`, `packages/commerce/src/payments/ledger/migrations/index.ts`, `packages/commerce/src/payments/ledger/repo.memory.ts`, `packages/commerce/src/payments/ledger/repo.sql.ts`, `packages/commerce/src/payments/ledger/repo.ts`, `packages/commerce/src/payments/ledger/row-decoders.ts`, `packages/commerce/src/payments/ledger/row-patches.ts`, `packages/commerce/src/payments/ledger/row-records.ts`, `packages/commerce/src/payments/ledger/rows.ts`, `packages/commerce/src/payments/ledger/sql.ts`, `packages/commerce/src/payments/ops/capture-void.ts`, `packages/commerce/src/payments/ops/common.ts`, `packages/commerce/src/payments/ops/deps.ts`, `packages/commerce/src/payments/ops/grants.ts`, `packages/commerce/src/payments/ops/intent-recovery.ts`, `packages/commerce/src/payments/ops/intent.ts`, `packages/commerce/src/payments/ops/operator.ts`, `packages/commerce/src/payments/ops/reconcile-attempts.ts`, `packages/commerce/src/payments/ops/reconcile-snapshot.ts`, `packages/commerce/src/payments/ops/reconciler.ts`, `packages/commerce/src/payments/ops/refund.ts`, `packages/commerce/src/payments/ops/service.ts`, `packages/commerce/src/payments/ops/view.ts`, `packages/commerce/src/payments/provider-contexts.ts`, `packages/commerce/src/payments/provider-contract.ts`, `packages/commerce/src/payments/provider-module-guard.ts`, `packages/commerce/src/payments/provider-registry.ts`, `packages/commerce/src/payments/providers/lipay-gateway.ts`, `packages/commerce/src/payments/state/status.ts`, `packages/commerce/src/payments/testkit/index.ts`, `packages/commerce/src/payments/testkit/lipay-fake.ts`, `packages/commerce/src/payments/testkit/provider-conformance.ts`, `packages/commerce/src/payments/tools/catalog.ts`, `packages/commerce/src/payments/tools/deps.ts`, `packages/commerce/src/payments/tools/index.ts`, `packages/commerce/src/payments/tools/input.ts`, `packages/commerce/src/payments/tools/money-tools.ts`, `packages/commerce/src/payments/tools/read-tools.ts`, `packages/commerce/src/payments/tools/resolve-unknown.ts`, `packages/cookie-consent/src/client.min.ts`, `packages/cookie-consent/src/client/entry.ts`, `packages/cookie-consent/src/extensions.min.ts`, `packages/cookie-consent/src/site/ensure-privacy-defaults.ts`, `packages/cookie-consent/src/site/privacy-page-template.ts`, `packages/cookie-consent/src/site/region-plugins.ts`, `packages/core/src/contracts/agents/index.ts`, `packages/core/src/contracts/agents/model-catalog.ts`, `packages/core/src/contracts/blob.ts`, `packages/core/src/contracts/capabilities.ts`, `packages/core/src/contracts/events.ts`, `packages/core/src/contracts/events/ports.ts`, `packages/core/src/contracts/forms.ts`, `packages/core/src/contracts/mail.ts`, `packages/core/src/contracts/mail/email-sender.ts`, `packages/core/src/contracts/runtime.ts`, `packages/core/src/contracts/runtime/environment.ts`, `packages/core/src/contracts/site/cms-media.ts`, `packages/core/src/contracts/site/media-provider-contribution.ts`, `packages/core/src/contracts/site/media-upload-limits.ts`, `packages/core/src/contracts/site/post-author.ts`, `packages/core/src/contracts/site/request-facts.ts`, `packages/core/src/native-approval-memory.ts`, `packages/core/src/net/public-dns-vocabulary.ts`, `packages/core/src/operator-locale.ts`, `packages/db/src/data-modules/index.ts`, `packages/db/src/data-modules/migration-recovery.ts`, `packages/db/src/data-modules/restore.ts`, `packages/db/src/events/index.ts`, `packages/db/src/gated-mutations/index.ts`, `packages/db/src/settings/index.ts`, `packages/db/src/verified-origin/index.ts`, `packages/desktop-host/src/app-version/index.ts`, `packages/desktop-host/src/electron/selftest/index.ts`, `packages/devops/src/deploy/site/agent-tools.ts`, `packages/devops/src/deploy/site/dockerfile.ts`, `packages/devops/src/deploy/site/publish-credentials/store-owner.ts`, `packages/devops/src/deploy/site/publish-credentials/store-resolution.ts`, `packages/devops/src/deploy/site/static-publish/domain-publish-rows.ts`, `packages/devops/src/dns/site/binding.repo.ts`, `packages/devops/src/dns/site/dns-changes.ts`, `packages/devops/src/dns/site/dns-tools.ts`, `packages/devops/src/dns/site/mail-dns-status.ts`, `packages/devops/src/dns/site/mail-dns-tools.ts`, `packages/devops/src/dns/site/mail-requirements.ts`, `packages/devops/src/dns/site/tools.ts`, `packages/devops/src/source-control/site/commit-target.ts`, `packages/devops/src/source-control/site/saved-key-bindings.ts`, `packages/diagnostics/src/web-evidence/agent-tools.ts`, `packages/integrations/src/api-connections/hosted-mcp/index.ts`, `packages/integrations/src/custom-credentials/agent-tools.ts`, `packages/integrations/src/custom-credentials/credential-ports.ts`, `packages/integrations/src/react/credentials/OtherCredentialsSection.hooks.tsx`, `packages/integrations/src/react/credentials/OtherCredentialsSection.tsx`, `packages/integrations/src/react/credentials/other-credential-stores.ts`, `packages/integrations/src/react/site-key/hooks/use-site-key.hooks.ts`, `packages/integrations/src/react/webhooks/IntegrationDeliveries.tsx`, `packages/integrations/src/react/webhooks/hooks/use-integrations.hooks.ts`, `packages/integrations/src/secrets/index.ts`, `packages/integrations/src/webhooks/site/signing.keyring.ts`, `packages/integrations/src/webhooks/sql/index.ts`, `packages/integrations/src/webhooks/tools/index.ts`, `packages/platform/src/mail/sql/activity.repo.ts`, `packages/platform/src/mail/sql/attempts.repo.ts`, `packages/platform/src/mail/sql/capture.repo.ts`, `packages/platform/src/mail/sql/index.ts`, `packages/platform/src/mail/sql/ledger.repo.ts`, `packages/platform/src/mail/sql/suppression-admin.repo.ts`, `packages/platform/src/retention/index.ts`, `packages/plugins/src/host/tools/contract.ts`, `packages/plugins/src/host/tools/index.ts`, `packages/plugins/src/host/tools/install.ts`, `packages/plugins/src/host/tools/management.ts`, `packages/plugins/src/host/tools/source.ts`, `packages/plugins/src/react/PluginProviderSettingsDialog.tsx`, `packages/plugins/src/runtime/plugin-tool-ids.ts`, `packages/provider-plugins/src/charts-echarts/index.ts`, `packages/provider-plugins/src/charts-recharts/index.ts`, `packages/provider-plugins/src/formspree/index.ts`, `packages/provider-plugins/src/google-forms/index.ts`, `packages/ui/src/features/app-shell/index.ts`, `packages/ui/src/features/find-bar/index.ts`, `packages/ui/src/features/find/find-focus-clock.ts`, `packages/ui/src/features/find/index.ts`, `packages/ui/src/features/find/use-find-bar-effects.hooks.ts`, `packages/ui/src/features/find/use-find-bar-state.hooks.ts`, `packages/ui/src/features/find/use-find-focus-reclaim.hooks.ts`, `packages/ui/src/features/find/use-find-input-binding.hooks.ts`, `packages/ui/src/features/live-views/index.ts`, `packages/ui/src/features/live-views/use-live-views.ts`, `packages/ui/src/features/number-stepper/index.ts`, `packages/ui/src/features/resource-monitor/index.ts`, `packages/ui/src/features/site-card/index.ts`, `packages/ui/src/react/components/CustomSelectMarkup.tsx`, `packages/user-management/src/identity/role-manage-permission.ts`, `packages/user-management/src/identity/user-manage-permission.ts`, `packages/user-management/src/mail/status/agent-tools.ts`, `packages/user-management/src/mail/status/delivery-agent-tools.ts`, `packages/user-management/src/mail/status/provider-agent-tools.ts`, `packages/user-management/src/members/capability-card.ts`, `packages/user-management/src/members/consent-service.ts`, `packages/user-management/src/members/password-auth.ts`, `packages/user-management/src/members/ports.ts`, `packages/user-management/src/members/trash-member.ts`, `packages/user-management/src/newsletter/tool-registrations.ts`, `packages/user-management/src/react/members/api/members-api.ts`, `packages/user-management/src/react/roles/api/roles-api.ts`, `packages/user-management/src/react/users/UsersDialogs.tsx`, `packages/user-management/src/react/users/api/users-api.ts`, `packages/user-management/src/server/sql/index.ts`

### Tests exist but file < 50% lines (jini): 158

| file | lines% | tests |
|---|---|---|
| `packages/admin/src/recovery/rules.ts` | 0.0 | `rules.test.ts`, `rules.unit.test.ts`, `rules.unit.test.ts` |
| `packages/admin/src/screens/email/EmailTemplateEditor.hooks.ts` | 0.0 | `EmailTemplateEditor.unit.test.tsx` |
| `packages/admin/src/screens/routines/Routines.tsx` | 0.0 | `Routines.test.tsx` |
| `packages/admin/src/screens/settings/ExternalMcpToolPicker.tsx` | 0.0 | `ExternalMcpToolPicker.hooks.unit.test.tsx` |
| `packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/index.ts` | 0.0 | `index.test.ts`, `index.test.ts`, `index.test.ts` |
| `packages/chat/src/react/features/bridged-chat/index.ts` | 0.0 | `index.test.ts`, `index.test.ts`, `index.test.ts` |
| `packages/chat/src/react/features/conversation-chat-pane/index.ts` | 0.0 | `index.test.ts`, `index.test.ts`, `index.test.ts` |
| `packages/chat/src/react/features/conversations/index.ts` | 0.0 | `index.test.ts`, `index.test.ts`, `index.test.ts` |
| `packages/cms/src/media/site/where-used.ts` | 0.0 | `where-used.test.ts`, `where-used.ts`, `where-used.unit.test.ts` |
| `packages/cms/src/posts/publish-content.retire.ts` | 0.0 | `publish-content.test.ts`, `publish-content.test.ts`, `publish-content.test.ts` |
| `packages/cms/src/posts/publish-content.ts` | 0.0 | `publish-content.test.ts`, `publish-content.test.ts`, `publish-content.test.ts` |
| `packages/cms/src/posts/reverters.ts` | 0.0 | `reverters.test.ts` |
| `packages/cms/src/posts/sql/index.ts` | 0.0 | `index.unit.test.ts` |
| `packages/cms/src/posts/tool-registrations.handlers.ts` | 0.0 | `tool-registrations.test.ts`, `tool-registrations.test.ts`, `tool-registrations.test.ts` |
| `packages/cms/src/posts/tool-registrations.ts` | 0.0 | `tool-registrations.test.ts`, `tool-registrations.test.ts`, `tool-registrations.test.ts` |
| `packages/cms/src/posts/tool-registrations.update.ts` | 0.0 | `tool-registrations.test.ts`, `tool-registrations.test.ts`, `tool-registrations.test.ts` |
| `packages/cms/src/public-http/routes/site/pages/render-context/taxonomy.ts` | 0.0 | `taxonomy.test.ts` |
| `packages/cms/src/publish/trust/provisioning.node-io.ts` | 0.0 | `provisioning.file-port.characterization.test.ts`, `provisioning.test.ts` |
| `packages/cms/src/react/media/index.ts` | 0.0 | `index.unit.test.ts` |
| `packages/cms/src/react/widgets/WidgetPickerDialog/WidgetPickerDialog.tsx` | 0.0 | `WidgetPickerDialog.hooks.unit.test.tsx` |
| `packages/cms/src/workspace/sql/index.ts` | 0.0 | `index.unit.test.ts` |
| `packages/commerce/src/browser/checkout.ts` | 0.0 | `checkout.vitest.test.ts`, `checkout.unit.test.ts` |
| `packages/commerce/src/catalog/repo.order-payments.ts` | 0.0 | `repo.mark-paid.vitest.test.ts`, `repo.order-payments.vitest.test.ts`, `repo.price-refs.vitest.test.ts` |
| `packages/commerce/src/catalog/repo.price-refs.ts` | 0.0 | `repo.mark-paid.vitest.test.ts`, `repo.order-payments.vitest.test.ts`, `repo.price-refs.vitest.test.ts` |
| `packages/commerce/src/catalog/repo.storefront.ts` | 0.0 | `repo.mark-paid.vitest.test.ts`, `repo.order-payments.vitest.test.ts`, `repo.price-refs.vitest.test.ts` |
| `packages/commerce/src/catalog/repo.ts` | 0.0 | `repo.mark-paid.vitest.test.ts`, `repo.order-payments.vitest.test.ts`, `repo.price-refs.vitest.test.ts` |
| `packages/commerce/src/http/payments-webhook.ts` | 0.0 | `payments-webhook.vitest.test.ts` |
| `packages/commerce/src/http/purchase.ts` | 0.0 | `purchase.test.ts` |
| `packages/commerce/src/payments/accounting/apply-evidence.ts` | 0.0 | `apply-evidence.vitest.test.ts` |
| `packages/commerce/src/payments/accounting/plan-evidence.ts` | 0.0 | `plan-evidence.vitest.test.ts` |
| `packages/commerce/src/payments/contract/alerts.ts` | 0.0 | `alerts.vitest.test.ts` |
| `packages/commerce/src/payments/contract/checkout-client.ts` | 0.0 | `checkout-client.vitest.test.ts` |
| `packages/commerce/src/payments/contract/risk.ts` | 0.0 | `risk.vitest.test.ts` |
| `packages/commerce/src/payments/ingest/outbox-relay.ts` | 0.0 | `outbox-relay.vitest.test.ts` |
| `packages/commerce/src/payments/ingest/receive.ts` | 0.0 | `receive.vitest.test.ts` |
| `packages/commerce/src/payments/ingest/settlement-worker.ts` | 0.0 | `settlement-worker.unit.test.ts`, `settlement-worker.vitest.test.ts` |
| `packages/commerce/src/payments/ingest/worker.ts` | 0.0 | `worker.vitest.test.ts` |
| `packages/commerce/src/payments/ledger/repo.memory.ts` | 0.0 | `repo.mark-paid.vitest.test.ts`, `repo.order-payments.vitest.test.ts`, `repo.price-refs.vitest.test.ts` |
| `packages/commerce/src/payments/ledger/repo.sql.ts` | 0.0 | `repo.mark-paid.vitest.test.ts`, `repo.order-payments.vitest.test.ts`, `repo.price-refs.vitest.test.ts` |
| `packages/commerce/src/payments/ledger/repo.ts` | 0.0 | `repo.mark-paid.vitest.test.ts`, `repo.order-payments.vitest.test.ts`, `repo.price-refs.vitest.test.ts` |
| `packages/commerce/src/payments/ledger/rows.ts` | 0.0 | `rows.vitest.test.ts` |
| `packages/commerce/src/payments/ops/capture-void.ts` | 0.0 | `capture-void.vitest.test.ts` |
| `packages/commerce/src/payments/ops/grants.ts` | 0.0 | `grants.vitest.test.ts` |
| `packages/commerce/src/payments/ops/intent-recovery.ts` | 0.0 | `intent-recovery.vitest.test.ts` |
| `packages/commerce/src/payments/ops/intent.ts` | 0.0 | `intent.vitest.test.ts` |
| `packages/commerce/src/payments/ops/operator.ts` | 0.0 | `operator.vitest.test.ts` |
| `packages/commerce/src/payments/ops/reconciler.ts` | 0.0 | `reconciler.vitest.test.ts` |
| `packages/commerce/src/payments/ops/refund.ts` | 0.0 | `refund.vitest.test.ts` |
| `packages/commerce/src/payments/ops/service.ts` | 0.0 | `service.vitest.test.ts` |
| `packages/commerce/src/payments/provider-contexts.ts` | 0.0 | `provider-contexts.vitest.test.ts` |
| `packages/commerce/src/payments/provider-contract.ts` | 0.0 | `provider-contract.vitest.test.ts`, `provider-contract.context.test.ts` |
| `packages/commerce/src/payments/provider-module-guard.ts` | 0.0 | `provider-module-guard.vitest.test.ts` |
| `packages/commerce/src/payments/provider-registry.ts` | 0.0 | `provider-registry.vitest.test.ts` |
| `packages/commerce/src/payments/state/status.ts` | 0.0 | `status.unit.test.ts`, `status.vitest.test.ts` |
| `packages/commerce/src/payments/testkit/lipay-fake.ts` | 0.0 | `lipay-fake.vitest.test.ts` |
| `packages/commerce/src/payments/testkit/provider-conformance.ts` | 0.0 | `provider-conformance.vitest.test.ts` |
| `packages/commerce/src/payments/tools/money-tools.ts` | 0.0 | `money-tools.vitest.test.ts` |
| `packages/commerce/src/payments/tools/read-tools.ts` | 0.0 | `read-tools.vitest.test.ts` |
| `packages/commerce/src/payments/tools/resolve-unknown.ts` | 0.0 | `resolve-unknown.vitest.test.ts` |
| `packages/cookie-consent/src/client.min.ts` | 0.0 | `client.test.ts` |
| `packages/core/src/contracts/agents/index.ts` | 0.0 | `index.test.ts` |
| `packages/db/src/data-modules/index.ts` | 0.0 | `index.test.ts`, `index.test.ts` |
| `packages/db/src/events/index.ts` | 0.0 | `index.test.ts`, `index.test.ts` |
| `packages/db/src/gated-mutations/index.ts` | 0.0 | `index.test.ts`, `index.test.ts` |
| `packages/db/src/settings/index.ts` | 0.0 | `index.test.ts`, `index.test.ts` |
| `packages/db/src/verified-origin/index.ts` | 0.0 | `index.test.ts`, `index.test.ts` |
| `packages/desktop-host/src/app-version/index.ts` | 0.0 | `index.test.ts`, `index.test.ts`, `index.test.ts` |
| `packages/desktop-host/src/electron/selftest/index.ts` | 0.0 | `index.test.ts`, `index.test.ts`, `index.test.ts` |
| `packages/diagnostics/src/web-evidence/agent-tools.ts` | 0.0 | `agent-tools.test.ts` |
| `packages/integrations/src/api-connections/hosted-mcp/index.ts` | 0.0 | `index.test.ts` |
| `packages/integrations/src/react/webhooks/IntegrationDeliveries.tsx` | 0.0 | `IntegrationDeliveries.subscription-key.unit.test.tsx` |
| `packages/integrations/src/secrets/index.ts` | 0.0 | `index.test.ts` |
| `packages/integrations/src/webhooks/site/signing.keyring.ts` | 0.0 | `signing.edges.test.ts`, `signing.keyring.test.ts`, `signing.test.ts` |
| `packages/integrations/src/webhooks/sql/index.ts` | 0.0 | `index.test.ts` |
| `packages/integrations/src/webhooks/tools/index.ts` | 0.0 | `index.test.ts` |
| `packages/platform/src/mail/sql/index.ts` | 0.0 | `index.test.ts` |
| `packages/platform/src/retention/index.ts` | 0.0 | `index.test.ts` |
| `packages/plugins/src/host/tools/install.ts` | 0.0 | `install.unit.test.ts` |
| `packages/ui/src/features/app-shell/index.ts` | 0.0 | `index.test.ts`, `index.test.ts`, `index.test.ts` |
| `packages/ui/src/features/find-bar/index.ts` | 0.0 | `index.test.ts`, `index.test.ts`, `index.test.ts` |
| … 78 more in the TSV (lines% < 50 with a same-named test) | | |

### Suspected mock-illusion (jini): 3
A same-named test module-mocks the unit's own module path.

| file | lines% | test |
|---|---|---|
| `packages/server/src/adapters/node-pty.ts` | 100.0 | `packages/server/src/adapters/__tests__/node-pty.test.ts` |
| `packages/user-management/src/admin/react/hooks/RolesPage.hooks.ts` | 100.0 | `packages/user-management/src/admin/react/__tests__/RolesPage.pins.test.tsx` |
| `packages/user-management/src/admin/react/hooks/UsersPage.hooks.ts` | 100.0 | `packages/user-management/src/admin/react/__tests__/UsersPage.pins.test.tsx` |

### Missing from lcov (jini): 1

`packages/agent-plugins/scripts` 1

## Detail: tovu-website

- files in denominator: 1519; measured: 1449; missing from lcov: 70
- lines 93.25% (123805/132769), branches 89.71% (23175/25834), functions 79.44% (11270/14186)
- files at 100/100/100: 302 of 1449 measured; distance to target: 8964 uncovered lines, 2659 uncovered branches, 2916 uncovered functions (+ 70 unmeasured files)

### 40 biggest gaps by uncovered lines (tovu-website)

| file | lines% | br% | fn% | uncovered |
|---|---|---|---|---|
| `apps/website/src/features/theme/code-tier-asset-normalizer.ts` | 38.02 | 100.0 | 0.0 | 251 |
| `apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts` | 74.88 | 70.31 | 73.85 | 202 |
| `apps/website/src/cli/commands/storage-maintenance.ts` | 38.87 | 100.0 | 0.0 | 151 |
| `apps/website/src/server/runtime/composition/product-telemetry.ts` | 40.94 | 50.0 | 7.14 | 150 |
| `apps/website/src/platform/db/migration/manifest.ts` | 82.64 | 89.74 | 80.0 | 138 |
| `apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts` | 78.29 | 50.65 | 75.0 | 127 |
| `apps/website/src/server/runtime/composition/other-site-keys.ts` | 46.54 | 100.0 | 9.68 | 116 |
| `apps/website/src/features/routines/routine-tool-registrations.ts` | 53.72 | 100.0 | 16.0 | 112 |
| `apps/website/src/server/runtime/composition/permanent-delete-deps.ts` | 61.13 | 86.67 | 72.0 | 110 |
| `apps/website/src/platform/db/repos/media-grid-query.ts` | 37.36 | 100.0 | 0.0 | 109 |
| `apps/website/src/assistant/demo-a2ui-tool.ts` | 55.74 | 100.0 | 42.86 | 104 |
| `apps/website/src/features/pages/permissions.ts` | 32.03 | 100.0 | 100.0 | 104 |
| `apps/website/src/cli/commands/serve-listen.ts` | 49.0 | 80.0 | 46.15 | 102 |
| `apps/website/src/features/theme/migration/theme-migration-plan.ts` | 61.98 | 52.63 | 40.0 | 100 |
| `apps/website/src/assistant/frontend-control-capabilities.ts` | 53.2 | 100.0 | 100.0 | 95 |
| `apps/website/src/contracts/core/gated-mutations/gateway.ts` | 54.0 | 100.0 | 100.0 | 92 |
| `apps/website/src/server/runtime/composition/site-import-index-state.ts` | 60.87 | 72.0 | 44.12 | 81 |
| `apps/website/src/server/runtime/composition/site-key-recovery.ts` | 47.02 | 100.0 | 10.0 | 80 |
| `apps/website/src/features/theme/visitor-publication.ts` | 55.56 | 63.16 | 35.29 | 68 |
| `apps/website/src/server/runtime/composition/publish-content-seed-hash.ts` | 48.85 | 100.0 | 25.0 | 67 |
| `apps/website/src/features/theme/publish-content.ts` | 91.53 | 62.16 | 84.62 | 66 |
| `apps/website/src/cli/commands/storage-report.ts` | 46.28 | 100.0 | 0.0 | 65 |
| `apps/website/src/assistant/site/visitor-ag-ui-resume.ts` | 57.33 | 100.0 | 10.0 | 64 |
| `apps/website/src/features/media-import/fetch-image.ts` | 64.25 | 95.65 | 100.0 | 64 |
| `apps/website/src/server/runtime/composition/modules/assistant-chats.ts` | 85.87 | 68.83 | 59.65 | 63 |
| `apps/website/src/server/runtime/composition/provider-plugins.ts` | 87.27 | 70.83 | 61.9 | 62 |
| `apps/site-chat/src/site-assistant-transport.ts` | 89.44 | 83.09 | 83.93 | 58 |
| `apps/site-chat/src/remixicon-override.ts` | 13.64 | 100.0 | 100.0 | 57 |
| `apps/website/src/cli/commands/adopt.ts` | 70.47 | 36.36 | 33.33 | 57 |
| `apps/website/src/platform/site-dir/key-only-site-meta.ts` | 75.64 | 60.0 | 28.0 | 57 |
| `apps/website/src/assistant/read-only-tool-constraint.ts` | 66.46 | 100.0 | 100.0 | 54 |
| `apps/website/src/features/site-export/export-failure-summary.ts` | 3.7 | 100.0 | 100.0 | 52 |
| `apps/website/src/features/theme/theme.ts` | 78.06 | 93.88 | 83.33 | 52 |
| `apps/website/src/features/theme/trash-theme-tool.ts` | 71.11 | 100.0 | 50.0 | 52 |
| `apps/website/src/server/runtime/boot/bootstrap.ts` | 87.19 | 75.81 | 85.71 | 51 |
| `apps/website/src/assistant/site/tools.ts` | 80.0 | 67.65 | 100.0 | 50 |
| `apps/website/src/server/runtime/composition/modules/assistant-run-acceptance.ts` | 71.59 | 65.0 | 47.62 | 50 |
| `apps/website/src/server/inbound/assistant/federation-admissions-route.ts` | 34.67 | 100.0 | 100.0 | 49 |
| `apps/website/src/server/runtime/composition/commerce.ts` | 88.58 | 83.04 | 84.21 | 49 |
| `apps/website/src/platform/site-dir/duplicate-pglite-store.ts` | 43.53 | 50.0 | 0.0 | 48 |

### Files at 0% lines (tovu-website): 0

none

### Tests exist but file < 50% lines (tovu-website): 41

| file | lines% | tests |
|---|---|---|
| `apps/website/src/features/site-export/export-failure-summary.ts` | 3.7 | `export-failure-summary.test.ts` |
| `apps/website/src/server/runtime/composition/trash-retention.ts` | 11.11 | `trash-retention.composition.test.ts` |
| `apps/site-chat/src/remixicon-override.ts` | 13.64 | `remixicon-override.test.ts` |
| `apps/website/src/server/runtime/lifecycle/daemon-lifecycle-log.ts` | 18.75 | `daemon-lifecycle-log.test.ts` |
| `apps/website/src/cli/commands/stdin-input.ts` | 21.43 | `stdin-input.unit.test.ts` |
| `apps/website/src/assistant/rewrap-page-navigate-error.ts` | 27.27 | `rewrap-page-navigate-error.test.ts` |
| `apps/website/src/server/runtime/composition/publish-trust-revocations.ts` | 27.5 | `publish-trust-revocations.dialects.test.ts` |
| `apps/website/src/features/analytics/warn.ts` | 29.17 | `warn.test.ts` |
| `apps/website/src/features/pages/permissions.ts` | 32.03 | `permissions.md`, `permissions.boot.integration.test.ts`, `permissions.unit.test.ts` |
| `apps/website/src/server/inbound/assistant/plugin-prompt-prefix.ts` | 32.14 | `plugin-prompt-prefix.unit.test.ts` |
| `apps/website/src/assistant/run-active-context.ts` | 33.33 | `run-active-context.test.ts` |
| `apps/website/src/features/analytics/salt-context.ts` | 33.33 | `salt-context.test.ts` |
| `apps/website/src/features/site-export/index.ts` | 33.33 | `index.barrel.unit.test.ts`, `index.test.ts`, `index.html` |
| `apps/website/src/features/site-inspection/index.ts` | 33.33 | `index.barrel.unit.test.ts`, `index.test.ts`, `index.html` |
| `apps/website/src/features/vendor-credentials/index.ts` | 33.33 | `index.barrel.unit.test.ts`, `index.test.ts`, `index.html` |
| `apps/website/src/platform/http/index.ts` | 33.33 | `index.barrel.unit.test.ts`, `index.test.ts`, `index.html` |
| `apps/website/src/server/runtime/composition/browser-analytics-http.ts` | 33.33 | `browser-analytics-http.unit.test.ts` |
| `apps/website/src/server/inbound/assistant/federation-admissions-route.ts` | 34.67 | `federation-admissions-route.unit.test.ts` |
| `apps/website/src/features/pages/index.ts` | 34.78 | `index.barrel.unit.test.ts`, `index.test.ts`, `index.html` |
| `apps/website/src/features/theme/code-tier-asset-normalizer.ts` | 38.02 | `code-tier-asset-normalizer.test.ts` |
| `apps/website/src/cli/commands/storage-maintenance.ts` | 38.87 | `storage-maintenance.test.ts` |
| `apps/website/src/features/plugin-runtime/install-archive.ts` | 39.13 | `install-archive.integration.test.ts`, `install-archive.unit.test.ts` |
| `apps/website/src/features/publish-content/ui/index.ts` | 40.0 | `index.barrel.unit.test.ts`, `index.test.ts`, `index.html` |
| `apps/website/src/server/runtime/composition/reset-owner.ts` | 40.43 | `reset-owner.unit.test.ts` |
| `apps/website/src/server/runtime/composition/product-telemetry.ts` | 40.94 | `product-telemetry.unit.test.ts` |
| `apps/website/src/server/runtime/boot/site-boot-readiness.ts` | 41.3 | `site-boot-readiness.unit.test.ts` |
| `apps/website/src/server/inbound/assistant/index.ts` | 42.86 | `index.barrel.unit.test.ts`, `index.test.ts`, `index.html` |
| `apps/website/src/platform/site-dir/duplicate-pglite-store.ts` | 43.53 | `duplicate-pglite-store.integration.test.ts` |
| `apps/website/src/platform/headless-browser/playwright-loader.ts` | 43.59 | `playwright-loader.unit.test.ts` |
| `apps/website/src/server/error-mapping/respond.ts` | 43.75 | `respond.test.ts` |
| `apps/website/src/server/runtime/composition/admin-assistant-enabled.ts` | 43.75 | `admin-assistant-enabled.test.ts` |
| `apps/website/src/server/runtime/composition/plugin-credential-cards.ts` | 45.35 | `plugin-credential-cards.unit.test.ts`, `plugin-credential-cards.unit.test.ts` |
| `apps/website/src/cli/commands/storage-report.ts` | 46.28 | `storage-report.test.ts` |
| `apps/website/src/server/runtime/composition/other-site-keys.ts` | 46.54 | `other-site-keys.integration.test.ts` |
| `apps/website/src/features/deployments/index.ts` | 46.88 | `index.barrel.unit.test.ts`, `index.test.ts`, `index.html` |
| `apps/website/src/server/runtime/composition/site-key-recovery.ts` | 47.02 | `site-key-recovery.unit.test.ts` |
| `apps/website/src/server/runtime/lifecycle/warm-site-retirement.ts` | 47.06 | `warm-site-retirement.unit.test.ts` |
| `apps/site-chat/src/SiteAssistantHeader.tsx` | 47.37 | `SiteAssistantHeader.test.ts` |
| `apps/website/src/server/runtime/boot/site-daemon-listener.ts` | 47.62 | `site-daemon-listener.integration.test.ts` |
| `apps/website/src/server/runtime/composition/publish-content-seed-hash.ts` | 48.85 | `publish-content-seed-hash.load-deps.unit.test.ts`, `publish-content-seed-hash.test.ts` |
| `apps/site-chat/src/SiteAssistantWidget.tsx` | 48.91 | `SiteAssistantWidget.confirmation.test.ts`, `SiteAssistantWidget.test.ts` |

### Suspected mock-illusion (tovu-website): 3
A same-named test module-mocks the unit's own module path.

| file | lines% | test |
|---|---|---|
| `apps/website/src/features/agent-plugins/memory.ts` | 100.0 | `apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/memory.errors.unit.test.ts` |
| `apps/website/src/server/runtime/composition/commerce.ts` | 88.58 | `apps/website/src/server/runtime/composition/__tests__/commerce.errors.unit.test.ts` |
| `apps/website/src/server/runtime/composition/modules/commerce.ts` | 100.0 | `apps/website/src/server/runtime/composition/__tests__/commerce.errors.unit.test.ts` |

### Missing from lcov (tovu-website): 70

`apps/website/src` 46, `packages/contracts/src` 21, `packages/sdk/src` 3

## Detail: tovu-admin

- files in denominator: 504; measured: 504; missing from lcov: 0
- lines 97.72% (6385/6534), branches 96.01% (5129/5342), functions 95.05% (3071/3231)
- files at 100/100/100: 385 of 504 measured; distance to target: 149 uncovered lines, 213 uncovered branches, 160 uncovered functions (+ 0 unmeasured files)

### 40 biggest gaps by uncovered lines (tovu-admin)

| file | lines% | br% | fn% | uncovered |
|---|---|---|---|---|
| `apps/admin/src/features/sites/SitesHomeSetting.tsx` | 18.52 | 17.24 | 14.29 | 22 |
| `apps/admin/src/features/routines/index.ts` | 0.0 | 0.0 | 0.0 | 7 |
| `apps/admin/src/hooks/assistant-chats-dependencies.hooks.ts` | 90.62 | 92.86 | 78.12 | 6 |
| `apps/admin/src/lib/agent-navigation-entities.ts` | 66.67 | 64.29 | 57.14 | 6 |
| `apps/admin/src/lib/assistant-chats.ts` | 77.27 | 78.95 | 71.43 | 5 |
| `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts` | 98.34 | 95.0 | 98.28 | 4 |
| `apps/admin/src/features/sites/hooks/use-sites.hooks.ts` | 95.12 | 100.0 | 88.89 | 4 |
| `apps/admin/src/features/ai-assistant/hooks/visitor-tools-dependencies.hooks.ts` | 50.0 | 0.0 | 0.0 | 3 |
| `apps/admin/src/features/library/hooks/library-dependencies.hooks.ts` | 70.0 | 100.0 | 66.67 | 3 |
| `apps/admin/src/features/plugins/Plugins.tsx` | 25.0 | 100.0 | 0.0 | 3 |
| `apps/admin/src/features/plugins/hooks/agent-plugins-dependencies.hooks.ts` | 83.33 | 86.67 | 66.67 | 3 |
| `apps/admin/src/features/plugins/hooks/plugins-dependencies.hooks.ts` | 95.95 | 86.59 | 90.62 | 3 |
| `apps/admin/src/features/plugins/hooks/use-agent-plugin-details-modal.hooks.ts` | 0.0 | 0.0 | 0.0 | 3 |
| `apps/admin/src/features/plugins/hooks/use-plugin-provider-settings.hooks.ts` | 0.0 | 0.0 | 0.0 | 3 |
| `apps/admin/src/features/security/RecoveryCodesCard.hooks.ts` | 70.0 | 100.0 | 83.33 | 3 |
| `apps/admin/src/features/settings/hooks/use-settings-ui.hooks.ts` | 80.0 | 100.0 | 40.0 | 3 |
| `apps/admin/src/features/sites/hooks/use-site-list-prefs.hooks.ts` | 50.0 | 0.0 | 0.0 | 3 |
| `apps/admin/src/features/workspace/hooks/workspace-dependencies.hooks.ts` | 75.0 | 100.0 | 71.43 | 3 |
| `apps/admin/src/lib/assistant-transport-ag-ui.ts` | 95.77 | 76.79 | 94.44 | 3 |
| `apps/admin/src/App.hooks.ts` | 98.97 | 99.22 | 97.89 | 2 |
| `apps/admin/src/components/AssistantDock/assistant-runtime-preferences.adapter.ts` | 77.78 | 87.5 | 71.43 | 2 |
| `apps/admin/src/components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts` | 90.91 | 100.0 | 85.71 | 2 |
| `apps/admin/src/features/email/email-hooks-host.ts` | 84.62 | 71.43 | 72.73 | 2 |
| `apps/admin/src/features/security/hooks/access-tokens-dependencies.hooks.ts` | 95.12 | 96.0 | 95.12 | 2 |
| `apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts` | 95.92 | 95.08 | 94.29 | 2 |
| `apps/admin/src/features/sites/hooks/sites-dependencies.hooks.ts` | 90.0 | 94.12 | 86.67 | 2 |
| `apps/admin/src/features/storage/Storage.tsx` | 81.82 | 100.0 | 50.0 | 2 |
| `apps/admin/src/features/themes/hooks/use-held-back-themes.hooks.ts` | 96.3 | 90.0 | 90.48 | 2 |
| `apps/admin/src/integrations/jini-admin/consent-screen.tsx` | 0.0 | 0.0 | 0.0 | 2 |
| `apps/admin/src/integrations/jini-admin/security-module.hooks.ts` | 88.24 | 100.0 | 50.0 | 2 |
| `apps/admin/src/integrations/jini-admin/settings-external-mcp-shared-choice.hooks.ts` | 75.0 | 66.67 | 83.33 | 2 |
| `apps/admin/src/lib/browser-telemetry.ts` | 71.43 | 66.67 | 66.67 | 2 |
| `apps/admin/src/lib/widget-embed-extension.tsx` | 94.59 | 96.55 | 91.3 | 2 |
| `apps/admin/src/App.chrome.tsx` | 93.33 | 95.0 | 85.71 | 1 |
| `apps/admin/src/components/EmbedInsertControl/EmbedInsertControl.hooks.tsx` | 66.67 | 85.71 | 66.67 | 1 |
| `apps/admin/src/features/ai-assistant/hooks/assistant-daemon-restart-dependencies.hooks.ts` | 88.89 | 100.0 | 83.33 | 1 |
| `apps/admin/src/features/ai-assistant/hooks/use-admin-execution-mode.hooks.ts` | 75.0 | 100.0 | 50.0 | 1 |
| `apps/admin/src/features/ai-assistant/hooks/use-admin-subagents.hooks.ts` | 97.5 | 95.0 | 95.45 | 1 |
| `apps/admin/src/features/auth/auth-host-binding.tsx` | 85.71 | 100.0 | 83.33 | 1 |
| `apps/admin/src/features/auth/hooks/login-dependencies.hooks.ts` | 66.67 | 50.0 | 50.0 | 1 |

### Files at 0% lines (tovu-admin): 5

`apps/admin/src/features/plugins/hooks/use-agent-plugin-details-modal.hooks.ts`, `apps/admin/src/features/plugins/hooks/use-plugin-provider-settings.hooks.ts`, `apps/admin/src/features/routines/index.ts`, `apps/admin/src/integrations/jini-admin/analytics-page.ts`, `apps/admin/src/integrations/jini-admin/consent-screen.tsx`

### Tests exist but file < 50% lines (tovu-admin): 2

| file | lines% | tests |
|---|---|---|
| `apps/admin/src/features/plugins/hooks/use-agent-plugin-details-modal.hooks.ts` | 0.0 | `use-agent-plugin-details-modal.hooks.unit.test.ts` |
| `apps/admin/src/features/plugins/Plugins.tsx` | 25.0 | `Plugins.unit.test.tsx` |

### Suspected mock-illusion (tovu-admin): 1
A same-named test module-mocks the unit's own module path.

| file | lines% | test |
|---|---|---|
| `apps/admin/src/lib/i18n-common.ts` | 100.0 | `apps/admin/src/lib/__tests__/i18n-common.unit.test.ts` |

### Missing from lcov (tovu-admin): 0



## Detail: tovu-desktop

- files in denominator: 226; measured: 224; missing from lcov: 2
- lines 95.88% (30051/31341), branches 96.58% (6775/7015), functions 91.02% (2605/2862)
- files at 100/100/100: 95 of 224 measured; distance to target: 1290 uncovered lines, 240 uncovered branches, 257 uncovered functions (+ 2 unmeasured files)

### 40 biggest gaps by uncovered lines (tovu-desktop)

| file | lines% | br% | fn% | uncovered |
|---|---|---|---|---|
| `apps/desktop/src/main/index.ts` | 46.4 | 12.5 | 0.0 | 722 |
| `apps/desktop/src/renderer/use-find-in-page.hooks.ts` | 55.63 | 100.0 | 100.0 | 63 |
| `apps/desktop/src/renderer/App.hooks.ts` | 33.33 | 100.0 | 100.0 | 30 |
| `apps/desktop/src/renderer/storage-sheet-slot.tsx` | 65.28 | 92.86 | 57.14 | 25 |
| `apps/desktop/src/renderer/use-live-views.hooks.ts` | 63.77 | 66.67 | 100.0 | 25 |
| `apps/desktop/src/renderer/use-site-rename.hooks.ts` | 87.44 | 100.0 | 100.0 | 25 |
| `apps/desktop/src/renderer/use-site-power.hooks.ts` | 93.0 | 100.0 | 100.0 | 21 |
| `apps/desktop/src/renderer/SiteGrid.hooks.ts` | 86.75 | 96.0 | 100.0 | 20 |
| `apps/desktop/src/renderer/use-site-actions.hooks.ts` | 62.75 | 100.0 | 100.0 | 19 |
| `apps/desktop/src/renderer/sites-home-view.ts` | 78.87 | 100.0 | 100.0 | 15 |
| `apps/desktop/src/renderer/import-site-entry.ts` | 79.1 | 100.0 | 100.0 | 14 |
| `apps/desktop/src/renderer/use-site-list-prefs.hooks.ts` | 82.93 | 100.0 | 92.31 | 14 |
| `apps/desktop/src/renderer/use-add-site.hooks.ts` | 90.3 | 93.1 | 100.0 | 13 |
| `apps/desktop/src/renderer/use-import-website.hooks.ts` | 91.89 | 93.62 | 93.75 | 12 |
| `apps/desktop/src/renderer/use-runner-conversations.hooks.ts` | 57.69 | 100.0 | 50.0 | 11 |
| `apps/desktop/src/renderer/app/StorageSheet.tsx` | 90.74 | 88.46 | 75.0 | 10 |
| `apps/desktop/src/renderer/app/component-harness.ts` | 90.22 | 92.59 | 82.76 | 9 |
| `apps/desktop/src/renderer/dom-hook-harness.ts` | 82.35 | 100.0 | 100.0 | 9 |
| `apps/desktop/src/renderer/use-site-locate.hooks.ts` | 86.15 | 100.0 | 100.0 | 9 |
| `apps/desktop/src/renderer/ImportWebsite.tsx` | 94.94 | 92.86 | 66.67 | 8 |
| `apps/desktop/src/renderer/icons.tsx` | 96.35 | 100.0 | 100.0 | 8 |
| `apps/desktop/src/renderer/source-test-harness.ts` | 89.47 | 91.67 | 72.73 | 8 |
| `apps/desktop/src/renderer/use-loaded-sites.hooks.ts` | 78.38 | 83.33 | 100.0 | 8 |
| `apps/desktop/src/renderer/app-hooks.test-support.ts` | 90.79 | 100.0 | 100.0 | 7 |
| `apps/desktop/src/renderer/app-shell-source.ts` | 68.18 | 100.0 | 100.0 | 7 |
| `apps/desktop/src/renderer/tool-icons.tsx` | 91.25 | 100.0 | 100.0 | 7 |
| `apps/desktop/src/renderer/use-import-handoff.hooks.ts` | 72.0 | 100.0 | 100.0 | 7 |
| `apps/desktop/src/renderer/use-start-imported.hooks.ts` | 85.71 | 94.12 | 100.0 | 7 |
| `apps/desktop/src/renderer/use-tab-close-ask.hooks.ts` | 93.52 | 85.0 | 100.0 | 7 |
| `apps/desktop/src/renderer/use-workspace-chat-transport.hooks.ts` | 58.82 | 100.0 | 100.0 | 7 |
| `apps/desktop/src/renderer/use-zoom.hooks.ts` | 72.0 | 100.0 | 100.0 | 7 |
| `apps/desktop/src/update-check-now.ts` | 92.22 | 88.46 | 88.89 | 7 |
| `apps/desktop/src/renderer/app/TabCloseAsk.tsx` | 82.86 | 87.5 | 50.0 | 6 |
| `apps/desktop/src/renderer/use-delete-confirmation.hooks.ts` | 68.42 | 100.0 | 100.0 | 6 |
| `apps/desktop/src/renderer/use-project-tabs.hooks.ts` | 89.66 | 100.0 | 90.91 | 6 |
| `apps/desktop/src/renderer/use-site-start.hooks.ts` | 95.59 | 100.0 | 100.0 | 6 |
| `apps/desktop/src/renderer/use-site-toast.hooks.ts` | 81.25 | 100.0 | 100.0 | 6 |
| `apps/desktop/src/renderer/use-sites-inventory.hooks.ts` | 96.15 | 100.0 | 100.0 | 6 |
| `apps/desktop/src/app-version-ipc.ts` | 90.38 | 85.71 | 66.67 | 5 |
| `apps/desktop/src/main/boot/desktop-cache-policy.ts` | 97.82 | 81.82 | 96.55 | 5 |

### Files at 0% lines (tovu-desktop): 0

none

### Tests exist but file < 50% lines (tovu-desktop): 1

| file | lines% | tests |
|---|---|---|
| `apps/desktop/src/renderer/App.hooks.ts` | 33.33 | `App.hooks.render.test.ts`, `App.hooks.test.ts`, `App.render.test.ts` |

### Suspected mock-illusion (tovu-desktop): 0
A same-named test module-mocks the unit's own module path.

| file | lines% | test |
|---|---|---|

### Missing from lcov (tovu-desktop): 2

`apps/desktop/src` 2
