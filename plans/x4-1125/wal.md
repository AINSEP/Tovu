X4 wal: 88 files; 53 MOVE, 35 STAYS-HOST, 17 sheets

Reproduced **977 planner candidates → 449 true-count files → 88 in this slice**. I used the scanner and five count reports from Tovu planning commit `ab82b224fa`, since those paths are absent from the dispatched checkout. I ran the scanner and `combine-18-plan.mjs` classification in memory, excluded the 120 files in the planner’s two theme areas, and applied the 3,615 anchored keep rules. They removed 528 candidates. Tovu `HEAD` and `origin/codex/m24-tip` both resolve to `a96020e1e7`. The scanner inputs changed since the report’s counted commit `1b05ab3763` only in six excluded test files. I checked Jini at `origin/integ/merge-24-2026-11-25`, `0718702bb`, whose parent is merge-24’s code tip `1838a01ed`.

`MOVE` includes retiring a duplicate or forwarding barrel. It does not imply copying a second implementation to Jini. Three sheets are host-only dispositions. No files changed and no tests, builds, installs, typechecks, or linters ran.

| File relative to `apps/website/src/features/` | Verdict | Sheet ID | Reason |
|---|---|---|---|
| `agent-plugins/activation-effects.ts` | STAYS-HOST | WAL-09 | Selects the shared activation queue and binds its fail-closed reader. |
| `agent-plugins/apply-connect-defaults.ts` | STAYS-HOST | WAL-09 | Jini owns grant orchestration. Tovu supplies the stored actor IDs, seed/off policy and activation owner. |
| `agent-plugins/apply-tool-renames.ts` | STAYS-HOST | WAL-09 | Binds installed-plugin reads, roster notification and the persisted rename actor to Jini. |
| `agent-plugins/automatic-agent-plugins.ts` | MOVE | WAL-09 | Owns logical-turn and attempt lifetimes not supplied by Jini’s automatic-use engine. |
| `agent-plugins/connect-destination.ts` | STAYS-HOST | WAL-09 | Binds the destination card, exchange channel and “this Mac” copy. |
| `agent-plugins/connect-sign-in-wait.ts` | STAYS-HOST | WAL-09 | Binds the live exchange and host card identity to Jini’s waiter. |
| `agent-plugins/connect-tool.ts` | MOVE | WAL-09 | Jini owns the connect flow. The bundled-preferred installed package and credential-card resolver still lives here. |
| `agent-plugins/customize-tool.ts` | STAYS-HOST | WAL-09 | Host tool ID and catalog copy. Jini already owns archive preparation. |
| `agent-plugins/enable-access.ts` | STAYS-HOST | WAL-09 | Binds grant projections, trust classification and host refusals to Jini. |
| `agent-plugins/exports/diagnostics.ts` | MOVE | WAL-09 | Selects exports and checks saved embed contracts beyond Jini’s manifest parser. |
| `agent-plugins/exports/runtime.ts` | MOVE | WAL-09 | Owns live/static render-session state, consent, resource deduplication and availability. |
| `agent-plugins/exports/source.ts` | MOVE | WAL-09 | Owns trusted active/inactive catalog projection and contained asset reads. |
| `agent-plugins/federate-mcp.ts` | STAYS-HOST | WAL-09 | Jini owns federation. This supplies the lifecycle reads, projections and store-specific refusals. |
| `agent-plugins/grant-signed-in-defaults.ts` | STAYS-HOST | WAL-09 | Binds activation, grant attribution, roster and diagnostic ports to Jini’s healing flow. |
| `agent-plugins/host-tool-ports.ts` | STAYS-HOST | WAL-09 | Supplies host permissions, navigation, catalog and memory collaborators. |
| `agent-plugins/import-access-token.ts` | STAYS-HOST | WAL-09 | Binds the token-import actor, secure card checks and MCP projections to Jini. |
| `agent-plugins/install-tool.ts` | MOVE | WAL-09 | Selects source and coordinates install, update and customize outcomes. |
| `agent-plugins/install-upload.ts` | MOVE | WAL-09 | Owns upload preflight, replacement and preview around Jini’s install/update primitives. |
| `agent-plugins/layout.ts` | MOVE | WAL-09 | Jini has explicit-root layout, but not the full workspace projection and diagnostics Tovu callers observe. |
| `agent-plugins/memory-tools.ts` | STAYS-HOST | WAL-09 | Supplies host approval and tool ports to existing Jini registrations. |
| `agent-plugins/memory.ts` | MOVE | WAL-09 | Per-plugin storage already lives in Jini. Sibling migration ordering and guidance-note projection do not. |
| `agent-plugins/new-site-agent-plugin-tokens.ts` | MOVE | WAL-09 | Adds ordered pre-create refusal and bundled discovery around Jini’s token parser. |
| `agent-plugins/provider-plugin-link.ts` | STAYS-HOST | WAL-09 | Binds the lifecycle owner, diagnostic sink and the product’s provider-switch refusal. |
| `agent-plugins/set-enabled.ts` | MOVE | WAL-09 | Adds linked-face precedence, lifecycle reuse and post-write access lowering around Jini’s toggle. |
| `agent-plugins/switch-on-saved-token.ts` | STAYS-HOST | WAL-09 | Binds Jini’s switch to the site’s grants, activation and settings guidance. |
| `agent-plugins/token-sign-in.ts` | STAYS-HOST | WAL-09 | Binds Jini’s sign-in checks to the host credential probe. |
| `agent-plugins/uninstall-confirmation-ui.ts` | STAYS-HOST | WAL-09 | Describes the host’s existing uninstall card, restart warning and redeemable tool ID. |
| `agent-plugins/update-effects.ts` | MOVE | WAL-09 | Owns the provisioning failure and deferred recovery sequencing around Jini’s update owner. |
| `api-connections/contribution.ts` | MOVE | WAL-01 | Jini parses declarations. Tovu still owns the trusted load, namespace adjudication and refusal projection. |
| `api-connections/shared-owner.ts` | MOVE | WAL-01 | Implements sealed issuing-context storage and identity consistency. Jini currently consumes that owner port. |
| `api-connections/vault-store-binding.ts` | STAYS-HOST | WAL-01 | Supplies persisted scope, kinds, metadata, vault authority and IDs to Jini’s stores. |
| `asset-transfer/asset-destinations.ts` | MOVE | WAL-03 | Jini already owns destination checks and writes. Retire the duplicate after parity checks. |
| `asset-transfer/copy-tool.ts` | MOVE | WAL-03 | Jini already owns source dispatch, aggregate caps and approval. Bind the host readers and archive port. |
| `content-duplication/tool-registrations.ts` | MOVE | WAL-05 | Owns resource-specific validation, authorization and dispatch beyond Jini’s catalog. |
| `content-types/publish-content.ts` | MOVE | WAL-06 | Owns schema create, update and lifecycle sequencing over Jini’s publish factory. |
| `custom-credentials/agent-tools.ts` | STAYS-HOST | WAL-10 | Supplies host tool IDs, permissions and UI vocabulary to Jini’s catalog factory. |
| `custom-credentials/credential-copy-tool.ts` | STAYS-HOST | WAL-10 | Binds the copy tool already in Jini to the host card, exchange and save port. |
| `custom-credentials/credential-save-tool.ts` | STAYS-HOST | WAL-10 | Binds host metadata, categories and card forms to Jini’s save catalog. |
| `custom-credentials/credentialed-request.ts` | STAYS-HOST | WAL-10 | Live code binds the guarded client, refusal identity, credential store and audit sink to Jini’s engine. |
| `custom-credentials/repository-target.ts` | STAYS-HOST | WAL-10 | Binds the source-control error and selected validator to Jini’s request validation. |
| `custom-credentials/store.ts` | STAYS-HOST | WAL-10 | Binds the Jini credential-set store to the host vault, categories and scope. |
| `custom-credentials/tool-registrations.ts` | STAYS-HOST | WAL-10 | Post-move registrar binds cards, copy, owner authority and the host’s optional provider catalogs. Jini owns the handlers. |
| `database-transfer/destination-store-host.ts` | STAYS-HOST | WAL-11 | Supplies the host vault identity, metadata and process fallback to Jini’s sealed destination store. |
| `database/tool-registrations.ts` | MOVE | WAL-12 | Jini owns reads and execution primitives. This file still owns the migration approval ceremony. |
| `deployments/capability-card.ts` | STAYS-HOST | WAL-13 | Describes Tovu’s deployment surface and operator guidance. |
| `deployments/deploy-ops/agent-tools.ts` | MOVE | WAL-13 | Builds platform-dependent schemas and catalogs from contributed descriptors. |
| `deployments/deploy-ops/registry.ts` | MOVE | WAL-13 | Adjudicates bundled ownership, inactive metadata and duplicate claims. |
| `deployments/deploy-ops/run-ops.ts` | STAYS-HOST | WAL-13 | Binds site-key sources, guarded HTTP, credentials and diagnostics to Jini’s runner. |
| `deployments/deploy-ops/secrets.ts` | STAYS-HOST | WAL-13 | Passes the same bound host runtime to Jini’s list, set and unset operations. |
| `deployments/deploy-ops/tool-registrations.ts` | STAYS-HOST | WAL-13 | Supplies Jini’s registrar with Tovu metadata, permissions, and replace/remove approval policy and copy. |
| `deployments/deploy-ops/typed-secret-card.ts` | STAYS-HOST | WAL-13 | Binds localized secret fields, card identity and the live exchange. |
| `deployments/deploy-targets/host-kit-binding.ts` | STAYS-HOST | WAL-13 | Chooses real fetch, egress checks, SigV4 vendor, timing and tracing for Jini’s kit. |
| `deployments/deploy-targets/registry.ts` | MOVE | WAL-13 | Owns active executable and inactive data-only registries and refusal ordering. |
| `deployments/publish-agent-tools.ts` | MOVE | WAL-13 | Owns publish preview, capabilities, credential proposal and approved execution. |
| `deployments/publish-credentials/compatibility-port.ts` | MOVE | WAL-13 | Owns deferred registry reads and invalidation timing. |
| `deployments/publish-credentials/index.ts` | MOVE | WAL-13 | Forwarding barrel. Repoint its consumers and delete it without a Jini counterpart. |
| `deployments/publish-credentials/store.ts` | MOVE | WAL-13 | Owns publish credential selection, validation, scope-aware writes and resolution. |
| `deployments/publish-tool-deps.ts` | MOVE | WAL-13 | The shared publish tool port contract belongs beside its consumer. Host-only types do not move. |
| `deployments/static-publish/adapter.ts` | MOVE | WAL-13 | Owns export, credential review, publication, result and cleanup sequencing. |
| `deployments/static-publish/credentials.ts` | MOVE | WAL-13 | Owns explicit-choice behavior, credential projection and fallback policy. |
| `deployments/static-publish/domain-publish-tool.ts` | MOVE | WAL-13 | Owns the inspected plan, confirmed execution and history handshake. |
| `deployments/static-publish/index.ts` | MOVE | WAL-13 | Forwarding barrel. Repoint its consumers and delete it without a Jini counterpart. |
| `deployments/static-publish/inspection.ts` | MOVE | WAL-13 | Owns read-only publish preflight and receiver preview. |
| `deployments/static-publish/publish-history.ts` | MOVE | WAL-13 | Owns replay selection, public config projection and in-memory ledger semantics. |
| `deployments/static-publish/publish-run.ts` | MOVE | WAL-13 | Owns run registration, snapshots, settlement and durable history ordering. |
| `deployments/static-publish/verify.ts` | MOVE | WAL-13 | Owns credential check selection, caching and result mapping. |
| `deployments/tool-registrations.ts` | MOVE | WAL-13 | Owns export input projection and conditional Dockerfile write handling beyond Jini’s catalog. |
| `email-templates/operations.ts` | MOVE | WAL-14 | “Binding” in name, but owns transactional row creation, HTML CAS and title/list projection. |
| `email-templates/tool-registrations.ts` | MOVE | WAL-14 | Adds validated tool inputs, permission order, version handling and error mapping to existing mail operations. |
| `entries/publish-content.ts` | MOVE | WAL-07 | Owns source ID, slug, provenance and term sync across publish precheck and apply. |
| `external-mcp/external-mcp-oauth.ts` | STAYS-HOST | WAL-15 | Binds host OAuth origin, callback identity, vocabulary, vault and egress policy. |
| `external-mcp/external-mcp-repo.ts` | MOVE | WAL-15 | Jini already has the SQL owner and accepts kernel, tables, vault and error ports. |
| `external-mcp/external-mcp-repo.writes.ts` | MOVE | WAL-15 | Duplicates Jini’s internal CAS and vault-pointer transaction implementation. |
| `external-mcp/external-mcp-store.ts` | STAYS-HOST | WAL-15 | Binds host token normalization, vault errors and vocabulary to Jini’s store. |
| `external-mcp/external-mcp-vault.ts` | STAYS-HOST | WAL-15 | Binds persisted scope and vault kinds to Jini’s seal/open/persist operations. |
| `external-mcp/tool-registrations.ts` | MOVE | WAL-15 | Still owns access-review snapshots, save basis rechecks and roster ordering. |
| `form-destinations/key-store.ts` | STAYS-HOST | WAL-16 | Jini owns receiver-key lifecycle. Tovu supplies its credential vault, site scope, entropy and persisted label. |
| `forms/protect-existing-files.ts` | MOVE | WAL-08 | Owns the completion/retry decision and ownership-checked stamping beyond Jini’s paged scan. |
| `forms/publish-content.ts` | MOVE | WAL-08 | Owns slug-keyed publish and local-recipient preservation beyond Jini’s form writes. |
| `fs-files/agent-tools.ts` | MOVE | WAL-02 | Missing Jini catalog owner for the list/read/write schemas and bounds. |
| `fs-files/tool-registrations.ts` | MOVE | WAL-02 | Owns input, pagination and prepared-write approval around existing Jini file primitives. |
| `identity/permission-list-tool.ts` | MOVE | WAL-17 | Jini has the handler and accepts the permission and recovery tool ID as policy. |
| `identity/repo.authentication.ts` | MOVE | WAL-17 | Duplicates Jini’s session/key SQL behind a different constructor. |
| `identity/repo.authorization.ts` | MOVE | WAL-17 | Duplicates Jini’s role/policy/permission SQL behind host table and versioning bindings. |
| `identity/repo.ts` | MOVE | WAL-17 | Duplicates Jini’s principal/user SQL and identity transaction adapter. |
| `identity/tool-registrations.ts` | MOVE | WAL-17 | Adds owner guards, confirmation, secret-card admission and schema projection to base Jini tools. |
| `identity/user-purge.ts` | MOVE | WAL-17 | Jini already owns delete order and transaction. Bind the concrete tables and outbox once. |
| `image-transform/tool.ts` | MOVE | WAL-04 | Jini already owns inspection, rendering and prepared destination writes. Retire the duplicate. |

