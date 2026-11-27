# CMS gap-fill mutation plan

Source-reviewed only. No tests, typechecks, builds, coverage, or mutations were run.
Paths in the test ledger are relative to `packages/cms/src/`.

## Posts

- posts/__tests__/y5-post-bindings.test.ts: soft delete keeps the slug and updates only the scoped row's trash metadata → remove the workspace predicate in softDelete.
- posts/__tests__/y5-post-bindings.test.ts: hard delete drops the scoped post, autosave and revisions without touching another workspace → remove revision filtering in hardDelete, or remove the autosave deletion in clearAutosave.
- posts/__tests__/y5-post-bindings.test.ts: HTML listing filters format, trash, kind and site before using the date and id cursor → remove the date portion of the cursor predicate, or omit the body HTML null guard.
- posts/__tests__/revision-thinning.test.ts: keeps the oldest unconfirmed revision and does not jump forward to confirmed history → remove the !confirmed.has(id) disjunct.
- posts/__tests__/revision-thinning.test.ts: fails closed when a protection lookup rejects, and keeps the valid preview on unconfirmed apply → let firstProtection continue on rejection.
- posts/__tests__/search.test.ts: indexes adjacent text runs together and separates blocks even inside unknown nodes → insert a space after each text run, or remove the depth guard.
- posts/__tests__/search.test.ts: limits indexed doc text across block separators and ignores remaining text → remove the final slice so the block separator puts the result over budget.
- posts/__tests__/search.test.ts: HTML rows index visible HTML rather than stale document text → extract bodyJson even for bodyFormat html.
- posts/__tests__/search.test.ts: normalizes Unicode and sends exact admin filters and a floored bounded limit to the ranker → drop NFC normalization or replace Math.floor with Math.ceil.
- posts/__tests__/search.test.ts: distinguishes punctuation-only queries and nonfinite limits before calling the ranker → forward either invalid input to the ranker.
- posts/sql/__tests__/search-index.test.ts: SQLite FTS ranks, filters live rows, and reflects projection upsert and removal → drop the workspace WHERE predicate or take the minus sign off bm25.
- posts/sql/__tests__/search-index.test.ts: Postgres vectors rank, filter live rows, and reflect projection upsert and removal → write the title/body with swapped weight labels, or skip the vector assignment on conflict.
- posts/sql/__tests__/search-index.test.ts: boot repairs stale and malformed projections in batches before filling warm-site gaps → stop after the first page, or skip writing the projection-version marker.
- posts/sql/__tests__/search-index.test.ts: search waits until the boot projection is ready → delete await this.ready from PostSearchIndex.search.
- posts/sql/__tests__/search-index.test.ts: search hit projection normalizes the driver's score and renames the timestamp → return row.score uncoerced.
- posts/sql/__tests__/y5-post-repo.test.ts: SQL list and slug lookup keep a soft-deleted row scoped and reserve its address → add a deleted_at-is-null clause to findBySlug, or omit workspace scoping in list.
- posts/sql/__tests__/y5-post-repo.test.ts: SQL hard delete removes only the scoped row, revision history and search projection → always remove the projection even when the scoped delete returns zero hits, or remove the workspace condition in clearAutosave.
- posts/sql/__tests__/y5-post-repo.test.ts: SQL repo caller transaction rolls back prior post and revision writes when a later step fails → call fn directly instead of executing it through the kernel transaction.
- posts/sql/__tests__/revision-refs.test.ts: undo references keep only matching workspace, entity and before-or-after revision identities → drop the after_revision_id predicate, or drop workspace scoping.
- posts/sql/__tests__/revision-refs.test.ts: legacy snapshots default to post, and thinning stops at an equal-cutoff snapshot → change the legacy kind fallback to page, or change the date predicate to <=.

## Presentation and HTTP

- presentation/__tests__/page-head.test.ts: typed and untyped alternate links keep separate keys while repeated untyped links dedupe → ignore MIME type when deduplicating alternate links.
- public-http/http/site/__tests__/bare-page.test.ts: threads resolved document data through and wraps the rendered fragment in a bare shell → pass the empty transform map even when the caller resolved transforms, or drop host body assets.
- public-http/http/site/__tests__/bare-page.test.ts: treats a missing HTML body as an empty fragment and uses the supplied head title → send null rather than the empty string to the HTML renderer.
- public-http/http/site/__tests__/render.golden.characterization.test.ts: resolves live Liquid but uses the explicitly requested preview template instead when supplied → always call resolveLiquidTemplateId rather than respecting the override.
- public-http/http/site/__tests__/render.golden.characterization.test.ts: renders a Handlebars template and safely falls back for missing templates and sandbox errors → run the sandbox for undefined source or return the raw diagnostic with no fallback body.
- public-http/http/site/__tests__/render.golden.characterization.test.ts: renders a declarative block with the route context and falls back for a missing block → always render the fallback even when a declarative block resolves.

