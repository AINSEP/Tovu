# CMS coverage gap fill

Source mutations below are proposed checks for the cloud runner. No mutations, tests, installs, builds, typechecks, or coverage runs were executed locally.

Paths in the ledger are relative to `packages/cms/src`. For table tests each labeled input is a distinct case and its corresponding guard/branch is the mutation target.

## Post write fields and before-save

Fixture `posts/__tests__/post-write-fields.test.ts`

- `posts/post-write-fields.ts: normalizes offset timestamps and distinguishes omitted from cleared schedules` → return the incoming offset time without converting to UTC or collapse undefined into null.
- `posts/post-write-fields.ts: refuses publishAt with $label` → accept the labeled wrong type, offset-free date, invalid calendar value, or extra trailing input by disabling its validation.
- `posts/post-write-fields.ts: stores trimmed cover IDs and preserves omission and explicit clearing` → return untrimmed IDs, reject length 200, or populate cleared schedule keys.
- `posts/post-write-fields.ts: refuses a featured ID consisting of $label` → drop the type, whitespace, or length guard corresponding to the case.
- `posts/post-write-fields.ts: validates display credits and keeps the byline flag tri-state` → measure UTF-16 units, coerce a non-string author, or coerce a string flag to true.
- `posts/post-write-fields.ts: accepts only the two writer statuses and object bodies` → admit scheduled status or accept arrays as objects.
- `posts/post-write-fields.ts: does not convert a raw HTML page when updating ordinary post fields` → unconditionally return doc fields on update.
- `posts/post-write-fields.ts: enforces title length without rejecting valid boundary values or explicit resets` → change the title comparison from > to >= or reject null template/override.
- `posts/post-write-fields.ts: compares saved content rather than revision metadata or inactive body columns` → include revision version, retain the inactive body, or normalize explicit empty template to null.
- `posts/post-before-save.ts: returns the before-save patch and propagates the hook's refusal unchanged` → swallow the hook rejection or return an empty patch despite a wired hook.
- `posts/post-before-save.ts: merges plugins by namespace and updates only the cover preference` → replace the entire ext bag with the patch, drop the old presentation keys, or treat false as omission.

## Page registrations

Fixture `pages/__tests__/tool-registrations.test.ts`

- `pages/tool-registrations.ts, tool-registrations.read.ts: contributes a scoped HTML reader that returns the captured version and only the selected region when asked` → bind the wrong domain/risk/builder, omit caller scope when opening the store, or return the entire HTML after a region lookup.
- `pages/tool-registrations.read.ts: reads $name with the doc row's own write basis` → infer content from row existence, always require a renderer, omit the doc conversion note, or use the store version rather than the doc row's.
- `pages/tool-registrations.read.ts: does not render the body of a $name page` → remove the corresponding row existence, kind, or trash guard.
- `pages/tool-registrations.shared.ts: fails closed when a store read did not capture any version` → return zero for a missing version instead of throwing.
- `pages/tool-registrations.shared.ts, tool-registrations.regions.ts: refuses a %s region without replacing the whole document` → accept a failed lookup, fail to deduplicate available handles, or remove malformed-region guidance.
- `pages/tool-registrations.regions.ts: does not convert an unauthored doc through %s` → remove each not-found recovery or create an HTML body after missing markup.
- `pages/tool-registrations.{read,regions,write}.ts: %s does not disguise an infrastructure read failure` → treat all store errors as missing HTML in the named handler.
- `pages/tool-registrations.{regions,write,shared}.ts: %s refuses newly ambiguous handles before changing the stored body` → ignore new ambiguity, or omit a colliding handle from the caller's refusal.
- `pages/tool-registrations.{regions,shared}.ts: reports the handles and warnings of the saved region and attributes the Undo record` → report pre-write handles, drop either warning, drop the Undo ID, or use a different principal/version when recording.
- `pages/tool-registrations.shared.ts: rejects a region move with $name before opening the store` → admit the corresponding missing or conflicting placement.
- `pages/tool-registrations.{regions,shared}.ts: does not write when a move is %s` → continue to write after parser refusal or omit the current handles from the unchanged result.
- `pages/tool-registrations.regions.ts: saves a moved region's whole markup and reports the new order` → swap moving and target, ignore after-placement, or report the pre-move scan.
- `pages/tool-registrations.{regions,shared}.ts: turns a move's late CAS failure into a reread instruction without saving` → re-read before writing or let a late CAS failure become an unclassified error.
- `pages/tool-registrations.{write,shared}.ts: refuses a stale conversion and passes the matched doc version to the converter on retry` → skip the doc-version check, omit the CAS on conversion, or claim that same-byte post-conversion write made no change.
- `pages/tool-registrations.write.ts: reports the kind mismatch on full writes with the rich-text alternative` → pass a kind mismatch through as an internal error.
- `pages/tool-registrations.shared.ts: describes untagged sections before opening a store, suggesting only content-derived handles` → drop an offender, use positional suggestions, or open the store before validation.
- `pages/tool-registrations.{shared,}.ts: normalizes legacy selectors without changing their handles or unrelated tool input` → reject a legacy alias, normalize the handle string itself, allow competing selectors, or apply the region alias map to a full writer.

