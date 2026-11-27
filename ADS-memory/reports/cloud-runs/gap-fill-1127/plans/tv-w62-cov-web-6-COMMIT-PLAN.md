# Website coverage gap fill

Tests only. Each source mutation below was checked against the named test by inspection under the no-execution directive. No test, coverage, typecheck, or mutation run was performed. Paths in the first section are relative to `apps/website/src/features/theme/`.

- `__tests__/held-back-themes.unit.test.ts` / a malformed held-back manifest falls back to the folder name → remove the SyntaxError fallback in `heldBackThemeName`.
- `__tests__/held-back-themes.unit.test.ts` / a marker filed as a directory reports a read fault instead of hiding the held-back notice → swallow the unexpected read error in `readHeldBackChoice`.
- `__tests__/held-back-themes.unit.test.ts` / a quarantine path loop is reported as a filesystem fault, not as an empty roster → return false instead of rethrowing in `held-back-themes.ts:exists` or `isHeldBackFolder`.
- `__tests__/page-publish-tool.test.ts` / a declarative theme cannot gain a static page publication allowlist → drop the non-static guard in `setThemePagePublished`, allowing its ineligible-page error to mask the tier refusal.
- `__tests__/preview-switcher.test.ts` / preview reserves admin and API route segments but not lookalike theme page names → drop the end-of-segment condition or case-insensitive matching in `isReservedThemePreviewPath`.
- `__tests__/theme-preview-image.test.ts` / the default capture URL version changes after a source edit without a custom version reader → return a fixed version or ignore file mtimes when computing the card URL.
- `__tests__/tool-registrations.edge-refusals.test.ts` / theme rename rejects a backslash separator and dot directory names without moving the source → drop the backslash or either dot directory check.
- `__tests__/theme-edit-batch-same-file.test.ts` / ambiguous edits are refused until replaceAll is explicit, then report every literal replacement → remove the ambiguity check, replace only one occurrence, or report the single-edit count on replaceAll.
- `__tests__/theme-edit-batch-same-file.test.ts` / blanking a file requires delete intent and single replacement treats dollar text literally → ignore the empty-content guard, drop the delete exception, or pass the literal new string as a replacement pattern.
- `__tests__/theme-files.edge-cases.test.ts` / a nonregular FIFO does not appear in editable theme files → append all nondirectory entries instead of only regular files.
- `__tests__/theme-files.edge-cases.test.ts` / binary theme writes refuse a directory destination without changing its contents → skip nonregular-file validation when writing a binary.
- `__tests__/visitor-handles.unit.test.ts` / Unicode text before the closing tag leaves the publication script inside the original body → use lowercased-string offsets on original HTML. This is already the production implementation and the test is intentionally red by inspection.
- `__tests__/visitor-handles.unit.test.ts` / a publication expires at thirty minutes and a newer document is still available → change the expiration comparison from `<=` to `<`, or revoke prior documents eagerly.
- `__tests__/visitor-handles.unit.test.ts` / submit handles identify only enclosed submitters with an eligible effective target → use form defaults instead of submitter overrides, or remove one of the method, query, or explicit-form guards.
- `__tests__/static-render-asset-quotes.test.ts` / an unsaved v2 fragment gets a tokenized document and rewritten assets instead of the saved page → omit the HTML override or fail to pass the v2 API version to the fragment wrapper.
- `migration/__tests__/theme-migration-plan.test.ts` / static planning carries token modes and provenance in place and distinguishes partial variants from lookalikes → match only bare slot stems, drop the HTML suffix check, or mark mode-scoped tokens as unknown.
- `apps/website/src/features/webmcp/__tests__/published-html.pins.test.ts` / a published fragment keeps its original bytes and appends exactly one discovery script → prepend the discovery script on fragments without a closing body.
- `apps/website/src/features/widgets/__tests__/unit/deps.unit.test.ts` / region operations can use the bound host reader without exposing the host on enumerable deps → omit the non-enumerable host from region dependencies or bind it to the caller post repo.
- `__tests__/set-active-theme-tool.test.ts` / a tracker failure cannot undo activation and a same-value request does not record it again → propagate tracker exceptions, drop the system actor fallback, or capture for unchanged selections.
- `validation/__tests__/profiles.test.ts` / a managed gallery image's missing authored alt remains advisory even at publish → remove the alt-only warning exception or broaden it to invalid gallery configurations.
- `apps/website/src/features/widgets/__tests__/unit/media-html-events.unit.test.ts` / an unfamiliar pipeline diagnostic retains its event code and structured detail in the server log → discard unknown events or forward serialized detail rather than structured fields.
- `__tests__/theme-preview-image.test.ts` / a directory removed during the walk retains the version already observed → return zero unconditionally after a walk error, or let the directory error escape.
- `apps/website/src/features/trash/__tests__/tool-registrations.test.ts` / without a generic registry the kind vocabulary still admits every bespoke mover and no generic kinds → require a registry unconditionally or revert to the original phase-one four kinds.
- `__tests__/held-back-themes.unit.test.ts` / checking a held-back manifest does not swallow a real read fault → turn every open error into a missing-manifest fallback or omit the no-follow open flag.
- `__tests__/held-back-themes.unit.test.ts` / listing propagates a read fault while resolving an otherwise addressable theme → return null for all errors instead of only the known unaddressable refusal in `listedTheme`.
- `__tests__/static-portability-index.test.ts` / a theme that fails to load cannot replace its last portability index → remove the invalid-load refusal before assessing or generating the index.
- `__tests__/theme-page-publish.test.ts` / publishing merges the latest on-disk decisions and refreshes what the live renderer sees → compute from the original in-memory manifest, omit deduplication/sort, or skip reloading the published roster.
- `__tests__/visitor-handles.unit.test.ts` / the publication cache drops the oldest live document only when its capacity is exceeded → remove the capacity limit, change `> 512` to `>= 512`, or discard the latest binding instead of the oldest.
- `__tests__/publish-content.apply.test.ts` / backup pruning failure after a swap keeps the new tree live and the old backup recoverable → propagate retention errors as publish failures, or prune a newer backup rather than the oldest.
- `__tests__/theme-files.edge-cases.test.ts` / an entry removed after directory enumeration does not hide surviving files → remove the vanished-entry guard or make the probe throw on ENOENT.
- `__tests__/publish-content.apply.test.ts` / an unexpected empty backup directory cleanup error is logged without disrupting publication → suppress all cleanup errors, log raw errors, or let cleanup abort the successful publish.

