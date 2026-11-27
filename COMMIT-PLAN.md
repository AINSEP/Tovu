# Tovu WMZ cutover working-tree plan — do not commit this file

No commits, git writes, installs, builds, tests, typechecks or linters are authorized here. Coordinator commits; Opus executes tests and package intake.

Inputs: dispatch WMZ01–27; Jini origin/codex/x4-wmzj ad558c8824ba2a97cbe58c110df80661aed371ee; Jini handoff and its COMMIT-PLAN.md.
Tovu HEAD and origin/codex/m24-tip are b617bcc2b0050e743a717cd13f2e1ffff66b87d8, not dispatch a96020e1e7. Compare individual anchors to a96020e1e7; stop affected steps on mismatches. Architecture chapters read from /Users/la/Programming/Tovu because absent in clone. Approved sheet bindings govern style; no new abstraction or behavior.

Tests-first: reuse Jini characterization tests authored before package moves and existing Tovu host pins, repointing tests before production cutovers. All tests and mutation checks remain UNEXECUTED.

## Ordered logical units

### WMZ01 — Project keys
Mutation: skip-reviewed-grant-digest. Existing reference-only, site-reference and shared-oauth-disconnect pins retained. Repoint tests first.
Completed DELETE service.ts/attachments.ts, BIND shared-oauth-disconnect.ts. Files: features/project-keys/{service.ts,attachments.ts,shared-oauth-disconnect.ts,__tests__/{reference-only.unit.test.ts,tools.unit.test.ts,attachments.unit.test.ts,a02-credential-contract.pin.unit.test.ts}}; assistant/tool-registrations.ts; server/runtime/composition/{project-store.ts,__tests__/other-site-keys.integration.test.ts}; server/{__tests__/routes/mail-providers-route.test.ts,inbound/admin-http/routes/system/__tests__/custom-credentials-inventory.unit.test.ts}. All paths under apps/website/src. Existing host-bindings already owns createProjectKeys policy.

### WMZ02 — Mail status
Mutation: clear-reviewed-capture-without-reread. Reuse Jini tests and existing host provider-operations, test-send, clear-captured pins before edits; not run.

BIND all four source paths; portable operations/risk/capture-plan imports repointed by symbol. Existing system-mail control and credential bindings retained through provider-operations. Host capture planner remains unchanged. Exact files are recorded in final git diff inventory below.

### WMZ03 — Media
Mutations: omit-stored-hash-check; serve-indexed-private-image. Jini tests precede these edits; existing Tovu video/conversion/search pins retained, not run.
STOP provider-credential-vault.ts: Jini mediaProviderVault.findOne adds ownedProviderId({row,policy}) before its existing provider equality check; Tovu only checks provider equality. This is additional runtime validation contrary to the verbatim/no-extra-validation requirement. provider-credential-store.ts and provider-credential-store.memory.ts depend on that owner and remain held.
STOP view-video-tool.ts: Jini extractionOptions conditionally omits signal when undefined; Tovu always supplies signal, so extractor input property shape differs outside the named injection seam.


Completed DELETE blob-write-bindings.ts, derived-media-link.ts, media-search-source.ts; BIND import-video-conversion.ts. Publish contributor cutover remains to be reconciled with its required added media port fields before deletion.

### WMZ04 — Media generation
Mutation: env-wins-over-valid-saved-key. Existing catalog pins/Jini generation tests retained, not run. DELETE catalog. Registrar STOP after independent parity comparison: existing CMS resolveDefaultImageModel throws for a missing model during its saved-selection pass; Tovu uses `findModel({id})?.provider ?? ""` there. CMS storeGeneratedImage also omits undefined editorial properties whereas Tovu passes them, and its private selector does not expose the new integrations selector as an injection seam. This mismatch exists independently of the WMZ03 credential-store hold; no port rewrite attempted.


### WMZ05 — Media import
Mutation: open-local-file-before-authorize. STOP registrar cutover: destination local handler adds `if (filename === undefined) throw new Error("Media import path has no filename")`; source at local-file handler directly uses the derived filename. The existing destination also rewrites editorial-field construction and omits undefined properties. Hard rule forbids extra validation or rewritten moved statements; no host source/handler rewrite attempted. WMZ03 conversion binding remains usable by existing host handler. Generic helper consumers remain on unchanged binding until replacement/refusal parity is resolved.

### WMZ06 — Member login
Mutation: hash-manifest-instead-of-descriptor. Repoint provider and ready-provider tests first, retaining bundled/installed descriptor pins. Not run.


DELETE providers.ts; bindings.ts injects lifecycle, identity policy, file reads and installed loader. Existing modules/members.ts and pre-assembly use ready-list binding unchanged.

### WMZ07 — Members
Mutation: include-challenge-token-in-tool-result. Jini characterization and existing member registrations pins retained; generic risk and rate-limiter imports repointed before binding. Not run.


BIND tool-registrations.ts; host mail and Trash ports retained.

### WMZ08 — Navigation
Mutation: skip-expected-version-on-repoint. Destination is byte-identical to source; repoint existing publish tests first. Not run.


DELETE navigation/publish-content.ts and repoint manifest/tests.

### WMZ09 — Newsletter
Mutation: fan-out-reviewed-campaign-without-recheck. Reuse Jini tests and existing host send/schedule/read pins; risk imports repointed before binding. Sending setting and approval scheduler remain unchanged; not run.


BIND both newsletter paths; deps-builders remains concrete host mail/outbox binding. No additional send path registered.

### WMZ10 — Post (partial)
Mutations: omit-update-version-check; drop-actor-id-from-revision-row; unreadable-inverse-is-unreferenced. Reuse Jini/existing characterization pins; held actor codec mutation remains unauthored per Jini report. Not run.
STOP repo.ts/repo.rows.ts/repo.memory.ts: Jini halves withheld for source actorKind reconstruction mismatch. STOP post-update.ts: unchangedLiveRow invokes isDeepStrictEqual after the package changes its import to type-only, leaving that value unavailable. STOP post-tool-input.ts: destination begins with TWO identical normalizePublishAt value imports, an invalid duplicate binding. Dependent registrar/tool input/update/deps cutover held pending that package correction. Independent trash, retirement, reverters, preview and revision probes continue.


Completed DELETE post-create.ts/post-trash.ts/post-retire.ts/reverters.ts/revision-refs.ts/publish-content.ts; BIND preview-tool.ts/revision-thinning.ts. SQL references use package column slice; same postRevisionLockKey injected; existing approval card and disabled STOP 6 state retained. Follow-up below completes independent create and publish contributors. Remaining update/tool closure and actor repositories are held for the exact package defects listed at end.

### WMZ11 — Pages
Mutation: commit-html-when-recording-fails. Existing HTML inverse/store/undo pins repointed before source deletion. Not run.


DELETE html-inverse.ts/html-reverter.ts; BIND html-change-recording.ts to permission and existing SUMMARY. Bind restored refs reporting at each store dependency. Theme roster/tool-host remains unchanged.

### WMZ12 — Permanent delete
Mutation: use-preview-selection-without-fresh-authorization. Existing dismissal/stale/declined row-auth pins retained and portable plan/risk imports repointed first. Not run.


BIND permanent-delete/tool-registrations.ts with original custom credential discovery ID and host callbacks. Existing permanent-delete-deps.ts remains concrete preparation owner.

### WMZ13 — Plugin runtime
Mutation: count-or-yield-before-special-refusal. Jini special/trailing-slash pins and existing host install archive tests retained before edit; not run.


BIND install-archive.ts: remove isSpecialUnixEntry/guardedYauzl workaround; bind explicit early refusal callback and retain separately supplied test reader. Deletions required by named reader replacement.

### WMZ14 — Publish content
Mutation: run-pull-before-approval. Jini tests and existing host peer/AAD/readiness/pull pins retained. Repoint provisioning helper consumers before binding; not run.


BIND tool-registrations.ts; disconnect imports provisioning guard directly; host tool-deps and all other bindings remain. No additional publisher pipeline.

### WMZ15 — Publish trust
KEEP candidate-policy.ts unchanged. Mutation: read-alternate-public-origin-key (existing candidate-policy provisioning pin; no new test).

