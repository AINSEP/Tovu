X4 wmz: 134 files; 77 MOVE, 57 STAYS-HOST, 27 sheets

| File relative to `apps/website/src/features/` | Verdict | Sheet ID | Reason |
|---|---|---|---|
| `mail-status/delivery-tool-registrations.ts` | MOVE | WMZ02 | Owns delivery approval and fresh capture-clear verification. |
| `mail-status/provider-operations.ts` | MOVE | WMZ02 | Owns credential planning, rotation, activation and reread ordering. |
| `mail-status/provider-tool-registrations.ts` | MOVE | WMZ02 | Owns provider tool dispatch and credential setup flow. |
| `mail-status/tool-registrations.ts` | MOVE | WMZ02 | Owns status, test-send and provider-selection handlers. |
| `media-generation/host-media-providers.ts` | STAYS-HOST | WMZ04 | Chooses installed vendors, aliases and environment names. |
| `media-generation/media-provider-catalog.ts` | MOVE | WMZ04 | Projects a live registry into a credential-free settings catalog. |
| `media-generation/provider-card-host.ts` | STAYS-HOST | WMZ04 | Supplies the credential store, card transport, formatter and refusal copy. |
| `media-generation/tool-registrations.ts` | MOVE | WMZ04 | Duplicates the Jini handler body and still owns provider-selection logic. |
| `media-import/tool-registrations.ts` | MOVE | WMZ05 | Duplicates Jini handlers, including authorization, source selection and persistence. |
| `media/blob-write-bindings.ts` | MOVE | WMZ03 | Implements reusable ordered fencing and stored-object verification. |
| `media/chat-attachment-reader-host.ts` | STAYS-HOST | WMZ03 | Binds filesystem reads to the daemon’s owner-scoped reader. |
| `media/derived-media-link.ts` | MOVE | WMZ03 | Implements linking without overwriting a user’s description. |
| `media/import-video-conversion.ts` | MOVE | WMZ03 | Owns store-first conversion, threshold and nonfatal conversion outcome. |
| `media/large-upload-routing-copy.ts` | STAYS-HOST | WMZ03 | Supplies host tool names, limits and routing instructions. |
| `media/media-search-source.ts` | MOVE | WMZ03 | Implements document projection, query-time access and change events. |
| `media/provider-credential-store.memory.ts` | MOVE | WMZ03 | Repeats the memory adapter already present in Jini. |
| `media/provider-credential-store.ts` | MOVE | WMZ03 | Repeats Jini credential persistence, revision and migration bodies. |
| `media/provider-credential-vault.ts` | MOVE | WMZ03 | Repeats Jini identity and vault operations behind host policy. |
| `media/publish-content.ts` | MOVE | WMZ03 | Implements media publish prechecks and staged-byte application. |
| `media/view-video-tool.ts` | MOVE | WMZ03 | Repeats Jini frame, layout and preview-output handling. |
| `member-login/bindings.ts` | STAYS-HOST | WMZ06 | Injects the host credential, lifecycle and bundled-provider sources. |
| `member-login/providers.ts` | MOVE | WMZ06 | Retains bundled descriptor loading and fingerprinting beyond Jini admission. |
| `members/tool-registrations.ts` | MOVE | WMZ07 | Owns generic member handlers and tool result projection. |
| `navigation/publish-content.ts` | MOVE | WMZ08 | Owns menu import and versioned reference repointing. |
| `newsletter/delivery/tool-registrations.ts` | MOVE | WMZ09 | Owns confirmed send, resume and scheduling transitions. |
| `newsletter/tool-registrations.ts` | MOVE | WMZ09 | Owns campaign, list, subscription and delivery-log handlers. |
| `pages/html-change-recording.ts` | MOVE | WMZ11 | Implements atomic HTML write and change-set recording. |
| `pages/html-inverse.ts` | MOVE | WMZ11 | Owns portable inverse encoding, parsing and restored refs. |
| `pages/html-reverter.ts` | MOVE | WMZ11 | Implements version-checked HTML revert over ports. |
| `pages/tool-host.ts` | STAYS-HOST | WMZ11 | Binds host authoring policy, theme roster and HTML collaborators. |
| `permanent-delete/tool-registrations.ts` | MOVE | WMZ12 | Owns the approval-to-execution loop over injected delete specs. |
| `plugin-runtime/built-ins/word-count/index.ts` | STAYS-HOST | WMZ13 | Declares the bundled host manifest and injects its SDK binding into Jini. |
| `plugin-runtime/host-install-source.ts` | STAYS-HOST | WMZ13 | Binds Node I/O and host path copy to Jini’s install-source reader. |
| `plugin-runtime/install-archive.ts` | MOVE | WMZ13 | Still implements a reusable early special-entry refusal. |
| `plugin-runtime/site-plugin-vocabulary.ts` | STAYS-HOST | WMZ13 | Owns the host’s legacy manifest and SDK spellings. |
| `post/post-catalog-host.ts` | STAYS-HOST | WMZ10 | Supplies host tool schemas and TipTap vocabulary. |
| `post/post-create.ts` | MOVE | WMZ10 | Owns creation, validation, slug reservation and ordered writes. |
| `post/post-retire.ts` | MOVE | WMZ10 | Owns replacement retirement and its write effects. |
| `post/post-tool-delete.ts` | MOVE | WMZ10 | Implements target and version checks before deletion. |
| `post/post-tool-deps.ts` | MOVE | WMZ10 | Defines reusable tool dependency and HTML-store contracts. |
| `post/post-tool-duplicate.ts` | MOVE | WMZ10 | Implements post/page duplication and HTML-body transfer. |
| `post/post-tool-input.ts` | MOVE | WMZ10 | Implements reusable tool-input and featured-image rules. |
| `post/post-tool-list.ts` | MOVE | WMZ10 | Owns filters, result projection and excerpt budget. |
| `post/post-tool-policy.ts` | MOVE | WMZ10 | Contains generic attribution and command-dependency projection alongside host policy. |
| `post/post-tool-update.ts` | MOVE | WMZ10 | Owns partial-patch merge, change detection and inverse capture. |
| `post/post-trash.ts` | MOVE | WMZ10 | Owns trash and forward-restore workflows. |
| `post/post-update.ts` | MOVE | WMZ10 | Owns optimistic update, slug change and transition effects. |
| `post/preview-tool.ts` | MOVE | WMZ10 | Owns preview input and result handling over an injected renderer. |
| `post/publish-content.ts` | MOVE | WMZ10 | Owns portable state, references, apply, retirement and undo. |
| `post/repo.memory.ts` | MOVE | WMZ10 | Implements the post repository contract in memory. |
| `post/repo.rows.ts` | MOVE | WMZ10 | Implements row, attribution and revision codecs. |
| `post/repo.ts` | MOVE | WMZ10 | Implements SQL repository semantics and revision fencing. |
| `post/reverters.ts` | MOVE | WMZ10 | Owns undo/restore behavior and transactional write effects. |
| `post/revision-refs.ts` | MOVE | WMZ10 | Implements transactional revision-reference probes. |
| `post/revision-thinning.ts` | MOVE | WMZ10 | Retains reusable SQL, cutoff and scope logic beyond Jini’s engine. |
| `post/search-scratch-host.ts` | STAYS-HOST | WMZ10 | Binds host SQLite, search settings and row codecs to the scratch index. |
| `post/tool-registrations.ts` | MOVE | WMZ10 | Implements list, create, update and delete command orchestration. |
| `project-keys/attachments.ts` | MOVE | WMZ01 | Repeats Jini’s attachment SQL and bounded label lookup. |
| `project-keys/host-bindings.ts` | STAYS-HOST | WMZ01 | Supplies owner scope, permissions, copy and site-vault identity. |
| `project-keys/service.ts` | MOVE | WMZ01 | Repeats the Jini Shared Keys service. |
| `project-keys/shared-oauth-disconnect.ts` | MOVE | WMZ01 | Owns digest recheck, local CAS, grant removal and revocation order. |
| `project-keys/vault-policy.ts` | STAYS-HOST | WMZ01 | Supplies persisted owner scope, failure messages and reporting. |
| `publish-content/backstop-service.ts` | STAYS-HOST | WMZ14 | Supplies host raw-data policy, limits, copy and redactor to Jini. |
| `publish-content/backstop-sqlite-binding.ts` | STAYS-HOST | WMZ14 | Adapts the content kernel and raw-row policy to Jini SQL. |
| `publish-content/destination-credential.ts` | STAYS-HOST | WMZ14 | Injects the peer vault and host wire credential resolver. |
| `publish-content/disconnect-tool.ts` | STAYS-HOST | WMZ14 | Binds reverse-grant provisioning and host error classification. |
| `publish-content/peer-transport-binding.ts` | STAYS-HOST | WMZ14 | Supplies host identity, egress classification, redaction and history kind. |
| `publish-content/peers.ts` | STAYS-HOST | WMZ14 | Binds persisted vault kind, owner key, codec and concrete vault. |
| `publish-content/publish-tool.ts` | STAYS-HOST | WMZ14 | Supplies runtime mode, credentials, planning, transport and UI policy. |
| `publish-content/pull.ts` | STAYS-HOST | WMZ14 | Supplies destination resolution and bundle/blob transports. |
| `publish-content/push-plan.ts` | STAYS-HOST | WMZ14 | Supplies the host catalog, peer transport and public-path function. |
| `publish-content/raw-file-contributor.ts` | STAYS-HOST | WMZ14 | Supplies raw-file limits, storage keys and host Library exclusion. |
| `publish-content/raw-row-contributor.ts` | STAYS-HOST | WMZ14 | Supplies raw-row policy, limits and refusal copy. |
| `publish-content/tool-deps.ts` | STAYS-HOST | WMZ14 | Defines the composition contract for the host’s publish, pull and gateway bindings. |
| `publish-content/tool-registrations.ts` | MOVE | WMZ14 | Still owns connect, status, pull planning and approved execution logic. |
| `publish-trust/candidate-policy.ts` | STAYS-HOST | WMZ15 | Names the host’s persisted public-origin setting. |
| `recovery/tool-registrations.ts` | MOVE | WMZ16 | Repeats Jini recovery handlers; retains host restore and disclosure bindings. |
| `site-backup/archive-extensions.ts` | STAYS-HOST | WMZ21 | Binds host plugin discovery, archive paths and theme sources. |
| `site-backup/archive-manifest.ts` | STAYS-HOST | WMZ21 | Supplies archive caps, schema identity, paths and version copy to the Jini codec. |
| `site-backup/backup-service.ts` | MOVE | WMZ21 | Owns credential selection, private-target checks, plan staging and push jobs. |
| `site-backup/import-backend.ts` | STAYS-HOST | WMZ21 | Binds host setup paths, quotas, verification, placement and restore collaborators. |
| `site-backup/import-database.ts` | STAYS-HOST | WMZ21 | Binds the worker, lock, temp-root, environment and exit-code policy. |
| `site-backup/import-keep-off.ts` | STAYS-HOST | WMZ21 | Supplies host tables, disabled-theme marker, HTML sanitizer and notices. |
| `site-backup/import-plugin-state.ts` | STAYS-HOST | WMZ21 | Supplies the host plugin lifecycle, bundled root and lookup. |
| `site-backup/import-restore.ts` | STAYS-HOST | WMZ21 | Supplies placement, theme checks and plugin restore ports to Jini. |
| `site-backup/import-verifier-projection.ts` | STAYS-HOST | WMZ21 | Injects archive reader, path policy and document-admission factory. |
| `site-backup/import-verifier.ts` | STAYS-HOST | WMZ21 | Supplies the host archive inventory, allowlist, document ports and copy. |
| `site-backup/package-file-inventory.ts` | STAYS-HOST | WMZ21 | Supplies concrete bundled roots and installed-plugin enumeration. |
| `site-backup/push-manifest.ts` | STAYS-HOST | WMZ21 | Binds existing uploader to host manifest path, version and refusal copy. |
| `site-backup/share-backend.ts` | STAYS-HOST | WMZ21 | Supplies concrete ZIP, storage, scope and static-capture collaborators. |
| `site-backup/share-database/repo.sqlite.ts` | MOVE | WMZ21 | Implements fresh-database projection, portable rows and media rewriting. |
| `site-backup/share-expiry.ts` | STAYS-HOST | WMZ21 | Supplies day choices, messages and own-folder policy. |
| `site-backup/share-hosting.ts` | STAYS-HOST | WMZ21 | Binds peer transport, origin policy and host share catalog. |
| `site-backup/share-own-folder.ts` | STAYS-HOST | WMZ21 | Recognizes the persisted `tovu-server` storage binding. |
| `site-backup/share-preparation.ts` | STAYS-HOST | WMZ21 | Binds host DB, media, extensions, limits and share sources. |
| `site-backup/share-registry.ts` | STAYS-HOST | WMZ21 | Binds Jini’s registry to persisted artifact names and host limits. |
| `site-backup/share-retention.ts` | MOVE | WMZ21 | Implements expiry proof, under-lock reread and tombstone-before-unlink. |
| `site-backup/share-service.ts` | STAYS-HOST | WMZ21 | Instantiates Jini’s share service with the host registry and expiry policy. |
| `site-backup/share-steps.ts` | STAYS-HOST | WMZ21 | Supplies concrete plan limits and media/package collaborators. |
| `site-backup/share-zip.ts` | STAYS-HOST | WMZ21 | Supplies ZIP writer, manifest codec, static layout and archive paths. |
| `site-backup/sources.ts` | STAYS-HOST | WMZ21 | Binds filesystem, host archive vocabulary, limits and snapshot policy. |
| `site-backup/static-download-host.ts` | STAYS-HOST | WMZ21 | Supplies layout, source notices, temp root and static-download copy. |
| `site-backup/static-site-packager.ts` | STAYS-HOST | WMZ21 | Binds host static capture and ZIP writer to Jini packager. |
| `site-backup/tool-registrations.ts` | MOVE | WMZ21 | Owns backed-up/share/import tool flow and result projection. |
| `site-export/export-preflight-copy.ts` | STAYS-HOST | WMZ20 | Supplies the host placeholder, operator wording and settings guidance. |
| `site-export/media-url-bindings.ts` | STAYS-HOST | WMZ20 | Binds CMS lookup, content-type resolution and host origin registry. |
| `site-export/route-manifest.ts` | STAYS-HOST | WMZ20 | Binds Jini enumeration to live Tovu routes, themes and storefront policy. |
| `site-export/site-exporter.ts` | MOVE | WMZ20 | Still owns copy-origin, output preparation, warning and export orchestration. |
| `site-inspection/catalog-host.ts` | STAYS-HOST | WMZ22 | Supplies host tool permissions, limits and reads to Jini’s catalog. |
| `site-inspection/tool-registrations.ts` | MOVE | WMZ22 | Implements request validation and inspection handler orchestration. |
| `source-control/credential-setup.ts` | MOVE | WMZ18 | Owns secure-card lifecycle and abort-guarded credential save. |
| `source-control/source-control-credential-repo.ts` | STAYS-HOST | WMZ18 | Binds the content kernel, project half and canonical store to the vault. |
| `source-control/store.ts` | MOVE | WMZ18 | Implements credential validation, CRUD, probing and default selection. |
| `source-control/tool-registrations.ts` | MOVE | WMZ18 | Owns commit preview, credential selection and execution projection. |
| `source-control/types.ts` | MOVE | WMZ18 | Repeats Jini’s source-control credential contracts. |
| `taxonomy/agent-tools.ts` | MOVE | WMZ23 | Adds reusable term-read catalog schema beyond the existing Jini catalog. |
| `taxonomy/publish-content.ts` | MOVE | WMZ23 | Implements taxonomy and parent-first term publishing. |
| `trash/adapters/redirect.ts` | MOVE | WMZ24 | Implements workspace-scoped marker and purge cascade. |
| `trash/adapters/user.ts` | MOVE | WMZ24 | Implements user hide/unhide/purge transitions and event ordering. |
| `trash/member-credential-ports.ts` | MOVE | WMZ24 | Retains reusable credential-fence and revocation SQL behind Jini’s engine. |
| `trash/permissions.ts` | MOVE | WMZ24 | Implements visibility, authorization and remaining-days rules over a host map. |
| `trash/tool-registrations.ts` | STAYS-HOST | WMZ24 | Supplies the host registry, permissions and kind lists to Jini handlers. |
| `trash/trash-item-tool.ts` | MOVE | WMZ24 | Repeats Jini generic dispatch and retains host kind delegates. |
| `vendor-credentials/types.ts` | MOVE | WMZ17 | Repeats the vendor credential contracts already in Jini core. |
| `vendor-credentials/vault-adapter.ts` | MOVE | WMZ17 | Repeats Jini vault conversions, scope and adapter mechanics. |
| `web/policy.ts` | STAYS-HOST | WMZ25 | Chooses Tovu’s per-host rate budget. |
| `web-screenshot/capture-retention.ts` | MOVE | WMZ26 | Owns reusable lock construction and owner-preview/apply binding. |
| `web-screenshot/catalog-host.ts` | STAYS-HOST | WMZ26 | Supplies the host permission, own-site path text and limits. |
| `webhooks/keyring.env.ts` | MOVE | WMZ19 | Repeats Jini keyring primitives and still owns multi-source inspection. |
| `webhooks/seal-aad-invariant.ts` | MOVE | WMZ19 | Jini owns per-source checking, but host file still implements scan traversal. |
| `webhooks/secret-scan-guard.ts` | MOVE | WMZ19 | Jini owns scan policy, but host file still implements Git worktree/history readers. |
| `webhooks/site-key-ensure.ts` | MOVE | WMZ19 | Repeats local reconciliation and owns reusable install/exclusive-create mechanics. |
| `webhooks/site-key-sources.ts` | MOVE | WMZ19 | Mixes reusable source material/metadata reads with host path and precedence policy. |
| `widgets/publish-content.ts` | MOVE | WMZ27 | Owns widget/area projection, reference swapping and publish validation. |