## Build-sheet rules

A Jini target written `package:subpath` means `packages/<package>/src/<subpath>.ts` and `@jini-ai/<package>/<subpath>`. Add `exports` and `jini.entries` for new public subpaths, with `node` for Node-backed or Node-only dependency graphs and `universal` for pure/port-only entries. Keep internal split files unexported. Use one **minor** changeset per changed Jini package per sheet. Where Jini already owns the exact API and needs no change, the Jini half is verification and no changeset.

Land sheets in the order below. For each, write the named characterization first and record the mutation in the implementer’s uncommitted `COMMIT-PLAN.md`. The mutation changes one decision or call at a time and is reverted after verification by the test runner. Recheck the listed Tovu source blobs, the Jini symbols and the importer ledger before moving any code. Stop the sheet on unexplained drift. The listed known differences are parity checks, not permission to replace host behavior with package defaults.

For Tovu, the importer ledger rule is exact. With the same scanner graph, collect every `imps` edge whose resolved `to` equals an affected source or barrel. Open each `from`, repoint the symbols it uses, then repeat on any barrel that reached the affected path. Include `import type`, dynamic imports, mocks, fixtures, and test sources. For test or catalog assertions that pin a literal module path, inspect the named file and update only the path assertion. Re-run the read-only inbound-edge check before deletion. Production entry points below call out the binding locations and shared edit targets. Where a path becomes a binding, callers that need its injection may continue to import it, but generic symbols go directly to Jini. Record **exact anchored keeps** for retained bindings and host policy only. Do not keep an entire directory or count a branch-owning implementation as a binding.