### WMZ16 — Recovery
STOP sole MOVE file: Jini createRecoveryRestoreHandler adds runtime validation of planId/planHash and createRecoveryRestoreRun adds validation of confirmationToken; source uses type assertions at both points. It also reconstructs prepared plan and conditionally omits createdAt instead of preserving source object. Extra checks/output shaping are outside sheet's injection/export seam. Mutation: register-unwired-backup-entry (existing Jini registration pins retained; no cutover, no tests run).

### WMZ17 — Vendor credentials (partial)
Mutation: change-vault-owner-key. Existing saved-key/host pins and Jini fixture retained, not run.
STOP vault-adapter.ts: package createCredentialVaultBinding adds derive/deriveSigningSecret fallback methods to the keyring supplied to openService; source supplies activeKey only. Explicit reuse requires parity and forbids new fallback behavior. Leave binding and protected transaction semantics unchanged pending Opus resolution. Type contracts independent and structurally match.


DELETE vendor-credentials/types.ts; direct core imports and barrel type forwarding removed. Adapter held separately.

### WMZ18 — Source control
Mutations: save-after-card-abort; commit-during-dry-run. Reuse Jini credential/store/dry-run pins and existing host saved-key tests; repoint portable contracts/errors/read operations first. Not run. Old host vault binding remains because WMZ17 adapter parity held; package store uses its existing carried credentialVault port.


DELETE source-control/types.ts; BIND store.ts/credential-setup.ts. Read/default/find/errors/contracts and abort-guard operation imports now direct package imports. Registrar cutover next in this unit.

BIND source-control/tool-registrations.ts with existing catalog/commit/provider/secure-card operations. Portable risk and SavedKeyReader consumers direct. WMZ18 complete excluding earlier independently held WMZ17 adapter.

### WMZ19 — Webhooks/root keys/guard CLIs
Mutations: skip-first-present-invalid-key; restamp-with-key-dependent-data; ignore-missing-aad. Jini synthetic scanner/key pins and existing host sealed fixtures retained; no real-secret scan, tests or CLIs run. Guard binder changes follow.


BIND seal-aad-invariant.ts/secret-scan-guard.ts traversal/readers to new node owners. Host allowlists, roots, git resolver, limits, CLI paths, main formatting/exit guards unchanged. Key source/material/reconcile binding pending independent inspection below.

WMZ19 keyring.env.ts STOP: platform EnvOrFileKeyring caches its first root; host rereads ordered sources on every derivation. Material inspection does not expose the parsed first-present invalid source with hexDigits, needed by host refusal copy without rereading. No named ordered-derivation seam is exported. Keep that class/first-present source path; independent source/file/reconcile bindings continue.

BIND site-key-sources.ts material/metadata reads and site-key-ensure.ts reconciliation/install/file primitives. Preserve lazy stamp getter after per-site read, owner layout, env, metadata writes, modes, random/time. Reconciliation generic bodies removed; host boot/id policy retained. keyring.env.ts remains held as above.

### WMZ20 — Site export
Mutations: prefer-explicit-base-path-over-destination; leave-stale-feed-without-public-origin. Existing export identity/feed/warning pins retained; portable exports/test imports repointed before binding. Not run.


BIND site-exporter.ts; retain exact theme layout/assets/header policy. Remove forwarding exports by symbol from exporter and index. Existing stale orphan engine comments removed with their old source shell; active orchestration why-comments live in Jini owner.

### WMZ21 — Site backup (partial)
Mutations: commit-after-parent-changes; skip-unknown-populated-table-refusal; unlink-before-expiry-tombstone. Existing/Jini snapshot/share-expiry pins retained; not run.
STOP backup-service.ts: Jini backup-service.plan.savePlan omits `tovuVersion: required.sources.tovuVersion`, which source writes between schema and createdAt. Plan-store payload differs and host manifest policy consumes this version. STOP dependent tool-registrations.ts because it imports package planSiteBackup/pushSiteBackup directly and offers no service-operation injection. Independent projection/retention continue.


DELETE share-retention.ts after binding isOwnShareFolder at composition and unit fixture; BIND share-database/repo.sqlite.ts to trusted schema/kernel/temp roots. Distinct shareProjection/archiveMedia staging prefixes retained. Other host backup bindings unchanged.

### WMZ22 — Site inspection
Mutation: accept-caller-context-override. Existing host request/section/capability/live-refusal pins retained; portable risk/type consumers repointed first. Not run.


BIND tool-registrations.ts to catalog-host/deps and evidence operations; remove deps forwarding export. Live origin/limits/log copy preserved.

### WMZ23 — Taxonomy (partial)
Mutation: apply-child-before-parent. Publish source byte-identical to destination; repoint existing publish tests first; not run. STOP agent-tools.ts: Jini handoff held additive injected catalog seam (static catalog has no named factory). Leave catalog and its consumers unchanged.


DELETE taxonomy/publish-content.ts; manifest and tests import both contributors from package.

### WMZ24 — Trash
Mutation: advance-credential-fence-outside-marker-transaction. Jini pins plus existing redirect/user/member/visibility/trash-item tests retained, not run. Portable constants/types and remaining-days imports repointed before bind edits.


BIND redirect/user/member SQL adapters and permissions with existing host tables/map; trash-item-tool was already a host delegate/live-version/mover binder and retains its generic engine/catalog imports from the supported @jini-ai/cms/trash owner. Keep comments/theme adapters and tool-registrations.ts unchanged.

### WMZ25 — Web
KEEP web/policy.ts unchanged. Mutation: change-per-host-window (existing host rate-budget pin; no new test).

### WMZ26 — Web screenshot
Mutation: authorize-after-listing-captures. Jini capture binding/root-lock and existing host preview/apply pins retained; direct tests repointed first, not run. Package binding body is byte-identical to source.


DELETE capture-retention.ts; screenshot storage and direct tests use two direct package owners, same writer fence/auth bindings.

### WMZ27 — Widgets
Mutation: write-widget-before-destination-schema-check. Repoint existing widget publish tests first, retain Jini repeated-area/form-reference/schema refusal pins; not run.


DELETE widgets/publish-content.ts; manifest and direct publish tests inject widget registry, read-only post writes, binding-table and config-reference policy. Runtime visibility/registration/themes unchanged.

Final diff cleanup: removed unused mail Collaborators assertion/import and newsletter pipeline import; removed obsolete exporter-barrel identity assertions/imports for symbols whose forwarding exports were deleted (avoids tautological direct-owner assertions); removed unused moved key/file imports. Preserved permanent-delete contributor buildDeps signature and deferred projection temp-root construction. No unrelated feature cleanup.

WMZ03 publish-content.ts STOP: package MediaBag requires createBlobWriteBindings/uploadCaps in every supplied media port. Complete cutover reaches apps/website/src/features/theme/__tests__/publish-content.apply.test.ts:130, whose existing media fixture has neither. Dispatch prohibits theme edits. Required held edit: import createHostBlobWriteBindings from @jini-ai/cms/media/site/blob-write-bindings and UPLOAD_CAPS; supply createBlobWriteBindings:createHostBlobWriteBindings and uploadCaps:UPLOAD_CAPS in that fixture, then inject the same fields in TovuPublishPorts.media and every publish media-port assembly before deleting the contributor. No half-typed host-bag change staged.

Final WMZ19 type cutover: portable decision/result/material type consumers import root-key/decide directly; host RuntimeMode input and path-bearing result contracts remain in site-key-ensure.ts.

WMZ10 follow-up: post-create is independent of the held repository extraction. DELETE post-create.ts after repointing its existing characterization tests first; inject the same RESERVED_SEGMENTS at every direct createPost caller. post-update has an independent package defect: unchangedLiveRow still calls isDeepStrictEqual as a value after its import was changed to type-only, while UpdatePostDeps injects the comparator elsewhere. STOP that file pending package correction; do not route a live no-op save into an undefined comparator.

WMZ10 independent policy symbols drained: assistantPostAttribution and postDerivedRisk import directly from posts/post-tool-policy, including the registrar forwarding export. Remaining postCommandDeps projection takes the enlarged package PostToolDeps; it stays with the held registrar closure. Restored source-control handler optional default exactly as source. WMZ14 binder preserves original {routeDeps,surfaces} argument shape.