## SQL HTML document store

Fixture `pages/__tests__/html-document-store.test.ts`

- `pages/html-document-store.ts: does not lend a read basis for $name` → drop the corresponding body-format, null-HTML, or allowed-kind check.
- `pages/html-document-store.ts: leaves an already-converted page intact and lends its current write basis` → reseed the stored body or omit capturing the version in the idempotent conversion.
- `pages/html-document-store.ts: refuses converting another document kind without changing its row or history` → remove the conversion's kind error or begin the history mutation before checking it.
- `pages/html-document-store.ts: refuses to write without first establishing a version basis` → replace the missing-basis refusal with a fresh unconditional basis.
- `pages/html-document-store.ts: reports Trash even if a page was trashed after the HTML was read` → remove the Trash disambiguation or append a revision after a failed match.
- `pages/html-document-store.ts: normalized identical HTML is a no-op and a second real write uses the previous write's version` → bump version for unchanged HTML or fail to advance the captured version on success.
- `pages/html-document-store.ts: converts doc HTML with before and after revisions, normalized widget links, and publication catch-up` → omit either revision, omit normalization/reindexing, remove any enqueued event, or build go-live data from the post-update timestamp.
- `pages/html-document-store.ts, html-inverse.ts: restores original rich text and replaces existing HTML references with the document's references` → leave the old HTML body populated or fail to reindex from the restored doc inverse.

## HTML inverses and Undo

Fixture `pages/__tests__/html-recording-revert.test.ts`

- `pages/html-inverse.ts: refuses unrecognizable persisted inverse $payload` → accept the corresponding invalid body or format.
- `pages/html-inverse.ts: indexes references from the restored HTML and reports an unreadable marker against that page` → use the doc extractor on the HTML inverse or drop the injected reporter.
- `pages/html-reverter.ts: only exposes an Undo version for live pages ($name)` → return a version for a missing, trashed, or wrong-kind row, or return null for a valid live page.
- `pages/html-reverter.ts: refuses Undo with $name before opening the page store` → remove the invalid-payload or missing-version guard.
- `pages/html-reverter.ts: refuses Undo when the bound page store cannot restore an inverse` → silently accept a store that has no restore method.
- `pages/html-reverter.ts: registered page Undo binds the current actor and restores the original body on its saved version` → register under the wrong key or drop the acting principal or expected version.
- `pages/html-reverter.ts: turns disappearance during Undo into a conflict with no usable version` → propagate a store not-found error unchanged or report a stale known version.
- `pages/html-reverter.ts: propagates an infrastructure error during Undo instead of offering to retry an edit` → reclassify all errors as Undo conflicts.

## Go-live sweep

Fixture `posts/__tests__/go-live-sweep.test.ts`

- `posts/go-live-sweep.ts: starts full catch-up immediately, refreshes the overlapped window, and clears the default timer on stop` → remove the immediate pass, alter the interval or ten-minute overlap, or omit clearing the timer.
- `posts/go-live-sweep.ts: skips overlapping ticks, unrefs the host timer, and waits for the active pass to stop` → remove the single-flight guard, unref, active await, or stopped guard.
- `posts/go-live-sweep.ts: retries the same window after a failed pass even when the host's reporter also throws` → move the lower-bound update before awaiting the pass, omit tracing, or let reporter failure reject timer work.
- `posts/go-live-sweep.ts: rejects invalid sweep interval %s before querying candidates` → remove positive safe-integer validation.