Move existing why-comments with their decision, translating host path references only as required by package neutrality. Inject all host effects and vocabulary without advancing deferred reads. New entry points take `(required, _optional = {})`. No custom hooks are introduced here. Keep functions ≤80 lines and complexity ≤10, files ≤500, and stop if the named split does not satisfy those limits without changing behavior. Keep tool, route, and feature availability unchanged, including anything currently dark. No theme files, approval ownership, migrations, or persisted wire identities change.

### WAL-01 — API connections

**Tests first.** Extend `api-connections/__tests__/shared-owner.integration.test.ts` to pin the original issuing context when a later write offers a different client, and the contribution test for a manifest namespace that passes shape parsing but is not authorized for that plugin. Mutations `replace-original-issuing-context` and `skip-plugin-namespace-check` must turn the respective cases red.

**Jini.** Add `integrations:api-connections/contribution` and `integrations:api-connections/shared-owner`. In the first, keep the two-stage parse, then the per-plugin namespace check, and the existing refusal order. Reuse `parseApiConnectionsFile`, `checkApiConnectionClientNamespace` and `asApiConnectionHooksModule` from the existing declarations owner. Inject the trusted contribution loader/definition binding, callback field rules and default namespace. Do not make integrations depend on the Agent Plugin runtime. In the second, implement the existing `SharedApiOwnerStorage` boundary used by `shared-api.ts`. Move `readSharedOAuthContext`, `createSharedOAuthOwnerStorage` and their validation together. Inject owner scope, vault/record/token-store factories, context ID and metadata policies, and label/refusal copy. Keep store construction and reads at the existing points. No new credential format or owner transaction.