Final export audit: cms/trash/trash-item-tool is not a public subpath in the Jini manifest; the existing @jini-ai/cms/trash export already owns buildTrashItemAgentToolCatalog/deriveTrashItemRegistrations. Keep this supported direct owner (no new export/intake). trash-item-tool.ts was already pure host delegation, so only its moved redirect/user constants needed repointing. The unrelated pre-existing core/contracts/events/change-set import is unchanged.

WMZ10 independent publish contributor completed: DELETE post/publish-content.ts after repointing existing publish/terms/round-trip/retirement pins. Add only the Jini-named reportRollbackError callback to the host post port contract, live/memory/read-only publish assemblies and existing fixtures. It invokes the original console.error(message,diagnostic) at the original failure point. No theme file or actor repo change is needed for this independent contributor.

## Final source dispositions (supersedes earlier pending notes)

77 dispatched MOVE paths: **22 DELETE, 30 BIND, 25 HELD**. The enumerated table has **56 STAYS-HOST paths**, so it contains 133 unique paths, despite the dispatch totals of 57/134. No missing row has been invented.

Pinned-tree review: 76 of the 77 MOVE sources match a96020e1e7 at actual HEAD. member-login/providers.ts differs only by its explicit TOVU_AGENT_PLUGIN_IDENTITY_READ argument/import; the named acceptsManifest port preserves this actual-tip host policy verbatim. All 56 enumerated KEEP sources match the source pin. Jini source comparisons use ad558c8824ba2a97cbe58c110df80661aed371ee.

