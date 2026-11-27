# CMS coverage gap fill

Tests only. Mutation predictions are from source review, not execution. Each entry names the real behavior that should turn red if the change lands.

## Settings

- `admin-http/routes/settings/__tests__/writes.test.ts` — “defaults the op to register and persists site and platform definitions in their own partitions” → omit the register batch call, default absent ops to an empty string, or store all definitions in the platform partition.
- Same file — “renames then retypes the new key before applying a queued registration” → omit the new namespace, new key, or coercion tag from the dispatch item, or stop dispatching non-register ops in order.
- Same file — “an unknown op stops queued registers but preserves the earlier rename” → apply registers eagerly instead of holding them until the full batch has been parsed.
- Same file — “sends a named user target through the other-user permission and write port” → always return an undefined principal ID from the request parser.
- Same file — “rejects a foreign workspace before authorization or reset” → remove the foreign-workspace refusal from the reset handler.
- Same file — “refuses a missing namespace” (null and missing property) → drop the body fallback or the required namespace check, respectively.
- `admin-http/routes/settings/__tests__/shared.test.ts` — “preserves the public text even when a custom mapping handles a string refusal” → replace the string fallback with a generic message.
- Same file — “fences a protected alias on a keyed write and namespace reset, but not an unrelated active key” → check the alias source instead of its resolved target, remove reset key expansion, expand keyless batch items, or use raw namespace values instead of stringifying them.

## System

Paths in this section are relative to `packages/cms/src/admin-http/routes/system`, except the y5 import suite.

