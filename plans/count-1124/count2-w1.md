COUNT r62t-count2-w1 PARTIAL: MOVE 80 / STAYS-HOST 134

Of 457 residual paths at `caa3ac7811`, I classified 214 and left 243 NOT-CHECKED. These are new verdicts beyond Part 1. I used its blocked-plus-ready inventory, removed its theme exclusions, KEEP matches, and prior MOVE verdicts, then applied the `apps/website/src/m` cutoff. I opened 223 distinct source paths. Nine of those did not yield a firm verdict. No files were changed and no verification jobs were run.

The planner’s ready flag did not settle ownership. `analytics/salt-context.ts` pins bytes that preserve existing visitor hashes, so it stays. `content-types/publish-content.ts` still decides when to create, update, and transition a schema, so that behavior moves while seeded keys and host permissions stay.

## 1. Extra KEEP_RULES

These are exact brace globs relative to `apps/website/src/`. The `features/` prefix applies to every row after the first five. Anchor each expansion at both ends if compiling to regex. A local barrel counted here is **not** a new re-export shell. Delete it once its last host consumer is repointed.

| Glob | Reason |
|---|---|
| `contracts/core/{agent-permission-mode,assistant-run-events,consent-refusal,custom-credential-categories,page-html,plugin-credential-card,public-page-security-headers,renamed-bundled-plugin-ids,theme-ids,tool-failure-diagnostics}.ts` | Host runtime defaults, notices, consent choices, vocabulary, markup and header policy, bundled IDs, and diagnostic bindings |
| `contracts/core/events/{outbox-drainer,outbox-retry-policies,outbox-worker}.ts` | Bind process scheduling, reporting, and the site’s event retry table to Jini’s outbox |
| `contracts/core/{entry-refs/unindexed-ref-warning,gated-mutations/ports,rate-limit/rate-limit}.ts` | Host warning sink, restore/mirror boundary, rate profiles, and trust-proxy policy |
| `contracts/core/tool-metadata/{content-read,index,site-guide}.ts` | Host read-card IDs, catalog assembly, and Tovu guide copy |
| `contracts/headless/{assistant-permanent-deletes-policy,assistant-tool-approval-policy,index,secret-form-cards}.ts` | Host admission/UI vocabulary, admin destinations, secret-form projection, and local barrel |
| `agent-plugins/{admin-surfaces/issued-sign-ins,admin-surfaces/public-config,admin-surfaces/surfaces,bundled-catalog,bundled-contribution-sources,bundled-id-upgrade,executable-tools/approval,executable-tools/register,lifecycle,mcp-host-bindings}.ts` | Bind the published domains to host URLs, environment, catalog, lifecycle ABI, and MCP projections |
| `analytics/{salt-context,warn}.ts` | Preserve existing hash context, console channel, and log prefix |
| `api-connections/{byo-client,connect-bindings,connect,host,plugin-state-bindings,plugin-state,surface-connection-bindings,surface-connections}.ts` | Inject host vault scope, exact copy, browser links, and surface collaborators |
| `asset-transfer/asset-sources.ts` | Select host roots and permissions over the shared guarded reader |
| `comments/index.ts` | Bind the site’s comments defaults and rate profile |
| `consent/privacy-defaults-reporter.ts` | Bind the host’s redaction policy and console channel |
| `content-types/{content-type-repo,tool-registrations,write-service}.ts` | Bind tables, reserved routes, and host tool metadata/error presentation |
| `custom-credentials/{custom-credential-repo,index,plugin-credential-card,repo.memory,types,vault-repo}.ts` | Bind the existing credential-set owner to host categories, vault scope, stores, and card errors |
| `database-transfer/{copy-engine,destination-exchange,destination-repo,destination-ui,exclusions,table-catalog}.ts` | Preserve host database identifiers, exclusion policy, catalog, and credential-card presentation |
| `database/{agent-tools,db-messages}.ts` | Bind Tovu’s database tool wording to the shared catalog |
| `deployments/{export-run-binding,index,static-publish/publish-consent}.ts` | Own the process singleton, local entry point, and consent refusal binding |
| `entries/{entry-repo,unreadable-owner-entries-repair}.ts` | Bind the host’s tables, access invalidation, and one-time boot repair |
| `external-mcp/{contracts,external-mcp-repo.sqlite,external-mcp-revocation}.ts` | Bind canonical contracts to host types, kernel, and exact revocation copy |
| `form-destinations/registry.ts` | Compose the shared plugin loader and forms registry at the host |
| `forms/{form-file-maintenance,form-file-purge,index,submission-ip-expiry-sweep,submission-ip-retention}.ts` | Bind local ownership tables, editor slugs, submission-store lifetime, outbox, and retention reporting |
| `fs-files/{fs-files,layout}.ts` | Bind guarded I/O to host roots, listing limits, and exclusions |
| `identity/{api-key-binding,boot-session-token-binding,default-credential-exposure,first-owner-password,trash-user-binding,wiring}.ts` | Own host key format, process stores, seed policy, and identity composition |
| `mail/index.ts` | Bind the persisted Tovu mail label prefix |
| `media/{large-upload-routing,media-provider-credential-repo}.ts` | Bind host tool names/upload guidance and the host credential store |
| `member-login/index.ts` | Local member-login barrel |
| `members/{mail-transport,repo.sqlite}.ts` | Bind Jini members to the host mail transport, tables, and kernel |
| `navigation/{migrate-footer-page-links,page-target-resolver,tool-registrations}.ts` | Own seed repair, public-path lookup, and the host registration overlay |
| `newsletter/repo.sqlite.ts` | Bind newsletter repos to host tables, kernel, and reporting |
| `object-storage/media-store.ts` | Bind host media-store settings, environment, and egress |
| `observability/test-error-message.ts` | Tovu telemetry test message |
| `pages/html-document-store.sqlite.ts` | Bind the shared document store to the host kernel |
| `plugin-runtime/repo.sqlite.ts` | Bind the activation repo to the host kernel and tables |
| `post/{contracts,index,post-schema-binding,read-model}.ts` | Host schema vocabulary and local exports, not independent implementations |
| `presentation/{index,repo.sqlite,set-active-theme}.ts` | Host presentation exports, table binding, and theme-selection tracking |
| `publish-content/{publish-content-peer-repo,publish-content-peer-repo.sqlite,ui/index,ui/policy}.ts` | Host vault/kernel facades and the Publish dialog’s product sections, limits, and copy |
| `redirects/repo.sqlite.ts` | Bind the generic repo to host tables and connection |
| `seo/index.ts` | Bind site settings, routing, posts, and media to Jini SEO |
| `server-logs/process-source.ts` | Adapt the host process log source |
| `settings/{site-timezone-fallback,site-title-legacy,site-title-reporter}.ts` | Bind legacy title bytes and site-local diagnostic reporters |
| `site-backup/bundled-export-file-policy.ts` | Resolve host-selected package roots for Jini’s byte comparison |
| `site-export/{theme-preview-manifest,theme-preview-report}.ts` | Bind the Tovu theme switcher and preview report contract |
| `site-search/cms-search-rules.ts` | Host CMS document and access rules for Jini search |
| `skills/{install-adapters,site-host}.ts` | Bind installed archive/YAML implementations, filesystem, and lifecycle logging |
| `source-control/{provider-kit-host,source-control-credential-repo.sqlite}.ts` | Bind egress classification and tracing, plus the host SQLite facade |
| `tool-audit/repo.sqlite.ts` | Bind audit tables, decoding, and append-failure logging |
| `trash/agent-delete-policy.ts` | Project the host’s permanent-delete IDs |
| `vendor-credentials/{index,vendor-credential-repo,vendor-credential-repo.sqlite}.ts` | Local exports and vault/kernel binding |
| `web/{agent-tools,web-page}.ts` | Bind assistant permission, user agent, and guarded request port to Jini |
| `webhooks/wire-headers.ts` | Preserve Tovu’s outbound header names |
| `widgets/{media-html-log,tool-registrations}.ts` | Bind host diagnostics, route dependencies, and read vocabulary to Jini |

