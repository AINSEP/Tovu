COUNT r62t-count2-a COMPLETE: MOVE 155 / STAYS-HOST 125

I reconciled all 280 admin files in Part 1’s NOT-CHECKED set at Tovu `caa3ac7811`, using Jini `dc2349f51` for destination and duplication checks. Part 1’s verdicts, the planner’s existing keeps, and the excluded theme areas are not recounted.

MOVE means the file still owns reusable behavior or a portable contract. For a mixed file, only that part moves. For example, `media-api.ts` still implements the media client, while `pages-api.ts` only binds an existing Jini factory. `PageEditor.tsx` owns the HTML editing and save UI, while `use-post-editor.hooks.ts` wires TipTap and remains under the rich-text hold. No files were changed, and no tests, builds, installs, or type-checks ran.

## 1. Extra KEEP_RULES

These are exact brace globs relative to `apps/admin/src/`. Expand the braces before converting them to anchored planner regexes. They cover exactly the 125 additional keeps, with no overlap into MOVE. A live port file does not become MOVE solely because it also contains a test fake.

```text
# Existing Jini client factories bound to host request, workspace, or session
features/{analytics/api/analytics-api,auth/api/auth-api,database/api/database-api,email/api/mail-status-api,email/email-api,import-export/api/import-export-api,members/api/members-api,observability/api/observability-api,pages/api/pages-api,recovery/api/recovery-api,roles/api/roles-api,trash/api/trash-api,users/api/users-api}.ts

# Live ports over host clients, request conventions, locale, navigation, and refresh
features/{database/hooks/{migrate-forward-section,schema-state-section,timeline-section},deployment/hooks/{deployment-overview,dockerfile-source,publish-credentials,static-export,static-publish},import-export/hooks/{git-backup,import-export},integrations/hooks/{integration-deliveries,integrations},media/hooks/{media,media-import},members/hooks/members,pages/hooks/{page-editor,pages,theme-pages}}-dependencies.hooks.ts
features/{plugins/hooks/{agent-plugin-memory,agent-plugin-surfaces,plugins},posts/hooks/{post-editor,posts-list},providers/hooks/always-allow,publish-content/hooks/publish-content,recovery/hooks/{recovery,restore-flow},roles/hooks/roles,security/hooks/{access-tokens,other-credentials,site-key},source-control/hooks/source-control-credentials,trash/hooks/trash}-dependencies.hooks.ts

# Bound controllers and host projections, including the held Collection Entry TipTap setup
features/{collections/hooks/use-{collection-entries,collection-entry-editor,collections,edit-fields-dialog,lifecycle-confirm-dialog,new-content-type-dialog},content-analysis/hooks/use-content-analysis,members/hooks/members-controller,menus/hooks/use-{menu-editor,menus},pages/hooks/use-pages,plugins/hooks/use-{agent-plugin-memory,host-admin-surface-frame,plugin-provider-settings},providers/hooks/use-always-allow,settings/hooks/use-user-interface-tab}.hooks.ts

# Screen mounts and slot composition. Delete any forwarding-only shell once callers are repointed.
features/{collections/CollectionsScreen,menus/{menu-editor-panel,menus-panel},pages/Pages,plugins/PluginPackageFilesModal,skills/SkillsPage,posts/editor/PostSavedPanels}.tsx

# Theme source, canvas, routes, publish rules, and Theme Pages UI
components/TemplateSource/{template-source-dependencies.hooks.ts,TemplateSourceModal.hooks.ts,TemplateSourceModal.tsx,use-template-source.hooks.ts}
features/pages/{hooks/use-theme-{canvas-styling,pages}.hooks.ts,lib/theme-page-publish-state.ts,ThemePageDetailsModal.tsx,ThemePagesTab.tsx}
features/posts/editor/header/PostEditorToolbarEnd.tsx

# Held TipTap setup, live-editor transactions, and region composition
features/posts/{hooks/{post-editor-file-upload.ts,use-loaded-post-apply.hooks.ts,use-post-editor-screen.hooks.ts,use-post-editor.hooks.ts},PostEditor.hooks.ts}
lib/{media-embed-extension.hooks.ts,media-embed-extension.tsx,widget-embed-extension.hooks.ts}

# Shared components and hooks bound to host CSS, stores, copy, or preview transport
components/{AssistantDock/chat-{agent-plugin-preferences,display-preferences}.adapter.ts,CredentialHint.tsx,MediaEditDialog/MediaEditDialog.hooks.tsx,Select/Select.tsx,status-labels.ts,WidgetConfigFields/WidgetPreview.hooks.ts}

# Product catalogs, policies, copy, routes, and desktop recovery binding
features/{authentication/model/provider-schemas.ts,import-export/import-export-tabs.tsx,plugins/{admin-token-sources,composer-capabilities,rules}.ts,security/rules.ts,trash/rules.ts}
features/{deployment/StaticSiteTab.hooks.ts,security/{RecoveryCodesCard.hooks.ts,Security.hooks.ts}}

# App-owned publish store instances and section-action binding
features/publish-content/hooks/{publish-availability.store.ts,publish-request.store.ts,use-publish-section-button.hooks.ts}

# Shell bindings for app instances, settings namespaces, refresh, and local drafts
hooks/{admin-execution-credential-dependencies,admin-locale-dependencies,assistant-chats-dependencies,use-admin-appearance-snapshot,use-assistant-chats,use-interface-preferences,use-settings-slice,use-standing-draft-autosave}.hooks.ts
lib/{addons-routes,admin-failure-channel,agent-navigation-entities,agent-pages,agent-screenshot,assistant-transport-ag-ui,assistant-transport,ledger-slice,owner-clients}.ts
lib/fetch-query/provider.tsx
```