## Email template store

Fixture `posts/__tests__/email-template-store.test.ts`

- `posts/email-template-store.ts: creates the template through the HTML store in its own namespace and reads back the converted row` → use a public kind/slug or return the unconverted row to the caller.
- `posts/email-template-store.ts: does not expose or rename a $reason template row` → remove the corresponding row, scope, kind, format, HTML, or Trash filter.
- `posts/email-template-store.ts: a stale HTML session cannot overwrite a successful edit` → return true after a CAS refusal, drop actor binding, or use a fresh session basis on write.
- `posts/email-template-store.ts: does not mistake an infrastructure write error for a stale HTML session` → turn every thrown error into false.
- `posts/email-template-store.ts: renames only via a matched version and leaves HTML and revisions alone` → substitute current version for ifVersion or route rename through the body writer.
- `posts/email-template-store.ts: paginates only HTML templates in the selected workspace using the id tie-break` → omit the cursor or scope from the query.

- `posts/email-template-store.ts: reports a broken conversion and rolls back the unconverted template` → accept a non-HTML record after conversion or leave the draft behind.
- `posts/email-template-store.ts: preserves the page position of a stale candidate without exposing unrelated content` → expose a wrong-kind/trashed candidate or discard its position.
- `posts/email-template-store.ts: reports an unavailable list capability rather than showing an empty library` → return an empty array when the list port is absent.
- `pages/html-inverse.ts: does not capture a placeholder doc as the inverse of a page with missing raw HTML` → return a doc or empty HTML inverse when raw HTML is null.

## Post read models

Fixture `posts/__tests__/post-read.test.ts`

- `posts/post-read.ts: the kind-only reader excludes internal templates but leaves draft and trash decisions to callers` → remove the kind filter or add a publish/trash check to its read ports.
- `posts/post-read.ts: admin post, page and all lenses include drafts and exclude trash and internal records` → omit one eligibility check or ignore the chosen lens.
- `posts/post-read.ts: admin lookup for %s gives the same typed not-found contract` → leak the corresponding invalid row or throw a generic error instead.
- `posts/post-read.ts: public listing and both embed lookups open at the exact go-live instant` → ignore provided time, remove publication/trash/workspace filtering, or refuse a row at the exact instant.
- `posts/post-read.ts: visitor slug lookup normalizes the selector without revealing an embargoed post` → drop normalization or return a scheduled row before its publishAt.
- `posts/post-read.ts: admin selector prefers a normalized slug over a colliding id and preserves the exact id fallback` → resolve id first, strip the literal root, or lowercase the raw id fallback.
- `posts/post-read.ts: previews pass pagination and time to the bounded port and discard invalid result kinds` → omit offset or time in the port call, or let an internal kind through.

## Slug policy and history

Fixture `posts/__tests__/slug.test.ts`

- `posts/post-slugs.ts: rejects the invalid %s slug %s` → bypass the format, length, root-kind or reserved-word guard for the labeled input.
- `posts/post-slugs.ts: allows the root only for pages and admits explicit slugs up to 120 characters` → disallow the root entirely or change the maximum comparison to inclusive rejection.
- `posts/post-slugs.ts: chooses distinct article and page suffixes and reports the exact trashed candidate` → collapse the two suffix rules or treat a trashed candidate as occupied.
- `posts/post-slugs.ts: skips reserved candidates, allows its own live slug, and refuses an exhausted namespace` → take a reserved candidate, treat its own slug as occupied, or stop before/after the bound without a typed conflict.
- `posts/post-slugs.ts: moves a trashed $name past occupied names without changing its restore version` → fail to translate the root, truncate, skip occupied suffixes, or preserve version.
- `posts/post-slugs.ts: refuses to rename a trash holder that was restored after it was read` → replace the conditional write with an upsert.
- `posts/post-slugs.ts: captures old and new public paths for a previously published rename, even when unpublishing` → key off the new status or use bare slugs instead of routed paths.
- `posts/post-slugs.ts: does not ask for a redirect for unchanged, draft-only, or root addresses` → remove one of the three early exits or attempt to route paths without a capture provider.
- `posts/post-slugs.ts: uses revision history to distinguish an unpublished draft from one with a prior public address` → check only current status, or treat any revision as a prior publication.