| Sheet | Status | Exact source | Result / remaining prerequisite |
|---|---|---|---|
| WMZ01 | DELETE | `apps/website/src/features/project-keys/service.ts` | Removed; consumers import the package owner directly. |
| WMZ01 | DELETE | `apps/website/src/features/project-keys/attachments.ts` | Removed; consumers import the package owner directly. |
| WMZ01 | BIND | `apps/website/src/features/project-keys/shared-oauth-disconnect.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ02 | BIND | `apps/website/src/features/mail-status/delivery-tool-registrations.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ02 | BIND | `apps/website/src/features/mail-status/provider-operations.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ02 | BIND | `apps/website/src/features/mail-status/provider-tool-registrations.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ02 | BIND | `apps/website/src/features/mail-status/tool-registrations.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ03 | DELETE | `apps/website/src/features/media/blob-write-bindings.ts` | Removed; consumers import the package owner directly. |
| WMZ03 | DELETE | `apps/website/src/features/media/derived-media-link.ts` | Removed; consumers import the package owner directly. |
| WMZ03 | DELETE | `apps/website/src/features/media/media-search-source.ts` | Removed; consumers import the package owner directly. |
| WMZ03 | BIND | `apps/website/src/features/media/import-video-conversion.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ03 | HELD | `apps/website/src/features/media/provider-credential-store.memory.ts` | Dependent on held vault: package memory repo subclasses package MediaProviderCredentialVaultRepo; cannot retain the old findOne semantics through its constructor. |
| WMZ03 | HELD | `apps/website/src/features/media/provider-credential-store.ts` | Dependent on held vault: package store imports its vault owner directly; no injected replacement seam preserves the old check sequence. |
| WMZ03 | HELD | `apps/website/src/features/media/provider-credential-vault.ts` | NEEDS-OPUS: Jini findOne adds ownedProviderId validation before provider equality; source lacks it. |
| WMZ03 | HELD | `apps/website/src/features/media/publish-content.ts` | Theme-edit constraint: required media blob-fence/cap fields must also be added to theme/__tests__/publish-content.apply.test.ts:130; exact required edits described above. |
| WMZ03 | HELD | `apps/website/src/features/media/view-video-tool.ts` | NEEDS-OPUS: extractionOptions omits an undefined signal, where source always passes its signal property. |
| WMZ04 | DELETE | `apps/website/src/features/media-generation/media-provider-catalog.ts` | Removed; consumers import the package owner directly. |
| WMZ04 | HELD | `apps/website/src/features/media-generation/tool-registrations.ts` | NEEDS-OPUS: CMS saved-selection pass adds missing-model refusal and storage upload omits undefined editorial keys; private selector cannot be replaced by the new integrations operation. |
| WMZ05 | HELD | `apps/website/src/features/media-import/tool-registrations.ts` | NEEDS-OPUS: existing local handler adds missing-filename validation and rewrites undefined editorial properties; no equivalent refusal/replacement binding. |
| WMZ06 | DELETE | `apps/website/src/features/member-login/providers.ts` | Removed; consumers import the package owner directly. |
| WMZ07 | BIND | `apps/website/src/features/members/tool-registrations.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ08 | DELETE | `apps/website/src/features/navigation/publish-content.ts` | Removed; consumers import the package owner directly. |
| WMZ09 | BIND | `apps/website/src/features/newsletter/delivery/tool-registrations.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ09 | BIND | `apps/website/src/features/newsletter/tool-registrations.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ10 | DELETE | `apps/website/src/features/post/publish-content.ts` | Removed; consumers import the package owner directly. |
| WMZ10 | DELETE | `apps/website/src/features/post/post-create.ts` | Removed; consumers import the package owner directly. |
| WMZ10 | DELETE | `apps/website/src/features/post/post-retire.ts` | Removed; consumers import the package owner directly. |
| WMZ10 | DELETE | `apps/website/src/features/post/post-trash.ts` | Removed; consumers import the package owner directly. |
| WMZ10 | DELETE | `apps/website/src/features/post/reverters.ts` | Removed; consumers import the package owner directly. |
| WMZ10 | DELETE | `apps/website/src/features/post/revision-refs.ts` | Removed; consumers import the package owner directly. |
| WMZ10 | BIND | `apps/website/src/features/post/preview-tool.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ10 | BIND | `apps/website/src/features/post/revision-thinning.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ10 | HELD | `apps/website/src/features/post/post-tool-delete.ts` | Dependent contract closure: loadDeletablePost takes the entire enlarged package PostToolDeps; existing host registrar cannot satisfy it until its held package dependencies are corrected. |
| WMZ10 | HELD | `apps/website/src/features/post/post-tool-deps.ts` | Dependent on broken tool-input/update closure: package PostToolDeps adds required policy/command/view/template/media ports; deleting the host contract before its registrar can bind them breaks every existing handler caller. |
| WMZ10 | HELD | `apps/website/src/features/post/post-tool-duplicate.ts` | Dependent contract closure: package duplicate contributor requires enlarged PostToolDeps for command/view/permission/creation ports; existing host registration callers use the held host contract. |
| WMZ10 | HELD | `apps/website/src/features/post/post-tool-input.ts` | NEEDS-OPUS: package file declares normalizePublishAt twice through duplicate value imports. |
| WMZ10 | HELD | `apps/website/src/features/post/post-tool-list.ts` | Dependent contract closure: package toPostListRow requires enlarged PostToolDeps including postToolViewDeps; existing host callers use the held host contract. |
| WMZ10 | HELD | `apps/website/src/features/post/post-tool-policy.ts` | Partial portable drain complete (attribution/risk direct); generic postCommandDeps still takes the enlarged package PostToolDeps, so full policy bind waits for the held registrar contract closure. |
| WMZ10 | HELD | `apps/website/src/features/post/post-tool-update.ts` | Dependent on broken post-tool-input, imported directly for optional input parsers. |
| WMZ10 | HELD | `apps/website/src/features/post/post-update.ts` | NEEDS-OPUS: package unchangedLiveRow calls isDeepStrictEqual as a value after changing its import to type-only; the injected comparator is not threaded into that helper. |
| WMZ10 | HELD | `apps/website/src/features/post/repo.memory.ts` | NEEDS-OPUS: Jini memory repository extraction was not built because actorKind is absent from source revision reconstruction. |
| WMZ10 | HELD | `apps/website/src/features/post/repo.rows.ts` | NEEDS-OPUS: Jini actor codec extraction was not built; requested actor round-trip conflicts with source reconstruction. |
| WMZ10 | HELD | `apps/website/src/features/post/repo.ts` | NEEDS-OPUS: Jini SQL repository extraction was not built because source revision reconstruction omits actorKind; no new destination at this branch. |
| WMZ10 | HELD | `apps/website/src/features/post/tool-registrations.ts` | Dependent on post-tool-input duplicate binding and post-update undefined comparator; the package handler modules import them directly, with no host replacement seam. |
| WMZ11 | DELETE | `apps/website/src/features/pages/html-inverse.ts` | Removed; consumers import the package owner directly. |
| WMZ11 | DELETE | `apps/website/src/features/pages/html-reverter.ts` | Removed; consumers import the package owner directly. |
| WMZ11 | BIND | `apps/website/src/features/pages/html-change-recording.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ12 | BIND | `apps/website/src/features/permanent-delete/tool-registrations.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ13 | BIND | `apps/website/src/features/plugin-runtime/install-archive.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ14 | BIND | `apps/website/src/features/publish-content/tool-registrations.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ16 | HELD | `apps/website/src/features/recovery/tool-registrations.ts` | NEEDS-OPUS: package adds planId/planHash/confirmationToken validation and reshapes prepared plans, beyond the named host/export seam. |
| WMZ17 | DELETE | `apps/website/src/features/vendor-credentials/types.ts` | Removed; consumers import the package owner directly. |
| WMZ17 | HELD | `apps/website/src/features/vendor-credentials/vault-adapter.ts` | NEEDS-OPUS: shared binding adds derive/deriveSigningSecret fallbacks to openService keyring; source provides activeKey only. |
| WMZ18 | DELETE | `apps/website/src/features/source-control/types.ts` | Removed; consumers import the package owner directly. |
| WMZ18 | BIND | `apps/website/src/features/source-control/credential-setup.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ18 | BIND | `apps/website/src/features/source-control/store.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ18 | BIND | `apps/website/src/features/source-control/tool-registrations.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ19 | BIND | `apps/website/src/features/webhooks/seal-aad-invariant.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ19 | BIND | `apps/website/src/features/webhooks/secret-scan-guard.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ19 | BIND | `apps/website/src/features/webhooks/site-key-ensure.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ19 | BIND | `apps/website/src/features/webhooks/site-key-sources.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ19 | HELD | `apps/website/src/features/webhooks/keyring.env.ts` | NEEDS-OPUS: platform keyring caches first root; host rereads ordered sources on derive. Material API lacks parsed invalid-source/hexDigits result needed without extra reads. |
| WMZ20 | BIND | `apps/website/src/features/site-export/site-exporter.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ21 | DELETE | `apps/website/src/features/site-backup/share-retention.ts` | Removed; consumers import the package owner directly. |
| WMZ21 | BIND | `apps/website/src/features/site-backup/share-database/repo.sqlite.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ21 | HELD | `apps/website/src/features/site-backup/backup-service.ts` | NEEDS-OPUS: package savePlan omits tovuVersion:required.sources.tovuVersion from stored plan. |
| WMZ21 | HELD | `apps/website/src/features/site-backup/tool-registrations.ts` | Dependent on held backup service: package registrar imports package plan/push operations directly without an injected service-operation seam. |
| WMZ22 | BIND | `apps/website/src/features/site-inspection/tool-registrations.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ23 | DELETE | `apps/website/src/features/taxonomy/publish-content.ts` | Removed; consumers import the package owner directly. |
| WMZ23 | HELD | `apps/website/src/features/taxonomy/agent-tools.ts` | NEEDS-OPUS: Jini handoff did not build the additive term catalog factory; existing static catalog lacks the named permission/read-reference seam. |
| WMZ24 | BIND | `apps/website/src/features/trash/adapters/redirect.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ24 | BIND | `apps/website/src/features/trash/adapters/user.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ24 | BIND | `apps/website/src/features/trash/member-credential-ports.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ24 | BIND | `apps/website/src/features/trash/permissions.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ24 | BIND | `apps/website/src/features/trash/trash-item-tool.ts` | Host policy and dependency injection only; generic implementation resides in Jini. |
| WMZ26 | DELETE | `apps/website/src/features/web-screenshot/capture-retention.ts` | Removed; consumers import the package owner directly. |
| WMZ27 | DELETE | `apps/website/src/features/widgets/publish-content.ts` | Removed; consumers import the package owner directly. |

## Exact anchored keep ledger

Each expression names one file. These are host-policy keeps or residual dependency bindings, not directory/name-pattern exemptions. Held MOVE files above are not counted as keeps.

| Sheet | Disposition | Exact anchored expression |
|---|---|---|
| WMZ01 | KEEP host policy | `^apps/website/src/features/project\-keys/host\-bindings\.ts$` |
| WMZ01 | BIND host dependencies/policy | `^apps/website/src/features/project\-keys/shared\-oauth\-disconnect\.ts$` |
| WMZ01 | KEEP host policy | `^apps/website/src/features/project\-keys/vault\-policy\.ts$` |
| WMZ02 | BIND host dependencies/policy | `^apps/website/src/features/mail\-status/delivery\-tool\-registrations\.ts$` |
| WMZ02 | BIND host dependencies/policy | `^apps/website/src/features/mail\-status/provider\-operations\.ts$` |
| WMZ02 | BIND host dependencies/policy | `^apps/website/src/features/mail\-status/provider\-tool\-registrations\.ts$` |
| WMZ02 | BIND host dependencies/policy | `^apps/website/src/features/mail\-status/tool\-registrations\.ts$` |
| WMZ03 | KEEP host policy | `^apps/website/src/features/media/chat\-attachment\-reader\-host\.ts$` |
| WMZ03 | BIND host dependencies/policy | `^apps/website/src/features/media/import\-video\-conversion\.ts$` |
| WMZ03 | KEEP host policy | `^apps/website/src/features/media/large\-upload\-routing\-copy\.ts$` |
| WMZ04 | KEEP host policy | `^apps/website/src/features/media\-generation/host\-media\-providers\.ts$` |
| WMZ04 | KEEP host policy | `^apps/website/src/features/media\-generation/provider\-card\-host\.ts$` |
| WMZ06 | KEEP host policy | `^apps/website/src/features/member\-login/bindings\.ts$` |
| WMZ07 | BIND host dependencies/policy | `^apps/website/src/features/members/tool\-registrations\.ts$` |
| WMZ09 | BIND host dependencies/policy | `^apps/website/src/features/newsletter/delivery/tool\-registrations\.ts$` |
| WMZ09 | BIND host dependencies/policy | `^apps/website/src/features/newsletter/tool\-registrations\.ts$` |
| WMZ10 | KEEP host policy | `^apps/website/src/features/post/post\-catalog\-host\.ts$` |
| WMZ10 | BIND host dependencies/policy | `^apps/website/src/features/post/preview\-tool\.ts$` |
| WMZ10 | BIND host dependencies/policy | `^apps/website/src/features/post/revision\-thinning\.ts$` |
| WMZ10 | KEEP host policy | `^apps/website/src/features/post/search\-scratch\-host\.ts$` |
| WMZ11 | BIND host dependencies/policy | `^apps/website/src/features/pages/html\-change\-recording\.ts$` |
| WMZ11 | KEEP host policy | `^apps/website/src/features/pages/tool\-host\.ts$` |
| WMZ12 | BIND host dependencies/policy | `^apps/website/src/features/permanent\-delete/tool\-registrations\.ts$` |
| WMZ13 | KEEP host policy | `^apps/website/src/features/plugin\-runtime/built\-ins/word\-count/index\.ts$` |
| WMZ13 | KEEP host policy | `^apps/website/src/features/plugin\-runtime/host\-install\-source\.ts$` |
| WMZ13 | BIND host dependencies/policy | `^apps/website/src/features/plugin\-runtime/install\-archive\.ts$` |
| WMZ13 | KEEP host policy | `^apps/website/src/features/plugin\-runtime/site\-plugin\-vocabulary\.ts$` |
| WMZ14 | KEEP host policy | `^apps/website/src/features/publish\-content/backstop\-service\.ts$` |
| WMZ14 | KEEP host policy | `^apps/website/src/features/publish\-content/backstop\-sqlite\-binding\.ts$` |
| WMZ14 | KEEP host policy | `^apps/website/src/features/publish\-content/destination\-credential\.ts$` |
| WMZ14 | KEEP host policy | `^apps/website/src/features/publish\-content/disconnect\-tool\.ts$` |
| WMZ14 | KEEP host policy | `^apps/website/src/features/publish\-content/peer\-transport\-binding\.ts$` |
| WMZ14 | KEEP host policy | `^apps/website/src/features/publish\-content/peers\.ts$` |
| WMZ14 | KEEP host policy | `^apps/website/src/features/publish\-content/publish\-tool\.ts$` |
| WMZ14 | KEEP host policy | `^apps/website/src/features/publish\-content/pull\.ts$` |
| WMZ14 | KEEP host policy | `^apps/website/src/features/publish\-content/push\-plan\.ts$` |
| WMZ14 | KEEP host policy | `^apps/website/src/features/publish\-content/raw\-file\-contributor\.ts$` |
| WMZ14 | KEEP host policy | `^apps/website/src/features/publish\-content/raw\-row\-contributor\.ts$` |
| WMZ14 | KEEP host policy | `^apps/website/src/features/publish\-content/tool\-deps\.ts$` |
| WMZ14 | BIND host dependencies/policy | `^apps/website/src/features/publish\-content/tool\-registrations\.ts$` |
| WMZ15 | KEEP host policy | `^apps/website/src/features/publish\-trust/candidate\-policy\.ts$` |
| WMZ18 | BIND host dependencies/policy | `^apps/website/src/features/source\-control/credential\-setup\.ts$` |
| WMZ18 | KEEP host policy | `^apps/website/src/features/source\-control/source\-control\-credential\-repo\.ts$` |
| WMZ18 | BIND host dependencies/policy | `^apps/website/src/features/source\-control/store\.ts$` |
| WMZ18 | BIND host dependencies/policy | `^apps/website/src/features/source\-control/tool\-registrations\.ts$` |
| WMZ19 | BIND host dependencies/policy | `^apps/website/src/features/webhooks/seal\-aad\-invariant\.ts$` |
| WMZ19 | BIND host dependencies/policy | `^apps/website/src/features/webhooks/secret\-scan\-guard\.ts$` |
| WMZ19 | BIND host dependencies/policy | `^apps/website/src/features/webhooks/site\-key\-ensure\.ts$` |
| WMZ19 | BIND host dependencies/policy | `^apps/website/src/features/webhooks/site\-key\-sources\.ts$` |
| WMZ20 | KEEP host policy | `^apps/website/src/features/site\-export/export\-preflight\-copy\.ts$` |
| WMZ20 | KEEP host policy | `^apps/website/src/features/site\-export/media\-url\-bindings\.ts$` |
| WMZ20 | KEEP host policy | `^apps/website/src/features/site\-export/route\-manifest\.ts$` |
| WMZ20 | BIND host dependencies/policy | `^apps/website/src/features/site\-export/site\-exporter\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/archive\-extensions\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/archive\-manifest\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/import\-backend\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/import\-database\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/import\-keep\-off\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/import\-plugin\-state\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/import\-restore\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/import\-verifier\-projection\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/import\-verifier\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/package\-file\-inventory\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/push\-manifest\.ts$` |
| WMZ21 | BIND host dependencies/policy | `^apps/website/src/features/site\-backup/share\-database/repo\.sqlite\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/share\-expiry\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/share\-hosting\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/share\-own\-folder\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/share\-preparation\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/share\-registry\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/share\-service\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/share\-steps\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/share\-zip\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/sources\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/static\-download\-host\.ts$` |
| WMZ21 | KEEP host policy | `^apps/website/src/features/site\-backup/static\-site\-packager\.ts$` |
| WMZ22 | KEEP host policy | `^apps/website/src/features/site\-inspection/catalog\-host\.ts$` |
| WMZ22 | BIND host dependencies/policy | `^apps/website/src/features/site\-inspection/tool\-registrations\.ts$` |
| WMZ24 | BIND host dependencies/policy | `^apps/website/src/features/trash/adapters/redirect\.ts$` |
| WMZ24 | BIND host dependencies/policy | `^apps/website/src/features/trash/adapters/user\.ts$` |
| WMZ24 | BIND host dependencies/policy | `^apps/website/src/features/trash/member\-credential\-ports\.ts$` |
| WMZ24 | BIND host dependencies/policy | `^apps/website/src/features/trash/permissions\.ts$` |
| WMZ24 | KEEP host policy | `^apps/website/src/features/trash/tool\-registrations\.ts$` |
| WMZ24 | BIND host dependencies/policy | `^apps/website/src/features/trash/trash\-item\-tool\.ts$` |
| WMZ25 | KEEP host policy | `^apps/website/src/features/web/policy\.ts$` |
| WMZ26 | KEEP host policy | `^apps/website/src/features/web\-screenshot/catalog\-host\.ts$` |

## Ordered file inventory for coordinator commits

These are logical sheet units, not commits made here. Shared importer files can appear in multiple units. All paths below are repository-relative.

### WMZ01 files

- `apps/admin/src/lib/__tests__/credential-copy-card-frame.unit.test.ts`
- `apps/website/src/assistant/tool-registrations.ts`
- `apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts`
- `apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts`
- `apps/website/src/features/mail-status/provider-operations.ts`
- `apps/website/src/features/project-keys/__tests__/a02-credential-contract.pin.unit.test.ts`
- `apps/website/src/features/project-keys/__tests__/attachments.unit.test.ts`
- `apps/website/src/features/project-keys/__tests__/reference-only.unit.test.ts`
- `apps/website/src/features/project-keys/__tests__/tools.unit.test.ts`
- `apps/website/src/features/project-keys/attachments.ts`
- `apps/website/src/features/project-keys/service.ts`
- `apps/website/src/features/project-keys/shared-oauth-disconnect.ts`
- `apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts`
- `apps/website/src/server/__tests__/routes/mail-providers-route.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/__tests__/custom-credentials-inventory.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/other-site-keys.integration.test.ts`
- `apps/website/src/server/runtime/composition/project-store.ts`

### WMZ02 files

- `apps/website/src/features/mail-status/__tests__/clear-captured-tool.dialects.test.ts`
- `apps/website/src/features/mail-status/__tests__/delivery-visibility.unit.test.ts`
- `apps/website/src/features/mail-status/__tests__/mail-status-tool.test.ts`
- `apps/website/src/features/mail-status/__tests__/provider-operations.unit.test.ts`
- `apps/website/src/features/mail-status/__tests__/provider-tools.unit.test.ts`
- `apps/website/src/features/mail-status/delivery-tool-registrations.ts`
- `apps/website/src/features/mail-status/provider-operations.ts`
- `apps/website/src/features/mail-status/provider-tool-registrations.ts`
- `apps/website/src/features/mail-status/tool-registrations.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/mail-providers.ts`
- `apps/website/src/server/runtime/composition/mail-capture-clear-planner.ts`
- `apps/website/src/server/runtime/composition/modules/system-mail.ts`

### WMZ03 files

- `apps/website/src/features/media/__tests__/convert-video-registration.test.ts`
- `apps/website/src/features/media/__tests__/import-video-conversion.test.ts`
- `apps/website/src/features/media/__tests__/media-change-events.test.ts`
- `apps/website/src/features/media/__tests__/media-description-search.test.ts`
- `apps/website/src/features/media/blob-write-bindings.ts`
- `apps/website/src/features/media/derived-media-link.ts`
- `apps/website/src/features/media/import-video-conversion.ts`
- `apps/website/src/features/media/media-search-source.ts`
- `apps/website/src/features/media/publish-content.ts`
- `apps/website/src/features/media/tool-registrations.ts`
- `apps/website/src/server/runtime/composition/http-app/mount-admin-features.ts`
- `apps/website/src/server/runtime/composition/modules/publish-content-blobs.ts`
- `apps/website/src/server/runtime/composition/modules/site-search.ts`
- `apps/website/src/server/runtime/composition/site-deps/boot-data.ts`
- `apps/website/src/server/runtime/composition/site-deps/content-stores.ts`
- `apps/website/src/server/runtime/composition/site-deps/trash-adapters.ts`
- `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`

### WMZ04 files

- `apps/website/src/features/media-generation/media-provider-catalog.ts`
- `apps/website/src/server/runtime/composition/modules/media.ts`

### WMZ05 files

No working-tree edits (KEEP or held unit as detailed above).

### WMZ06 files

- `apps/website/src/features/member-login/__tests__/providers.test.ts`
- `apps/website/src/features/member-login/__tests__/ready-providers.test.ts`
- `apps/website/src/features/member-login/bindings.ts`
- `apps/website/src/features/member-login/providers.ts`

### WMZ07 files

- `apps/website/src/features/members/tool-registrations.ts`

### WMZ08 files

- `apps/website/src/features/navigation/__tests__/publish-content.characterization.test.ts`
- `apps/website/src/features/navigation/__tests__/publish-content.test.ts`
- `apps/website/src/features/navigation/__tests__/reverters.test.ts`
- `apps/website/src/features/navigation/publish-content.ts`
- `apps/website/src/features/publish-content/__tests__/apply-loop.test.ts`
- `apps/website/src/features/publish-content/__tests__/references.test.ts`
- `apps/website/src/server/runtime/composition/publish-content-manifest.ts`

### WMZ09 files

- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/features/newsletter/__tests__/delivery-tools.test.ts`
- `apps/website/src/features/newsletter/__tests__/tool-registrations.model-facing-errors.test.ts`
- `apps/website/src/features/newsletter/delivery/tool-registrations.ts`
- `apps/website/src/features/newsletter/tool-registrations.ts`