**Count and build protocol.** Tovu `HEAD` and `origin/codex/m24-tip` both resolve to `a96020e1e7`. The merge report measured `1b05ab3763`. The differences under the scanner’s input roots are test files, which the planner excludes. The scanner and five keep reports are absent from the dispatch branch but readable at Tovu `origin/plan/whats-left-1122`. I evaluated the original scanner and the planner’s moving-set section in memory with no file output, dropped its 120 `theme` and `adm-themes` placements, then applied the five reports’ anchored rules. The 507 compiled expressions preserve grouped alternatives instead of flattening them into separate rules. Result **977 → 449 → 134**. Jini collision checks used `origin/integ/merge-24-2026-11-25` at `0718702bbc`.

- **Build in sheet order.** Each **J** half starts with the stated behavior test and mutation, followed by the package change and a minor changeset per listed package. `pkg/subpath` means `packages/pkg/src/subpath.ts` and `@jini-ai/pkg/subpath`. For each new public subpath add the matching `exports` and `jini.entries` entries. Keep existing export entries when reusing code. `node` is explicit below where required. Use `universal` otherwise.
- **Then cut over Tovu.** `DELETE` means repoint all production, test, fixture and mock consumers, including named imports through local barrels, then remove the source and its forwarding export. `BIND` means repoint portable symbols directly and leave at the original path only policy and dependency injection. Don’t add a compatibility re-export. `KEEP` means no source move. Every kept path and residual binding in the table needs an exact anchored keep entry in the next counter ledger. The current rules don’t yet recognize those paths. Don’t add directory or name-pattern exemptions.
- **Importer check.** The pinned scanner resolved 1,516 direct import/re-export/mock edges into these 134 files. The T halves name production cutover points and representative test pins. For the exhaustive cutover ledger, use the same scan’s importer tuples `(from, line, spec)` whose `to` is the named source. For each forwarding export follow the exported **names** through its inbound tuples, including renamed imports and namespace members. Check type-query imports and non-module entry points separately. The two guard CLI script entries are explicitly called out in WMZ19. This avoids replacing unrelated imports from mixed barrels.
- Compare source and destination against the pinned trees before editing. Stop the affected sheet on a missing anchor or a behavior mismatch the sheet doesn’t resolve. Move statements and why-comments in order, preserve deferred reads and error/header bytes, and inject existing collaborators instead of introducing package cycles. New functions take `(required, _optional = {})`, stay within 80 lines and complexity 10, and any custom hook is a required prop. No themes, mounts, schedules, tool exposure or feature flags change. These are build sheets, not implemented changes. The worktree is clean, no tests or builds ran, and there is no `COMMIT-PLAN.md` for this read-only pass.

