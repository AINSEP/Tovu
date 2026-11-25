SHEETS w1b COMPLETE: 9 sheets, 45 MOVE, 19 STAYS-HOST, 57 ALREADY-MOVED, 8 OPUS-REVIEW

All 121 rows are classified against the supplied merge-23 HEADs, Tovu `c0f1068a59` and Jini `fd06f45b12`. Of the 45 MOVE rows, **16 are assigned below**, **8 already have first-pass sheets**, and **21 are excluded from this dispatch by the exact `NOT-SHEETED` list**. The latter two groups are still MOVE, not landed. No files were changed, and no tests, builds, installs, or type checks were run.

`F/` means `apps/website/src/features/`, `W/` means `apps/website/src/`, `R/` means `W/server/runtime/composition/`, and `J/` means Jini `packages/`. In the table, `R1` refers to `plans/sheets-1125/w3-ext-w2.md` on `origin/plan/whats-left-1122`. `R2` refers to the exact paths in `inputs-1125/w3-ext-w2-sheets.md` under `NOT-SHEETED (63)`. `ALREADY-MOVED` includes files with a real Tovu binding left. It does not authorize deleting those bindings.

## Classification

| # | File under `F/` | Verdict | Reason |
|---:|---|---|---|
| 123 | `post/repo.ts` | MOVE · 02 | The cross-dialect post, autosave, and revision queries still live here. Inject the schema view, search, hold predicate, revision lock, and cache invalidation. |
| 124 | `post/reverters.ts` | MOVE · 02 | Post inverse application and registry construction are portable once the existing Trash-forget port is structural. |
| 125 | `post/search-index.memory.ts` | MOVE · R2 | Reusable search double, distinct from the landed SQL search projection. Its current test DB construction is host-bound. |
| 126 | `post/template-options.ts` | STAYS-HOST | Resolves the active Tovu theme and uses Jini's existing template applicability function. |
| 127 | `post/tool-registrations.ts` | MOVE · R2 | Tool execution still contains post orchestration beyond the landed schemas, views, and errors. |
| 128 | `project-keys/attached-vault.ts` | MOVE · R1 J01/T01a–c | Portable grant-first read-only vault view, with host scope, messages, and reporting. |
| 129 | `project-keys/attachments.ts` | MOVE · 01 | Indexed attachment queries and bounded per-site label lookup are reusable storage mechanics. |
| 130 | `project-keys/create-vault.ts` | MOVE · R1 J01/T01a–c | Reusable create/CAS adapter with a separately trusted replacement path. |
| 131 | `project-keys/service.ts` | MOVE · R2 | Project-key inventory, admission, and reapplication still live in this service. |
| 132 | `project-keys/shared-oauth-disconnect.ts` | MOVE · 01 | The reviewed revision/grant check and atomic local stop precede the already shared remote revocation. |
| 133 | `project-keys/site-references.ts` | MOVE · R2 | Reverse references and OAuth binding logic can use injected namespace and vault policy. |
| 134 | `project-keys/tools.ts` | MOVE · R2 | Tool catalog and handlers still own behavior. Restart composition and model-facing copy are host inputs. |
| 135 | `publish-content/apply-failure.ts` | ALREADY-MOVED | Source absent. Jini `cms/publish/content/apply-failure` owns the failure handling. |
| 136 | `publish-content/apply-report.ts` | ALREADY-MOVED | Source absent. Jini `cms/publish/content/apply-report` owns the report. |
| 137 | `publish-content/apply-run.ts` | ALREADY-MOVED | Source absent. Jini owns the apply-run orchestration. |
| 138 | `publish-content/backstop-preview.ts` | ALREADY-MOVED | Source absent. Jini owns the preview logic. |
| 139 | `publish-content/backstop-service.ts` | ALREADY-MOVED | Binds Tovu limits, gap labels, and redaction to the Jini service. |
| 140 | `publish-content/connect-destination.ts` | ALREADY-MOVED | Source absent. Jini owns connect-and-record. |
| 141 | `publish-content/destination-credential.ts` | ALREADY-MOVED | Binds the handshake, host wire vocabulary, and saved-peer reader to the Jini credential resolver. |
| 142 | `publish-content/disconnect-tool.ts` | ALREADY-MOVED | Binds provisioning, candidate selection, and grant reversal to the Jini disconnect tools. |
| 143 | `publish-content/export-bundle.ts` | ALREADY-MOVED | Source absent. Jini owns bundle export. |
| 144 | `publish-content/file-tree-policy.ts` | ALREADY-MOVED | Source absent. Jini owns the path and mode checks. |
| 145 | `publish-content/peer-transport.ts` | ALREADY-MOVED | Source absent. Jini owns the transport mechanism. The separate host transport binding is not this row. |
| 146 | `publish-content/permissions.ts` | ALREADY-MOVED | Source absent. Jini owns the publish permissions. |
| 147 | `publish-content/planner.ts` | ALREADY-MOVED | Source absent. Jini owns plan construction. |
| 148 | `publish-content/publish-backstop-file.ts` | ALREADY-MOVED | Source absent. Jini owns the file backstop. |
| 149 | `publish-content/publish-backstop-row.sqlite.ts` | MOVE · 03 | Raw-row SQLite validation, mutation, and checked transaction logic still live in Tovu. Table policy stays with the host. |
| 150 | `publish-content/publish-tool.ts` | ALREADY-MOVED | Instantiates the Jini publish tool with the Tovu criteria, catalog, credential, and peer ports. |
| 151 | `publish-content/pull.ts` | ALREADY-MOVED | Instantiates the Jini pull runner with the host's credential, bundle, and blob calls. |
| 152 | `publish-content/push-plan.ts` | ALREADY-MOVED | Instantiates the Jini planner with Tovu public paths, transport, and contributor catalog. |
| 153 | `publish-content/raw-file-contributor.ts` | ALREADY-MOVED | Instantiates the Jini contributor with host file policy, limits, and blob facts. |
| 154 | `publish-content/tool-registrations.ts` | MOVE · 03 | Readiness selection, pull planning, caller-bound execution, and tool registration still contain orchestration. |
| 155 | `publish-trust/challenge.ts` | ALREADY-MOVED | Source absent. Jini owns challenge processing. |
| 156 | `publish-trust/connect.ts` | MOVE · R1 J04/T04 | The remaining file is the generic committed-config candidate scan with a Tovu key, not the Jini trust-connect implementation. |
| 157 | `publish-trust/handshake-client.ts` | ALREADY-MOVED | Source absent. Jini owns the handshake client. |
| 158 | `publish-trust/publish-trust-revocations.ts` | MOVE · R2 | The SQL revocation store remains locally owned even though Jini owns lookup semantics and contracts. |
| 159 | `publish-trust/session.ts` | ALREADY-MOVED | Source absent. Jini owns session logic. |
| 160 | `recovery/capability-card.ts` | STAYS-HOST | Tovu archive extension, admin links, tool names, and backup guidance rendered through a shared card type. |
| 161 | `settings/index.ts` | STAYS-HOST | Existing host facade includes principal lookup composition. It does not own the shared settings engine. |
| 162 | `settings/repo.sqlite.ts` | ALREADY-MOVED | Binds local tables and schema-erased kernel to `@jini-ai/db/settings`. |
| 163 | `settings/settings-write-policies.ts` | ALREADY-MOVED | Jini implements the writes and refusals. Tovu supplies the dedicated-writer table and visitor contract. |
| 164 | `settings/tool-registrations.ts` | ALREADY-MOVED | Jini owns settings registration and write handlers. The host supplies execution escalations, locale choices, and confirmation policy. |
| 165 | `settings/visitor-tools-agent-tools.ts` | STAYS-HOST | Binds the host's visitor-tool catalog, phased availability, copy, and approval card to the Jini registrar. |
| 166 | `settings/visitor-tools-permissions.ts` | STAYS-HOST | Registers Tovu's visitor permission with the existing Jini grant mechanism. |
| 167 | `site-backup/archive-extensions.ts` | ALREADY-MOVED | Binds the host lifecycle, theme roots, and archive path mapping to the Jini archive collector. |
| 168 | `site-backup/archive-manifest.ts` | ALREADY-MOVED | Binds schema identity, limits, and path claims to the Jini codec. |
| 169 | `site-backup/download-html-source-edits.ts` | STAYS-HOST | Selects the source-edit and HTML-escape implementations passed to the Jini download rewriter. |
| 170 | `site-backup/import-backend-steps.ts` | ALREADY-MOVED | Source absent. Jini owns the backend phases. |
| 171 | `site-backup/import-database.ts` | ALREADY-MOVED | Binds the Jini rebuild to the host's worker, lock, temp root, and refusal policy. |
| 172 | `site-backup/import-keep-off.ts` | ALREADY-MOVED | Binds the host table projection, no-theme sentinel, and HTML sanitizer to the Jini keep-off pass. |
| 173 | `site-backup/import-plugin-state.ts` | ALREADY-MOVED | Binds host lifecycle, package roots, trusted template reader, and path policy to Jini. |
| 174 | `site-backup/import-registry.ts` | ALREADY-MOVED | Source absent. Jini owns the durable registry. |
| 175 | `site-backup/import-restore-placement.ts` | ALREADY-MOVED | Binds archive path validation and the applicable theme checks to Jini placement helpers. |
| 176 | `site-backup/import-restore.ts` | ALREADY-MOVED | Binds host schema, theme placement, plugin restore, and product warnings to the Jini restore engine. |
| 177 | `site-backup/import-verifier-inventory.ts` | ALREADY-MOVED | Source absent. Jini owns inventory construction and checks. |
| 178 | `site-backup/import-verifier-projection.ts` | ALREADY-MOVED | Binds the archive reader, document admission, and schema projection to Jini. |
| 179 | `site-backup/import-verifier.ts` | ALREADY-MOVED | Binds Jini's verifier and inventory helpers to host redaction, limits, path maps, and bundled files. |
| 180 | `site-backup/package-file-inventory.ts` | ALREADY-MOVED | Binds bundled source selection and archive I/O to Jini inventory helpers. |
| 181 | `site-backup/plan-content.ts` | STAYS-HOST | Owns the Tovu backup/share plan variants and process-local instance of the Jini plan store. |
| 182 | `site-backup/push-content.ts` | MOVE · R1 J07/T07 | Upload and commit sequencing remains local. Manifest identity and cancellation copy are host inputs. |
| 183 | `site-backup/saved-keys.ts` | ALREADY-MOVED | Source absent. Jini owns the saved-key archive implementation. |
| 184 | `site-backup/share-backend.ts` | ALREADY-MOVED | Binds the Jini backend to host expiry, export selection, artifact I/O, and redaction. |
| 185 | `site-backup/share-database/repo.sqlite.ts` | MOVE · 06 | The portable-table trust checks, fresh snapshot copy, and archive-media rewrite still run locally. |
| 186 | `site-backup/share-file-policy.ts` | ALREADY-MOVED | Binds the path checker, redactor, and limits to the Jini file-policy factory. |
| 187 | `site-backup/share-hosting.ts` | ALREADY-MOVED | Binds peer transport, token vocabulary, and the host artifact receiver to Jini. |
| 188 | `site-backup/share-preparation-steps.ts` | ALREADY-MOVED | Source absent. Jini owns the steps and projection contract. |
| 189 | `site-backup/share-preparation.ts` | ALREADY-MOVED | Binds runtime schema, archive extension selection, media ports, and host limits to Jini. |
| 190 | `site-backup/share-registry.ts` | ALREADY-MOVED | Jini owns registry persistence. The host binds its file name and limits. |
| 191 | `site-backup/share-zip.ts` | ALREADY-MOVED | Binds archive paths, source-file checks, and download layout to the Jini ZIP implementation. |
| 192 | `site-backup/sources.ts` | ALREADY-MOVED | Jini owns traversal, reviewed reads, snapshots, and manifest mechanics. Tovu supplies roots, limits, and identity. |
| 193 | `site-backup/static-copy.ts` | ALREADY-MOVED | Source absent. Jini owns static copy. |
| 194 | `site-backup/static-site-packager.ts` | ALREADY-MOVED | Binds archive path claims and the host static-download layout to Jini. |
| 195 | `site-backup/tool-registrations.ts` | MOVE · 06 | Share/import input admission, ordered authorization, refusal mapping, and registrar behavior still live here. |
| 196 | `site-export/export-html-policy.ts` | MOVE · R1 J06/T06 | HTML transformation sequencing is reusable. Native-form stripping selection is host-bound. |
| 197 | `site-export/export-preflight.ts` | ALREADY-MOVED | Source absent. Jini owns preflight and Tovu supplies the copy separately. |
| 198 | `site-export/index.ts` | STAYS-HOST | Existing facade exports real local manifest and exporter bindings. It is not a new Jini surface. |
| 199 | `site-export/media-original-urls.ts` | MOVE · R1 J06/T06 | Verified-origin media rewriting is portable with media lookup and public path inputs. |
| 200 | `site-export/route-manifest.ts` | MOVE · 05 | Route merge, redirect projection, and collision-free probe selection can be shared. Theme and live route vocabulary stay local. |
| 201 | `site-export/site-exporter.ts` | MOVE · R2 | Remaining response/preflight/composition engine needs a split. The Jini export run loop must not be duplicated. |
| 202 | `site-export/static-security-headers.ts` | MOVE · R1 J06/T06 | Header/HTML serialization is portable. The live site's selected header policy stays injected. |
| 203 | `site-inspection/agent-tools.ts` | MOVE · R2 | Reusable input schemas and tool descriptors remain, with copy and permission vocabulary supplied by the host. |
| 204 | `site-inspection/deps.ts` | STAYS-HOST | Narrows host repos, theme/admin-screen facts, Node app and live registry into inspection read ports. |
| 205 | `site-inspection/index.ts` | STAYS-HOST | Existing entry point for the live Tovu inspection bindings. |
| 206 | `site-inspection/tool-registrations.ts` | MOVE · 07 | Input/section validation and permission-ordered dispatch are portable. The loopback render and live egress binding stay local. |
| 207 | `source-control/commit-site.ts` | ALREADY-MOVED | Binds the host exporter, credential readers, artifact cleanup, and compatibility path to the Jini commit engine. |
| 208 | `source-control/credential-setup.ts` | MOVE · R2 | Credential setup projection and lifecycle are still local. The host owns card copy and trusted credential readers. |
| 209 | `source-control/index.ts` | STAYS-HOST | Existing host entry point for still-local credential and provider bindings. |
| 210 | `source-control/provider-registry.ts` | MOVE · 04 | Bundled provider collection and rejection of ambiguous IDs are still local. Trusted loading and pre-rename refusal policy stay host-owned. |
| 211 | `source-control/repo.memory.ts` | STAYS-HOST | Test/composition binding of the host DTO adapter and project half to the existing Jini memory vault. |
| 212 | `source-control/source-control-credential-repo.ts` | STAYS-HOST | Binds the host DTO/canonical/project half to the Jini SQL vault. It is not a second credential repository engine. |
| 213 | `source-control/store.ts` | MOVE · R2 | Canonical credential lifecycle and default resolution still live locally. |
| 214 | `source-control/tool-registrations.ts` | MOVE · R2 | Provider and credential tool orchestration remains beyond the landed commit engine. |
| 215 | `source-control/types.ts` | MOVE · R2 | Shared credential repo/wire shapes are not all owned by Jini yet. Host scope stays a binding. |
| 216 | `taxonomy/agent-tools.ts` | MOVE · R2 | Adds two live read-tool descriptors beyond the Jini write catalog. It is not just the re-export described in its header. |
| 217 | `taxonomy/publish-content.ts` | MOVE · R2 | Taxonomy/term publish contributor behavior remains on the host side of the Jini ports. |
| 218 | `taxonomy/tool-registrations.ts` | ALREADY-MOVED | Jini owns handler assembly. Tovu supplies live getters, attribution, the gateway, content targets, and merge card copy. |
| 219 | `trash/adapters/media.ts` | MOVE · R2 | The media-specific Trash lifecycle remains beyond the shared marker helpers. |
| 220 | `trash/adapters/member.ts` | MOVE · R2 | The member adapter's lifecycle is a portable member-domain operation, not just table selection. |
| 221 | `trash/adapters/post.ts` | MOVE · R2 | The post Trash adapter's remaining revision/marker behavior still needs extraction. |
| 222 | `trash/adapters/redirect.ts` | ALREADY-MOVED | Jini owns the marker/CAS/delete mechanics. Tovu binds redirect status, table IDs, and cascade targets. |
| 223 | `trash/adapters/user.ts` | MOVE · 08 | The locked account transition, session revoke, event, and purge coordination remain local. |
| 224 | `trash/db-port.ts` | STAYS-HOST | A local `ContentKernel` alias, not a portable DB contract. |
| 225 | `trash/move-to-trash.ts` | MOVE · R2 | The live-version check, reauthorization, and dispatcher still need a shared seam. |
| 226 | `trash/permissions.ts` | MOVE · 08 | Permission lookup precedence and per-kind visibility filtering are reusable. The permission map stays host-owned. |
| 227 | `trash/registry.ts` | STAYS-HOST | Defines Tovu table/kind/marker/display/cascade entries for the shared Trash registry. |
| 228 | `trash/repo.sqlite.ts` | ALREADY-MOVED | Jini owns SQL store behavior. The host retains its table binding and same-kernel transaction runner. |
| 229 | `trash/tool-kinds.ts` | STAYS-HOST | Combines the host's bespoke and registered kind policies for tool exposure. |
| 230 | `trash/tool-registrations.ts` | ALREADY-MOVED | Jini owns the list/restore registrar and risk map. Tovu binds metadata, kinds, and row visibility. |
| 231 | `trash/trash-item-tool.ts` | ALREADY-MOVED | Jini owns derived registration. The remaining code supplies local delegates, vocabulary, live-version access, and mover. |
| 232 | `vendor-credentials/repo.memory.ts` | STAYS-HOST | Binds the vendor DTO adapter and kind to the existing Jini memory vault. |
| 233 | `vendor-credentials/types.ts` | MOVE · R2 | Extends Jini's base contracts with remaining credential-hint, repo, and project shapes that need a K4 split. |
| 234 | `vendor-credentials/vault-adapter.ts` | MOVE · R2 | Remaining credential-set projection and vault adapter mechanics need separation from host vault kinds. |
| 235 | `webhooks/http.memory.ts` | ALREADY-MOVED | Source absent. Jini owns the webhook HTTP double. |
| 236 | `webhooks/keyring.env.ts` | MOVE · 09 | Live ordered-source resolution is not equivalent to Jini's existing caching env/file keyring. Salt, source policy, and operator messages stay host-side. |
| 237 | `webhooks/seal-aad-invariant.ts` | MOVE · R1 J09/T09 | The AST walker moves. CLI, workspace scan, and exact exemptions stay local. |
| 238 | `webhooks/secret-scan-guard.ts` | MOVE · 09 | Tip/history scan orchestration and redacted report projection are reusable beyond the existing Jini text matcher. |
| 239 | `webhooks/site-key-ensure.ts` | MOVE · 09 | Jini has a decision table, but the stamp-aware adopt/mint/refuse reconciliation still runs locally. |
| 240 | `webhooks/site-key-sources.ts` | STAYS-HOST | Owns Tovu environment names, legacy file precedence, site metadata, and test-home isolation. |
| 241 | `webhooks/tool-registrations.ts` | ALREADY-MOVED | Jini owns the webhook tools. The host supplies live deps, delete confirmation copy, and the surface store. |
| 242 | `widgets/deps.ts` | STAYS-HOST | Composes real host post read/write, widget removal, locking, and watermark ports. |
| 243 | `widgets/publish-content.ts` | MOVE · R2 | Widget and area contributor behavior remains local. The physical table and host-specific port binding do not move with it. |