## 2. Per-area count

| Area | Residual | MOVE | STAYS-HOST | NOT-CHECKED |
|---|---:|---:|---:|---:|
| adm-shell-components | 35 | 24 | 11 | 0 |
| adm-other | 106 | 59 | 47 | 0 |
| adm-deployment | 17 | 11 | 6 | 0 |
| adm-members | 3 | 0 | 3 | 0 |
| adm-pages | 16 | 5 | 11 | 0 |
| adm-posts | 24 | 15 | 9 | 0 |
| adm-publish-content | 12 | 8 | 4 | 0 |
| adm-recovery | 3 | 0 | 3 | 0 |
| adm-roles | 2 | 0 | 2 | 0 |
| adm-security | 24 | 18 | 6 | 0 |
| adm-source-control | 6 | 5 | 1 | 0 |
| adm-users | 1 | 0 | 1 | 0 |
| adm-shell-hooks | 10 | 2 | 8 | 0 |
| adm-shell-lib | 21 | 8 | 13 | 0 |
| **Total** | **280** | **155** | **125** | **0** |

## 3. MOVE ledger

Source paths are relative to `apps/admin/src/`. Parenthesized source directories apply to all files in that bullet. Destinations identify Jini package ownership and the target subtree, not necessarily an existing export. Domain React files go to the domain package’s `react/` folder and receive the admin kit and custom hooks through required props.

### adm-shell-components — 24

- **`@jini-ai/admin/react/shell`** (`components/`) — `Placeholder.tsx`. Move the coming-soon UI and label resolution, with Tovu navigation and translation injected.
- **`@jini-ai/integrations/react/admin-credentials`** — `components/AdminByokKeyPanel.tsx`. Move the credential prompt, footer, and status rendering.
- **`@jini-ai/admin/react/shell/assistant-dock`** (`components/AssistantDock/`) — `AssistantDock.state.hooks.ts`, `hooks/agents-inventory.hooks.ts`, `hooks/byok-runtime.hooks.ts`, `hooks/composer-discovery.hooks.ts`, `hooks/composer-files.hooks.ts`, `hooks/execution-config-ledger.hooks.ts`, `hooks/execution-config.hooks.ts`, `hooks/local-cli-selection.hooks.ts`, `hooks/messages-change.hooks.ts`, `hooks/run-context.hooks.ts`, `hooks/runtime-access.hooks.ts`. Move dock sequencing, cache and refresh logic, selection, and run-context projection. Leave live transport, desktop and voice wiring, the bundled discovery catalog, and the Tovu debug sink in the host.
- **`@jini-ai/chat/react`** (`components/AssistantDock/`) — `OverflowAwareMcpUiSurfaceCard.tsx`, `RoutedA2uiSurfaceCard.tsx`. Move overflow and surface rendering behavior, with the host chart registry and styles injected.
- **`@jini-ai/cms/react/media`** (`components/MediaPickerDialog/`) — `MediaPickerDialog.hooks.tsx`, `MediaPickerDialog.tsx`. Move picker queries, filtering, selection, and rendering. Retain Tovu’s backend selection and live adapters.
- **`@jini-ai/cms/react/widgets`** (`components/`) — `EmbedInsertControl/EmbedInsertControl.hooks.tsx`, `WidgetConfigFields/HtmlAttributeRows.tsx`, `WidgetConfigFields/MediaContentEditor.hooks.ts`, `WidgetConfigFields/MediaContentEditor.tsx`, `WidgetConfigFields/WidgetConfigFields.tsx`, `WidgetPickerDialog/WidgetPickerDialog.hooks.tsx`, `WidgetPickerDialog/WidgetPickerDialog.tsx`. Move the form, validation, and picker flows. Inject catalog/default policy, renderers, and editor commands. The TipTap extensions stay in Tovu.