### WMZ01 — Project keys

**J.** First characterize an attached key whose `worksFor` alias resolves, a duplicate granted alias that refuses, and a disconnect whose grants change between review and apply. Mutation `skip-reviewed-grant-digest` must let the stale disconnect reach a write and fail the test. Reuse `user-management/project-keys/sql/attachments` and `project-keys/service`. Bind the former’s SQL port and `AttachmentPolicy`, including the cap and copy. Bind the latter’s existing owner, permission and vault policy. Add `user-management/project-keys/shared-oauth-disconnect` (`node`) with the two existing operations and their contracts. Inject owner workspace, provider disconnect and conflict construction instead of importing integrations. Keep digest construction, CAS, grant removal and post-transaction token/provider access in their existing order. Minor `user-management`.

**T.** **DELETE** `service.ts` and `attachments.ts`. Switch `assistant/tool-registrations.ts`, `host-bindings.ts`, `project-store.ts`, and their tests to the package contracts/factories, binding the attachment SQL at `project-store.ts`. **BIND** `shared-oauth-disconnect.ts` to host owner workspace, disconnect implementation and error policy for `cli/commands/owner-store.ts`. Keep `vault-policy.ts`. Preserve the existing `reference-only`, `site-reference` and `shared-oauth-disconnect` assertions. No new permission or owner-scope behavior.

