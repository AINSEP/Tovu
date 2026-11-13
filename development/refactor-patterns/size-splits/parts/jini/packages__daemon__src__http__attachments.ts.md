### jini:packages/daemon/src/http/attachments.ts
- **Over:** file 871 lines · `createDiskAttachmentStore` 189
- **Phase:** now · **Batch:** size-07
- **Package entry:** not itself an `exports` target; `./http` → `src/http/index.ts`, which re-exports from `./attachments.js` (~L325-352). Retarget those `export { … } from` / `export type { … } from` lines per name to the new modules (index.ts IS the entry, so it keeps exporting every name). attachments.ts does NOT re-export.
- **Tests:** `src/http/__tests__/attachments.test.ts`, `attachments-coverage.test.ts`, `attachments-idle-activity.test.ts`, `attachment-lookup.test.ts`, `attachment-site-staging.test.ts`, `remote-attachment-boundaries.unit.test.ts`, `src/http/__tests__/index.test.ts`, `src/__tests__/image-prompt-delivery.test.ts`. No `vi.mock` of attachments (re-check with rg). Tests import moved names from `../attachments.js` → path edits only.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A model | `StoredAttachment`, `AttachmentClaim`, `AttachmentRejectionReason`, `AttachmentRejectedError`, `AttachmentRecord`, `PendingAttachmentSummary`, `RecordedAttachmentIdentity`, `ObservedAttachmentIdentity`, `BATCH_ID_PATTERN`, `formatByteLimit`, `AttachmentStore` (interface, so http need not import the store file) | record types, store contract, the refusal error |
| B signature | `hasIsoBmffFtypTag` … `hasAvifSignature`, `ftypBoxEnd`, `SIGNATURE_BYTES`, `PNG_SIGNATURE_PREFIX`, `hasPng/Jpeg/Gif/WebpSignature`, `IMAGE_SIGNATURE_MATCHERS`, `detectAttachmentKind` | sniff image kind from leading bytes |
| C claim | `stagedPathsByAttachment`, `stageAttachmentClaim`, `isUnchangedAttachment`, `reserveAttachmentRecords`, `verifyClaimedAttachments` | two-phase claim + staging into a host boundary |
| D persistence | `SIDECAR_DIRECTORY_NAME` … `prepareAttachmentStorage` (L814-1088) | sidecar records across restarts |
| E http | `REJECTION_STATUS`, `apiErrorForRejection`, `writeBoundedAttachmentBody`, L1371-end (`AttachmentsInternalErrorContext` … `registerAttachmentRoutes`) | upload/cleanup HTTP routes |
| F store (stays) | `CreateDiskAttachmentStoreOptions`, `sanitizeAttachmentName`, `isUnclaimedOrClaimedBy`, `createDiskAttachmentStore` | the disk-backed store |

- **Splits** (order matters: each new module imports only modules created before it):
  1. NEW `attachments-model.ts` — unit A. Imports nothing local.
  2. NEW `attachments-signature.ts` — unit B (its "why" comments, incl. the ISO-BMFF/AVIF paragraphs). Imports types from model.
  3. NEW `attachments-claim.ts` — unit C. Exports `stagedPathsByAttachment` too (store uses it at `claim`). Imports model.
  4. NEW `attachments-persistence.ts` — unit D (the `// ----` section banner + its paragraph move as the file header). Exports `SIDECAR_DIRECTORY_NAME`, `TimestampedAttachmentRecord`, `attachmentSidecarFileName`, `writePersistedAttachment`, `prepareAttachmentStorage` + the existing exports. Imports model + claim.
  5. NEW `attachments-http.ts` — unit E. Imports model + signature only (rule 5: never imports attachments.ts).
  6. HELPERS in `createDiskAttachmentStore` (module level, above it, in run order):
     - `createAttachmentRecordFiles({ canonicalUploadDirectory, records, retainAcrossRestarts }: AttachmentRecordFilesInput): { sidecarPathFor; persistRecord; forgetRecord; resolveBatchDirectory; removeEmptyBatch; deleteRecord }` ← `const sidecarDirectory` through `const deleteRecord` (comments move).
     - `assertRegularCanonicalFile({ filePath }: AssertRegularCanonicalFileInput): Promise<Stats>` ← in `register`: `const info = await lstat(filePath)` through the `canonical !== filePath` throw (stays inside the existing try).
     - `assertAttachmentQuota({ records, batchId, size, limits }: AssertAttachmentQuotaInput): void` (limits = `{ maxAttachments, maxBatchBytes, maxStoredAttachments, maxStoredBytes }`) ← `const batchRecords = …` through the `storage-full` throw; `totalBytes` moves to module level as `totalAttachmentBytes({ candidates })`.
     - `buildAttachmentRecord({ input, filePath, batchDirectory, info }: BuildAttachmentRecordInput): TimestampedAttachmentRecord` ← the `const id`/`const record` literal.
     - `claimStoredAttachments(…)` and `resolveAttachmentsForRun(…)` ← bodies of the `claim` and `resolveForRun` props, taking `{ records, findRecord, stagedPathsByRecord }` plus the prop's own input object; props become one-line delegations.
- **Importers to update:** `src/http/index.ts` (entry: retarget), `src/remote-attachment-lookup.ts` (`AttachmentRejectedError`, `AttachmentRejectionReason` → model), `src/http/attachment-lookup-routes.ts` (`AttachmentRejectedError` → model; `AttachmentStore` → model), the 8 tests above (per moved name).
- **After:** attachments.ts ~220; `createDiskAttachmentStore` ~85; model ~115; signature ~65; claim ~80; persistence ~190; http ~190.
- **Risks / notes:** `register`'s try/catch must still wrap the moved checks (rm + removeEmptyBatch on any throw). `prepareAttachmentStorage` must still run before `stagedPathsByRecord` is created (same order). `AttachmentRejectedError` instanceof checks: one class, now in model — every import must point there (no duplicate class).