- `__tests__/credential-copy.test.ts` — “lists only picker-facing fields” → omit `omittedCount: 0` or snapshot a different key id.
- Same file — “fails closed when the mount omits” (principal / authorizer) → replace the corresponding deliberate error with a default principal / permissive authorizer.
- Same file — “refuses non-owners” → remove the owner comparison.
- Same file — “propagates RBAC denial” → ignore the authorization rejection and continue to the instance gate.
- Same file — “refuses instance denial” → remove the instance-admission result check.
- Same file — “offers no saved keys” (no store / remote browser) → return a 200 empty picker when the store is absent / bypass `isLocalRequest`.
- Same file — “rejects %s without resolving a key” (null / string / array) → remove the respective body guard so validation touches or accepts an unsupported shape. Extra field / wrong source / scalar ids / empty ids / 101 ids / two ids / number id / empty id / overlong id / control character / overwrite → omit the corresponding validation. For bounds already dominated by single-selection validation (zero and 101), mutate the single-selection acceptance to include the boundary as well.
- Same file — “writes one reference” → return the input id instead of the granted reference or drop the kind-specific authorization.
- Same file — “declines to write when the key kind's instance admission is denied” → bypass the second admission result.
- Same file — “maps a removed key” → stop mapping `ToolInputError` to the public 409.
- Same file — “does not serialize a private key-store failure” → map every thrown error to the 409.
- `__tests__/site-backups.test.ts` — “mounts separate buffered, no-store POST routes” → mount push at plan's path, remove its no-store binding, or alter the poll interval.
- Same file — “passes the caller and a default object to the plan service” → forward null raw body or dispatch to the push service.
- Same file — “passes the plan id to push” → reuse the request's aborted signal instead of an independent signal.
- Same file — “refuses a publish-trust principal” → drop the publish-trust check.
- Same file — “fails closed before publish-trust lookup” → default a missing principal instead of throwing.
- Same file — “relays a mapped service failure” → rethrow the mapped error or serialize the unmapped one.
- `__tests__/assistant-daemon.test.ts` — “fails closed before requesting a restart” → default missing authorization to allow.
- `__tests__/assistant-subagents.test.ts` — “reads the current permission grant” → return default grant data instead of calling the bound reader.
- `__tests__/module-status.test.ts` and `__tests__/server-logs.test.ts` — “does not read module readiness” / “does not parse or read filters” → default a missing authorizer to allow.
- `__tests__/observability-status.test.ts` — “does not read provider status” → default a missing authorizer to allow. “cannot send a telemetry test error” → replace absent principal with a synthetic one.
- `__tests__/tool-gaps.test.ts` — “does not query the audit store” → use the owner id when the request principal is absent.
- `__tests__/browser-telemetry.test.ts` — “applies the budget before rejecting telemetry body” (7 rows) → move validation ahead of the budget or weaken the applicable null/primitive/discriminant/unknown-field/required/type/length check.
- Same file — “does not consume budget for a session with no principal” → use an empty or synthetic budget key.
- Same file — “forwards the two scrubbed stacks” → leave the mixed id intact, keep the URL query, discard the original stack or omit the component stack.
- `__tests__/mail-activity.test.ts` — “clears only the reviewed capture revision” → coerce confirmation to truthiness, remove the version check, or stop calling the bound clear function.
- `__tests__/site-share-password.test.ts` — “replies with a saved password” → omit no-store or resolve another share id. “routes backend exceptions” → drop the password failure flag. “reports saved keys unavailable” → remove the missing backend's public 503. “maps a rejected upload parser” → route a parser refusal through the generic incident sink.
- `publish-credentials/__tests__/publish-credentials-route.test.ts` — “routes list failure” (typed/untyped) → send both errors to the incident sink / send both errors to the client as a 409.
- `publish-site/__tests__/trigger.test.ts` — “reports malformed publish input” (7 rows) → drop respectively the null body, array, blank project, non-string credential, blank credential, non-string target or blank target guard.
- Same file — “returns the still-running snapshot” → omit the running-slot guard and start a duplicate job.
- `admin-http/routes/__tests__/y5-site-imports.test.ts` — “lists only the admitted owner's imports” → ignore cursor parse failure or drop the cursor/principal at the list port.
- Same file — “maps history-store unavailability” → do not use the mapper's replaced error for history incidents.
- Same file — “passes a parsed backup request” → forward unparsed body, omit the backend signal, abort on completed close, or drop the abort listener.
- Same file — “protects the single upload lane” → let two requests parse concurrently, accept non-binary upload bodies, or omit deadline cancellation.
- Same file — “returns owner setup instructions” → drop the lookup projection, parse the form before origin validation, or strip the saved-key password from a valid request.
- Same file — “answers a withdrawn ZIP backend” → reuse the old admitted store after the current binding disappeared.
- `__tests__/site-import-saved-keys.integration.test.ts` — “rejects unknown owner form fields” → defer validation until after backend lookup or omit it. “fails closed if the owner backend disappears” → substitute a silent success for the missing backend.

## Forms, comments, and duplication

- `forms/destinations/__tests__/ports.test.ts` — “returns only a fresh matching credential” → compare the adapter without normalizing it, cache the first credential, or strip username/allowed hosts.
- Same file — “does not open a credential unlisted for any adapter” → default missing scopes to allow, or dereference the missing record.
- Same file — “does not create a key or receiver for a form-less site” → run selection/provisioning with an empty form list, or report a hosted preview without a saved key.
- Same file — “previews auto co-hosting” → look up the key during preview or use the destination id instead of the host id for storage scope.
- Same file — “reports an explicitly disabled receiver” → provision a key or return hosting for `none`.
- Same file — “explains why an explicit unavailable receiver blocks publishing” → downgrade a misconfigured destination to a successful publish plan.
- Same file — “describes an external receiver without a preview” → omit the fallback preview descriptor or open a key for the preview.
- Same file — “opens the named relay credential” → strip the credential username or save the hosting URL instead of the prepared external URL.
- Same file — “explains missing relay credentials” → run a vendor method without the required credentials.
- Same file — “redacts every occurrence of the prepared receiver key” → omit redaction or replace just the first occurrence.
- `forms/destinations/__tests__/deliver.unit.test.ts` — “passes through the kit's bound clock” → drop `now` or remove `bind(kit)`.
- `comments/__tests__/sanitize.test.ts` — “preserves an unfinished less-than expression” → discard the unterminated suffix after removing complete markup.
- `comments/site/__tests__/data-module.test.ts` — “installs both private comment tables” → omit a table, lose provenance or replace the caller's database path. “stops boot with the store's typed declaration failure” → ignore the returned failure or use a generic error that loses the code/message.
- `content-duplication/__tests__/tool-registrations.test.ts` — “passes only requested overrides” → bind the wrong resource or omit a requested override.
- Same file — “reports malformed overrides” (four rows) → ignore unknown keys / stringify wrong-typed known values / admit null / admit an array by checking isRecord rather than isNonArrayRecord (only array is expected red on current source).
- Same file — “lists only the supported resource names” (registered / empty) → omit sorting / omit the explicit empty fallback.