### WMZ02 — Mail status

**J.** Characterize credential rotation with a token and omitted username, status’s test-send response in capture mode, and capture-clear with a changed revision after approval. Mutation `clear-reviewed-capture-without-reread` must fail the last case. Add `user-management/mail/status/{provider-operations,provider-tool-registrations,delivery-tool-registrations,tool-registrations}` with the existing operation and builder exports. Use the adjacent catalogs and permission owner. Inject credential CRUD/category, mail-control/test-send, setup diagnostics, approval handler and capture planner. Preserve check-before-select, saved-key callback before invalidation, and the fresh read before clear. Split no mail transport or capture engine into this package. Minor `user-management`.

**T.** **BIND** the four source paths. `modules/system-mail.ts` binds real control and credential operations. `mail-capture-clear-planner.ts` stays a kernel adapter. Repoint `routes/system/mail-providers.ts`, `assistant/tool-registrations.ts` and `tool-catalog-manifest.ts` to package operations/types where no host binding is needed. No second `mail/capture-clear.ts` extraction. Use the planner already bound at this tip.

### WMZ03 — Media

**J.** First pin unordered duplicate fence keys, a persisted blob with matching length but wrong hash, conversion failure after successful upload, a private image in a stale search index, and legacy credential resolution with the existing AAD. Mutations `omit-stored-hash-check` and `serve-indexed-private-image` must fail. Pin the video result envelope and the media publish refusal on missing staged bytes while the old paths still exist.

- Add `cms/media/site/{blob-write-bindings,derived-media-link,import-video-conversion,publish-content}`. Keep the process fence in the existing `withSha256Lock` space, with distinct key/asset namespaces and sorted unique keys. The derivation operation takes the existing store/clock plus the description/refusal text. Inject the conversion note reporter and upload dependencies. Move the contributor and typed apply errors using the media slice of `PublishPorts`, injecting any remaining upload or fence bindings. No new durable fence or claim of cross-process protection.
- Put `media-search-source` at `search/site/media-search-source` beside `cms-document-source`. Use structural media facts or the existing core media contract, with `loadMedia`, `scanMedia`, `publicAccess` and `publicPath` intact. Keep the same rule on indexing and query-time access, deterministic event IDs and the caller’s outbox transaction.
- Reuse `cms/media/site/{provider-credential-store,provider-credential-vault,provider-credential-store.memory,view-video-tool}`. Bind the Jini vault policy and credential services to the current owner, legacy IDs, parser, crypto and clock. Bind `createMediaViewVideoCatalog` to the host read-tool ID and video registration to the same attachment reader/preparer. Minor `cms` and `search` for the new entries.

**T.** **DELETE** `blob-write-bindings.ts`, `derived-media-link.ts`, `media-search-source.ts`, `provider-credential-store.memory.ts` and `publish-content.ts`. **BIND** `import-video-conversion.ts`, `provider-credential-store.ts`, `provider-credential-vault.ts` and `view-video-tool.ts`. Drain moved symbols from `media/index.ts` and the video re-export in `media/tool-registrations.ts`. Repoint `modules/{media,publish-content-blobs,site-search}.ts`, `site-deps/{boot-data,content-stores,trash-adapters}.ts`, `http-app/mount-admin-features.ts`, `memory-deps/route-deps/assistant-and-site.ts`, `media-video-ports.ts`, `content-target-inputs.ts`, `publish-content-manifest.ts` and `tool-catalog-manifest.ts` where they consume these symbols. Keep credential and attachments tests on the host binding when they assert host policy. Don’t change the media-search event or collection names.

### WMZ04 — Media generation

**J.** Characterize first eligible default model in existing order, saved credentials before environment fallback, and a catalog whose duplicate alias and credential-bearing default URL don’t escape. Mutation `env-wins-over-valid-saved-key` must fail. Add `integrations/media-providers/catalog-projection` with `projectMediaProviderCatalog` and its types. Require the host alias table rather than importing the host registry. Reuse `cms/media/site-generation/tool-registrations` (`node`), targeting its `MediaToolStoragePorts` and `ImageGenerationPorts` seams. Put provider credential/model selection in `integrations/media-providers/generation-credentials` through injected saved-read, environment-read and model-ID collaborators. Keep fallback model order and missing-credential diagnostics. Minor `integrations`. Touch `cms` only if the parity test exposes an exact missing seam, then minor `cms` and stop if the existing port shape would have to break.

**T.** **DELETE** `media-provider-catalog.ts` and bind aliases at `modules/media.ts`. **BIND** `tool-registrations.ts` to the existing Jini registrar, provider credentials, storage, tracker, public URLs, diagnostics and upload caps. Repoint portable registrations/risk/types used by `assistant/tool-registrations.ts`, `tool-catalog-manifest.ts` and generation tests. `host-media-providers.ts` and `provider-card-host.ts` continue to choose vendors and credential-card collaborators. Depends on WMZ03 for the credential-store cutover.

### WMZ05 — Media import

**J.** Test permission denial before any fetch or local open, mutually exclusive replacement sources, caller-safe egress errors and persistence before optional conversion. Mutation `open-local-file-before-authorize` must fail. Reuse `cms/media/site-import/tool-registrations` (`node`) and the existing storage, source, refusals and replacement ports. Bind host root IDs, local ceiling, public URLs, sniff/store/analytics order, converting uploader and folder recovery text. No second import engine or change to guarded file access. No Jini changeset for reuse alone. If a bound replacement or refusal differs from Tovu, stop that cutover and record the specific mismatch.

