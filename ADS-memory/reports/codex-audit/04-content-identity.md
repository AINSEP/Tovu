# Content, identity, site lifecycle audit

Advisory code-only read of Tovu frozen HEAD efc6847ed4490d0f57cd94d16b8cf46a6489a88a. Window: 4b89cd09..HEAD. Tests, builds, type checks, live databases, and source mutations excluded by user instruction. Findings are flushed as confirmed; coverage is in 04-content-identity-coverage.json.

No findings confirmed yet. Review in progress.

## C01 — High — CONFIRMED: expectedVersion is checked before asynchronous work, not atomically with the write

- Location: `apps/website/src/features/post/post.ts:976` (check), `:1000` (unconditional save); adapter `apps/website/src/features/post/repo.sqlite.ts:207` (upsert without a version predicate).
- Scenario: two authorized saves start from draft version 7 and both send `expectedVersion: 7`. Request A reads version 7 and passes the guard, then waits in the before-save hook. Request B reads version 7, passes, writes its document as version 8 and succeeds. A resumes and unconditionally writes its older-basis document as version 8. Both requests can succeed; B's saved content is erased, and the version does not record the second write.
- Evidence: read the posts PUT route through `executeCommand`, `updatePost`, hook invocation, `buildUpdatedPost`, and `SqlitePostRepo.save`. The installed gateway awaits `captureInverse` and `execute` without serialization or a surrounding transaction. `updatePost` awaits slug lookup and a plugin hook after the comparison. `save` upserts on post id only. Draft-to-draft emits no status event, so an outbox collision does not interfere with this concrete scenario. The comment calling the check “compare-and-set” at `post.ts:907` is false: there is a compare followed by a separate unconditional set.
- Window anchor: `be45461e`, `9c7d16bf`, `2756ac26`, `b37864c3`.
- Disposition: implementation fix required. Carry the expected version to a conditional persistence operation and treat zero updated rows as a version conflict; preserve the same guarantee for all update callers.
- Verification: source path confirmed; no runtime reproduction or tests run, as required by the audit constraints.

## C02 — Medium — CONFIRMED: the Pages update sibling silently discards expectedVersion

- Location: `apps/website/src/server/inbound/admin-http/routes/pages/update.ts:23` and `:154`.
- Scenario: an authorized client reads a page at version 7; another save produces version 8. It PUTs its old document to `/api/admin/v1/workspaces/<workspace>/pages/<page>` with `expectedVersion: 7`. `parsePageUpdateBody` removes the field, `updatePost` sees `undefined`, and the stale document overwrites version 8 with a successful response. The equivalent Posts route rejects the same stale basis.
- Evidence: read the complete Pages route, sibling Posts parser/error mapping, and shared `updatePost` through the persistence adapter. The Pages parser forwards four fields only. Its call spreads that parser into domain input; no later code restores the version. Its `PostConflictError` mapping also has only `SLUG_CONFLICT`, whereas Posts added `VERSION_CONFLICT`. This is an unwired sibling of the new shared primitive; it is distinct from C01's concurrent race because the conflicting save is already complete before this request begins.
- Window anchor: `be45461e`, `9c7d16bf`, `2756ac26`, `b37864c3`; the Pages route itself was unchanged in the window and is cited as the reachable sibling omitted by those changes.
- Disposition: implementation fix required to extend the intended concurrency protection to Pages. If Pages is deliberately excluded, document that scope explicitly; the shared-domain comment currently presents it as a twin contract.
- Verification: source path confirmed; no tests run.

## C03 — Medium — CONFIRMED: duplicateSite leaves partial output when the target already exists and no portable directory is copied

- Location: `apps/website/src/platform/site-dir/duplicate-site.ts:218` (`wroteAnything`) and `:234` (config write).
- Scenario: source is a valid marker-bearing site containing `content.db` but none of the six optional portable directories, and destination is an existing empty directory. Directory creation is skipped; `copyPortableEntries` never calls its first-write callback; `config.json` is written while `wroteAnything` remains false. If the source DB is unreadable/corrupt or `VACUUM INTO` fails, `cleanupAndRethrow` does not remove the config/partial DB. The retry then refuses the now nonempty destination instead of recovering.
- Evidence: complete `duplicateSite`, `copyPortableEntries`, `duplicateContentDb`, and `init-site.ts` cleanup/validation read. `readSiteDir` validates markers rather than requiring all portable directories, so this source shape is allowed. The only assignments to the flag are directory creation and the copy callback; neither covers the config/DB writes on this arm.
- Window anchor: `0d63cfd8`, `9051e2b5`; defect at HEAD in the recently changed copy/cleanup path.
- Disposition: implementation fix required. Account for the first successful marker/database write even when the destination preexists and no portable entries exist.
- Verification: source path confirmed; no filesystem fault injected or tests run.
