# CMS coverage handoff

No tests, builds, installations, typechecks, coverage, or mutations were run. Mutations below were checked by inspection against the assertions. Paths are relative to `packages/cms/src/admin-http/`.

- `http/__tests__/forms.characterization.test.ts`: external collection provider → remove the conditional provider spread from `http/forms.ts`.
- `http/__tests__/forms.characterization.test.ts`: details include isolated consent evidence while list exposes only hash → emit evidence in the list, omit the validation or hash, overwrite the recorded IP, or replace `structuredClone(submission.evidence)` with a direct reference.
- `http/__tests__/forms.characterization.test.ts`: legacy details omit evidence and validation → unconditionally add either key with an undefined value.
- `http/__tests__/media.test.ts`: verified video codec and zero-byte blob → omit the codec, drop one of the legacy defaults, or replace byte-size `?? null` with `|| null`.
- `http/__tests__/media.test.ts`: private document's MIME, display name and URL → return the lookup MIME or public URL for documents, or use the title without the extension.
- `http/__tests__/media.test.ts`: document missing filename → fall back to the lookup MIME instead of validating the filename.
- `http/__tests__/widgets.test.ts`: each `exposes WIDGETS_* with its own status and repair details` case → remove its corresponding entry from `WIDGET_ERROR_MAPPERS`, change its status/code, or drop/swap its details.
- `http/__tests__/posts.test.ts`: admin post envelope → return the raw record in the envelope rather than the projected headless DTO.
- `__tests__/limits.test.ts`: exact binary body cap → change the multiplier in `limits.ts` from 1024 to 1000.
- `routes/settings/__tests__/preview-feed-access.test.ts`: settings-only subscriber → invoke theme authorization regardless of `includePreview`.
- `routes/settings/__tests__/preview-feed-access.test.ts`: independent grants, both cases → use the settings decision for preview, or invert a single decision. Returning the theme reason instead also fails both cases.
- `routes/agent-plugins/__tests__/admin-surfaces.test.ts`: preflights same-origin writes / older same-origin browsers → always refuse or require fetch-site even when absent (respectively). Cross-origin writes / opaque frame origins / conflicting fetch metadata → ignore the corresponding origin or fetch-site check and accept the request.
- `routes/agent-plugins/__tests__/admin-surfaces.test.ts`: lists admitted surfaces → drop the plugin filter or omit the link-origins default.
- `routes/agent-plugins/__tests__/admin-surfaces.test.ts`: list without an authorizer → make the gate optional and proceed to list.
- `routes/agent-plugins/__tests__/admin-surfaces.test.ts`: bootstrap reply and caller context → drop the no-store header, substitute a different principal, or pass the wrong clock value.
- `routes/agent-plugins/__tests__/admin-surfaces.test.ts`: bootstrap without authorizer / host refuses write permission → make the write gate optional or swallow the refusal (respectively).
- `routes/agent-plugins/__tests__/admin-surfaces.test.ts`: non-admitted surface → replace the typed 404 with a generic failure.
- `routes/agent-plugins/__tests__/admin-surfaces.test.ts`: requires a string action → coerce a numeric action or create a dispatcher before validation.
- `routes/agent-plugins/__tests__/admin-surfaces.test.ts`: dispatch and host sign-in links → call the dispatcher outside the sign-in wrapper, alter its context/payload, or omit no-store.
- `routes/seo/__tests__/entry-routes.test.ts`: live entry metadata → change GET success from `{ data: meta }` to a bare meta object or supply the wrong entry/scope to SEO.
- `routes/seo/__tests__/entry-routes.test.ts`: live entry analysis → call the metadata reader instead of the analyzer, or omit its issues from the response.
- `routes/seo/__tests__/entry-routes.test.ts`: versioned SEO override and read-back → omit the expected-version option, skip the write, or read before it commits.
- `routes/seo/__tests__/settings-and-sitemap.test.ts`: sitemap trigger ignores scope overrides → spread raw body or query into parsed input.
- `routes/pages/__tests__/content-write.test.ts`: update rollback on ledger failure → remove the page restore or drain the outbox after a failed change-set insert.
- `routes/pages/__tests__/get-by-id.test.ts`: unlabeled catalog match → require a display name before honoring a catalog row's availability.
- `routes/pages/__tests__/update-html.test.ts`: recognized non-Error store failure → use an Error-only message projection for the matched store refusal.
- `routes/posts/__tests__/template-preview-embeds.test.ts`: each non-embed URL → respectively do not catch URL parsing, accept HTTP, ignore username/credentials, accept arbitrary ports, accept extra path segments, accept short IDs, accept non-embed long paths, accept extra long-host segments, or accept short long-host IDs. Password-only credentials → ignore the password-only branch.
- `routes/posts/__tests__/template-preview-render.test.ts`: missing/disabled theme → remove the corresponding refusal or swap its status/message.
- `routes/posts/__tests__/template-preview-render.test.ts`: draft/published/published-pending document source → remove the saved-draft fallback, apply it to published content, or ignore the pending body, respectively. Applying pending HTML to docs fails each case.
- `routes/assistant/__tests__/stored-credential-probe.test.ts`: missing admin/site credential → reject missing records or fall through from the selected admin store to the unrelated site key.
- `routes/plugins/__tests__/y5m-install-registrar.test.ts`: missing or JSON ZIP body → remove the parsed body byte-buffer check.
- `routes/plugins/__tests__/y5m-install-registrar.test.ts`: parsed ZIP bytes → return bytes read from a different source instead of the parsed stream body.
- `routes/plugins/__tests__/y5m-install-registrar.test.ts`: unexpected installer failure → serialize unknown errors instead of handing them to the injected host failure port.
- `routes/publish-content/__tests__/destination.test.ts`: candidate without scheme → remove label fallback or replace its text with an empty label.
- `routes/media/__tests__/stored-media-response.test.ts`: missing public URL → omit the null fallback or read stat sizes for non-SVG uploads.
- `routes/media/__tests__/provider-catalog.test.ts`: catalog parsing ignores caller-selected scope → expose incoming query or body fields as parsed input.
- `routes/media/__tests__/batch-providers.test.ts`: each invalid batch/patch shape or editable value → remove the guard for that row and either reach the write port or answer a different error.
- `routes/settings/__tests__/events.test.ts`: failed readiness / principal lookup → send a generic failure or allow authorization to proceed after the corresponding failure.
- `routes/settings/__tests__/events.test.ts`: no-grant refusal and preview-only admission → require settings access even with an independent preview grant, or allow when neither is granted.
- `routes/settings/__tests__/events.test.ts`: namespace resolver → stop memoizing a null result, drop the setting-id key, or share the cache across connections.
- `routes/__tests__/y5-settings-feed.test.ts`: mounted preview-only feed → wire the wrong route or dependencies, let a numeric revision resume, attach a settings ID to the preview event, or run the settings poll on preview-only access.
- `routes/external-mcp/__tests__/oauth.test.ts`: each invalid saved selection → accept the corresponding absent, extra-field, mistyped, empty, or oversized credential request.
- `routes/external-mcp/__tests__/oauth.test.ts`: 512-character saved credential → lower the bound by one or forward any incorrect principal, id, or server.
- `routes/external-mcp/__tests__/oauth.test.ts`: unwired local switch → bypass the unavailable refusal or omit the session check.
- `routes/external-mcp/__tests__/oauth.test.ts`: provider configuration refusal → report an outage or invent a retry delay for invalid configuration.
- `routes/external-mcp/__tests__/y5m-oauth-mount.test.ts`: mounted saved/local selection and failure writer → drop service binding, omit the correct session policy, map the unavailable secret store to a generic incident, or serialize private failure text.
- `routes/external-mcp/__tests__/probe.test.ts`: mounted probe → remove the rate gate, read the server from the body, default a healthy response to a non-200 status, or drop the incident callback.
- `routes/external-mcp/__tests__/tool-approvals.test.ts`: list ignores caller filters → read filter/scope from the raw request.
- `routes/publish-content/__tests__/peer-transport.test.ts`: each malformed scope or selection → allow that row's invalid field or replace its precise 400 with a generic error.
- `routes/publish-content/__tests__/peer-transport.test.ts`: scoped keys at the limit → change the inclusive 1000 bound to exclusive or discard scope when a separate selection exists.
- `routes/publish-content/__tests__/peer-transport.test.ts`: overwrite adapter → consult authorization for malformed keys, ignore a denied gate, or collapse empty to absent.
- `routes/publish-content/__tests__/peer-transport.test.ts`: peer resolver → use remote rather than local workspace for the open or history, or start peer I/O prematurely.
- `routes/entries/__tests__/entries.test.ts`: parsed collection filter → drop the string type query, causing a second type to leak into the result.
- `routes/entries/__tests__/entries.test.ts`: entry creation uses explicit fields/body → make parse drop the body, or replace provided fields/content with defaults.
- `routes/entries/__tests__/entries.test.ts`: non-string type/slug cases → delete the corresponding type or slug guard.
- `routes/entries/__tests__/entries.test.ts`: document-only update → discard incoming bodyJson or coerce an omitted title and overwrite the original.
- `routes/entries/__tests__/entries.test.ts`: route-driven unpublish → parse the wrong ID or dispatch publish for the unpublish action.
- `routes/entries/__tests__/entries.test.ts`: non-numeric lifecycle version → accept a version supplied as a numeric string.
- `routes/content-types/__tests__/content-types.test.ts`: route-driven reactivation → drop the parsed key or dispatch deprecation for reactivation.
- `routes/content-types/__tests__/content-types.test.ts`: malformed replacement schema → skip the field parser, allowing the invalid input to reach the update port.
- `routes/content-types/__tests__/content-types.test.ts`: missing read authorizer / missing write principal → bypass the corresponding fail-closed guard.
- `routes/comments/__tests__/moderate.test.ts`: missing authorizer or principal on purge → allow an unbound authorizer or fabricate a default actor.
- `routes/forms/__tests__/read-routes.test.ts`: provider discovery ignores caller scope → make parse return a workspace or provider filter.
- `routes/forms/__tests__/submission-routes.test.ts`: zero/fractional limit → remove the lower bound or integer check, respectively.
- `routes/agent-plugins/__tests__/install-response.test.ts`: installed metadata → hard-code any supplied metadata value to null.
- `routes/agent-plugins/__tests__/install.test.ts`: already-installed archive → return 201 or omit the warnings default.
- `routes/agent-plugins/__tests__/list.test.ts`: present/absent plugin metadata → ignore a supplied field or stop projecting absent fields to null.
- `routes/agent-plugins/__tests__/set-enabled.test.ts`: toggled display metadata → serialize the first candidate instead of the selected candidate, or erase populated metadata.
- `routes/assistant/__tests__/test-agent.test.ts`: unreported model catalog → reject every user-selected model when models is empty or omit the accepted model from the verdict.
- `routes/assistant/__tests__/test-agent.test.ts`: unwired authorizer → proceed to runtime probing without the required mount grant.
- `routes/assistant/__tests__/test-connection.test.ts`: blank failure detail → use truthiness without trim and return a blank message.
- `routes/assistant/__tests__/test-connection.test.ts`: missing JSON body → remove empty-body fallback in the route or its shared request reader.
- `routes/assistant/__tests__/settings.test.ts`: non-Error refusal → read `.message` unconditionally and lose the host-classified string.
- `routes/change-sets/__tests__/revert.test.ts`: system revert attribution → classify system principals as users.
- `routes/database/__tests__/timeline.test.ts`: classified non-Error rejection → read the private thrown value instead of using safe timeline copy.
- `routes/database/__tests__/restore-points.test.ts`: missing authenticated actor → remove the principal guard and touch the restore repo.
- `routes/consent/__tests__/routes.test.ts`: unwired authorizer/principal → skip the corresponding guard or invoke the consent service with a fabricated actor.
- `routes/consent/__tests__/routes.test.ts`: supplied preview config → discard the draft config or dispatch a save instead of a preview.
- `routes/email-templates/__tests__/specs.test.ts`: host-classified template string → project only `.message` and drop string refusal text.
- `routes/integrations/__tests__/delete.test.ts`: host-classified webhook error string → project only `.message` and drop string refusal text.
- `routes/members/__tests__/request-magic-link.test.ts`: classified mailer string → project only `.message` or fall through to host incident instead of 503.
- `routes/menus/__tests__/assign-location.test.ts`: null assignment body → remove the body coalesce and crash instead of refusing.
- `routes/menus/__tests__/create.test.ts`: null create body → remove the empty draft fallback.
- `routes/menus/__tests__/update-tree.test.ts`: supplied title / null update body → drop the title or remove the body coalesce, respectively.
- `routes/redirects/__tests__/update.test.ts`: explicit override and priority → omit one of the two valid patch fields.
- `routes/newsletter/__tests__/create-campaign.test.ts`: omitted JSON body → remove the campaign create-body fallback.
- `routes/newsletter/__tests__/create-subscription.test.ts`: null body → remove the subscription body fallback.
- `routes/newsletter/__tests__/import-subscriptions.test.ts`: omitted import body → destructure the raw body directly.
- `routes/newsletter/__tests__/schedule-campaign.test.ts`: bodyless schedule → remove the raw body/field fallback or stop supplying the clock timestamp.
- `routes/newsletter/__tests__/send-test-campaign.test.ts`: null body → remove the request fallback before validating recipients.
- `routes/newsletter/__tests__/update-campaign.test.ts`: bodyless PATCH → skip the empty-body fallback or overwrite an omitted campaign field.
- `routes/settings/__tests__/reads.test.ts`: key without namespace → validate the key but omit the namespace guard.
- `routes/settings/__tests__/reads.test.ts`: in-namespace key order → remove the key comparator or return the raw repository records.
- `routes/settings/__tests__/writes.test.ts`: null body, invalid scope and foreign workspace → remove the corresponding fallback or guard and either crash or mutate settings.
- `routes/posts/__tests__/get-by-id.test.ts`: string lookup refusal → call outwardErrorMessage for a non-Error or drop its text.
- `routes/posts/__tests__/autosave.test.ts`: string byline validation → drop the string message or write after the normalizer refuses.
- `routes/presentation/__tests__/patch.test.ts`: missing principal → attribute a theme write to a fallback actor.
- `routes/posts/__tests__/template-preview.test.ts`: omitted identifier → coerce undefined directly to a string and look up that key.
- `routes/media/__tests__/replace.test.ts`: missing replacement body → destructure the raw body directly or attempt a write without required media fields.
- `routes/media/__tests__/grid.test.ts`: multi-value cursor/itemId → discard the malformed parameter or select the first value rather than refuse it.
- `routes/publish-content/__tests__/export.test.ts`: missing export principal → remove the fail-closed guard and read/pack with a fabricated principal.
- `routes/publish-content/__tests__/import-errors.test.ts`: classified non-Error stale plan → expose raw classifier text instead of its safe empty message.
- `routes/publish-content/__tests__/route-helpers.test.ts`: known local publish refusal → send every failure through the incident port.
- `routes/publish-content/__tests__/peers.test.ts`: peer list parser ignores filters → allow body/query data to leak into the parsed list input.
- `routes/publish-content/__tests__/bundle-create.test.ts`: missing bundle body → drop the fallback and turn a request error into a TypeError.
- `routes/publish-content/__tests__/backstop.test.ts`: backstop status ignores audit target → consume raw request state in the parameterless status input.
- `routes/media/__tests__/import-url.test.ts`: no importer principal → return a default actor from `media/shared.ts` or fetch before reading identity.
- `routes/fs-files/__tests__/custom-root.test.ts`: recognized string path error → read `.message` unconditionally.
- `routes/plugins/__tests__/provider-settings.test.ts`: missing optional provider contracts → remove the empty contract-list fallback.
- `routes/publish-content/__tests__/blob-routes.test.ts`: inconsistent stored key → remove the fenced-key comparison and verify/claim success against a different store key.
- `routes/publish-content/__tests__/blobs-probe.test.ts`: no authorizer → make the admission check optional and consult the store.
- `routes/publish-content/__tests__/export.test.ts`: cancelled export → remove the iterator return call from stream cancellation.
- `routes/posts/__tests__/delete.test.ts`: transient lookup failure → treat every lookup failure as a not-found and proceed into command authorization/writing.
- `routes/external-mcp/__tests__/external-mcp-route-failures.unit.test.ts`: each external MCP recovery contract → drop/alter its specific mapping or its recovery fields, including a provider-supplied delay.
- `routes/media/__tests__/upload.test.ts`: padded document size (one and two padding bytes) → forget to subtract the corresponding padding from the refused byte count.
- `routes/pages/__tests__/content-write.test.ts`: actual page trash write followed by ledger failure → remove the compensating restore or drain despite the failed ledger.
- `routes/publish-content/__tests__/import.test.ts`: existing route refusal → send it to the generic host classifier for remapping.
- `routes/settings/__tests__/events.test.ts`: retry after a failed read followed by a full page → advance the cursor on failure, always jump to the global head, or emit the global head as the settings event id.
- `routes/external-mcp/__tests__/oauth.test.ts`: unwired shared selection → fake a connected response without a selection service.
- `routes/media/__tests__/byte-size.test.ts`: recovery after a transient repository failure → cache the fallback/missing result for subsequent reads.

