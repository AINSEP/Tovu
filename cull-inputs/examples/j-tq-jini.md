BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.
You are a refactor programmer. Read <repos>/Tovu/AI-Dev-Shop/agents/refactor/skills.md and <repos>/Tovu/AI-Dev-Shop/skills/refactor-patterns/SKILL.md first.
REPO: your cwd = private Jini clone, branch codex/tq-jini, HEAD = Jini integ/merge-6-2026-11-19 (d3e78b387: merge-5 + ex-log + xd extraction rounds 1-4 incl. xd5-publish/render).
TASK (JINI ONLY; in this order; no sidekicks/subagents): J7, J6a, J6b, J4 (into cms/entries), J2, J1 (manifest-v2 only), EXACTLY as the OVER-ENGINEERING CULL (section at the end) defines them; the cull's text WINS over the design; DROPPED sheets (J3, J5, J8) are NOT done. Tovu reference (read-only): `git -C <repos>/Tovu show origin/integ/merge-5-2026-11-19:<path>` (publish/render Tovu halves: codex/tv-xd5-publish, codex/tv-xd5-render). Moves are verbatim. Write each .changeset/<slug>.md and only the package.json lines the cull names. Tests first. One COMMIT-PLAN.md entry per sheet.

## NO OVER-ENGINEERING (owner rule, HARD — read before every edit)
- Do EXACTLY what the sheet names. If the sheet does not name it, do not add it.
- No new helpers, wrappers, adapters, ports, interfaces, types, generics, options, config flags or abstraction layers unless the sheet lists them by name.
- No "just in case" code: no extra validation, defensive checks, fallbacks, try/catch, null guards, retries or default values the moved code did not already have.
- No speculative generality: no parameters "for later", no unused exports, no optional args nobody passes, no `_optional` pads.
- Moves are VERBATIM: same statements, same order, same names. Do not rewrite, rename, "clean up", reformat or modernize the code you move.
- Tests: only the cases the sheet lists (+ the named mutation). No extra test scaffolding, fixtures or factories beyond what those cases need.
- Comments: move existing why-comments verbatim; add NO new comments except a one-line neutral note where the sheet asks for one.
- Smallest diff that satisfies the sheet. If something seems to need more, STOP that step and report it instead of building it.
- Before finishing, re-read your diff and DELETE anything not required by the sheet. List any deletions in COMMIT-PLAN.md.

## OWNER RULES (HARD)
Behaviour identical; no product names in Jini; API args (required, optional = {}) for NEW functions only; no re-export shells; no new deps; no new eslint-disable/@ts-ignore/as any/as never; functions <= 50, complexity <= 10, files <= 500. STOP a sheet (continue the others) if a named declaration is missing, an unlisted PRODUCTION importer appears (`git grep -n -F '<symbol>' -- packages/`; unlisted TEST importers needing only the same repoint are fine, record in REFRESH.md), a cast is needed, or a limit is exceeded. MACHINE RULE: no other repo-wide scans; NO tests, builds, installs, type-checks, linters; no codebase-memory-mcp; .git read-only; COMMIT-PLAN.md at repo root.

## REPORT (<= 300 words)

## DESIGN (Codex 6.2, r62t-tq)
# Extraction execution sheets

Reviewed Tovu `0c0f54a0a` and Jini `e06b3c201`, the 11-19 census, the lane plans, the answered owner decisions, and the relevant follow-up branches. **Dispatch eight Jini sheets, then eight Tovu sheets.** The new theme and posts entries need an OPUS-CLOUD packaging and release handoff between the jobs. No files changed and no tests, builds, typechecks, or installs ran.

## Disposition

