UNTANGLE PLAN COMPLETE

The admin ratchet should start with **zero direct cross-feature imports, including type-only imports**. Tovu binds feature collaborators at the panel and shell composition points. Jini Admin owns the small pieces of presentation genuinely shared by several screens. Themes, admin theme policy, theme CSS, and preview implementations stay in Tovu.

I verified 80 direct feature pairs at Tovu `41e948ee4a`. Of those, 77 carry a value import and three are type-only. The `features/` tree has 46 directories, with a separate `src/admin-themes/` runtime that the coordinator’s edge table did not include. The supplied P9F report is present as `plans/P9F-feature-lanes.md` on `origin/plan/whats-left-1122`. Jini READY is `e4e3bf175`, with the merge-13 report at tip `7c4ee7881`. The plan credits the three Tovu overlays, including their documented holds. This was a read-only review. No files changed and no tests, builds, installs, or type-checks ran.

Paths in the edge tables are relative to `apps/admin/src/features/` unless prefixed with `src/`. Each implementation row starts with its test, then applies and reverts the named mutation. Jini rows land before their dependent Tovu rows. Reuse the affected P9 sheets for the source moves and deletions. The steps below specify seam work and cutovers, with one implementer and one repository per row.

## 1. Content, editors, and publishing

### Verified imports

| Edge | Import sites |
|---|---|
| Pages → Posts | `pages/hooks/page-editor-dependencies.hooks.ts:4–5` and `pages/hooks/pages-dependencies.hooks.ts:1–2` take `AdminPost` and `postsApi`. `pages/page-editor-i18n.ts:13` imports the Posts translator. Other `AdminPost` consumers include `pages/Pages.tsx:8`, `pages/api/pages-api.ts:3`, `pages/hooks/page-editor-port.hooks.ts:2`, `pages/hooks/pages-port.hooks.ts:1`, `pages/hooks/page-editor-save.ts:8`, `pages/hooks/use-page-editor.hooks.ts:7`, `pages/hooks/use-pages.hooks.ts:4`, and `pages/rules.ts:6`. |
| Posts → Pages | `posts/editor/notices/PostEditorNotices.tsx:2` imports `PageExternalChangeBanner`; `posts/editor/preview/PostPreviewFrame.tsx:1` imports `PAGE_PREVIEW_IFRAME_SANDBOX`; `posts/hooks/use-post-editor.hooks.ts:54` imports the Page editor translator and uses it as a fallback at line 1255. |
| Pages and Posts → Themes | `pages/PageEditor.tsx:2–3,34`, `pages/hooks/page-editor-dependencies.hooks.ts:2–3`, `pages/hooks/page-editor-port.hooks.ts:1`, `pages/hooks/theme-pages-dependencies.hooks.ts:1`, `pages/hooks/use-page-editor.hooks.ts:6`, and `pages/hooks/use-theme-pages.hooks.ts:4`. In Posts, `posts/editor/header/PostEditorToolbarEnd.tsx:1`, `posts/editor/preview/PostPreviewFrame.tsx:2`, `posts/editor/template/PostEditorTemplateModalGate.tsx:2`, `posts/hooks/post-editor-dependencies.hooks.ts:4–5`, `posts/hooks/post-editor-port.hooks.ts:2`, `posts/hooks/post-editor-state.rules.ts:1`, and `posts/hooks/use-post-editor.hooks.ts:21`. |
| Themes → Pages and Publish Content | `themes/hooks/use-theme-explore.hooks.ts:10` takes `homeFallbackPublishReason`. `themes/Themes.tsx:12` takes `PublishSectionButton`. |
| Dashboard ↔ Publish Content | `dashboard/Dashboard.tsx:10–11` takes `requestPublish` and `usePublishToLiveAvailable`. `publish-content/hooks/use-publish-section-button.hooks.ts:4` imports the Dashboard translator for section labels. |
| Dashboard → Pages, Posts, Media, Themes | `dashboard/hooks/dashboard-dependencies.hooks.ts:3–6,8` binds four APIs. The Posts DTO also reaches `dashboard/Dashboard.tsx:1`, `dashboard/hooks/dashboard-port.hooks.ts:2`, `dashboard/hooks/use-dashboard.hooks.ts:6`, and `dashboard/rules.ts:2`. |
| Posts → Media | `posts/hooks/post-editor-dependencies.hooks.ts:2–3`, `posts/hooks/post-editor-port.hooks.ts:1`, and `posts/hooks/use-post-featured-image.hooks.ts:2`. The picker and editor extensions also reach Media through shared files, including `posts/PostCoverImage.tsx:6` and `posts/hooks/use-post-editor.hooks.ts:25–26`. |
| Pages, Posts, Collections → Taxonomy | `pages/PageEditor.tsx:37`, `posts/editor/PostSavedPanels.tsx:3`, and `collections/CollectionEntryEditor.tsx:7` take `TermPicker`. |
| Pages, Posts, Collections, Taxonomy, Media → Publish Content | `pages/Pages.tsx:15`, `posts/Posts.tsx:18`, `collections/CollectionEntries.tsx:6`, `collections/Collections.tsx:11`, `taxonomy/Taxonomy.tsx:13`, and `media/Media.tsx:45` take `PublishSectionButton`. |

