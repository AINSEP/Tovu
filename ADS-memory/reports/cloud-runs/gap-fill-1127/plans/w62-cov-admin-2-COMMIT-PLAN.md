
# Admin coverage gap-fill mutation plan

Source mutations below are hypothetical and were checked by inspection only. No test or mutation execution.

- auth/__tests__/auth-i18n.unit.test.ts · ships non-empty diagnostic controls → omit a locale's details row or swap the French Show/Copy translations.
- auth/__tests__/use-login.hooks.unit.test.ts · passes credentials unchanged and removes diagnostic details → remove the retry's setFailure(null) or drop the HTTP error ID.
- auth/__tests__/use-login.hooks.unit.test.ts · leaves HTTP 400/401/429 refusal wording (three cases) → remove that specific status from the refusal allowlist.
- auth/__tests__/use-login.hooks.unit.test.ts · omits a correlation ID for null/numeric bodies (two cases) → dereference body without optional chaining or stringify arbitrary IDs.
- auth/__tests__/use-login.hooks.unit.test.ts · preserves the MFA port receiver → remove .call(port, ...) or rethrow the raw rejection.
- comments/__tests__/Comments.unit.test.tsx · mounts the comments queue → change pageId to "settings", populate route query, or drop loadingContent.
- collections/__tests__/collections-api.unit.test.ts · exact request for create type → drop fields from the POST body.
- collections/__tests__/collections-api.unit.test.ts · exact request for replace fields → omit expectedVersion or leave the key unencoded.
- collections/__tests__/collections-api.unit.test.ts · exact request for deprecate type → switch the method to PUT.
- collections/__tests__/collections-api.unit.test.ts · exact request for create entry without options → drop slug.
- collections/__tests__/collections-api.unit.test.ts · exact request for create entry with rich text → drop bodyJson from options.
- collections/__tests__/collections-api.unit.test.ts · exact request for update entry without options → drop expectedVersion or fail when options are omitted.
- collections/__tests__/collections-api.unit.test.ts · exact request for update entry with rich text → drop bodyJson from options.
- collections/__tests__/collections-api.unit.test.ts · exact request for unpublish entry → hardcode op to publish.

- collections/__tests__/CollectionEntries.unit.test.tsx · unresolved registry with empty rows → remove the undefined-content-type loading guard.
- collections/__tests__/Collections.unit.test.tsx · host dismissal for create/edit (two cases) → bypass the respective controller cancel callback.
- collections/__tests__/Collections.unit.test.tsx · safe initial focus and host close for deprecate/tombstone (two cases) → always mark Confirm for initial focus, or disconnect host close.
- collections/hooks/__tests__/collections-workflows.unit.test.tsx · filters entries and distinguishes an unknown type → omit the type filter, use the first type, or return undefined instead of null after the lookup.
- collections/hooks/__tests__/collections-workflows.unit.test.tsx · failed registry/entry reads (two cases) → swallow the respective read failure as an empty result.
- collections/hooks/__tests__/collections-workflows.unit.test.tsx · reloads the committed lifecycle transition → omit list invalidation or use a hardcoded version.
- collections/hooks/__tests__/collections-workflows.unit.test.tsx · attributes failed reactivation → hardcode the last op to deprecate or ignore the fake lifecycle refusal.
- collections/hooks/__tests__/collections-workflows.unit.test.tsx · clipboard fallback and expiry → leave the fallback after successful retry or remove the expiry callback.
- collections/hooks/__tests__/collections-workflows.unit.test.tsx · versioned field save → allow cancel while awaiting the write, omit its version, or send row IDs across the port.
- collections/hooks/__tests__/collections-workflows.unit.test.tsx · fieldless edit and stale write → remove validation or treat a 409 like a generic failure.
- collections/hooks/__tests__/collections-workflows.unit.test.tsx · creates a trimmed identity → send the untrimmed key or release cancel before settlement.
- collections/hooks/__tests__/collections-workflows.unit.test.tsx · keeps a refused draft editable → swallow createError or call onCreated after a refused write.

