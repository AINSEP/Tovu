COUNT r62t-count1124 PARTIAL: MOVE 58 / STAYS-HOST 203 (excl. themes)

The planner counts **1,120 distinct non-theme files** at `caa3ac7811`. I classified 261 and left **859 unresolved**. Of the 182 non-theme files in the ready sheets, 39 are STAYS-HOST, 9 are MOVE, and 134? No. The reconciled ready count is **172**: 39 STAYS-HOST, 9 MOVE, and 124 unresolved. The blocked list contributes the other 948: 164 STAYS-HOST, 49 MOVE, and 735 unresolved. The 353 existing keeps are outside this denominator.

The most useful distinction was whether the module still owns behavior. `canonical-site-host.ts` mounts a redirect whose eligibility and destination already live in Jini. It stays. `product-checkout.ts` still implements checkout readiness, origin selection, and markup placement. It moves with the host policy injected. Neither the filename nor a Jini import settles the question.

## Proposed `KEEP_RULES`

Append these entries inside the existing `KEEP_RULES` array. They cover the 203 STAYS-HOST verdicts in this census. `STAYS-HOST` does not mean retaining a forwarding barrel after its last host consumer is repointed, or retaining an extractable K4 contract inside a host file.

```js
[/^apps\/admin\/src\/features\/(collections|comments|deployment|forms|integrations|menus|plugins|posts|providers|security|source-control|taxonomy|widgets)\/\1-host-ports\.ts$/, 'Host binds the domain clients and ports to its workspace, request and collaborators'],
[/^apps\/admin\/src\/features\/(auth|authentication)\/\1-host-binding\.tsx$/, 'Host injects sign-in or settings shell collaborators'],
[/^apps\/admin\/src\/features\/(roles|users)\/\1-host-binding\.ts$/, 'Host binds admin transport and navigation'],
[/^apps\/admin\/src\/features\/(deployment|source-control)\/\1-host-i18n\.ts$/, 'Product copy bound to a Jini translator'],
[/^apps\/admin\/src\/features\/(collections|database|deployment|email|import-export|integrations|library|media|members|menus|observability|pages|plugins|posts|providers|recovery|security|settings|source-control|taxonomy|trash)\/index\.ts$/, 'Host screen entry or local barrel; delete the barrel if no host consumer remains'],
[/^apps\/admin\/src\/features\/(auth|authentication|roles|users)\/index\.tsx$/, 'Host mounts the domain screen and supplies product collaborators'],
[/^apps\/admin\/src\/features\/(collections|comments|forms|library|media|members|menus|posts|taxonomy|trash|widgets)\/\1-i18n\.ts$/, 'Host binds shared dictionaries and any product entries'],
[/^apps\/admin\/src\/features\/pages\/page-editor-i18n\.ts$/, 'Host binds the common dictionary and post-editor translator'],
[/^apps\/admin\/src\/features\/voice-input\//, 'Host composer integration uses the desktop voice port, local controls and DOM mounts'],
[/^apps\/admin\/src\/features\/posts\/(?:PostEditor\.tsx|editor\/(?:PostEditorBody\.tsx|(?:bubble-menu|toolbar)\/[^/]+))$/, 'Host TipTap composition and editor internals remain until the rich-text package exists'],
[/^apps\/admin\/src\/lib\/(?:(?:media-image-extension|widget-embed-extension)\.tsx|block-atom-insert\.ts)$/, 'Host TipTap extension and transaction wiring'],

...[
  ['apps/admin/src/', 'Host widget ports, feature mounts and hook wiring', `
    components/AssistantDock/assistant-runtime-preferences.adapter.ts
    components/AssistantDock/execution-config-write.ts
    components/AssistantDock/hooks/assistant-transport.hooks.ts
    components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts
    components/MediaPickerDialog/media-picker-dependencies.hooks.ts
    components/WidgetConfigFields/widget-config-fields-dependencies.hooks.ts
    components/WidgetPickerDialog/widget-picker-dependencies.hooks.ts
    features/auth/hooks/login-dependencies.hooks.ts
    features/auth/hooks/use-wired-login.hooks.ts
    features/collections/CollectionEntriesScreen.tsx
    features/content-analysis/hooks/content-analysis-dependencies.hooks.ts
    features/library/hooks/use-wired-library.hooks.ts
    features/media/media-providers-port.ts
    features/members/members-screen-props.tsx
    features/observability/hooks/observability-wiring.hooks.ts
    features/pages/hooks/page-editor-wiring.hooks.ts
    features/roles/hooks/use-wired-roles.hooks.ts
    features/settings/AdminAppearance.tsx
    features/skills/skill-failure-host.ts
    features/skills/skill-install-confirmation-host.ts
    features/taxonomy/TaxonomyScreen.tsx
    features/taxonomy/taxonomy-wired.hooks.ts
    features/users/hooks/use-wired-users.hooks.ts
    features/webmcp/browser-agent-settings.hooks.ts
    hooks/use-tovu-execution-adapters.hooks.ts
    hooks/use-tovu-execution-policy.hooks.ts
  `],
  ['apps/admin/src/', 'Host HTTP, navigation, product copy and CSS bindings', `
    features/publish-content/publish-content.css
    features/security/access-token-copy.ts
    features/security/copy-keys-dialog.css
    lib/admin-dev-origin.ts
    lib/admin-http/request.ts
    lib/admin-http/settings-api.ts
    lib/admin-nav-i18n.ts
    lib/app-version.ts
    lib/chat-fab-storage-key.ts
    lib/jini-admin-tokens.css
    lib/shell-collaborators.ts
    lib/shell-notices-wiring.tsx
    lib/site-url.ts
    lib/use-addons-redirect.hooks.ts
  `],
  ['apps/desktop/src/', 'Tovu desktop packaging, storage, launcher and speech bindings', `
    asar-verify.ts durable-json-file.ts node-toolchain-host.ts speech/speech-host-config.ts
  `],
  ['apps/website/src/contracts/core/', 'Host policy and values; neutral contracts can split to core', `
    gated-mutations/composition.ts gated-mutations/gateway.ts gated-mutations/token.ts
    runtime-mode.ts settings-vocabulary.ts theme-slots.ts tool-metadata/sites.ts
  `],
  ['apps/website/src/features/', 'Tool and service adapters bind product policy, catalog, transports or storage to Jini', `
    agent-plugins/access-token-tool.ts
    agent-plugins/executable-tools/host-bindings.ts
    agent-plugins/mail-adapter-registry.ts
    agent-plugins/search-provider-registry.ts
    agent-plugins/tool-registrations.ts
    agent-plugins/write-note-tool.ts
    api-connections/browser-binding.ts
    api-connections/host-bindings.ts
    comments/tool-registrations.ts
    consent/host-bindings.ts
    database-transfer/tool-registrations.ts
    deployments/deploy-config-registry.ts
    deployments/deploy-config.ts
    external-mcp/external-mcp-host-copy.ts
    forms/tool-registrations.ts
    identity/repo.sqlite.ts
    media/tool-registrations.ts
    plugin-runtime/agent-plugin-tool-binding.ts
    plugin-runtime/host-binding.ts
    plugin-runtime/host-tool-binding.ts
    plugin-runtime/install-tool-binding.ts
    plugin-runtime/install-tool.ts
    plugin-runtime/plugin-host-copy.ts
    recovery/gated-hooks.ts
    source-control/write-port.ts
    taxonomy/gated-hooks.ts
  `],
  ['apps/website/src/features/', 'Tovu publish, share, editor and site policy or adapter', `
    post/search-host-config.ts
    post/tiptap-doc-schema.ts
    publish-content/ui/host-binding.ts
    publish-content/ui/sections.ts
    publish-trust/host-settings.ts
    site-backup/archive-media.ts
    site-backup/share-policy.ts
    site-backup/static-export-selection.ts
    site-export/export-failure-summary.ts
    site-inspection/admin-screens.generated.ts
    webmcp/published-html.ts
  `],
  ['apps/website/src/server/inbound/admin-http/', 'Host request ports, dependency projection, product routes and mounts', `
    admin-dev-proxy.ts admin-json-route-ports.ts admin-raw-route-ports.ts admin-request-facts.ts
    dev-auth.ts publish-trust-auth.ts
    routes/agent-plugins/deps.ts routes/api-keys/deps.ts routes/external-mcp/deps.ts
    routes/media/deps.ts routes/members/deps.ts routes/newsletter/deps.ts
    routes/plugins/local-installer.ts routes/publish-content/deps.ts routes/settings/deps.ts
    routes/sites/sites-home.ts routes/sites/warm-site-control.ts
    routes/system/site-key.ts routes/system/site-shares.ts
    routes/taxonomy/deps.ts routes/themes/explore.ts routes/themes/held-back.ts
    routes/themes/preview.ts routes/users/deps.ts
  `],
  ['apps/website/src/server/inbound/public-http/', 'Host Express mounts, assets, cookie and rendering policy', `
    http/site/site-chat-markup.ts
    middleware/canonical-site-host.ts middleware/published-webmcp.ts
    middleware/render-theme-override.ts middleware/theme-content-security-headers.ts
    middleware/theme-preview-switcher.ts middleware/theme-static-assets.ts
    routes/members/deps.ts routes/members/oidc-deps.ts
    routes/site/chat-comparison-html.ts routes/site/newsletter-deps.ts
    routes/site/pages/render-context/deps.ts routes/site/pages/request-policy.ts
  `],
  ['apps/website/src/platform/', 'Tovu HTML wire markers and process-scoped routing binding', `
    html/menu-render.ts html/published-webmcp-strip.ts routing/adapter.ts
  `],
].flatMap(([prefix, why, paths]) =>
  paths.trim().split(/\s+/).map(file => [
    new RegExp(`^${(prefix + file).replaceAll('.', '\\.')}$`), why,
  ]),
),
```