## More post and presentation cases

- posts/__tests__/reverters.test.ts: the registered update restores the exact pre-image as a new revision and resolves the current actor by version → use the last revision instead of matching the current version, or stop clearing old schedule/media keys.
- posts/__tests__/reverters.test.ts: an older update inverse preserves newer presentation fields but drops plugin data absent from the saved pre-image → carry over ext or stop falling back to the current schedule when the inverse omits the key.
- posts/__tests__/reverters.test.ts: update and delete refuse missing posts and an update without an inverse cannot change a row → remove the missing-inverse check or silently return for a missing target.
- posts/__tests__/reverters.test.ts: delete undo restores the old address only when vacant and forgets only the reverted trash entry → always return priorSlug even when held by another row, or omit forgetting the Trash index.
- posts/__tests__/reverters.test.ts: delete undo does not untrash or rewrite a row already in Trash before retirement → remove the already-trashed early return.
- posts/__tests__/reverters.test.ts: an update inverse that loses its compare-and-set reports the winning version without writing history → replace saveIfVersion with an unconditional save or report existing.version as the winner.
- posts/__tests__/post-tool-schemas.test.ts: validates the supported inline mark vocabulary and rejects invalid inline attributes → remove highlight from TIPTAP_MARK_SCHEMA's enum or let attrs accept unknown keys.
- presentation/__tests__/page-head.test.ts: Open Graph tags dedupe by property without replacing same-named non-Open-Graph metadata → use the meta namespace for OG keys, or use one shared key for all OG tags.
- public-http/routes/__tests__/plugin-contributions.test.ts: checks durable activation again after yielding to a member handler → drop the post-handler isActivated check.
- public-http/routes/__tests__/integration/plugin-contributions.auth.integration.test.ts: dispatches scoped admin, member and public requests through activation, auth and JSON parsing → move parsers before auth, authorize a plugin without entity identity, or omit the member principal from the handler input.
- posts/__tests__/publish-content.test.ts: publishes content and provenance without leaking local bookkeeping or changing legacy byline defaults → pack ext or stop omitting null author / false showAuthor.
- posts/__tests__/publish-content.test.ts: packs only live rows of the contributor kind with term ids and resolves all distinct media references → skip withTerms, remove the kind filter, or always append featured media even when the body already refers to it.
- posts/__tests__/publish-content.test.ts: precheck refuses kind changes, unusable slugs, competing holders and trashed destinations without writing → accept empty slugs, or return null for a wrong-kind existing row.
- posts/__tests__/publish-content.test.ts: apply transfers access and presentation while preserving destination-local metadata on update → omit memberAccessJson or replace destination ext with the incoming value.
- posts/__tests__/publish-content.test.ts: apply refuses mismatched kind and missing rollback wiring without touching the destination → drop the packed-kind guard or the forgetRemoved guard.
- posts/__tests__/publish-content.test.ts: a failed term sync removes a newly imported post and its revision even if term rollback also fails → omit the hard-delete branch of undoPostImport or let revert's error mask the write error.