- collections/hooks/__tests__/use-collection-entry-editor.unit.test.tsx · waits for the body editor and replaces the old link → remove the editor guard or omit replace navigation.
- collections/hooks/__tests__/use-collection-entry-editor.unit.test.tsx · preserves edits across a refetch → remove the same-identity seed guard or skip resetting after identity changes.
- collections/hooks/__tests__/use-collection-entry-editor.unit.test.tsx · prefers an exact ID → restore the current combined find after fixing the lookup. Red by inspection because that find accepts the first matching slug before checking the rest for an ID.
- collections/hooks/__tests__/use-collection-entry-editor.unit.test.tsx · creates and reads back a trimmed slug → omit trim, persist the wrong rich-text body, or navigate by the returned ID.
- collections/hooks/__tests__/use-collection-entry-editor.unit.test.tsx · blocks writes until all JSON is fixed → clear all invalid keys when one control becomes valid or remove the publish validation guard.
- collections/hooks/__tests__/use-collection-entry-editor.unit.test.tsx · publishes newly saved content and unpublishes without saving → send expectedVersion from the old entry or skip saving working copy first.
- collections/hooks/__tests__/use-collection-entry-editor.unit.test.tsx · never issues publish after lost version check → continue into lifecycle mutation when save rejects.
- collections/hooks/__tests__/use-collection-entry-editor.unit.test.tsx · requested publish/unpublish failure (two cases) → hardcode the opposite failure label or set the final status despite refusal.
- collections/hooks/__tests__/use-collection-entry-editor.unit.test.tsx · create error without navigating → call navigate from the catch path or omit the create error fallback.
- collections/hooks/__tests__/use-collection-entry-editor.unit.test.tsx · absent type and refused registry read → remove the missing content-type write guard or mask registry refusal as missing data.

- collections/__tests__/collections-rules-kit.unit.test.ts · edit cache identity → alias editor keys to the entries list or omit the type discriminator.
- collections/__tests__/collections-rules-kit.unit.test.ts · reserved page/post (two cases) → remove the specific reserved key from the set.
- collections/__tests__/collections-rules-kit.unit.test.ts · unnamed first field → skip empty names or return the last invalid field.
- collections/__tests__/collections-rules-kit.unit.test.ts · edit error precedence → check lifecycle before update or show lifecycle errors with no associated op.
- collections/hooks/__tests__/collections-live-ports.unit.test.ts · fake reactivation then tombstone → map reactivate to deprecated or fail to store the latest version.
- collections/hooks/__tests__/collections-live-ports.unit.test.ts · fake dialog port seeded responses and last input → substitute the default result for the seed or keep the first request.
- collections/hooks/__tests__/collections-live-ports.unit.test.ts · fake absent entry writes → return success instead of rejecting unknown entry IDs.

- consent/__tests__/CookieConsent.unit.test.tsx · Fix links only for actionable problems → link an unknown problem or route the privacy issue to Rules.
- consent/__tests__/CookieConsent.unit.test.tsx · failed readiness check → show the all-clear copy on failure or drop the alert.
- consent/__tests__/CookieConsent.unit.test.tsx · resets custom CSS in the draft → send current CSS instead of default or bypass the draft save.
- consent/__tests__/CookieConsent.unit.test.tsx · CSS warnings for omitted/off modes (two cases) → make omitted mode not Jini, or display warnings even when off.
- consent/__tests__/CookieConsent.unit.test.tsx · navigate to Rules without preview → use push navigation or request a preview with Rules active.
- consent/__tests__/CookieConsent.unit.test.tsx · reload after conflict → disconnect Reload or allow Reset during conflict.
- consent/__tests__/consent-autosave.unit.test.ts · explicit stop discards a queued write → replace "queued && !stopped" with "queued".
- consent/__tests__/use-consent-page.hooks.unit.test.tsx · discards superseded readiness rejection → remove the rejection handler's alive/generation guard.
- dashboard/__tests__/Dashboard.unit.test.tsx · waits after just one activity-source failure → use || to decide whether either error is enough for the aggregate alert.

