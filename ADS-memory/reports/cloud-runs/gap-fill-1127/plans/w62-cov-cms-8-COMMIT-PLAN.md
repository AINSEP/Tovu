# CMS coverage gap fill

Static author checklist and mutation reasoning only. No test, typecheck, build, coverage, or mutation execution.

## SEO

- `tool-registrations.test.ts: reads resolved metadata and its version under the entry-specific grant` → return metadata without its editor basis or authorize without the target ID.
- `tool-registrations.test.ts: returns analysis for the selected entry with a missing-description warning` → wire the analysis ID to the metadata handler.
- `tool-registrations.test.ts: passes a null clear and the version basis to the override writer, not as SEO fields` → stop stripping `expectedVersion` from the patch, or strip null values from it.
- `tool-registrations.test.ts: returns input guidance for a refused override field typo` → omit `SeoFieldValidationError` from the schema-guidance classifier.
- `tool-registrations.test.ts: returns input guidance for a refused override field canonical` → omit `SeoInvalidCanonicalUrlError` from the schema-guidance classifier.
- `tool-registrations.test.ts: does not authorize or persist a cancelled override write` → remove the handler's abort check.
- `write-service.lost-update.test.ts: deletion during a conditional save reports the vanished editor basis without recreating the post` → replace the null current-version fallback with the submitted version.
- `write-service.test.ts: setEntrySeoOverrides: an explicitly undefined patch member preserves a saved override` → assign undefined to the override instead of preserving it.

## Site settings

- `chat-execution-write.unit.test.ts: blanking the model override repairs that axis without validating stale sibling values` → remove the separate explicit empty override handling.
- `chat-execution-write.unit.test.ts: clearing the model value validates the nonempty inherited workspace model` → substitute empty string for the inherited model.
- `form-delivery-write.guard.unit.test.ts: the typed bindings writer refuses stale snapshots and allows a reread and retry without a phantom revision` → pass the unguarded repo from the typed writer even when an expected snapshot was supplied.
- `form-delivery.unit.test.ts: rejects non-string reference with field-specific guidance` → omit the string-type check.
- `form-delivery.unit.test.ts: rejects empty reference with field-specific guidance` → allow empty connection references.
- `form-delivery.unit.test.ts: rejects oversize reference with field-specific guidance` → raise the limit to 257.
- `form-delivery.unit.test.ts: rejects scalar formIds with field-specific guidance` → coerce a scalar selector to a singleton list.
- `form-delivery.unit.test.ts: rejects oversize formIds list with field-specific guidance` → remove the list limit.
- `form-delivery.unit.test.ts: rejects non-string middle form ID with field-specific guidance` → only validate the first form ID.
- `form-delivery.unit.test.ts: keeps an empty selection distinct from all forms and accepts the maximum explicit list` → omit empty lists or change the maximum list comparison to inclusive rejection.
- `injected-settings-ports.unit.test.ts: an unregistered receiver or a non-string stored value leaves destination selection to the host` → coerce found values to strings or return a fixed receiver when absent.
- `injected-settings-ports.unit.test.ts: the mail sender omits blank or corrupt properties without hiding the other valid property` → return an empty email property after trimming or coerce numeric sender names.
- `injected-settings-ports.unit.test.ts: new sites with no forms definitions get automatic pull and no delivery bindings` → turn off automatic pull on an absent setting.
- `mail-provider.unit.test.ts: an unregistered provider is unset for boot but unavailable to the addressed revision reader` → report explicit off for a missing definition or supply a fabricated revision-zero selection.
- `mail-provider.unit.test.ts: registration distinguishes an unset provider from explicit off and does not replace the stored lanes` → parse the registered provider default as explicitly off.
- `mail-provider.unit.test.ts: a corrupt stored lane is disarmed without being mistaken for the first boot` → accept the transactional lane despite an invalid bulk lane.
- `mail-provider.unit.test.ts: a stale provider approval does not overwrite the newer lane assignment` → drop the writer's optional revision guard when forwarding to the settings chokepoint.
- `mail-provider.unit.test.ts: provider parsing keeps lane positions and only accepts nonempty strings or explicit nulls` → swap the transactional and bulk outputs or coerce invalid lane values.
- `mail-provider.unit.test.ts: mail test mode reads redirects, capture and fail-closed values fresh on every send` → stop trimming redirect addresses or cache the first read.
- `mail-provider.unit.test.ts: test mode parsing cannot activate a redirect from an unknown mode or non-string address` → let any object containing an email address enable redirect.
- `site-title-write.unit.test.ts: site title bounds trim before measuring, reject blank or oversized titles, and keep the previous value` → persist the untrimmed value or accept an empty normalized title.
- `site-title-write.unit.test.ts: visitor enable through an alias requires the host's readiness decision for this workspace` → check raw coordinates rather than the canonical definition, or default to ready.
- `site-title-write.unit.test.ts: preview switcher refuses an uncomposed writer and persists the theme policy's normalized proposal` → bypass the theme policy.
- `site-title-write.unit.test.ts: clears an ordinary workspace value and resets only the requested namespace keys` → drop the forwarded key list or return without clearing.
- `publish-content.unit.test.ts: a share image reference includes its media UUID, but slugs, URLs and other settings do not` → collect dependencies from non-image settings or remove the UUID test.
- `publish-content.unit.test.ts: outbound inclusion and inbound publish reject local or malformed image URLs but allow public URLs` → allow malformed URL syntax or skip the local filter at apply time.
- `publish-content.unit.test.ts: applying a cleared source value clears the existing destination and packs its new revision` → route the cleared state through `set` with a null value instead.
- `settings-confirm-write.unit.test.ts: an omitted proposal displays as null and can be confirmed without plugin details` → drop the null display fallback or unconditionally emit plugin details.
- `site-timezone.unit.test.ts: an unregistered site with no creation record uses the server zone` → stop after the missing ledger tier and return the absent creation zone.
- `site-timezone.unit.test.ts: a non-Error ledger failure reports Unknown and still uses the trimmed creation zone` → stringify a thrown non-Error into `errorClass`.
- `site-title.unit.test.ts: an explicit title wins while a workspace is pending and an unusable fallback name renders the legacy title` → check the pending marker before honoring a usable owner title.
- `visitor-tools-configure.unit.test.ts: passes through each legal mode and keeps a supplied partial quota beside it` → parse a legal mode as absent or drop the limit update when a mode is also present.