### Contracts, shared modules, and host bindings

- **Content contract.** Move `AdminPost` from `posts/api/posts-api.types.ts:8` to `@jini-ai/core/contracts/site/content-entry` as `AdminContentEntry`. Preserve `kind`, `version`, optional body fields, tri-state override, and remaining wire fields. Keep creation and patch types at their current owners unless several features consume the same wire shape. Reuse the cleared Foundation Pages/Media contracts where shapes match. Use a narrow media selection result where a caller reads only asset identity and rendition.
- **Shared editor presentation.** Move `PageExternalChangeBanner` from `pages/PageEditor.tsx:483`, the exact preview sandbox constant from `pages/rules.ts:564`, and the cross-editor message slice into `@jini-ai/admin/editor`. Preserve Page editor lookup into Posts messages and Posts’ fallback on a missing key. Keep product copy on existing props. Move the component and comments; keep editor controllers, persistence, and preview-frame behavior with their respective owners. Email can receive the same preview and translation capabilities through its editor binding.
- **Content, taxonomy, and media ports.** Build on `PagesPort`, `PageEditorPort`, `PostEditorPort`, and `DashboardPort`. The host supplies the common entry update, template-preview URL and autosave operations to Pages, preserving `entry: "page"` and `expectedVersion`. Supply media upload, rendition, picker, and editor extensions through the existing Posts props and controller dependencies. The host supplies a `TermPicker` slot to all three editors, binding its taxonomy and permission operations once at composition. Keep `ContentAnalysisCard` a separate optional contribution.
- **Publishing.** Publish Content owns dialog state and the scoped publish control. Move generic control code under `@jini-ai/admin/publish-content`. Inject section lookup and translation at the existing controller boundary, with Tovu supplying the retained policy and localized labels. Dashboard receives `requestPublish` and a stable availability hook prop. Lists receive a publish-control slot. Bind the shell dialog (`src/App.tsx:43–44,553`, `src/App.chrome.tsx:228–233`) and existing form/media/SEO/widget contributions to the same request and availability state. Preserve empty criteria for scoped opening, entity lists, live-site suppression, and cancellation.
- **Themes.** Tovu supplies presentation reads, theme-page list/detail/publish operations, disabled-theme interpretation, template layout, reload control, and `useThemePreviewFrame` as a prop. The feature sees structural tier, template, and presentation fields. Keep `NO_THEME_ID` and its interpretation in the host adapter. Include `src/components/TemplateSource/use-template-source.hooks.ts:4,46` and `pages/hooks/use-theme-canvas-styling.hooks.ts:5,43,66` in the layout binding. Inject the Pages home-fallback resolver into the retained Theme Explore composition, and inject Publish and Trash operations into the retained Themes screen.

### Steps

`Kit` below means the applicable corrected `A-K2-0a/0b/0` and host binding slices, including the existing B2 dialog correction where used.

