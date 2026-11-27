# CMS coverage gap fill — mutation handoff

Each entry names a source change the added test should reject. Author Checklist reviewed by inspection. Tests and mutations were not executed.

### Post editor, publish, widget fields, redirects and SEO

- packages/cms/src/seo/content-analysis/__tests__/content-analysis.test.ts:estimates syllables in HOPe! as 1 → remove silent-e trimming.
- packages/cms/src/seo/content-analysis/__tests__/content-analysis.test.ts:estimates syllables in table as 2 → remove the consonant+le exception.
- packages/cms/src/seo/content-analysis/__tests__/content-analysis.test.ts:estimates syllables in 123 as 1 → return the raw vowel-group count instead of its minimum of one.
- packages/cms/src/seo/content-analysis/__tests__/content-analysis.test.ts:summary reports the first skipped heading level, missing image alt, and short prose → remove the early heading-order warning or the per-check advice templates.
- packages/cms/src/seo/content-analysis/__tests__/content-analysis.test.ts:summary distinguishes a long unsectioned body from one that passes every check → change the subheading threshold to > 300 or omit the all-pass sentence.
- packages/cms/src/seo/__tests__/feed.test.ts:the feed orders by updated time, preserves ties, and ignores pages → reverse the updatedAt sort, sort by publishAt instead, or return -1 for equal timestamps.
- packages/cms/src/seo/content-analyzer-plugin/__tests__/patch.test.ts:scores an authored description instead of reporting the length check skipped → always pass empty analysis options in buildContentAnalyzerPatch.
- packages/cms/src/redirects/__tests__/tool-registrations.test.ts:redirects_import refuses missing, non-array, empty, and oversized rules before writing → remove each operand of the rules array/size guard in turn.
- packages/cms/src/seo/site/__tests__/settings.unit.test.ts:invalid setting wire shapes and over-limit inputs leave the settings ledger untouched → delete one validator guard at a time or move validation below the first ledger write.
- packages/cms/src/seo/site/__tests__/settings.unit.test.ts:exact SEO limits are accepted and robots paths survive ledger readback → change a length comparison from > to >=, drop robotsRules from the ledger writes, or omit robots-rules sitemap invalidation.
- packages/cms/src/seo/__tests__/share-image.unit.test.ts:cover projection skips refused, missing and trashed references, deduplicates reads and preserves the stored post → delete the featured-image validation/trashed filter, or return the unprojected row through the detached read port.
- packages/cms/src/seo/__tests__/share-image.unit.test.ts:a missing entry keeps the original read ports and no cover → remove the missing-row guard in withCoverReadDeps.
- packages/cms/src/seo/__tests__/share-image.unit.test.ts:external cover projection fills only missing OG overrides and tolerates invalid stored JSON → use cover.url unconditionally for ogImage or rethrow stored JSON parse errors.
- packages/cms/src/seo/__tests__/share-image.unit.test.ts:admin provenance removes the transient override flag without relabelling a stored override → omit the imageOverridden removal or treat every override as transient.
- packages/cms/src/seo/__tests__/share-image.unit.test.ts:page head puts the resolved authored image on the article but never on breadcrumbs → attach the body image instead of final OG or remove the BreadcrumbList exclusion.
- packages/cms/src/seo/__tests__/share-image.unit.test.ts:a body-only external image is emitted for OG, not JSON-LD → remove the external-cover guard before adding JSON-LD image.
- packages/cms/src/seo/__tests__/share-image.unit.test.ts:an explicitly authored OG URL stays in JSON-LD even when it equals the external body image → regress a provenance-based guard back to URL equality alone (currently red by inspection).
- packages/cms/src/seo/__tests__/share-image.unit.test.ts:no cover or override emits no OG image and leaves the article schema intact → remove the missing-OG early return and try to attach an image to the entry JSON-LD.
- packages/cms/src/seo/site/__tests__/tool-registrations.unit.test.ts:the contributor’s settings writer uses the host ledger and requests workspace sitemap invalidation → drop the host set/lookup bindings or route the sitemap callback to the wrong workspace.
- packages/cms/src/seo/__tests__/share-image.unit.test.ts:a transient external body cover does not leak into the Twitter image tag → allow a transient body OG default to use the authored OG-to-Twitter fallback (currently red by inspection).
- packages/cms/src/react/posts/hooks/__tests__/post-editor-save.rules.unit.test.ts:saved row values preserve an explicit cover choice and normalize omitted byline fields → default hideCoverImageInBody to true regardless of the stored opt-out.
- packages/cms/src/react/posts/hooks/__tests__/post-editor-save.rules.unit.test.ts:save reconciliation retains publication history across a draft return → derive everPublished solely from the returned status, or ignore an already true history flag.
- packages/cms/src/react/posts/hooks/__tests__/post-editor-save.rules.unit.test.ts:save reconciliation updates only the text still matching what was sent → always adopt the response field, overwriting a newer local edit.
- packages/cms/src/react/posts/hooks/__tests__/post-editor-state.rules.unit.test.ts:theme capabilities are taken from the active id, or absent when that theme disappeared → pick the first available theme instead of matching the stored id.
- packages/cms/src/react/posts/hooks/__tests__/post-editor-state.rules.unit.test.ts:load normalizes minute precision, theme defaults and the saved controls without making the editor dirty → omit the time conversion or place bodyJson last in the dirty-check snapshot.
- packages/cms/src/react/posts/hooks/__tests__/post-editor-state.rules.unit.test.ts:slug preview derives for fresh and renamed automatic drafts but preserves the stored suffix or a manual choice → always regenerate an automatic slug, even when the title is unchanged.
- packages/cms/src/react/posts/hooks/__tests__/post-editor-state.rules.unit.test.ts:preview and write targets use a loaded row id and forward the scheduler’s exact input → use postId instead of the persisted row id for writes/form targets.
- packages/cms/src/react/posts/hooks/__tests__/post-editor-messages.unit.test.ts:save copy distinguishes no-op, saved, published and scheduled results → drop the expectedVersion equality check or format future publish as already live.
- packages/cms/src/react/posts/hooks/__tests__/post-editor-messages.unit.test.ts:save and publish errors reserve raw API refusals for the editor and retain the attempted verb → always return Error.message before applying the shared-notice policy.
- packages/cms/src/react/posts/hooks/__tests__/post-editor-messages.unit.test.ts:load failure separates server refusals, shared server notices and local diagnostics → show unexpected API errors inline or omit the local failure diagnostic.
- packages/cms/src/react/posts/__tests__/y5-post-editor-input.test.ts:theme-collision choices retain the distinction between default, post and theme → collapse default to false or map the false value to post.
- packages/cms/src/react/posts/__tests__/y5-post-editor-input.test.ts:toolbar controls signal active formatting and only display six-digit hex colors → drop the active marker or remove the hex regex end anchor.
- packages/cms/src/react/posts/__tests__/y5-post-editor-input.test.ts:an external non-HTTP drop is left to the editor’s default handler → consume every nonempty drop regardless of its URL scheme.
- packages/cms/src/react/posts/__tests__/y5-post-editor-input.test.ts:only document bodies get a cover slot and only posts get the in-body toggle → default missing body format to HTML or enable the hide-cover toggle on pages.
- packages/cms/src/react/posts/__tests__/post-editor-list-rules.unit.test.ts:autosave carries the row version and preserves clearing byline controls without changing live status → replace the supplied base version or omit explicit false/empty byline values via truthiness.
- packages/cms/src/react/posts/__tests__/post-editor-list-rules.unit.test.ts:version and autosave conflict copy distinguish an unknown basis from an identified superseded version → always print raw version fields or suppress the paused-autosave warning.
- packages/cms/src/react/posts/__tests__/post-editor-list-rules.unit.test.ts:preview selects exactly one surface based on saved liveness and the kind of edit → ignore scheduling or route content-dirty edits through the read-only template preview.
- packages/cms/src/react/posts/__tests__/post-editor-list-rules.unit.test.ts:schedule input round-trips the local minute and only future published rows are scheduled → mark a published row scheduled at equality instead of only before go-live.
- packages/cms/src/react/posts/__tests__/post-editor-list-rules.unit.test.ts:only automatic never-published post slugs follow the title → stop looking at manual edits, publication history or automatic suffixes.
- packages/cms/src/react/posts/__tests__/post-editor-list-rules.unit.test.ts:each row menu localizes actions and sends the selected row to the corresponding callback → always show Publish or send the draft rather than the published row to the unpublish callback.
- packages/cms/src/react/posts/__tests__/post-editor-list-rules.unit.test.ts:row handles remain distinct when ids normalize to the same slug and are indexed by original id → key by the sanitized slug instead of the original post id.
- packages/cms/src/react/posts/__tests__/use-post-featured-image.test.tsx:cancel closes the picker without replacing the image and a host without renditions uses the original → make closePicker a no-op or continue retrying a nonexistent rendition before setting previewFailed.
- packages/cms/src/react/posts/editor/preview/__tests__/post-editor-chrome.guard.unit.test.tsx:header vetoes back navigation and targets the saved slug rather than the working one → remove preventDefault on veto or generate the View link from unsaved slug.
- packages/cms/src/react/posts/editor/preview/__tests__/post-editor-chrome.guard.unit.test.tsx:template-only changes use the refreshed GET iframe and the fullscreen control remains available to exit → omit the template iframe branch or use the non-refreshed template URL, or retain the collapsed control after expanding.
- packages/cms/src/react/posts/editor/preview/__tests__/post-editor-chrome.guard.unit.test.tsx:post actions route draft changes and suppress overlapping saves or publishes → drop either saving guard or render Publish on an already published entry.
- packages/cms/src/react/posts/editor/preview/__tests__/post-editor-chrome.guard.unit.test.tsx:view tabs activate preview, expose its width control and forward the selected template → ignore a tab click or always render the width picker.
- packages/cms/src/react/posts/editor/notices/__tests__/PostEditorNotices.unit.test.tsx:a conflict hides competing prompts and its choices route to the correct recovery operations → allow conflicting outside notice while the conflict persists or drop one of the two dismiss callbacks.
- packages/cms/src/react/posts/__tests__/PostCoverImage.test.tsx:the cover preview falls back on load errors, opens a picker, and clears the selected asset → unwire onError, drop the picker accept filter, discard onSelect, or make Remove leave the selected id in place.
- packages/cms/src/react/posts/__tests__/PostCoverImage.test.tsx:the document cover slot on a page has no post body-hide toggle → always render the post’s hide-in-body checkbox for doc-format pages.
- packages/cms/src/react/publish-content/api/__tests__/publish-content-client.ceremony.unit.test.ts:peer listing uses the workspace collection and returns the destination metadata without writing → send this collection read to the connect destination or add a write request init.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:bound dialog swaps plan for a fresh confirm control and routes native close through the active hook → reuse the planning button key, ignore the caller's hook override, or call onCancel directly on a dialog-close event.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:report shows partial selection, notices and outcome-specific rows and reveals up-to-date entries on request → remove an indeterminate property write, render a skipped row as selectable, or keep unchanged rows permanently hidden.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:row notes and retirement tooltips distinguish absent data from actionable reasons → show a retirement tooltip without a target or always prioritize the fallback reason.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:discovery errors stay visible and never become connection offers → turn a failed peer-list read into an empty successful result, or suppress destination-read error copy.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:a missing site or failed connect leaves planning untouched and a later successful connect can proceed → assume a non-null connect response or fail to release connecting state on an error.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:a late connection response after unmount never starts planning for its newly connected site → remove the connection live guard before requestPlan; the abandoned connection would start a plan.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:a failed plan can be retried, and an older live site warns only about conflicts it cannot overwrite → keep a failed plan non-retriable or return no overwrite explanation for older peers.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:bulk and per-row selection update both the checked rows and the dependencies they carry → always add a row to deselected keys or leave carried media selected when all parents are unchecked.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:criteria report an overwrite only after its replan and bulk untick restores the reviewed base → call onPlanned while the criteria replan is pending, or ignore the toggle-all overwrite action.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:an overwrite replan failure is shown and clears the pending state for a fresh review → swallow the replan rejection instead of transitioning to a retryable failure.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:a narrowed plan with different writes replaces the review without confirming unseen rows → treat PublishPlanDriftError like a generic failure rather than showing the replacement plan.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:a narrowed plan with an explicit refusal goes back to review without a confirmation token → remove the canConfirmPlan check from confirmPreparedPlan.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:a rejected confirmation does not execute and a rejected execution does not look completed → swallow confirmation or execute errors or allow close before a committed result is known.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:completion uses actual outcomes rather than change-set counts for legacy → drop the legacy change-set count fallback.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:completion uses actual outcomes rather than change-set counts for one applied and one skipped → ignore skip counts or use the change-set count instead of the actual report.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:completion uses actual outcomes rather than change-set counts for everything skipped → remove the zero-published message or use the change-set count.
- packages/cms/src/react/posts/hooks/__tests__/use-post-url-dialog.hooks.unit.test.tsx:link actions remove an existing mark or insert one valid URL, and reject malformed hosts → drop the URL-parser catch or always open a dialog rather than remove an active link mark.
- packages/cms/src/react/posts/hooks/__tests__/use-post-url-dialog.hooks.unit.test.tsx:image submit forwards authored alt text as well as its URL → drop alt from the setImage command.
- packages/cms/src/react/widgets/WidgetConfigFields/__tests__/WidgetConfigFields.collection-field-contract.unit.test.tsx:text edits retain sibling config and publish a handle only when requested → replace the config rather than spreading untouched fields on body changes.
- packages/cms/src/react/widgets/WidgetConfigFields/__tests__/WidgetConfigFields.collection-field-contract.unit.test.tsx:social controls edit the addressed row, allow adding below twenty, and stop at the limit → use a fixed row index in any edit/remove action or raise the Add-link cutoff.
- packages/cms/src/react/widgets/WidgetConfigFields/__tests__/WidgetConfigFields.collection-field-contract.unit.test.tsx:menu selection is loaded asynchronously and edits the selected reference, not its label → write an option label instead of its id or call the form port instead of menu list.
- packages/cms/src/react/widgets/WidgetConfigFields/__tests__/WidgetConfigFields.collection-field-contract.unit.test.tsx:contact-form pick reports form status and clearing its optional message does not clear the selected form → discard existing config when writing successMessage, or write a blank string instead of undefined when cleared.
- packages/cms/src/react/widgets/WidgetConfigFields/__tests__/WidgetConfigFields.collection-field-contract.unit.test.tsx:menu, form and collection fetch failures show their own error and remove the selector → render an empty selector or a loading state instead of displaying a fetch error.
- packages/cms/src/react/widgets/WidgetConfigFields/__tests__/WidgetConfigFields.collection-field-contract.unit.test.tsx:collection list renders only displayable fields and forwards each change with the correct kind → drop the configured field-kind filter, omit integer context in setFilterValue, or render columns for List layout.
- packages/cms/src/react/widgets/WidgetConfigFields/__tests__/WidgetConfigFields.collection-field-contract.unit.test.tsx:both media and legacy gallery use the bound media editor with the original config and change receiver → route the gallery case to the null fallback or pass a default config to the media editor.
- packages/cms/src/redirects/__tests__/redirects.write-boundaries.test.ts:an empty import is refused without changing an existing redirect → remove the lower-bound check on the number of rules.
- packages/cms/src/redirects/site/__tests__/publish-content.test.ts:legacy packed state without status reactivates the same disabled rule and valid misses return null → default missing packed status to existing.status instead of active, or stop looking up disabled rows.
- packages/cms/src/seo/__tests__/html-plain-text.test.ts:keeps out-of-range numeric references intact next to valid scalar boundary characters → discard an overflowing decimal reference, exclude U+10FFFF, or use open instead of closed surrogate bounds.
- packages/cms/src/seo/__tests__/seo.meta.unit.test.ts:an authored Twitter image wins over OG while a missing Twitter override inherits OG → always inherit OG for Twitter, ignoring an authored Twitter-specific image.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:replacing the discovery port ignores an earlier target-list rejection → remove the effect cancellation guard on peer-load failure.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:unticking the last overwrite suppresses a late error for the now-superseded tick → remove the isCurrentReplan guard from its rejection handler.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:confirmed execution uses the replan bundle and overwrite echo, not the original unreviewed bundle → omit overwriteEntityKeys from execute or take the bundle id from the pre-overwrite plan.
- packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx:a report with no selectable rows shows why nothing writes and disables bulk selection → let bulk selection run while there are no selectable rows or ignore the disabled state of the confirm control.
- packages/cms/src/seo/content-analysis/__tests__/content-analysis.test.ts:a missing description and empty body are described without a readability grade → treat whitespace-only descriptions as authored or show a Flesch grade for an empty report.
- packages/cms/src/seo/content-analysis/__tests__/content-analysis.test.ts:title and description status changes only at their inclusive Unicode code-point limits → count UTF-16 units or change an inclusive length cutoff to an exclusive one.
- packages/cms/src/seo/content-analysis/__tests__/content-analysis.test.ts:image advice counts both absent and blank alt fields without counting descriptive siblings → stop trimming whitespace before deciding an image has alt text.
- packages/cms/src/react/posts/editor/notices/__tests__/PostEditorNotices.unit.test.tsx:parked draft recovery shows the saved title and sends only the chosen action → omit the parked draft branch, substitute the parked timestamp for serverUpdatedAt, or swap restore and discard callbacks.
- packages/cms/src/react/widgets/WidgetPickerDialog/__tests__/WidgetPickerDialog.unit.test.tsx:closing the inline add dialog discards an unsent draft and reopening creates for the selected type → omit WidgetAddControl’s onCancel or omit its onCreateNew delegation.
- packages/cms/src/react/widgets/WidgetPickerDialog/__tests__/WidgetPickerDialog.unit.test.tsx:the pinned picker can create again after a placement refusal and its outer close invokes cancel → return null rather than selectedType for a pinned control after pickerType settles, or disconnect the outer Dialog onClose.