| Item | Status | Reason |
|---|---|---|
| T-TH-02 | READY-FOR-CODEX | Partition manifest checks and extract markup validation and migration planning. Keep package-directory validation bound to the host loader and layout policy. |
| T-TH-03 listing | READY-FOR-CODEX | DT3 approved host-supplied saved markup. Use the existing Jini listing entry. |
| T-TH-03 render contract | NEEDS-DECISION | `render-contract.ts` still owns the loaded manifest and its script, slot, and template types. Move it with the render boundary. The listing renderer already uses Jini navigation href predicates. |
| T-TH-04 | READY-FOR-CODEX | DT2 chose host-owned Liquid and Handlebars linters. Inject them at the existing template-load boundary in TH02-T. |
| T-TH-05 original write/file move | RETIRE | L5a–e and L6c.4 cover layout, reviewed/atomic writes, originals, paired trash, copy, rename, and allocation. Use the publish branches through Tovu `23c00b5bc`. |
| T-TH-05 guarded read/list residue | NEEDS-DECISION | `theme-files.ts` and `theme-file-listing.ts` still own containment, errors, and bounded listing. A guarded-reader swap requires parity for symlinks, missing paths, and host refusals. |
| T-TH-06 render leaves | RETIRE | The render rounds already own extracted leaves through R5f.1–3 and R7b.1. S8b-T repoints partial expansion in `3057963c4`. |
| T-TH-06 worker/engine residue | OPUS-CLOUD | R6/R6b owns worker packaging and engine resolution. R5f.4a–c stopped on casts and context shape. Keep request listing state per request, warn-once sets at their existing module lifetime, and active-theme reads late. `static-portability-index.ts` still owns disk output and its reload; `code-tier-asset-normalizer.ts` still owns build-directory mutations. Neither rides the listing move. |
| T-TH-07 completed lifecycle slices | RETIRE | Preview refresh, paired trash, watcher, roster synchronization and original-file primitives already have publish-round owners. |
| T-TH-07 page publication | READY-FOR-CODEX | Extract the synchronous commit sequence. Tovu owns the live roster, candidate policy, errors, and preview marker. |
| T-TH-07 other lifecycle residue | NEEDS-DECISION | `duplicate-theme.ts`, `file-identity-lock.ts`, `migration/migrate-theme.ts`, `save-theme-original.ts`, `sync-originals.ts`, and `theme-preview-image.ts` still need a post-publish write set. Migration planning is in TH02. Keep site staging, reloading, registration, and refresh with the host until each caller’s ordering is pinned. |
| T-TH-08 | NEEDS-DECISION | File sizing is already done. Generic registration needs the remaining read/edit/lifecycle ownership fixed first. Keep current tool IDs, host catalog metadata, approval, and renderer bindings. |
| T-PO-03 go-live | READY-FOR-CODEX | Start the existing CMS package’s posts domain with the go-live contract. The sweep is already split. |
| T-PO-03 remaining post domain | NEEDS-DECISION | Use the current `post-{create,update,read,slugs,retire,write-effects}.ts` split. Choose the single owner for `PostValidationError` and the record/repo contracts before moving `featured-image.ts`. Keep `email-template`, route errors, and host write hooks in Tovu. |
| T-PO-04 | NEEDS-DECISION | After PO03 domain ownership, move memory repo separately, then SQL rows/repo with table bindings, then search and reverters. Preserve workspace scope, transaction/CAS behavior, and SQLite/Postgres search semantics. Keep the Tovu projection setting ID and the `tv-split` S12 monotonic bookkeeping change. |
| T-PO-05 | NEEDS-DECISION | After PO03, split generic registration by read/list, write, and duplicate/delete using the current `post-tool-*` leaves. Keep preview/admin URLs, confirmation and hooks at their host bindings. Existing function debt remains on `buildPostRegistrations` and `duplicatePostOrPage`. |
| T-NL-01 | NEEDS-DECISION | DT1 was explicitly parked. Proposed owner is `cms/newsletter`. On release, split audience/claim, dispatch/result, and campaign controls. Inject `{ mint, hash }`, signed unsubscribe claims, consent operations and sender resolution. Preserve request → confirm → granted → activate, single-use/expiry, and failed-send retry without a sent event. |
| T-NL-02 | NEEDS-DECISION | Follows NL01. Use the existing split `repo.ts` campaign, `repo-subscribers.ts` list/subscription/token, `repo-sends.ts` audience/send, and `repo.rows.ts`. Bind `{ kernel, tables }` in Tovu. Keep receipt/lease CAS and workspace keys. |
| T-NL-03 | NEEDS-DECISION | Follows NL01. Split catalog and list/subscription handlers from campaign/send handlers and delivery tools. Preserve host approval, metadata, loader, and public URLs. `buildNewsletterRegistrations` still has size debt. |
| S8c | READY-FOR-CODEX | OD6 selected the core contract. The existing Jini fenced store has distinct settlement semantics. Move Tovu’s core-contract implementations verbatim. |
| K-11a file hygiene | READY-FOR-CODEX | Move the two SQL ownership probes. Generic purge/reconciliation already lives in Jini. Keep host evidence joins, media lifecycle, deployment storage layout and boot scheduling with their current owners. |
| K-11b remote import | READY-FOR-CODEX | Move importer and shared field caps. Keep destination pulling, credentials and consent-proof acquisition in Tovu. |
| K-11c destination registration | READY-FOR-CODEX | DK2 chose `cms/forms`. Move the pure registry builder. Plugin loading and filename stay in Tovu. Delivery, pull, URL rewrite, manifest hashing and credential bindings retain their current owners for this slice. |
| K-11 adjacent comment markers | NEEDS-DECISION | Generic marker traversal already uses Jini. `comments/public-markers.ts:18` supplies provider selection, locale, cursor and wrapper, and maps provider purpose to declared script consent at `:10`. Keep the consent mapping and provider binding in Tovu. A renderer extraction should move only traversal/substitution with rendered HTML supplied by the host. |
| S/U directory trash | DONE | L6c.1 landed on the paired xd5 branches. Jini `c44b0fae8` and Tovu `23c00b5bc` contain the adapter and binding, including compensation reporting. |
| S4d | RETIRE | The landed parity expectations disprove a drop-in table-adapter replacement. Per-adapter decisions below. |
| S/U identity census | DONE | Ownership and caller census below. SQL/API-key extraction still has separate prerequisites. |
| S/U consent-service deletion | NEEDS-DECISION | Base source has one direct consumer suite and a barrel export. Deletion still needs proof for dynamic registration and barrel reachability on the combined tip. |
| U2c-1, U2a, S8a, S8b, K-05b, K-07b | DONE | Already covered by merge-5 or `tv-ext-u2`, `tv-ext-cms{,2}`, and `tv-rs-e`. |
| Chat, env, arch-120 L08/L14/L15, 424 UI functions | RETIRE | Excluded from this dispatch. The owner holds and UI deferral still apply. |

## Execution rules

Tovu paths below are relative to `apps/website/src`. Jini paths are relative to `packages`. `:line` anchors refer to the reviewed bases unless a branch is named. Write the specified assertions before source edits. Mutations describe the red check for cloud verification and are excluded from the committed diff. Keep existing diagnostics, ordering, call shapes, and fixtures. New APIs take `(required, optional = {})`.

For the larger caller sets, the lookup at the end is part of the sheet and produces the full execution manifest, including test and fixture sites. Compare its pinned output with the integration parent and resolve line drift before editing. Stop the affected sheet if a new caller changes the required contract. Debt rows below are closeout records for the coordinator. Source/test jobs leave debt files, package metadata, locks and release artifacts to cloud.

### 1. T-TH-02/04 — Theme validation

**Jini J1.** In `cms/src/themes/validation`, move `validateManifestV2` and its private checks from `features/theme/validation/manifest-v2.ts`. Keep the ordered dispatcher in `manifest-v2.ts`. Partition `manifest-identity.ts` (`checkApiVersion` through `checkTier`, license/authors/attributions), `manifest-templates.ts` (engine, partials, regions, renderer and template applicability), `manifest-assets.ts` (font stylesheets, build source/framework/containment), and `manifest-settings.ts` (tokens and settings/unimplemented-key policy). Keep the top-level key sets and de-duplication sweep with the dispatcher. Accept `validateScripts` and `isSourceDirGeneratedConflict` in the required object. Use the landed same-package template applicability parser and inject its error factory as required by that helper. Keep finding order and exception mapping. Put the issue shape in this validation domain.

Move `checkMarkupFile` and `checkWebMcpMarkup` into `markup.ts` and `webmcp-markup.ts` here. Use the existing `parse5` and marker helpers. Move `planV2Migration`, its three exported types and `TOKENS_MODE_FILE_PATTERN` to `cms/src/themes/migration-plan.node.ts`. It reads the filesystem, so give it a Node entry. Use a structural tier union limited to the existing values.

Tests first in `cms/src/themes/validation/__tests__/{manifest-v2,markup,webmcp-markup}.test.ts` and `cms/src/themes/__tests__/migration-plan.test.ts`. Port the corresponding source suites. Red mutations are skipping script validation, accepting undeclared template IDs, dropping the compiled source conflict check, skipping a WebMCP forbidden input finding, or omitting a static asset relocation.

**Tovu T1.** Keep `validation/validate-theme-package.ts` as the directory-level caller. Bind policy in `runV2StrictChecks`, retain `checkMarkupFiles` and the v1 `loadTheme` fallback. Repoint `validate-theme-package.ts:7,8`, `validation/__tests__/{manifest-v2:4,markup:3,webmcp-markup:3,webmcp-markup.unit:3,webmcp-scaffolds:4}.test.ts`, `__tests__/{declared-scripts.unit:8,template-applicability.unit:10}.test.ts`, `migration/migrate-theme.ts:10`, `migration/__tests__/theme-migration-plan.test.ts:7`, and `asset-path-rewrites.ts:1`. Paths in that list are under `features/theme`. Delete the four moved leaves. `cli/commands/theme/validate.ts:5` and `migration/migrate-theme.ts:9` continue through the real host validator.