## Build sheets

For each new export below, use the neighboring package's `types`, `import`, and `default` entries targeting `./dist/<same-relative-path>`, with the matching environment metadata. A Node entry stays separate from the universal entry. Each changeset names the Jini packages whose API changes. Opus regenerates the named `api-baseline/jini-ai__*.json` files with `pnpm api:update` after building and reviews the diff. SOL writes the named tests first and does not run them. A named mutation is the one deliberate behavior change Opus should use to show the witness fails, then remove.

Keep `_optional = {}` pads and two object arguments on public functions and factories. Internal splits must preserve the current ordering and keep functions at ≤80 lines and complexity ≤10. For optional properties, omit absent keys unless the receiving contract explicitly includes `undefined`. Guard indexed reads. Move mechanism why-comments with the code, keep host policy/history comments on the binding, and leave no forwarding-only file. All route wires, persisted formats, compatibility reads, and host admission rules are unchanged.

### W3C-w1b-01 — Project key attachments and shared OAuth disconnect

**BUILDER: SOL · OPUS-REVIEW**

**Jini add.** `F/project-keys/attachments.ts:5–47` → `J/user-management/src/project-keys/sql/attachments.ts`. `F/project-keys/shared-oauth-disconnect.ts:6–64` → `J/user-management/src/project-keys/shared-oauth-disconnect.ts`. Use the existing core `contracts/site/project-key-attachments` types. The attachment adapter takes a typed SQL port consisting of dialect, `query`, and `execute`, not a Tovu kernel. Bind `jsonText` instead of giving user-management a runtime dependency on the host's DB toolkit.