## Sites, skills, and themes

- `admin-http/routes/sites/__tests__/local-sites.test.ts` — “fails closed without an authorizer before starting” → default missing authorization to allow.
- `admin-http/routes/sites/__tests__/site-previews.test.ts` — “uses HTTP for a plain socket and omits a running site without a preview address” → always choose HTTPS or include a site whose address is absent.
- `admin-http/routes/sites/__tests__/sites-home.test.ts` — existing config-read request now exercises parse → refuse a normal body-less config GET.
- `admin-http/routes/skills/__tests__/set-enabled.test.ts` — “keeps the host-classified string refusal” → use the Error-only message path or bypass classification.
- `admin-http/routes/system/__tests__/assistant-owner-grant.test.ts` — “uses the owner restriction copy” → return the missing override instead of the base refusal copy.
- `admin-http/routes/system/__tests__/custom-credentials.test.ts` — “does not link a site-local credential” → attach every credential whenever the shared key store is configured.
- `admin-http/routes/system/__tests__/dockerfile-source.test.ts` — “fails closed before reading” → treat missing authorization as a grant.
- `admin-http/routes/system/__tests__/source-control-credentials.test.ts` — “preserves automatic default selection” → unconditionally force writes to start non-default, even without the shared vault.
- `admin-http/routes/themes/__tests__/duplicate.test.ts` — “retains a recognized host refusal's string detail” → use an Error-only message extractor.
- `admin-http/routes/themes/__tests__/explore-detail.test.ts` — existing no-inherited-source case now omits the property → remove the empty inventory fallback.
- `admin-http/routes/themes/__tests__/explore-file-put.test.ts` — “edits a physical file even when the theme has no inherited-source inventory” → remove the nullish inventory fallback. “relays a classified string” → use `err.message` on all path failures in `explore-shared`.
- `admin-http/routes/themes/__tests__/explore-file-reset.test.ts` — “preserves a classified string path fault” → read `err.message` for a classified string fault.
- `admin-http/routes/themes/__tests__/held-back.test.ts` — existing successful GET now drives the parser → refuse an empty ordinary GET or return a non-undefined input.

## Assets, collection entries, and commands