First strengthen `validation/__tests__/validate-theme-package.test.ts` to pin v1 lint diagnostics and existing v2 findings. In `theme-template-sources.ts:35,56,76`, pass `templateValidators: { liquid, handlebars }` from `theme.ts:24,213` to the existing lint calls at their current point in the read sequence. The linter modules and public render callers stay host-owned. Red mutation drops a validator from its loader. Preserve strict v2’s existing checks without adding a new template parse pass. Debt stays at `development/scripts/error-gate-debt.json:1623`, `validate-theme-package.ts`, `catch-reads-error: 1`.

### 2. T-TH-03 — Saved listing markup

**Jini J2.** In `cms/src/listing/entry-list.ts`, move the five `EntryList*` types and `renderEntryList`, `renderEntryListStructuredData`, `withEntryListStyleOnce`. Export from `listing/index.ts`. Use `./html.js`, the CMS navigation href leaf and core `escapeHtml`. Require a `markup` value for HTML rendering and style insertion. It carries the wrapper attribute, opening style sentinel, exact stylesheet, and class strings including layout/modifier names. Structured-data-only rendering keeps its existing arguments. Move `ENTRY_LIST_DEFAULT_STYLE` to the host markup value. Tests first in `listing/__tests__/entry-list.test.ts`, porting the two listing suites. Red mutations change the class table, skip escaping, accept a protocol-relative href, remove continuation wrapping, and insert style twice.

**Tovu T2.** Create `features/theme/entry-list-markup.ts` with the current CSS and tokens byte for byte. Before repointing, add golden coverage in `entry-list-render-layouts.test.ts` for `cards`, `list`, `accordion`, `carousel` with 0/1/3 fixed-date items. In `entry-list-render.test.ts`, pin custom templates, continuation, existing-style suppression and unsafe hrefs. Mutations change `data-tovu-entry-list`, the exact `<style data-tovu-entry-list>` sentinel, or a saved class. Repoint `features/theme/{static-render.ts:5,__tests__/static-render-collection.test.ts:3,__tests__/entry-list-render.test.ts:8,9,__tests__/entry-list-render-layouts.test.ts:4}`, `server/inbound/public-http/http/site/render/{document-shell.ts:7,widgets/social-entries.ts:6}`, and `server/inbound/public-http/routes/site/pages/render-context/collection-lists.ts:3`. Remove listing exports from `theme/{index.ts:89,rendering.ts:4}` and delete `entry-list-render.ts`. Rebase after the render branch and retain the public `http/site/__tests__/render.test.ts:1355,1384` style coverage. Debt delta zero.

### 3. T-TH-07 — Standalone page publication

**Jini J3.** In `cms/src/themes/page-publication.ts`, move `togglePages` and the synchronous read/parse/merge/serialize/write sequence from `features/theme/page-publication.ts:20,55–60`. Expose `commitThemePagePublication({ page, published, readManifest, writeManifest, reloadLiveTheme, requestPreviewRefresh }, optional = {})`. Order is read, compute sorted set, write with existing indentation/newline, reload live theme, refresh. The callbacks are synchronous. Tests first in `themes/__tests__/page-publication.test.ts`. Inject an exact write error and assert identity, untouched live state, and no refresh. Mutations reload before writing, refresh in a `finally`, or calculate from preloaded state.

**Tovu T3.** On top of `tv-xd5-publish`, keep `ThemePagePublicationError` and the real `setThemePagePublished` binder. It finds and validates the theme before disk read, supplies the existing guarded read/write, replaces the same slot in the same host-owned `themes` array using `loadTheme`, and calls the landed preview helper with the host policy. Tests first in `features/theme/__tests__/theme-page-publish.test.ts:9` and `preview-refresh.test.ts:106` on `23c00b5bc`. Pin a failed write against real host wiring and assert unchanged theme/list identity and marker. Mutation calls reload or refresh before the write returns. `page-publish-tool.ts:9`, `theme/index.ts:175` on the publish branch, and `server/inbound/admin-http/routes/themes/explore.ts:3` keep importing the host API and sharing the same error class. Debt delta zero.

### 4. T-PO-03 — Posts go-live contract

**Jini J4.** Add `cms/src/posts/go-live.ts` and `posts/index.ts`. Move `GoLiveRow`, `GoLiveCandidatesPort`, `wentLiveSinceSave`, `goLiveEvent`, `announcePendingGoLive`, `announceDueGoLives`, and the two `POST_GO_LIVE_*` constants from `features/post/go-live.ts`. Treat `kind` as a passed-through string. Preserve the non-null/non-undefined deletion check, strict lower and inclusive upper time bounds, stable event ID and envelope, and the existing await/error sequence. Tests first in `posts/__tests__/{go-live,go-live.characterization}.test.ts`, using the original fixtures. Mutations accept `publishAt === updatedAt`, change the event ID on replay, include trashed rows, or stop honoring the lookback boundary.

**Tovu T4.** Tests first. Repoint `features/post/__tests__/{go-live:13,go-live.characterization:11,go-live.repo:6,post.schedule-events:6,reverters.schedule-events:12}.test.ts` and `features/pages/__tests__/html-document-store.go-live.test.ts:8`. Keep the repeated sweep assertion so a new event ID per sweep fails. Repoint `features/post/{post-write-effects.ts:7,repo.memory.ts:13,repo.ts:15,go-live-sweep.ts:5}`, `features/pages/{html-document-store.ts:18,html-document-store.memory.ts:10}`, and `server/routes/types.ts:37`. Remove the two exports at `features/post/index.ts:38`, delete `go-live.ts`, and refresh any direct type imports from the lookup below. Keep timer start/stop, clock sampling, and error reporting in the host sweep. Its existing error debt at `development/scripts/error-gate-debt.json:1298` stays.

### 5. K-11a — Attachment ownership SQL

**Jini J5.** Add `cms/src/forms/sql/file-hygiene.ts` and export `hasFormFileOwners` and `hasFormFileStorageKeyOwners` from `forms/sql/index.ts`. Move the queries from `features/forms/form-file-purge.ts:33,65` over the existing schema-erased SQL kernel pattern. Bind explicit `media`, `assetRenditions`, `assetBlobs` table names. Preserve the missing-kernel conservative `true`, the workspace plus source-hash lookup, and the exact-key rendition/blob queries. Tests first in `forms/sql/__tests__/file-hygiene.test.ts`, porting the matching Tovu cases. Red mutations omit workspace, remove shared rendition protection, or exclude a different workspace’s tombstoned row.