## Per-area count

`Open` is neither MOVE nor STAYS-HOST. The theme exclusion is the planner’s `theme` (88) and `adm-themes` (32). Theme-related paths counted in other areas were not silently dropped.

| Area | Counted | MOVE | STAYS-HOST | Open |
|---|---:|---:|---:|---:|
| adm-shell-components | 47 | 5 | 7 | 35 |
| adm-other | 167 | 7 | 54 | 106 |
| adm-deployment | 24 | 4 | 3 | 17 |
| adm-members | 6 | 0 | 3 | 3 |
| adm-pages | 19 | 0 | 3 | 16 |
| adm-posts | 40 | 2 | 14 | 24 |
| adm-publish-content | 13 | 0 | 1 | 12 |
| adm-recovery | 5 | 1 | 1 | 3 |
| adm-roles | 5 | 0 | 3 | 2 |
| adm-security | 29 | 1 | 4 | 24 |
| adm-source-control | 9 | 0 | 3 | 6 |
| adm-users | 4 | 0 | 3 | 1 |
| adm-shell-hooks | 13 | 1 | 2 | 10 |
| adm-shell-lib | 35 | 0 | 14 | 21 |
| desktop | 5 | 1 | 4 | 0 |
| contracts-core | 56 | 1 | 7 | 48 |
| contracts-headless | 5 | 1 | 0 | 4 |
| agent-plugins | 45 | 2 | 6 | 37 |
| analytics | 2 | 0 | 0 | 2 |
| api-connections | 14 | 0 | 2 | 12 |
| asset-transfer | 3 | 0 | 0 | 3 |
| comments | 3 | 0 | 1 | 2 |
| consent | 4 | 0 | 1 | 3 |
| content-duplication | 1 | 1 | 0 | 0 |
| content-types | 4 | 0 | 0 | 4 |
| custom-credentials | 15 | 1 | 0 | 14 |
| database | 5 | 1 | 0 | 4 |
| database-transfer | 9 | 0 | 1 | 8 |
| deployments | 28 | 1 | 2 | 25 |
| email-templates | 2 | 1 | 0 | 1 |
| entries | 3 | 0 | 0 | 3 |
| external-mcp | 11 | 1 | 1 | 9 |
| form-destinations | 4 | 0 | 0 | 4 |
| forms | 8 | 0 | 1 | 7 |
| fs-files | 4 | 1 | 0 | 3 |
| identity | 13 | 1 | 1 | 11 |
| image-transform | 1 | 0 | 0 | 1 |
| mail | 2 | 0 | 0 | 2 |
| mail-status | 4 | 1 | 0 | 3 |
| media | 13 | 0 | 1 | 12 |
| media-generation | 3 | 0 | 0 | 3 |
| media-import | 1 | 0 | 0 | 1 |
| member-login | 4 | 0 | 0 | 4 |
| members | 3 | 0 | 0 | 3 |
| navigation | 4 | 0 | 0 | 4 |
| newsletter | 8 | 0 | 0 | 8 |
| object-storage | 2 | 0 | 0 | 2 |
| observability | 1 | 0 | 0 | 1 |
| pages | 8 | 0 | 0 | 8 |
| permanent-delete | 1 | 0 | 0 | 1 |
| plugin-runtime | 21 | 0 | 6 | 15 |
| post | 30 | 0 | 2 | 28 |
| presentation | 3 | 0 | 0 | 3 |
| project-keys | 8 | 0 | 0 | 8 |
| publish-content | 32 | 7 | 0 | 25 |
| publish-content-ui | 4 | 0 | 2 | 2 |
| publish-trust | 6 | 0 | 1 | 5 |
| recovery | 3 | 0 | 1 | 2 |
| redirects | 1 | 0 | 0 | 1 |
| seo | 1 | 0 | 0 | 1 |
| server-logs | 1 | 0 | 0 | 1 |
| settings | 9 | 0 | 0 | 9 |
| site-backup | 38 | 3 | 3 | 32 |
| site-export | 10 | 0 | 1 | 9 |
| site-inspection | 5 | 0 | 1 | 4 |
| site-search | 1 | 0 | 0 | 1 |
| skills | 2 | 0 | 0 | 2 |
| source-control | 12 | 0 | 1 | 11 |
| taxonomy | 4 | 0 | 1 | 3 |
| tool-audit | 1 | 0 | 0 | 1 |
| trash | 14 | 0 | 0 | 14 |
| vendor-credentials | 6 | 0 | 0 | 6 |
| web | 3 | 0 | 0 | 3 |
| web-screenshot | 2 | 0 | 0 | 2 |
| webhooks | 8 | 0 | 0 | 8 |
| webmcp | 1 | 0 | 1 | 0 |
| widgets | 4 | 0 | 0 | 4 |
| platform-html | 3 | 1 | 2 | 0 |
| platform-mail | 5 | 0 | 0 | 5 |
| platform-routing | 1 | 0 | 1 | 0 |
| admin-http | 71 | 6 | 24 | 41 |
| public-http | 95 | 6 | 13 | 76 |
| **Total** | **1,120** | **58** | **203** | **859** |