**T.** **BIND** `tool-registrations.ts` to the registrar and host source policy. Keep `resolveLocalImportRequest` only as the host projection of the guarded reader, not as a second handler. Repoint the generic helpers in `asset-transfer/{asset-destinations,copy-tool}.ts` and `image-transform/tool.ts`, passing the current refusal/storage ports. Keep the theme importer on the supported host binding with its existing imports. Verify `assistant/tool-registrations.ts`, `content-target-inputs.ts`, `tool-catalog-manifest.ts` and media-import tests. WMZ03 supplies conversion. The existing fs-files binding is injected, so no other slice must build first.

### WMZ06 — Member login

**J.** Test bundled then installed admission and a changed descriptor fingerprint, with absent descriptor file still yielding no installed candidate. Mutation `hash-manifest-instead-of-descriptor` must fail. Extend `user-management/member-login/providers` with the descriptor filename and existing bundled load/fingerprint behavior. Inject bundled source enumeration and document reads, and accept the installed contribution loader as a port around the existing Jini admission function. Keep descriptor parse and per-contribution read order. No dependency on `agent-plugins` from `user-management`. Minor `user-management`.

**T.** **DELETE** `providers.ts`. Bind lifecycle enumeration, file reads and installed loading in `bindings.ts`, which remains the entry for `modules/members.ts` and `site-deps/pre-assembly.ts`. Repoint the two direct provider-test consumers. Preserve admitted provider IDs and versions.

### WMZ07 — Members

**J.** Characterize read projection without credentials, an authorization refusal with no write, and magic-link requests that do not expose a token. Mutation `include-challenge-token-in-tool-result` must fail. Add `user-management/members/tool-registrations` with `buildMembersRegistrations`, `contributeMembersTools`, `MembersToolDeps`, `MagicLinkRateLimiter` and risk exports. Keep the existing profile/read/removal/sign-in handler groups. Use the existing member write, member sign-in and challenge owners. Inject Trash, transport, tool catalog, host read refs and permission collaborators instead of importing CMS. Minor `user-management`.

**T.** **BIND** `tool-registrations.ts` at `assistant/tool-registrations.ts` and `tool-catalog-manifest.ts`. Repoint generic imports in the member registration tests. Retain host mail transport, authorization and Trash binding. Don’t change enrollment, sign-in link behavior or card visibility.

### WMZ08 — Navigation

**J.** Test a nested reference repoint with an optimistic conflict and one untouched menu. Assert retry limit, final change-set IDs and `notUpdated` output. Mutation `skip-expected-version-on-repoint` must fail. Add `cms/navigation/site/publish-content` exporting `contributeMenusPublish`. Move the contributor and the existing repoint helpers with existing Jini menu import/write contracts. Use the current command, authorizer, outbox and clock ports. Minor `cms`.

**T.** **DELETE** `navigation/publish-content.ts`. Repoint `publish-content-manifest.ts` and navigation publish tests. Keep footer repair, product link resolver and live navigation bindings. No dependency on a route slice.

### WMZ09 — Newsletter

**J.** Characterize scheduled campaign launch and a campaign changed after approval. Assert the fresh transition check, transaction before freeze/fan-out, unchanged no-mail result, and unchanged error on gate refusal. Mutation `fan-out-reviewed-campaign-without-recheck` must fail. Add `user-management/newsletter/tool-registrations` and `newsletter/delivery/tool-registrations`. Export existing builders/contributors, dependency contracts and risk maps. Reuse `campaign-write-service`, `launch-gate`, `send-pipeline`, lists and subscriptions. Inject scheduler, approval and launch facts, catalog/read refs and host delivery copy. Split the registration file over the limit into `newsletter/tool-registrations.read.ts` and `.write.ts` at the existing read/write handler boundary, keeping those modules private. Minor `user-management`.

**T.** **BIND** both registration paths. Repoint `assistant/tool-registrations.ts`, `tool-catalog-manifest.ts`, `newsletter/deps-builders.ts` and tests to package builders and types where portable. Bind the existing `newsletterSendingEnabled` and scheduler. Do not register an additional send path or enable sending.

### WMZ10 — Post

**J.** Before any move, pin stale update with no effects, creation over an existing trashed slug, no-op update without revision churn, actor columns across row/revision round trips, HTML duplication, restore and replacement retirement, and an unreadable inverse retaining a revision. Mutations `omit-update-version-check`, `drop-actor-id-from-revision-row` and `unreadable-inverse-is-unreferenced` must fail. Use `post.trashed-slug-release`, `repo.rows`, `content-duplicate.post-page`, `reverters` and `revision-refs` as the existing characterization anchors.

1. Add `cms/posts/{post-create,post-update,post-retire,post-trash,reverters,repo.memory}` and `cms/posts/sql/{repo,repo.rows}`. Export the existing operations, dependency contracts, repo constructors and codecs. Inject reserved-path and public-path policy, removal/forget ports, ID/time, search projection, kernel and revision-lock key. Keep SQL operations on the caller’s transaction and preserve `actor_kind`/`actor_id` without changing schemas. Type the package SQL against its post/revision column slice, not the generated host database. Leave host `postRepoFor` wiring at the Tovu binding if it needs the host search config.
2. Add `cms/posts/{post-tool-delete,post-tool-deps,post-tool-duplicate,post-tool-input,post-tool-list,post-tool-policy,post-tool-update,preview-tool,tool-registrations}`. Export existing operations and builders, not host catalog defaults. `post-tool-policy` moves attribution and command projection; catalog, host permissions and read vocabulary are injected. Pass template availability, view/public URL projection, HTML-store shape and host command dispatch by port. Extract just the existing contiguous update command work to `posts/tool-registrations.update.ts` and the handler-map construction to `posts/tool-registrations.handlers.ts` to keep the two oversized functions under the bound. No general handler framework.
3. Add `cms/posts/publish-content` and private `posts/publish-content.retire.ts` by moving the existing retirement block. Export the two contributors and portable state projection. Use existing publish ports and leave host catalog assembly outside.
4. Add `cms/posts/sql/{revision-refs,revision-thinning}` for the SQL probes, cutoff and scope logic. Reuse `cms/posts/revision-thinning` for the engine. Inject the **same** host append/thin lock key and keep the transaction, sort order and reference checks intact. Approval-card construction and owner/route binding stay host-side. No STOP 6 activation. SQL entries are `node` where the existing SQL dependency requires it. One minor `cms` changeset.