**Tovu T5.** Tests first in `features/forms/__tests__/{form-file-purge.test.ts:100,form-file-renditions.test.ts:14}`. Pin same key across workspaces and the exact current job tombstone exclusion. Mutations broaden the exclusion or omit the rendition lookup. Bind the three existing tables at the two SQL probe call sites and repoint `server/runtime/composition/site-event-subscriptions.ts:6` and the named tests. Remove the two local declarations. Keep `createFormFilePurgeHooks`, `createFormMediaCleanup` and `withFormFileStorageKeyLock` in `form-file-purge.ts`. The last two bind the SQLite in-transaction lock bypass and the host’s canonical blob key. `form-file-maintenance.ts`, `protect-existing-files.ts` and `submission-ip-expiry-sweep.ts` retain their existing host SQL/evidence and scheduling bindings. Keep their existing tests. Debt delta zero.

### 6. K-11b — Remote submissions

**Jini J6.** Move `importRemoteFormSubmissions` and its helpers through `submittedAt`, with `RemoteSubmissionInput`, `FormSubmissionReceiptPort`, `ImportRemoteSubmissionsDeps`, `RemoteImportResult`, and `FormImportCounts` to `cms/src/forms/html/import-remote-submissions.ts`. Export from the existing Node HTML entry. Use the same-package evidence, HTML-definition, validation and retained-IP helpers. Carry the analytics payload through the existing callback using a generic return type inferred from that callback. Put `fieldMaxChars`, both cap constants, and `capSubmissionFieldLengths` in `cms/src/forms/field-length-caps.ts`, exported from `forms/index.ts`. Move the current UTF-16 adjustment and code-point truncation verbatim. Tests first in `forms/html/__tests__/import-remote-submissions.test.ts` and `forms/__tests__/field-length-caps.test.ts`. Mutations move receipt claim outside the transaction, send an event for invalid rows, acknowledge unresolved slugs, or truncate by UTF-16 units.

**Tovu T6.** Tests first in `features/forms/__tests__/{import-remote-submissions.test.ts:5,field-length-caps.test.ts:6}` and the existing composition `form-submissions.test.ts`. Pin outbox failure rollback with no remote acknowledgement. Mutation commits receipt before the write fails. Repoint `features/forms/index.ts:64,191–202`, `form-destination-manifest.ts:6`, `server/runtime/composition/form-submissions.ts:13`, the surviving receipt repo or S6c binding, and the HTML field-cap caller from the integrated render branch. Delete local cap definitions and forwarding exports. Retain `FormDestinationPullReport` through `FormsAutoPullPort` in `features/forms/import-remote-submissions.ts` as the host pull contract, using moved result types directly. Its consumers include `server/routes/types.ts:61`, `form-pull-triggers.ts:3`, `features/forms/tool-registrations.ts:32`, `assistant/__tests__/tool-registrations.forms.test.ts:32`, and `form-delivery-vertical-slice.fixture.ts:15`. Debt delta zero.

### 7. K-11c — Destination registration

**Jini J7.** Move `buildFormDestinationRegistry` and private `dropShared` from `features/form-destinations/registry.ts:62–97` to `cms/src/forms/destination-registry.ts`. Export from `forms/index.ts`. Reuse `destination-contracts.ts` and `formDestinationMissingMethods`. Tests first in `forms/__tests__/destination-registry.test.ts`, porting the pure `registry.unit` cases. Mutations retain the first duplicate ID, retain either adapter on a shared co-host, or accept a module missing a required method. Preserve refusal order and exact text.

**Tovu T7.** Split the pure assertions from loader assertions in `features/form-destinations/__tests__/registry.unit.test.ts:7` before repointing. Keep the malformed trusted-plugin fixture and exact loader refusal. Mutation bypasses the builder in the source loader. In `registry.ts:1,41,52`, import the builder from Jini and delete its local body and private duplicate helper. Remove its barrel export at `index.ts:23`. Repoint `features/form-destinations/__tests__/{delivery.security:12,select.unit:4,deliver.unit:11,port.unit:10}.test.ts` and `server/runtime/composition/__tests__/{form-delivery.security.test.ts:11,form-delivery-deliverer.unit.test.ts:19}`. Keep `tovu-form-destinations.json`, trusted contribution loaders, and descriptors at the host boundary. Debt delta zero.

### 8. S8c — In-memory events and outbox

| Behavior | Core-contract Tovu implementation | Other Jini implementation |
|---|---|---|
| Enqueue | Positional envelope, first `event.id` wins | Fenced store keys by scope and idempotency key and detects digest conflicts |
| Claim | Pending or expired processing, inclusive due time, increment attempts, detached row with original due time, constructor lease default | Worker port takes a per-call lease. Fenced store recovers expired dispatches as uncertain |
| Retry/settlement | Caller supplies next status and retry time. Settlement is by ID, missing row is a no-op | Fenced completion requires current token, scope, valid state and live lease |
| Ordering | Memory selects insertion order and runs named bus handlers before catch-all handlers. SQL orders by `next_attempt_at` | Preserve each existing order |
| Production wiring | `site-deps/events-origin.ts:1,36` creates the serving bus, `memory-deps/slices/repos.ts:3,18–19` creates the memory pair, and SQL uses Jini `db/events` with the host worker translation | The old S8c list naming `outbox-repo.ts`, webhook memory and `modules/forms.ts` is stale |

**Jini J8.** Move `InMemoryEventBus`, `InMemoryOutbox`, and `isClaimable` to `core/src/contracts/events/memory-bus.ts`. Export through `core/src/contracts/events.ts`. Keep constructor compatibility and the 30-minute default without a dependency on infra. The core contract implementation is the survivor for this adoption. Leave the fenced facility and worker translation contract in place. Tests first in `core/src/contracts/events/__tests__/memory-bus.test.ts`. Mutations dispatch concurrently, swallow a handler’s error, overwrite duplicate data, reclaim one millisecond early, sort the memory queue by due time, or retry a terminal row.

**Tovu T8.** Tests first in `contracts/core/events/__tests__/{memory-bus,outbox-worker,outbox-repo.contract,jini-outbox-parity}.test.ts`. Preserve custom-lease `outbox-worker.test.ts:312`. Mutation returns the renewed lease in the claimed record instead of the original due time. Repoint the serving and memory roots above, the types in `site-deps/redirects.ts:17` and `memory-deps/slices/{comments:12,publish-content-stores:8,taxonomy-trash-repos:2,memory-trash:13}.ts`, and every fixture/test from the manifest below. `outbox-drainer.scheduling.test.ts:53` embeds a file URL in child-process source. Replace that with `import.meta.resolve("@jini-ai/core/contracts/events")` so it resolves the installed entry. Remove `events/index.ts:4` and delete `memory-bus.ts`. Debt delta zero.