## Static coverage audit

Rows with only existing evidence are SKIPPED-ALREADY-COVERED. “Existing” means the specified behavior is exercised by the named tests in source. It does not mean the reported five shards executed those tests, or that all unlabelled branch/function deficits have been measured. Theme paths are relative to `apps/website/src/features/theme/`. Other test paths are relative to `apps/website/src/`.

| Source | Existing evidence or new coverage |
|---|---|
| font-links.ts | Existing `font-links.contract`: absent and explicitly disabled fonts, legacy family order/duplicates, default resources, origin-specific preconnect and attribute escaping. |
| handlebars-allowlist.ts | Existing `handlebars-allowlist`: syntax error, oversized template before parse, real helper/AST acceptance and refusals through the exported declaration at 391. |
| hardcoded-link-lists.ts | Existing `hardcoded-link-lists`: single CTA/no warning, hard-coded footer warning, over-ten list truncation, chrome vs other filenames. |
| held-back-choice.ts | New malformed manifest fallback, unexpected open/read faults, directory check fault. Existing `held-back-route`: held-back notice shown only for the original fallback and disappears after restore. |
| held-back-gated-hooks.ts | Existing `held-back-route`: digest-only refusal, declined card, approval bound to actor/theme/digest, approved restore moves only that theme. |
| held-back-themes.ts | New unexpected lookup failure and quarantine path loop propagation. Existing `held-back-themes.unit`: link refusal, same-tree check and code-unit digest ordering. |
| import-theme-file-tool.ts | Existing `assistant/__tests__/tool-registrations.theme-import-file.test.ts`: own contributor, font write/reload, authorization, local roots, default/injected logging, and shape errors. |
| liquid-allowlist.ts | Existing `liquid-allowlist`: shipped home/entry lint, parser syntax diagnostics, tag/filter/nested descriptor validation. Line 159 is an unreachable parse-only render stub, below. |
| migration/migrate-theme.ts | Existing `migration/__tests__/migrate-theme.test.ts`: v1 backup/replacement, repeated migration, staging cleanup, verification failure, unrecognized files/tier, non-static engine conversion/default tier, binary preservation and both rewrite forms. |
| migration/theme-migration-plan.ts | New static partial variant and carry-over test. Existing `theme-migration-plan`: no-layout/missing folders, optional assets, recognized and unrecognized per-tier paths, nested scripts and unsupported tier. Lines 1–15 are comments. |
| page-publication.ts | New tier refusal and current-disk merge, deduplication and live readback. |
| page-publish-tool.ts | New exact tier refusal at the tool boundary. Existing `page-publish-tool`: rejected inputs, permission, path errors and unexpected JSON fault. |
| preview-policy.ts | New reserved segment vs lookalike paths. Existing `preview-refresh`: local public paths and exact reserved-path refusals. |
| preview-switcher-html.ts | Existing `preview-switcher`: live/static banner, disabled byte identity, canonical overrides, opaque script content and navigation exclusions. |
| preview-switcher.ts | Existing `preview-switcher.integration`: generic writes validate scope, authorization and revisions, including explicit theme.set denial. `preview-switcher`: query/cookie precedence and shape. |
| public-page-security-headers.ts | Existing `contracts/core/__tests__/unit/form-provider-security-headers.contract.test.ts`: unchanged origins reuse, lease changes replace and reach live/static headers. |
| public-theme-resources.ts | Existing `public-resources-lazy`: delayed loading, retries on resource failure and successful memoization. `public-theme-resource-policy.contract`: shipped header golden and strict injected reader. |
| publish-content.ts | New backup-retention fault leaves the swap committed and backups recoverable, and unexpected empty-directory cleanup produces a redacted diagnostic. Existing `publish-content.pack`: invalid address, malformed and over-cap labels, skipped-tree reasons. `publish-content.apply`: realpath/lstat faults, seed/inspect/precheck, missing wiring, retention, wrong single-file checksum and tree hash, swap failure, rollback, and renderer cache refresh. |
| render-contract.ts | Existing `template-id-resolution`: Handlebars direct home/product/products routes, post/entry fallback and missing source. |
| save-theme-original.ts | Existing `save-theme-original`: saves real catalog bytes, refuses existing site/package originals and outside/equal roots. |
| set-active-theme-tool.ts | New tracking failure cannot undo activation, system attribution, no duplicate event on a same-value request. |
| static-asset-contract.ts | Existing `static-render-asset-quotes`: unquoted/whitespace leftovers still reported. `static-render-api-version`: v2 leftover v1 JS is warned about. |
| static-page-shell.ts | Existing `static-render-page-shell-fallback`: preferred file, legacy fallback, content eligibility, exact negative paths and distinct warning reasons. |
| static-portability-index.ts | New invalid-load protection for last generated index. Existing `static-portability-index`: partial resolution with and without a suffix, light and dark CSS, placeholder cases, write/regeneration. |
| static-render-content.ts | Existing `static-render-author`: content-header byline placement, owner placement suppressing duplicate credit, escaping and hidden authors. |
| static-render-menus.ts | Existing `menu-tree-render`: menu id discovery, flat/tree/dropdown paths, variant fallback, omitted leaves, current/active classes and visitor marks. |
| static-render-previews.ts | Existing `static-render-paging`: resolved/empty/fallback paging. `static-render-listings`: keyed batch with/without next href, empty batch and featured image. `static-render-post-previews`: plain limits, fallback and escaping. |
| static-render.ts | New unsaved v2 fragment with real token and asset rendering, distinct from a saved page. Existing `menu-tree-render`: standalone partial and missing id. |
| static-template-choice.ts | Existing `static-render-page-shell-fallback`: bare page ineligibility, shell fallback and explicit choices. |
| static-template-resolution.ts | Existing `template-resolution`: null/undefined fallback, explicit no-template, explicit choice, missing/content-slotless fallback and retired template aliases. |
| structure-only-theme.ts | Existing `duplicate-theme`: structure-only copy preserves functional wiring and preview, strips appearance and cleans staging on failure. |
| sync-originals.ts | Existing `sync-originals`: sorted paths and independent added/removed/changed reports, exact catalog updates and failed copy preservation. |
| theme-discovery.ts | Existing `template-id-resolution`: duplicate and invalid IDs and current-first stored lookup. `theme-list-active`: stored aliases and missing selections. |
| theme-file-identity-tools.ts | New backslash/dot filename refusal. Existing `assistant/__tests__/tool-registrations.themes-edit-rename.test.ts`: no-op, extension, collision and direct generated destination. `tool-registrations.themes-reset-copy`: missing source and suffix allocation. `tool-registrations.themes-trash-restore`: refused rename inside trash. |
| theme-file-import.ts | Existing `theme-file-import`: reads local/URL inputs, validates magic bytes, preserves bytes, enforces caps and input policies. Lines 1–21 are comments. |
| theme-file-listing.ts | New FIFO exclusion and disappearing-entry handling with surviving-file controls. Existing `theme-files` and `theme-files.edge-cases`: symlinks and loop, sorted real paths, absent folder, bounds and render priority. |
| theme-file-policy.ts | Existing `theme-file-write-scope`: no build, missing source, filename/scope boundaries and normalized paths. `theme-files`: generated folder/file and sourceDir conflicts. |
| theme-file-trash-tools.ts | Existing `assistant/__tests__/tool-registrations.themes-trash-restore.test.ts`: restore prunes only empty parents, tolerates vanished parents, propagates other cleanup failures, and distinct route refusals. |
| theme-file-write-ports.ts | Existing `theme-files.edge-cases`: missing, non-regular and concurrent destination collision map to distinct errors. `theme-file-safety`: prune warning/retries and real revision readback. |
| theme-file-writing.ts | New binary destination refusal preserving contents. Existing `theme-files.edge-cases`: text directory refusal. `theme-file-import`: successful binary writes and replacements. |
| theme-files.ts | Existing `theme-files`: unrecognized root, empty/NUL path, over-limit read/replacement and containment. |
| theme-generated-restore.ts | Existing `theme-restore-generated-tree`: full restoration, removed live-only file, absent original/non-compiled refusal and empty generated tree. |
| theme-manifest-fields.ts | Existing `theme-build-manifest`: unknown framework, source defaulting, and filtered hashes. `theme-tier-validation`: absent, empty and invalid tiers. `declared-scripts.unit`: declaration resolution and rejection. |
| theme-manifest.ts | Existing `theme-slot-honors-current-page`: both accepted spellings, opt-out; `theme-build-manifest`: cross-field validation; `theme`: malformed slot entries. |
| theme-page-eligibility.ts | Existing `theme-page-publish`: off by default, allowlist, index/404/reserved/template exclusion. The new live readback test also exercises this predicate. |
| theme-preview-image.ts | New default edit-driven capture version and partial result on disappearing directory. Existing `theme-preview-image`: thumbnail precedence, real source mtimes and exclusions, depth and count bounds, nonregular entries. |
| theme-read-content.ts | Existing `theme-read-file-window`: complete/file window/find, numeric bounds and find type/length errors, contextual defaults and normalization. |
| theme-read-tools.ts | Existing `theme-rescan-tool`: added/removed and invalid themes. `tool-registrations.page-publication-read`: fresh candidate state. `theme-read-file-window`: full/window/find and truncation/return shape. |
| theme-reset-file-tool.ts | Existing `assistant/__tests__/tool-registrations.themes-reset-copy.test.ts`: modified/pristine/binary/missing original and live-state refresh. |
| theme-roster-ports.ts | Existing `theme-roster-sync`: the bound rescan detects cross-process additions/removals and nested edits; reserved path policy also tested in `preview-refresh`. |
| theme-static-assets.ts | Existing `theme-static-tier`: static/nonstatic paths, missing/malformed light tokens, template source and marker checks. `bundled-template-fallback.unit`: local files and applicability win. |
| theme-template-sources.ts | Existing `theme`: accepted Liquid and Handlebars, disallowed constructs, alternative Handlebars suffix, missing/invalid JSON. `theme-load-api-version`: v2 layout and missing v2 template diagnostics. |
| theme-tool-editing.ts | New literal replacement metacharacters in global/single replacement. Existing `assistant/__tests__/tool-registrations.themes-edit-rename.test.ts`: missing/ambiguous matches and explicit delete intent. `theme-write-file-built-gate`: unchanged vs redefined write boundary. |
| theme-tool-view.ts | Existing `theme-list-build-view`: authored omission and compiled build projection. `assistant/__tests__/tool-registrations.themes.test.ts`: public roster projection with no host filesystem path. |
| theme-trash-binding.ts | Existing `theme-trash`: invalid segment/misplaced folder, delegated moves and restore, rollback and roster. |
| theme-watch-bindings.ts | Existing `theme-watcher`: real watcher/marker refresh, forced nested reload and opening failure logged without a supplied override. |
| theme-write-tools.ts | New replaceAll count and literal bytes. Existing `assistant/__tests__/tool-registrations.themes-edit-rename.test.ts`: matched replacement and result shape. |
| theme.ts | Listed gaps at 30 and 33–83 are erased type declarations. Existing `theme` and `theme-static-tier` exercise runtime loading. |
| token-aliases.ts | Existing `token-aliases`: no dangling aliases, dark and light owner precedence, and public token rendering. |
| tool-registrations.ts | Lines 1–31 are comments. Existing `assistant/__tests__/tool-registrations.themes.test.ts`: all 13 tools wired exactly, unknown risk refused, authorization and real read/write sequencing. |
| trash-theme-tool.ts | Existing `theme-trash`: active, missing, denied, duplicate and vanished refusals; successful whole-theme moves, routed admin restore and contributor. |
| validation/markup.ts | Existing `validation/__tests__/markup.test.ts`: invalid JSON/unquoted findings with file, known vs misspelled embed and ordered mixed issues. |
| validation/profiles.ts | New gallery alt vs invalid config severity. Existing `profiles`: all three profiles for polish/unknown/unimplemented rules. |
| validation/references.ts | Existing `validation/__tests__/references.test.ts`: missing source/variant ownership, repeated same-owner, and non-object behavior. |
| validation/structure.ts | Existing `validation/__tests__/structure.test.ts`: real sourceDir validation, generated/approved root conflicts, and otherwise clean source directory. |
| validation/validate-theme-package.ts | Existing `validation/__tests__/validate-theme-package.test.ts`: valid v1 and v2, malformed/missing/invalid shape, and profile aggregation. |
| validation/webmcp-markup.ts | Existing `validation/__tests__/webmcp-markup.unit.test.ts`: nested and explicit form ownership, non-form/missing owners, rule ID and file diagnostics. |
| visitor-publication.ts | New effective submit target projection, Unicode placement regression, TTL and live-cap eviction. Existing `assistant/site/__tests__/visitor-page-policy.unit.test.ts`: workspace isolation, concurrent documents, authored and derived collisions and private scope. |
| trash/adapters/comment.ts | Existing `features/trash/__tests__/comment-adapter.test.ts`: hide, restore to pending, stale/foreign denial, purge retaining audit. Lines 1–15 are comments. |
| trash/adapters/redirect.ts | Existing `features/trash/__tests__/marker-adapters.dialects.test.ts`: redirect hide disables, unhide activates, purge cascades with readback. |
| trash/agent-delete-policy.ts | Existing `features/trash/__tests__/tool-registrations.purge-ban.test.ts`: real assistant composition exposes only recoverable deletion and checks the compatibility set against exact excluded ids. |
| trash/db-port.ts | Exception, erased type-only alias. |
| trash/index.ts | Lines 1–8 are comments. Existing `features/trash/__tests__/directory-adapter.test.ts`: host rollback error is redacted and logged. |
| trash/registry.ts | Existing `features/trash/__tests__/tool-registrations.test.ts`: both enums include and authorize exactly the registered kinds. `table-adapter` and per-kind flows also drive the real definitions. |
| trash/repo.sqlite.ts | Existing `features/trash/__tests__/transaction-runner.test.ts`: nested rollback and concurrent isolation. |
| trash/tool-kinds.ts | New missing/empty-registry fallback. Existing `features/trash/__tests__/tool-registrations.test.ts`: full host and registry union. |
| trash/tool-registrations.ts | Existing `features/trash/__tests__/tool-registrations.test.ts`: exact args, visibility and permission logic, malformed filter, unknown kind and durable restore. |
| vendor-credentials/index.ts | Existing `features/vendor-credentials/__tests__/index.unit.test.ts`: owning repo export identity. Lines 1–6 are comments. |
| vendor-credentials/vault-adapter.ts | Existing `features/vendor-credentials/__tests__/vault-adapter.unit.test.ts`: seal/open through configured ports, clock, generated IDs, accepted kinds, invalid metadata and DTO round trips. |
| web/policy.ts | Existing `features/web/__tests__/tool-registrations.unit.test.ts`: shared one-per-host budget across assistant surfaces. `web-page.unit`: refusal at request 31. |
| web/web-page.ts | Existing `features/web/__tests__/web-page.unit.test.ts`: guarded reader request identity, redirect/timeout/cancellation and response projection. Line 2 is a comment. |
| webhooks/keyring.env.ts | Existing `features/webhooks/__tests__/keyring.env.test.ts`: key rejection, fallback, fingerprints, error identity, directory mode and exclusive generation. |
| webhooks/site-key-read-bindings.ts | Existing `features/webhooks/__tests__/site-key-sources.unit.test.ts`: exact paths, source order, metadata identity and file/env material. |
| webhooks/tool-registrations.ts | Existing `features/webhooks/__tests__/tool-registrations.handlers.test.ts`: contributor, create/list/update/pause and bounded deliveries. |
| webhooks/wire-headers.ts | Existing `features/webhooks/__tests__/delivery.test.ts`: signed POST asserts Tovu signature, delivery and event header names and values. Lines 3–7 are comments. |
| webmcp/published-html.ts | New exact fragment suffix and idempotence with original-byte preservation. Existing `published-html.pins`: mixed-case closing tag, browser discovery and opt-out. |
| widgets/deps.ts | New region nonenumerable host used for actual bound read, with distinct caller repo. Existing `deps.unit`: region deps shape and lock identity. |
| widgets/media-html-log.ts | New fallback code/structured details for an unfamiliar pipeline event. Existing `media-html-events.unit`: known diagnostic mappings and no-op path. |
| src/index.ts | Exception, self-starting process entrypoint with a real listener and shutdown. |
| platform/db/chat-kernel.ts | Existing `platform/db/migrations/__tests__/chat-package-adoption.test.ts`: real memoized SQLite kernel/reads. `platform/db/client/__tests__/open-site-db-client.unit.test.ts`: PGlite `ai_chat` schema. |