**Tovu.** Reduce `contribution.ts` to namespace, callback rules and lifecycle injection. Repoint the generic `DeclaredApiConnection` type in `agent-plugins/connect-tool.ts`, `api-connections/byo-client.ts`, `api-connections/host-bindings.ts`, and `server/runtime/composition/agent-plugin-service-ports.ts` where used. Reduce `shared-owner.ts` to injecting `'project'`, the exact `plugin-state:tovu-shared-oauth:` digest identity, vault factories and label policy. Update `cli/commands/owner-store.ts`, `server/runtime/composition/agent-plugin-connections.ts`, and `site-deps/{project-keys,shared-oauth-commerce}.ts` to use the owner binding and import moved types from Jini. Keep `vault-store-binding.ts` unchanged. Blobs `e4727ec82e`, `09bac74502`.

### WAL-02 — fs-files

**Tests first.** Use `fs-files/__tests__/tool-registrations.test.ts` to pin a truncated listing and a declined prepared write. The first retains its `truncated` field, and the second makes no writer call. Mutations `drop-list-truncated` and `write-before-approval`.

**Jini.** Add `cms:fs-files/agent-tools` for the schema builder and `cms:fs-files/tool-registrations` for `describeWriteBatch`, `preparePickedFolderBatch`, `resolvePickedFolder`, registrations and contributor. The missing `agent-tools` export is the merge-24 blocker for ext-w1 T18/T19. Reuse `fs-files/write-files` and `custom-root-permission`. Supply current-site checks, lazy root and path resolution, guarded reads, approvals, permissions, catalog wording and exchange creation through the existing host seams. Do not import the daemon scheduler into CMS or instantiate a second production exchange store. File limits, refusal strings, validation order, cursor, pagination and one approval per batch stay as-is.

**Tovu.** Reduce `agent-tools.ts` to the bound catalog and Tovu root/permission vocabulary. Reduce `tool-registrations.ts` to injecting `layout.ts`, `fs-files.ts`, `site-file-request.ts`, the existing host approval and exchange, and the selected catalog. `server/inbound/admin-http/routes/fs-files/custom-root.ts` takes the canonical permission where it needs no binding. Update `tool-catalog-manifest.ts`, `asset-transfer/{asset-sources,asset-destinations,copy-tool}.ts`, and `image-transform/tool.ts` for the split between Jini operations and host root injection. Do not move or remount the admin routes in this sheet. Blobs `437667c174`, `20eb19b4e8`.

### WAL-03 — asset-transfer

**Tests first.** Use `fs-files/__tests__/copy-tool.test.ts` and `copy-library.test.ts` to compare the bound Jini tool with the current one on a same-batch filename collision and preflight failure in the second document. Assert exact response/approval shape and zero writes on failed preflight. Mutation `persist-first-before-second-preflight`.

**Jini.** Reuse `cms:asset-transfer/asset-destinations` and `cms:asset-transfer/copy-tool`. They already expose `AssetDestinationDeps`, `FilesCopyToolDeps`, `buildFilesCopyAgentToolCatalog`, `buildFilesCopyRegistrations` and `contributeFilesCopyTools`. Use the existing FS, theme, media, source, archive and approval ports. Before adoption, check the two real shape differences at the old helper edge. Tovu returns a `themeId` key with value `undefined` on non-theme destinations and assigns `batch` even when undefined. Jini omits those keys. Package consumers must not observe a changed contract. Repoint consumers that do not depend on those own keys, and **stop this cutover** if any live consumer or contract assertion requires them and cannot be satisfied by the existing API. Do not casually change the published Jini shape.

**Tovu.** Bind `AssetDestinationDeps` and `FilesCopyToolDeps` in `server/runtime/composition/asset-tool-host.ts` with the existing `asset-sources.ts`, guarded and media readers, archive owner and theme hooks. `asset-sources.ts` imports portable asset data types from `@jini-ai/core/contracts/site/asset-transfer-tool-ports`. Have `tool-catalog-manifest.ts` call the Jini contributor with the host catalog and WAL-02’s bound batch approval. Repoint `image-transform/tool.ts` to the same destination and source bindings in this cut, even before WAL-04 removes its handler. Delete `asset-destinations.ts` and `copy-tool.ts` after repointing their fixture and contract consumers. No edits to theme files or dependency on a media-import extraction. Blobs `1004b1657d`, `e1058bb2e5`.

### WAL-04 — image-transform

**Tests first.** In `image-transform/__tests__/tool.test.ts`, pin inspection without outputs as a no-write result, and a site batch as a write only after the existing confirmation. Mutation `inspect-calls-destination-writer`. Keep the existing partial-write result assertion or add it if absent at the anchor.

**Jini.** Reuse `cms:media/site-transform/tool`, including `buildImageTransformAgentToolCatalog`, `buildImageTransformRegistrations` and `contributeImageTransformTools`. Supply WAL-03’s destination kit and source reader and WAL-02’s approval. Jini checks absence of the `failed` key where Tovu checks `failed === undefined`. Use the existing prepared writer, whose successful body omits the key. Pin both success and named failure through that writer. Stop if a live binding returns a present `failed: undefined` and parity cannot be achieved without changing its existing contract.

**Tovu.** Bind the existing codec, permission, catalog source schema, and error classifiers in `tool-catalog-manifest.ts` using `asset-tool-host.ts`. Repoint `assistant/tool-registrations.ts`, the local tool test and assistant contract test, then delete `image-transform/tool.ts`. No new tool mount. Blob `f994b5ea0d`.

### WAL-05 — content-duplication

**Tests first.** In `content-duplication/__tests__/tool-registrations.test.ts`, pin late resource registration and a denied resource whose duplicate callback is never entered. Mutation `authorize-after-resource-duplicate`.

**Jini.** Add `cms:content-duplication/tool-registrations`. Move registry discovery at build time, input and override handling, per-resource permission, result and refusal mapping, and contributor. Reuse `content-duplication/agent-tools` and the existing tool metadata. Inject host resource sources and hook-refusal reporting/classification rather than introducing a CMS dependency on the plugin runtime.