### Visitor management

- `visitor-tools-management.unit.test.ts: prepares public access without writing, then saves only the approved choice through the dedicated grant` → persist in prepare or drop the dedicated permission override.
- `visitor-tools-management.unit.test.ts: refuses approval after either a source revision change or revocation and leaves the policy untouched` → remove the prepared-catalog comparison or skip fresh apply authorization.
- `visitor-tools-management.unit.test.ts: corrupt storage is disarmed and can only be repaired with an explicit site-wide Off` → let a single-tool proposal replace an unreadable site-wide policy.
- `visitor-tools-management.unit.test.ts: shows a removed configured tool as unavailable and allows it to be turned Off but not republished` → remove unavailable stored entries from the view or permit their escalation.
- `visitor-tools-management.unit.test.ts: rejects stale preparation and rolls back a stale approved write without consuming a revision` → drop the guarded repo when a revision basis was supplied.
- `visitor-tools-management.unit.test.ts: does not substitute an upgrade-policy default for an unregistered definition, and propagates ledger faults` → treat an absent definition or storage exception as a revision-zero default policy.
- `visitor-tools-management.unit.test.ts: rejects duplicate, reserved and out-of-bounds source catalogs instead of presenting ambiguous targets` → remove reserved ID, duplicate or size validation in catalog normalization.
- `visitor-tools-management.unit.test.ts: can switch Off a dotted tool identity that the service listed as eligible` → reject dots in the configure ID pattern despite accepting them in the catalog. This regression is already present at the baseline.
- `visitor-tools-management.unit.test.ts: a declined publication card exposes the exact source, proposed access and revision but does not save` → drop source-revision binding or omit the decision's previous/proposed quota from the card.
- `visitor-tools-management.unit.test.ts: routes safe reductions directly and maps stale requests to explicit reload guidance` → always send access details, or throw a raw revision conflict rather than sending reload guidance.
- `visitor-tools-management.unit.test.ts: list and deferred source tools validate inputs and remain permission gated` → bypass service authorization in deferred delete or return an availability code when management was never composed.
- `visitor-tools-management.unit.test.ts: policy capacity reclaims unavailable Off entries but refuses to silently drop a live choice` → reclaim unavailable entries regardless of mode.
- `visitor-tools-management.unit.test.ts: overlapping memory transactions report a visitor revision conflict and do not save a second policy` → let the memory adapter's generic nonreentrancy error escape instead of mapping it to a revision conflict.

## Site inspection and content store

