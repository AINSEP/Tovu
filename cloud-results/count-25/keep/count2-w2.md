COUNT r62t-count2-w2 PARTIAL: MOVE 115 / STAYS-HOST 91

I classified 206 of 252 residual feature files. The other 46 are NOT-CHECKED. I interpreted the `m` cutoff as applying to the path after `w/`, starting at `mail`. A literal comparison against `apps/website/src/m` would select zero `w/**` files because their full paths start with `apps/website/src/features/`.

The denominator is the union of blocked sources and ready step-sheet source rows, after removing Part 1’s KEEP matches, prior MOVE verdicts, and the theme exclusions. I used 208 source lookups and 32 input and setup lookups. No files were changed, and no tests, builds, installs, or type-checks ran.

## 1. Extra KEEP_RULES

All patterns below are anchored under `apps/website/src/features/`. Each line is an exact match or a brace glob that can be expanded into exact matches. None is a rule for an entire directory.

**Host barrels and forwarding shims.** Repoint consumers and delete a shim when it no longer has a host purpose. None should be recreated as a Jini re-export shell.

```text
{media,member-login,pages,post,presentation,site-export,site-inspection,source-control,vendor-credentials}/index.ts
post/{contracts,read-model}.ts
publish-content/ui/index.ts
```

**Host storage bindings.** These select Tovu’s kernel, tables, vault, or repo scope. For example, the member and newsletter facades bind the site schema to Jini query bodies. Preserve the media SQL adapter’s transaction and writer lock when repointing it.

```text
media/media-provider-credential-repo.ts
{members,newsletter,plugin-runtime,presentation,redirects,settings,tool-audit,trash}/repo.sqlite.ts
pages/html-document-store.sqlite.ts
publish-content/publish-content-peer-repo{,.sqlite}.ts
source-control/{repo.memory,source-control-credential-repo.sqlite}.ts
trash/db-port.ts
vendor-credentials/{repo.memory,vendor-credential-repo,vendor-credential-repo.sqlite}.ts
```

**Host registrars and factory bindings.** These supply metadata, copy, confirmation surfaces, or ports to implementations that already live in Jini. For example, taxonomy supplies the merge gateway and widgets supplies the site’s write ports. This is not a blanket keep for `tool-registrations.ts`.

```text
{navigation,settings,taxonomy,webhooks,widgets}/tool-registrations.ts
plugin-runtime/{capability-tool-registrations,declarative-content-types,provider-status-tool,source-tools,tool-registrations}.ts
```

**Product copy, vocabulary, and policy.** Keep Tovu’s persisted labels, wire names, tool names, grants, defaults, and private-path choices. Neutral contract fragments can still split under K4.

```text
mail/index.ts
media/large-upload-routing.ts
observability/test-error-message.ts
pages/{permissions,skeleton}.ts
plugin-runtime/{install,service-ports}.ts
post/{post-schema-binding,post-tool-view-deps}.ts
publish-content/permissions.ts
recovery/capability-card.ts
settings/{settings-write-policies,site-title-legacy,visitor-tools-agent-tools,visitor-tools-permissions}.ts
site-backup/share-file-policy.ts
trash/{agent-delete-policy,registry,tool-kinds}.ts
web/web-page.ts
webhooks/wire-headers.ts
widgets/media-html-log.ts
```

**Host composition and adapters.** These select the site’s collaborators or adapt Jini to the host’s process, runtime, or layout. For example, `object-storage/media-store.ts` binds `TOVU_MEDIA_BLOB_STORE`, while `site-backup/plan-content.ts` instantiates the host’s process-wide plan store.

```text
members/mail-transport.ts
newsletter/deps-builders.ts
object-storage/media-store.ts
plugin-runtime/built-ins/content-analyzer/{analyze-content,index}.ts
plugin-runtime/widget-partials.ts
seo/index.ts
server-logs/process-source.ts
settings/{index,site-timezone-fallback,site-title-reporter}.ts
site-backup/{bundled-export-file-policy,download-html-source-edits,plan-content}.ts
site-inspection/deps.ts
site-search/cms-search-rules.ts
skills/{install-adapters,site-host}.ts
source-control/{commit-site,provider-kit-host,provider-registry}.ts
widgets/deps.ts
```

**Tovu navigation, theme, and preview integration.** These bind the seeded footer, site router, theme roster, telemetry, archive placement, or preview URL policy. `set-active-theme.ts`, for example, calls the existing Jini write and adds host telemetry only when the theme changes.

```text
navigation/{migrate-footer-page-links,page-target-resolver}.ts
post/template-options.ts
presentation/set-active-theme.ts
site-backup/import-restore-placement.ts
site-export/{theme-preview-manifest,theme-preview-report}.ts
```

## 2. Per-area count