- content-analysis/__tests__/ContentAnalysisCard.unit.test.tsx · status refusal stays visible → hide when any status read fails, or ignore the statusError option.
- content-analysis/__tests__/ContentAnalysisCard.unit.test.tsx · keeps stored analysis after refusal and retries → suppress previewError, forget to reset the in-flight guard, or send an empty title on retry.
- content-analysis/__tests__/ContentAnalysisCard.unit.test.tsx · removes the analyzer after a now-disabled status → ignore the enabled option in the fake or invert its meaning in the hook.
- content-analysis/__tests__/host-api-error-shape.unit.test.ts · truncated report → rethrow the SyntaxError or have storedAnalysis classify broken JSON as missing.
- consent/__tests__/CookieConsent.unit.test.tsx · failed publish leaves retry available → hide publishError or leave the application in its busy state after rejection.
- dashboard/__tests__/use-dashboard.hooks.unit.test.ts · safe stats copy for query-layer failure → show a non-dashboard error's raw message in failureDisplayText or make this stat blank adjacent healthy stats.

- email/__tests__/email-api.unit.test.ts · provider listing → change its route suffix.
- email/__tests__/email-api.unit.test.ts · save provider key → drop the credential object or stop encoding provider IDs.
- email/__tests__/email-api.unit.test.ts · activate provider → use GET or omit its empty POST body.
- email/__tests__/email-api.unit.test.ts · DNS status → call the verification endpoint on a read.
- email/__tests__/email-api.unit.test.ts · verify DNS → use GET.
- email/__tests__/email-api.unit.test.ts · default recipient → put an empty address in the body.
- email/__tests__/email-api.unit.test.ts · explicit recipient → drop to or requestId.
- email/__tests__/email-api.unit.test.ts · uses report → name the activity endpoint instead.
- email/__tests__/email-api.unit.test.ts · unfiltered activity → emit an empty recipient query.
- email/__tests__/email-api.unit.test.ts · filtered activity page → drop the cursor or the recipient encoding.
- email/__tests__/email-api.unit.test.ts · activity details → leave the ID unencoded in the path.
- email/__tests__/email-api.unit.test.ts · suppression search → send the wrong search key or omit pagination.
- email/__tests__/email-api.unit.test.ts · suppression plan → send confirmed: true without a plan.
- email/__tests__/email-api.unit.test.ts · suppression confirmation → omit the previewed revision.
- email/__tests__/email-api.unit.test.ts · capture clear plan → default to confirmed.
- email/__tests__/email-api.unit.test.ts · capture clear confirmation → fail to forward the previewed revision.
- email/__tests__/email-api.unit.test.ts · feedback setup → read the provider-list path instead.
- email/__tests__/email-api.unit.test.ts · template listing → lose the limit.
- email/__tests__/email-api.unit.test.ts · create template → drop name.
- email/__tests__/email-api.unit.test.ts · read template → stop escaping the template ID.
- email/__tests__/email-api.unit.test.ts · save template HTML → drop expectedVersion.
- email/__tests__/email-api.unit.test.ts · rename template → use PUT instead of PATCH.
- email/__tests__/email-api.unit.test.ts · preview delivered HTML → force admin mode.
- email/__tests__/email-api.unit.test.ts · trash template → call DELETE instead of workspace trash.
- email/__tests__/email-api.unit.test.ts · read sender → omit the settings namespace.
- email/__tests__/email-api.unit.test.ts · save sender → use a site scope or the wrong value field.
- email/__tests__/email-api.unit.test.ts · auth refusal → catch and convert the error to a success value.
- email/__tests__/email-api.unit.test.ts · mail delivery verdict → hardcode the workspace or drop the status response.
- email/__tests__/email-bindings.unit.test.ts · localized tab label → return the source label instead of translating it.
- email/__tests__/email-bindings.unit.test.ts · replace with encoded subsection → stop encoding part or set replace false.
- email/__tests__/email-bindings.unit.test.ts · provider label → replace unknown IDs with None or skip matching configured display names.
- email/__tests__/email-bindings.unit.test.ts · select actual provider → call onSelect for omitted/empty IDs or require a callback.
- email/__tests__/email-bindings.unit.test.ts · editor translator → hardcode en or substitute an unrelated copy key.
- email/__tests__/EmailParts.unit.test.tsx · hidden title, retained action, no unsupported retry → hide the action along with the title or always show Retry.
- email/__tests__/EmailParts.unit.test.tsx · clipboard refusal → set Copied before the write resolves.
- email/__tests__/EmailSegments.unit.test.tsx · controlled labeled radio groups → pass active to all radios or deliver item.label instead of item.key.