## Individual exceptions and MOVE ledger

Path prefixes below are `a/` = `apps/admin/src/`, `d/` = `apps/desktop/src/`, and `c/`, `w/`, `p/`, `r/` = `apps/website/src/{contracts,features,platform,server/inbound}/`, respectively. MOVE counts a file with substantive Jini-bound behavior even when it needs a K1–K5 split. It does not send the host residue to Jini or endorse the planner’s destination for domain screens.

| File | Verdict | Reason |
|---|---|---|
| `a/components/AssistantDock/AssistantDock.tsx` | MOVE | Owns the dock view and interaction layout, so inject the host controller. |
| `a/components/AssistantDock/DockChatPane.tsx` | MOVE | Owns chat-pane rendering and slots, beyond mounting a component. |
| `a/components/AssistantDock/assistant-dock-props.tsx` | MOVE | Implements prop projection for chat execution and optional behavior. |
| `a/components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts` | STAYS-HOST | Assembles this host’s renderer cards, proxy, actions and redaction. |
| `a/components/EmbedInsertControl/EmbedInsertControl.tsx` | MOVE | Implements shared embed selection and insertion controls. |
| `a/components/MediaEditDialog/MediaEditDialog.tsx` | MOVE | Implements dialog fields and actions, with edit behavior injectable. |
| `a/features/deployment/OverviewTab.tsx` | MOVE | Renders deployment status, blockers and environment rows. |
| `a/features/deployment/StaticSiteTab.tsx` | MOVE | Implements publish interface and state-dependent actions. |
| `a/features/deployment/deployment-host-i18n.ts` | STAYS-HOST | Supplies product-specific deployment wording to the Jini translator. |
| `a/features/deployment/hooks/static-export-port.hooks.ts` | MOVE | Declares a portable export controller port, without a live binding. |
| `a/features/deployment/hooks/static-publish-port.hooks.ts` | MOVE | Declares the portable publish controller port. |
| `a/features/email/EmailTemplateEditor.tsx` | MOVE | Owns editing, preview and dirty-state UI. |
| `a/features/library/Library.tsx` | MOVE | Owns table, preview and row actions beyond the host controller binding. |
| `a/features/media/Media.tsx` | MOVE | Implements the media-library UI and editing interactions. |
| `a/features/plugins/PluginRow.tsx` | MOVE | Implements domain row actions and disclosures. |
| `a/features/plugins/Plugins.tsx` | MOVE | Implements plugin management UI and flow. |
| `a/features/plugins/installed-skills-composer-source.ts` | MOVE | Implements conditional snapshots and capability projection, with HTTP injected. |
| `a/features/posts/PostEditor.tsx` | STAYS-HOST | Composes the held TipTap editor and its local controls. |
| `a/features/posts/Posts.tsx` | MOVE | Content list and notices are reusable apart from the editor. |
| `a/features/posts/editor/preview/PostPreviewFrame.tsx` | MOVE | Preview iframe behavior stands apart from TipTap, with the theme refresh hook injected. |
| `a/features/recovery/Recovery.tsx` | MOVE | Implements recovery timeline and restore UI. |
| `a/features/security/Security.tsx` | MOVE | Implements the security screen and conditional sections. |
| `a/features/settings/SettingsUi.tsx` | MOVE | Implements settings fields and behavior beyond mount wiring. |
| `a/hooks/use-admin-locale.hooks.ts` | MOVE | Owns query, invalidation and locale lifecycle, with the default host port split off. |
| `a/lib/admin-http/request.ts` | STAYS-HOST | Binds `createAdminHttp` to Tovu’s errors, redaction, reconnect and failure channel. |
| `d/desktop-memory-sampler.ts` | MOVE | Implements metric selection and fallback, with collection injected. |
| `d/durable-json-file.ts` | STAYS-HOST | Binds Jini’s durable JSON implementation to desktop storage. |
| `c/core/tool-metadata/comments.ts` | MOVE | Declares portable comment tool metadata and approval classes. |
| `c/headless/plugin-install-source.ts` | MOVE | Shared install input schema and ports move, with host-facing descriptions supplied separately. |
| `w/agent-plugins/connect-tool.ts` | MOVE | Still implements the connection workflow and its outcomes. |
| `w/agent-plugins/install-tool.ts` | MOVE | Owns install and update orchestration, not just registration. |
| `w/comments/tool-registrations.ts` | STAYS-HOST | Projects host deps and adds local content-read vocabulary to Jini registrations. |
| `w/content-duplication/tool-registrations.ts` | MOVE | Implements resource dispatch, validation and result handling. |
| `w/custom-credentials/tool-registrations.ts` | MOVE | Contains credential-flow handling beyond the registrar. |
| `w/database/tool-registrations.ts` | MOVE | Implements migration ceremony and tool adaptation. |
| `w/deployments/tool-registrations.ts` | MOVE | Implements export options, startup and outcomes beyond mount glue. |
| `w/email-templates/tool-registrations.ts` | MOVE | Owns tool permission and operation handling. |
| `w/external-mcp/tool-registrations.ts` | MOVE | Owns tool parsing, connection-state handling and results. |
| `w/fs-files/tool-registrations.ts` | MOVE | Implements file-operation preparation and confirmation. |
| `w/identity/tool-registrations.ts` | MOVE | Implements schema projection and reference handling beyond binding. |
| `w/mail-status/tool-registrations.ts` | MOVE | Implements provider selection and test-send confirmation behavior. |
| `w/plugin-runtime/install-tool.ts` | STAYS-HOST | Delegates to `buildPluginInstallRegistrations` with Tovu’s install binding. |
| `w/publish-content/apply-row.ts` | MOVE | Owns row application and baseline refresh. |
| `w/publish-content/gated-hooks.ts` | MOVE | Implements import planning, restore-point creation and apply orchestration. |
| `w/publish-content/peers.ts` | MOVE | Move the peer CRUD and credential handling after splitting Tovu policy. |
| `w/publish-content/plan-rows.ts` | MOVE | Implements row comparisons against baseline state. |
| `w/publish-content/raw-row-contributor.ts` | MOVE | Implements row identity and contributor behavior, with table policy injected. |
| `w/publish-content/repo-handler.ts` | MOVE | Implements generic repo-backed handler mechanics and field mapping. |
| `w/publish-content/tool-deps.ts` | MOVE | Carries the publish tool collaboration contract, with host binding left out. |
| `w/site-backup/backup-service.ts` | MOVE | Owns backup planning, provider selection and push orchestration. |
| `w/site-backup/import-backend.ts` | MOVE | Owns import session and upload lifecycle beyond parsing delegation. |
| `w/site-backup/share-policy.ts` | STAYS-HOST | Site-specific allowlists, limits and copy stay, with neutral refusals split out. |
| `w/site-backup/share-service.ts` | MOVE | Owns artifact delivery, receipt and share-result construction. |
| `p/html/safe-url.ts` | MOVE | Implements reusable image URL and video ID validation. |
| `p/routing/adapter.ts` | STAYS-HOST | Creates one Jini router with the host publication gate and logging. |
| `r/admin-http/owner-mfa-routes.ts` | MOVE | Owns enrollment parsing, origin and rate handling for a K1 spec. |
| `r/admin-http/owner-passkey-routes.ts` | MOVE | Owns passkey ceremony handling, with relying-party identity injected. |
| `r/admin-http/owner-recovery-routes.ts` | MOVE | Owns recovery admission and result mapping, with desktop reset as a host port. |
| `r/admin-http/routes/forms/authoring.ts` | MOVE | Builds the authoring write request and handles the response. |
| `r/admin-http/routes/forms/create.ts` | MOVE | Defines the form-creation request and result behavior. |
| `r/admin-http/routes/system/site-imports.ts` | MOVE | Owns the upload and import wire workflow, with abort and placement seams injected. |
| `r/admin-http/routes/system/site-shares.ts` | STAYS-HOST | Remaining download and artifact upload paths bind host trust and socket behavior. |
| `r/admin-http/routes/themes/held-back.ts` | STAYS-HOST | Mounts existing specs and supplies the Tovu quarantine and restore hooks. |
| `r/public-http/http/site/render-site.ts` | MOVE | Implements rendering across tiers, with theme and host collaborators injected. |
| `r/public-http/middleware/canonical-site-host.ts` | STAYS-HOST | Jini decides eligibility and destination, Express applies the redirect. |
| `r/public-http/middleware/site-serving-gate.ts` | MOVE | Implements request gating and bypass decisions, with host policy injected. |
| `r/public-http/routes/members/oidc-start.ts` | MOVE | Owns redirect, binding-cookie and refusal behavior for a K1 spec. |
| `r/public-http/routes/members/password-sign-in.ts` | MOVE | Owns password sign-in request handling and result mapping. |
| `r/public-http/routes/site/feed.ts` | MOVE | Defines feed request and response behavior around the injected feed generator. |
| `r/public-http/routes/site/product-checkout.ts` | MOVE | Implements readiness, shop-origin routing and markup insertion. |

## NOT-CHECKED

This is the exact residual set, expressed as a filter to avoid printing 859 paths. Take the union of `blocked.json` source paths and the ready step-sheet `Tovu source` rows. Remove `theme` and `adm-themes`, remove paths matched by the proposed KEEP rules, and remove the 58 MOVE paths in the ledger. **Every remaining path is NOT-CHECKED**, including `a/features/pages/PageEditor.tsx`, for which I did not obtain usable source in the lookup pass.

| Residual paths | NOT-CHECKED |
|---|---:|
| `a/**` | 280 |
| `c/**` | 52 |
| `w/**` | 405 |
| `p/**` | 5 |
| `r/**` | 117 |
| `d/**` | 0 |
| **Total** | **859** |

Do not turn the unresolved paths into a default MOVE rule. In particular, `tool-registrations.ts` and route directories contained both host bindings and reusable implementations in the files I checked. No files were changed.