- `site-profile.test.ts: pages counts all living content while returning only a body-free sample` → include trashed rows or tally from the limited sample.
- `site-profile.test.ts: page limits fall back on invalid values, clamp at the public ceiling and omit truncation when all fit` → drop the limit ceiling, accept negative/fractional limits, or always emit truncation.
- `site-profile.test.ts: operators see only this workspace's plugin activations and counts for non-tombstoned content types` → group activation across workspaces or return tombstoned content types.
- `site-profile.test.ts: settings disclose only inventory keys and drop values strictly past the serialized cap` → change the cutoff from greater-than to greater-or-equal or treat false as absent.
- `site-inspection/__tests__/tool-registrations.test.ts: profile and capabilities tools ask only for their selected sections and carry the caller and page limit` → discard requested sections or stop forwarding pageLimit.
- `site-inspection/__tests__/tool-registrations.test.ts: section input errors include the calling tool's vocabulary and its schema` → drop a foreign section silently or use the wrong tool's schema.
- `site-inspection/__tests__/tool-registrations.test.ts: null sections use the profile default instead of suppressing collection` → reject a null selector instead of defaulting.
- `site-inspection/__tests__/tool-registrations.test.ts: a guarded live fetch carries the authorized path, options, and injected policy` → omit the host reserved-path set or authorized scope.
- `site-inspection/__tests__/tool-registrations.test.ts: invalid origins and an unwired live client never reach the fetch port` → accept a numeric origin or skip the live-port wiring guard.
- `site-inspection/__tests__/tool-registrations.test.ts: published fetch binds the host render and ports, and only decorates recognized path refusals` → use different path/body arguments or convert all storage failures to schema errors.
- `site-capabilities.test.ts: the screen inventory carries declared navigation metadata without exposing private host fields` → drop the declared route-template fields or spread the host row.
- `keep-off-content-store.test.ts: reassigns only the active theme rows matching the retired theme` → remove the old theme predicate.
- `keep-off-content-store.test.ts: reads and rewrites one menu's document without affecting other menu identities` → apply the menu update without its identity predicate.
- `keep-off-content-store.test.ts: reads form fields and disables only the selected form, then closes its database` → update every form or make close a no-op.

## Taxonomy

- `taxonomy/__tests__/tool-registrations.test.ts: taxonomy reads return the addressed term and its group without writing` → use the wrong term ID or omit the group's term lookup.
- `taxonomy/__tests__/tool-registrations.test.ts: assignment and unassignment both reject an invalid middle term before changing the current set` → weaken either array element validator to check only the first element.
- `taxonomy/site/__tests__/publish-term-ids.test.ts: packs sorted term identities without changing the caller's state or adding an empty field` → omit sorting or inject empty termIds.
- `taxonomy/site/__tests__/publish-term-ids.test.ts: apply and revert swap the exact assignment sets and emit one scoped event per write` → remove unassign or revert using the same operand order as apply.
- `taxonomy/site/__tests__/publish-term-ids.test.ts: a missing added term blocks the destination write with its term identity` → ignore a missing term while still refusing trashed terms.
- `taxonomy/site/__tests__/publish-content.test.ts: taxonomy publish carries the original ID and hierarchy flag, and blocks a held destination name` → omit hierarchy from the packed schema or do not look up name holders.
- `taxonomy/site/__tests__/publish-content.test.ts: term precheck looks for name collisions only among siblings and references the exact parent` → check name collisions without parent identity or omit parent references.

## Themes