| Step / repo / min | Files and deliverable | Test first → mutation | Depends on → P9F |
|---|---|---|---|
| C1.J / Jini / 90 | `core/src/contracts/site/content-entry.ts`, exports and compatibility fixture | Compile representative old page/post fixtures → make `bodyFormat` mandatory | Cleared Foundation contracts → Pages, Posts, Dashboard |
| C2.J / Jini / 110 | `admin/src/editor/` banner, preview policy and cross-editor messages | Banner actions, iframe attributes and locale precedence → reverse the translation fallback | Kit → Pages, Posts, Email |
| C3.J / Jini / 95 | `admin/src/publish-content/` section control and request, availability and translation contracts | Scoped dialog and live suppression → drop the entity filter | Kit, applicable publish contract slice → Foundation publishing, content lanes |
| C4.J / Jini / 105 | `admin/src/editor/` theme, picker and media prop shapes, with structural inputs for template source and canvas | Fake preview refresh and fake picker rendering → ignore the injected refresh hook | C1.J, C2.J, Kit → Pages, Posts, Collections, Library/Media |
| C1.T / Tovu / 100 | Page API, list/editor ports and wired hooks, entry type importers, binding in `src/integrations/jini-admin/` | Page autosave and conflicting update → remove `expectedVersion` from the bound patch | C1.J → Pages and shared Posts prerequisites |
| C2.T / Tovu / 105 | Page/Post notice, iframe and message callers, Email preview consumers, remove relocated declarations | Banner action and missing-key locale case → swap the banner actions | C1.T, C2.J → Pages, Posts, Email |
| C3.T / Tovu / 95 | Pages theme hooks, canvas styling and `src/components/TemplateSource/` | Disabled-theme fast path and template layout → look up the disabled sentinel as a theme ID | C1.T, C4.J → Pages |
| C4.T / Tovu / 110 | Posts editor/header/preview/template gates and `src/panels.tsx:241–255` bindings | Manual reload and revision refresh preserve frame state → drop the preview refresh binding | C2.T, C4.J → Posts |
| C5.T / Tovu / 105 | Dashboard readers/ports and shell publish request/availability bindings | Dashboard and section button open the same dialog → bind Dashboard to an independent request store | C1.T, C3.J → Dashboard and Foundation publishing |
| C6.T / Tovu / 100 | List controls, retained Themes bindings and existing Jini module publish contributions | Scoped Collections and Themes home-fallback cases → omit the collection schema entity | C3.T, C5.T → Pages, Posts, Collections/Taxonomy, Library/Media, Menus |
| C7.T / Tovu / 105 | Editor term slots, Posts analysis slot, `taxonomy/hooks/*dependencies*` | Selected terms save and unauthorized writes stay disabled → bind an always-authorized picker | C4.T, C4.J → Collections/Taxonomy, Pages, Posts |
| C8.T / Tovu / 100 | Posts media/picker/extension bindings, Media user/trash/embed adapters and `src/media-panel.ts` | Upload, cover rendition and soft-delete through fakes → return the original URL instead of the bound rendition | C4.T, C6.T, existing media kit → Posts, Library/Media |

## 2. Deployment, Security, Source Control, and Import/Export

### Verified imports

| Edge | Import sites |
|---|---|
| Deployment → Security | `deployment/hooks/publish-credentials-dependencies.hooks.ts:1–2` binds `securityApi`. `deployment/StaticSiteTab.tsx:13`, `deployment/api/deployment-api.types.ts:1`, `deployment/hooks/publish-credentials-port.hooks.ts:1`, `deployment/hooks/use-publish-credentials.hooks.ts:6`, and `deployment/rules.ts:2` use the credential types. |
| Security → Deployment | `security/AccessTokensTab.tsx:11–12`, `security/access-token-forms.ts:5`, `security/access-token-providers.ts:1`, `security/access-token-rows.ts:2`, `security/hooks/access-tokens-dependencies.hooks.ts:3`, `security/hooks/access-tokens-port.hooks.ts:2`, and `security/hooks/use-access-tokens.hooks.ts:14`. These import target descriptors, `deploymentApi`, and field, form and default-row logic. |
| Security → Source Control | `security/access-token-forms.ts:3,6`, `security/access-token-providers.ts:2–3`, `security/access-token-rows.ts:3`, `security/hooks/access-tokens-dependencies.hooks.ts:4–5`, `security/hooks/access-tokens-port.hooks.ts:3`, and `security/hooks/use-access-tokens.hooks.ts:7`. |
| Source Control → Deployment | `source-control/ProvidersTab.tsx:9` imports field helpers. `source-control/api/source-control-api.types.ts:2` and `source-control/rules.ts:2` import descriptor types. |
| Deployment → Import/Export | `deployment/hooks/static-export-dependencies.hooks.ts:1–2` binds `importExportApi`; `deployment/StaticSiteTab.tsx:15`, `deployment/hooks/static-export-port.hooks.ts:1`, `deployment/hooks/use-static-export.hooks.ts:3`, and `deployment/rules.ts:4` use the export snapshot. |
| Import/Export → Source Control | `import-export/hooks/git-backup-port.hooks.ts:1–2` binds `sourceControlApi`; `import-export/git-backup-rules.ts:2` uses the credential summary. |

### Contracts, shared modules, and host bindings