- `asset-transfer/__tests__/asset-destinations.test.ts` — “bounds rename probing” → remove or change the 1000-attempt bound.
- Same file — “rejects a nested filename” → validate or send the nested filename to Media.
- Same file — “checks then writes the requested theme file” → skip preflight or return stale status instead of reloading.
- Same file — “reports a skipped theme file” → reload or write when all paths were skipped.
- Same file — “persists private document bytes” → send library data to Media or drop its actor/address.
- Same file — “refuses a file batch containing duplicate destination names under overwrite” → remove the case-folded batch check.
- `asset-transfer/__tests__/copy-tool.test.ts` — “imports redirected URL bytes” → use the original URL or an unrelated filename as provenance.
- Same file — “refuses incompatible copy source” (6 rows) → remove the applicable URL/glob/library/prefix/picked guard.
- Same file — “adds caller-facing input guidance only for a classified source refusal” → drop the injected classifier or classify every error as safe input.
- Same file — “reports a complete skip” → send an empty batch to the approval or writer.
- `content-types/site/__tests__/publish-content.test.ts` — “registers a missing type” → omit registration or skip post-registration deprecation. “reactivates a deprecated type” → select the deprecator for every lifecycle change. “does not pack local seeded or tombstoned collection types” → remove either export fence or permit prechecks on a tombstoned destination type.
- `entries/site/__tests__/publish-content.test.ts` — “imports collection state through the entry service” → omit the real entry import, use the sender's workspace, or drop title/slug/state.
- `entries/site/__tests__/site-entries.test.ts` — “keeps all authored scalar predicates” → drop false/zero predicates, reverse field sort, or ignore requested fields/options.
- Same file — “resolves the authored sort direction” (5 rows) → reverse the corresponding direction or look up the keyword as a declared field.
- Same file — “refuses config instead of silently widening the query” (5 rows) → accept that specific invalid filter, sort or display field.
- Same file — “does not expose system and tombstoned types” → drop either type guard.
- `entries/site/__tests__/unreadable-owner-entries-repair.unit.test.ts` — “removes only classified rows” → purge malformed JSON or rows owning a valid namespace, or purge at the pre-hide version.
- Same file — “fails before picking a deletion adapter” → fall back to the entry's type when the owner mapping is absent. “aborts without purging” → ignore a hide-version refusal. “does not report removal” → treat retained rows as purged.
- `entries/__tests__/repo.trash-aware.memory.test.ts` — “a versioned save cannot modify a hidden entry” → treat a versioned save like the unconditional no-op, or let it update the hidden row.
- `core/commands/__tests__/revert.unit.test.ts` — “refuses an untyped forced revert” → remove the missing-principal-kind refusal or open the transaction before validating it.
- Same file — “refuses an item with no inverse” → treat an omitted inverse as a usable payload.
- Same file — “does not overwrite or announce a revert already finalized” → remove the final status read or overwrite the competing writer's timestamp.

## Additional forms and comments

- `comments/site/__tests__/settings.test.ts` — “registers the built-in provider default” → lose the configured permission, store null without the disabling sentinel, or remove the transactional revision guard.
- Same file — “accepts a host clock exposing an ISO timestamp” → pass the host's nowIso-only clock through without conversion.
- `comments/__tests__/tool-registrations.test.ts` — “looks up one scoped comment” → forget the workspace, default to the wrong queue status, or expose the raw stored comment.
- Same file — “describes provider readiness” (four rows) → drop the selected readiness note, give a not-ready provider a ready flag, omit the pending count, or include a note for a ready provider.
- Same file — “wires to the guarded action” (approve / spam / restore / trash) → change the corresponding action/status/permission or remove the second authorization of trash.
- Same file — “returns actionable version conflicts” → map every error as not-found or give stale versions success.
- `forms/__tests__/provider.test.ts` — “does not fall back to built-in when a selected plugin's planner throws” → fall back to the built-in endpoint instead of reporting the selected provider unavailable.
- `forms/__tests__/attachment-cleanup.test.ts` — “captured original bytes are checked under their hash lock” → remove the original-key skip in rendition cleanup or delete without the key-ownership check.
- `forms/__tests__/attachment-purge.test.ts` — “does not prepare removal when a form submission contains only ordinary answers” → attempt a purge for non-file answers or open removal with no references.
- `forms/__tests__/destination-descriptors.test.ts` — “refuses a malformed plugin descriptor” (five rows) → drop the array, entry object, label, host id or credential label check.
- `forms/__tests__/destination-registry.test.ts` — “a co-hosted descriptor without host claims” → dereference missing hosts or capture a host it did not declare.
- `forms/destinations/__tests__/rewrite-actions.unit.test.ts` — “rewrites portable Uint8Array HTML” → decode plain Uint8Array via its decimal-list `toString` instead of UTF-8 (expected red on current source).
- `forms/__tests__/tool-registrations.test.ts` — “duplicating HTML preserves its authored form” → drop mode/HTML or replace the explicit name/slug with derived defaults.
- `forms/__tests__/email-fields-w2g.unit.test.ts` — “exports real falsy scalar answers” → discard false/zero or serialize a file as a token.
- `forms/__tests__/form-controls.test.ts` — “does not add the server cap to unnamed controls or capped fields rendered as hidden” → stamp hidden controls or apply caps to all controls regardless of name lookup.