### WMZ10 files

- `apps/website/src/assistant/__tests__/pages-read-html-batch.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts`
- `apps/website/src/contracts/core/commands/__tests__/integration/revert-plugin-ext.integration.test.ts`
- `apps/website/src/contracts/core/commands/__tests__/post-delete-reverter.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-export.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-save.test.ts`
- `apps/website/src/features/change-sets/__tests__/tool-registrations.test.ts`
- `apps/website/src/features/consent/__tests__/ensure-privacy-defaults.test.ts`
- `apps/website/src/features/email-templates/__tests__/operations.test.ts`
- `apps/website/src/features/media/__tests__/mediawidget-where-used.test.ts`
- `apps/website/src/features/pages/__tests__/edit-html-permission.test.ts`
- `apps/website/src/features/pages/__tests__/hidden-until-script.test.ts`
- `apps/website/src/features/pages/__tests__/html-document-store.memory.test.ts`
- `apps/website/src/features/pages/__tests__/html-document-store.noop-save.test.ts`
- `apps/website/src/features/pages/__tests__/html-undo.integration.test.ts`
- `apps/website/src/features/pages/__tests__/metadata-edit-preserves-html.test.ts`
- `apps/website/src/features/pages/__tests__/read-html-scope.integration.test.ts`
- `apps/website/src/features/pages/__tests__/tool-registrations.lost-update.test.ts`
- `apps/website/src/features/pages/__tests__/tool-registrations.move-region.test.ts`
- `apps/website/src/features/pages/__tests__/tool-registrations.read-html.test.ts`
- `apps/website/src/features/pages/__tests__/tool-registrations.test.ts`
- `apps/website/src/features/pages/__tests__/tool-registrations.write-region.test.ts`
- `apps/website/src/features/plugin-runtime/__tests__/fixtures/extract-s6-g-plug-tier2-observe.ts`
- `apps/website/src/features/plugin-runtime/__tests__/integration/activation.integration.test.ts`
- `apps/website/src/features/post/__tests__/L156-characterization.test.ts`
- `apps/website/src/features/post/__tests__/integration/post-plugin-hook.integration.test.ts`
- `apps/website/src/features/post/__tests__/post.author.test.ts`
- `apps/website/src/features/post/__tests__/post.authorship.test.ts`
- `apps/website/src/features/post/__tests__/post.body-format.test.ts`
- `apps/website/src/features/post/__tests__/post.creator-kind.test.ts`
- `apps/website/src/features/post/__tests__/post.delete.test.ts`
- `apps/website/src/features/post/__tests__/post.derived-slug-limit.test.ts`
- `apps/website/src/features/post/__tests__/post.noop-save.test.ts`
- `apps/website/src/features/post/__tests__/post.presentation-validation.unit.test.ts`
- `apps/website/src/features/post/__tests__/post.reserved-slugs.test.ts`
- `apps/website/src/features/post/__tests__/post.restore-forward.test.ts`
- `apps/website/src/features/post/__tests__/post.revisions.test.ts`
- `apps/website/src/features/post/__tests__/post.schedule-events.test.ts`
- `apps/website/src/features/post/__tests__/post.schedule-featured.test.ts`
- `apps/website/src/features/post/__tests__/post.split.characterization.test.ts`
- `apps/website/src/features/post/__tests__/post.test.ts`
- `apps/website/src/features/post/__tests__/post.title-limit.test.ts`
- `apps/website/src/features/post/__tests__/post.trashed-slug-release.test.ts`
- `apps/website/src/features/post/__tests__/post.write-guards.test.ts`
- `apps/website/src/features/post/__tests__/preview-tool.test.ts`
- `apps/website/src/features/post/__tests__/publish-content.characterization.test.ts`
- `apps/website/src/features/post/__tests__/publish-content.round-trip.test.ts`
- `apps/website/src/features/post/__tests__/publish-content.schedule-featured.test.ts`
- `apps/website/src/features/post/__tests__/publish-content.terms.test.ts`
- `apps/website/src/features/post/__tests__/publish-content.test.ts`
- `apps/website/src/features/post/__tests__/repo.author.test.ts`
- `apps/website/src/features/post/__tests__/retire-post.test.ts`
- `apps/website/src/features/post/__tests__/reverters.schedule-events.test.ts`
- `apps/website/src/features/post/__tests__/reverters.test.ts`
- `apps/website/src/features/post/__tests__/revision-refs.test.ts`
- `apps/website/src/features/post/__tests__/revision-thinning.postgres.test.ts`
- `apps/website/src/features/post/__tests__/revision-thinning.test.ts`
- `apps/website/src/features/post/__tests__/search-index.sqlite.test.ts`
- `apps/website/src/features/post/__tests__/search.dialects.test.ts`
- `apps/website/src/features/post/__tests__/search.pglite-socket.integration.test.ts`
- `apps/website/src/features/post/__tests__/tool-registrations.html-page-body.test.ts`
- `apps/website/src/features/post/__tests__/tool-registrations.partial-update.test.ts`
- `apps/website/src/features/post/index.ts`
- `apps/website/src/features/post/post-create.ts`
- `apps/website/src/features/post/post-retire.ts`
- `apps/website/src/features/post/post-tool-deps.ts`
- `apps/website/src/features/post/post-tool-duplicate.ts`
- `apps/website/src/features/post/post-tool-policy.ts`
- `apps/website/src/features/post/post-trash.ts`
- `apps/website/src/features/post/preview-tool.ts`
- `apps/website/src/features/post/publish-content.ts`
- `apps/website/src/features/post/reverters.ts`
- `apps/website/src/features/post/revision-refs.ts`
- `apps/website/src/features/post/revision-thinning.ts`
- `apps/website/src/features/post/tool-registrations.ts`
- `apps/website/src/features/publish-content/__tests__/apply-loop.test.ts`
- `apps/website/src/features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts`
- `apps/website/src/features/publish-content/__tests__/gated-hooks.baseline-principal.test.ts`
- `apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts`
- `apps/website/src/features/publish-content/__tests__/no-dead-apply-stub.boundary.test.ts`
- `apps/website/src/features/publish-content/__tests__/planner.test.ts`
- `apps/website/src/features/publish-content/__tests__/references.test.ts`
- `apps/website/src/features/publish-content/__tests__/round-trip-harness.ts`
- `apps/website/src/features/publish-content/tovu-publish-ports.ts`
- `apps/website/src/features/seo/__tests__/sitemap-invalidation.integration.test.ts`
- `apps/website/src/features/taxonomy/__tests__/tool-contract.characterization.test.ts`
- `apps/website/src/features/trash/__tests__/post-delete-undo-index.test.ts`
- `apps/website/src/features/trash/__tests__/post-trash-media-evidence.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/embed-service.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/tool-registrations.plugin-hook-failed.test.ts`
- `apps/website/src/features/widgets/__tests__/tool-contract.characterization.test.ts`
- `apps/website/src/features/widgets/__tests__/unit/deps.post-writes.unit.test.ts`
- `apps/website/src/features/widgets/__tests__/unit/deps.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/pages/__tests__/pages-route-gaps.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/pages/__tests__/unit/h4-delete.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/deps.ts`
- `apps/website/src/server/inbound/admin-http/routes/trash/__tests__/page-display-kind.integration.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/pages-html-revisions-wiring.integration.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/peer-site-reads.fixture.ts`
- `apps/website/src/server/runtime/composition/__tests__/publish-content-seed-hash.test.ts`
- `apps/website/src/server/runtime/composition/memory-deps/route-deps/assistant-and-site.ts`
- `apps/website/src/server/runtime/composition/memory-deps/route-deps/trash-and-content.ts`
- `apps/website/src/server/runtime/composition/memory-deps/slices/publish-apply.ts`
- `apps/website/src/server/runtime/composition/modules/content-write-bindings.ts`
- `apps/website/src/server/runtime/composition/modules/pages.ts`
- `apps/website/src/server/runtime/composition/modules/posts.ts`
- `apps/website/src/server/runtime/composition/modules/revision-thinning-routes.ts`
- `apps/website/src/server/runtime/composition/publish-content-manifest.ts`
- `apps/website/src/server/runtime/composition/publish-content-seed-hash.ts`
- `apps/website/src/server/runtime/composition/site-consent.ts`
- `apps/website/src/server/runtime/composition/site-deps/publish-apply.ts`
- `apps/website/src/server/runtime/composition/site-deps/route-deps-content-chat.ts`
- `apps/website/src/server/runtime/composition/site-deps/route-deps-site-providers.ts`
- `apps/website/src/server/runtime/plugin-tier2/__tests__/tier2-runtime.integration.test.ts`