### adm-other — 59

- **`@jini-ai/cms/react/collections`** — `features/collections/CollectionEntryEditor.tsx`. Move dynamic field controls, validity, and entry lifecycle UI. Inject the host’s body editor and site-field projection.
- **`@jini-ai/db/react/database`** — `features/database/Database.tsx`. Move the timeline, schema-state, and migrate-forward screen UI, with live controllers injected.
- **`@jini-ai/user-management/react/mail`** (`features/email/`) — `Email.tsx`, `EmailProviderTab.tsx`, `EmailSegments.tsx`. Move status and provider UI, tab state, and the accessible segment view. Inject the segmented control, theme boundary, and live controllers.
- **`@jini-ai/cms/react/fs-files`** — `features/fs-files/api/fs-files-api.ts`. Move the filesystem admin client. The `tovuFiles` preload key and desktop folder-drop binding stay.
- **`@jini-ai/devops/react/backup`** — `features/import-export/ImportExport.tsx`. Move the hub and link-card UI. Inject the host tab definitions, site import/export bodies, navigation, and product copy.
- **`@jini-ai/integrations/react/webhooks`** (`features/integrations/`) — `IntegrationDeliveries.tsx`, `Integrations.tsx`, `rules.ts`, `hooks/use-integration-deliveries.hooks.ts`, `hooks/use-integrations.hooks.ts`. Move subscription mutations, delivery presentation, error selection, and input rules. Inject transport and translation.
- **`@jini-ai/cms/react/media`** — `features/library/hooks/library-dependencies.hooks.ts`, `features/media/api/media-api.ts`, `features/media/Media.hooks.tsx`, `features/media/hooks/use-edit-media-panel.hooks.ts`, `features/media/hooks/use-media-preview.hooks.ts`, `features/media/hooks/use-media.hooks.ts`. Move the library download factory, media wire client, and edit/preview/list behavior. Keep live HTTP, Tovu rendition URLs, and provider-store bindings in the host. Split shared wire types to core.
- **`@jini-ai/agent-plugins/react`** (`features/plugins/`) — `AddAgentPluginPanel.tsx`, `AgentPluginDetailsModal.tsx`, `AgentPluginDisableConfirmDialog.tsx`, `AgentPluginManageButton.tsx`, `AgentPluginRow.tsx`, `AgentPlugins.tsx`, `AgentPluginUpdateControl.tsx`, `hooks/agent-plugin-install-dependencies.hooks.ts`, `hooks/use-agent-plugin-details-modal.hooks.ts`, `hooks/use-agent-plugin-disable-confirm.hooks.ts`, `hooks/use-agent-plugin-install.hooks.ts`, `hooks/use-agent-plugin-update.hooks.ts`, `hooks/use-agent-plugins.hooks.ts`, `PackageFilesModal.tsx`. Move install/update flows, the upload and digest adapter logic, and inspect/manage UI. Inject host request, digest, policy, and cross-domain file hooks. Reuse Jini’s existing `useAgentPluginFileTree`.
- **`@jini-ai/plugins/react`** (`features/plugins/`) — `AddPluginPanel.tsx`, `PluginProviderSettingField.tsx`, `PluginProviderSettingsDialog.tsx`, `PluginRemoveConfirmDialog.tsx`, `hooks/plugin-install-dependencies.hooks.ts`, `hooks/use-plugin-install.hooks.ts`, `hooks/use-plugin-package-files.hooks.ts`, `hooks/use-plugin-remove-confirm.hooks.ts`, `hooks/use-plugins.hooks.ts`. Move install preview and upload body shaping, file-query state, list mutations, and field/dialog UI. The package-file modal is an injected component across the package seam.
- **`@jini-ai/integrations/react/providers`** — `features/providers/Providers.tsx`. Move the tab UI and status presentation. Inject the MCP and webhook bodies, host theme, and product-specific server setup.
- **`@jini-ai/chat/react/admin-execution`** (`features/settings/`) — `ai-agent-presentation.ts`, `hooks/use-ai-agent-presentation.hooks.ts`. Move inventory scan arbitration, label normalization, and auth warning selection. Leave Tovu desktop detection, the default agent, and copy bindings in the host.
- **`@jini-ai/mcp/react/external-mcp`** (`features/settings/`) — `ExternalMcpAdmissionsBanner.tsx`, `ExternalMcpSettingsPanel.hooks.tsx`, `ExternalMcpSettingsPanel.tsx`, `ExternalMcpToolPicker.hooks.tsx`, `ExternalMcpToolPicker.tsx`, `ExternalMcpToolsModal.tsx`, `hooks/use-external-mcp-admissions.hooks.ts`, `hooks/use-external-mcp-tool-picker.hooks.ts`, `hooks/use-external-mcp.hooks.ts`. Move connection forms, admission and drift state, and picker filtering, retry, and save behavior. Inject clients, product copy, and host error handling.
- **`@jini-ai/agentic/react/skills`** (`features/skills/`) — `api.ts`, `use-skill-files.hooks.ts`, `use-skill-install.hooks.ts`, `use-skills.hooks.ts`. Move the wire client and file/install/list state. Inject the host change event, tool names, prompt copy, and failure presentation.
- **`@jini-ai/cms/react/trash`** (`features/trash/`) — `Trash.tsx`, `hooks/use-trash.hooks.ts`. Move paging, selection, restoration and deletion flows, and screen rendering. Inject the client and Tovu’s error/copy binding.