## Exceptions and remaining verification

- EXCEPTION `liquid-allowlist.ts:158–160` — intentionally inert callback used by a private parse-only engine. Lint callers never render with this parser.
- EXCEPTION `theme.ts:30,33–83` and `apps/website/src/features/trash/db-port.ts:1–19` — erased types, no corresponding runtime code.
- EXCEPTION `apps/website/src/index.ts:1–454` — self-starting application process, not an importable test seam. Extracted boot modules already have their own tests.
- EXCEPTION `visitor-publication.ts:24–25,67–68,115–117` (defensive throws only) — the nonempty local work stack/map makes missing entries unreachable. Real annotated nodes come from a source-offset-enabled parse, so a missing start tag would require fabricating a parser AST.
- EXCEPTION `static-render.ts:252–254` (null guard only) — the non-null string HTML override precludes the missing source branch in `renderStaticPage`.
- Comment-only reported ranges in the table do not contribute testable paths. No exceptions were implemented or added to coverage config.
- Unverified: branch/function deficits supplied without branch IDs, all coverage percentages, and all execution results. The cloud run should use all eight shards to identify remaining misses. The checked-in tests’ setup and assertions are the basis for the existing-evidence column, not a new coverage run.
- BUG `visitor-publication.ts:74` — Unicode length can change during lowercasing, so a position found in the normalized view may split the original closing tag. Proposed fix: find the last case-insensitive closing-body match over the original string and use that match’s original index. Regression intentionally retained.