```ts
createKeyAttachments(required: {
  sql: AttachmentSqlPort
  tables: { attachments: string; vault: string }
  nowIso: () => string
  policy: AttachmentPolicy
}, _optional?: Empty): KeyAttachments

inspectSharedOAuthDisconnect(required: DisconnectOwner & {
  credentialId: string
}, _optional?: Empty): Promise<SharedOAuthDisconnectInspection>

disconnectSharedOAuth(required: DisconnectOwner & {
  credentialId: string
  expectedRevision: number
  expectedDigest: string
}, optional?: { revoke?: ApiConnectionHooks["revoke"] }): Promise<SharedOAuthDisconnectReport>
```

`AttachmentPolicy` carries the owner workspace, eligible credential kinds/subtype, max grants, and the three current refusal strings. Keep the indexed site/key and owner scope filters in the query and the bounded `limit + 1` read. Keep `worksFor` alternatives and duplicate-label refusal in that bounded set. `rows[0]?.key_id ?? null` preserves the absent-row outcome without a cast. Attach must remain idempotent, and every read must see current grant state.

For disconnect, keep `SharedOAuthDisconnectContext` and `SharedOAuthDisconnectStorage` structural and pass the storage-returned context back into `tokensFor` unchanged. Carry `ownerWorkspaceId`, `digest({ text })`, `changedError({})`, `disconnectConnection`, and the unavailable-revocation hook in `DisconnectOwner`. Bind the current SHA-256 implementation on the host. Hash the same serialized `{ credentialId, revision, sites }` with the same site order. Review does not open tokens. Re-read context, owner record, and grants inside the transaction, check revision **and** digest, CAS the pending state, and remove grants before remote revocation. Already-pending retries do not advance the local generation a second time. Shared-owner storage comes from the existing host binding. `w3-ext-w1.md` J05/T04 and `w3-ext-w2.md` J01/T01a–c own their separate storage, vault-view, and create-vault edits.