## Post tool boundaries

Fixture `posts/__tests__/post-tool-boundaries.test.ts`

- `posts/post-tool-delete.ts: loads the requested public target for deletion and refuses missing, wrong-kind, or trashed rows` → remove the workspace, kind, or liveness check.
- `posts/post-tool-delete.ts: requires a fresh deletion confirmation only when a live row changed versions` → remove the stale-confirmation guard or apply it to missing or already-trashed rows.
- `posts/post-tool-errors.ts: only decorates shape rejections and sends model-facing error codes with the actionable reason` → reorder generic conflict above version conflict, omit any allowlist rule, or decorate every error as a shape rejection.
- `posts/post-tool-input.ts: rejects unrecognized post kind $value` → accept malformed kinds or omit the ToolInputError classification.
- `posts/post-tool-input.ts: rejects invalid present post status $value` → accept malformed statuses or treat null as omitted.
- `posts/post-tool-input.ts: retains admitted kinds and statuses and distinguishes an omitted optional status` → reject one admitted value or fill omitted status with draft.
- `posts/post-tool-input.ts: rejects malformed present body $value` → admit the labeled non-object body.
- `posts/post-tool-input.ts: preserves optional body, string, and publish time omission instead of clearing the record` → coerce omission to a clear or accept an empty title.
- `posts/post-tool-update.ts: keeps explicit clears in an update patch and fills only omitted core fields` → treat false/null as omission, fill from the wrong row field, or change any partial-patch check from OR to AND.
- `posts/post-tool-update.ts: validates template input and checks a named file only against templates for the chosen kind` → accept non-string input, always reach the theme port, or ignore the selected kind.
- `posts/post-tool-update.ts: updates public records by scope while retaining the documented explicit-page kind check` → bypass the explicit page guard or reject every mismatch including the documented post direction.
- `posts/post-tool-update.ts: blocks a real body change to bespoke HTML but permits a structurally equal round trip` → compare object identity, always accept changes to HTML bodies, or refuse doc editing.
- `posts/post-tool-update.ts: records pre-edit presentation and only captures a template when a change was requested` → drop schedule/cover/presentation fields or replace the pre-edit template with the new input.
- `posts/post-tool-list.ts: applies listing defaults, floors fractional limits, and preserves a text floor on large results` → change the upper/lower/default limits or remove the minimum excerpt allocation.
- `posts/post-tool-list.ts: requires both listing filters and matches title or slug without case sensitivity` → combine status and query with OR, remove one match source, or remove lowercasing.
- `posts/post-tool-list.ts: parses listing fields without leaking unrequested content, always retaining the id` → omit id, accept any one supported field in a mixed list, or emit every column.
- `posts/post-tool-list.ts: uses active body format for listing excerpts and marks both soft and hard cuts` → use doc text on HTML, slice without ellipsis, or cut at an early space.
- `posts/post-tool-views.ts: selects an unambiguous admin editor path for posts, pages, root, and the literal home slug` → build post paths from slug, leave the literal root unencoded as handle, or merge root and home routes.
- `posts/post-tool-views.ts: projects a scheduled record without internal fields and stops calling it scheduled at go-live` → expose internal fields, omit media/schedule metadata, or keep scheduled at exact equality.
- `posts/post-tool-views.ts: uses the canonical routing URL and reports the destination only on a published write` → return a relative path instead of the canonical URL or report the production label for a local/draft write.

## Featured image resolution and input

Fixture `posts/__tests__/featured-image.test.ts`

- `posts/featured-image.ts, post-tool-input.ts: resolves a slug and an ambiguous id to the canonical asset id in the caller's workspace` → return the input ref, skip trimming or pass the wrong scope/hash to a port.
- `posts/featured-image.ts: allows an asset whose MIME type has not yet been recorded or whose host has no type store` → reject missing MIME evidence as a known non-image or require a type port.
- `posts/featured-image.ts, post-tool-input.ts: rejects the %s cover with caller-specific recovery text` → remove the selected missing/trashed/not-image guard, or lose that surface's recovery text.
- `posts/post-tool-input.ts, featured-image.ts: distinguishes omission and clearing, rejecting malformed assistant refs before accessing media` → merge omission and clear or try to query an unavailable media library.