### WMZ11 files

- `apps/website/src/assistant/__tests__/content-target-inputs.test.ts`
- `apps/website/src/assistant/__tests__/pages-read-html-batch.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-save.test.ts`
- `apps/website/src/features/consent/__tests__/ensure-privacy-defaults.test.ts`
- `apps/website/src/features/email-templates/__tests__/operations.sql.test.ts`
- `apps/website/src/features/email-templates/__tests__/operations.test.ts`
- `apps/website/src/features/email-templates/__tests__/tool-registrations.test.ts`
- `apps/website/src/features/pages/__tests__/edit-html-permission.test.ts`
- `apps/website/src/features/pages/__tests__/external-embed-authoring.integration.test.ts`
- `apps/website/src/features/pages/__tests__/hidden-until-script.test.ts`
- `apps/website/src/features/pages/__tests__/html-document-store.go-live.test.ts`
- `apps/website/src/features/pages/__tests__/html-document-store.memory.go-live.test.ts`
- `apps/website/src/features/pages/__tests__/html-document-store.memory.test.ts`
- `apps/website/src/features/pages/__tests__/html-document-store.noop-save.test.ts`
- `apps/website/src/features/pages/__tests__/html-document-store.revisions.test.ts`
- `apps/website/src/features/pages/__tests__/html-document-store.sqlite.test.ts`
- `apps/website/src/features/pages/__tests__/html-undo.integration.test.ts`
- `apps/website/src/features/pages/__tests__/media-token-authoring.integration.test.ts`
- `apps/website/src/features/pages/__tests__/metadata-edit-preserves-html.test.ts`
- `apps/website/src/features/pages/__tests__/tool-registrations.lost-update.test.ts`
- `apps/website/src/features/pages/__tests__/tool-registrations.move-region.test.ts`
- `apps/website/src/features/pages/__tests__/tool-registrations.read-html.test.ts`
- `apps/website/src/features/pages/__tests__/tool-registrations.test.ts`
- `apps/website/src/features/pages/__tests__/tool-registrations.write-region.test.ts`
- `apps/website/src/features/pages/html-change-recording.ts`
- `apps/website/src/features/pages/html-document-store.sqlite.ts`
- `apps/website/src/features/pages/html-inverse.ts`
- `apps/website/src/features/pages/html-reverter.ts`
- `apps/website/src/features/post/__tests__/content-duplicate.post-page.test.ts`
- `apps/website/src/features/post/__tests__/tool-registrations.html-page-body.test.ts`
- `apps/website/src/features/post/__tests__/tool-registrations.partial-update.test.ts`
- `apps/website/src/features/site-search/__tests__/cms-search.test.ts`
- `apps/website/src/features/trash/__tests__/email-template-trash-flow.test.ts`
- `apps/website/src/server/runtime/composition/memory-deps/route-deps/assemble.ts`
- `apps/website/src/server/runtime/composition/memory-deps/route-deps/trash-and-content.ts`
- `apps/website/src/server/runtime/composition/site-deps/assembly-phases.ts`