**Tovu cutover.** `R/project-store.ts:6` and `F/project-keys/__tests__/attachments.unit.test.ts:6` repoint to `@jini-ai/user-management/project-keys/sql/attachments`. Bind the exact current tables, clock, dialect JSON reader, owner scope, and messages there or in a real `attachment-policy.ts` binding used by both. Delete `attachments.ts`. For disconnect, put the host digest, owner scope, and error/revoke bindings in `F/project-keys/shared-oauth-disconnect-host.ts`. Repoint `W/cli/commands/owner-store.ts:3` and the integration fixtures `F/api-connections/__tests__/{shared-api.unit.test.ts:9,shared-owner.integration.test.ts:19}` to that binding. Repoint `F/project-keys/__tests__/{shared-oauth-disconnect.unit.test.ts:5,a02-credential-contract.pin.unit.test.ts:13}` to Jini for mechanisms and storage/context types, using the host binding in the fixture when asserting host wire bytes. Delete the original `shared-oauth-disconnect.ts`.

**Tests first.** `project-keys/__tests__/attachments.test.ts` — `a detached key stops matching its worksFor label on the next lookup`, mutation `PK-CACHE-ATTACHMENTS`. Include duplicate, over-cap, and wrong-site cases. `project-keys/__tests__/shared-oauth-disconnect.test.ts` — `a grant change blocks the disconnect before tokens or provider I/O`, mutation `PK-DISCONNECT-IGNORE-GRANT-DIGEST`. Pin no-token inspection, grants removed before revoke, and retry after remote refusal.

**Package.** `user-management/package.json` adds `./project-keys/sql/attachments` and `./project-keys/shared-oauth-disconnect`. `.changeset/w3c-w1b-project-keys.md`. Baseline `jini-ai__user-management.json`.

### W3C-w1b-02 — Post repository and inverse application

**BUILDER: SOL · OPUS-REVIEW**

**Jini add.** `F/post/repo.ts:41–369` → `J/cms/src/posts/sql/repo.ts`. `F/post/reverters.ts:31–333` → `J/cms/src/posts/reverters.ts`. `post/repo.rows.ts` is outside this job. Do not make its extraction a prerequisite. The current host mappers can implement the new `PostRowCodec` directly.

- `SqlPostRepo` takes `constructor(required: SqlPostRepoDeps, _optional: Empty = {})`. `postRepoFor(required: SqlPostRepoDeps, _optional: Empty = {}): SqlPostRepo` constructs it. `SqlPostRepoDeps` has the schema-erased `StorageKernel<Kysely<unknown>, unknown>` used by Jini `posts/sql` today, `search: PostSearchProjection`, `rows: PostRowCodec`, `mediaAccessEvidence: Pick<MediaAccessEvidence, "invalidate">`, `newRevisionId`, `revisionLockKey({ workspaceId, postId })`, and `notHeldAgentSchedule: Expression<boolean>`. Give the query callback a `withTables<PostSqlTables>()` view over this **same** kernel. Derive the structural column types for `posts` and `post_revisions` from `W/platform/db/content-database.generated.ts:709,724`, copying only the referenced schema shape. `PostRowCodec` has the five existing mapper signatures at `F/post/repo.rows.ts:71,146,192,218,237` over that slice. No DB or row assertion to `any`.
- Bind the live hold predicate at `repo.ts:41` in Tovu so its `agent_pause_holds` table and semantics do not become a Jini DB dependency. Keep it on the same queries. Inject `currentIso` as `nowIso` where the caller has not supplied a time. Preserve transaction nesting, release of media evidence at the current points, CAS without upsert on a lost version, and lock-before-read-before-append at `:329–348`. Do not migrate tables or reinterpret existing actor fields.
- Keep `createPostReverters(required: PostReverterDeps, _optional: Empty = {})` and `createPostRevertRegistry(required: PostReverterDeps, _optional: Empty = {}): RevertRegistry`. Replace the host `ForgetRemovedPostFn` import with `forgetRemoved(required: { workspaceId: string; id: string }, optional?: Empty): Promise<void>` in the existing deps. Preserve pre-image `ext` removal, revision lookup by matching sequence, prior-marker no-op, schedule-aware events, and index forgetting in the same transaction. Same-package post writes and command registry primitives remain with their existing owners.

**Tovu cutover.** `F/post/repo.ts:372–374` remains a real `postRepoFor` binding. It constructs the current Jini search projection and passes row codecs, the time and ID providers, the live hold predicate, and `W/contracts/core/post-revision-lock.ts` over the same erased kernel. Remove the local class. `F/post/repo.sqlite.ts:4` imports the class from `@jini-ai/cms/posts/sql/repo` and passes the same assembled deps to `super`. `F/navigation/__tests__/footer-page-links.test.ts:17,152` uses the bound factory with a test evidence port. `F/pages/__tests__/{html-document-store.go-live.test.ts:8,html-document-store.revisions.test.ts:9}` split the class type from the bound factory import. All other `postRepoFor` callers keep the real host factory and its existing call shape.

For the reverter, remove `F/post/index.ts:13` and delete `F/post/reverters.ts`. Repoint the moved names to `@jini-ai/cms/posts/reverters` at:

- `F/post/__tests__/{L156-characterization.test.ts:9,post.author.test.ts:7,publish-content.test.ts:29,reverters.schedule-events.test.ts:15,reverters.test.ts:6,tool-registrations.partial-update.test.ts:21}`
- `W/contracts/core/commands/__tests__/{integration/revert-plugin-ext.integration.test.ts:6,8,post-delete-reverter.test.ts:4}`
- `F/{change-sets/__tests__/tool-registrations.test.ts:20,trash/__tests__/post-delete-undo-index.test.ts:9}`
- `R/{memory-deps/route-deps/assistant-and-site.ts:18,site-deps/route-deps-site-providers.ts:28}`

Mixed imports retain the unmoved names from the host barrel. The latter two composition sites still supply the same `forgetRemoved` function. `w3-p11rest.md` ST-13.T may change the revision fence at this seam. Preserve the host callable lock either way, and do not reimplement revision thinning here.

**Tests first.** `posts/sql/__tests__/repo-revision-chain.test.ts` — `a concurrent append reads the previous committed revision under the same lock`, mutation `POST-REVISION-READ-BEFORE-LOCK`. Carry the existing SQLite/PGlite/Postgres parity and hold witnesses. `posts/__tests__/reverters.test.ts` — `undo of an earlier already-trashed inverse does not forget the current Trash row`, mutation `POST-REVERT-FORGET-INDEPENDENT-MARKER`. Pin the published/draft/scheduled event matrix and rollback.

**Package.** `cms/package.json` adds `./posts/sql/repo` (Node) and `./posts/reverters` (universal). `.changeset/w3c-w1b-post-storage-revert.md`. Baseline `jini-ai__cms.json`.

### W3C-w1b-03 — Publish-content raw-row adapter and tool orchestration

**BUILDER: SOL · OPUS-REVIEW**

**Jini add.**