## 2. Per-area count

| Area | Total | MOVE | STAYS-HOST | NOT-CHECKED |
|---|---:|---:|---:|---:|
| contracts-core | 48 | 29 | 19 | 0 |
| contracts-headless | 4 | 0 | 4 | 0 |
| agent-plugins | 37 | 0 | 10 | 27 |
| analytics | 2 | 0 | 2 | 0 |
| api-connections | 12 | 3 | 8 | 1 |
| asset-transfer | 3 | 2 | 1 | 0 |
| comments | 2 | 1 | 1 | 0 |
| consent | 3 | 2 | 1 | 0 |
| content-types | 4 | 1 | 3 | 0 |
| custom-credentials | 14 | 1 | 6 | 7 |
| database-transfer | 8 | 2 | 6 | 0 |
| database | 4 | 2 | 2 | 0 |
| deployments | 25 | 1 | 3 | 21 |
| email-templates | 1 | 0 | 0 | 1 |
| entries | 3 | 0 | 2 | 1 |
| external-mcp | 9 | 3 | 3 | 3 |
| form-destinations | 4 | 2 | 1 | 1 |
| forms | 7 | 0 | 5 | 2 |
| fs-files | 3 | 1 | 2 | 0 |
| identity | 11 | 4 | 6 | 1 |
| image-transform | 1 | 1 | 0 | 0 |
| mail-status | 3 | 3 | 0 | 0 |
| mail | 2 | 1 | 1 | 0 |
| media-generation | 3 | 3 | 0 | 0 |
| media-import | 1 | 1 | 0 | 0 |
| media | 12 | 0 | 2 | 10 |
| member-login | 4 | 3 | 1 | 0 |
| members | 3 | 1 | 2 | 0 |
| navigation | 4 | 1 | 3 | 0 |
| newsletter | 8 | 0 | 1 | 7 |
| object-storage | 2 | 1 | 1 | 0 |
| observability | 1 | 0 | 1 | 0 |
| pages | 8 | 0 | 1 | 7 |
| permanent-delete | 1 | 1 | 0 | 0 |
| plugin-runtime | 15 | 0 | 1 | 14 |
| post | 28 | 0 | 4 | 24 |
| presentation | 3 | 0 | 3 | 0 |
| project-keys | 8 | 1 | 0 | 7 |
| publish-content | 25 | 3 | 2 | 20 |
| publish-content-ui | 2 | 0 | 2 | 0 |
| publish-trust | 5 | 0 | 0 | 5 |
| recovery | 2 | 1 | 0 | 1 |
| redirects | 1 | 0 | 1 | 0 |
| seo | 1 | 0 | 1 | 0 |
| server-logs | 1 | 0 | 1 | 0 |
| settings | 9 | 0 | 3 | 6 |
| site-backup | 32 | 2 | 1 | 29 |
| site-export | 9 | 0 | 2 | 7 |
| site-inspection | 4 | 0 | 0 | 4 |
| site-search | 1 | 0 | 1 | 0 |
| skills | 2 | 0 | 2 | 0 |
| source-control | 11 | 0 | 2 | 9 |
| taxonomy | 3 | 0 | 0 | 3 |
| tool-audit | 1 | 0 | 1 | 0 |
| trash | 14 | 0 | 1 | 13 |
| vendor-credentials | 6 | 0 | 3 | 3 |
| web-screenshot | 2 | 2 | 0 | 0 |
| web | 3 | 1 | 2 | 0 |
| webhooks | 8 | 0 | 1 | 7 |
| widgets | 4 | 0 | 2 | 2 |
| **Total** | **457** | **80** | **134** | **243** |