### WMZ12 files

- `apps/website/src/features/permanent-delete/__tests__/tool-registrations.test.ts`
- `apps/website/src/features/permanent-delete/tool-registrations.ts`
- `apps/website/src/server/runtime/composition/permanent-delete-deps.ts`

### WMZ13 files

- `apps/website/src/features/plugin-runtime/install-archive.ts`

### WMZ14 files

- `apps/website/src/features/publish-content/disconnect-tool.ts`
- `apps/website/src/features/publish-content/tool-registrations.ts`

### WMZ15 files

No working-tree edits (KEEP or held unit as detailed above).

### WMZ16 files

No working-tree edits (KEEP or held unit as detailed above).

### WMZ17 files

- `apps/website/src/features/deployments/__tests__/publish-agent-tools.abort-guard.unit.test.ts`
- `apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts`
- `apps/website/src/features/deployments/publish-agent-tools.ts`
- `apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts`
- `apps/website/src/features/deployments/publish-tool-deps.ts`
- `apps/website/src/features/deployments/static-publish/credentials.ts`
- `apps/website/src/features/deployments/static-publish/verify.ts`
- `apps/website/src/features/vendor-credentials/__tests__/vault-adapter.unit.test.ts`
- `apps/website/src/features/vendor-credentials/index.ts`
- `apps/website/src/features/vendor-credentials/types.ts`
- `apps/website/src/features/vendor-credentials/vault-adapter.ts`
- `apps/website/src/features/vendor-credentials/vendor-credential-repo.ts`
- `apps/website/src/platform/db/repos/__tests__/vendor-credential-repo.test.ts`
- `apps/website/src/server/__tests__/route-async-guards.test.ts`
- `apps/website/src/server/__tests__/routes/publish-credentials-route.test.ts`
- `apps/website/src/server/routes/route-deps/credentials-deps.ts`
- `apps/website/src/server/runtime/composition/modules/__tests__/publish-verification-basis.unit.test.ts`

### WMZ18 files