- `routes/media/__tests__/shared.test.ts`: missing media asset → change its legacy 404 status, code-less envelope, or reported asset id.
- `routes/media/__tests__/shared.test.ts`: mapped fixed copy → ignore the predetermined error text or invoke the host formatter despite fixed copy.
- `routes/media/__tests__/shared.test.ts`: classified text → assume the matched thrown value is an Error, dropping its meaningful text.

- `routes/settings/__tests__/events.test.ts`: foreign workspace already refused → continue resolving a principal or send an additional response after the mount refuses.
- `routes/settings/__tests__/events.test.ts`: overlapping poll and grant revocation → remove the single-poll guard, continue streaming after both grants are lost, or clear timers more than once.

## Source inventory

Cases are counted by source file, including parameterized cases. A case can exercise more than one listed source file. This inventory is from source and diff inspection, not measured coverage.

### HTTP and limits

- `http/forms.ts` — 3
- `http/media.ts` — 3
- `http/posts.ts` — 1
- `http/widgets.ts` — 11
- `limits.ts` — 1

### Agent plugins

- `routes/agent-plugins/admin-surfaces.ts` — 13
- `routes/agent-plugins/install-response.ts` — 1
- `routes/agent-plugins/install.ts` — 1
- `routes/agent-plugins/list.ts` — 1
- `routes/agent-plugins/set-enabled.ts` — 1