- **Contracts.** Use separate `@jini-ai/core/contracts/site/*` declarations for publish credentials, source-control credentials, provider field descriptors, and export-run snapshots. Keep publish `executionMode` and verification, source-control’s distinct summary/input, and current run states. Repoint `src/lib/descriptor-i18n.ts:1–2`. Compare the existing Jini Source Control and Security models before adding declarations; share only matching wire fields used across owners.
- **Shared presentation.** Put descriptor field help, handle segments, required-field checks, and genuinely shared connection-input/default-row transformations in a small Admin credential-form module. Move the pure pieces out of `deployment/rules.ts` and `source-control/rules.ts` with their rationale. Leave provider catalogs, warning copy, and provider-specific selection and removal policy with their owners or inject it as existing props. Preserve ordering, metadata-only updates, and distinct publish versus Git inputs.
- **Ports.** In Tovu composition bind Deployment’s publish credentials and static export, Security’s target descriptors and source-control store, and Import/Export’s Git backup. Use the existing `*Port` shapes and move their live defaults out of extractable feature directories. Bind Security’s provider, assistant, integration, media, site and auth collaborators independently. Import/Export receives site transfer panel and snapshot-hook props and a host desktop capability value. Existing wire endpoints and route permissions remain the parity reference.
- **Security swap.** Extend the existing `@jini-ai/admin/security` and `@jini-ai/admin/source-control` owners. Fold the contract and form seams into SEC-9–11 and the external store bindings into SEC-14/15. The existing `SEC-T1` deletion remains after SEC-1–15 and `A-adm-shell-lib-3`, with the Deployment and lazy-route repoints in `plans/P9-SEC-0-parity.md`.

| Step / repo / min | Files and deliverable | Test first → mutation | Depends on → P9F |
|---|---|---|---|
| O1.J / Jini / 100 | Core publish/Git credential, descriptor and export-run contracts; parity fixtures | Distinct publish/Git shape and operation-state fixture → discard `executionMode` | C wave, Foundation contracts → Deployment, Source Control, Security, Import/Export |
| O2.J / Jini / 105 | `admin/src/credential-form/` shared rules and relevant existing Security/Source Control tests | Rename-only edit preserves the secret; render descriptor help → emit a blank replacement on rename | O1.J, Kit → Security SEC-10/11, Deployment, Source Control |
| O1.T / Tovu / 105 | Deployment `StaticSiteTab`, rules, credential/export ports, `src/panels.tsx:976` binder | Credential and export settlement through injected adapters → discard a terminal export failure | O1.J, O2.J → Deployment |
| O2.T / Tovu / 95 | Source Control `ProvidersTab`, models and rules, shared descriptor i18n and Import/Export Git port | Git backup keeps provider and default selection → bind to the publish credential list | O1.J, O2.J → Source Control, Import/Export |
| O3.T / Tovu / 110 | Security token form/rule importers and target, Git and provider adapters | Default promotion and independent catalog failure → drop saved credentials for a missing descriptor | O1.T, O2.T, O2.J → Security parity |
| O4.T / Tovu / 105 | Security other-store, site-key and permission dependency factories; host mount at `src/panels.tsx:1041` | Independent store results and denied tab while grants load → pass the unresolved grant as allowed | O3.T, current host adapters → SEC-14/15 and eventual SEC-T1 |
| O5.T / Tovu / 100 | `import-export/ImportExport.tsx`, `use-import-export.hooks.ts`, `src/panels.tsx:178` | Transfer tabs and desktop snapshot render with the correct capabilities → infer desktop from URL | O2.T, host Sites adapter → Import/Export and Sites |

## 3. Settings, AI Assistant, Integrations, Plugins, and Providers

### Verified imports