**T.** **BIND** `repo.ts`, `post-tool-policy.ts`, `tool-registrations.ts`, `preview-tool.ts` and `revision-thinning.ts` only where needed to inject host search/kernel, catalog, renderer or approval. **DELETE** the other 15 MOVE paths. Update `repo.sqlite.ts`, `read-model.ts`, `search-scratch-host.ts`, `post-tool-view-deps.ts` and `post/index.ts` imports, removing forwarding lines for moved symbols. Repoint barrel consumers to `posts/*` and `posts/sql/*` by symbol. Update `assistant/tool-registrations.ts`, `publish-content-manifest.ts`, `tool-catalog-manifest.ts`, `content-target-inputs.ts`, `modules/revision-thinning-routes.ts`, `memory-deps/route-deps/trash-and-content.ts` and `site-deps/route-deps-content-chat.ts`. Keep reserved-path/template host policy, existing route mounts and lock bytes. No dependency on the future revision-maintenance gate.

### WMZ11 — Pages

**J.** Pin HTML save and change-set rollback on recording failure, round-trip of HTML vs document inverse, and conflicting undo that leaves the newer version intact. Mutation `commit-html-when-recording-fails` must fail. Add `cms/pages/{html-inverse,html-change-recording,html-reverter}` with the existing functions, `PAGE_HTML_ENTITY_TYPE` and deps. Inject edit permission, event summary copy and unindexed-reference reporting. Keep the recorded-write gate, scoped transaction, signal reads and `allowForce: false`. Use existing Jini post/store contracts. Minor `cms`.

**T.** **DELETE** `html-inverse.ts` and `html-reverter.ts`. **BIND** `html-change-recording.ts` for permission, reporting and copy if those are not already supplied at `tool-host.ts`; otherwise delete it and bind there. Keep `tool-host.ts` as the renderer/theme/authoring binding. Repoint the document-store SQLite inverse imports, `memory-deps/route-deps/{assemble,trash-and-content}.ts`, `site-deps/assembly-phases.ts` and page HTML/undo tests. No theme-roster edits.

### WMZ12 — Permanent delete

**J.** First test that dismissal, stale selection and declined row authorization result in no permanent delete. Mutation `use-preview-selection-without-fresh-authorization` must fail. Add `cms/trash/permanent/tool-registrations` exporting the existing dependency/plan types, builder, contributor and risk. Bind injected spec catalog, prepare/approve/execute collaborators and host tool references. Keep comparison against the approved snapshot and individual row authorization. Minor `cms`.

**T.** **BIND** `tool-registrations.ts` to existing `permanent-delete-deps.ts`, including the host custom-credential discovery ID. Repoint portable imports in `assistant/tool-registrations.ts`, `content-target-inputs.ts`, `tool-catalog-manifest.ts` and direct tests. Do not register unattended deletes or alter the approval card.

### WMZ13 — Plugin runtime

**J.** Pin the existing refusal code, **exact message and ordering** for a special Unix entry, including one with a trailing slash. Mutation `count-or-yield-before-special-refusal` must fail. Jini `agent-plugins/lifecycle/yauzl` already classifies Unix mode before slash, but directly substituting it is **not equivalent**. Tovu throws `"ZIP links and special entries are not allowed."` before the CMS policy counts the entry. Jini’s `plugins/host/node/archive-policy` counts first and uses `"ZIP links are not allowed."`. In `agent-plugins/src/lifecycle/yauzl-archive-reader.ts`, add the explicitly passed `rejectSpecialUnixEntry` callback to the existing reader’s options, called from the special-mode branch before yielding. No default change and no cross-package error import. Reuse the existing `./lifecycle/yauzl` export. Minor `agent-plugins`.

**T.** **BIND** `install-archive.ts` with concrete yauzl, the existing `PluginInstallError` construction and the original separately supplied test-reader path. Repoint `host-binding.ts` and the two direct tests as necessary. Keep bundled word-count, host install source and legacy vocabulary unchanged. No parser, install limit or manifest migration.

### WMZ14 — Publish content

**J.** Pin explicit vs inferred destination, the no-destination readiness result, and a pull changed after the approval card. Mutation `run-pull-before-approval` must fail. Add `cms/publish/content/tool-registrations` exporting the existing builder and contributor. Reuse `agent-tools`, `tool-helpers`, `connect-destination`, `peers`, `pull` and `publish-tool`. Move the generic entry validation, destination selection, readiness, plan/execute selection and result error mapping. Inject existing host catalog, gateway/confirmation, transport, credential and effect ports, plus host-only error classes and copy. Don’t add a second publisher or raw-file/raw-row pipeline. Minor `cms`.

**T.** **BIND** `tool-registrations.ts`. Repoint `disconnect-tool.ts` and `tool-catalog-manifest.ts` to the owner of each moved symbol and pass real host callbacks at the existing wiring points. Keep the 12 other table paths as bindings. In the corresponding tests, keep host `publish-peer` kind, owner key, AAD, readiness wording, `publish-content` permission and existing peer history bytes pinned. The combined holder of media/post/menu/taxonomy/widget contributors stays `publish-content-manifest.ts`.

### WMZ15 — Publish trust

**J.** No package change, export or changeset. Test-first pin for a later retouch is the existing candidate-policy provisioning case. Mutation `read-alternate-public-origin-key` must fail with only `TOVU_PUBLIC_URL` configured.

**T.** **KEEP** `candidate-policy.ts` and its consumers in `modules/publish-content.ts` and `tool-catalog-manifest.ts`. This is a host-only sheet. No new test file is needed to keep an unchanged binding.

### WMZ16 — Recovery

**J.** Pin deep-link validation and authorization order, restore confirmation, protected disclosure and the intentionally unwired backup collision. Mutation `register-unwired-backup-entry` must fail the registration contract. Reuse `db/src/recovery/tool-registrations.ts`. The file is present, but **`./recovery/tool-registrations` is not exported** at the pinned Jini tip. Add that export and entry and use the existing `RecoveryToolHost` seam. If necessary to preserve the unwired ID, pass the host-filtered registration catalog while leaving the public catalog intact. Bind the planner, authorization, gateway, disclosure and restore run. Minor `db`.

**T.** **BIND** `recovery/tool-registrations.ts` to the host gateway, operation lock, disclosure categories, approval and plain-language guidance. Repoint `assistant/tool-registrations.ts`, `tool-catalog-manifest.ts`, and direct tests to the new subpath for portable deps/operations. Preserve approval gating and existing collision exclusion. No dependency on unbuilt restore-copy, idle vacuum or desktop work.

### WMZ17 — Vendor credentials

**J.** Pin source-control and vendor records through the same shared adapter with their distinct kinds and owner identity, and pin protected transaction ordering. Mutation `change-vault-owner-key` must make the prior sealed fixture fail. Reuse `core/contracts/site/vendor-credentials` and `integrations/vendor-credentials/vault-adapter`. Verify record and repo types before replacing the local copies. Use `createCredentialVaultBinding`, `CredentialSetVaultAdapter`, `credentialScope` and `credentialHint`; no new package file, export or changeset if parity holds.