### Assistant

- `routes/assistant/execution-shared.ts` — 2
- `routes/assistant/shared.ts` — 1
- `routes/assistant/stored-credential-probe.ts` — 2
- `routes/assistant/test-agent.ts` — 2
- `routes/assistant/test-connection.ts` — 2

### Content and storage

- `routes/change-sets/revert.ts` — 1
- `routes/comments/shared.ts` — 1
- `routes/consent/routes.ts` — 2
- `routes/content-types/collections-route.ts` — 2
- `routes/content-types/lifecycle.ts` — 1
- `routes/content-types/update-fields.ts` — 1
- `routes/database/restore-points.ts` — 1
- `routes/database/timeline.ts` — 1
- `routes/email-templates/shared.ts` — 1
- `routes/entries/create.ts` — 3
- `routes/entries/lifecycle.ts` — 2
- `routes/entries/list.ts` — 1
- `routes/entries/update.ts` — 1

### External MCP and forms

- `routes/external-mcp/oauth.ts` — 9
- `routes/external-mcp/probe.ts` — 1
- `routes/external-mcp/provider-refusal.ts` — 1
- `routes/external-mcp/route-helpers.ts` — 4
- `routes/external-mcp/tool-approvals.ts` — 1
- `routes/forms/list-submissions.ts` — 2
- `routes/forms/providers.ts` — 1
- `routes/fs-files/custom-root.ts` — 1
- `routes/integrations/shared.ts` — 1