| Edge | Import sites |
|---|---|
| Assistant ↔ Settings | `ai-assistant/AiAssistant.tsx:7–8` imports desktop detection, scope copy and Settings execution translation. `settings/hooks/use-external-mcp-admissions.hooks.ts:6` takes `aiAssistantApi`. |
| Settings → Integrations | `settings/ExternalMcpSharedChoice.hooks.ts:2`, `settings/hooks/use-external-mcp-admissions.hooks.ts:4–5`, `settings/hooks/use-external-mcp-oauth-connect.hooks.ts:3`, `settings/hooks/use-external-mcp-tool-picker.hooks.ts:3–4`, `settings/hooks/use-external-mcp.hooks.ts:25–26`, `settings/external-mcp-admissions-rules.ts:1`, and `settings/external-mcp-tool-picker-rules.ts:1`. |
| Plugins ↔ Integrations | `plugins/hooks/agent-plugins-dependencies.hooks.ts:1–2` uses the Integrations DTOs and API. The same DTOs reach `plugins/AgentPluginLinkedLock.tsx:3`, `AgentPluginMaturity.tsx:3`, `AgentPluginRow.tsx:8`, `AgentPlugins.hooks.ts:2`, `AgentPlugins.tsx:13`, `rules.ts:1`, and the install, update, controller and port hooks. `integrations/api/integrations-api.types.ts:2,362` imports `AdminPluginFiles` and derives `AdminAgentPluginFiles` with `Omit<…, "source">`. |
| Plugins → Providers | `plugins/hooks/plugins-dependencies.hooks.ts:3` takes `providersApi`. |
| Providers → Settings | `providers/Providers.tsx:11` imports `ExternalMcpSettingsPanel`. `providers/hooks/use-providers.hooks.ts:1` imports `useExternalMcp` and its controller type. The hook’s comment records that this panel reads a separate table and no longer renders in Settings. |
| Providers → Integrations | `providers/Providers.tsx:13–15` takes `Integrations`, its wired hook and translator. `providers/hooks/always-allow-dependencies.hooks.ts:1–2`, `providers/hooks/always-allow-port.hooks.ts:1`, and `providers/always-allow-rules.ts:1` use the MCP server and approval shapes and API. |

### Contracts, shared modules, and host bindings

- **Contracts.** Put common plugin inventory/file and remote MCP admission, tool and approval DTOs under `@jini-ai/core/contracts/site/*`. Preserve the plugin file `source` distinction. Reuse compatible shapes from Jini Admin’s existing Agent Plugins models. Move structural execution/visitor credential metadata and patch types only where both Security and Assistant consume them. Keep endpoint errors, credential adapters, copy and provider policy outside core.
- **Shared modules.** Move the standalone External MCP panel and controller slice to the existing Integrations delivery lane’s Admin destination, with the original query and mutation behavior. Providers receives the bound panel as a slot. Its other Integrations tabs receive bound view/controller and message props; neither tab mounts the Settings ledger. Shared execution presentation can retain pure normalization and stale-scan handling. Desktop preload detection and scope copy become host inputs on existing props. Update callers of the same old helper in Import/Export, the Assistant Dock, and `src/hooks/use-tovu-execution-policy.hooks.ts`.
- **Ports.** Inject narrow slices for MCP admissions, shared-choice metadata, tool list, connect/OAuth, CRUD and approvals. Supply Assistant and auth readers independently to admissions. Bind the Agent Plugins inventory, toggle and file methods from the existing Integrations transport at composition, along with the Providers settings lookup for Plugins. Split the known indirect paths through `src/lib/execution-settings.ts:69–71` and `src/lib/ledger-slice.ts:7`: generic state gets a passed transport; concrete Tovu API imports live in the host binding. Keep OAuth callback and failure behavior, locale timing, disabled plugin states, and request settlement intact.

| Step / repo / min | Files and deliverable | Test first → mutation | Depends on → P9F |
|---|---|---|---|
| P1.J / Jini / 90 | Core plugin inventory and file contracts; existing Admin Agent Plugins fixture | Preserve file shape distinction → make `source` compulsory on agent files | Operations wave → Add-ons, Integrations |
| P2.J / Jini / 110 | Core external MCP and shared credential contracts with wire fixtures | Refusal, pending admission and approval shapes → omit a refusal discriminant | O1.J, Foundation approval/surface contracts → Integrations, Settings, Security |
| P3.J / Jini / 105 | Standalone Integrations External MCP controller/panel seam and Providers slot props | Mount the tab without loading the Settings ledger → omit OAuth failure propagation | P2.J, Kit → Integrations/Providers |
| P4.J / Jini / 80 | Admin execution-presentation slice and existing args/props fields for host capability/copy | Slow initial scan cannot overwrite a rescan → accept the older result | Kit → Settings, Sites/Workspace/AI Assistant |
| P1.T / Tovu / 110 | Settings shared-choice, admissions and tool-picker hooks and host bindings | Admission refresh with auth and Assistant fakes → skip the Assistant readiness check | P2.J → Settings, Integrations |
| P2.T / Tovu / 105 | Settings External MCP OAuth/CRUD dependencies and former panel/controller paths | Connect failure and reload parity → lose the connect refusal during mapping | P1.T, P3.J → Integrations/Providers |
| P3.T / Tovu / 110 | `providers/Providers.tsx`, controller and approval deps; bind Provider tabs at `src/panels.tsx:771` | Deep links, tab locale and approval persistence → bind the Webhooks panel to the MCP tab | P2.T, P3.J → Integrations/Providers |
| P4.T / Tovu / 100 | Plugins DTO importers, agent-plugin and provider defaults, `src/panels.tsx:707` | Toggle failure preserves saved state and file modal stays readable → commit a failed toggle | P1.J, P2.J, P3.T → Add-ons |
| P5.T / Tovu / 115 | Assistant and Settings execution wiring, host policy hook, ledger/execution adapters and Dock call sites | Desktop and server copy plus credential save parity → use the desktop copy for a server session | P4.J, P1.T, O5.T → Settings, Sites/Workspace/AI Assistant |