# CMS taxonomy, widgets and workspace DELETE coverage
Inputs: parent-supplied coverage gaps, route source, adjacent tests and existing CMS in-memory fixtures. Each mutation below is hypothetical. No tests, builds, typechecks, coverage or mutations were executed.

## Remaining boundary
Workspace DELETE success (`workspace/delete.ts:101`) is unreachable through the mounted v1 route: the host precheck admits only the bound workspace path, and the bound workspace always gets BOUND_WORKSPACE. Directly calling the handler on a different workspace would exercise behavior the host deliberately forbids. The existing test of the exported transition helper already covers non-bound behavior independently. No production edit.

## Cases

### Taxonomy

- Create preserves the trusted actor in its outbox event. Mutation: omit `actor: deps.mutationActor?.(...)` from create-taxonomy.ts to lose both the callback and event actor.
- Child creation persists the supplied parent and returns the inserted term. Mutation: replace `parentId: input.parentId` with `parentId: null` in create-term.ts.
- Missing parent returns 400 VALIDATION_ERROR with no inserted row. Mutation: remove `TermNotFoundError` from CREATE_TERM_REFUSALS.
- Parent from another taxonomy returns 400 VALIDATION_ERROR with no inserted row. Mutation: remove `ParentCrossTaxonomyError` from CREATE_TERM_REFUSALS.
- Renaming uses the path's term, persists it within the host transaction and returns version 5. Mutation: replace the transaction port with a direct callback invocation, which loses the begin/commit sequence.
- Both assign and unassign parse the body, forward actor and content owner, and write only the named join. Mutation: wire the unassign route to `assignTerms`; the named term stays attached and the removal event is lost.
- Trashed post assignment returns 409 ENTITY_IN_TRASH without a write. Mutation: give the EntityNotLiveError refusal a fixed generic code instead of the error's own code.
- Missing assignment term returns 404 TERM_NOT_FOUND without a write. Mutation: change the TermRecordNotFoundError mapping to CONTENT_NOT_FOUND.
- Mismatched content kind returns 400 VALIDATION_ERROR without a write. Mutation: remove `ContentTypeMismatchError` from ASSIGNMENT_REFUSALS.
- Assigned-term reads rethrow non-Error collaborator failures unchanged. Mutation: wrap the unclassified value in a new Error in rejectTaxonomyError.
- Post edit denial refuses before reads or joins. Mutation: remove `authorizeContentEdit` from the assignment writer.
- Assigned-term parse now feeds the pre-existing read test. Mutation: discard the supplied `contentId` or include extra query fields in the parsed DTO.
- Taxonomy list groups only the owning terms, and fails closed when the host authorizer is absent. Mutation: replace the missing-authorizer throw in `authorizeTaxonomyManage` with an early return.

### Widgets