### Media

- `routes/media/batch-providers.ts` — 13
- `routes/media/byte-size.ts` — 1
- `routes/media/grid.ts` — 2
- `routes/media/provider-catalog.ts` — 1
- `routes/media/replace.ts` — 1
- `routes/media/shared.ts` — 4
- `routes/media/stored-media-response.ts` — 1
- `routes/media/upload.ts` — 1

### Members, menus, and newsletter

- `routes/members/request-magic-link.ts` — 1
- `routes/menus/assign-location.ts` — 1
- `routes/menus/create.ts` — 1
- `routes/menus/update-tree.ts` — 2
- `routes/newsletter/create-campaign.ts` — 1
- `routes/newsletter/create-subscription.ts` — 1
- `routes/newsletter/import-subscriptions.ts` — 1
- `routes/newsletter/schedule-campaign.ts` — 1
- `routes/newsletter/send-test-campaign.ts` — 1
- `routes/newsletter/update-campaign.ts` — 1

### Pages, plugins, posts and presentation

- `routes/pages/delete.ts` — 1
- `routes/pages/get-by-id.ts` — 1
- `routes/pages/update-html.ts` — 1
- `routes/pages/update.ts` — 1
- `routes/plugins/install.ts` — 4
- `routes/plugins/provider-settings.ts` — 1
- `routes/posts/autosave.ts` — 1
- `routes/posts/delete.ts` — 1
- `routes/posts/get-by-id.ts` — 1
- `routes/posts/shared.ts` — 1
- `routes/posts/template-preview-embeds.ts` — 11
- `routes/posts/template-preview-render.ts` — 5
- `routes/posts/template-preview.ts` — 1
- `routes/presentation/patch.ts` — 1