## 3. MOVE file list and Jini destinations

Source names are relative to the listed `features/<area>/`, except the `contracts/core` rows. Destinations are source-tree paths. A directory destination retains the source basename. MOVE counts the source once even where a K3–K5 split leaves host copy, policy, or adapters behind.

| Area | Files | Jini destination |
|---|---|---|
| contracts-core | `approval-i18n.ts`, `human-confirm.ts`, `native-approval-memory.ts` | `packages/core/src/approvals/` |
| contracts-core | `chat-delete-grant.ts` | `packages/chat/src/core/chat-delete-grant.ts` |
| contracts-core | `operator-locale.ts` | `packages/core/src/settings/operator-locale.ts` |
| contracts-core tool metadata | `tool-metadata/{agent-pause,agent-plugins,assistant,commerce,custom-credentials,frontend-control,fs-files,media-generation,permanent-delete,plugin-runtime,recovery,redirects,search,seo,settings,site-evidence,site-inspection,site-update,trash,visitor-tools,web-screenshot,web,webhooks,widgets}.ts` | `packages/core/src/tool-metadata/` |
| api-connections | `bundled-client-namespace.ts`, `contribution.ts`, `shared-owner.ts` | `packages/integrations/src/api-connections/` |
| asset-transfer | `asset-destinations.ts`, `copy-tool.ts` | `packages/cms/src/asset-transfer/` |
| comments | `public-markers.ts` | `packages/cms/src/comments/site/` |
| consent | `request.ts`, `revisions.repo.ts` | `packages/cookie-consent/src/site/` |
| content-types | `publish-content.ts` | `packages/cms/src/content-types/site/` |
| custom-credentials | `publish-compatibility-port.ts` | `packages/core/src/contracts/site/publish-compatibility-port.ts` |
| database-transfer | `confirmation-ui.ts`, `destination-store.ts` | `packages/db/src/transfer/` |
| database | `adapter.sqlite.ts` | `packages/core/src/contracts/site/database-introspection.ts` |
| database | `repo.memory.ts` | `packages/db/src/site/` |
| deployments | `deploy-targets/host-kit.ts` | `packages/devops/src/deploy/site/deploy-targets/host-kit.ts` |
| external-mcp | `deps.ts` | `packages/core/src/contracts/site/external-mcp-tool-ports.ts` |
| external-mcp | `external-mcp-repo.ts`, `external-mcp-repo.writes.ts` | `packages/mcp/src/external/` |
| form-destinations | `connection-port.ts`, `port.ts` | `packages/cms/src/forms/destinations/` |
| fs-files | `agent-tools.ts` | `packages/cms/src/fs-files/` |
| identity | `permission-list-tool.ts`, `repo.authentication.ts`, `repo.authorization.ts`, `repo.ts` | `packages/user-management/src/identity/` |
| image-transform | `tool.ts` | `packages/cms/src/media/site-transform/` |
| mail-status | `delivery-tool-registrations.ts`, `provider-operations.ts`, `provider-tool-registrations.ts` | `packages/platform/src/mail/site/status/` |
| mail | `capture-clear.ts` | `packages/platform/src/mail/site/` |
| media-generation | `provider-credential-save.ts`, `providers-tools.ts`, `tool-registrations.ts` | `packages/cms/src/media/site-generation/` |
| media-import | `tool-registrations.ts` | `packages/cms/src/media/site-import/` |
| member-login | `credentials.ts`, `providers.ts`, `ready-providers.ts` | `packages/user-management/src/member-login/` |
| members | `tool-registrations.ts` | `packages/user-management/src/members/` |
| navigation | `publish-content.ts` | `packages/cms/src/navigation/site/` |
| object-storage | `artifact-provider.ts` | `packages/platform/src/object-store/site/` |
| permanent-delete | `tool-registrations.ts` | `packages/cms/src/trash/permanent/` |
| project-keys | `site-sealer.ts` | `packages/integrations/src/secrets/site-sealer.ts` |
| publish-content | `content-references.ts`, `idempotency.ts`, `report-labels.ts` | `packages/cms/src/publish/content/` |
| recovery | `tool-registrations.ts` | `packages/db/src/recovery/` |
| site-backup | `static-download-landing.ts`, `static-download-layout.ts` | `packages/devops/src/backup/site/` |
| web-screenshot | `agent-tools.ts`, `tool-registrations.ts` | `packages/diagnostics/src/web-evidence/web-screenshot/` |
| web | `tool-registrations.ts` | `packages/platform/src/web/` |