- `manifest-v2.test.ts: rejects id=empty with v2-id` → remove the ID length check.
- `manifest-v2.test.ts: rejects id=3 with v2-id` → accept numeric IDs.
- `manifest-v2.test.ts: rejects name=empty with v2-name` → remove the name length check.
- `manifest-v2.test.ts: rejects name=false with v2-name` → coerce non-string names.
- `manifest-v2.test.ts: rejects version=v1.2.3 with v2-version-semver` → remove the leading semver anchor.
- `manifest-v2.test.ts: rejects version=2 with v2-version-semver` → accept numeric versions.
- `manifest-v2.test.ts: rejects tier=freeform with v2-tier` → accept every string tier.
- `manifest-v2.test.ts: rejects tier=[] with v2-tier` → allow arrays for the tier.
- `manifest-v2.test.ts: rejects license=MIT with v2-license-shape` → accept scalar licenses.
- `manifest-v2.test.ts: rejects authors={ name: Someone } with v2-authors-shape` → accept a single object instead of an author list.
- `manifest-v2.test.ts: rejects attributions=null with v2-attributions-shape` → treat explicit null as absent.
- `manifest-v2.test.ts: rejects regions={ main: true } with v2-regions-shape` → accept a map instead of the regions array.
- `manifest-v2.test.ts: rejects unknown top-level keys while disclosing recognized fields the loader ignores` → stop emitting unknown-key violations or stop reporting unread recognized fields.
- `manifest-v2.test.ts: schema and runtime template ownership agree on an invalid templateFor shape` → skip runtime templateFor validation during manifest validation.
- `manifest-v2.test.ts: legacy scalar engine is rejected and even a valid engine object tells authors it will be discarded` → accept numeric engines or omit the valid-object disclosure.
- `manifest-v2.test.ts: nested tokens, partials and renderer each warn once with their own shape issues` → stop skipping explicit warnings in the generic sweep, or accept an inherited property as a declared token mode.
- `manifest-v2.test.ts: build metadata rejects malformed and unknown declarations while allowing known optional fields` → drop the closed source/framework vocabulary.
- `manifest-v2.test.ts: compiled builds require a real source directory and hashes, and report host-reserved directories` → accept missing artifact hashes or skip the host directory policy.
- `atomic-write.test.ts: reviewed replacement refuses intervening bytes without creating a revision, then commits a fresh review` → stop checking the reviewed digest or stop returning the committed digest.
- `atomic-write.test.ts: a revision copy refusal removes the reserved revision and staged bytes before replacing the live file` → omit removal of the reserved revision on failed copy.
- `atomic-write.test.ts: retention failure reports the fault without rolling back the committed replacement` → throw the pruning error as the replacement outcome or drop it entirely.
- `atomic-write.test.ts: an exclusive sequence slot occupied by a file is skipped without overwriting it` → surface EEXIST instead of retrying at the next revision identity.
- `atomic-write.test.ts: retention does not follow a nested symlink in an old revision toward an unrelated file` → follow symlinks with stat during the nested ancestor check.
- `themes/files/__tests__/trash.test.ts: the locator carries the discovered engine tier into the new parking path` → flatten the parking path instead of carrying the active tier.
- `preview-refresh.test.ts: invalid UTF-8 escapes in a preview path fail with public-path guidance` → rethrow the native decoding error instead of the public ToolInputError.
- `watcher.native.test.ts: the default native watcher refreshes after a theme file changes on disk` → drop the native watcher's onChange forwarding.
- `originals.test.ts: a file truncated after its same-size stat is still detected as modified` → compare only the shorter common prefix and treat equal prefixes as identical.
- `read-content.test.ts: an explicit cursor at UTF-8 EOF returns an empty final page, while a small unpaged read keeps its compact shape` → reject offsets equal to the selected byte length or apply the compact response to explicit cursors.

## Trash

- `directory-adapter.test.ts: an inside parking location or invalid live segment is rejected without moving bytes` → remove either containment or one-segment validation.
- `directory-adapter.test.ts: a symlink parked as a root does not change the external target or its mode` → resolve and move the referent rather than the symlink itself.
- `directory-adapter.test.ts: a non-directory parking ancestor is a filesystem error, not an absent item` → swallow non-ENOENT lstat failures.
- `directory-adapter.test.ts: directory-backed kinds advertise the distinct persisted Trash IDs used by the host` → rename or conflate the plugin/theme entity IDs.
- `trash/permanent/__tests__/tool-registrations.test.ts: holds a fixed row through the card and does not execute after a confirmation-time abort` → execute without checking the post-confirmation abort signal, or pass the raw untrimmed row ID.
- `marker-adapters.test.ts: post marker flips preserve unreadable body bytes and enforce CAS across retries` → remove the version or workspace predicate, or rewrite payload as part of the marker flip.
- `marker-adapters.test.ts: post purge rolls back a failed search probe and a retry removes only the target projections` → retain a rejected probe as the schema answer or omit removal of the search projection.
- `marker-adapters.test.ts: a redirect restore reactivates the addressed marker only` → restore to disabled or drop the workspace constraint.
- `marker-adapters.test.ts: media changes report the committed kind, version and timestamp, and a failed report rolls back the marker` → report outside the atomic transaction.
- `marker-adapters.test.ts: retrying a media hide in the same clock tick does not publish a duplicate change` → infer a real transition solely from matching updated_at. This regression is already present at the baseline.
- `marker-adapters.test.ts: media purge distinguishes references, infrastructure failures and a removed asset` → swallow a non-reference failure or return purged while the row remains.
- `marker-adapters.test.ts: member credential consumption touches only this member's unconsumed tokens and never rewinds a credential fence` → update consumed tokens or apply the fence without its monotonic predicate.
- `move-to-trash.test.ts: a registered mover wins over a table entry, but only after its own entity-scoped authorization` → choose the registry binding before the custom mover or omit its permission.
- `move-to-trash.test.ts: a missing live row and an unknown kind do not reach the write port` → treat a missing snapshot as a generic writable row.
- `move-to-trash.test.ts: the atomic Trash port receives the observed row and the caller sees its exact typed outcome` → drop the observed write version, or replace a blocked response with a generic race.
- `scheduler.node.test.ts: cancels only the selected purge deadline, including repeated and unknown cancellations` → fail to clear the selected timer or cancel both pending deadlines.
- `visibility.test.ts: bound visibility forwards per-item authorization and shares the same registry fallback for list and action` → omit the bound permission map or the individual entity identity.
- `visibility.test.ts: trash retention rounds a fractional remaining day up and never shows negative days` → round down or remove the floor at zero.
- `y5-trash-bindings.test.ts: the bound post delegate preserves the actual page kind and refuses a missing page` → always forward post, or call the delegate even when the target lookup returns no row.
- `table-adapter.dialects.test.ts: restore refuses an obsolete version, and a versionless purge removes only the claimed trashed row` → remove the unhide version guard or always require a version column for purge.
- `table-adapter.dialects.test.ts: two-hop purge removes only assignments joined through this parent's child IDs` → skip the through-table lookup or omit the matched-child filter.

