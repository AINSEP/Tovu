# Merge-27 fixture repair commit plan

Tovu `codex/tv-w62-tt-4` at `0fdd3eedf7`, tracking `origin/codex/m27t`. Jini contracts read at `origin/integ/merge-27-2026-11-26` (`a9f58d6bcf`). Working tree only. This handoff is not part of a commit.

No tests, mutation executions, type checks, builds, installs, or linters were run. `git diff --check` passed, and static comparison found no named tests added, removed, or skipped. The cloud run still needs to confirm compilation and the original red cases.

## 1. `test: seed versioned identity fixtures`

- `apps/website/src/server/__tests__/admin-integrations-routes.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/admin-local-boot-session-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/admin-mcp-ui-tool-calls-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/admin-page-get-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/admin-page-html-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/admin-password-status-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/admin-site-key-routes.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/admin-widgets-routes.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/api-key-routes.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/identity-routes.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/packet-one-routes.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/assistant-daemon-restart-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/comments-e2e.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/comments-settings-routes.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/custom-credentials-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/deployment-overview-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/dockerfile-source-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/export-site-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/forms-auth.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/mail-status-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/module-status-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/observability-status-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/publish-content-blob-get.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/publish-content-blobs.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/publish-content-import-routes.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/publish-content-pull-blobs.integration.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/server-logs-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/sites-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/routes/source-control-credentials-route.test.ts` — initialize versions on new identity fixture records.
- `apps/website/src/server/__tests__/workspace-routes.test.ts` — initialize versions on new identity fixture records.

## 2. `test: bind media hashing and verify attachment persistence`

- `apps/website/src/features/forms/__tests__/common-fields.test.ts` — bind Node createHash to upload deps and verify original bytes and rendition by reading the real ports.
- `apps/website/src/features/forms/__tests__/form-file-purge.test.ts` — bind Node createHash to upload deps and run legacy protection fault/marker tests through real kernels.
- `apps/website/src/features/forms/__tests__/form-file-renditions.test.ts` — bind Node createHash to upload deps.
- `apps/website/src/features/forms/__tests__/form-file-storage.test.ts` — bind Node createHash to upload deps.
- `apps/website/src/features/trash/__tests__/post-trash-media-evidence.integration.test.ts` — bind Node createHash to upload deps.
- `apps/website/src/server/__tests__/media-original-video-route.test.ts` — bind Node createHash to upload deps.
- `apps/website/src/server/__tests__/media-original-wire-pins.test.ts` — bind Node createHash to upload deps.
- `apps/website/src/server/__tests__/media-rendition-gating-bypass.test.ts` — bind Node createHash to upload deps.
- `apps/website/src/server/__tests__/media-rendition-route.test.ts` — bind Node createHash to upload deps.
- `apps/website/src/server/__tests__/media-slug-uuid-collision.test.ts` — bind Node createHash to upload deps.
- `apps/website/src/server/__tests__/routes/media-byte-size.test.ts` — bind Node createHash to upload deps.
- `apps/website/src/server/__tests__/routes/media-content-type.test.ts` — bind Node createHash to upload deps.
- `apps/website/src/server/__tests__/routes/publish-content-export.test.ts` — bind Node createHash to upload deps and set initial user/policy versions.
- `apps/website/src/server/__tests__/routes/seo-og-image-crawlability.test.ts` — bind Node createHash to upload deps.

## 3. `test: align the remaining merge-27 fixtures with extracted contracts`

- `apps/website/src/features/agent-plugins/__tests__/unit/a10-card-seam.unit.test.ts` — pin the same nine artifact pairs and permit the two actual same-package core imports.
- `apps/website/src/features/agent-plugins/__tests__/unit/install-tool-update.unit.test.ts` — real exchange store, exact headless refusal, read back installed digest/version and activation.
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-bundled.test.ts` — validator moved to core/export-props.
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-render.test.ts` — read-only widget post writes at both sites.
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-scripts.test.ts` — read-only widget post writes.
- `apps/website/src/features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts` — use bound lifecycle layout instead of a layout argument.
- `apps/website/src/features/comments/__tests__/tool-contract.characterization.test.ts` — remove the duplicate settings import.
- `apps/website/src/features/forms/__tests__/publish-content.test.ts` — use repoPublishBindings at both calls, assert exact transferred fields.
- `apps/website/src/features/pages/__tests__/html-undo.integration.test.ts` — select full document factory and inject a fault at real restore/write.
- `apps/website/src/features/recovery/__tests__/unit/permissions.unit.test.ts` — supply the trusted restore actor.
- `apps/website/src/features/site-update/__tests__/apply-tool.test.ts` — use full apply runtime for the lock and backup.
- `apps/website/src/features/site-update/__tests__/approved-handoff.integration.test.ts` — type full runtime and real surface binding.
- `apps/website/src/features/site-update/__tests__/check-tool.test.ts` — retain all apply ports as a control while checking through the narrower contract.
- `apps/website/src/features/site-update/__tests__/desktop-binding.test.ts` — supply a valid release when constructing the ID fixture.
- `apps/website/src/features/site-update/__tests__/self-hosted-binding.test.ts` — supply a valid release and accept a null unconfigured runtime.
- `apps/website/src/features/trash/__tests__/email-template-trash-flow.test.ts` — use the actual PageConcurrentEditError constructor.
- `apps/website/src/features/trash/__tests__/tool-contract.characterization.test.ts` — use real versioned InMemoryUserRepo with the same user.
- `apps/website/src/features/trash/__tests__/tool-registrations.test.ts` — real versioned InMemoryUserRepo with a recording list override.
- `apps/website/src/features/trash/__tests__/trash-item-user.test.ts` — match the binding’s narrower delegate facts.
- `apps/website/src/features/trash/__tests__/user-adapter.dialects.test.ts` — bind the real schema-erased kernel.
- `apps/website/src/features/trash/__tests__/user-adapter.test.ts` — bind the real schema-erased kernel and a versioned policy.
- `apps/website/src/server/__tests__/assistant-ag-ui-resume.integration.test.ts` — narrow the terminal wire event and retain the composed route deps type.
- `apps/website/src/server/__tests__/composed-reporter-bound-sites.unit.test.ts` — narrow the incident details without a cast.
- `apps/website/src/server/__tests__/integration/serving-app-outbox-drain.integration.test.ts` — require real durable insert and attribute both record and event.
- `apps/website/src/server/__tests__/routes/member-oidc-auth.test.ts` — bind the reporter and instrument the readonly lock port locally.
- `apps/website/src/server/__tests__/routes/newsletter-public-routes.test.ts` — type the repository fault and bind independent reporters, verify subscription persistence.
- `apps/website/src/server/__tests__/routes/publish-credentials-route.test.ts` — use the current validation-error export and failure reporter.
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` — bind the peer kind for all three history stores.
- `apps/website/src/server/__tests__/routes/publish-trust-apply-coverage.test.ts` — bind read-only widget post writes in all three fixtures.
- `apps/website/src/server/__tests__/routes/publish-zero-setup-end-to-end.test.ts` — use the real handshake-error export.
- `apps/website/src/server/__tests__/site-chat-stream.ag-ui.golden.test.ts` — keep and narrow the schema-validated AG-UI union.
- `apps/website/src/server/__tests__/unit/forms-module-sender.unit.test.ts` — repoint positional mailer contracts to Jini.
- `apps/website/src/server/__tests__/unit/server-modules.unit.test.ts` — bind orFallbackSync.
- `apps/website/src/server/__tests__/widgets-error-code-parity.test.ts` — bind widget post writes and use real in-memory ports with an exact fault witness.
- `apps/website/src/server/runtime/composition/publish-content-manifest.ts` — export the three existing bags verbatim.

