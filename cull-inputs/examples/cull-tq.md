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