- `F/publish-content/publish-backstop-row.sqlite.ts:8–103` → `J/cms/src/publish/content/sql/raw-row-sqlite.ts`. Export `createRawRowSqlitePort({ kernel, tableInfo, checkedTransaction, checkTable, copy }, _optional: Empty = {}): RawRowPort`. `kernel` needs only `dialect`, `inTransaction`, `query<Row>({ statement })`, and `execute({ statement })` over `RawBuilder`, not Tovu's `ContentKernel`. `tableInfo({ table })` and `checkedTransaction({ work, onViolation })` close over the **same** host kernel. `checkTable({ table, columns }): string | undefined` binds the host refusal table. `copy` supplies the current non-SQLite and FK refusal formatting. Keep policy checks on both requested and discovered columns, validate identifiers separately from values, and preserve complete-PK and exact row-shape checks. Keep checked outer transactions and nested join behavior. No open, schema install, policy relaxation, or added fallback.
- `F/publish-content/tool-registrations.ts:86–106,118–383,405–515` → `J/cms/src/publish/content/tool-registrations.ts` and private sibling handlers. Preserve `plainSentence({ text, fallback }, _optional = {})`, `publishContentDerivedRisk`, and `buildPublishContentRegistrations({ deps, ports }, _optional: Empty = {}): ToolRegistration[]`. `PublishRegistrationDeps` carries workspace, legacy authorizer, clock, peer-list, active-bundle, and run-audit slices. `PublishRegistrationPorts` has `findCandidate`, `countPublishableTypes`, `connect`, `grantReverse`, `publish`, `stagePull`, `buildPullHooks`, `planPull`, `confirmPull`, `executePull`, `confirmedToolHandler`, and typed error predicates/projection. The hook and gateway types come from the existing Jini/core contracts or are structural at call sites. The host binds its gateway deps and `makePublishContentDeps` under those ports. Do not move `TovuPublishPorts`, Express, host trust constants, the host catalog projection, or the actual provisioning guard at `:110` into Jini.
- Readiness tests need three separate cases: connected, only deliberately configured, and no peers. Only the third may read the suggestion. Preserve requested-peer selection, permission before stage/load, both bundle and audit subject checks, plan/audit write order, overwrite allowlisting against the fresh report, and human confirmation before execute. Keep the separate autonomous publish behavior unchanged. Inject current copy and card description, and retain the plugin-error projection without rendering unknown exceptions. `w3-ext-crp.md` CRP-06.J/T concerns HTTP error writers, not these handlers.

**Tovu cutover.** Replace `publish-backstop-row.sqlite.ts` with `F/publish-content/backstop-sqlite-binding.ts`, defining a real host factory with the current `createRawRowSqlitePort` caller ABI. Bind `checkRawTable` and the current table-info and checked-transaction implementations there. Repoint:

- `F/publish-content/__tests__/{backstop-batch.apply-loop.test.ts:7,raw-row-contributor.test.ts:8}`
- `W/platform/db/sqlite/__tests__/publish-backstop-row.sqlite.test.ts:11`
- `W/server/inbound/admin-http/routes/publish-content/__tests__/{backstop-import-ui.routes.test.ts:8,import.routes.pins.test.ts:15}`
- `R/{__tests__/publish-content-manifest.test.ts:42,publish-backstop-ports.ts:3}`

Keep `F/publish-content/tool-registrations.ts` as the real binder and contributor installed at `R/tool-catalog-manifest.ts:119`. Keep `requirePublishTrustProvisioning` there for `F/publish-content/disconnect-tool.ts:3`. Remove the type forward at `:1`. Repoint `PublishContentToolDeps` directly to `tool-deps.ts` at `W/assistant/tool-registrations.ts:60`, `F/publish-content/disconnect-tool.ts:3`, and `F/publish-content/__tests__/{backstop-gaps-tool.test.ts:4,execute-pull-tool.plugin-hook-refusal.test.ts:38,publish-agent-tools.test.ts:16,publish-trust-provisioning-root.test.ts:16,pull-tool-fixture.ts:14}`. In `backstop-gaps-tool.test.ts:4` take risk from Jini, and in `publish-agent-tools.test.ts:16` take `plainSentence` from Jini. `plan-pull-tool.test.ts:75`, `publish-tool.test.ts:9`, and `pull-tool-fixture.ts:107` keep the actual host contributor/binder. Do not move or replace the already-landed `pull`, `publish-tool`, or peer transport owners.

**Tests first.** `publish/content/sql/__tests__/raw-row-sqlite.test.ts` — `nested mutation joins one checked transaction and the outer refusal rolls it back`, mutation `PUB-ROW-CHECK-FKS-INSIDE-JOIN`. Also pin no table I/O on a denied table and no mutation on incomplete identity. `publish/content/__tests__/tool-registrations.test.ts` — `another caller cannot prepare execution even with a live reviewed bundle`, mutation `PUB-PULL-SKIP-AUDIT-ACTOR`. Keep negative permission, restore-point, stale plan, plugin error, and unchanged push-wire cases.

**Package.** `cms/package.json` adds `./publish/content/sql/raw-row-sqlite` (Node) and `./publish/content/tool-registrations` (universal). `.changeset/w3c-w1b-publish-tools.md`. Baseline `jini-ai__cms.json`.

### W3C-w1b-04 — Source-control bundled provider aggregation

**BUILDER: SOL · OPUS-REVIEW**

**Jini add.** Move `F/source-control/provider-registry.ts:145–175`'s generic collection and duplicate handling to `J/devops/src/source-control/site/bundled-provider-registry.ts`. Keep the active loader at `:91–108`, the pre-rename data-only refusal at `:110–120`, source-directory loading at `:127`, descriptor extensions, and host root selection in Tovu. Jini's `source-control/registry.ts:122–206` remains the owner of the existing catalog/provider builders. Do not copy them.

```ts
collectBundledSourceControlProviders<Source extends { pluginId: string }, Provider>(
  required: {
    sources: () => readonly Source[]
    load: (required: { source: Source }) => Promise<{
      providers: readonly Provider[]
      refusals: readonly string[]
    }>
    providerId: (required: { provider: Provider }) => string
    reportSourceFailure: (required: { error: unknown }) => void
    copy: BundledProviderRefusalCopy
  },
  _optional?: Empty,
): Promise<{ providers: readonly Provider[]; refusals: readonly string[] }>
```

The copy port supplies the current source failure, per-package failure by plugin ID, and duplicate-ID refusal. Loop in existing source order, append each source's refusals in place, then remove **every** provider with an ambiguous ID. Do not pass a caught import exception to the public refusal or broaden eligibility for source imports. Only enumeration errors reach the existing host log redactor. Use explicit result types and `Map` lookups without non-null assertions.

**Tovu cutover.** Keep `F/source-control/provider-registry.ts:138` as the real `loadBundledSourceControlProviderRegistry` binder. It invokes the new subpath with the existing `sources`/`load` overrides and maps the result through `toRegistry`. Delete its original aggregation loop. The public binder's import paths stay at `W/cli/commands/owner-store-mapping.ts:4`, `R/memory-deps/route-deps/publish-export.ts:23`, `F/source-control/__tests__/gates.characterization.unit.test.ts:21`, and `F/source-control/__tests__/provider-registry.unit.test.ts:299,318,335,344,367` for the existing dynamic imports. Keep the separate `loadSourceControlProviderRegistryFromSource` test importers and installed digest/activation loaders on their current host bindings. No credential-store edits from the R2 paths.

**Tests first.** `source-control/site/__tests__/bundled-provider-registry.test.ts` — `three declarations of the same id yield one refusal and no selectable provider`, mutation `SC-BUNDLED-LAST-DUPLICATE-WINS`. Also pin source enumeration failure, import failure without exception text, original refusal order, and no eager source read during binder construction. Keep the host tests for active legacy copies and inactive packages.

**Package.** `devops/package.json` adds `./source-control/site/bundled-provider-registry` (universal with injected loaders). `.changeset/w3c-w1b-source-control-registry.md`. Baseline `jini-ai__devops.json`.

### W3C-w1b-05 — Static export route manifest

**BUILDER: SOL**

**Jini add.** Extract `F/site-export/route-manifest.ts:133–139,171–270,273–339`'s manifest construction to `J/devops/src/static-export/site/route-manifest.ts`. Reuse `ManifestRoute`, `ManifestSkip`, and `RouteManifest` in `static-export/site/ports.ts:53,85,90`. Do not move the Tovu theme object, theme resolver, or site conventions.