**Importer manifests for T2, T4, T6 and T8.** Run on `0c0f54a0a`, then the chosen combined parent. This prints exact file and line rows, including multiline named imports, dynamic imports, source-reading fixtures and barrel consumers. Keep the declaration and call rows as checks. Edit imports/exports and the call shapes explicitly named in each sheet.

```bash
git grep -n -w \
  -e EntryListFieldValue -e EntryListItem -e EntryListRenderOptions \
  -e ENTRY_LIST_DEFAULT_STYLE -e renderEntryList -e renderEntryListStructuredData \
  -e withEntryListStyleOnce -e GoLiveRow -e GoLiveCandidatesPort \
  -e announcePendingGoLive -e announceDueGoLives -e wentLiveSinceSave \
  -e goLiveEvent -e POST_GO_LIVE_LOOKBACK_MS -e POST_GO_LIVE_SWEEP_INTERVAL_MS \
  -e fieldMaxChars -e capSubmissionFieldLengths -e FORM_TEXT_MAX_CHARS \
  -e FORM_LONG_TEXT_MAX_CHARS -e FormSubmissionReceiptPort \
  -e ImportRemoteSubmissionsDeps -e RemoteImportResult -e RemoteSubmissionInput \
  -e FormImportCounts -e importRemoteFormSubmissions \
  -e InMemoryEventBus -e InMemoryOutbox -e memory-bus \
  HEAD -- apps/website/src
```

## S/U closeout

- **S4d.** Keep `marker-sql.ts` because idempotent flips lack the generic `noop` flag and its delete permits a matching live row. Keep `comment.ts` for restore-to-pending and retained moderation logs. Keep `post.ts` for revision and dialect-sensitive search cleanup. Keep `redirect.ts` for disabled-marker semantics and dependent row cleanup. Keep `media.ts` for version-first blob-aware purge. `table-adapter.marker-sql-parity.test.ts` exercises a form-table fixture. It gives no proof that any of these four domain adapters can be replaced. Member and user adapters retain their transaction and identity effects.
- **Identity.** In `features/identity`, the generic candidates are `InMemoryApiKeyRepo` (`repo.memory.ts:16`, `wiring.ts:17`, API-key `handler-failures.test.ts:8`), `UserPurgePort`/`InMemoryUserPurge` (`user-purge-types.ts:53,80`, `user-purge.ts:5`, trash `adapters/user.ts:1`, `user-purge.test.ts:7`), and the permission-list builder (`permission-list-tool.ts:32`, composition catalog `:46`, its unit suite `:5`, assistant contracts `:16`). Preserve purge-error identity at `delete-user-service.ts:4` and admin `users/delete.ts:6`. `owner-reset-env.ts:31` is an env binding. `wiring.ts:82,305,344` binds host defaults and stores. `builtin-role-grants.ts:92,181` and `permission-grants.ts:33` bind role policy, with composition at `app-permission-grants.ts:3`. `delete-user-service.ts:99–299` supplies owner-floor and Trash policy to admin users routes and `dev-auth.ts:37`. `tool-registrations.ts:25–26` already delegates generic identity registration. Its remaining confirmation, secret-card and held chat imports stay host-owned.
- **Consent deletion.** `members/consent-service.ts:39,61,128,193,250` exports the deps type and four privacy operations. `members/index.ts:109–114` exports them and `members/__tests__/consent-service.test.ts:8,10` imports them directly. Before authorizing deletion, resolve namespace/dynamic `members` imports and the tool/capability registration roots on the combined tip. Preserve the separate live `bindSiteConsentService` path at `server/runtime/composition/app.ts:189` and newsletter consent ports. Keep the deletion out of both jobs.

## Batched Codex 6.1 Sol jobs

| Job branch | Repo | Run order |
|---|---|---|
| `codex/jini-tq-extract` | Jini | **8 sheets** — J1 → J2 → J3 → J4 → J5 → J6 → J7 → J8. Base on merge-5 plus the completed publish and render prerequisites. |
| `codex/tv-tq-adopt` | Tovu | **8 sheets** — T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8. Start on the combined source parent after the Jini snapshot is available. |

Between jobs, **OPUS-CLOUD** owns the new CMS themes validation, migration, publication and posts entry metadata, snapshot publication, and Tovu dependency/lock updates. Run the specified mutations and package checks there. Keep the remaining design and owner-decision rows off both branches.

## OVER-ENGINEERING CULL (Opus) - WINS
# Cull of r62t-tq sheets (over-engineering judge)

Input: `o-r62t-tq/r62t-tq.md`. Bases: Tovu `0c0f54a0a` (merge-5) plus pushed `origin/codex/tv-xd5-publish` (23c00b5bc) and `tv-xd5-render`. Jini `ro-jini-m5` `e06b3c201` plus `codex/xd5-publish` (c44b0fae8, holds `cms/src/themes/*`) and `codex/xd5-render` (55e32eecd). Read-only; anchors spot-checked with `git show` and single-symbol `git grep`.

Counts (16 sheets): **KEEP 2** (J7, T7) / **CUT-TO 8** (J1, T1, J2, T2, J4, T4, J6, T6; J6 and T6 each split into a/b) / **DROP 6** (J3, T3, J5, T5, J8, T8).

## Verdicts