## 4. Remaining direct edges

**Decision for every value edge below: inject.** An allowed lower-rank feature import would leave a screen dependent on another feature’s implementation. The two remaining type-only pairs are included so the initial rank baseline covers the full graph.

| Verified edge and value sites | Host binding or shared contract | Step |
|---|---|---|
| Admin UI → Admin Themes, Integrations, Settings, `admin-ui/AdminUi.tsx:5–8` | Theme picker and label, Appearance slot and existing history-replacing redirect. Preserve the legacy Design System URL. | R3 |
| Dashboard → Auth, Comments, Sites, `dashboard/hooks/dashboard-dependencies.hooks.ts:2,7,9` | Session, recent comments and site readers. | C5 |
| Email → Pages, `email/EmailTemplateEditor.hooks.ts:1`, `email/EmailTemplateEditor.tsx:14–15`; → Integrations, `email/hooks/use-email-provider.hooks.ts:4`; → Plugins, `email/EmailProviderTab.tsx:8` | Shared editor capabilities, mail provider operations, and provider display formatter. | C2, R5 |
| Import/Export → Settings and Sites, `import-export/hooks/use-import-export.hooks.ts:4–6`, `import-export/ImportExport.tsx:5` | Desktop capability, Sites snapshot/translator and import/export tab slots. | O5 |
| Library → Media, Auth, Users, `library/hooks/library-dependencies.hooks.ts:2–4`, `library/hooks/use-library.hooks.ts:9` | Media operations and byte reader, session and user lookup. | R1 |
| Media → Users, Trash, `media/hooks/media-dependencies.hooks.ts:3–4` | User lookup and the current trash operation. | C8 |
| Menus → Pages, Trash, Publish Content, `menus/hooks/menus-dependencies.hooks.ts:1–2,6`, `menus/Menus.tsx:3` | Page targets and host public link resolver, trash operation and scoped publish slot. | R1, C6 |
| Observability → Auth, `observability/hooks/use-queries-tab.hooks.ts:3`; Posts → Content Analysis, `posts/editor/PostSavedPanels.tsx:2` | Auth reader and analysis card slot respectively. | R2, C7 |
| Recovery → Database, `recovery/hooks/recovery-dependencies.hooks.ts:4`; Database and Recovery → Taxonomy, `database/api/database-api.ts:3`, `recovery/api/recovery-api.ts:2` and corresponding restore/migration ports | Database operations. For the two type-only pairs, reuse core taxonomy DTOs or move the common structural fields. | R2 |
| Security → Assistant, Integrations, Media, Providers, Sites, Auth, `security/hooks/other-credentials-dependencies.hooks.ts:1–4`, `security/other-credential-stores.ts:1`, `security/hooks/access-tokens-dependencies.hooks.ts:6`, `security/hooks/site-key-dependencies.hooks.ts:1`, `security/hooks/security-permissions-dependencies.hooks.ts:1` | Bind per-store methods, media catalog and update adapter, provider catalog, site-key and grants. | O3–O4 |
| Settings → Auth, `settings/hooks/use-external-mcp-admissions.hooks.ts:7`; → FS Files and Voice Input, `settings/ai-agent-presentation.ts:2–3`; → WebMCP and Workspace, `settings/SettingsUi.tsx:130–131,146`; → Admin Themes, `settings/AdminAppearance.tsx:12` | Auth reader, host capability detection, Browser Agent and Workspace slot/copy, appearance scheme control. | P1, P5, R3 |
| Sites → Auth, Users, `sites/hooks/site-transfer-dependencies.hooks.ts:2–3`; Trash → Users, `trash/hooks/trash-dependencies.hooks.ts:2`; Users → Auth, Roles, `users/hooks/users-dependencies.hooks.ts:2,4` | Narrow session, user and role operations at the host mounts. | R2 |
| Skills → Plugins, `skills/SkillRow.tsx:5`, `skills/Skills.tsx:11`, `skills/use-skill-files.hooks.ts:6` | Inject package file viewer, associated read/projection, and icon components. | R5 |
| Taxonomy → Auth and Trash, `taxonomy/hooks/term-picker-dependencies.hooks.ts:3`, `taxonomy/hooks/taxonomy-dependencies.hooks.ts:3`; Themes → Trash, `themes/hooks/themes-dependencies.hooks.ts:3` | Session/permission reader and scope-specific trash ports. | C7, C6 |