### Publish content

- `routes/publish-content/backstop.ts` — 1
- `routes/publish-content/blob-put.ts` — 1
- `routes/publish-content/blobs-probe.ts` — 1
- `routes/publish-content/bundle-create.ts` — 1
- `routes/publish-content/destination.ts` — 1
- `routes/publish-content/export.ts` — 2
- `routes/publish-content/import-errors.ts` — 1
- `routes/publish-content/import.ts` — 1
- `routes/publish-content/peer-transport.ts` — 11
- `routes/publish-content/peers.ts` — 1
- `routes/publish-content/route-helpers.ts` — 1

### Redirects, SEO, and settings

- `routes/redirects/update.ts` — 1
- `routes/seo/get-entry-analyze.ts` — 1
- `routes/seo/get-entry.ts` — 1
- `routes/seo/post-sitemap-regenerate.ts` — 1
- `routes/seo/put-entry.ts` — 1
- `routes/settings/clear.ts` — 3
- `routes/settings/events.ts` — 8
- `routes/settings/get-raw.ts` — 1
- `routes/settings/list-definitions.ts` — 1
- `routes/settings/preview-feed-access.ts` — 3

## Existing coverage and remaining edges

- SKIPPED-ALREADY-COVERED: no entire target file was skipped. Existing assertions were preserved.
- EXCEPTION candidate `routes/pages/delete.ts:36` and `routes/pages/update.ts:45-46`: the no-prior rollback cannot run. The real gateway captures the inverse first, and the capture throws if no page exists. Both real compensation paths are tested.
- EXCEPTION candidate `routes/media/byte-size.ts:33,38`: the worker reads a dense hash array synchronously after its bounds check. Reaching the second missing-sizeOf arm would require changing the same injected adapter's capabilities mid-request.
- EXCEPTION candidate `routes/agent-plugins/admin-surfaces.ts:85`: the empty-surface-id fallback cannot occur on a matched host route with a required, nonempty path segment.
- EXCEPTION candidate `routes/settings/events.ts:186`: the duplicate closed-state check cannot take its closed arm after the synchronous guard at line 178.
- BUG: none established by static review. All pass/fail and residual coverage figures are left to the cloud run. The dispatch has branch percentages but not individual uncovered branch IDs.