### Media and page editor (33 added cases)

Each row names one hypothetical production mutation and the case that should reject it. Paths below are relative to `packages/cms/src/react/`. Mutants were neither applied nor executed.

| Exact test file | Exact test title or table title and case | Source | One concrete mutation expected to make it fail |
| --- | --- | --- | --- |
| `media/__tests__/chrome-playback-note.unit.test.tsx` | shows the translated warning for an HEVC upload exactly at the unconverted size limit | `media/chrome-playback-note.tsx` | Replace `item.byteSize <= maxUploadBytes` with `item.byteSize < maxUploadBytes`. |
| `media/__tests__/chrome-playback-note.unit.test.tsx` | does not show a Chrome warning for $reason — H.264 video | `media/chrome-playback-note.tsx` | Remove `item.videoCodec === "hevc" &&` from the predicate. |
| `media/__tests__/chrome-playback-note.unit.test.tsx` | does not show a Chrome warning for $reason — HEVC video above the conversion threshold | `media/chrome-playback-note.tsx` | Replace the size comparison with `item.byteSize >= maxUploadBytes`. |
| `media/__tests__/chrome-playback-note.unit.test.tsx` | does not show a Chrome warning for $reason — HEVC video with an unknown byte size | `media/chrome-playback-note.tsx` | Replace the predicate's numeric guard and comparison with `(item.byteSize ?? 0) <= maxUploadBytes`. |
| `media/__tests__/media-grid-cursor.unit.test.tsx` | skips a deep-link lookup for a loaded asset and fetches a different asset by its exact ID | `media/hooks/use-grid-pages.hooks.ts` | Replace the membership result `items.some(...)` in `isLoaded` with `return false`. |
| `media/__tests__/media-grid-cursor.unit.test.tsx` | keeps loaded rows after '$message' and retries the same cursor — cursor temporarily unavailable | `media/hooks/use-grid-pages.hooks.ts` | In the load-more catch, save `cursor: null` instead of `cursor`. |
| `media/__tests__/media-grid-cursor.unit.test.tsx` | keeps loaded rows after '$message' and retries the same cursor — more media could not be loaded | `media/hooks/use-grid-pages.hooks.ts` | Replace `new Error("more media could not be loaded")` with `new Error(String(failure))`. |
| `media/__tests__/media-icons.unit.test.tsx` | draws distinct decorative media glyphs without adding accessible names to their controls | `media/media-icons.tsx` | Remove `aria-hidden="true"` from the Eye icon's SVG. |
| `media/__tests__/use-media-provider-catalog.unit.test.tsx` | exposes the host catalog unchanged and does not refetch on a normal render | `media/use-media-provider-catalog.hooks.ts` | Replace `setCatalog(next)` with `setCatalog(next === null ? null : [...next].reverse())`. |
| `media/__tests__/use-media-provider-catalog.unit.test.tsx` | does not let a superseded host reply replace the current host's catalog | `media/use-media-provider-catalog.hooks.ts` | Remove the `if (current)` guard before `setCatalog(next)`. |
| `media/__tests__/use-media-provider-catalog.unit.test.tsx` | distinguishes an empty host catalog from an unavailable one | `media/use-media-provider-catalog.hooks.ts` | Replace `if (current)` with `if (current && next !== null)`. |
| `media/__tests__/use-media-writes.unit.test.tsx` | uploads the supplied bytes and alt text, then refreshes the active grid | `media/hooks/use-media-writes.hooks.ts` | Remove `invalidates: [KEYS.list]` from the upload mutation options. |
| `media/__tests__/use-media-writes.unit.test.tsx` | reports a failed trash request without dropping the active row, then moves it on retry | `media/hooks/use-media-writes.hooks.ts` | Remove the trash mutation's `{ invalidates: [KEYS.list] }` argument. |
| `media/__tests__/use-media-writes.unit.test.tsx` | clears only other write errors, then treats a refused restore as a localized error before a retry | `media/hooks/use-media-writes.hooks.ts` | Remove `if (!restored) throw new Error(restoreFallback)`. |
| `media/__tests__/use-media-writes.unit.test.tsx` | requires a purge target and closes the confirmation without removing the row on failure | `media/hooks/use-media-writes.hooks.ts` | Remove the `setPendingPurge(...)` call in `purge`'s `finally`. |
| `media/__tests__/use-media-writes.unit.test.tsx` | keeps the purge row busy when a different in-flight $action finishes first — trash | `media/hooks/use-media-writes.hooks.ts` | Replace the guarded trash `finally` update with `setRowSavingId(null)`. |
| `media/__tests__/use-media-writes.unit.test.tsx` | keeps the purge row busy when a different in-flight $action finishes first — restore | `media/hooks/use-media-writes.hooks.ts` | Replace the guarded restore `finally` update with `setRowSavingId(null)`. |
| `pages/hooks/__tests__/page-editor-save.expected-version.unit.test.ts` | settles the saved metadata and HTML with the returned row's canonical slug and status | `pages/hooks/page-editor-save.ts` | Remove `if (canSaveHtml) setters.setSavedHtml(form.html)`. |
| `pages/hooks/__tests__/page-editor-save.expected-version.unit.test.ts` | reports a same-version save as unchanged and does not mark an unwritable body saved | `pages/hooks/page-editor-save.ts` | Change `updated.version === form.basisVersion` to `updated.version !== form.basisVersion`. |
| `pages/hooks/__tests__/page-editor-save.expected-version.unit.test.ts` | acknowledges the explicit publish action even if the server returns the same version | `pages/hooks/page-editor-save.ts` | Remove `form.nextStatus === undefined &&` from the `unchanged` condition. |
| `pages/hooks/__tests__/page-editor-save.partial.unit.test.ts` | routes a version conflict to the conflict action, not the generic error | `pages/hooks/page-editor-save.ts` | Remove `setters.setSaveConflict(conflict)` from the conflict arm. |
| `pages/hooks/__tests__/page-editor-save.partial.unit.test.ts` | does not repeat server failure details already shown by the shared failure notice | `pages/hooks/page-editor-save.ts` | Remove the `isUnexpectedServerFailure` arm so the raw error falls through. |
| `pages/hooks/__tests__/page-editor-save.partial.unit.test.ts` | shows a useful local save error for $reason — a normal Error | `pages/hooks/page-editor-save.ts` | Replace the `e instanceof Error ? e.message` arm with `e instanceof Error ? t({ locale, key: "failed to save page" })`. |
| `pages/hooks/__tests__/page-editor-save.partial.unit.test.ts` | shows a useful local save error for $reason — a thrown string | `pages/hooks/page-editor-save.ts` | Remove the `typeof e === "string" ? e :` bypass around JSON serialization. |
| `pages/hooks/__tests__/page-editor-save.partial.unit.test.ts` | shows a useful local save error for $reason — a thrown object | `pages/hooks/page-editor-save.ts` | Replace `JSON.stringify(e) ?? String(e)` with `String(e)`. |
| `pages/hooks/__tests__/page-editor-save.partial.unit.test.ts` | shows a useful local save error for $reason — a circular thrown object | `pages/hooks/page-editor-save.ts` | Replace `catch { text = String(e); }` with `catch { text = "unknown"; }`. |
| `pages/hooks/__tests__/page-editor-save.partial.unit.test.ts` | shows a useful local save error for $reason — an unjsonable symbol | `pages/hooks/page-editor-save.ts` | Replace `JSON.stringify(e) ?? String(e)` with `JSON.stringify(e) ?? ""`. |
| `pages/hooks/__tests__/page-editor-save.partial.unit.test.ts` | shows a useful local save error for $reason — nothing thrown | `pages/hooks/page-editor-save.ts` | Drop `e === undefined \|\|` from the `return base` check. |
| `pages/hooks/__tests__/page-editor-save.partial.unit.test.ts` | shows a useful local save error for $reason — null thrown | `pages/hooks/page-editor-save.ts` | Drop `\|\| e === null` from the `return base` check. |
| `pages/hooks/__tests__/page-editor-save.partial.unit.test.ts` | shows a useful local save error for $reason — an oversized refusal | `pages/hooks/page-editor-save.ts` | Replace the final `text.length > 300` truncation expression with `text`. |
| `pages/__tests__/PageEditor.preview-youtube.unit.test.tsx` | inspects $choice with the preview's exact template and pending HTML — default template | `pages/hooks/use-preview-embed-ids.hooks.ts` | Change the `pendingHtml === null` arm of the inspection POST body from `{}` to `{ bodyHtml: pendingHtml }`. |
| `pages/__tests__/PageEditor.preview-youtube.unit.test.tsx` | inspects $choice with the preview's exact template and pending HTML — explicit bare template | `pages/hooks/use-preview-embed-ids.hooks.ts` | Replace `pendingHtml === null ? {} : { bodyHtml: pendingHtml }` with `pendingHtml ? { bodyHtml: pendingHtml } : {}`. |
| `pages/__tests__/PageEditor.preview-youtube.unit.test.tsx` | inspects $choice with the preview's exact template and pending HTML — named template | `pages/hooks/use-preview-embed-ids.hooks.ts` | Remove `encodeURIComponent` around `templateChoice` in the query string. |