| Sheet | Verdict | Codex | Reason |
|---|---|---|---|
| **J1** manifest validation (Jini) | CUT-TO | READY (after base) | Real extraction of a 548-line pure validator. Cut: no 4-file partition (Jini has no file-length rule, `eslint.config.mjs:74` is per-function only; partitioning shortens no function). Cut `markup.ts`/`webmcp-markup.ts`: `webmcp-markup.ts:176–182` hard-codes `data-tovu-agent` / ruleId `markup-tovu-agent-retired` (product name in Jini). Cut migration plan: its only consumer `migrate-theme.ts` stays in Tovu ("for later"). Move `rejectTemplateFor` (10 lines, generic text, `template-applicability-errors.ts` on publish branch) next to the Jini parser instead of injecting it. |
| **T1** (Tovu) | CUT-TO | READY (after base) | Drop the whole T-TH-04 half: injecting `templateValidators` into `theme-template-sources.ts` adds an option inside Tovu with no Jini consumer (loader and linters stay host). Drop the new `validate-theme-package.test.ts` strengthening. Sheet missed two importers: `features/widgets/__tests__/integration/html-{form,taxonomy}-embeds.integration.test.ts` (but they import `markup.ts`, which now stays, so no edit). |
| **J2** entry-list (Jini) | CUT-TO | READY (after base) | Keep the move. Cut the `markup` object carrying class tables: the only Tovu-specific strings are the `data-tovu-entry-list` attribute and the style block (`entry-list-render.ts:83–107,334,354–370`); class names `entry-list`/`entry-card`/`entry-accordion` are generic and stay verbatim. |
| **T2** (Tovu) | CUT-TO, **WAIT** | READY (after combine) | Drop the 12 new golden tests (test-only churn); port the two existing suites to Jini instead of duplicating. `static-render.ts` is touched by tv-ext-cms2, tv-rs-e, tv-split, tv-xd5-render; `document-shell.ts` by tv-xd5-render. |
| **J3** page publication (Jini) | DROP | — | `page-publication.ts` is 63 lines; the "generic" part is an 8-line `togglePages` plus a read/write pair. A 6-callback `commitThemePagePublication` port for that is exactly the flagged pattern. Keep in Tovu. |
| **T3** | DROP | — | Follows J3. |
| **J4** go-live (Jini) | CUT-TO | READY (after base) | Keep (pure, ~50 lines). Cut the new `posts/` domain + `posts/index.ts` + new package entry: the event is `entry.published` and Jini `entries/write-service.ts:604,641` already emits that event, so it goes into the existing `entries` domain and entry. Cut the two `POST_GO_LIVE_*` timer constants: only `go-live-sweep.ts:5` (host timer) uses them. |
| **T4** (Tovu) | CUT-TO, **WAIT** | READY (after combine) | `server/routes/types.ts` is touched by tv-ext-rs-c, tv-rs-e, tv-split, tv-xd5-render. |
| **J5** attachment SQL probes (Jini) | DROP | — | `form-file-purge.ts:33–36,65–78` are ~20 lines of host SQL over the host's `media`/`asset_renditions`/`asset_blobs` schema; Jini's attachment purge already takes them as ports. Moving them into `forms/sql` with injected table names adds an adapter layer and puts media queries in the forms domain. Keep in Tovu. |
| **T5** | DROP | — | Follows J5. |
| **J6** remote import + field caps (Jini) | CUT-TO (split a/b) | READY (after base) | Real generic forms logic. Cut the inferred generic for analytics: type the callback return as `object \| undefined` (an interface is not assignable to `Record<string, unknown>`). Split caps (a) from importer (b): separate caller sets. |
| **T6** (Tovu) | CUT-TO (split a/b), **WAIT** | READY (after combine) | Drop the new rollback-pin test (moved suite carries behaviour; mutations run in cloud). Name the vague "surviving receipt repo": `platform/db/repos/form-submission-receipt-repo.ts:1` (touched by tv-ext-rs-c). The field-cap render caller is `form-render.ts:31` on base and `render/contact-form-widget.ts:4` on tv-xd5-render. |
| **J7** destination registry (Jini) | KEEP | READY (after base) | Small, pure, verbatim (`registry.ts` builder + `dropShared`). |
| **T7** (Tovu) | KEEP + one deletion | READY (after base) | Also delete the host wrapper `parseFormDestinationsFile` (`registry.ts` tail, "this host wrapper retains its existing name") — a re-export shell whose only caller is `registry.unit.test.ts:7`. No overlap with pushed branches. |
| **J8** S8c memory bus (Jini) | DROP | — | Decision: duplication, not extraction. Jini already has TWO outbox contracts (`core/contracts/events` OutboxPort with `db/src/events/outbox-repo.sql.ts:78`, and `@jini-ai/infra/events/outbox` with its own worker + `DEFAULT_OUTBOX_CLAIM_LEASE_MS`, used by Tovu `jini-outbox-adapter.ts:3`) plus the fenced store. `core/contracts/events.ts` is a types-only universal entry (`export type *`); adding runtime classes changes its nature. Tovu repoint = **152 files**. Keep in Tovu. Real fix later is convergence onto one Jini outbox contract (design job, not Codex). |
| **T8** | DROP | — | Follows J8 (includes the test-only `import.meta.resolve` change). |

## Exact cut text

Jini paths are under `packages/cms/src`. Tovu paths are under `apps/website/src` **on the combined tip**; re-find every line number there (anchors below are from the reviewed branches). Moves are verbatim except for import paths and the named changes. New tests are ports of existing Tovu suites; a ported case that imports a `#src/` fixture stays in Tovu, repointed, instead. Delete each ported Tovu suite. No other new tests.

### J1 — manifest v2 validator (Jini)
1. Move `features/theme/validation/manifest-v2.ts` (as on tv-xd5-publish) verbatim to `themes/manifest-v2.ts`. Move the `ThemeValidationIssue` interface (Tovu `validation/profiles.ts:33–37`) into that file and export it.
2. `validateManifestV2(required: { raw; validateScripts: (required: { scripts: unknown }) => { problems: readonly string[] }; isSourceDirGeneratedConflict: (required: { sourceDir: string }) => boolean }, _optional = {})`. Replace the two Tovu imports with these fields; thread `isSourceDirGeneratedConflict` as a required field to the private build-check helper that calls it (currently `:523`). No other signature change; finding order unchanged.
3. Move `rejectTemplateFor` verbatim from Tovu `features/theme/template-applicability-errors.ts` into `themes/template-applicability.ts` (export). `manifest-v2.ts` imports it from `./template-applicability.js`.
4. `cms/package.json`: add `"./themes/manifest-v2": "universal",` next to `"./themes/layout": "universal",` and an exports block `"./themes/manifest-v2": { "types": "./dist/themes/manifest-v2.d.ts", "import": "./dist/themes/manifest-v2.js", "default": "./dist/themes/manifest-v2.js" }` next to `"./themes/layout"`.
5. Tests: port Tovu `validation/__tests__/manifest-v2.test.ts` to `themes/__tests__/manifest-v2.test.ts`, passing the real-shaped fakes `validateScripts: () => ({ problems: [] })` / `isSourceDirGeneratedConflict: () => false` except in cases that assert those findings (there, fakes return the problem / `true`). Add one case to `themes/__tests__/template-applicability.test.ts` per `rejectTemplateFor` message (3).

### T1 — repoint validator (Tovu)
1. `validation/validate-theme-package.ts`: import `validateManifestV2` from `@jini-ai/cms/themes/manifest-v2`; call `validateManifestV2({ raw, validateScripts, isSourceDirGeneratedConflict })` with `validateScripts` from `@jini-ai/cookie-consent/policy` and `isSourceDirGeneratedConflict` from `../theme-file-policy.js`.
2. Delete `validation/manifest-v2.ts`, `template-applicability-errors.ts`, and `validation/__tests__/manifest-v2.test.ts` (ported). Repoint `theme-manifest.ts` (`rejectTemplateFor`) and `__tests__/template-applicability.unit.test.ts` to `@jini-ai/cms/themes/template-applicability`; `__tests__/declared-scripts.unit.test.ts` and any other direct `validateManifestV2` test caller pass the same two real deps.
3. Delete the interface at `validation/profiles.ts:33–37`; every `ThemeValidationIssue` user (`profiles.ts`, `validation/{markup,references,structure,webmcp-markup}.ts`, plus `git grep -n -w ThemeValidationIssue HEAD -- apps/website/src`) imports the type from `@jini-ai/cms/themes/manifest-v2`.
4. Nothing else: `markup.ts`, `webmcp-markup.ts`, `theme-template-sources.ts`, migration files unchanged. Debt delta zero.