```ts
buildRouteManifest(required: {
  sources: RouteManifestSources
  policy: RouteManifestPolicy
}, _optional?: Empty): Promise<RouteManifest>
```

`RouteManifestSources` supplies `readThemeAndPosts`, `listProducts`, and `listActiveRedirects`, called in the same order as today, with the theme ID and published rows read in parallel inside the host binding. Use a discriminated theme input with `selected`, `absent`, and `deliberately-off` variants. The selected variant only has manifest theme identity, tier, and supplied page facts. Post rows only need slug, title, kind, and the existing `overridesThemePage` value. Redirect rows only need match type, pattern, target, and status. `RouteManifestPolicy` supplies initial routes and skips, probe base and suffix generator, post/product path functions, standalone theme-page predicate, and skip copy. Bind Tovu's convention routes, `/products` projection, theme sentinel, and probe base in the host. Preserve the tri-state collision precedence, replacement of only the seeded homepage, order of remaining routes, exact-redirect behavior, distinct skip details, and probe exclusion against **all** paths. Use a guarded splice or indexed read before replacing the homepage.

**Tovu cutover.** `route-manifest.ts:83,107,273` stays as a real host `RouteManifestDeps` and `buildRouteManifest` binding. Remove its local merge, redirect, and probe implementations and import the Jini implementation under a different local name. Keep the existing host wire witnesses `F/site-export/__tests__/{index.test.ts:4–5,route-manifest.test.ts:12,theme-preview-manifest.test.ts:13}`, `F/site-export/{index.ts:5,site-exporter.ts:15,theme-preview-manifest.ts:4}`, and `W/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts:17` on that binding. No new barrel. `w3-ext-w2.md` J06/T06 handles transforms separately. `site-exporter.ts` itself is R2-excluded.

**Tests first.** `static-export/site/__tests__/route-manifest.test.ts` — `explicit false preserves the standalone theme route while an unset override preserves the post`, mutation `EXPORT-IGNORE-EXPLICIT-THEME-OVERRIDE`. Add `404 probe cannot collide with any contributed path`, mutation `EXPORT-PROBE-BEFORE-REDIRECTS`. Pin unique homepage, no products, differing absent/off reasons, and stable order.

**Package.** `devops/package.json` adds `./static-export/site/route-manifest` (universal). `.changeset/w3c-w1b-static-route-manifest.md`. Baseline `jini-ai__devops.json`.

### W3C-w1b-06 — Site backup database projection and tool admission

**BUILDER: SOL · OPUS-REVIEW**

**Jini add.** The two pieces share a feature sheet but have separate exports.

- `F/site-backup/share-database/repo.sqlite.ts:31–144,322–372,399–451` → `J/devops/src/backup/site/share-database/`, with public entry `repo.sqlite.ts` and private helpers. Move plugin table admission, checked column copy, fresh-target sequencing, and the archived-copy rewrite driver. Define narrow source/target database ports and an owned-staging port in the feature. Keep the Kysely schema mapping local to a SQL adapter. No dependency on Tovu's generated schema or SQLite constructor.
- `prepareSharePluginTables({ target, present, modules, declarePortable, report }, _optional = {})` returns the existing `{ portable, private }` sets. `refuseUnknownShareTables({ source, trusted, excludesPrivate, reportName }, _optional = {})` keeps fail-closed behavior and reporting. The host supplies the current legacy-private, chat, and backup-table exclusions. `sanitizeShareDatabase({ snapshot, modules, ports, policy }, { signal, omittedMediaIds } = {})` returns the existing `ShareDatabaseProjection<TMedia>` from `devops/backup/site/share-preparation-steps.ts:32`. `rewriteArchiveMedia({ bytes, copies, ports }, { signal } = {})` returns `Promise<Buffer>`. Open and close ports distinguish read-only source and fresh target. They return session objects with the exact query, serialization, transaction, and close capabilities used. Preserve separate per-operation temp roots, exclusive staging, and cleanup on every result.
- The Tovu binder supplies `SHARE_TABLES`, `ADDITIVE_COLUMN_DEFAULTS`, `PUBLISHABLE_SETTINGS`, the disk thresholds and copy, and the site redactor. Bind row/settings/media/document projections from `:145–316,373–392` where they name the host schema. At `:415–451`, pass the host's rewrite columns and media-row patching as the operation inside the Jini-owned transaction, not a different live store. Keep per-row redaction and omission at their existing boundaries. No copying private/unknown columns into a temporary portable result, no live database writes, and no schema migration. Rebuild search only after the sanitized copy and before serialization. Pass optional abort and omitted-ID fields by conditional spread or explicit contract union.
- `F/site-backup/tool-registrations.ts:43–253` → `J/devops/src/backup/site/tool-registrations.ts`. Export `buildSiteBackupRegistrations({ deps, catalog, policy }, _optional: Empty = {}): ToolRegistration[]`, with an injected `createSiteBackupCatalog({ copy, ids, permissions }, _optional = {})` and shared risk. `deps` takes workspace, authorizer, and `plan`, `push`, `share`, `importBackup`, and `listImports` operation slices. The host supplies `parseStaticExportInput`, `parseSiteImportListQuery`, the metadata and import permission/entity names, `CustomCredentialValidationError` classification, and refusal copy. Keep class-based `SiteShareRefusal` mapping, exact parser response shapes, and order of checks. In particular, import permission precedes download, upload consumption, and registry writes. Do not make devops import a CMS admin registrar to obtain a cursor parser.

**Tovu cutover.** Keep `F/site-backup/share-database/repo.sqlite.ts` as the actual schema and staging binding, with the five host port implementations above. Replace its moved implementations, not its consumer-facing port. The direct binding users are `R/{import-database/repo.sqlite.ts:15,retention-policies/temp-roots.test.ts:15,site-portability.ts:4,50}`, `F/site-backup/__tests__/integration/share-database-blobs.integration.test.ts:12`, and `W/platform/db/sqlite/__tests__/share-database.integration.test.ts:19`. At `R/site-portability.ts:50`, keep an actual host-bound function or import the existing binding at its consumer, not a new forwarding module. The public route and package fixtures using host `site-portability` otherwise keep the same contracts.

Keep `F/site-backup/tool-registrations.ts` as a binder and contributor. `R/tool-catalog-manifest.ts:166` still installs it. Remove the unrelated forwarding at `:34`. Repoint the type imports in `W/assistant/tool-registrations.ts:56` and `F/site-backup/__tests__/{import-tools.unit.test.ts:5,tool-registrations.unit.test.ts:25}` to `backup-service.ts`, including `PushResult` at the latter import. Move the pure risk assertion there to Jini. The following keep the real host binder/catalog: `W/assistant/__tests__/tool-registrations.contracts.test.ts:83`, `F/site-backup/__tests__/{tool-registrations-host-connection.unit.test.ts:40,import-tools.unit.test.ts:5,tool-registrations.unit.test.ts:25}`, and `W/server/inbound/admin-http/routes/system/site-shares.integration.test.ts:66`. The already-assigned `w3-ext-w2.md` J07/T07 push cut and `w3-arch.md` R03.SHARE-KEY.J/T are separate. Preserve their existing seams without duplicating them.

**Tests first.** `backup/site/share-database/__tests__/projection.test.ts` — `an unknown source table refuses before serializing anything`, mutation `BACKUP-COPY-BEFORE-TABLE-ADMISSION`. Add `private plugin sidecars do not enter the projection and the source stays read-only`, mutation `BACKUP-PROJECT-PRIVATE-PLUGIN-TABLE`. Pin abort, insufficient staging, cleanup, continued document/media ownership, and rollback of a failed archive rewrite. `backup/site/__tests__/tool-registrations.test.ts` — `denied import never consumes a staged upload or touches the registry`, mutation `BACKUP-IMPORT-ADMIT-AFTER-EFFECT`. Carry the exact share list/revoke and import cursor refusal witnesses.