**T.** **DELETE** `types.ts`. **BIND** `vault-adapter.ts` to owner, accepted kinds, parsers, ordering and concrete `SecretsVaultService`. Remove moved exports from `vendor-credentials/index.ts`. Repoint vendor repos, source-control memory/SQL repo bindings, `site-deps/route-deps-publish-credentials.ts`, and direct tests. Bind the existing `protect` semantics, not a new transaction. Keep every saved credential readable.

### WMZ18 — Source control

**J.** First pin blank-token patch behavior, an unchanged credential after probe failure, an aborted secure-card submission, and dry-run with no provider write. Mutations `save-after-card-abort` and `commit-during-dry-run` must fail. Reuse `core/contracts/site/source-control-credentials` for all local `types.ts` exports. Add `devops/source-control/site/{store,credential-setup,tool-registrations}` plus private `store.validation.ts` for the existing validation block. Export the existing CRUD/default/find operations, setup API, registration builders, types and risk. Reuse Jini’s credential form, provider module, commit schema/target and saved-key binding. Inject provider registry/probe, scope/sealing, connection-shape policy, secure-card IO, abort guard, commit implementation and host diagnostics. No devops imports of Tovu or concrete integrations/daemon. Minor `devops`.

**T.** **DELETE** `types.ts`. **BIND** `store.ts`, `credential-setup.ts` and `tool-registrations.ts` to the host policy and provider ports. Repoint `commit-site.ts`, `repo.memory.ts`, the SQL repo facade, `assistant/tool-registrations.ts`, `server/routes/route-deps/credentials-deps.ts`, `tool-catalog-manifest.ts`, `source-control-key-binding.ts`, backup consumers and tests. Drain `source-control/index.ts` for portable types and operations instead of adding re-export lines. WMZ17 supplies the concrete vault binding. Do not edit the provider catalog or default credential behavior.

### WMZ19 — Webhooks, root keys and guard CLIs

**J.** Pin source read order for an invalid first-present key, recovery from a stamped matching key behind a mismatched local file, data-bearing refusal before mint/restamp, and exclusive-create race winner bytes. Keep a sealed-format fixture. Mutations `skip-first-present-invalid-key` and `restamp-with-key-dependent-data` must fail. Pin the guard scanners’ existing no-finding/finding results with synthetic fixtures and require mutation `ignore-missing-aad` to fail.

- Reuse `platform/secrets` keyring classes, key parsing, fingerprints and fixed/in-memory primitives. Use existing `platform/secrets/root-key/reconcile` (`node`), and publish `./secrets/root-key/decide` for the existing decision module. For reconciliation, bind `stampedFingerprint` lazily, at its existing read point after the per-site material read, using the existing property seam. Do not pre-read later sources. Add `platform/secrets/root-key/{files,material}` (`node`) for the existing install/exclusive-create/move-aside mechanics and ordered source inspection/metadata-read operations. The host supplies path layout, meta field names, key-dependent scan, mode, random/time and host message construction. Split on the already named file and material operations only. Minor `platform`.
- Extend `integrations/webhooks/site/seal-aad-invariant` via `webhooks/site/seal-aad-invariant.node` for the existing TypeScript-file walk, using `findSealCallsInSource` and the host allowlist. Add `diagnostics/redaction/repo-secret-scan.node` for the existing tracked-file and Git object/path readers, feeding `scanTrackedRepo` and `scanRepoHistory`. Inject root, runner, allowlist and scan budget. Retain ordering, history attribution and secret-value redaction. Minor `integrations` and `diagnostics`.

**T.** **BIND** all five paths. For the three key files keep only Tovu layout, runtime policy, stable HKDF salt, service wiring and host copy. Repoint key classes, types and pure functions directly where no host policy is needed, including in `project-store.ts`, `storage-secret.ts`, `site-key-recovery.ts`, `vault-boot.ts`, `other-site-keys.ts`, boot readiness/notices, `site-keys-members.ts`, system key/deploy/publish-trust wiring and CLI serve/deploy config. Preserve read ordering across these binds. Keep CLI roots, allowlists, message formatting and exit handling in the two guard entry files referenced by `package.json`’s `check:seal-aad` and `check:secret-scan`. Keep the CLI paths valid for `.github/workflows/ci.yml`. No key rotation, data rewrite, or scan of real secrets is needed for the characterization tests.

### WMZ20 — Site export

**J.** Pin public URL overriding an explicit base path, no public origin omitting **and removing stale** sitemap/RSS output, and warning order in the report. Mutations `prefer-explicit-base-path-over-destination` and `leave-stale-feed-without-public-origin` must fail. Add `devops/static-export/site/site-exporter` (`node`). Move `exportSite` orchestration with `resolveExportIdentity`, `listingRoutes`, `ignoredBasePathNotice` and `finishExportReport`. Use the existing `runExport`, node writer and public-origin/preflight modules. Split `runSiteExport` at existing prepare/run/report boundaries only if needed for the length cap. Inject manifest building, host route names, app/listing/consent, asset/theme policy, headers, HTML policy and trace/report sinks. Keep fetch late-bound and preserve the two rewrite stages. `redirectOutcomeFor` already delegates to the export engine’s decision, so don’t create a new export for the forwarder. Minor `devops`.

**T.** **BIND** `site-exporter.ts` with the actual route and theme collaborators, copy and exact `x-tovu-static-export` header. Repoint consumers of `ExportOutputNotEmptyError`, outcome types and redirect decision to `@jini-ai/devops/static-export`, and `firstExportFailure` to the host summary owner. Remove forwarding lines from `site-export/index.ts` for those names and repoint its CLI, server and test consumers by symbol. Keep route manifest, media URL bindings and preflight copy. Keep theme behavior byte-for-byte and leave theme files alone.

### WMZ21 — Site backup

**J.** First pin private-target and stale parent-SHA refusal before writes, ordered snapshot/deferred-file/manifest upload with cancellation, fresh-database projection refusal on unknown populated tables, and expiry of only proven local links. Test tombstone-before-unlink while preserving missing/invalid expiry and remote copies. Mutations `commit-after-parent-changes`, `skip-unknown-populated-table-refusal` and `unlink-before-expiry-tombstone` must fail.

- Add `devops/backup/site/{backup-service,tool-registrations,share-retention}`. In the backup service, move the existing helper groups into private `backup-service.credentials.ts`, `.plan.ts` and `.push.ts`. Preserve public service, tool and result exports. Reuse `push-content`, `push-jobs`, `sources`, archive/share/import owners and credential warnings. Inject host workspace/permission, key-status reader, credential sources, plan store, provider loader, labels, clock, archive/upload policy, site identity, diagnostics and confirmation. Keep private-target/permission checks and fresh provider read in their original locations. `share-retention` uses structural registry/files/clock/reporting ports and injected `isOwnShareFolder`; preserve the existing `shares:` lock key behavior and default expiry settings.
- Add `devops/backup/site/share-database/projection` (`node`) for the existing projection operations, with private `projection.tables.ts` and `projection.media.ts` for table/settings and media rewrite blocks. Export `sanitizeShareDatabase`, `rewriteArchiveMedia`, `prepareSharePluginTables`, `refuseUnknownShareTables` and `StagingSpacePort`. Keep trusted bootstrap, source read-only open, cap/free-space measurement, parent-before-child projection, search backfill, credential warnings and cleanup order. Inject host kernel factories, schema/table policy, temp-root/staging, search backfill and blob policies. Don’t copy host migration or schema boot into devops. Minor `devops`.