### adm-deployment — 11

- **`@jini-ai/devops/react/deploy`** (`features/deployment/`) — `Deployment.tsx`, `DockerfileTab.tsx`, `HistoryTab.tsx`, `deployment-visuals.tsx`, `rules.ts`, `hooks/use-deployment-overview.hooks.ts`, `hooks/use-dockerfile-source.hooks.ts`, `hooks/use-publish-credentials.hooks.ts`, `hooks/use-static-export.hooks.ts`, `hooks/use-static-publish.hooks.ts`. Move the views and deployment controllers, including polling, version-aware saves, and publish readiness. Inject live ports, target policy, environment defaults, and product copy.
- **`@jini-ai/core/contracts/site`** — `features/deployment/api/publish-destination.types.ts`. Move the neutral destination wire shape. Keep the Tovu peer discriminant and host projection at the boundary so wire parity is preserved.

### adm-pages — 5

- **`@jini-ai/cms/react/pages`** (`features/pages/`) — `PageEditor.tsx`, `rules.ts`, `hooks/page-editor-port.hooks.ts`, `hooks/page-editor-save.ts`, `hooks/use-page-editor.hooks.ts`. Move the HTML editor UI, save and conflict workflow, and its client port. Inject the template viewer, theme canvas, preview refresh, and host URL policy. Theme Pages stays in Tovu.

### adm-posts — 15

- **`@jini-ai/cms/react/posts`** (`features/posts/`) — `PostCoverImage.tsx`, `rules.ts`, `editor/header/PostEditorActions.tsx`, `editor/header/PostEditorHeader.tsx`, `editor/notices/PostEditorNotices.tsx`, `editor/notices/PostEditorSlugCollisionWarning.tsx`, `editor/preview/PostPreview.tsx`, `editor/view-bar/PostEditorViewBar.tsx`, `hooks/post-editor-messages.ts`, `hooks/post-editor-port.hooks.ts`, `hooks/post-editor-save.rules.ts`, `hooks/post-editor-state.rules.ts`, `hooks/use-post-featured-image.hooks.ts`, `hooks/use-post-url-dialog.hooks.ts`, `hooks/use-posts.hooks.ts`. Move the post list, chrome, preview, and editor-independent state and rules. The URL dialog takes a structural command port. Keep TipTap-specific rules, commands, and host theme projection at the seam.

### adm-publish-content — 8