**Package.** `devops/package.json` adds `./backup/site/share-database/repo.sqlite` (Node) and `./backup/site/tool-registrations` (universal). `.changeset/w3c-w1b-site-backup.md`. Baseline `jini-ai__devops.json`.

### W3C-w1b-07 — Site inspection tool registrar

**BUILDER: SOL · OPUS-REVIEW**

**Jini add.** Move `F/site-inspection/tool-registrations.ts:58,77–148,154–200` to `J/cms/src/site-inspection/tool-registrations.ts`, keeping `:73,150–152,214–227` as host policy/composition. Export `buildSiteInspectionRegistrations({ deps, catalog, policy }, _optional: Empty = {}): ToolRegistration[]` and `siteInspectionDerivedRisk`. The deps are `authorize`, `workspaceId`, `profile`, `capabilities`, `fetchPublishedPage`, and optional `fetchLiveUrl`. The two fetch callbacks take structural operation inputs and return the existing sanitized result. The host adapts the Node app, `listKnownLiveOrigins`, observability, guarded HTTP, and reserved segments outside the package. Do not make `SiteInspectionToolDeps` from `F/site-inspection/deps.ts:76` the Jini deps type.

Keep the section vocabulary and exact null/undefined handling. Select section names through an explicit type predicate or a typed selection map rather than asserting unknown input is `N[]`. Profile/capabilities continue to authorize per section, not through a new blanket read gate. Fetchers keep path/body validation, then permission, and only then loopback or guarded network I/O. `policy` supplies exact error copy, metadata/catalog identity, and the existing shape-error predicate. Do not port the R2-owned catalog as part of this change. `404`, redacted egress denial, and missing guarded client remain distinct.

**Tovu cutover.** Keep `F/site-inspection/tool-registrations.ts:154,214` as the host binder and contributor. Close the Jini callbacks over `toSiteProfileDeps`, `toSiteCapabilitiesDeps`, and the existing fetchers. Retain the actual host binder at `F/site-inspection/index.ts:31–35` and `R/tool-catalog-manifest.ts:168`. Remove the type forward at `tool-registrations.ts:60` and import `SiteInspectionToolDeps` from `deps.ts` in `W/assistant/__tests__/owner-chat-tool-inputs.unit.test.ts:9`. `F/site-inspection/__tests__/{fetch-live-url.test.ts:9,published-page.observability.unit.test.ts:15,tool-registrations.unit.test.ts:25}` keep their host-wiring witnesses. Put new pure registrar and risk witnesses in Jini. The `W/assistant/tool-registrations.ts:64` host type import stays through `index.ts:18–23`.

**Tests first.** `site-inspection/__tests__/tool-registrations.test.ts` — `permission refusal reaches neither the live client nor the published-page renderer`, mutation `INSPECTION-FETCH-BEFORE-AUTH`. Add `profile keeps accessible sections when another section is unauthorized`, mutation `INSPECTION-ADD-BLANKET-READ-GATE`. Pin unknown sections, input/schema refusal, disconnected live client, and read-only registration risk.

**Package.** `cms/package.json` adds `./site-inspection/tool-registrations` (universal). `.changeset/w3c-w1b-site-inspection.md`. Baseline `jini-ai__cms.json`.

### W3C-w1b-08 — Trash visibility and user lifecycle adapter

**BUILDER: SOL · OPUS-REVIEW**

**Jini add.**

- Put the dependency-free adapter contract at `J/core/src/contracts/site/cms-trash.ts` alongside `TrashActor`. Move the shared shapes actually needed by both domains from `J/cms/src/trash/ports.ts:15–103` (`TrashDisplay`, `TrashMarkerResult`, `TrashPurgeOutcome`, `TrashAdapter` and their parameter shapes). Keep compatibility exports on the existing CMS API surface, not a new compatibility module. User management must not import CMS.
- `F/trash/adapters/user.ts:33–250` → `J/user-management/src/identity/sql/user-trash-adapter.ts`. `createUserTrashAdapter({ kernel, policy, purge, eventValues, idGen, clock }, _optional: Empty = {}): TrashAdapter`. `kernel` is the erased storage view using typed `withTables<UserTrashTables>()` for `principals`, `identity_users`, `sessions`, and the outbox insert. `policy` supplies `assertAccountAction`, lock-key construction, and the host state/entity vocabulary if needed. Bind the current purge port and event encoder, never a second purge implementation. Keep the caller principal in the account-action guard, but do not infer one for retention. Carry the exact transaction scope, row lock, status CAS, session deletion, and outbox ordering. Unhide does not resurrect sessions. Purge still refuses a live user and delegates to the protected purge port inside the same lock. Do not change actor persistence or account-protection policy.
- `F/trash/permissions.ts:68–146` → `J/cms/src/trash/visibility.ts`. `trashPermissionFor({ entityType, registry, permissions }, _optional = {})`, `mayActOnEntityType({ deps, principalId, entityType, entityId }, _optional = {})`, `filterVisibleTrashItems({ deps, principalId, items }, _optional = {})`, and `trashDaysRemaining({ now, until }, _optional = {})`. `deps` contains workspace, the authorizer, registry, and bespoke permission map. Keep map-first precedence, deny unknown types without an auth call, and authorize once per distinct kind **after** pagination. Preserve incoming cursor behavior by returning only the filtered rows. Put the shared structural `TrashAuthorizeFn` in the existing core contract. Its optional ID field can explicitly accept `undefined` if needed to preserve the current host ABI.

**Tovu cutover.** `F/trash/adapters/user.ts` becomes the actual host user adapter binding, passing the erased kernel, protected-account callback, event encoder, and current lock key to user-management. Keep its binding imports at `W/__tests__/lane-su-pins/p1b-lock-keys-media-trash-members.test.ts:6`, `F/trash/__tests__/{account-protections.test.ts:6,user-adapter.dialects.test.ts:9,user-adapter.test.ts:14}`, and `W/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts:25`. The existing local barrel `F/trash/index.ts:84–85` may expose the real binder, not forward a Jini class. Its host callers at `F/identity/__tests__/delete-user-service.test.ts:9` and `R/{__tests__/account-purge-protections.test.ts:15,site-deps/trash-adapters.ts:9,20,site-deps/trash-service.ts:4,trash-user-admin-override.ts:5}` keep the binder. The host policy constant remains the same for `permissions.ts:27` and `trash-item-tool.ts:53`.

Keep `F/trash/permissions.ts:31–57` and the real bound permission helpers for existing host callers. Delete their second lookup/filter implementations. Repoint `trashDaysRemaining` in `F/trash/tool-registrations.ts:6` to `@jini-ai/cms/trash/visibility`. Remove the `TrashAuthorizeFn` forward at `F/trash/index.ts:58` and repoint that type at `F/trash/{move-to-trash.ts:19,__tests__/move-to-trash.test.ts:15}` and `R/trash-user-admin-override.ts:5` to core. This change to `move-to-trash.ts` is an import-only adjustment, not a second extraction. `F/trash/__tests__/{email-template-trash-flow.test.ts:19,user-adapter.test.ts:15}` and `R/permanent-delete-deps.ts:13` keep the bound permission helpers used by the host. Do not co-dispatch the R2-excluded media/member/post adapters.

**Tests first.** `identity/sql/__tests__/user-trash-adapter.test.ts` — `a status race does not revoke sessions or emit a trash event`, mutation `USER-TRASH-DROP-STATUS-CAS`. Add `a failed protected-account guard precedes all durable writes`, mutation `USER-TRASH-GUARD-AFTER-WRITE`. Retain the existing account and dialect tests. `trash/__tests__/visibility.test.ts` — `an unknown kind is hidden and a short page keeps its source cursor`, mutation `TRASH-ALLOW-UNKNOWN-KIND`. Pin map precedence and one decision per kind.