- email/__tests__/EmailOverviewTab.unit.test.tsx · results accepted/captured/redirected/failed/unknown (five cases) → for that outcome return generic success or omit the recipient, reason, or local-only assurance.
- email/__tests__/EmailOverviewTab.unit.test.tsx · successful send and Uses reload → drop its request ID, never disable while pending, omit reloadUses, or lose the evidence and reason copy.
- email/__tests__/EmailOverviewTab.unit.test.tsx · default address and structured limit result → force an explicit recipient, discard the structured 429 result, or expose raw exceptions.
- email/__tests__/EmailOverviewTab.unit.test.tsx · Uses-only retry → render the test form in Uses or disconnect Retry.
- email/__tests__/email-load.unit.test.ts · blank API message → return the empty string rather than the supplied fallback.

- email/__tests__/EmailSenderTab.unit.test.tsx · validates locally then saves settings → allow a domain without a dot, swap settings keys, or omit DNS refresh after saving.
- email/__tests__/EmailSenderTab.unit.test.tsx · writes only changed field and retries refusal → write the unchanged name or replace the draft after failed save.
- email/__tests__/EmailSenderTab.unit.test.tsx · guard before sender load → remove the saved-data guard or treat non-string settings as text.
- email/__tests__/EmailSenderTab.unit.test.tsx · DNS mismatch and refusal/retry → omit priority zero, suppress observed mismatch values, discard the previous read on refusal, or fail to apply the verified retry.
- email/__tests__/EmailSenderTab.unit.test.tsx · unavailable DNS for no_sender/requirements_failed (two cases) → always append the extra message or always omit it.
- email/__tests__/EmailSenderTab.unit.test.tsx · provider verdict independent of delivery → suppress the known domain when delivery is false or display a Domain row without any domain.
- email/__tests__/EmailSenderTab.unit.test.tsx · literal addresses (eight cases) → reject blank/plus-addresses or accept the individually asserted missing @, missing local part, missing domain dot, trailing dot, multiple addresses, or whitespace.

- email/__tests__/EmailTemplatesTab.unit.test.tsx · row-owned values and Rename via Enter → change the row href to a generic path or disconnect the Rename keyboard handler.
- email/__tests__/EmailTemplatesTab.unit.test.tsx · cancel and then confirm Trash → connect Cancel to deletion, ignore the busy flag, or remove the wrong row.
- email/__tests__/EmailTemplatesTab.unit.test.tsx · refused create, then retry → suppress the alert, ignore the creating state, or fail to route to the new draft.
- email/__tests__/EmailTemplateEditor.unit.test.tsx · preview tokens and mode → mark the wrong field invalid, send a value under the wrong token, or switch As sent back to sent.
- email/__tests__/EmailTemplateEditor.unit.test.tsx · separate mutation and preview errors → omit one alert or show settled empty copy while preview is pending.
- email/__tests__/EmailTemplateEditor.unit.test.tsx · Enter blur and save keys cleanup → remove the Enter handler, use the wrong shortcut, or retain the shortcut after unmount.
- email/__tests__/EmailTemplateEditor.unit.test.tsx · downloads/new tabs/modifiers bypass the guard → remove the download/target or modifier condition.