### J2 — entry list (Jini)
1. New `listing/entry-list.ts`: move verbatim from Tovu `features/theme/entry-list-render.ts` the five `EntryList*` types, `renderEntryList`, `renderEntryListStructuredData`, `withEntryListStyleOnce`, and their private helpers. Imports: `./html.js` (`wrapListingItems`), `../navigation/href.js`, `escapeHtml` from `@jini-ai/core/text`. Export from `listing/index.ts` (`export * from './entry-list.js';`).
2. Only change: `renderEntryList({ items, options, attribute })` with `attribute: string` required; every literal `data-tovu-entry-list` in rendered markup uses `attribute`. `withEntryListStyleOnce({ html, attribute, style })`: first check `html.includes(attribute)`, second `html.includes(\`<style ${attribute}>\`)`, insert `style`. `ENTRY_LIST_DEFAULT_STYLE` and `ENTRY_LIST_STYLE_OPEN_TAG` do not move. `renderEntryListStructuredData` args unchanged. Doc comments: say "the host's wrapper attribute".
3. Tests: port Tovu `__tests__/entry-list-render.test.ts` and `entry-list-render-layouts.test.ts` to `listing/__tests__/entry-list.test.ts` with `attribute: "data-test-entry-list"`; one added case asserts that attribute appears on the wrapper and gates `withEntryListStyleOnce` (style inserted once, never without the wrapper).

### T2 — host markup (Tovu, WAIT combine)
1. New `features/theme/entry-list-markup.ts`: `export const ENTRY_LIST_ATTRIBUTE = "data-tovu-entry-list";` plus `ENTRY_LIST_STYLE_OPEN_TAG` and `ENTRY_LIST_DEFAULT_STYLE` moved byte for byte.
2. `static-render.ts` and `server/inbound/public-http/http/site/render/document-shell.ts`: `withEntryListStyleOnce({ html, attribute: ENTRY_LIST_ATTRIBUTE, style: ENTRY_LIST_DEFAULT_STYLE })` from `@jini-ai/cms/listing`. `render/widgets/social-entries.ts` and `routes/site/pages/render-context/collection-lists.ts`: `renderEntryList({ ..., attribute: ENTRY_LIST_ATTRIBUTE })`, types from `@jini-ai/cms/listing`.
3. Remove listing exports from `features/theme/index.ts` and `features/theme/rendering.ts`; delete `entry-list-render.ts` and the two ported suites; repoint `__tests__/static-render-collection.test.ts`. Keep `http/site/__tests__/render.test.ts` style coverage untouched. Debt delta zero.

### J4 — go-live (Jini)
1. New `entries/go-live.ts`: move verbatim `GoLiveRow`, `GoLiveCandidatesPort`, `wentLiveSinceSave`, `goLiveEvent`, `announcePendingGoLive`, `announceDueGoLives` from Tovu `features/post/go-live.ts`. `kind: string`. Replace `isTrashed(post)` with `(post.deletedAt !== undefined && post.deletedAt !== null)`. `PostStatus` from its `cms/src/core` source file; `DomainEvent`/`OutboxPort` from `@jini-ai/core/contracts/events`; `UUID` from `@jini-ai/core/primitives`. Export all six from `entries/index.ts`. No new package entry.
2. Tests: port Tovu `features/post/__tests__/{go-live,go-live.characterization}.test.ts` to `entries/__tests__/{go-live,go-live.characterization}.test.ts`.

### T4 — repoint go-live (Tovu, WAIT combine)
1. Move `POST_GO_LIVE_SWEEP_INTERVAL_MS` and `POST_GO_LIVE_LOOKBACK_MS` (with their docs) verbatim into `features/post/go-live-sweep.ts`; it imports the rest from `@jini-ai/cms/entries`.
2. Repoint to `@jini-ai/cms/entries`: `features/post/{post-write-effects.ts,repo.memory.ts,repo.ts}`, `features/pages/{html-document-store.ts,html-document-store.memory.ts}` (they import `announcePendingGoLive` via `../post/index.js` — import it from Jini, keep `SYSTEM_ACTOR_ID` from post index), `server/routes/types.ts` (`GoLiveCandidatesPort` only), and tests `features/post/__tests__/{go-live.repo,post.schedule-events,reverters.schedule-events}.test.ts`, `features/pages/__tests__/html-document-store.go-live.test.ts`.
3. Remove `features/post/index.ts:38`; delete `go-live.ts` and the two ported suites. Host sweep timer/clock/error reporting unchanged; debt at `error-gate-debt.json` unchanged.

### J6a — field caps (Jini)
New `forms/field-length-caps.ts`: move verbatim `FORM_TEXT_MAX_CHARS`, `FORM_LONG_TEXT_MAX_CHARS`, `fieldMaxChars` (Tovu `features/forms/render-entry.ts`) and `surrogatePairs` + `capSubmissionFieldLengths` (Tovu `features/forms/field-length-caps.ts`). Types from `./types.js`. Export the four public names from `forms/index.ts`. Port Tovu `features/forms/__tests__/field-length-caps.test.ts` to `forms/__tests__/field-length-caps.test.ts`.

### J6b — remote import (Jini)
New `forms/html/import-remote-submissions.ts`: move verbatim `RemoteSubmissionInput`, `FormSubmissionReceiptPort`, `ImportRemoteSubmissionsDeps`, `RemoteImportResult`, `FormImportCounts`, `importRemoteFormSubmissions` and private helpers (Tovu `features/forms/import-remote-submissions.ts` lines 1–~190, everything before `FormDestinationPullReport`). Imports become same-package relative paths (the files that `forms/index.ts` / `forms/html/index.ts` re-export) and `../field-length-caps.js`. Only type change: `readAnalyticsProvenance?: (required: { item: RemoteSubmissionInput }) => object | undefined`. Doc comments: "Tovu" → "the host". Export from `forms/html/index.ts`. Port Tovu `features/forms/__tests__/import-remote-submissions.test.ts` to `forms/html/__tests__/import-remote-submissions.test.ts`.

