# Media bug work — coordinator commit plan

All changes remain in the working tree. Do not commit this file. No tests, builds, installs, typechecks, or linters ran, as required by dispatch. Regression tests were written before their implementation changes; red/green and mutation execution remain for the coordinator.

## 1. LF-1 — host store admission (implemented, unexecuted)

Files:
- `apps/website/src/server/inbound/assistant/__tests__/scope-attachment-limits.unit.test.ts`
- `apps/website/src/server/inbound/assistant/agent-daemon-scope-attachments.ts` (store-cap hunk)

Mutation: `omit-scope-max-stored-bytes` removes only the host total-store override. The new real-store regression registers sparse 500 MiB and 50 MiB files in one batch, then expects the existing `storage-full` refusal for one extra byte in another batch.

## 2. LF-1 — prefix delivery and owner-reader binding (implemented, unexecuted)

Files:
- `apps/website/src/server/inbound/assistant/agent-daemon-scope-attachments.ts` (descriptor-delivery hunks)
- `apps/website/src/features/media/chat-attachment-reader-host.ts`
- `apps/website/src/server/inbound/assistant/byok-message-attachments.ts`
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.attachment-run-fields.unit.test.ts`
- `apps/website/src/server/inbound/assistant/__tests__/byok-message-attachments.unit.test.ts`
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.attachment-binding.unit.test.ts`
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.attachment-kind-filter.unit.test.ts`
- `apps/website/src/features/media/__tests__/read-chat-attachment.test.ts`

Mutations: `hydrate-staged-video` restores full hydration of the staged video; `hydrate-byok-video` removes BYOK's delivery selector. Each new regression uses a full-read spy that refuses the video and requires exact full PNG delivery. The staged case also asserts CLI path/notice and descriptor closure. Existing fixture changes only propagate the descriptor port and its required prefix-read member.

Jini's verified owner reader, native-image predicate, ownership/identity checks and pre-hydration cap are already implemented on `origin/codex/bug-mediaj`; they are not duplicated here. Existing preview maxBytes behavior stays with Jini.

## 3. LF-1 — copy-on-write production binding (implemented, unexecuted)

File: `apps/website/src/server/inbound/assistant/agent-daemon-scope-attachments.ts` (staging deps and Node import hunks).

Bind the new required copy port to Node copyFile with COPYFILE_FICLONE. Jini already owns the staging regression and `stage-with-plain-copy` mutation. No staging implementation is copied into Tovu.

## 4. LF-2 — converting files_copy host wiring (implemented, unexecuted)

Files:
- `apps/website/src/server/runtime/composition/asset-tool-host.ts`
- `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`
- `apps/website/src/server/runtime/composition/__tests__/asset-transfer-video-wiring.integration.test.ts` (new)

Mutation: `asset-persist-uses-bare-upload` removes videoImport from the persistImportedMedia binding. The new integration regression drives the production contributor with a video above the real 50 MiB conversion threshold. It asserts exact original bytes and caller attribution, original row/blob presence before conversion, original retention after conversion, and the MP4's link description.

Jini already owns the single-video admission cap, catalog exception and approval short-circuit, with mutations `copy-keeps-media-at-10mb` and `encode-media-approval-batch`. Tovu now supplies mediaVideoMaxBytes. The current media destination already delegates validation to the same video-accepting MEDIA_IMPORT_POLICY as direct imports; no validation change is needed. Theme policy and image-transform wiring are untouched.

## 5. LF-3 Phase A — JSON ceiling and route bindings (partial, unexecuted)

Files:
- `packages/contracts/src/upload-limits.ts`
- `apps/website/src/server/inbound/shared/json-body-parsers.ts`
- `apps/website/src/server/inbound/shared/__tests__/json-body-parsers.test.ts`
- `apps/website/src/server/runtime/composition/modules/media.ts`

Mutation: `restore-700mb-parser` restores the old parser ceiling. The declared-length probe now requires JSON 413 for both POST and replace one byte above 257 MiB. The old pinned 700mb assertion is rewritten to the corrected 257mb behavior; the 75mb publish-content assertions remain. The shared Tovu constant is pinned to 192 MiB and injected as maxJsonUploadBytes into both Jini routes. Chat/non-JSON limits remain 500 MiB for video and 550 MiB per batch.

Jini already owns decoded-size checks and their `decode-before-json-size-check` mutation.

BLOCKED browser step: on `origin/codex/bug-mediaj`, `packages/admin/src/screens/media/rules.ts` owns readFileAsBase64({ file }, { createReader } = {}). Its only option is createReader; there is no size-cap dependency. `packages/admin/src/screens/media/hooks/use-media.hooks.ts` likewise exposes only deps.readFileAsBase64({ file }) and no pre-read cap. Tovu's `apps/admin/src/features/media/hooks/use-media.hooks.ts` is a thin bindMedia binding. Adding the missing validation there would violate the explicit ban on moving logic back into Tovu bindings. The coordinator needs a Jini pre-read size seam/check and its regression first, then Tovu can bind MEDIA_JSON_UPLOAD_MAX_BYTES. The named `read-before-client-limit` regression/mutation remains pending; no unsupported wrapper or deliberately unresolved test was added here.

## Left / prerequisites

- LF-3 Phase B: NEEDS-OPUS, explicitly excluded from this builder. Requires guarded streaming, staged blob persistence and staged FFmpeg work after Phase A.
- Jini media changes need release/consumption before these new required APIs can be validated together. No unpublished package version was invented; manifests/lockfile were not changed.
- No anchor mismatches in implemented host steps. Missing bootstrap/memory directories are expected under this dispatch's complete-context override.

## Final static review

- Re-read all changed production/test hunks and the new integration file. `git diff --check` passed. No executable verification or coverage metrics are claimed.
- Removed an extra req.body-is-undefined assertion from the new declared-length probe: body initialization is owned by body-parser and the specified observable is the existing JSON 413 envelope. No existing assertion was removed or weakened; the bug-pinning 700mb value was corrected as required.
- No new helpers, wrappers, modules, interfaces, config flags, fallback paths, or source comments were added. Existing parser docs were corrected for the changed ceiling.
- Architecture review: thin bindings reuse Jini's media/daemon owners, descriptor I/O is injected, declared effects are statically imported, and theme policy is unchanged. No boundary violation found in static review; runtime outcome remains INCONCLUSIVE pending coordinator verification and the browser prerequisite.
- Function review: readStagedAttachment, resolveAttachmentRunFields, prepareByokMessageAttachments, readOwnerChatAttachment, openScopeAttachments, bindAssetDestinationDeps and bindFilesCopyToolDeps remain bounded by the named ports/policies. No new exported API was invented. Mechanical metrics and runtime coverage were not run under dispatch restrictions.
- Cost: unsupported video delivery reads at most 64 KiB per attachment, apart from staging copy I/O; admitted native images may hydrate up to 50 MiB. files_copy remains a bounded full-buffer path, up to 500 MiB for its narrow video exception. JSON parsing is capped at 257 MiB; no RSS or disk-use improvement is claimed as measured.