- email/__tests__/EmailActivityTab.unit.test.tsx · failed then retried cursor → replace prior rows rather than append, drop the original cursor, or erase the existing list on a failed later page.
- email/__tests__/EmailActivityTab.unit.test.tsx · chosen details and superseded result → remove the detail identity guard or display the original recipient/provider evidence on a different row.
- email/__tests__/EmailActivityTab.unit.test.tsx · masked rows and settled filters → reveal details for rows without IDs, drop trim, or keep the prior outcome on reset.
- email/__tests__/EmailActivityTab.unit.test.tsx · older page cannot overwrite filtered results → remove the proposed generation guard. Red by inspection because usePaged applies a resolved page to the current view without a filter generation guard.
- email/__tests__/EmailActivityTab.unit.test.tsx · reason and revision before unblock → remove minimum reason validation, omit confirm revision, or drop suppression reload.
- email/__tests__/EmailActivityTab.unit.test.tsx · owner refusal and cancellation → use the raw 403 message or show success in the refusal branch.
- email/__tests__/EmailActivityTab.unit.test.tsx · separate feedback states → expose a webhook link for unsupported providers, suppress the origin hint, or drop the verified-event copy.

- email/__tests__/use-email-provider.unit.test.ts · retry refused listing → skip bumping the list attempt when there has been no enable.
- email/__tests__/use-email-provider.unit.test.ts · exclusive enable and refresh → remove the lock or return the first provider regardless of its plugin.
- email/__tests__/use-email-provider.unit.test.ts · selected plugin refusal then retry → mix another plugin's refusal into the message or retry with the wrong ID.
- email/__tests__/use-email-provider.unit.test.ts · first credential, refusal and save → allow an empty first key, clear drafts after a refusal, or erase unrelated drafts.
- email/__tests__/use-email-provider.unit.test.ts · confirmed switching and retry → switch when merely opening the dialog, conceal an activation error, or omit the reload on success.

- consent/__tests__/use-consent-page.hooks.unit.test.tsx · live reflects the published revision during a concurrent edit → read the editable form after await again. Red by inspection because the hook reads the mutable form after await instead of the submitted draft's enabled value.
- consent/__tests__/CookieConsent.unit.test.tsx · failed autosave remains editable and cannot publish → omit saveError rendering or enable Publish in error state.
- content-analysis/__tests__/host-api-error-shape.unit.test.ts · invalid version, score, count, duration, band, heading level/anchor, check status or parameters (12 cases) → remove that field/unit validation or weaken its type, enum, or range check.
- content-analysis/__tests__/host-api-error-shape.unit.test.ts · new check and no-image message → drop unknown check IDs or render "All 0 images" for image-free content.
- dashboard/__tests__/Dashboard.unit.test.tsx · pending appearance theme → omit the ellipsis when themeName is null.

## Database

All paths here are relative to `packages/admin/src/screens/database`, unless stated. These are counterfactual edits only. No mutations were applied or run.