The metadata moves are for the reusable declarations, not the host catalog. Keep host-only tool IDs, provider examples, and product wording at the host seam. Likewise, the deploy kit moves its timeout and reachability mechanics, not Tovu’s fetch, tracing, or egress binding. The SQL owners move query/write behavior behind structural inputs without moving Tovu’s generated schema types into core.

## 4. NOT-CHECKED list

All names below are relative to `apps/website/src/features/<area>/`. These 243 paths have no verdict. This includes the nine whose source I opened without settling the host/package split.

| Area | Exact residual files |
|---|---|
| agent-plugins | `activation-effects.ts`, `apply-connect-defaults.ts`, `apply-tool-renames.ts`, `automatic-agent-plugins.ts`, `connect-destination.ts`, `connect-sign-in-wait.ts`, `customize-tool.ts`, `enable-access.ts`, `exports/diagnostics.ts`, `exports/runtime.ts`, `exports/source.ts`, `federate-mcp.ts`, `grant-signed-in-defaults.ts`, `host-tool-ports.ts`, `import-access-token.ts`, `install-upload.ts`, `layout.ts`, `memory-tools.ts`, `memory.ts`, `new-site-agent-plugin-tokens.ts`, `provider-plugin-link.ts`, `set-enabled.ts`, `soon-lock.ts`, `switch-on-saved-token.ts`, `token-sign-in.ts`, `uninstall-confirmation-ui.ts`, `update-effects.ts` |
| api-connections | `vault-stores.ts` |
| custom-credentials | `agent-tools.ts`, `credential-copy-tool.ts`, `credential-save-tool.ts`, `credentialed-request.ts`, `delete-request-confirmation-ui.ts`, `store.ts`, `write-files-validation.ts` |
| deployments | `capability-card.ts`, `deploy-ops/{agent-tools,registry,run-ops,secrets,tool-registrations,typed-secret-card}.ts`, `deploy-targets/registry.ts`, `publish-agent-tools.ts`, `publish-credentials/{compatibility-port,index,store}.ts`, `publish-tool-deps.ts`, `static-publish/{adapter,credentials,domain-publish-tool,index,inspection,publish-history,publish-run,verify}.ts` |
| email-templates | `operations.ts` |
| entries | `publish-content.ts` |
| external-mcp | `external-mcp-oauth.ts`, `external-mcp-store.ts`, `external-mcp-vault.ts` |
| form-destinations | `key-store.ts` |
| forms | `protect-existing-files.ts`, `publish-content.ts` |
| identity | `user-purge.ts` |
| media | `index.ts`, `library-save-attachment.ts`, `promote-chat-attachment.ts`, `provider-credential-store.memory.ts`, `provider-credential-store.ts`, `provider-credential-vault.ts`, `publish-content.ts`, `read-chat-attachment.ts`, `verify-published-media.ts`, `view-video-tool.ts` |
| newsletter | `agent-tools.ts`, `confirmation.ts`, `delivery/tool-registrations.ts`, `deps-builders.ts`, `http-error-responses.ts`, `subscriptions.ts`, `tool-registrations.ts` |
| pages | `agent-tools.ts`, `html-document-store.memory.ts`, `html-document-store.ts`, `index.ts`, `permissions.ts`, `skeleton.ts`, `tool-registrations.ts` |
| plugin-runtime | `built-ins/content-analyzer/{analyze-content,index,plugin}.ts`, `built-ins/word-count/index.ts`, `capability-tool-registrations.ts`, `declarative-content-types.ts`, `install-archive.ts`, `install-source.ts`, `install.ts`, `provider-status-tool.ts`, `service-ports.ts`, `source-tools.ts`, `tool-registrations.ts`, `widget-partials.ts` |
| post | `agent-hold.ts`, `agent-tools.ts`, `content-stats-tool.ts`, `post-create.ts`, `post-retire.ts`, `post-tool-{delete,deps,duplicate,input,list,policy,update,view-deps}.ts`, `post-trash.ts`, `post-update.ts`, `preview-tool.ts`, `publish-content.ts`, `repo.memory.ts`, `repo.rows.ts`, `repo.ts`, `reverters.ts`, `search-index.memory.ts`, `template-options.ts`, `tool-registrations.ts` |
| project-keys | `attached-vault.ts`, `attachments.ts`, `create-vault.ts`, `service.ts`, `shared-oauth-disconnect.ts`, `site-references.ts`, `tools.ts` |
| publish-content | `apply-failure.ts`, `apply-report.ts`, `apply-run.ts`, `backstop-preview.ts`, `backstop-service.ts`, `connect-destination.ts`, `destination-credential.ts`, `disconnect-tool.ts`, `export-bundle.ts`, `file-tree-policy.ts`, `peer-transport.ts`, `permissions.ts`, `planner.ts`, `publish-backstop-file.ts`, `publish-backstop-row.sqlite.ts`, `publish-tool.ts`, `pull.ts`, `push-plan.ts`, `raw-file-contributor.ts`, `tool-registrations.ts` |
| publish-trust | `challenge.ts`, `connect.ts`, `handshake-client.ts`, `publish-trust-revocations.ts`, `session.ts` |
| recovery | `capability-card.ts` |
| settings | `index.ts`, `repo.sqlite.ts`, `settings-write-policies.ts`, `tool-registrations.ts`, `visitor-tools-agent-tools.ts`, `visitor-tools-permissions.ts` |
| site-backup | `archive-extensions.ts`, `archive-manifest.ts`, `download-html-source-edits.ts`, `import-{backend-steps,database,keep-off,plugin-state,registry,restore-placement,restore,verifier-inventory,verifier-projection,verifier}.ts`, `package-file-inventory.ts`, `plan-content.ts`, `push-content.ts`, `saved-keys.ts`, `share-backend.ts`, `share-database/repo.sqlite.ts`, `share-{file-policy,hosting,preparation-steps,preparation,registry,zip}.ts`, `sources.ts`, `static-copy.ts`, `static-site-packager.ts`, `tool-registrations.ts` |
| site-export | `export-html-policy.ts`, `export-preflight.ts`, `index.ts`, `media-original-urls.ts`, `route-manifest.ts`, `site-exporter.ts`, `static-security-headers.ts` |
| site-inspection | `agent-tools.ts`, `deps.ts`, `index.ts`, `tool-registrations.ts` |
| source-control | `commit-site.ts`, `credential-setup.ts`, `index.ts`, `provider-registry.ts`, `repo.memory.ts`, `source-control-credential-repo.ts`, `store.ts`, `tool-registrations.ts`, `types.ts` |
| taxonomy | `agent-tools.ts`, `publish-content.ts`, `tool-registrations.ts` |
| trash | `adapters/{media,member,post,redirect,user}.ts`, `db-port.ts`, `move-to-trash.ts`, `permissions.ts`, `registry.ts`, `repo.sqlite.ts`, `tool-kinds.ts`, `tool-registrations.ts`, `trash-item-tool.ts` |
| vendor-credentials | `repo.memory.ts`, `types.ts`, `vault-adapter.ts` |
| webhooks | `http.memory.ts`, `keyring.env.ts`, `seal-aad-invariant.ts`, `secret-scan-guard.ts`, `site-key-ensure.ts`, `site-key-sources.ts`, `tool-registrations.ts` |
| widgets | `deps.ts`, `publish-content.ts` |