## Content statistics

Fixture `posts/__tests__/content-stats-tool.test.ts`

- `posts/content-stats-tool.ts: counts only non-trashed public content and ranks longest text across body formats` → include trash, sort equal lengths by input order, count HTML from the doc placeholder, or populate words with counts switched off.
- `posts/content-stats-tool.ts: rejects invalid statistics options %j before reading rows` → remove the matching type/range/integrality check.
- `posts/content-stats-tool.ts: counts live collections by key and retains empty types without exposing widget internals` → include a widget/tombstone type or omit a supported type with zero rows.
- `posts/content-stats-tool.ts: uses MIME metadata first and sniffs a shared legacy blob once for all referring assets` → read shared blobs per asset, include trashed media or misbucket any MIME family.
- `posts/content-stats-tool.ts: refuses to report a partial inventory when a legacy media blob is missing` → ignore the missing blob and return a misleading partial count.

## Post preview

Fixture `posts/__tests__/y5-post-bindings.test.ts`

- `posts/preview-tool.ts: contributes preview with unsaved overrides and forwards shaping options without saving the draft` → omit overrides, use the alias instead of id, or drop the shaping options.
- `posts/preview-tool.ts: refuses malformed preview input $input before loading the row` → use the alias when a malformed primary id was sent, or accept the selected bad override.
- `posts/preview-tool.ts: propagates a storage failure instead of claiming the preview target is missing` → convert all read failures to not-found.
- `posts/preview-tool.ts: previews a post by the slug advertised in the tool schema` → use only an id lookup. Current code already does this at line 69, so this regression test is expected to fail until the lookup is made slug-aware.

## Publish import

Fixture `posts/__tests__/post-import.test.ts`

- `posts/post-import.ts: replicates source body, metadata and creator but assigns destination version and importer attribution` → keep source scope/version, drop opaque metadata or plugin ext, attribute the revision to the source creator or omit a publication event.
- `posts/post-import.ts: replaces destination content across formats while retaining its write-once authorship` → merge incompatible body columns, keep obsolete ext, overwrite destination creator or use the source clock/version.
- `posts/post-import.ts: cannot overwrite an existing target when the caller planned a create` → let unversioned import upsert over an existing target.
- `posts/post-import.ts: does not modify either row on $name` → remove the named trash, kind, or taken-slug guard or run the hook before the refusal.
- `posts/post-import.ts, post-write-effects.ts: refuses a versioned import whose destination disappeared` → upsert the missing row or substitute a stale-version response for not-found.
- `posts/post-import.ts, post-write-effects.ts: preserves a newer save that landed while an import hook was running` → persist an unconditional save after the hook or report the obsolete version.
- `posts/post-import.ts: aborts an import when a plugin refuses and rolls back the row and revision when enqueue fails` → swallow the hook failure or move the enqueue outside the transaction.

## Post create and update

Fixture `posts/__tests__/post-authoring-gaps.test.ts`

- `posts/post-create.ts: create refuses invalid $field before slug checks or side effects` → accept an invalid body/status or run a read/hook before validating.
- `posts/post-create.ts: uses a scoped account for the default credit but never replaces an explicit author or clear` → stop assigning account username, look it up in another scope, or overwrite explicit null/name.
- `posts/post-update.ts: update refuses invalid $field without calling the hook or persisting the change` → allow the invalid doc body/status through validation.
- `posts/post-update.ts: does not allow editing a $name record even with an expected version` → allow editing internal or trash rows or perform the expected-version guard before checking liveness.
- `posts/post-update.ts: rederives a never-published automatic slug and releases the exact trash holder without changing its version` → keep the old slug, claim it before releasing its trash holder, or skip the revision/event.
- `posts/post-update.ts: keeps a $name slug when the title changes` → remove the labeled history, automatic-slug or page-kind guard.
- `posts/post-update.ts: rejects a stale no-op after the hook and keeps the other editor's save and only its revision` → return stale no-op success without re-reading after the hook.
- `posts/post-update.ts: rejects a no-op when the record moves to Trash while its hook is running` → skip the no-op reread's liveness check.
- `posts/post-update.ts: passes the persisted HTML page placeholder to the hook and preserves its raw body and unrelated metadata` → pass the proposed doc to the plugin, clear unrelated namespaces, or ignore the explicit resets.
- `posts/post-update.ts: rolls the post and ledger back if a changed update cannot enqueue its event` → emit after committing the update transaction.