| Test file and title (shortened) | One-line mutation and expected failure |
|---|---|
| `Database.unit.test.tsx` — assigns each Recovery action its event handle | `Database.tsx:250`: use `restorePointHandles[0]` for every row rather than `restorePointHandles[index]`; the `core.migration` button gets the wrong exact handle. |
| `Database.unit.test.tsx` — disables pending localized confirmation | `Database.tsx:357`: replace `disabled={props.busy}` with `disabled={false}`; the disabled check fails and the click invokes confirmation. |
| `schema-state-rules.unit.test.ts` — localized Recovery label with viewer-local time | `rules.ts:173`: omit `{ viewerTimeZone }` from `formatTimestamp`; the name ends in `2026-07-01 03:40` instead of `2026-06-30 20:40`. |
| `database-api.unit.test.ts` — omits query for absent or blank filters | `api/database-api.ts:25`: change guard to `if (options.kind !== undefined)`; the blank call now appends `?kind=`. |
| `database-api.unit.test.ts` — encodes all filters, cursor and limit | `api/database-api.ts:28`: pass `options.fromDate ?? ''` as `toDate`; the decoded upper bound is wrong. |
| `database-api.unit.test.ts` — schema read and rejection | `api/database-api.ts:38`: append `.catch(() => null)` to the request; the rejected-read assertion fails. |
| `database-api.unit.test.ts` — exact plan/confirm/execute wire payloads | `api/database-api.ts:50`: change the confirm body to `JSON.stringify({ planId })`; the request loses its required hash. |
| `database-api.unit.test.ts` — explicit acknowledgment on shared restore-point route | `api/database-api.ts:65`: write `JSON.stringify({ ...options, costAck: options.costAck || undefined })`; the explicit `false` vanishes. |
| `database-sections.integration.test.tsx` — guarded, busy ceremony and refresh after execute | `hooks/use-migrate-forward-section.hooks.ts:132`: replace invalidates with `[KEYS.schemaState]`; the real timeline stays on the pre-migration row. |
| `database-sections.integration.test.tsx` — rejected plan, localized error and reset | `hooks/use-migrate-forward-section.hooks.ts:140`: remove `startPlanMutation.reset()`; the plan error remains after reset. |
| `database-sections.integration.test.tsx` — rejected confirmation and retry | `hooks/use-migrate-forward-section.hooks.ts:105`: return the plan-failure string for `confirmError`; the exact Spanish confirmation failure check rejects it. |
| `database-sections.integration.test.tsx` — refresh on lost execute response | `hooks/use-migrate-forward-section.hooks.ts:178`: delete the loop that invalidates reads in the catch; the stale drift warning and timeline row remain. |
| `database-sections.integration.test.tsx` — pending vs settled in-sync | `hooks/use-schema-state-section.hooks.ts:75`: return `settled: true` unconditionally; a pending read immediately claims completion. |
| `database-sections.integration.test.tsx` — stale clean result must not mask failed check | `hooks/use-schema-state-section.hooks.ts:72`: provide `error: null`; the previous clean verdict masks the failure instead of displaying translated uncertainty. |
| `database-sections.integration.test.tsx` — submits drafts and pages committed result | `hooks/use-timeline-section.hooks.ts:195`: replace `toDate` with `toDate: fromDate` in `pages.applyFilters`; the port receives the incorrect exact filter. |
| `database-sections.integration.test.tsx` — later-page error retains current rows and permits retry | `hooks/use-timeline-section.hooks.ts:199`: hardcode `const error = null`; the operator never sees the failure notice. |
| `database-sections.integration.test.tsx` — drops a page already in flight when filters change | `packages/ui/src/features/panel-kit/fetch-query/use-cursor-pages.hooks.ts:74`: remove the successful load-more stale-filter early return; the old row and its cursor appear on the newly filtered view. In scope at the host-wiring level, `hooks/use-timeline-section.hooks.ts:188` could instead replace `KEYS.timeline(filters)` with `KEYS.timelineAll`; the changed filter would reuse the unfiltered list and never show the new row. |
| `database-sections.integration.test.tsx` — selected Recovery handoff stored before navigation | `hooks/use-timeline-section.hooks.ts:85-86`: move `navigate(...)` ahead of `sessionStorage.setItem(...)`; the router observes no envelope at navigation. Exact fields also reject row/point ID swaps. |
| `database-sections.integration.test.tsx` — no recovery side effects without a restore point | `hooks/use-timeline-section.hooks.ts:74`: remove `if (!row.restorePointId) return`; the previous envelope is overwritten and navigation is called. |

- collections/__tests__/CollectionEntries.unit.test.tsx · known schema while rows pending → render creation controls before the entries query has any result.
- email/__tests__/EmailActivityTab.unit.test.tsx · no feedback vs forbidden detail → blanket-display "None received yet" even for a 403 or show missing optional facts.
- email/__tests__/EmailTemplateEditor.unit.test.tsx · saved subject fallback and entering As sent → drop the persisted subject or request admin mode from the As sent toggle.
- email/__tests__/use-email-provider.unit.test.ts · partial rotation → require a new token for an already configured provider or send a blank token.

- content-analysis/__tests__/ContentAnalysisCard.unit.test.tsx · same-tick deduplication and save winning → remove inFlight protection or apply a preview without checking the post version captured at request start.
- email/__tests__/EmailSenderTab.unit.test.tsx · future DNS status stays neutral → remove the fallback for statuses absent from RECORD_STATUS.
- email/__tests__/EmailOverviewTab.unit.test.tsx · future use keeps its server label → discard the row label if USE_LABEL lacks its ID.