- Widget create retains the explicit slug/config, while its slug-based get resolves and projects references by canonical id. Mutation: index by `input.id` rather than `instance.id` in get-by-id.ts, or omit slug when parsing widget creation.
- Library reports corrupt row ids and count without hiding valid widgets or including inactive ones. Mutation: drop the conditional `{ skippedCount, skippedIds }` spread in list.ts.
- Unregistered widget create returns 400 WIDGETS_TYPE_UNREGISTERED with the rejected type and no entry. Mutation: rethrow the error instead of `rejectWidgetError` in create.ts.
- Update returns persisted title/config and version, then refuses a stale edit without changing stored state. Mutation: omit the conditional title spread in update.ts.
- Trash returns the new version and uses the exact identified widget, passing the caller to the Trash and removing it from live reads. Mutation: hard-code response version 1 or pass the wrong actor in trash.ts.
- A widget route with missing principal fails before domain authorization. Mutation: default to an empty principal id in shared.ts.
- Region bind trims its key and returns a single idempotent binding/area. Mutation: pass the original untrimmed region key to the domain service.
- Region update persists the normalized whole area, counts it in the list and refuses a stale write with structured version details. Mutation: forward raw placement objects instead of normalized ones or return placementCount 0 for every region.
- Region get enriches placements in document order and distinguishes missing, wrong-type and inactive instances. Mutation: remove `payload.status !== "active"` from its broken predicate.
- Region get refuses a binding with the wrong entity kind and a host without an authorizer cannot list regions. Mutation: remove the `areaEntry.type` check or change the missing-authorizer throw in shared.ts to successful return.
- Place/remove tools return versioned placement outcomes and leave the referenced widget in place. Mutation: return the wrong tool discriminator on place/remove or omit the domain result from either success response.
- Create tool success returns both the persisted widget and its placement. Mutation: place using the title instead of the created instance id.
- Create tool classifies an unbound-region placement refusal and includes the already-created widget. Mutation: call `rejectWidgetError` directly for placement failure, which loses widget/partial-success fields.
- Create tool leaves an unclassified failure to the host with the original cause and the persisted widget. Mutation: throw the unknown place error itself in the handler catch, dropping the partial-commit context.
- Embed insert appends after existing content and returns the persisted host plus placement identity. Mutation: omit placementId from the route's success result.
- Embed remove persists only the requested removal and returns 404 on repeated removal. Mutation: forward the host id as the placement id or rethrow the classified error without mapping.
- Embed reorder writes the requested order without moving other content and returns exact mismatch counts for invalid length. Mutation: reverse `orderedWidgetEntryIds` before delegating.

## Remaining case records

- `comments/site/__tests__/builtin-provider.test.ts` — “publishes the built-in provider only after both readiness ports” → skip settings readiness or resolve the built-in provider for foreign workspaces.
- Same file — “fallback for an unregistered choice preserves the stored revision” → let a retired provider hide built-in comments, reset its CAS revision, treat disabled as built-in, or block built-in purge when the site is disabled.
- `entries/__tests__/tool-registrations.cov-j2.test.ts` — “the site contributor adds discovery metadata and exposes a typed not-found explanation” → remove the production contributor's metadata or model-facing error wrapper.
- `admin-http/routes/system/publish-site/__tests__/destinations.test.ts` — “routes a destination resolver failure” → log under a hard-coded operation. “parses a body-less read and rejects a missing principal” → require body fields or load the registry without a principal.
- `admin-http/routes/system/publish-site/__tests__/trigger.test.ts` — “does not read the run slot on a failed publish preflight” (read/plan) → continue into plan on an unsuccessful config read, or continue into the run slot after a refused plan.
- `admin-http/routes/system/__tests__/sites.test.ts` — “does not misreport an unknown switch failure” → default unrecognized failure codes to 409 instead of 500.
- `admin-http/routes/system/__tests__/site-shares.test.ts` — “does not write an artifact if the admitted backend disappears” → reuse the stale initial backend. “does not deliver a truncated ZIP header or a pre-read non-binary body” → accept undersized headers or non-binary bodies as artifacts.
- `forms/express/__tests__/handler.test.ts` — “a truncated schema retry tells the visitor” → omit the truncation notice or lose non-string retained answers from the review HTML.
- `change-sets/__tests__/tool-registrations.test.ts` — “still returns the conflict when the scoped change set disappears” → assume the second lookup always returns a row.
- `entries/__tests__/sql.repo.dialects.test.ts` — “an empty type exclusion leaves workspace types intact” → apply an empty exclusion like a restrictive filter or drop the workspace/explicit order.
- `forms/__tests__/html-render.test.ts` — “an external file form uses multipart encoding” → omit the file-dependent encoding or substitute generated controls for authored HTML.
- `core/commands/__tests__/command.test.ts` — “the memory change-set ledger preserves workspace-local idempotency” → remove workspace scoping or drop the supplied event instead of forwarding it.
- `asset-transfer/__tests__/copy-tool.test.ts` — “binds the current host deps when the copy contributor builds” → defer the deps binding to tool execution, or pass through unbound host deps to the builder.
- `forms/destinations/__tests__/ports.test.ts` — “keeps an external preview rejection distinct” → throw a vendor's bare string to the host instead of giving an off-state message.
- `comments/site/__tests__/data-module.test.ts` — “a failed declaration with only an error code still stops boot” → treat a missing error message as success.