## Site renderer
- public-http/http/site/render/__tests__/blocks.test.ts: prioritizes an explicit region and strips selector props before invoking a component → blocks.ts renderBlockSeam, replace component({ ctx, props: rest }) with component({ ctx, props }).
- public-http/http/site/render/__tests__/blocks.test.ts: renders the appropriate title and body slots and escapes unknown slot names → blocks.ts renderSlot title case, replace the post/site title conditional with ctx.siteTitle.
- public-http/http/site/render/__tests__/content-html.test.ts: renders region widgets in order, escaping the region key and text but retaining line breaks → content-html.ts renderWidgetRegion, change items.map to items.slice().reverse().map.
- public-http/http/site/render/__tests__/content-html.test.ts: converts managed document nodes to live Page markers while retaining ordinary text → content-html.ts renderDocBodyAsPageHtml, replace return with return renderDocNode({ node: bodyJson as JsonValue }); to bypass marker conversion.
- public-http/http/site/render/__tests__/entry-lists.test.ts: links product listings by slug and shows the host-formatted price on the matching detail → components/entry-lists.ts productEntryList, replace product.slug || product.id with product.id.
- public-http/http/site/render/__tests__/marketing.test.ts: renders a left-media section with escaped lists and distinct action styles → components/marketing.ts section, set side to "section--media-right".
- public-http/http/site/render/__tests__/marketing.test.ts: omits an empty announcement and gives a present link its default label → components/marketing.ts announcement, replace fallback: "Learn more" with fallback: "".
- public-http/http/site/render/__tests__/page-body.test.ts: applies the byline only to the current content marker, preferring its authored id over slug → page-body.ts refNamesEntity, replace return expression with ref.id === entity.id || ref.slug === entity.slug.
- public-http/http/site/render/__tests__/page-body.test.ts: drops missing widget occurrences but gives unresolved content a public placeholder → page-body.ts resolvePageBodyEmbed, replace missing-widget guard's return "" with return undefined.
- public-http/http/site/render/__tests__/post-body.test.ts: renders a document entry with the site's calendar day, public byline, and resolved render context → post-body.ts entryContent, replace timeZone: ctx.timeZone with timeZone: undefined.
- public-http/http/site/render/__tests__/template-render-data.test.ts: returns a versioned cover URL only when the media and public transform are available → template-render-data.ts featuredImageView, omit its conditional sha256 spread in the mediaPublicPath call.
- public-http/http/site/render/__tests__/template-render-data.test.ts: publishes the selected product price ID alongside its independently formatted current and comparison prices → template-render-data.ts siteProductRenderShape, omit conditional priceId spread.
- public-http/http/site/render/components/__tests__/layout.test.ts: only shows the escaped tagline on a non-compact header → components/layout.ts siteHeader, remove !compact && from tagline condition.
- public-http/http/site/render/components/__tests__/layout.test.ts: renders dropdown, standalone, and CTA links with their own labels and destinations → components/layout.ts siteNav, use rawHref: o.href instead of rawHref: co.href in the child nav link.
- public-http/http/site/render/components/__tests__/layout.test.ts: renders rich footer columns and custom legal copy without a theme badge on a themeless site → components/layout.ts siteFooterRich, set legal initializer to brand.
- public-http/http/site/render/doc/__tests__/doc-host-injection.test.ts: renders inert task checkboxes and nested document content without dropping structural nodes → doc/doc-nodes.ts renderDocTaskItem, remove disabled from the checkbox HTML.
- public-http/http/site/render/doc/__tests__/doc-host-injection.test.ts: inherits a managed image's asset attributes when the media node overrides only its class → doc/media-ref.ts mediaNodeStyleOverride, replace nodeValue ? nodeValue : assetValue with nodeValue ?? assetValue.
- public-http/http/site/render/doc/__tests__/doc-host-injection.test.ts: shows a managed image placeholder instead of falling back to an editor preview URL → doc/nodes-media.ts renderDocImage, remove the if (attrs.assetId) return mediaPlaceholder(...) line.
- public-http/http/site/render/widgets/__tests__/widget-host-injection.test.ts: passes opted-out controls and normalized marker attributes to the original audio renderer → widgets/media.ts normalizeMediaDimensions, set controls: true.
- public-http/http/site/render/widgets/__tests__/widget-host-injection.test.ts: falls back without emitting a tag when an image transform version is not numeric → widgets/media.ts renderWidgetMediaImage, replace its invalid transform/version placeholder return with return "".
- public-http/http/site/render/widgets/__tests__/widget-host-injection.test.ts: adapts legacy URL and managed gallery images to their respective renderers → widgets/media.ts renderGalleryImage, set galleryResponsive: false.
- public-http/http/site/render/widgets/__tests__/widget-host-injection.test.ts: rebuilds document resolution maps and uses an aligned authored title instead of the old title → widgets/post-content.ts renderWidgetPostContent, pass inlineResolved: EMPTY_INLINE_RESOLVED to the body renderer rather than inlineWidgets.
- public-http/http/site/render/widgets/__tests__/widget-host-injection.test.ts: renders only the document body when the post-content header is explicitly disabled → widgets/post-content.ts renderWidgetPostContent, set showHeader = true.
- public-http/http/site/render/widgets/__tests__/widget-host-injection.test.ts: forwards normalized FAQ fields and layout to the host card renderer and renders its empty fallback → widgets/social-entries.ts renderWidgetRecentEntries, omit ...structuredData from host.renderEntryList call.
- public-http/http/site/render/widgets/__tests__/widget-host-injection.test.ts: stamps authored HTML form fields and allocates a distinct ID prefix for each occurrence → contact-form-widget.ts renderHtmlMode, omit ...formSchemaOptions({ props }) in HTML form options.