### T6a / T6b — repoint (Tovu, WAIT combine)
- T6a: delete `features/forms/render-entry.ts` and `features/forms/field-length-caps.ts`; repoint `features/forms/index.ts` (`capSubmissionFieldLengths`), `features/forms/form-destination-manifest.ts`, and the render caller (`server/inbound/public-http/http/site/render/contact-form-widget.ts` on the combined tip; `form-render.ts` if it still imports it) to `@jini-ai/cms/forms`. Delete the ported suite.
- T6b: in `features/forms/import-remote-submissions.ts` delete everything moved; keep `FormDestinationPullReport` … `FormsAutoPullPort` importing moved types from `@jini-ai/cms/forms/html`. Remove the moved names from `features/forms/index.ts` exports; repoint `server/runtime/composition/form-submissions.ts` and `platform/db/repos/form-submission-receipt-repo.ts` to `@jini-ai/cms/forms/html`. Tovu's `readAnalyticsProvenance` binding keeps returning `FormAnalyticsProvenance` (assignable to `object`). Delete the ported suite; keep composition `form-submissions.test.ts` (repoint imports only). Debt delta zero.

### J7 — destination registry (Jini)
As input sheet: move `buildFormDestinationRegistry` and private `dropShared` verbatim to `forms/destination-registry.ts`, export from `forms/index.ts`, reuse `formDestinationMissingMethods` and `FormDestinationRegistry`/`LoadedFormDestination` from `destination-contracts.ts`. Port the pure `registry.unit` cases (`:47,63,80` blocks) to `forms/__tests__/destination-registry.test.ts`. Refusal order and text unchanged.

### T7 — repoint registry (Tovu)
As input sheet (registry imports the builder from `@jini-ai/cms/forms`; delete local body + `dropShared`; remove from `index.ts:23`; repoint `features/form-destinations/__tests__/{delivery.security,select.unit,deliver.unit,port.unit}.test.ts` and `server/runtime/composition/__tests__/{form-delivery.security,form-delivery-deliverer.unit}.test.ts`). **Plus**: delete the `parseFormDestinationsFile` wrapper at the end of `registry.ts` and its `index.ts:23` export; `registry.unit.test.ts` imports `parseFormDestinationsFile` from `@jini-ai/cms/forms`. Keep loader cases (malformed trusted plugin, exact refusal) in Tovu; delete ported pure cases. Debt delta zero.

### Importer manifest (run on the combined tip before T-edits)
```bash
git grep -n -w -e EntryListFieldValue -e EntryListItem -e EntryListRenderOptions -e EntryListLayout \
  -e EntryListStructuredData -e ENTRY_LIST_DEFAULT_STYLE -e renderEntryList -e renderEntryListStructuredData \
  -e withEntryListStyleOnce -e GoLiveRow -e GoLiveCandidatesPort -e announcePendingGoLive -e announceDueGoLives \
  -e wentLiveSinceSave -e goLiveEvent -e fieldMaxChars -e capSubmissionFieldLengths -e FORM_TEXT_MAX_CHARS \
  -e FORM_LONG_TEXT_MAX_CHARS -e FormSubmissionReceiptPort -e ImportRemoteSubmissionsDeps -e RemoteImportResult \
  -e RemoteSubmissionInput -e FormImportCounts -e importRemoteFormSubmissions -e validateManifestV2 \
  -e rejectTemplateFor -e ThemeValidationIssue -e buildFormDestinationRegistry -e parseFormDestinationsFile \
  HEAD -- apps/website/src
```
Stop a sheet if a hit outside the named files needs a contract change.

## NEEDS-DECISION recommendations (one line each)

- **T-TH-03 render contract**: keep in Tovu; nothing in Jini consumes the loaded-manifest types yet.
- **T-TH-05 guarded read/list residue**: keep in Tovu; swap needs symlink/missing/refusal parity proof (Opus, not Codex). Low value.
- **T-TH-06 worker/engine residue**: leave with the render-round OPUS-CLOUD owner; not Codex.
- **T-TH-07 other lifecycle residue** (duplicate, lock, migrate, save-original, sync-originals, preview image): keep in Tovu.
- **T-TH-07 migration plan (`planV2Migration`)**: keep in Tovu (cut from J1); only consumer is host migration.
- **T-TH-08 generic theme tool registration**: drop; host tool IDs/approval/catalog stay.
- **T-PO-03 remaining post domain**: keep in Tovu for now; revisit only after go-live lands, and then into `cms/entries`, not a new `posts` domain.
- **T-PO-04 post repos/search**: keep in Tovu (dialect search + CAS semantics; high risk, low reuse).
- **T-PO-05 post tool registration split**: keep in Tovu.
- **T-NL-01/02/03 newsletter**: keep in Tovu (owner parked DT1).
- **K-11 comment markers**: keep in Tovu; traversal is already Jini's.
- **S/U consent-service deletion**: one Opus check on the combined tip for dynamic/barrel users, then delete if none; not in these jobs.
- **S/U identity (`InMemoryApiKeyRepo`, `InMemoryUserPurge`, permission-list builder)**: keep in Tovu; in-memory/test adapters and policy bindings, low value.
- **S8c follow-up**: if wanted later, one design note choosing a single Jini outbox contract (core vs infra) — not a move.
- **S4d / U2c-1 / S8a / S8b / K-05b / K-07b / chat / env / arch L08/L14/L15 / 424 UI fns**: agree RETIRE/DONE.

## Final batched run plan

Both jobs **WAIT for combine-6**: no Jini tip yet contains both `codex/xd5-publish` (themes dir, needed by J1) and `codex/xd5-render` (`origin/cloud/combine` contains neither nor e06b3c201). Tovu T2/T4/T6 touch files changed by tv-xd5-render, tv-ext-rs-c, tv-ext-cms2, tv-rs-e, tv-split; T1 touches files changed by tv-xd5-publish.

**Jini Codex job** (`codex/jini-tq-extract`, base = Jini combine-6 tip containing e06b3c201 + xd5-publish + xd5-render), in order:
1. J7 destination registry
2. J6a field caps
3. J6b remote import
4. J4 go-live → `cms/entries`
5. J2 entry list (attribute + style injected)
6. J1 manifest-v2 + `rejectTemplateFor` + one package entry

**Tovu Codex job** (`codex/tv-tq-adopt`, base = Tovu combine-6 tip containing merge-5 + tv-xd5-publish/render + tv-ext-* + tv-rs-e + tv-split + tv-dh, with the Jini job source linked), in order:
1. T7 (+ `parseFormDestinationsFile` wrapper deletion)
2. T6a
3. T6b
4. T4
5. T2
6. T1

OPUS-CLOUD between/after: Jini build + mutations from the input sheet for the kept moves, publish snapshot, Tovu lock bump. Only one new Jini package entry (`./themes/manifest-v2`); everything else uses existing `./listing`, `./entries`, `./forms`, `./forms/html`, `./themes/template-applicability`.

**Dropped:** J3/T3 page publication, J5/T5 attachment SQL probes, J8/T8 S8c memory bus, J1 partition/markup/webmcp/migration parts, T1's T-TH-04 linter injection and new tests, T2 goldens, J2 class-table `markup` object, J4 `posts/` domain + timer constants, J6 generic, T6 new rollback test.