- `asset-transfer/__tests__/asset-destinations.test.ts` — “refuses a site write when its prepared approval batch is missing” → fall back to success or perform a destination write without the batch.

## Findings and remaining gaps

- BUG `content-duplication/tool-registrations.ts:67` — `isRecord` intentionally includes arrays. `overrides: []` silently copies with no overrides despite the documented object-only contract. Use `isNonArrayRecord` for this field. Its regression should be red until fixed.
- BUG `forms/destinations/rewrite-actions.ts:50` — the public input accepts `Uint8Array`, but its native `toString()` produces decimal bytes, not UTF-8. Use `Buffer.from(file.data).toString("utf8")` or decode the view via `TextDecoder`. Its regression should be red until fixed.
- EXCEPTION `admin-http/routes/workspace/delete.ts:101` — the documented v1 mount admits only its own workspace ID, and the bound-workspace guard always refuses deletion.
- EXCEPTION `admin-http/routes/system/site-imports.ts:292` — after passing the authenticated host gate the list spec receives a trusted nonempty principal; its only non-ok handler outcome needs the missing principal that this mount has already excluded.
- EXCEPTION `entries/repo.trash-aware.memory.ts:122–123,219` — the memory revision log has no public reader or injection seam, and the comparator cannot receive duplicate ids from the underlying id-keyed map.
- EXCEPTION `forms/email-sender-fields.ts:44–45` — the only non-scalar and non-array accepted shape is a file reference, and file fields are excluded before answer projection.
- EXCEPTION `forms/destinations/rewrite-actions.ts:45` — all four literal characters selected by the substitution are present in the private constant escape map.
- Other branch-only totals cannot be reconciled precisely from the supplied percentage summary. Do not treat this patch as verification of the 100% target.

Author Checklist applied by source inspection: distinguishable input, exact wire outcomes or bound calls, real read-back where exposed, finite/controlled concurrency, original errors only where the caller contract requires them. No suites, builds, installs, typechecks, coverage, or mutations executed.

## Test-file inventory

224 new cases across 67 test files, counting each explicit table row once and not multiplying cases by the SQL dialect matrix. All paths below are under `packages/cms/src/`.