## Post tool registrations
- posts/__tests__/tool-registrations.test.ts: registered search authorizes the workspace and returns only ranked summaries → remove the permission gate in content_post_search or drop its kind filter.
- posts/__tests__/tool-registrations.test.ts: registered get enforces page kind while the default get exposes the actual article body and admin link → remove the explicit page-kind check.
- posts/__tests__/tool-registrations.test.ts: registered listing filters before the cap and supports compact, body and explicit field projections → slice allPosts before filtering or let includeBody override explicit fields.
- posts/__tests__/tool-registrations.test.ts: registered create persists agent attribution, normalized byline and an audited first revision → omit creatorKind or revision delegation in executePostToolCreate.
- posts/__tests__/tool-registrations.test.ts: partial update merges against a guarded version and saves a template pre-image for undo → omit the promotion of the captured version to basisVersion for partial patches.
- posts/__tests__/tool-registrations.test.ts: full updates without an expected version keep last-write-wins and failed schema or HTML edits write nothing → apply basis-version promotion to full updates, or omit the HTML body guard.
- posts/__tests__/tool-registrations.test.ts: registered delete parks the scoped row, records its inverse, and rejects a second deletion → let delete omit expected version / assistant attribution, or record an empty delete inverse.
- posts/__tests__/tool-registrations.test.ts: failed audit writes compensate create, update and delete without leaving an unaudited edit or trash marker → replace any of the three rollback functions with a no-op.

## Middleware, forms and member routes

- public-http/middleware/__tests__/canonical-site-host.unit.test.ts: the bare alias preserves a www canonical port, while IP and localhost aliases never redirect → remove the www-prefix removal or remove the isIP exclusion.
- public-http/middleware/__tests__/theme-static-assets.unit.test.ts: malformed request revisions are rejected before consulting the trusted preview cache → remove the revision format guard.
- public-http/http/site/__tests__/form-validation-i18n.unit.test.ts: translated copy preserves the source locale's exact placeholders and every phrase is nonempty → duplicate {label}, remove {max}, or blank any locale's fallback field label.
- public-http/http/site/__tests__/form-label-inspection.unit.test.ts: an unmatched explicit label falls back to nested wrapping text and empty aria is not an override → skip wrappingLabel for controls with an id, or treat an empty aria label as present.
- public-http/routes/members/__tests__/oidc.test.ts: callback outcome forwards the bound email continuation without issuing a session → map the email-verification-required outcome to a signed-in outcome.
- public-http/routes/members/__tests__/oidc-verify-email.test.ts: proof verification that needs another step cannot produce a session outcome → synthesize a signed-in outcome even when the verification requests another step.
- public-http/routes/members/__tests__/unlink-identity.test.ts: does not resolve a session or charge limits when unlink receives a nonempty body → remove the empty-object validation before reading the member session.
- public-http/routes/members/__tests__/complete-sign-in.test.ts: completes a valid link when the host has no user-agent without inventing a value → default userAgent to an empty string.
- public-http/routes/publish-trust/__tests__/handshake.test.ts: rejects malformed response fields independently even when the other fields match the contract → remove the source-installation id type guard (or any other individual field type guard).
- public-http/routes/members/__tests__/oidc.test.ts: OIDC preflight commits headers and observation before checking and returns the admitted handler result → stop returning the result of required.run or move the admission check ahead of headers.
- public-http/routes/members/__tests__/oidc.test.ts: OIDC limiter replies with JSON and the decided cookies even without custom limit headers → drop the set-cookie append loop in memberOidcLimitResponse.
- public-http/routes/members/__tests__/complete-sign-in.test.ts: reports the longest denied member limit while using normalized email and exact identity keys → report Math.min of the denied waits or send the raw email string to the limiter.
- posts/sql/__tests__/y5-post-repo.test.ts: legacy HTML SQL rows carry a doc placeholder without losing explicit presentation or plugin fields → use the nullable body_json value directly or collapse false theme precedence to null.
- posts/__tests__/y5-post-bindings.test.ts: revision history reads in version order and keeps recorded restore and delegation fields → return append order or drop restoredFrom from the saved row.
- posts/__tests__/publish-content.test.ts: an audit failure reverses term changes before restoring the previously published row forward → omit undo.restore or run it before term revert.
- posts/__tests__/tool-registrations.test.ts: an already-cancelled edit cannot enter the command or change a row → omit ctx.signal.throwIfAborted before executing the update command.
- public-http/http/site/__tests__/render.golden.characterization.test.ts: merges theme and host scripts in order without leaking consent-managed scripts into the default asset renderer → forward all scripts to renderScriptAssets, or omit the theme list.
- public-http/middleware/__tests__/theme-preview-refresh.unit.test.ts: a zero-capacity preview cache never trusts the newly remembered revision → make the limit comparison use a minimum capacity of one.
- presentation/__tests__/html.test.ts: a malformed theme title with no closing tag does not remove the rest of the head → slice from the opening title when the end tag is absent.
- posts/sql/__tests__/revision-refs.test.ts: only a matching published revision or a pending inverse protects the exact live version it references → count discarded inverse payloads or coerce their string version into a number.
- posts/sql/__tests__/revision-refs.test.ts: SQL thinning deletes the eligible prefix but stops when a surviving revision restores from the next candidate → remove the restored_from protection or either scope condition from deleteIds.
- public-http/http/site/__tests__/form-validation-i18n.unit.test.ts: unknown locale names that match Object prototype keys still get the English validation copy → use plain object lookup for untrusted locale keys without checking ownership. Existing defect, expected red.
- posts/sql/__tests__/revision-refs.test.ts: rejects a nonexistent calendar day instead of previewing a silently normalized cutoff → rely on Date.parse and omit checking that the UTC day round-trips. Existing defect, expected red.