**Package.** `user-management/package.json` adds `./identity/sql/user-trash-adapter` (Node). `cms/package.json` adds `./trash/visibility` (universal). Extend the existing core `./contracts/site/cms-trash` entry. `.changeset/w3c-w1b-trash.md`. Baselines `jini-ai__core.json`, `jini-ai__cms.json`, and `jini-ai__user-management.json`.

### W3C-w1b-09 — Webhook-adjacent root keys and repository secret scanning

**BUILDER: SOL · OPUS-REVIEW**

**Jini add.** Platform already owns root-key parsing, derivation, and the decision table. Diagnostics already owns secret-shape matching. Neither needs a new copy of those primitives.

- `F/webhooks/keyring.env.ts:124–164,201–249,373–405` → `J/platform/src/secrets/root-key/ordered-source-keyring.ts`. Implement `createOrderedRootKeyring<Source>({ sources, read, keyId, hkdfSalt, errors }, _optional: Empty = {}): KeyringPort` and `readOrderedRootKey<Source>({ sources, read, parse }, _optional: Empty = {})`. `read({ source })` returns `string | undefined`. The result of the latter function distinguishes absent, present-invalid, and present-valid without exposing raw data to diagnostics. Bind the existing parser and fixed-key implementation. `errors` constructs the existing no-source and invalid-source errors from source/parse facts, not raw material. The source reader is invoked on each derive, in order, and a **present invalid** key stops the walk. Do not change or silently swap in Jini's cached `EnvOrFileKeyring` at `platform/src/secrets/keyring.env.ts:47`. Host inspection/reveal continue to project the existing explicit status shapes, with reveal admission unchanged.
- `F/webhooks/site-key-ensure.ts:219–255,278–341,368–405` → `J/platform/src/secrets/root-key/reconcile.ts`. Extend the local feature using `root-key/decide.ts:44,67,91,102`, not a second decision table. Export `reconcileRootKey({ perSite, otherSources, stamp, ports }, _optional: Empty = {})`. `ports` provides ordered `read({ source })`, `fingerprint({ hex })`, `hasDependentData({})`, `moveAside({ expectedContent })`, `createExclusive({ hex })`, `readStamp({})`, `writeStamp({ stamp, fingerprint })`, and `mint({})`. The result carries action/reason/fingerprint. Tovu adds the file path. Preserve the first matching stamped source, the pre-write mismatch check, the re-read of the authoritative final bytes, and the refusal to restamp data backed by a different key. Keep the current check boundaries and memoization. Use an exhaustive discriminant switch on verdicts and outcomes. This cut does **not** replace Tovu's filesystem operations, alter production no-op, or change legacy path precedence. `installSiteKey` and mode/site metadata binding remain host-side. The existing file arbitration at `:803–833` stays the host's `createExclusive` port for this sheet.
- `F/webhooks/secret-scan-guard.ts:172–194,215–276,390–404` → `J/diagnostics/src/redaction/repo-secret-scan.ts`. Export `scanTrackedRepo({ ports, policy }, _optional: Empty = {}): SecretScanViolation[]` and `scanRepoHistory({ ports, policy }, _optional: Empty = {}): SecretScanViolation[]`. Ports return tracked paths, historical paths, selected historical blob refs, and bounded content reads. `policy` supplies extension/size selection and the exact allowlist predicate. Move the path and content report shaping and the loops. Call the existing `scanTextForSecrets` and emit no matched value in path, line, or binary reports. Detect a path hit before content filtering or blob deduplication, and preserve history reference ordering. Host Git/FS command execution, roots, exact allowlist entries, and CLI output stay outside the universal export. This is a move of current behavior, not a history scanner policy change.

**Tovu cutover.** `F/webhooks/keyring.env.ts` stays the actual adapter for the frozen salt, `SiteKeySource` ordering, current process-env reader, inspect/reveal presentation, local error identities, and directory behavior. Its many current consumers keep that binding. Replace the ordered lookup and derive bodies there with the Jini calls and keep crypto arguments unchanged. `F/webhooks/site-key-sources.ts` remains the only host source-policy module.

At `F/webhooks/site-key-ensure.ts:219`, bind the existing filesystem, key-dependent-data, stamp, path, and metadata callbacks to the Jini reconciler. Delete the superseded decision/application helpers there. Keep the real boot, per-site ensure, and install bindings. Repoint only the pure `planSiteKeyEnsure` and `SiteKeyMaterialCheck` test imports at `F/webhooks/__tests__/site-key-ensure.unit.test.ts:19` to `@jini-ai/platform/secrets/root-key`, supplying the same normalized verdict inputs that the host wrapper supplies. The existing plan wrapper can be deleted when those imports are gone. Compatibility-sensitive consumers keep the host binding:

- `W/{index.ts:19,cli/commands/serve.ts:25}`, `R/{http-app/mount-admin-system.ts:16,pending-agent-plugin-tokens.ts:6,project-store.ts:22,site-key-recovery.ts:12,storage-secret.ts:11,102}`
- `F/webhooks/__tests__/{fixtures/site-key-ensure-child.ts:4,site-key-ensure.pins.unit.test.ts:11,site-key-ensure.sources-boundary.unit.test.ts:24,site-key-ensure.unit.test.ts:19}`
- `W/platform/site-dir/__tests__/integration/{duplicate-site.integration.test.ts:18,key-only-site-meta.integration.test.ts:11}` and `R/__tests__/site-key-recovery.unit.test.ts:14`

Keep the inbound no-import witness unchanged. At `secret-scan-guard.ts:253,390`, replace the moved loops with Jini calls. Keep the exact CLI binding at `package.json:64` and the temp-repo CLI fixture in `F/webhooks/__tests__/secret-scan-guard.test.ts:203,205`. `secret-scan-guard.paths.unit.test.ts:8` and `secret-scan-guard.test.ts:12` still import the bound scanners. Move any matcher constants/types imported at `secret-scan-guard.test.ts:12` directly to the existing `@jini-ai/diagnostics/redaction/secrets-only` entry and remove the forwarding exports from `:8`. When touching the CLI guard, capture and narrow `const entry = process.argv[1]` before passing it to `pathToFileURL`. Do not duplicate R1 J09/T09's Seal-AAD work.

**Tests first.** `secrets/root-key/__tests__/ordered-source-keyring.test.ts` — `a changed recovery file is read on the next derivation` and `a present invalid source never falls through`, mutations `ROOT-KEY-CACHE-LIVE-READ` and `ROOT-KEY-SKIP-INVALID`. `secrets/root-key/__tests__/reconcile.test.ts` — `mismatched adoption with dependent data writes and stamps nothing`, mutation `ROOT-KEY-ADOPT-BEFORE-STAMP-CHECK`. Pin racing exclusive-create winner bytes. `redaction/__tests__/repo-secret-scan.test.ts` — `a credential-shaped path is reported redacted even when its content is skipped`, mutation `REPO-SCAN-FILTER-PATH-BEFORE-SCANNING`. Pin that tip and history never return matched bytes and the exact exception does not suppress a different result.

**Package.** `platform/package.json` adds `./secrets/root-key/ordered-source-keyring` and `./secrets/root-key/reconcile`. Keep existing `./secrets/root-key` mapped to the decision table. `diagnostics/package.json` adds `./redaction/repo-secret-scan`. Classify the reconciler and repo scanner as universal with injected I/O. The keyring entry follows the existing Node crypto classification. `.changeset/w3c-w1b-root-key-and-secret-scans.md` covers both packages. Baselines `jini-ai__platform.json` and `jini-ai__diagnostics.json`.