## Static handoff inventory

Paths in the table are relative to `packages/admin/src/screens`. Counts are new cases after expanding parameterized tests and are not runner results.

| Area | Tests added by suite |
|---|---|
| Auth | auth-i18n 1, use-login 7 |
| Collections | CollectionEntries 2, Collections 4 (2 dismissal and 2 lifecycle), collections-api 8, collections-rules-kit 5, collections-live-ports 3, collections-workflows 10, use-collection-entry-editor 11 |
| Comments | Comments 1 |
| Consent | CookieConsent 9 (2 overview and 7 screen), consent-autosave 1, use-consent-page 2 |
| Content analysis | ContentAnalysisCard 4, host-api-error-shape 14 |
| Dashboard | Dashboard 2, use-dashboard 1 |
| Database | Database 2, schema-state-rules 1, database-api 5, database-sections 11 |
| Email | EmailActivityTab 8, EmailOverviewTab 9, EmailParts 2, EmailSegments 1, EmailSenderTab 16, EmailTemplateEditor 5, EmailTemplatesTab 3, email-api 28 (27 Email and 1 mail status), email-bindings 5, email-load 1, use-email-provider 6 |
| Total | 188 cases across 32 test files (13 new, 19 extended) |

### Existing coverage and exceptions

- SKIPPED-ALREADY-COVERED consent-i18n: `consent-product-copy.unit.test.ts` checks binding independent host names and the English/unknown fallback also has a case in `consent-dictionary.unit.test.ts`.
- SKIPPED-ALREADY-COVERED content-analysis-i18n: `content-analysis-i18n.unit.test.ts` checks key and locale parity, non-empty values, placeholders, and fallback.
- SKIPPED-ALREADY-COVERED email-tabs-i18n: `email-i18n.unit.test.ts`, “includes every wired-tab row in every locale with its placeholders intact”.
- EXCEPTION auth/auth-i18n.ts:57 defensive details-row fallback. The shipped details table covers all login locales and keys, with no runtime injection that could omit a row.
- EXCEPTION consent/consent-i18n.ts:24 defensive missing result after binding. The binding is called with an object containing that exact locale and preserves its key.
- EXCEPTION content-analysis/content-analysis-i18n.ts:414 and email/email-tabs-i18n.ts:201 fail-fast guards activated only by incomplete private table assembly, already guarded by real dictionary parity tests.
- EXCEPTION consent/CookieConsent.tsx:151,167 internal missing-settings throws are behind the loaded-value render gate. EXCEPTION consent/use-consent-page.hooks.ts:66,101-104,111 invariant guards are behind successful draft load and publish eligibility.
- EXCEPTION database/Database.tsx:259 map lookup uses the same row set as its table. Contriving an inconsistent table callback would not test a supported state.
- EXCEPTION email/EmailActivityTab.tsx:182 missing option metadata requires changing the private option table.
- No branches were removed or excluded. Actual residual coverage has not been measured.

### Expected red regressions by inspection

- BUG collections/hooks/use-collection-entry-editor.hooks.ts:428: an earlier row’s slug can outrank another row’s exact ID. Search by ID first, then by slug only if no ID matched.
- BUG consent/use-consent-page.hooks.ts:108-112: the live indicator uses a newer editable value even though the in-flight request published the earlier saved draft. Capture the published draft’s enabled value before awaiting or use persisted revision data returned by the server.
- BUG email/hooks/use-email-activity.hooks.ts:89-98: an old page request can replace a new filtered list. Discard page settlements from old filter generations, including failures and loading state.
- Database note to verify in cloud: reapplying identical Timeline filters may not refresh the read at `hooks/use-timeline-section.hooks.ts:193-196`. No regression was pinned for this because the intended same-criteria semantics are less explicit than the changed-filter cases.

Author Checklist reviewed by inspection for each added test. Relative imports, touched paths, and whitespace were checked statically. No tests, test suites, builds, installs, typechecks, coverage, or mutation runs were executed.