## Sidekick test and mutation ledger (with interim checkpoints)

# Sidekick ledger — cms-coverage-tail

- Status: in progress, static readback only. Persona, honest-testing, and mistakes checklist loaded. Graph MCP and repo-local binary unavailable, Graphify artifact absent, understand-anything contains no matching scoped file nodes.
- Scope: TDD-only for enumerated CMS WebMCP, widget, workspace gaps. No tests, installs, builds, typechecks, coverage, or mutations run. Each mutation below is a proposal to verify separately, not an applied source edit.

| Source | Added test title | Proposed one-line mutation |
| --- | --- | --- |
| webmcp/settings.ts | bootstrap preserves the existing privacy defaults and registers workspace WebMCP enabled by default | L22 change `defaultValue: true` to `defaultValue: false` |
| workspace/repo.memory.ts | a guarded update reports a deleted workspace without recreating it | L55 change `current?.version ?? null` to `current?.version ?? 0` |
| workspace/sql/repo.ts and workspace/sql/index.ts | a guarded write to a deleted workspace reports no current version and leaves other rows alone | repo L83 change `?.version ?? null` to `?.version ?? 0`; removing `SqlWorkspaceRepo` from the explicit barrel export would separately fail the same consumer test |
| widgets/entry-refs-extractor.ts | indexes typed config references across namespaces without treating arbitrary strings as references | L54 return `entry` for `TermId` instead of `term` |
| widgets/entry-refs-extractor.ts | indexes authored media in widget embeds even when the adjacent media selection is invalid | L166 change `targetKind: 'asset'` to `targetKind: 'entry'` |
| widgets/entry-refs-extractor.ts | indexes repeated gallery media at its authored positions even with an invalid layout | L391 change `[${image.index}]` to `[0]` |
| widgets/entry-refs.memory.ts | removing source references preserves the same source in another workspace and other sources in the workspace | L35 remove the workspace conjunct from the removal predicate |
| widgets/entry-refs.memory.ts | rebuilding a workspace replaces its entire reference index without touching another workspace | L41 reverse `!==` to `===` |
| widgets/html/media-html.ts | keeps valid responsive sources and drops the entire srcset when a candidate is empty, malformed, or not HTTP(S) | L38 remove the `srcset` guard |
| widgets/html/media-html.ts | bounds nesting inside templates while preserving markup which fits the limit | L65 increase depth limit from 128 to 129 |
| widgets/html/media-html.ts | preserves SVG geometry and removes namespaced links | L36 change the SVG attribute branch to `return false` |

## Exceptions and follow-ups

- Caption track L53–54: native URL parsing cannot throw for the root-relative `/m/` URL already guaranteed by L46 and the fixed valid base. Existing caption track cases already prove actual user-visible malformed and out-of-route sources omit the track. Do not stub URL just to run the catch.

## Widget tool tests

| Source | Added test title | Proposed one-line mutation |
| --- | --- | --- |
| widgets/tool-handlers.areas.ts and widgets/tool-registrations.ts | an explicit region content override survives a stale edit and is returned by the host read tool | handlers L50 return `{}` instead of `{ content }`; separate registration mutation at L140 replace the host read instruction's resolved lookup with neutral literal wording |
| widgets/tool-handlers.areas.ts, widgets/tool-handlers.instances.ts and widgets/tool-registrations.ts | reading a stale binding and trashing a non-widget report the specific not-found codes | instances L130 remove the `entry.type !== WIDGET_CONTENT_TYPE` guard; area L73 can separately remove the corresponding area entry type guard |
| widgets/tool-handlers.areas.ts | embed tools return the saved entry version and persist placements and reference changes | L178 return the request's baseVersion in place of the persisted `entry.version` |
| widgets/tool-registrations.ts and widgets/tool-handlers.areas.ts | embed rejections tell the model whether the host, placement, or reorder input must be corrected | registration L126 return the original error instead of the placement-not-found `ToolInputError`; handlers L165 remove the requirement that each supplied id be a nonempty string |

## Current handoff