| Area | MOVE | STAYS-HOST | NOT-CHECKED |
|---|---:|---:|---:|
| mail | 1 | 1 | 0 |
| mail-status | 3 | 0 | 0 |
| media | 9 | 3 | 0 |
| media-generation | 3 | 0 | 0 |
| media-import | 1 | 0 | 0 |
| member-login | 3 | 1 | 0 |
| members | 1 | 2 | 0 |
| navigation | 1 | 3 | 0 |
| newsletter | 6 | 2 | 0 |
| object-storage | 1 | 1 | 0 |
| observability | 0 | 1 | 0 |
| pages | 4 | 4 | 0 |
| permanent-delete | 1 | 0 | 0 |
| plugin-runtime | 4 | 11 | 0 |
| post | 12 | 6 | 10 |
| presentation | 0 | 3 | 0 |
| project-keys | 6 | 0 | 2 |
| publish-content | 16 | 3 | 6 |
| publish-content-ui | 0 | 1 | 1 |
| publish-trust | 4 | 0 | 1 |
| recovery | 1 | 1 | 0 |
| redirects | 0 | 1 | 0 |
| seo | 0 | 1 | 0 |
| server-logs | 0 | 1 | 0 |
| settings | 0 | 9 | 0 |
| site-backup | 13 | 5 | 14 |
| site-export | 5 | 3 | 1 |
| site-inspection | 1 | 2 | 1 |
| site-search | 0 | 1 | 0 |
| skills | 0 | 2 | 0 |
| source-control | 4 | 6 | 1 |
| taxonomy | 2 | 1 | 0 |
| tool-audit | 0 | 1 | 0 |
| trash | 4 | 5 | 5 |
| vendor-credentials | 2 | 4 | 0 |
| web | 2 | 1 | 0 |
| web-screenshot | 2 | 0 | 0 |
| webhooks | 2 | 2 | 4 |
| widgets | 1 | 3 | 0 |
| **Total** | **115** | **91** | **46** |

## 3. MOVE files and Jini destinations

Each row maps exact files in the named area to a Jini destination directory. Filenames and listed subpaths carry over unless a K4 destination is called out. These are proposed destinations, not a check that the paths or exports already exist in Jini. MOVE counts the source file once when it owns substantive portable behavior, even if its host half stays.

| Area | Jini destination | Files |
|---|---|---|
| mail | `packages/user-management/src/mail/site/` | `capture-clear.ts` |
| mail-status | `packages/user-management/src/mail/status/` | `delivery-tool-registrations.ts`, `provider-operations.ts`, `provider-tool-registrations.ts` |
| media | `packages/cms/src/media/site/` | `library-save-attachment.ts`, `promote-chat-attachment.ts`, `provider-credential-store.memory.ts`, `provider-credential-store.ts`, `provider-credential-vault.ts`, `publish-content.ts`, `read-chat-attachment.ts`, `verify-published-media.ts`, `view-video-tool.ts` |
| media-generation | `packages/cms/src/media/site-generation/` | `provider-credential-save.ts`, `providers-tools.ts`, `tool-registrations.ts` |
| media-import | `packages/cms/src/media/site-import/` | `tool-registrations.ts` |
| member-login | `packages/user-management/src/member-login/` | `credentials.ts`, `providers.ts`, `ready-providers.ts` |
| members | `packages/user-management/src/members/` | `tool-registrations.ts` |
| navigation | `packages/cms/src/navigation/site/` | `publish-content.ts` |
| newsletter | `packages/user-management/src/newsletter/` | `agent-tools.ts`, `confirmation.ts`, `delivery/tool-registrations.ts`, `http-error-responses.ts`, `subscriptions.ts`, `tool-registrations.ts` |
| object-storage | `packages/platform/src/object-store/site/` | `artifact-provider.ts` |
| pages | `packages/cms/src/pages/` | `agent-tools.ts`, `html-document-store.memory.ts`, `html-document-store.ts`, `tool-registrations.ts` |
| permanent-delete | `packages/cms/src/trash/permanent/` | `tool-registrations.ts` |
| plugin-runtime | `packages/plugins/src/runtime/` | `built-ins/content-analyzer/plugin.ts`, `built-ins/word-count/index.ts`, `install-archive.ts`, `install-source.ts` |
| post | `packages/cms/src/posts/` | `agent-hold.ts`, `agent-tools.ts`, `content-stats-tool.ts`, `post-create.ts`, `post-tool-input.ts`, `post-tool-policy.ts`, `post-trash.ts`, `post-update.ts`, `preview-tool.ts`, `search-index.memory.ts`, `tool-registrations.ts` |
| post | `packages/core/src/contracts/site/cms-post-tools.ts` | Shared port slices from `post-tool-deps.ts`, not the full host deps bag |
| project-keys | `packages/user-management/src/project-keys/` | `attached-vault.ts`, `create-vault.ts`, `service.ts`, `site-references.ts`, `site-sealer.ts`, `tools.ts` |
| publish-content | `packages/cms/src/publish/content/` | `apply-failure.ts`, `apply-run.ts`, `backstop-preview.ts`, `backstop-service.ts`, `connect-destination.ts`, `content-references.ts`, `destination-credential.ts`, `disconnect-tool.ts`, `file-tree-policy.ts`, `idempotency.ts`, `peer-transport.ts`, `planner.ts`, `publish-backstop-file.ts`, `publish-tool.ts`, `pull.ts`, `report-labels.ts` |
| publish-trust | `packages/cms/src/publish/trust/` | `challenge.ts`, `connect.ts`, `publish-trust-revocations.ts`, `session.ts` |
| recovery | `packages/db/src/recovery/` | `tool-registrations.ts` |
| site-backup | `packages/devops/src/backup/site/` | `archive-manifest.ts`, `import-backend-steps.ts`, `import-registry.ts`, `import-restore.ts`, `package-file-inventory.ts`, `push-content.ts`, `share-hosting.ts`, `share-preparation-steps.ts`, `share-registry.ts`, `share-zip.ts`, `static-copy.ts`, `static-download-landing.ts`, `static-site-packager.ts` |
| site-export | `packages/devops/src/static-export/site/` | `export-html-policy.ts`, `export-preflight.ts`, `media-original-urls.ts`, `site-exporter.ts`, `static-security-headers.ts` |
| site-inspection | `packages/cms/src/site-inspection/` | `agent-tools.ts` |
| source-control | `packages/devops/src/source-control/site/` | `credential-setup.ts`, `store.ts`, `tool-registrations.ts` |
| source-control | `packages/core/src/contracts/site/source-control-credentials.ts` | Shared wire and repo-port contracts from `types.ts` |
| taxonomy | `packages/cms/src/taxonomy/site/` | `agent-tools.ts`, `publish-content.ts` |
| trash | `packages/cms/src/trash/site/` | `adapters/media.ts`, `adapters/member.ts`, `adapters/post.ts`, `move-to-trash.ts` |
| vendor-credentials | `packages/integrations/src/vendor-credentials/` | `vault-adapter.ts` |
| vendor-credentials | `packages/core/src/contracts/site/vendor-credentials.ts` | Shared record and repo-port contracts from `types.ts` |
| web | `packages/integrations/src/web/` | `agent-tools.ts`, `tool-registrations.ts` |
| web-screenshot | `packages/integrations/src/web-screenshot/` | `agent-tools.ts`, `tool-registrations.ts` |
| webhooks | `packages/integrations/src/webhooks/site/` | `http.memory.ts`, `seal-aad-invariant.ts` |
| widgets | `packages/cms/src/widgets/site/` | `publish-content.ts` |