**T.** **BIND** `backup-service.ts`, `tool-registrations.ts` and `share-database/repo.sqlite.ts` to the concrete stores, providers, schema, plan policy and approval. **DELETE** `share-retention.ts` after `server/runtime/composition/retention.ts` binds `isOwnShareFolder` and the registry to Jini. Repoint `modules/system-site-backups.ts`, `tool-catalog-manifest.ts`, `assistant/tool-registrations.ts`, `site-portability.ts`, `import-database/repo.sqlite.ts` and the direct backup/import/share tests to the correct package symbol or binding. The other 23 files stay host-side. Move unchanged archive/expiry/registry type or operation re-exports to direct imports where this cut touches them. Keep `share-retention.unit.test.ts`, saved-key round trips and the static-download header and landing pins. WMZ18 and WMZ19 supply earlier host credential/key bindings; WMZ20 supplies the existing static export collaborator. Keep the accepted ext-w2 static-download landing owner. No re-export, expiry change, new schedule or theme edit.

### WMZ22 — Site inspection

**J.** Characterize section-order handling, rejection of unknown input fields, visible-capability filtering, and live URL refusal with no fetch. Mutation `accept-caller-context-override` must fail. Add `cms/site-inspection/tool-registrations` with existing builder, contributor and risk. Reuse `site-profile`, `site-capabilities` and the catalog. Inject reserved paths, host read/visibility policy, live-URL/page-evidence operations and error classification. No CMS import of diagnostics implementation. Minor `cms`.

**T.** **BIND** `tool-registrations.ts` using `catalog-host.ts` and `deps.ts`. Remove the `SiteInspectionToolDeps` forwarding export and import that host type from `deps.ts`. Repoint `index.ts` consumers and the direct tests at the appropriate owner. Keep existing fetch limits and published-page output.

### WMZ23 — Taxonomy

**J.** Pin parent-first term apply with a child appearing first in input, and catalog/read-schema compatibility. Mutation `apply-child-before-parent` must fail. Add `cms/taxonomy/site/publish-content` exporting `contributeTaxonomyPublish` and `contributeTermPublish`, using existing taxonomy publish ports. Put the portable get-term definition and assignment projection in the existing `cms/taxonomy/agent-tools` catalog, with a host-supplied permission/read-reference binding. Preserve catalog order and already exported behavior for other consumers. Minor `cms`.

**T.** **BIND** `agent-tools.ts` only for the Tovu catalog overlay and remove its core type re-exports. **DELETE** `publish-content.ts` after repointing `publish-content-manifest.ts` and taxonomy publish tests. Repoint `tool-registrations.ts` and catalog tests to the right portable symbols. No change to taxonomy registration or gated operations.

### WMZ24 — Trash

**J.** First pin disabled redirect marker vs independently disabled redirect, blocked user purge with untouched identity, failed credential revoke rolling back member hide, and denied visibility returning no row. Mutation `advance-credential-fence-outside-marker-transaction` must fail. Also pin `trash_item`’s existing result and per-kind dispatch against Jini before removing the duplicate.

- Add `cms/trash/site/{adapters/redirect,adapters/user,permissions}` and `cms/trash/site/adapters/member-credential-sql` for the existing marker, user transition, visibility and member SQL operations. Use the existing marker SQL helpers and `site/adapters/member` orchestration. Inject the host table/scope policy, user purge/retention and outbox operations, and per-kind permission map. Don’t copy host identity or DB modules into CMS. SQL entries are `node` where required. Preserve redirect revision-before-hit purge order and user transaction/effect order.
- Reuse `cms/trash/trash-item-tool` and `cms/trash/tool-registrations`. Jini already owns dispatch and registration; Tovu supplies live delegates, versions, move/suppress behavior and kind policy. Minor `cms` for the new entries.

**T.** **BIND** `adapters/redirect.ts`, `adapters/user.ts`, `member-credential-ports.ts`, `permissions.ts` and `trash-item-tool.ts` only for concrete policies and ports. Keep `tool-registrations.ts` as the existing binder. Repoint generic consumers in `trash/index.ts`, `tool-kinds.ts`, `site-deps/trash-adapters.ts`, `assistant/tool-registrations.ts`, `tool-catalog-manifest.ts` and tests. Remove forwarding lines and retain host comment/theme adapters unchanged. No new purge/sweep and no change to grants, owner login protection or financial retention policy.

### WMZ25 — Web

**J.** No package change, export or changeset. Existing policy pin for any later retouch is the per-host budget tuple. Mutation `change-per-host-window` must fail the pin.

**T.** **KEEP** `policy.ts` and its `tool-catalog-manifest.ts` binding. The host’s rate profile is policy, not a reusable rate limiter. No new test is needed to keep it unchanged.

### WMZ26 — Web screenshot

**J.** Pin preview/apply against different capture roots and no filesystem access on authorization refusal. Assert capture writer and cleanup use the same resolved lock path. Mutation `authorize-after-listing-captures` must fail. Extend `integrations/web-screenshot/capture-retention` with `bindCaptureRetention` and its existing types. Add `integrations/web-screenshot/capture-root-file-lock` (`node`) for `createCaptureRootFileLock`, `CaptureFileLockRunner` and the existing lock-name constant. Inject the file-lock runner, root resolver, owner check, clock, fs and preview store. Keep the same token scope, name, options and authorization timing. Minor `integrations`.

**T.** **DELETE** `capture-retention.ts`. Repoint `modules/screenshot-storage.ts` and its direct test consumers to the two exports, binding the existing file lock and owner auth. `catalog-host.ts` stays. Keep the same singleton writer fence passed from composition. No age-only cleanup, schedule or new endpoint.

### WMZ27 — Widgets

**J.** Pin repeated widget areas, destination form-reference swapping only for the matching widget type, and rejection of unknown destination widget schema. Mutation `write-widget-before-destination-schema-check` must fail. Add `cms/widgets/site/publish-content` with `contributeWidgetPublish` and `contributeWidgetAreaPublish`. Move existing projection, reference collection, schema validation and write bodies. Inject the widget registry, existing read-only post-write policy and product config reference mappings. Reuse CMS publish/reference/entry ports. Minor `cms`.

**T.** **DELETE** `widgets/publish-content.ts`. Bind host widget registry and config policy where `publish-content-manifest.ts` assembles the contributors, and repoint the direct widget publish tests. Keep runtime registration, themes and widget visibility unchanged.