The separate `src/admin-themes/` runtime also has direct consumers at `AiAssistant.tsx:2`, `Authentication.tsx:2`, `Email.tsx:8`, `Media.tsx:1`, `Observability.tsx:1`, `AgentPlugins.tsx:2`, `Providers.tsx:2`, `SettingsUi.tsx:2` and `Skills.tsx:2` in their respective feature folders. `settings/AdminAppearance.tsx:8–10` and `settings/hooks/use-admin-appearance-settings.hooks.ts:3` use expanded theme state and registry operations. Bind these through the existing theme kit where its shape fits, with explicit hook props. Supply `AdminThemes.tsx:6–8` from the Tovu composition of its picker, registry and document environment. Put the live default for `src/lib/settings-events.ts:25,58–62` at the shell bind site so the shared subscription retains an injected `publishPreview`. The shell owns application of Tovu theme CSS and document state.

| Step / repo / min | Files and deliverable | Test first → mutation | Depends on → P9F |
|---|---|---|---|
| R1.T / Tovu / 105 | Library and Menus dependency hooks; host media and navigation adapters | Library upload and menu public links → return the admin edit URL as the public URL | C8.T, C6.T → Library/Media, Menus |
| R2.T / Tovu / 105 | Sites, Users, Trash, Recovery, Database and Observability ports | Injected current session, role and recovery operations → fetch under the previous scope | O5.T, cleared identity/taxonomy contracts → Operations, Users/Roles, Sites, Observability |
| R3.T / Tovu / 110 | `admin-ui/AdminUi.tsx`, Settings/Appearance and `src/panels.tsx:605,1117` | Legacy redirect, tab deep links and scheme slot → drop the history replacement | P5.T, Kit → Settings, Workspace |
| R4.T / Tovu / 100 | Admin theme boundary hook consumers, theme picker host composition and `src/lib/settings-events.ts` | Theme scheme and revision event dispatch → route preview events to settings refresh | C3.T, P5.T, R3.T → admin theme consumers |
| R5.T / Tovu / 105 | Email provider and Skills package-file bindings | Email provider label fallback and skill file read errors → reuse a previous successful file result | C2.T, P4.T → Integrations/Email, Add-ons |
| R6.T / Tovu / 110 | Host wrapper entries for Comments, Forms, Redirects, SEO and Widgets; Consent kit and Media embed bindings | Existing lazy route and host module parity → restore a feature import of the composition module | C8.T, applicable existing host module sheets → Foundation, boundary activation |

R6 addresses concrete reverse imports such as `comments/index.ts:10–11`, `forms/index.ts:13–14`, and `consent/CookieConsent.tsx:7`. Keep actual host wrappers with panel composition and repoint the consumers when deleting their old entries. New shared modules must also be independent of feature implementations. A shared file that still needs a concrete API should receive a port or belong to the host.

## 5. Admin boundary ratchet

Mirror the server’s strict-lower-rank rule in `.dependency-cruiser.mjs:833–875`, with the following admin configuration.

- **Match resolved paths** under `^apps/admin/src/features/`, grouped by importer rank. Use the captured directory to exempt same-feature imports, and reject targets with equal or higher rank at `severity: "error"`. Start every production feature at rank `0` in `development/boundaries/admin-feature-ranks.json`. The accepted edge set starts empty. Enforce the zero baseline so a rank bump cannot silently permit a new edge. Use the existing `check-feature-ranks.mjs --features apps/admin/src/features` for missing, stale, invalid and isolated folders.
- **Include type dependencies.** Set `tsPreCompilationDeps: true` and retain both type-only and type-query edges. Run the admin cruise from repo root with `apps/admin/tsconfig.json` so `@/*` resolves correctly. Give Admin its own preset using the rule definitions in `.dependency-cruiser.mjs`; the server’s default preset uses the root website config. Cover aliased imports, relative imports, re-exports, literal lazy imports and side-effect imports. Surface unresolved local/`@/` specifiers as errors in production admin sources. Exclude tests and fixtures from the production importer set.
- **Close the composition escape hatch.** Add rules against feature imports into the named host binders and the separate `src/admin-themes/` runtime. Permit host composition to import the features it binds and permit retained theme implementation to import its own internals. For the new shared Admin editor/credential modules, forbid back-imports into feature implementations. During each move, use the resolved graph to check the screen’s shared utilities for edges that must be replaced with ports before extraction.
- **Make the gate blocking.** Add a dedicated `check:admin-boundaries` invocation to CI. The current server-oriented `check:boundaries` invocation only cruises `apps/website/src`, and its CI step has `continue-on-error: true` at `.github/workflows/ci.yml:117`. Put the admin gate in a separate required step. Mirror the same ownership rule at Jini Admin’s feature roots so a moved screen cannot reintroduce the dependency inside `@jini-ai/admin`.