**Tovu.** Repoint `tool-catalog-manifest.ts` to the package contributor and bind the current resources there. Repoint the assistant contract test, local registration test and forms duplication test. Delete `content-duplication/tool-registrations.ts`. Blob `9e8a935dba`.

### WAL-06 — content-types

**Tests first.** In `content-types/__tests__/publish-content.test.ts`, pin inbound seeded-key refusal at precheck **and apply**, and a fields-only update without a label/status change. Mutation `skip-seeded-check-at-apply`.

**Jini.** Add `cms:content-types/site/publish-content`, exporting `contributeContentTypePublish`. Move the contributor’s disposition, field table, gateway actor/outbox, create/update/status branch order and error mapping. Inject seeded keys, refusal policy, permission and the host’s `registerContentType` entry. Reuse `publish/content/{repo-handler,publish-ports,precheck-reasons}`. No duplicate command or dependency on an unbuilt publish-engine sheet.

**Tovu.** Bind the existing schema write service, seeded `widget`/`widget_area` policy and permission in `server/runtime/composition/publish-content-manifest.ts`. Repoint that import, the local publish test and `publish-content/__tests__/new-types-sqlite-round-trip.test.ts`. Delete `content-types/publish-content.ts`. Blob `afbf765483`.

### WAL-07 — entries

**Tests first.** In `entries/__tests__/unit/publish-content.test.ts`, pin portability of sorted term IDs and the distinction between absent `termIds` and an explicit empty set. Mutation `apply-absent-terms-as-empty`. Keep the existing trashed-slug holder and widget-refusal cases.

**Jini.** Add `cms:entries/site/publish-content` and export `contributeCollectionEntryPublish`. Move `writeCollectionEntry`, `validateCollectionEntry`, references, field table and addressing rules. Reuse `entries/publish-ports` and `taxonomy/site/publish-term-ids`. Pass host collection exclusions, permissions and coverage-table keys from the caller. Preserve schema version 2, the entry’s source ID and dates, and term apply after the entry write. WAL-06 changes the neighboring manifest line only. The `"content-type"` and `"term"` ordering edges remain data dependencies of the publish registry, not package imports of their contributors.

**Tovu.** Repoint the manifest, the local publish tests and `publish-content/__tests__/references.test.ts`. Bind the exact excluded types and permission/table values in the manifest, then delete `entries/publish-content.ts`. Blob `3b89a0c26a`.

### WAL-08 — forms

**Tests first.** In `forms/__tests__/form-file-purge.test.ts`, pin that a transient stamp fault leaves the completion marker absent and the next owner start tries again. Mutation `mark-complete-after-stamp-failure`. In `forms/__tests__/publish-content.test.ts`, pin that a payload carrying notification recipients still leaves destination recipients local. Mutation `take-notify-from-source`.

**Jini.** Add `cms:forms/site/protect-existing-files` and `cms:forms/site/publish-content`. Reuse `protectFormAttachments`. Move completion/retry and `readPage`/`protectReference` with their existing keyset and scoped transaction behavior. Supply the structural kernel/table bindings, marker read/write effects and warning callbacks. Keep the ownership proof, missing-media behavior, and `asset_blobs` update before marking completion. For publish, move `contributeFormPublish` and `publishableForm` with the same default normalization, slug collision, table coverage and field table. Use the existing form commands with the host command execution binding and inject the permission and table key.

**Tovu.** Reduce `protect-existing-files.ts` to the real kernel/table, `.form-files-protected-v1` marker, file mode and warning injections. `server/runtime/composition/deps.ts` keeps the owner-boot call, and no public request calls it. Repoint `publish-content-manifest.ts`, the local publish tests and the new-types SQLite round trip. Delete `forms/publish-content.ts` after binding the existing form commands in the manifest. Blobs `e1dcb0ae23`, `69429028bf`.

### WAL-09 — agent-plugins

**Tests first.** Use `assistant/__tests__/automatic-agent-plugins.integration.test.ts` for a replaced attempt with a late answer, `agent-plugins/__tests__/unit/plugin-embed-source.test.ts` for inactive metadata admitted only through the digest gate, and `install-upload-update.unit.test.ts` for a rejected update that preserves the old revision. Use `update-effects.unit.test.ts` for recovery dependencies read only on invocation, and the layout/memory integration cases for workspace isolation and sibling lock order. Mutations `reuse-retired-attempt-receipt`, `catalog-inactive-before-digest`, `publish-before-off-record`, and `capture-recovery-deps-at-bind`. Also pin the exact workspace/plugin ID error text before changing `layout.ts`.

**Jini.** Use the existing `connect`, `lifecycle`, `persistent-state` and `site` owners, adding only these surfaces:

| Target under `@jini-ai/agent-plugins` | Move or reuse |
|---|---|
| `site/automatic-agent-plugins` | Move `createAutomaticPluginRuns`, `bindAutomaticGuidanceResolver` and registration/attempt logic. Reuse `createAutomaticAgentPluginUse`. Keep attempt maps scoped to the same controller. Inject preference and readiness reads, catalog, card port and logging. |
| Existing `connect` | Add `defaultResolveInstalledAgentPlugin` in `connect/connect-tool.ts` over the installed/trusted read ports. Reuse the connect flow, `titleCaseFromPluginId` and saved-credential predicate already there. Preserve list, bundled-digest, manifest and server read order. |
| `site/exports/{diagnostics,runtime,source}` | Move selection/diagnostics, per-render state and trusted source projection. Inject widget-marker operations, member provider link construction, exact asset URL prefix, and contained binary reads. Keep disabled vs enabled discovery separate and do not add a CMS dependency. |
| `site/install-tool`, `site/install-upload` | Move tool source/operation dispatch and archive install/preview/replacement. Inject catalog and cards, archive reader, settings snapshot and identity admission, filesystem and redaction. Reuse lifecycle install/update/removal primitives. Preserve lock, OFF-before-publication and rollback order. |
| Existing `lifecycle` | Add `createAgentPluginSiteLayout` in `lifecycle/layout.ts` with the full workspace projection over an explicit root and caller-supplied diagnostics. Reuse `pluginStatePaths`. Do **not** replace the existing `createAgentPluginLayout` signature. It lacks `workspacesDir` and has different invalid-ID errors. |
| `site/memory` | Move note projection and ordered site/sibling migration above existing persistent-state helpers. Inject filesystem discovery, the migration lock effects and the host diagnostic sink. |
| `connect/new-site-agent-plugin-tokens` | Move ordered refusal and bundled discovery. Reuse the token-map parser and sign-in projection. Inject source reads, retired-ID policy, limits and copy. |
| `site/set-enabled`, `site/update-effects` | Move linked-face/Soon precedence, lifecycle memoization and post-OFF notification, and deferred provisioning/recovery. Reuse the lifecycle writer and existing provider-face lookup. Inject the boot-owned lifecycle and actor/copy ports. |