| Test file | New cases |
| --- | ---: |
| `admin-http/routes/__tests__/y5-site-imports.test.ts` | 6 |
| `admin-http/routes/settings/__tests__/shared.test.ts` | 2 |
| `admin-http/routes/settings/__tests__/writes.test.ts` | 7 |
| `admin-http/routes/sites/__tests__/local-sites.test.ts` | 1 |
| `admin-http/routes/sites/__tests__/site-previews.test.ts` | 1 |
| `admin-http/routes/sites/__tests__/sites-home.test.ts` | existing case extended |
| `admin-http/routes/skills/__tests__/set-enabled.test.ts` | 1 |
| `admin-http/routes/system/__tests__/assistant-daemon.test.ts` | 1 |
| `admin-http/routes/system/__tests__/assistant-owner-grant.test.ts` | 1 |
| `admin-http/routes/system/__tests__/assistant-subagents.test.ts` | 1 |
| `admin-http/routes/system/__tests__/browser-telemetry.test.ts` | 9 |
| `admin-http/routes/system/__tests__/credential-copy.test.ts` | 26 |
| `admin-http/routes/system/__tests__/custom-credentials.test.ts` | 1 |
| `admin-http/routes/system/__tests__/dockerfile-source.test.ts` | 1 |
| `admin-http/routes/system/__tests__/mail-activity.test.ts` | 1 |
| `admin-http/routes/system/__tests__/module-status.test.ts` | 1 |
| `admin-http/routes/system/__tests__/observability-status.test.ts` | 2 |
| `admin-http/routes/system/__tests__/server-logs.test.ts` | 1 |
| `admin-http/routes/system/__tests__/site-backups.test.ts` | 6 |
| `admin-http/routes/system/__tests__/site-import-saved-keys.integration.test.ts` | 2 |
| `admin-http/routes/system/__tests__/site-share-password.test.ts` | 4 |
| `admin-http/routes/system/__tests__/site-shares.test.ts` | 2 |
| `admin-http/routes/system/__tests__/sites.test.ts` | 1 |
| `admin-http/routes/system/__tests__/source-control-credentials.test.ts` | 1 |
| `admin-http/routes/system/__tests__/tool-gaps.test.ts` | 1 |
| `admin-http/routes/system/publish-credentials/__tests__/publish-credentials-route.test.ts` | 2 |
| `admin-http/routes/system/publish-site/__tests__/destinations.test.ts` | 2 |
| `admin-http/routes/system/publish-site/__tests__/trigger.test.ts` | 10 |
| `admin-http/routes/taxonomy/__tests__/taxonomy-writes.test.ts` | 11 |
| `admin-http/routes/taxonomy/__tests__/taxonomy.test.ts` | 1 |
| `admin-http/routes/themes/__tests__/duplicate.test.ts` | 1 |
| `admin-http/routes/themes/__tests__/explore-detail.test.ts` | existing case extended |
| `admin-http/routes/themes/__tests__/explore-file-put.test.ts` | 2 |
| `admin-http/routes/themes/__tests__/explore-file-reset.test.ts` | 1 |
| `admin-http/routes/themes/__tests__/held-back.test.ts` | existing case extended |
| `admin-http/routes/widgets/__tests__/route-contracts.test.ts` | 17 |
| `asset-transfer/__tests__/asset-destinations.test.ts` | 7 |
| `asset-transfer/__tests__/copy-tool.test.ts` | 10 |
| `change-sets/__tests__/tool-registrations.test.ts` | 1 |
| `comments/__tests__/sanitize.test.ts` | 1 |
| `comments/__tests__/tool-registrations.test.ts` | 10 |
| `comments/site/__tests__/builtin-provider.test.ts` | 2 |
| `comments/site/__tests__/data-module.test.ts` | 3 |
| `comments/site/__tests__/settings.test.ts` | 2 |
| `content-duplication/__tests__/tool-registrations.test.ts` | 7 |
| `content-types/site/__tests__/publish-content.test.ts` | 3 |
| `core/commands/__tests__/command.test.ts` | 1 |
| `core/commands/__tests__/revert.unit.test.ts` | 3 |
| `entries/__tests__/repo.trash-aware.memory.test.ts` | 1 |
| `entries/__tests__/sql.repo.dialects.test.ts` | 1 |
| `entries/__tests__/tool-registrations.cov-j2.test.ts` | 1 |
| `entries/site/__tests__/publish-content.test.ts` | 1 |
| `entries/site/__tests__/site-entries.test.ts` | 12 |
| `entries/site/__tests__/unreadable-owner-entries-repair.unit.test.ts` | 4 |
| `forms/__tests__/attachment-cleanup.test.ts` | 1 |
| `forms/__tests__/attachment-purge.test.ts` | 1 |
| `forms/__tests__/destination-descriptors.test.ts` | 5 |
| `forms/__tests__/destination-registry.test.ts` | 1 |
| `forms/__tests__/email-fields-w2g.unit.test.ts` | 1 |
| `forms/__tests__/form-controls.test.ts` | 1 |
| `forms/__tests__/html-render.test.ts` | 1 |
| `forms/__tests__/provider.test.ts` | 1 |
| `forms/__tests__/tool-registrations.test.ts` | 1 |
| `forms/destinations/__tests__/deliver.unit.test.ts` | 1 |
| `forms/destinations/__tests__/ports.test.ts` | 11 |
| `forms/destinations/__tests__/rewrite-actions.unit.test.ts` | 1 |
| `forms/express/__tests__/handler.test.ts` | 1 |