| Step / repo / min | Files and deliverable | Test first → mutation | Depends on |
|---|---|---|---|
| B.J / Jini / 105 | Jini Admin feature ownership rule in `.dependency-cruiser.mjs`, fixture and blocking Admin check. Identify the registered feature roots, including new ones, separately from shared kit/editor modules. | Accept internal and shared-kit imports. Reject a sibling feature import and a shared module importing back into a feature → exempt one sibling edge and see the fixture fail. | Jini seam rows |
| B.T / Tovu / 115 | `.dependency-cruiser.mjs`, admin preset, rank JSON, `development/scripts/__tests__/check-admin-boundaries.test.ts`, `package.json`, `.github/workflows/ci.yml` | Use the real CLI in a temporary fixture as `check-architecture.test.ts` does. Accept same-feature imports and composition binding. Reject relative and `@/` sibling imports, type-only/query imports, re-export, literal lazy import, theme-runtime and composition back-imports, and an unranked isolated folder. **Mutation:** exempt `type-only` or one rank-zero path and verify the tests fail. | R1–R6, B.J, zero violations on the resolved post-untangle tree |

## Effort and P9F lane order

| Wave | Jini | Tovu | Implementer time |
|---|---:|---:|---:|
| Content and publishing seams | 6 h 40 m | 13 h 40 m | 20 h 20 m |
| Operations and Security seams | 3 h 25 m | 8 h 35 m | 12 h |
| Settings, Assistant and integrations seams | 6 h 25 m | 9 h | 15 h 25 m |
| Remaining edge and wrapper cutovers | — | 10 h 35 m | 10 h 35 m |
| Boundary rules and tests | 1 h 45 m | 1 h 55 m | 3 h 40 m |
| **Total** | **18 h 15 m** | **43 h 45 m** | **62 h** |

These are seam and gate estimates, including work absorbed by existing P9 sheets. They are not an additive estimate for moving every screen, route, service or test. Keep the P9 §1 STOP conditions and linked Jini-before-Tovu sequence. For surviving routes, use K1 `defineJsonRoute` with per-route dependencies and preserve existing Tovu route parity tests. Keep `_optional = {}` pads, the two-object public function convention, injected custom hooks, why-comments and `jini-*` classes. Gate touched functions at 50 lines warning, 80 error and complexity ≤10.

1. **Foundation, then content.** Pull forward `A-K2-0`, the compatible Core Pages/Media slices and shared publishing seams. Keep the already-cleared `T-post-1.T` ahead of the Foundation HTML repoint. Pages and Posts can then finish independently, alongside Collections/Taxonomy, Library/Media, and Dashboard. Menus can follow the shared page-target and publish bindings. Publishing remains in its existing Foundation/Operations ownership even though its admin seam moves first.
2. **Operations next.** Start Deployment, Source Control and Import/Export after O1.J/O2.J. Security parity can follow its existing SEC sequence alongside disjoint operations work. `SEC-T1` still requires full parity and the existing owner-auth, shell and vault prerequisites.
3. **Settings and integrations third.** Finish the standalone External MCP binding, then Providers/Integrations, Settings, and the Add-ons and Sites/Workspace/AI Assistant consumers as their own prerequisites clear. Keep SH-3 and other existing P9F owner holds. Themes has host binding work and no extraction slot.
4. **Enable the ratchet.** Land the residual cutovers and blocking gates. Parallelize ready steps with disjoint sources and importers. Serialize shared manifests, API baselines, `panels.tsx` and affected composition files.

**NOT-CHECKED:** computed module specifiers and exhaustive transitive paths through existing shell utilities, plus every downstream screen and route’s complete cutover inventory. The post-cutover resolved cruise and the existing per-lane parity gates are the acceptance checks for those paths.