**Tovu.** Delete `exports/diagnostics.ts` after repointing `exports/runtime.ts` and the embed-save test. Reduce the other eleven MOVE paths to bindings for precisely the injected inputs above, keeping their relative paths only for consumers of those bound inputs. Repoint generic types, pure helpers and error classes directly. The production ledger includes the automatic-guidance RPC, BYOK and tool-exec modules and `assistant/host-contracts.ts`; the export-files route, `server/routes/types.ts` and composition `app`, `pre-assembly` and `memory-deps/route-deps/context`; `tool-catalog-manifest.ts`, install-response and `modules/agent-plugin-install-route`; the layout consumers in `memory-deps/slices/agent-plugins`, `site-deps/{agent-plugin-bootstrap,store-basics}`, `site-portability`, `vault-boot` and `development/scripts/agent-plugin-activation.ts`; `modules/agent-plugin-memory-routes`; the CLI token command, `features/sites/site-admin.ts` and `modules/sites`; `plugin-host`, agent-plugin routes/deps and the site mailer. Repoint the two pass-through exports `renameToolNames` and `waitAtAgentPluginSignInCardWithPorts` to `@jini-ai/agent-plugins/connect` at their consumers and remove the forwarders, leaving their files’ real host bindings. Likewise, consumers of `AgentPluginNotInstalledError` and `SavedTokenSwitchOutcome` take them from their Jini owners. Keep the same process activation and exchange owners.

Source anchors in the table’s MOVE order are `f2e4058528`, `67c6aa91c2`, `0592b417ab`, `7aecddd890`, `ea24b05d72`, `42e0e13086`, `6c3263208f`, `a33ce81a50`, `8515e1a54a`, `d236f79654`, `fa704ffac2`, `3194bce944`. WAL-01 supplies the declared-connection type. Federation, consent and approvals are passed as existing ports, so this sheet does not wait for another slice.

### WAL-10 — custom-credentials, host-only

**Jini.** No code, export or changeset. Reuse `integrations:custom-credentials/{agent-tools,write-files-validation,credentialed-request}`, `integrations:credentialed-http/{sets,tools}`, and `agent-plugins:connect`. In particular, `credentialed-http/tools` already owns the request, approval and save handlers that the old count report assigned to the Tovu registrar.

**Tovu.** Keep all seven listed paths. No importer changes and no extraction test to add. Retain the existing credential-card and egress-refusal pins. They must continue to distinguish target validation before opening a secret and a refusal after loss of authority. Do not copy Tovu’s host scope, vendor choice, or copy into the package.

### WAL-11 — database-transfer, host-only

**Jini.** No code, export or changeset. `db:transfer/destination-store` already owns `SealedDatabaseDestinationStore` and scope authorization.

**Tovu.** Keep `destination-store-host.ts`, including its persisted owner key, scope, injected vault and the one process fallback. The two production importers are the transfer registrar and `site-deps/route-deps-assistant-mcp.ts`. No repoint and no test addition. Leave the existing wrong-scope and no-secret-in-projection tests intact.

### WAL-12 — database

**Tests first.** In `assistant/__tests__/tool-registrations.database-recovery.test.ts`, pin that a no-click or refused restore-point plan never executes, and confirmed execution attributes confirmation to the human and execution to the agent. Mutation `confirm-with-agent-principal`. Pin unchanged operation-lock and restore-point ordering using the existing harness.

**Jini.** Add `db:site/tool-registrations`. Move the migrate-forward planning/approval orchestration and `buildDatabaseRegistrations`/`contributeDatabaseTools`. Reuse `db:tools` and `db:recovery/{migrate-forward-hooks,migrate-forward-execute}`. The existing `recovery/tool-registrations.ts` does not own this database migration tool. Inject gateway calls, hook builder, operation lock, permission adapter, mutation actor, catalog, copy and confirmation. Keep `backup_create_restore_point` single-registered and `database_get_restore_guidance` unwired. No migration or change to any maintenance enablement gate.

**Tovu.** Reduce `database/tool-registrations.ts` to the named bindings, including the ext-crp confirmation owner and existing default exchange construction only at the host boundary. Repoint moved type/metadata imports in `assistant/tool-registrations.ts`, the catalog manifest and database test consumers. Blob `4331b05d42`. No dependency on p11’s unbuilt storage/maintenance sheets.

### WAL-13 — deployments

**Tests first.** Pin these with the existing feature test seams before moving the bodies.

| Test anchor | Behavior and named mutation |
|---|---|
| `deploy-ops/__tests__/tool-registrations.test.ts` and deploy target registry fixtures | Disabled metadata is not executable, and duplicate IDs drop all claimants. `take-first-duplicate-target`. |
| `publish-credentials/__tests__/compatibility-port.unit.test.ts` | Binding reads nothing. Preparation loads the registry only with the cache present. `read-registry-at-bind`. |
| `publish-credentials/__tests__/project-scope.unit.test.ts` and `static-publish/__tests__/credentials.unit.test.ts` | Explicit credential choice cannot silently fall back. Preserve owner-only project write authority. `fallback-after-explicit-choice-refusal`. |
| `static-publish/__tests__/domain-publish-tool.unit.test.ts`, `publish-run.unit.test.ts` and publish/credential card goldens | Confirmed plan and credential review still gate execution, and only eligible runs enter replay history. `skip-reviewed-credential-recheck`. |
| `__tests__/tool-registrations.trigger-export.unit.test.ts` | The export call receives only declared options. `forward-narrow-route-deps`. |