- Status: HANDOFF NEEDED due to Sidekick context-budget threshold (~85 points). Static whitespace diff check passed. No test, build, typecheck, coverage, install or mutation was run.
- Authored 15 test declarations. Workspace SQL dialect-matrix test registers in two dialects, so expected Vitest case delta is 16, subject to the coordinator's run.
- Counts by target: webmcp/settings 1; widgets/entry-refs-extractor 3; widgets/entry-refs.memory 2; widgets/html/media-html 3; widgets/tool-handlers.areas 4; widgets/tool-handlers.instances 1 shared; widgets/tool-registrations 3 shared; workspace/repo.memory 1; workspace/sql/repo and index 1 shared. Existing workspace/repo.memory.test.ts already verifies an unguarded unknown ID is ignored; new test adds the deleted-row optimistic-concurrency behavior. No tests removed, skipped or weakened.
- Still pending: widgets/content-markers.ts, document-markers.ts, duplicate-embeds.ts, markers/expand-partials.ts, media-embed-resolution.ts line 167, page-widget-resolution.ts, resolvers/create-core-resolvers.ts, site/publish-content.ts, widget-slug-normalization.ts.
- Existing resolver wiring tests cover gallery present/unwired, menu resolver present/unwired, timezone present/unwired. Remaining branches look like contact-form optional `formCollectionProviders` / `formEmbedConsentOff`; test through the real resolver rather than spying on constructor calls.
- Existing publish test mocks importWidgetInstance for the form swapping case. For new coverage keep callbacks and publication gateway real, with in-memory entry and form ports. Initial read found the missing ranges correspond to inventory/packing and references, destination validation, and widget-area apply.
- Candidate branch-only slug normalization: existing all-resolve, only-missing and all-ineligible tests do not cover mixed eligible/missing/unrelated markers in one successful splice. Assert exact unchanged miss and sibling HTML plus rewritten known slug.
- Existing tool error mapping tests cover `WidgetForbiddenError` and unbound region, not specific embed errors or deleted/wrong-type widget. New tests hit area content, area and widget not-found, embed host absent/unsupported, placement missing, schema-bearing invalid reorder, and mutation round trips. Source L130 raw-error passthrough remains untested. Defer to coordinator if exact remaining branch is needed.
- Live state: no background processes. Test edits are in shared workspace. Only scratch artifact is this ledger.

## Restart publication and raw error tests (in progress)

| Source | Added test title | Proposed one-line mutation |
| --- | --- | --- |
| widgets/site/publish-content.ts | packs portable form links and scoped media references, excluding trashed widgets | L104 return config unchanged instead of swapping to the form slug; L117 independently omit authored media config references |
| widgets/site/publish-content.ts | precheck rejects a conflicting slug held in the destination Trash | L170 replace findAnyBySlug with findBySlug |
| widgets/site/publish-content.ts | destination precheck distinguishes an installed type with bad settings from a valid widget | L257 return null even if check.valid is false |
| widgets/site/publish-content.ts | publishing a contact form widget writes the destination form id and preserves its portable hash | L263 change forms.findBySlug to a lookup of the incoming value by id |
| widgets/site/publish-content.ts | publishing an area rejects missing placements without binding, then replaces placements on its destination row | L226 remove advance placement validation or independently omit the binding reconciliation at L234 |
| widgets/tool-registrations.ts | an unexpected repository failure is propagated without turning it into a model input error | L130 return a ToolInputError instead of the original repository error |

Old form swap test's fixture now provides the changeSets port required by the real gateway. No assertions or pre-existing tests removed.
| widgets/media-embed-resolution.ts | adds the sibling WebVTT track to a video player and omits it when the caption asset is missing | L168 return null even when the host resolves a track |
| widgets/widget-slug-normalization.ts | a resolvable slug is indexed without rewriting unresolved and unrelated siblings | L68 use withAddedId with a sentinel when the lookup misses instead of preserving the original marker |
| widgets/content-markers.ts | targetless and unreadable content markers keep their authored fallback without spending extra reads | L29 accept empty strings as slug references |
| widgets/document-markers.ts | malformed children stay with the document renderer and non-text marker attributes are omitted | L29 coerce a truthy non-string alt with String(attrs.alt) |
| widgets/duplicate-embeds.ts | JSON null and array attributes survive copying while only an addressable neighboring embed spends an id | L32 remove the null filter from object detection |
| widgets/markers/expand-partials.ts | accepts extensionless slot keys without consuming targetless markers | L11 unconditionally strip five characters from the source |
| widgets/resolvers/create-core-resolvers.ts | the assembled contact form resolver exposes a host provider plan and its explicit consent policy | L53 omit formCollectionProviders or independently omit formEmbedConsentOff |