## Trash and replacement retirement

Fixture `posts/__tests__/post-retire-trash.test.ts`

- `posts/post-trash.ts: trashes a published post with the authorized marker and only one unpublish event` → omit authorization attribution/basis in the marker call, skip the revision or event, or re-delete an already trashed row.
- `posts/post-trash.ts: a removal port not-found refuses deletion without recording an effect` → replace late not-found with generic conflict or record a deletion anyway.
- `posts/post-retire.ts: publishing cannot retire a $name holder` → bypass the selected missing/root/version preflight guard.
- `posts/post-retire.ts: moves an already-trashed holder aside without retiring it again or changing its restore version` → bump its version or re-trash it and emit another event.
- `posts/post-retire.ts: renames past occupied retirement slugs before trashing the new version` → skip the suffix loop, trash against the old version, or drop one ledger entry.
- `posts/post-retire.ts: rolls back the rename and its revision on a %s removal response` → swallow removal failure, change its error class, or move the rename out of the transaction.
- `posts/post-retire.ts: never overwrites a save that lands during retirement's slug search` → rename unconditionally at line 127. Current code already does this, so the regression is expected to fail until the first rename is version-conditioned.
- `posts/post-trash.ts: undoes an update forward without clearing an unrelated Trash index` → restore old version verbatim, omit restoredFrom, or always forget the trash index.
- `posts/post-trash.ts: cannot restore over a $name row` → upsert a deleted row or restore even when the preceding mutation never landed.
- `posts/post-trash.ts: undo leaves a later save untouched if the restore CAS loses` → replace the CAS with save, return success on a lost CAS, or clear the Trash index anyway.

## Post write effects

Fixture `posts/__tests__/post-write-effects.actor.test.ts`

- `posts/post-write-effects.ts: announces only the public effect of $name` → send a wrong event for the transition or omit its vouched actor.
- `posts/post-write-effects.ts: tells subscribers about a pending go-live before sending the subsequent content edit` → omit catch-up or reverse its order with the content event.
- `posts/post-write-effects.ts: does not emit a public event until scheduled content is live and treats a trashed row as not public` → use stored published status instead of public liveness.
- `posts/post-write-effects.ts: keeps explicit analytics sources without guessing a trusted actor` → force the default source or guess a trusted channel from actorId.
- `posts/post-write-effects.ts: pins version conflict details while supporting an omitted or matching basis` → ignore version zero or use an equality rejection on a matching version.
- `posts/post-write-effects.ts: a late CAS loss against Trash reports not-found and leaves that row intact` → turn it into a conflict that discloses the Trash row version.
- `posts/post-write-effects.ts: links a forward restore revision to its source and records it as system when no actor is given` → drop the restore pointer or the system fallback.

Fixture `posts/__tests__/y5-post-bindings.test.ts`

- `posts/post-tool-policy.ts: featured image refusal has caller guidance even when the type is unavailable` → interpolate undefined instead of the stable no-type fallback.

## Post and page duplication

Fixture `posts/__tests__/post-duplicate.lifecycle.test.ts`

- `posts/post-tool-duplicate.ts: copies a rich-text post with a free same-kind title and fresh widget placement but the same widget target` → share name space between kinds, keep the source placement id, copy as published, or omit command attribution.
- `posts/post-tool-duplicate.ts: returns an explicit published copy with routed URL and does not call name derivation` → invoke derivation despite an override, force draft, ignore caller slug, or omit the actor-stamped public event.
- `posts/post-tool-duplicate.ts: does not read a duplicate source when the actor lacks the read grant` → remove or move the read authorization below the source lookup.
- `posts/post-tool-duplicate.ts: refuses a post in the page contributor and rejects a bad public status before opening the copy` → remove either the page-kind guard or explicit status validation.
- `posts/post-tool-duplicate.ts: refuses to duplicate raw HTML without the optional store rather than silently making a doc copy` → substitute an empty doc when the host hasn't bound its HTML store.
- `posts/post-tool-duplicate.ts: converts an HTML duplicate and records the converted body's actual version` → read the wrong scope/id, skip conversion, or return the pre-conversion record to the gateway.