## Named mutation probes for cloud verification

These describe separate source edits to try in the cloud, not changes in the working tree.

- **M fixture-version / M media-no-hash** — omit the initial version or Node hash binding from the affected fixture. Type checking should catch either omission. Running the media cases without type checking should reproduce the missing-function failure.
- **M form-drop-original-rendition** — omit `saveOriginalRendition`. The common-fields case should fail its saved rendition check. Drop the compensating purge and the cleanup cases should report a retained asset or missing job.
- **M form-mark-on-failure** — write the protection marker after a failed stamp. The retry case should fail its `ENOENT` assertion. Omit the blob update instead and it should fail the SQLite ownership readback.
- **M publish-unbound-factory** — omit `createRepoPublishHandler` at the form contributor boundary. The round trips should fail before transfer. Copy incoming `notify` over destination settings instead and the exact recipient assertions should fail.
- **M reporter-cross-mount** — record the second newsletter failure through the first reporter. The overlapping request test should find the wrong recipient of the incident. Drop the successful write and it should fail its independent consent readback.
- **M unlink-skip-fresh-session-read** — reuse the pre-lock member session after revocation. The unlink test should fail its exact response or identity-state assertion.
- **M plugin-skip-approval** — bypass the update's headless confirmation guard. The exact refusal and unchanged installed digest checks should fail.
- **M a10-non-core-import** — add an external non-core Jini import to a pinned portable artifact. The narrowed same-package exception must not admit it.
- **M page-restore-without-CAS** — omit the restore version predicate. The racing human edit should no longer survive with a conflict.
- **M apply-without-handoff / M2** — retain the existing probes for exposing apply without a hand-off and trying a default feed.
- **M outbox-drop-trace-context** — omit producer context from the event co-persisted with the change set. The subscriber should fail the parent-trace assertions.

## Quality findings and deletions

- `common-fields.test.ts: form upload storage delegates to real media/blob/rendition ports` F1.2 fixed. Read back the asset, actual blob bytes, and rendition key.
- `form-file-purge.test.ts: filename-only / known-private / transient stamp` F5.5 fixed. Marker guards now measure queries outside callbacks that could swallow failures. Transient retry also fixes F4.5 by starting with a blob whose ownership flag still needs to change.
- `newsletter-public-routes.test.ts: overlapping newsletter requests` F6.3 fixed. Independently read the subscribed row and its exact consent revision.
- `member-oidc-auth.test.ts: session lost after the unlink lock` F4.4/F5.2 fixed. Verify the session initially exists and the identity still exists afterward.
- `install-tool-update.unit.test.ts: without a human confirmation` F4.4/F5.4 fixed. Assert the approval-specific refusal and read installed state without reinstalling.
- `publish-content.test.ts: changed source updates in place` F1.2 fixed. Compare both field records rather than their count.
- `apply-tool.test.ts: a second approved update cannot capture another backup` F7.1 left. The existing first-capture polling has no deadline. Revisit with the update concurrency harness.
- `assistant-ag-ui-resume.integration.test.ts: server shutdown abandons every parked approval` F7.1 left. The negative continuation check still uses a delay and needs a daemon/provider completion signal.

No tests or production statements were deleted. Removed the duplicate settings import, redundant casts, partial in-memory user fakes, and the mutating reinstall probe. Replaced a few fault stubs with real instances instrumented at one method. Only the three approved existing manifest bindings are exported in production.

The composed page-store factory intersects with the narrower duplicate-store factory overload. The tests use the full HTML operation contract. The composed change-set write port exposes `insert` as optional, so the durable test requires it explicitly. The newsletter reporter is mount-owned rather than read from response locals. The broader `withKeys`, `newId`, and `CREDENTIAL_MESSAGES` failures were not associated with a listed case in this dispatch.