- **`@jini-ai/cms/react/publish-content`** (`features/publish-content/`) — `api/publish-content-api.ts`, `hooks/criteria-publish-result.ts`, `hooks/publish-content-port.hooks.ts`, `hooks/use-publish-content-confirm.hooks.ts`, `PublishContentDialog.hooks.tsx`, `PublishContentDialog.tsx`, `PublishSectionButton.tsx`. Move the plan/confirm/execute client, report projection, and confirmation UI. Inject live destination discovery, section policy, and Tovu copy. Keep the app-owned store instances.
- **`@jini-ai/core/contracts/site`** — `features/publish-content/api/publish-content-api.types.ts`. Consolidate the admin destination response with its server counterpart. Destination discovery policy is not part of the contract.

### adm-security — 18

- **`@jini-ai/integrations/react/credentials`** (`features/security/`) — `access-token-forms.ts`, `AccessTokensTab.hooks.tsx`, `AccessTokensTab.tsx`, `CopyKeysDialog.tsx`, `other-credential-stores.ts`, `OtherCredentialsSection.hooks.tsx`, `OtherCredentialsSection.tsx`, `hooks/other-credentials-port.hooks.ts`, `hooks/use-access-tokens.hooks.ts`, `hooks/use-copy-keys.hooks.ts`, `hooks/use-other-credentials.hooks.ts`. Move form and update rules, copy/replace/remove flows, filtering, and reusable row UI. Inject the host’s store list, providers, permissions, copy, and live ports.
- **`@jini-ai/integrations/react/site-key`** (`features/security/`) — `SiteKeyRecoveryCard.tsx`, `SiteKeyTab.tsx`, `hooks/site-key-port.hooks.ts`, `hooks/site-key-status.rules.ts`, `hooks/use-site-key-recovery.hooks.ts`, `hooks/use-site-key.hooks.ts`. Move the neutral site-key status, generate/import/recovery workflow, rendering, and client port. Inject the permission, live client, and Tovu environment-variable name.
- **`@jini-ai/user-management/react/auth`** — `features/security/RecoveryCodesCard.tsx`. Move the owner recovery view and its loading/error state. The desktop proof and branded download binding stay in `RecoveryCodesCard.hooks.ts`.

### adm-source-control — 5

- **`@jini-ai/devops/react/source-control`** (`features/source-control/`) — `SourceControl.tsx`, `ProvidersTab.tsx`, `rules.ts`, `source-control-visuals.tsx`, `hooks/use-source-control-credentials.hooks.ts`. Move provider descriptor projection, credential form and mutation logic, and the screen UI. Inject the provider port, navigation, and host guidance.

### adm-shell-hooks — 2

- **`@jini-ai/admin/react/shell/appearance`** — `hooks/use-admin-appearance.hooks.ts`. Move versioned preview-versus-snapshot arbitration. Keep Tovu theme selection and CSS painting as collaborators.
- **`@jini-ai/integrations/react/admin-credentials`** — `hooks/use-admin-execution-credential.hooks.ts`. Move credential save state, endpoint matching, and footer status rules. Inject Tovu transport and refusal copy.

### adm-shell-lib — 8

- **`@jini-ai/admin/browser`** — `lib/browser-telemetry.ts`, `lib/server-reconnect.ts`, `lib/settings-events.ts`. Move route templating and root error reporting, reconnect/poll/retry state, and settings feed cursor and refresh handling. Keep Tovu telemetry transport, upstream header and readiness bindings, and the theme-preview event projection in the host.
- **`@jini-ai/admin/core/settings`** — `lib/settings-tabs.ts`. Move reusable settings decoding and diff-write behavior. Keep the locale catalog, theme palette policy, and host consent side effects.
- **`@jini-ai/integrations/react/credentials`** — `lib/credential-copy.ts`. Move credential hint selection and draft validation, with token validation and translation injected.
- **`@jini-ai/chat` HTTP transport layer** — `lib/durable-run-subscription.ts`. Move checkpoint/ETag and stream event adaptation. Keep Tovu paths, notices, and page activity binding.
- **`@jini-ai/chat/react/admin-execution`** — `lib/execution-settings.ts`. Move execution config decoding, ledger projection, and detection/cache behavior. Keep the legacy storage key, workspace bindings, and provider defaults in the host.
- **`@jini-ai/cms/react/publish-content`** — `lib/publish-criteria-deep-link.ts`. Move the consume-once query behavior. Inject the parameter name and decoder.

## 4. NOT-CHECKED

None within this dispatch. The other 579 Part 1 residual files are outside the admin scope.
