# Merge-27 test contract repairs

Tovu base `0fdd3eedf7` (local `codex/tv-w62-tt-3`, matching `origin/codex/m27t`). Jini contracts read from `origin/integ/merge-27-2026-11-26` at `a9f58d6bcf`. No new test cases, no tests removed. The coordinator owns commits. Do not commit this file.

## 1. test(media): bind the extracted media contracts in fixtures

Under `apps/website/src/features/media/__tests__/`:

| File | Repair | Representative mutation the behavior assertions reject |
|---|---|---|
| agent-tools.trash-confirmation.test.ts | Real hash for the seed, typed removal refusal with `version-changed`, real repo with one fault-injected read | Skip the permission gate, conflate missing/version-changed, or report removal without writing the trashed row |
| agent-upload-sniff.test.ts | Real hash and typed in-memory host composition | Use the declared MIME type instead of sniffing |
| bootstrap.test.ts | Same real hash for source upload and rendition | Change thumbnail width to 641 or serve original bytes |
| content-duplicate.media.test.ts | Hash on upload, copy and rendition dependencies, typed contributor wiring | Store a second physical copy or check `content.write` instead of `media.upload` |
| convert-video-registration.test.ts | Hash for seeding, registered conversion and import conversion, typed tool/surface binding | Convert at the threshold instead of strictly over it or omit the saved link |
| created-by.test.ts | Hash for canonical upload, copy and registered upload | Stamp the blob creator or last invocation's actor on all assets |
| import-media-entity.render.test.ts | Hash, production fence, storage-key and stored-blob verifier | Mint a different imported media ID |
| import-media-entity.rethrow.test.ts | Same production blob bindings, scoped guard-fault mock | Translate the unexpected guard error to a refusal instead of rethrowing the same error |
| import-video-conversion.test.ts | Shared real hash and real derived-link adapter | Drop the original, drop the link or return internal failure details |
| library-persistence.test.ts | Hash for dialect and filesystem restart uploads | Lose original bytes after reopening the database/store |
| library-save-text.test.ts | Hash and current fs-files permission import | Read attachments for generated text or change saved UTF-8 bytes |
| library-tools.test.ts | Hash for save, read/list fixture and upload paths | Save a foreign attachment or return a truncated/overlapping continuation |
| media-captions-render.test.ts | Real read-only widget write policy | Emit the track outside the video, or emit one for a missing/non-WebVTT asset |
| media-producing-previews.test.ts | Real hash for upload, generation and import | Omit one named producer or drop its WebP block |
| promote-chat-attachment.test.ts | Real hash and typed filesystem reads | Derive type from the declared filename instead of the saved bytes |
| provenance.integration.test.ts | Hash for SQL-backed uploads and Library tool | Attach the picked-folder provenance to the queried brand document |
| provider-credential-vault.test.ts | Inject a pinned ID distinct from the legacy key | Replace `idGen.newId()` with a provider-derived ID or discard existing CAS revision |
| tool-registrations.test.ts | Real hash in assistant media registration fixture | Revert Tovu's upload cap to the Jini default or fail to persist the accepted bytes |
| view-image-tool.test.ts | Hash on upload, typed observation of real media repo writes | Overwrite a human description or drop the inline WebP |
| view-video-tool.guards.test.ts | Hash on upload, strict attachment reference, exact JPEG at the limit | Reject a source exactly at the limit or return unrelated JPEG bytes |
| view-video-tool.integration.test.ts | Hash for the real video fixture | Return the same still for all timestamps |
| view-video-tool.test.ts | Hash and current builder `{ deps, catalog }` | Invoke the attachment reader before rejecting a denied principal |

## 2. test(publish): reuse contributor and mutation-actor bindings

- `apps/website/src/features/content-types/__tests__/publish-content.test.ts` — real repo handler, gateway and result bindings, trusted actor on the direct apply fixture, and exact field values after updates. Mutation: keep two fields but write different definitions.
- `apps/website/src/features/media/__tests__/library-publish-transport.test.ts` — real hash and typed in-memory route binding. Mutation: allow document-only bytes through the peer channel or refuse an ordinary retained blob.
- `apps/website/src/features/media/__tests__/library-publish.test.ts` — real hash and trusted actor. Mutation: allow the forged apply or reject for an unrelated reason.
- `apps/website/src/features/media/__tests__/publish-content.overwrite.test.ts` — hash on the local file replacement. Mutation: replace the destination with different bytes or without the explicit review.
- `apps/website/src/server/runtime/composition/publish-content-manifest.ts` — requested coordinating exports only: `repoPublishBindings`, `termSyncBindings`, `widgetPublishPolicy`. No runtime statements changed. Other jobs own consumers outside this list.