### Widgets (50 added cases)

Paths in this table are relative to `packages/cms/src/react/widgets/`. Each row names a hypothetical source mutation. None were applied or executed.

| Exact test file | Exact test title or table title and case | Source | One concrete mutation expected to make it fail |
| --- | --- | --- | --- |
| `WidgetPickerDialog/__tests__/WidgetPickerDialog.unit.test.tsx` | requires an explicit choice before reusing a loaded widget and offers creation alongside it | `WidgetPickerDialog/WidgetPickerDialog.hooks.tsx` | Change the no-selection guard to `if (!selectedExistingId && !instances?.length)`. |
| `WidgetPickerDialog/__tests__/WidgetPickerDialog.unit.test.tsx` | focuses the title only after an empty result, rejects whitespace, and submits a trimmed title with edited config | `WidgetPickerDialog/WidgetPickerDialog.hooks.tsx` | Pass `newTitle` instead of `newTitle.trim()` to `props.onCreateNew`. |
| `WidgetPickerDialog/__tests__/WidgetPickerDialog.unit.test.tsx` | shows an existing-widget fetch refusal without removing the create and cancel controls | `WidgetPickerDialog/WidgetPickerDialog.tsx` | Remove the conditional render of `loadError` inside the picker body. |
| `WidgetPickerDialog/__tests__/WidgetPickerDialog.unit.test.tsx` | opens the selected type from the inline add control, clears a placement error on reopen, and retries reuse | `WidgetPickerDialog/WidgetPickerDialog.hooks.tsx` | Remove `setError(null)` from `setPickerType`. |
| `WidgetPickerDialog/__tests__/WidgetPickerDialog.unit.test.tsx` | keeps a single dialog during type changes and recovers a created widget after failed placement | `WidgetPickerDialog/WidgetPickerDialog.tsx` | Key the nested picker only by `vm.selectedType`, omitting its draft/settled distinction. |
| `WidgetPickerDialog/__tests__/WidgetPickerDialog.unit.test.tsx` | keeps a creation refusal in the dialog and retries the same unsaved draft through the create port | `WidgetPickerDialog/WidgetPickerDialog.hooks.tsx` | Replace the create-error catch's `setError(...)` with `setPickerType({ next: null })`. |
| `WidgetPickerDialog/__tests__/WidgetPickerDialog.unit.test.tsx` | does not create a widget when a stale submit reaches a closed unpinned add control | `WidgetPickerDialog/WidgetPickerDialog.hooks.tsx` | Replace the `pickerType` fallback with `selectedType` even for an unpinned control. |
| `EmbedInsertControl/__tests__/EmbedInsertControl.subtype-and-placement.unit.test.tsx` | the Embed toggle owns menu visibility and choosing Media closes the menu | `EmbedInsertControl/EmbedInsertControl.tsx` | Remove `setOpen(false)` from `onPickMedia`. |
| `EmbedInsertControl/__tests__/EmbedInsertControl.subtype-and-placement.unit.test.tsx` | the generic widget picker focuses the persistent opener and closes on cancel or successful placement | `EmbedInsertControl/EmbedInsertControl.tsx` | Remove `triggerRef.current?.focus()` from `onEnterWidgetMode`. |
| `EmbedInsertControl/__tests__/EmbedInsertControl.subtype-and-placement.unit.test.tsx` | a shortcut forwards its subtype and submission, and reports refused placement outside the closed picker | `EmbedInsertControl/EmbedInsertControl.tsx` | Change the error slot condition from `error` to `pickerType && error`. |
| `EmbedInsertControl/__tests__/EmbedInsertControl.subtype-and-placement.unit.test.tsx` | the pinned Menu allows reuse and cancellation without adding agent markup when untagged | `EmbedInsertControl/EmbedInsertControl.tsx` | Remove `menuControl.setPickerType({ next: null })` from the Menu shortcut cancel callback. |
| `EmbedInsertControl/__tests__/EmbedInsertControl.subtype-and-placement.unit.test.tsx` | a placement request after the editor has detached does not mint a placement ID | `EmbedInsertControl/EmbedInsertControl.hooks.ts` | Move the `mintPlacementId()` call above the null-editor guard. |
| `WidgetConfigFields/__tests__/HtmlAttributeRows.refused-attributes.unit.test.tsx` | adds an agent-addressable blank row and removes it using a localized positional label | `WidgetConfigFields/HtmlAttributeRows.tsx` | Remove `onClick={vm.addRow}` from the add button. |
| `WidgetConfigFields/__tests__/HtmlAttributeRows.refused-attributes.unit.test.tsx` | keeps edited attribute value whitespace while updating only the named row | `WidgetConfigFields/HtmlAttributeRows.tsx` | Pass `event.target.value.trim()` rather than `event.target.value` on value edits. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | migrates legacy image IDs to slugs while keeping unresolved rows and authored text | `WidgetConfigFields/media-content-rules.ts` | Always pass `image.mediaId` as the synthesized row slug. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | keeps a legacy row's ID until its library becomes available | `WidgetConfigFields/media-content-rules.ts` | Return `[]` immediately for `required.library === null`. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | clamps a real move to the destination boundary without overwriting an item's overrides | `WidgetConfigFields/media-content-rules.ts` | Reject destinations outside the original array bounds instead of clamping them. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | leaves the same array when moving $label — below zero | `WidgetConfigFields/media-content-rules.ts` | Remove the `from < 0` guard, allowing `splice(-1, 1)`. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | leaves the same array when moving $label — past the end | `WidgetConfigFields/media-content-rules.ts` | Remove the `from >= items.length` guard, allowing a missing row to reach the error throw. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | leaves the same array when moving $label — already at the boundary | `WidgetConfigFields/media-content-rules.ts` | Remove the `from === to` guard, returning a new array for a no-op. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | validates $caseName before adding it — whitespace only | `WidgetConfigFields/media-content-rules.ts` | Remove the specific empty-input return, so empty input becomes invalid. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | validates $caseName before adding it — slash inside a slug | `WidgetConfigFields/media-content-rules.ts` | Remove the `isValidMediaSlug` check from `mediaSlugProblem`. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | validates $caseName before adding it — fifty items | `WidgetConfigFields/media-content-rules.ts` | Replace `required.items.length >= MAX_MEDIA_ITEMS` with `required.items.length > MAX_MEDIA_ITEMS`. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | validates $caseName before adding it — trimmed duplicate | `WidgetConfigFields/media-content-rules.ts` | Remove the duplicate-item check. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | validates $caseName before adding it — unknown slug after lookup | `WidgetConfigFields/media-content-rules.ts` | Remove the library-membership check. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | validates $caseName before adding it — unknown slug before lookup | `WidgetConfigFields/media-content-rules.ts` | Use an empty array when `required.library` is `null` and always run the membership check. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | validates $caseName before adding it — known trimmed slug | `WidgetConfigFields/media-content-rules.ts` | Use `required.slug` without calling `.trim()`. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | appends unique slugs in pick order without copying text or exceeding the 50-item limit | `WidgetConfigFields/media-content-rules.ts` | Remove `seen.add(slug)` inside the loop, allowing a repeated pick to fill the remaining slot. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | classifies $contentType and generates slug-based HTML — image/png | `WidgetConfigFields/media-content-rules.ts` | Remove quote escaping from image `alt` values. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | classifies $contentType and generates slug-based HTML — video/webm | `WidgetConfigFields/media-content-rules.ts` | Remove the `kind === "video"` markup arm. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | classifies $contentType and generates slug-based HTML — audio/mpeg | `WidgetConfigFields/media-content-rules.ts` | Remove the `kind === "audio"` markup arm. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | classifies $contentType and generates slug-based HTML — application/pdf | `WidgetConfigFields/media-content-rules.ts` | Change the final return in `mediaKindOf` from `"unknown"` to `"image"`. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | classifies $contentType and generates slug-based HTML — null | `WidgetConfigFields/media-content-rules.ts` | Change the falsy-content-type guard's result from `"unknown"` to `"image"`. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | returns replacement text and the trailing caret for $label — selected text | `WidgetConfigFields/media-content-rules.ts` | Return `caret: start` instead of advancing by the inserted length. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | returns replacement text and the trailing caret for $label — a selection outside both edges | `WidgetConfigFields/media-content-rules.ts` | Remove the lower clamp of `start` to 0. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | returns replacement text and the trailing caret for $label — a negative-width selection | `WidgetConfigFields/media-content-rules.ts` | Remove the lower clamp of `end` to `start`. |
| `WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | returns replacement text and the trailing caret for $label — a position beyond the end | `WidgetConfigFields/media-content-rules.ts` | Remove the upper clamp of `start` to `text.length`. |
| `WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | starts with an empty Single layout and clamps or clears columns in Grid | `WidgetConfigFields/MediaContentEditor.hooks.ts` | Remove `Math.min(6, columns)` when calculating the finite column count. |
| `WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | shows the $reason slug refusal without changing saved items — empty | `WidgetConfigFields/MediaContentEditor.tsx` | Change the empty-slug hint to the invalid-slug hint. |
| `WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | shows the $reason slug refusal without changing saved items — invalid | `WidgetConfigFields/MediaContentEditor.tsx` | Remove the `problem === "invalid"` branch so it falls through to the unknown-slug hint. |
| `WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | shows the $reason slug refusal without changing saved items — duplicate | `WidgetConfigFields/MediaContentEditor.tsx` | Remove the `problem === "duplicate"` branch so it falls through to the unknown-slug hint. |
| `WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | shows the $reason slug refusal without changing saved items — unknown | `WidgetConfigFields/MediaContentEditor.tsx` | Remove the slug interpolation from the unknown-slug hint and show just `"No media found."`. |
| `WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | adds a trimmed slug by keyboard, shows the library fallback text, and reorders the stored rows | `WidgetConfigFields/MediaContentEditor.hooks.ts` | Pass `slugDraft` directly as the appended slug instead of the trimmed `slug`. |
| `WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | preserves both drafts during editing and warns when saving Raw HTML will drop structured content | `WidgetConfigFields/MediaContentEditor.tsx` | Remove the `vm.inactiveHasContent` notice. |
| `WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | warns and marks only Raw HTML over the size limit as invalid | `WidgetConfigFields/MediaContentEditor.hooks.ts` | Replace `state.html.length > MAX_MEDIA_HTML_LENGTH` with `>=`. |
| `WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | renders the library loading and populated states, discards cancelled checks, and appends media in selection order | `WidgetConfigFields/MediaContentEditor.hooks.ts` | Remove `setPicked([])` when `openPicker` runs. |
| `WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | inserts selected audio and image snippets at the Raw HTML selection and restores focus and caret | `WidgetConfigFields/MediaContentEditor.hooks.ts` | Remove `htmlRef.current.setSelectionRange(...)` from the post-insert effect. |
| `WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | appends at the end when no textarea is attached and skips a selected asset that left the library | `WidgetConfigFields/MediaContentEditor.hooks.ts` | Change the missing-textarea fallback for `start` from `state.html.length` to `0`. |
| `WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | disables both adding methods at the 50-item limit without changing the stored rows | `WidgetConfigFields/MediaContentEditor.tsx` | Change `vm.rows.length >= vm.maxItems` to `vm.rows.length > vm.maxItems`. |
| `WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | does not emit a configuration write for a move already at an editor boundary | `WidgetConfigFields/MediaContentEditor.hooks.ts` | Remove the `next !== state.media.items` guard before `setItems`. |