- `apps/website/src/features/credential-safety/__tests__/stores.test.ts`
- `apps/website/src/features/site-backup/__tests__/tool-registrations-host-connection.unit.test.ts`
- `apps/website/src/features/site-backup/backup-service.ts`
- `apps/website/src/features/source-control/__tests__/canonical-credential-lifecycle.unit.test.ts`
- `apps/website/src/features/source-control/__tests__/commit-site.characterization.unit.test.ts`
- `apps/website/src/features/source-control/__tests__/credential-binding.pin.unit.test.ts`
- `apps/website/src/features/source-control/__tests__/credential-setup-projections.unit.test.ts`
- `apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts`
- `apps/website/src/features/source-control/__tests__/propose-credential-tool.test.ts`
- `apps/website/src/features/source-control/__tests__/shared-key-reader.unit.test.ts`
- `apps/website/src/features/source-control/__tests__/store.resolve.unit.test.ts`
- `apps/website/src/features/source-control/__tests__/store.unit.test.ts`
- `apps/website/src/features/source-control/__tests__/tool-registrations.unit.test.ts`
- `apps/website/src/features/source-control/commit-site.ts`
- `apps/website/src/features/source-control/credential-setup.ts`
- `apps/website/src/features/source-control/index.ts`
- `apps/website/src/features/source-control/repo.memory.ts`
- `apps/website/src/features/source-control/source-control-credential-repo.ts`
- `apps/website/src/features/source-control/store.ts`
- `apps/website/src/features/source-control/tool-registrations.ts`
- `apps/website/src/features/source-control/types.ts`
- `apps/website/src/features/vendor-credentials/__tests__/vault-adapter.unit.test.ts`
- `apps/website/src/features/vendor-credentials/vault-adapter.ts`
- `apps/website/src/platform/db/repos/__tests__/source-control-credential-repo.test.ts`
- `apps/website/src/server/__tests__/integration/credentials-real-composition.unrun.integration.test.ts`
- `apps/website/src/server/__tests__/route-async-guards.test.ts`
- `apps/website/src/server/__tests__/routes/source-control-credentials-route.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/__tests__/source-control-credentials.unit.test.ts`
- `apps/website/src/server/routes/route-deps/credentials-deps.ts`
- `apps/website/src/server/runtime/composition/modules/system-credentials.ts`
- `apps/website/src/server/runtime/composition/permanent-delete-deps.ts`
- `apps/website/src/server/runtime/composition/site-deps/route-deps-publish-credentials.ts`
- `apps/website/src/server/runtime/composition/source-control-key-binding.ts`

### WMZ19 files

- `apps/website/src/features/webhooks/__tests__/site-key-ensure.unit.test.ts`
- `apps/website/src/features/webhooks/keyring.env.ts`
- `apps/website/src/features/webhooks/seal-aad-invariant.ts`
- `apps/website/src/features/webhooks/secret-scan-guard.ts`
- `apps/website/src/features/webhooks/site-key-ensure.ts`
- `apps/website/src/features/webhooks/site-key-sources.ts`

### WMZ20 files

- `apps/website/src/cli/__tests__/unit/errors-l149.unit.test.ts`
- `apps/website/src/cli/errors.ts`
- `apps/website/src/features/site-export/__tests__/index.test.ts`
- `apps/website/src/features/site-export/__tests__/site-exporter.test.ts`
- `apps/website/src/features/site-export/index.ts`
- `apps/website/src/features/site-export/site-exporter.ts`

### WMZ21 files

- `apps/website/src/features/site-backup/__tests__/share-retention.unit.test.ts`
- `apps/website/src/features/site-backup/backup-service.ts`
- `apps/website/src/features/site-backup/share-database/repo.sqlite.ts`
- `apps/website/src/features/site-backup/share-retention.ts`
- `apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts`
- `apps/website/src/server/runtime/composition/retention.ts`

### WMZ22 files

- `apps/website/src/assistant/__tests__/owner-chat-tool-inputs.unit.test.ts`
- `apps/website/src/features/site-inspection/__tests__/tool-registrations.unit.test.ts`
- `apps/website/src/features/site-inspection/index.ts`
- `apps/website/src/features/site-inspection/tool-registrations.ts`

### WMZ23 files

- `apps/website/src/features/entries/__tests__/unit/publish-content.test.ts`
- `apps/website/src/features/post/__tests__/publish-content.terms.test.ts`
- `apps/website/src/features/publish-content/__tests__/apply-loop.test.ts`
- `apps/website/src/features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts`
- `apps/website/src/features/publish-content/__tests__/planner.test.ts`
- `apps/website/src/features/publish-content/__tests__/references.test.ts`
- `apps/website/src/features/taxonomy/__tests__/publish-content.test.ts`
- `apps/website/src/features/taxonomy/publish-content.ts`
- `apps/website/src/server/runtime/composition/publish-content-manifest.ts`

### WMZ24 files

- `apps/website/src/features/identity/__tests__/delete-user-service.test.ts`
- `apps/website/src/features/redirects/__tests__/remove-redirect-double.ts`
- `apps/website/src/features/trash/__tests__/move-to-trash.test.ts`
- `apps/website/src/features/trash/__tests__/trash.contract.test.ts`
- `apps/website/src/features/trash/__tests__/user-adapter.test.ts`
- `apps/website/src/features/trash/adapters/redirect.ts`
- `apps/website/src/features/trash/adapters/user.ts`
- `apps/website/src/features/trash/index.ts`
- `apps/website/src/features/trash/member-credential-ports.ts`
- `apps/website/src/features/trash/permissions.ts`
- `apps/website/src/features/trash/tool-kinds.ts`
- `apps/website/src/features/trash/tool-registrations.ts`
- `apps/website/src/features/trash/trash-item-tool.ts`
- `apps/website/src/server/__tests__/admin-trash-routes.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/users/__tests__/delete.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/trash-user-admin-override.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/trash-user-tool-port.test.ts`
- `apps/website/src/server/runtime/composition/app.ts`
- `apps/website/src/server/runtime/composition/memory-deps/route-deps/trash-and-content.ts`
- `apps/website/src/server/runtime/composition/memory-deps/slices/trash-adapters-content.ts`
- `apps/website/src/server/runtime/composition/memory-deps/slices/trash-adapters.ts`
- `apps/website/src/server/runtime/composition/modules/trash.ts`
- `apps/website/src/server/runtime/composition/peer-site-reads.ts`
- `apps/website/src/server/runtime/composition/site-deps/redirects.ts`
- `apps/website/src/server/runtime/composition/site-deps/route-deps-content-chat.ts`
- `apps/website/src/server/runtime/composition/site-deps/trash-adapters.ts`
- `apps/website/src/server/runtime/composition/site-deps/trash-service.ts`
- `apps/website/src/server/runtime/composition/trash-user-admin-override.ts`

### WMZ25 files

No working-tree edits (KEEP or held unit as detailed above).

### WMZ26 files

- `apps/website/src/features/web-screenshot/__tests__/capture-retention.unit.test.ts`
- `apps/website/src/features/web-screenshot/capture-retention.ts`
- `apps/website/src/server/runtime/composition/modules/__tests__/screenshot-storage.unit.test.ts`
- `apps/website/src/server/runtime/composition/modules/screenshot-storage.ts`

### WMZ27 files

- `apps/website/src/features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts`
- `apps/website/src/features/publish-content/__tests__/references.test.ts`
- `apps/website/src/features/widgets/__tests__/unit/publish-content.test.ts`
- `apps/website/src/features/widgets/publish-content.ts`
- `apps/website/src/server/runtime/composition/publish-content-manifest.ts`

## Review and handoff

- No new Tovu test declarations or scaffolding were added. Existing named host characterization pins were repointed before the corresponding removals. The Jini handoff reports 71 test declarations authored before package changes; each sheet mutation is recorded above. The actor-codec mutation remains unauthored in Jini. All runtime/mutation execution is left to Opus.
- Bounded importer checks cover apps/website, apps/admin and apps/desktop, including quoted type-query/dynamic/mock specifiers into deleted sources. No references to deleted source paths or missing named imports from residual binders remain. Remaining dynamic/namespace references use retained host functions; the source-control resolver mock was moved to the actual package operation owner. Forwarding exports of moved symbols were removed.
- The dispatch's pinned scanner/importer tuple artifact was not available in this clone. The live bounded edge checks are not claimed to reproduce its 1,516-edge ledger. No graph tool or repo-wide search was used.
- Package manifest reads verified new import subpaths against the Jini branch; no package intake or manifest edits were made. Keep trash-item generic imports on the existing supported @jini-ai/cms/trash export. A pre-existing unrelated core/contracts/events/change-set test import was left untouched.
- LEFT-DESKTOP: none required by discovered importer edges; no apps/desktop file was edited. No theme file was edited. WMZ03's forbidden theme fixture dependency is listed as held with exact edits above.
- No commits, pushes, installs, builds, tests, typechecks, linters, guard CLI runs, migrations, schedules, mounts or feature activations. git diff --check passes. Only source/import-edge and whitespace reviews were performed.
- Created: COMMIT-PLAN.md (this local handoff file; do not commit). All other changes are edits/deletions to existing files. No production helper/module was introduced.