**Jini.** `@jini-ai/devops/deploy` already owns the run/secret handler primitives and parsers. `deploy/site` already owns the host-kit factory, catalog, export engine, Dockerfile operations and static-publish types/rows, but not the remaining orchestration. Build in this order within the sheet. Paths below are under `devops:deploy/site/`.

1. Add `deploy-ops/{agent-tools,registry}` and `deploy-targets/registry`. Move descriptor-to-catalog logic and registry selection, injecting the trusted contribution loader, source selection, inactive reads and diagnostics. Keep the installed read’s bundled-owner check separate from activation/digest admission. Reuse package parsers and `requireDeployPlatform` directly. No duplicate source-reader fallback for installed operations.
2. Add `publish-credentials/{store,compatibility-port}`. Split the source `store.ts` at its existing validation and resolve clusters. The private `store-validation.ts` takes field validation and normalized connection helpers. `store-resolution.ts` takes `resolveForPublish`, `resolveDefaultForPublish` and their lookup/open/projection helpers. Keep the public storage APIs at their owning subpaths, not via a new forwarding index. Bind existing vault/kind, token validation, scope and write-authority ports. Preserve the ordering of metadata reads, owner lookup, sealing and invalidation. Move `bindPublishCompatibility` without hoisting its `source` or cache reads.
3. Add `static-publish/{credentials,verify,publish-history,adapter,inspection,publish-run,domain-publish-tool}` in dependency order. Name the private `static-publish/adapter-plan.ts` split for config/plan/output directory logic and `static-publish/adapter-export.ts` for export and file projection. Keep `publishStaticSite` and its execution stages together. Inject the bound export, guarded host kit, form receiver, peer-history snapshots, history limit, redaction, headers and error/telemetry projection. These are ports to existing Tovu effects, not imports from CMS features or themes. Keep room for no new feature switches. Store one live publish-run owner per existing composition scope, with unchanged module/instance lifetime at the host.
4. Add `publish-tool-deps`, `publish-agent-tools`, and `tool-registrations`. Use private `publish-tool-capabilities.ts` for `buildProviderCapability*` and capability projection, `publish-tool-credential.ts` for `buildPublishHostCredentialHandler` and proposal/save helpers, and `publish-tool-execution.ts` for preview, approved execution and result mapping. Keep catalog/registration assembly in `publish-agent-tools`. Move the portable part of `StaticPublishToolDeps` and leave the Tovu port specialization in the binding. Inject copy, UI approval and secret cards, the gate, process export state and other host effects. No CMS, daemon, vendor or Express dependency in DevOps. If changed function size/complexity still fails after the named splits, stop and report the exact function instead of introducing a second design.

Export the named public subpaths and the three split-out store resolution APIs at `publish-credentials/store-resolution` as applicable to former barrel consumers. Private split files are not compatibility paths. Do not add package equivalents of the two Tovu indexes.

**Tovu.** Delete `publish-credentials/index.ts` and `static-publish/index.ts`, splitting mixed imports by symbol. Keep `deploy-ops/{agent-tools,registry}.ts`, `deploy-targets/registry.ts`, `publish-agent-tools.ts`, `publish-credentials/store.ts`, `publish-tool-deps.ts`, `static-publish/{adapter,credentials,domain-publish-tool,publish-run,verify}.ts`, and `tool-registrations.ts` only as bindings or host type specialization. Delete `publish-credentials/compatibility-port.ts` by binding its deferred source at `server/runtime/composition/credentials-host-ports.ts`. Delete `static-publish/inspection.ts` by binding it at the publish tool/runtime consumers. Delete `static-publish/publish-history.ts` by passing history limits and peer reads at composition and importing the ledger interfaces and implementation directly from DevOps. Do not recreate either barrel at the host.

The production cut includes `assistant/tool-registrations.ts`, `features/permanent-delete/tool-registrations.ts`, `platform/db/repos/publish-history-repo.ts`, `server/routes/types.ts`, `server/inbound/admin-http/routes/system/{publish-credentials,publish-site}.ts`, and composition `app`, `credentials-host-ports`, `form-submissions`, `permanent-delete-deps`, `plugin-credential-cards`, `vault-boot`, `tool-catalog-manifest`, `modules/{system-credentials,system-deploy}`, `memory-deps/route-deps/publish-export`, and `site-deps/{assembly-phases,media-storage,route-deps-publish-credentials,site-sharing}`. Also repoint the admin publish-destination wire parity test and host tests that reach a deleted index. Recheck caller anchors if a different slice edits the manifest or publish paths first. This sheet needs no unbuilt export, credential or theme move.

Source anchors for the 17 MOVE rows in table order are `dc4c02aa78`, `56d5ca3cc2`, `8c53f9f60a`, `ab2fd7af1e`, `43f92b76ef`, `1055cadfba`, `161196d5f6`, `8d099a611f`, `4098b7ffc4`, `3799370d30`, `abf2c8a192`, `0fc5fc1b4f`, `f843bb8049`, `aec288b023`, `bbb4f1009b`, `a99e8b48e7`, `9072fa12e6`.

### WAL-14 — email templates

**Tests first.** In `email-templates/__tests__/operations.sql.test.ts`, pin rollback when conversion to HTML fails after the draft save. In `tool-registrations.test.ts`, pin that a stale expected version is not applied. Mutations `convert-outside-create-transaction` and `ignore-template-expected-version`.