## 3. test(member-login): bind the current failure-isolation port

- `apps/website/src/features/member-login/__tests__/link-service.test.ts` — real `orFallbackSync`. Mutation: mint a session for an ineligible identity.
- `apps/website/src/features/member-login/__tests__/link-service.dialects.test.ts` — real `orFallbackSync` and real SQL sessions repo with only the mint write faulted. Mutation: commit the link before minting the session, or reject before the injected write is reached.

## 4. test(storage): supply the current CLI and attachment SQL ports

- `apps/website/src/cli/commands/__tests__/storage-maintenance.test.ts` — deterministic environment bag. Existing named mutation `M7b-register-compact-unbound`: register compact without a binding.
- `apps/website/src/features/project-keys/__tests__/attachments.unit.test.ts` — mirror the host's Kysely row projection with `$castTo<Row>()`, pin the clock and check exact key users. Mutation: return differently owned rows with the same count.

## Checklist and quality findings

Static Author Checklist review covered the changed fixture consumers and strengthened assertions. Representative mutations above were not executed. Setup-level control for affected cases: undo the injected hash, vault ID, blob-write or publish binding and the relevant path fails before its behavior assertion. Behavior-level confidence requires the coordinator's cloud run.

| File and test | Finding | Disposition |
|---|---|---|
| agent-tools.trash-confirmation: n06 | F6.3 | Fixed, read the trashed row back from the repository |
| bootstrap: thumb boot | F1.2 | Fixed, check exact rendered fixture bytes and WebP MIME |
| content-types/publish-content: changed label and fields | F1.2 | Fixed, compare field definitions rather than count |
| import-media-entity.rethrow: unexpected guard failure | F7.6 | Fixed, scoped the fault mock to the test |
| import-video-conversion: original and linked copy | F3.4 | Fixed, replaced the handwritten link behavior with the production adapter |
| library-publish: forged apply | F4.4 | Fixed, trusted actor and specific document/duplication refusals |
| media-captions-render: same-origin track | F6.1 | Fixed, assert the track is inside the video |
| media-producing-previews: registered producers | F1.2 / F5.1 | Fixed, pin identities before iterating |
| provenance.integration: Library list | F1.6 / F4.1 | Fixed, assert exact document ID and independent provenance |
| provider-credential-vault: upsert | F2.5 / F4.1 | Fixed, check exact vault lookup and expected row without the adapter's own scope helper |
| tool-registrations: accepts 11 MiB | F6.3 | Fixed, read back the exact persisted hash |
| view-image-tool: preserve human description | F5.1 | Fixed, observe the real repo's save/remove methods without dynamically skipping unavailable methods |
| view-video-tool.guards: owned media at size limit | F1.2 / F3.6 | Fixed, exact JPEG bytes and an owner/ref-scoped attachment fake |
| link-service.dialects: failed mint | F4.4 | Fixed, assert the faulted write actually ran before checking rollback |
| attachments.unit: identity, retry and cleanup | F1.2 / F7.7 | Fixed, exact owners and fixed clock |
| view-video-tool.integration: real MP4 | F7.2 | Left, intentionally uses host ffmpeg/ffprobe/nice with an existing availability guard. The real binary test cannot be replaced with a fake. |

Pre-existing fixture assertions for the wide assistant registry (tool-registrations, promote-chat-attachment) and the yauzl SDK declaration mismatch (library-tools, library-save-text) remain. Using the full assistant host in those upload tests would engage its image codec and change the response envelope. The real SDK is still used for archive reads, as in production. No new suppression or double cast added.

## Diff cleanup and verification

Removed the out-of-contract removal reason/cast and fabricated repo receivers, unused broad dependency type imports/casts where the current seams accept the real binding, the handwritten derived-link double and its now-obsolete comment, string-indexed repo mutation spies, and redundant non-null assertions where an existing checked assertion already narrows. No tests or production statements removed.

`git diff --check` passed. Package export names were checked against the pinned Jini branch. No tests, type-checks, lint, builds or installs run per dispatch.