Duplicate-embeds explicit invariant guards L59/L75 cannot see an undefined entry/frame through its internal dense arrays and checked loop bounds. Do not mock Array.prototype or Object.entries to hit them. Document-markers' unknown token fallback L59 is a collision guard: the caller deliberately picks a token that cannot collide with ordinary author text. Do not manufacture a bad renderer merely for that branch.

| Source | Added test title | Proposed one-line mutation |
| --- | --- | --- |
| widgets/page-widget-resolution.ts | passes the page's diagnostic reporter to a gallery resolver while preserving the region output | L122 omit report from the context |

## Restart final state

- Added 14 Vitest test declarations (5 publication, 1 raw error, 1 captions, 1 slug, and 6 branch-led tests: content markers, document markers, duplicate embeds, partials, core resolver, page resolver). No declarations removed, weakened, or skipped. With predecessor's 15, total tail delta is 29 declarations, expected 30 test cases due to the workspace SQL dialect matrix.
- The only existing test change in the restart is wiring the gateway's required changeSets port into its existing mocked form apply case.
- No test, build, typecheck, install, coverage or mutation command run, per coordinator. No commits. Static whitespace diff check only.
- Remaining exact branch coverage cannot be confirmed without the coordinator's measurement. Duplicate copy invariant guards and the document token collision fallback are intentionally not fake-tested.

## cms-branch-followup

| Source | Added test title | Proposed one-line mutation |
| --- | --- | --- |
| taxonomy/assignment-service.ts | a taxonomy unassignment records its own trusted actor, not the assigning actor | Omit the actor spread at L217 |
| taxonomy/render-entry.ts | renders an empty hierarchy without a list and keeps ordinary descendants under their root | Always emit the list wrapper at L34, including for empty content |
| trash/sql/entry-sql.ts and trash/sql/not-trashed.ts | a joined snapshot omits undeclared fields and hides the child of a timestamp-trashed parent | L51 skip the display join, or independently change the timestamp parent's `is not null` filter at not-trashed L58 to `is null` |
| trash/sql/repo.ts | timestamp ties page by id and unversioned trash stays null when read or claimed | L208 drop the equal-timestamp/id-before clause or independently coerce a null entity version to zero at L267 |
| trash/sql/table-adapter.rows.ts | an adapter with no touch or version column changes only the configured trash marker | L28 remove the configured version-column requirement from the CAS predicate |
| trash/tool-registrations.ts | keeps the next cursor on a fully hidden page without querying actor names | L168 always load actor names |

- Taxonomy SQL repo fallback rationale: the abortable/mutation and present/absent cases already have SQLite and PGlite coverage in `taxonomy/__tests__/sql.repo.dialects.test.ts`. Entry-term test “upsert is idempotent per (content, term)” asserts positive and zero aggregate counts, while term test “countChildren counts direct children only, whatever their status” and cross-workspace read case assert exact positive and zero counts. An ungrouped SQL COUNT always yields a nonnull count row, including when no rows match, so the optional fallback in entry-term L131 and term L178 cannot be forced with genuine SQL. Existing term tests also assert present/absent full, lightweight, trash-blind, parent and joined snapshot reads. No DB-mocking tests added.
- Table adapter driver-result fallbacks: a genuine Kysely UPDATE supplies its row count, including zero. The existing adapters cover version/no-op/stale guard, and the new test verifies valid unversioned operations do not read or modify metadata.
- Scoped whitespace readback performed only. No tests/build/typecheck/install/coverage/mutation commands ran.

## Static review additions

- `seo/__tests__/tool-registrations.test.ts: a stale override write names the configured read tool and preserves the newer saved SEO` → omit the expectedVersion option when calling the real writer.
- `mail-provider.unit.test.ts: a cleared mail provider uses unset defaults without losing the addressed revision` → report zero revision for a cleared stored row.
- `atomic-write.test.ts: a disappearing revision root reports ENOENT and leaves the live file and sibling directory untouched` → catch and ignore a non-collision failure during revision directory reservation.

- `scheduler.node.test.ts: a native sweeper timer does not keep the host process alive` → remove the native timer's `unref()` call.

## Known bugs and remaining verification

- BUG `packages/cms/src/settings/site/visitor-tools-configure.ts:33`: direct configuration rejects dotted IDs accepted by `visitor-tools-service.ts:32`. Share the catalog validator with direct configuration while keeping the reserved site-wide target.
- BUG `packages/cms/src/trash/site/adapters/media.ts:62`: a same-timestamp idempotent hide emits a duplicate media change. Surface an explicit no-op/applied bit from the SQL marker flip and gate reporting on actual application instead of comparing timestamps.
- Proposed narrow exceptions only, not approved exclusions. Physical cross-filesystem/rmdir/reservation errors and native watcher's asynchronous error callback still need a deterministic seam. No fake filesystem or artificially impossible SQL return value was manufactured.