## Source-reviewed exceptions and pending verification

- EXCEPTION posts/sql/index.ts:1–4. Pure re-export barrel with no behavior.
- EXCEPTION posts/sql/repo.ts:106. Kysely only calls the cursor callback when a captured cursor is present, so the defensive throw cannot be reached through the repo.
- EXCEPTION posts/sql/revision-thinning.ts:95. The listed revision is read again inside the same post lock and transaction, so conforming storage and read-only probes cannot make it vanish.
- EXCEPTION public-http/http/shared/post.ts:71. The bool was normalized to a boolean immediately above by toHeadlessPost.
- EXCEPTION public-http/http/site/form-label-inspection.ts:16,27,46. The stack pops are protected by stack length, and the only caller checks the control before asking for its label.
- EXCEPTION public-http/http/site/form-validation-i18n.ts:38. String.split with a literal separator and no limit always has a first element.
- EXCEPTION public-http/middleware/theme-preview-refresh.ts:48. The cache has an entry immediately after synchronous Set.add.
- SKIPPED-ALREADY-COVERED public-http/http/shared/post.ts. Existing "admin retains editable credit while the public DTO exposes only opted-in display credit", "both headless DTOs refuse storage-only email templates", and "HTML with a null body fails loudly instead of returning an empty body" pin existing branches through public serialization.
- Status: no measured coverage or runtime verification. The report did not include branch locations for files at 100% line coverage. Remaining candidates include uncommon document marks, the post-presentation cover-image projection, and additional media/widget fallback permutations.
- public-http/http/site/render/doc/__tests__/doc-host-injection.test.ts: keeps headings linkable and aligned while rendering table spans and suppressing the mirrored title → skip dedupeHeadingIds, emit the title node as a heading, or swap td and th.
- public-http/http/site/render/doc/__tests__/doc-host-injection.test.ts: unknown node names that collide with Object prototype keys still preserve their children → look up a handler without checking the table's own keys. Existing defect, expected red.
- public-http/http/site/render/widgets/__tests__/widget-host-injection.test.ts: collection-backed forms send authored HTML only in HTML mode and keep embed consent opt-in → pass authored HTML in builder mode or always force consentOff.
- posts/sql/__tests__/revision-refs.test.ts: a failed thinning preview surfaces its safe input message before any approval or deletion → let thrown primitives escape or request approval after a rejected preview.
- public-http/http/site/render/__tests__/page-body.test.ts: keeps forwarded media attributes and controls local to each occurrence of the same asset → always pass controls true or forward an empty markerAttributes list.

## Expected red from source inspection

- BUG public-http/http/site/form-validation-i18n.ts:40. Unknown locale names can select inherited Object properties instead of English copy. Check that the locale is an own property, or store the catalog in a Map.
- BUG posts/sql/revision-thinning.ts:58–59. Date.parse normalizes impossible days such as 2026-02-30. Check that the parsed UTC date formats back to the input day before accepting the preview.
- BUG public-http/http/site/render/doc/doc-nodes.ts:324–325. Inherited Object properties can be selected as node handlers instead of preserving unknown nodes' children. Select only own handler keys.