## Publish-content retirement

Fixture `posts/__tests__/publish-content-retire.test.ts`

- `posts/publish-content.retire.ts: plans a scoped address takeover against the holder's actual kind and content fingerprint` → hash the incoming state/type instead of the holder or rename while still planning.
- `posts/publish-content.retire.ts: does not offer retirement for $name` → omit the selected availability, slug, holder identity or incoming-id guard.
- `posts/publish-content.retire.ts: refuses retirement when no $name is bound` → write or proceed despite an incomplete composition.
- `posts/publish-content.retire.ts: refuses a retirement with no trusted actor instead of inventing attribution` → fabricate a user actor instead of asking the apply-run actor port.
- `posts/publish-content.retire.ts: checks content.write before reading or retiring the address holder` → use read permission, wrong entity scope or bypass the gateway's denial.
- `posts/publish-content.retire.ts: does not retire or record a command for $label` → skip the captured holder's existence or current hash recheck.
- `posts/publish-content.retire.ts: retires the planned holder with a versioned inverse and restores it forward on undo` → omit its prior address, use the new row's id, assign a wrong actor/date/version, or fail to untrash on undo.
- `posts/publish-content.retire.ts: rolls back a completed retirement if the command ledger cannot record its inverse` → omit the command rollback callback or fail to clean up the trash marker.
- `posts/publish-content.retire.ts, post-trash.ts: undo restores the address of an already-trashed holder without untrashing it` → skip compensation for a slug change when the version is unchanged. Existing restorePostForward does exactly this at line 219, so this regression is expected to fail until the rename-only compensation is handled.

## Final branch checks

- `pages/tool-registrations.regions.ts: returns no Undo handle when a region edit is byte-identical` → claim a changed version or rescan identical markup in the no-op path.
- `pages/tool-registrations.{write,}.ts: classifies conversion of a missing page as not-found instead of claiming an HTML write` → swallow or misclassify the converter's missing-page error.
- `pages/html-document-store.ts: saves a draft through the statements transaction without a revision adapter` → skip/fail the revision-free write path or emit an entry.updated event for a draft.
- `pages/html-document-store.ts: does not append a revision or publish after a late matching-basis write loses its CAS` → append after a zero-row update or treat the failed write as success.
- `pages/html-document-store.ts: leaves matching restored HTML untouched but refuses a late restore CAS loss` → increment version for unchanged HTML or treat a lost restore CAS as success.
- `posts/post-tool-duplicate.ts: rolls back an HTML copy when the host store becomes unavailable during creation` → return the already-born doc or begin conversion outside the repo transaction.
- `posts/preview-tool.ts: the standalone preview contribution retains the legacy selector and uses the injected read scope` → drop postId compatibility or ignore the injected reader permission or renderer.


## Static handoff notes

- F2.1/F2.5 and F6.3: state-changing tests read the affected repository/ledger back. Port-only claims compare the request or event envelope, not just a call count. F4.3/F4.4: alternate kinds, versions, slugs, field values and scopes make the expected branch decide the result. F7.5/F7.7: fixtures are per test and clock-dependent flows use pinned times.
- Suggested EXCEPTION: `posts/content-stats-tool.ts:138`. The media type table copies the initial map and resolves every missing hash before returning. Reaching the final missing-value guard requires a port that violates its typed map contract.
- Suggested EXCEPTION: `posts/publish-content.retire.ts:137,164`. The real command gateway never executes or rolls back a mutation whose required holder capture rejected.
- BUG `posts/preview-tool.ts:69`: use a slug-aware lookup to match the advertised input.
- BUG `posts/post-retire.ts:127`: condition the rename on the version from the retirement plan.
- BUG `posts/publish-content.retire.ts:138` / `posts/post-trash.ts:219`: add conditional same-version slug restoration for the rename-only trash path, preserving its trash marker and version.