### Added cases per test file

| Test file | Added cases |
| --- | ---: |
| `packages/cms/src/react/media/__tests__/chrome-playback-note.unit.test.tsx` | 4 |
| `packages/cms/src/react/media/__tests__/media-grid-cursor.unit.test.tsx` | 3 |
| `packages/cms/src/react/media/__tests__/media-icons.unit.test.tsx` | 1 |
| `packages/cms/src/react/media/__tests__/use-media-provider-catalog.unit.test.tsx` | 3 |
| `packages/cms/src/react/media/__tests__/use-media-writes.unit.test.tsx` | 6 |
| `packages/cms/src/react/pages/__tests__/PageEditor.preview-youtube.unit.test.tsx` | 3 |
| `packages/cms/src/react/pages/hooks/__tests__/page-editor-save.expected-version.unit.test.ts` | 3 |
| `packages/cms/src/react/pages/hooks/__tests__/page-editor-save.partial.unit.test.ts` | 10 |
| `packages/cms/src/react/posts/__tests__/PostCoverImage.test.tsx` | 2 |
| `packages/cms/src/react/posts/__tests__/post-editor-list-rules.unit.test.ts` | 7 |
| `packages/cms/src/react/posts/__tests__/use-post-featured-image.test.tsx` | 1 |
| `packages/cms/src/react/posts/__tests__/y5-post-editor-input.test.ts` | 4 |
| `packages/cms/src/react/posts/editor/notices/__tests__/PostEditorNotices.unit.test.tsx` | 2 |
| `packages/cms/src/react/posts/editor/preview/__tests__/post-editor-chrome.guard.unit.test.tsx` | 4 |
| `packages/cms/src/react/posts/hooks/__tests__/post-editor-messages.unit.test.ts` | 3 |
| `packages/cms/src/react/posts/hooks/__tests__/post-editor-save.rules.unit.test.ts` | 3 |
| `packages/cms/src/react/posts/hooks/__tests__/post-editor-state.rules.unit.test.ts` | 4 |
| `packages/cms/src/react/posts/hooks/__tests__/use-post-url-dialog.hooks.unit.test.tsx` | 2 |
| `packages/cms/src/react/publish-content/__tests__/y5-publish-ceremony.test.tsx` | 20 |
| `packages/cms/src/react/publish-content/api/__tests__/publish-content-client.ceremony.unit.test.ts` | 1 |
| `packages/cms/src/react/widgets/EmbedInsertControl/__tests__/EmbedInsertControl.subtype-and-placement.unit.test.tsx` | 5 |
| `packages/cms/src/react/widgets/WidgetConfigFields/__tests__/HtmlAttributeRows.refused-attributes.unit.test.tsx` | 2 |
| `packages/cms/src/react/widgets/WidgetConfigFields/__tests__/MediaContentEditor.behavior.unit.test.tsx` | 13 |
| `packages/cms/src/react/widgets/WidgetConfigFields/__tests__/WidgetConfigFields.collection-field-contract.unit.test.tsx` | 7 |
| `packages/cms/src/react/widgets/WidgetConfigFields/__tests__/media-content-rules.unit.test.ts` | 23 |
| `packages/cms/src/react/widgets/WidgetPickerDialog/__tests__/WidgetPickerDialog.unit.test.tsx` | 9 |
| `packages/cms/src/redirects/__tests__/redirects.write-boundaries.test.ts` | 1 |
| `packages/cms/src/redirects/__tests__/tool-registrations.test.ts` | 1 |
| `packages/cms/src/redirects/site/__tests__/publish-content.test.ts` | 1 |
| `packages/cms/src/seo/__tests__/feed.test.ts` | 1 |
| `packages/cms/src/seo/__tests__/html-plain-text.test.ts` | 1 |
| `packages/cms/src/seo/__tests__/seo.meta.unit.test.ts` | 1 |
| `packages/cms/src/seo/__tests__/share-image.unit.test.ts` | 9 |
| `packages/cms/src/seo/content-analysis/__tests__/content-analysis.test.ts` | 8 |
| `packages/cms/src/seo/content-analyzer-plugin/__tests__/patch.test.ts` | 1 |
| `packages/cms/src/seo/site/__tests__/settings.unit.test.ts` | 2 |
| `packages/cms/src/seo/site/__tests__/tool-registrations.unit.test.ts` | 1 |