The splits that matter most for using this ledger:

- **Mail, media, and newsletter.** Capture-clear binds deletion to the reviewed IDs. Media’s in-memory credential repo serializes writes across the read/plan/batch boundary. Newsletter’s delivery registrar prepares and runs campaign transitions. These are behavior owners, unlike their neighboring SQL and dependency adapters.
- **Catalogs and plugins.** Move neutral schemas, read vocabularies, and tool behavior. Keep product prose in the host and supply it through existing registration args. Port the content-analyzer worker entry to `@jini-ai/plugin-sdk` with the trusted-import update. Move word counting and its hook behavior, not the host’s bundled-source registration.
- **Publish, backup, and export.** Move planning, compensation, verification, archive handling, and output shaping. Inject HTTP, filesystem, runtime bridges, and product policy through ports. In particular, `file-tree-policy.ts` owns path validation mechanics, but Tovu’s roots, allowlists, and limits stay. `site-exporter.ts` owns the export loop, but booting the actual Express app stays in Tovu.
- **Credentials, trash, and tooling.** Move credential lifecycle, scope-checking and stale-write handling, while keeping Tovu’s vault namespace, DTO mappings, and storage bindings where needed. The sampled trash adapters own marker, purge, or revocation behavior, not just repo construction. Move the reusable seal-AAD AST check and keep the Tovu scan root and CLI binding in the host.

## 4. NOT-CHECKED

These are the exact 46 paths left without a verdict, relative to `apps/website/src/features/`. No default MOVE or KEEP rule applies to them.

```text
post/{post-retire,post-tool-delete,post-tool-duplicate,post-tool-list,post-tool-update,publish-content,repo.memory,repo.rows,repo,reverters}.ts
project-keys/{attachments,shared-oauth-disconnect}.ts
publish-content/{apply-report,export-bundle,publish-backstop-row.sqlite,push-plan,raw-file-contributor,tool-registrations}.ts
publish-content/ui/policy.ts
publish-trust/handshake-client.ts
site-backup/{archive-extensions,import-database,import-keep-off,import-plugin-state,import-verifier-inventory,import-verifier-projection,import-verifier,saved-keys,share-backend,share-preparation,sources,static-download-layout,tool-registrations}.ts
site-backup/share-database/repo.sqlite.ts
site-export/route-manifest.ts
site-inspection/tool-registrations.ts
source-control/source-control-credential-repo.ts
trash/adapters/{redirect,user}.ts
trash/{permissions,tool-registrations,trash-item-tool}.ts
webhooks/{keyring.env,secret-scan-guard,site-key-ensure,site-key-sources}.ts
```