**Jini.** Add `cms:posts/email-template-store` for `emailTemplateStore` and `EmailTemplateDeps`. The storage implementation belongs with the post repo and Pages HTML owner it actually uses. Use their existing APIs, the email-template kind and the existing HTML error identity. Inject the `EmailTemplateNotFoundError` constructor from the mail layer, so CMS does not acquire a platform runtime dependency. Add `platform:mail/email-template-tool-registrations` for tool registration, reusing `email-template-operations` and `email-template-agent-tools`. Inject permission enforcement, the bound store and catalog inputs. Preserve draft-only kind, non-public slug, transaction/CAS and the non-sending preview. This does not claim or unblock ext-a’s separate Email UI sheet.

**Tovu.** Delete `email-templates/operations.ts`. Bind the CMS store and mail error in `server/runtime/composition/modules/email-templates.ts` and in the tool composition. Reduce `email-templates/tool-registrations.ts` to host authorization, vocabulary and store injection. Repoint `tool-catalog-manifest.ts`, the operations/registrations tests and `trash/__tests__/email-template-trash-flow.test.ts`. Blobs `38a51719e4`, `bbb77910c5`.

### WAL-15 — external MCP

**Tests first.** Use `external-mcp/__tests__/access-grants.contract.test.ts` and `access-choice.postgres.test.ts` to pin CAS conflicts and unchanged credential pointers on access-only writes. Use `assistant/__tests__/mcp-ui-tool-calls-route.external-mcp-save.integration.test.ts` to pin that a change between card and submission requires a new approval and performs no write on the old basis. Mutations `update-without-expected-version` and `skip-post-card-basis-read`.

**Jini.** Reuse `mcp:federation/hosted/external-mcp-repo` and its private `.writes.ts`. The package constructor accepts the kernel, vault repo, server/vault tables and vault errors. Do not export the private writes file or add a second optional Kysely peer. Compare workspace scoping, fallback nulls, lock identity, join hydration and the order of CAS and pointer cleanup before dropping the host fork.

Add `mcp:external/tool-registrations`. Move validation, save/access basis and registration flow. Split private `external/save-input.ts` at the model/form input conversion cluster and `external/access-review.ts` at the access and save basis comparison/recheck cluster. Reuse `external/{agent-tools,operations-tools,save-form}`, and use hosted federation for the actual save/access. Inject cards, confirmation, authorization, locale/error projection, OAuth redirect resolution, and roster publication. Keep the host’s stricter configured-origin refusal separate from the plugin connect tool’s fallback behavior. No UI/daemon/server dependency added to MCP.

**Tovu.** Repoint `external-mcp-repo.sqlite.ts` and repo contract fixtures to Jini. Bind current table names, kernel and vault errors there. Delete `external-mcp-repo.ts` and `external-mcp-repo.writes.ts` together. Reduce `tool-registrations.ts` to the host ports, including the checked public origin, live exchange, and same `notifyExternalMcpRosterChanged` sink. Repoint generic registrar symbols in `tool-catalog-manifest.ts` and the assistant test ledger. Leave OAuth, vault and store bindings in place. Repoint their consumers that need only the portable `parseEnvBlock` directly to `@jini-ai/mcp/federation/hosted` and remove the pass-through from the host store. No new MCP registration. Blobs `8e6badb561`, `4b1be59e1e`, `19b711ae78`.

### WAL-16 — form destinations, host-only

**Jini.** No code, export or changeset. `cms:forms/destinations/key-store` already owns key reuse, duplicate-label handling and receiver-origin changes.

**Tovu.** Keep `form-destinations/key-store.ts` and its caller `server/runtime/composition/form-submissions.ts`. The `Form submissions key: ` label, site ownership and `hosting` category are persisted policy. Do not move that policy to CMS or mint a second key during a receiver rename. No new extraction test or importer change.

### WAL-17 — identity

**Tests first.** Use `identity/__tests__/repo.session-revocation.test.ts` for a stale session save that cannot clear revocation, `identity/__tests__/permission-list-tool.test.ts` for permission-first reads, `identity/__tests__/user-purge.test.ts` for rollback on failed audit append, and `assistant/__tests__/tool-registrations.identity-authorization.test.ts` for owner-only and post-confirmation authorization. Mutations `overwrite-first-session-revocation`, `commit-purge-before-outbox`, and `skip-owner-check-after-human-approval`. Pin purge’s `buildEvent` invocation with a present `reason` key when unset before replacing the SQL fork.

**Jini.** Reuse `user-management:identity/{repo,repo.authentication,repo.authorization,permission-list-tool,user-purge}`. The three SQL repos accept kernel/table ports, and auth additionally accepts `keepStoredRevocation`. Bind the existing workspace lock and versioned-write owner. `SqlUserPurge` already owns the eight deletes and transactional outbox append. Its Jini implementation uses `{}` when the reason is absent, where Tovu passes `{ reason: undefined }`. Adapt the event callback at the host binding to preserve the latter without changing Jini for its other callers.

Add `user-management:identity/tool-registrations` above the existing `server/agent-tool-registrations.ts`. Move `withoutPassword`, the gating dispatch, prepared delete/reference checks and guarded user-create routing. Bind reference reads, account-action policy, password card, outbox-backed username change, permission and approval copy through the existing host seams. No password in the model schema, no new default exchange, no alternate delete path. Reuse ext-crp’s approval owner through a host port.

**Tovu.** Delete `repo.authentication.ts`, `repo.authorization.ts`, and `repo.ts` after switching `identity/repo.sqlite.ts` to the package constructors and `identity/wiring.ts` to package transactions around its current host lock/kernel. Repoint the repo, MFA and passkey dialect tests. Delete `permission-list-tool.ts` after binding the existing permission, catalog and read-tool ID at `tool-catalog-manifest.ts`. Reduce `user-purge.ts` to injecting the transaction, table-bound statements, `outboxEventValues` and event-argument projection. Keep `site-deps/trash-adapters.ts` on that one bound owner, and point tests that exercise only orchestration directly at Jini. Reduce `tool-registrations.ts` to the host policy and card binding, and repoint portable symbols at `assistant/tool-registrations.ts`, `tool-catalog-manifest.ts` and their test callers. Do not schedule deletion or change the existing approval allowlist. Blobs `d6225ff5ac`, `f2bcf6136e`, `cf7e4dc2ea`, `3a31f73337`, `4d0c4302e9`, `ffb077a48f`.