### Unverified coverage and narrow exception candidates

- `packages/cms/src/react/media/index.ts:1–2` is a pure re-export barrel. No import-only test.
- `packages/cms/src/react/widgets/WidgetConfigFields/WidgetConfigFields.tsx:414` is the default after all members of the closed widget-type union.
- `packages/cms/src/react/widgets/WidgetPickerDialog/WidgetPickerDialog.tsx:102` requires inconsistent controller state. The real hook derives hasExisting from that same instances list.
- `packages/cms/src/react/widgets/WidgetConfigFields/media-content-rules.ts:238` requires an undefined slot in a normalized, dense list. Reorder boundary behavior is tested.
- `packages/cms/src/react/widgets/WidgetConfigFields/MediaContentEditor.tsx:50` is the full-slug hint, which is not reachable by submitting through disabled controls at the limit. The capacity rule and disabled behavior are tested.
- `packages/cms/src/seo/html-plain-text.ts:31` cannot receive a negative code point through the unsigned numeric-entity grammar. Overflow and scalar boundaries are tested.

The test suite, TypeScript diagnostics and branch coverage remain for the authorized cloud run. No coverage configuration, thresholds, existing assertions or production sources were changed.

### Bugs from source inspection

- `packages/cms/src/seo/site/page-head-contributor.ts:36` suppresses schema image metadata on URL equality, even when the same URL is explicitly authored. Check whether the winning OG image was a transient body fallback before suppressing JSON-LD.
- `packages/cms/src/seo/cover-image.ts:58` inserts a body-derived URL as a normal OG override. `packages/cms/src/seo/seo.ts:194` then inherits that override for Twitter, against the OG-only body-cover contract. Carry the fallback separately or attach provenance so normal Twitter precedence remains intact.

Both regressions have intentionally retained tests that are expected to be red by inspection.