## Static test inventory

145 added Vitest declarations in 57 suites. A declaration can expand to multiple runtime cases (parameterized and dialect-matrix tests). No runtime coverage/pass claims.

| Test file under packages/cms/src | Declarations added |
| --- | ---: |
| `seo/__tests__/tool-registrations.test.ts` | 6 |
| `seo/__tests__/write-service.lost-update.test.ts` | 1 |
| `seo/__tests__/write-service.test.ts` | 1 |
| `settings/site/__tests__/chat-execution-write.unit.test.ts` | 2 |
| `settings/site/__tests__/form-delivery-write.guard.unit.test.ts` | 1 |
| `settings/site/__tests__/form-delivery.unit.test.ts` | 2 |
| `settings/site/__tests__/injected-settings-ports.unit.test.ts` | 3 |
| `settings/site/__tests__/mail-provider.unit.test.ts` | 8 |
| `settings/site/__tests__/publish-content.unit.test.ts` | 3 |
| `settings/site/__tests__/settings-confirm-write.unit.test.ts` | 1 |
| `settings/site/__tests__/site-timezone.unit.test.ts` | 2 |
| `settings/site/__tests__/site-title-write.unit.test.ts` | 4 |
| `settings/site/__tests__/site-title.unit.test.ts` | 1 |
| `settings/site/__tests__/visitor-tools-configure.unit.test.ts` | 1 |
| `settings/site/__tests__/visitor-tools-management.unit.test.ts` | 13 |
| `site-inspection/__tests__/site-capabilities.test.ts` | 1 |
| `site-inspection/__tests__/site-profile.test.ts` | 4 |
| `site-inspection/__tests__/tool-registrations.test.ts` | 6 |
| `site/__tests__/keep-off-content-store.test.ts` | 3 |
| `taxonomy/__tests__/render-entry.test.ts` | 1 |
| `taxonomy/__tests__/tool-registrations.test.ts` | 2 |
| `taxonomy/__tests__/write-service.test.ts` | 1 |
| `taxonomy/site/__tests__/publish-content.test.ts` | 2 |
| `taxonomy/site/__tests__/publish-term-ids.test.ts` | 3 |
| `themes/__tests__/manifest-v2.test.ts` | 7 |
| `themes/files/__tests__/atomic-write.test.ts` | 6 |
| `themes/files/__tests__/originals.test.ts` | 1 |
| `themes/files/__tests__/read-content.test.ts` | 1 |
| `themes/files/__tests__/trash.test.ts` | 1 |
| `themes/preview/__tests__/preview-refresh.test.ts` | 1 |
| `themes/preview/__tests__/watcher.native.test.ts` | 1 |
| `trash/__tests__/directory-adapter.test.ts` | 4 |
| `trash/__tests__/sql.kit.test.ts` | 1 |
| `trash/__tests__/sql.repo.dialects.test.ts` | 1 |
| `trash/__tests__/table-adapter.dialects.test.ts` | 3 |
| `trash/__tests__/tool-registrations.test.ts` | 1 |
| `trash/__tests__/visibility.test.ts` | 2 |
| `trash/__tests__/y5-trash-bindings.test.ts` | 1 |
| `trash/permanent/__tests__/tool-registrations.test.ts` | 1 |
| `trash/site/__tests__/marker-adapters.test.ts` | 7 |
| `trash/site/__tests__/move-to-trash.test.ts` | 3 |
| `trash/site/__tests__/scheduler.node.test.ts` | 2 |
| `webmcp/__tests__/webmcp-settings.test.ts` | 1 |
| `widgets/__tests__/content-markers.test.ts` | 1 |
| `widgets/__tests__/document-markers.test.ts` | 1 |
| `widgets/__tests__/duplicate-embeds.test.ts` | 1 |
| `widgets/__tests__/entry-refs-extractor.test.ts` | 3 |
| `widgets/__tests__/entry-refs.memory.test.ts` | 2 |
| `widgets/__tests__/expand-partials.test.ts` | 1 |
| `widgets/__tests__/media-html.unit.test.ts` | 3 |
| `widgets/__tests__/tool-registrations.test.ts` | 5 |
| `widgets/__tests__/unit/resolver-service.unit.test.ts` | 2 |
| `widgets/__tests__/unit/resolvers-core-wiring.unit.test.ts` | 1 |
| `widgets/__tests__/unit/widget-slug-normalization.unit.test.ts` | 1 |
| `widgets/site/__tests__/publish-content.test.ts` | 5 |
| `workspace/__tests__/repo.memory.test.ts` | 1 |
| `workspace/__tests__/sql.repo.dialects.test.ts` | 1 |
