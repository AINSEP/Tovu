# TH-R: the rest of the theme feature (what lane T left)

Measured on Tovu merge-b dd70b057. Inventory `../inventory/theme.tsv` (61 source files, 15,934 lines; tests 111 files, 18,626). Guards and importer sites: `TH-R1.*`, `TH-R2.*`, `TH-R3.*`.

## Reconciliation with lane T (plan/lanes-k-t-2026-11-16, `T/INVENTORY.tsv`)
Lane T labels all 61 files: already covered by audit2 B04 8 files 2,546; MOVE 10 / 1,717; SPLIT 4 / 3,476; MOVE-AFTER 17 / 4,496; owner 2 / 721; STAY 20 / 2,978. **The tools (2,415 lines) are T-TH-08, the file lifecycle is T-TH-07, the render engine is T-TH-06**: they are NOT planned again here. The task text's "tools/previews/publish/assets ~5-6k" is therefore smaller: what no sheet covers is the STAY group, where the 11-05 survey and lane T disagree:
| Files (lane T: STAY) | Lines | Survey said | This plan |
|---|---|---|---|
| `preview-refresh` 81, `preview-switcher` 127, `preview-switcher-html` 127, `theme-watcher` 97, `theme-roster-sync` 89 | 521 | MOVE PART -> themes/preview | TH-R1 |
| `asset-operations` 237, `theme-file-import` 178, `theme-trash` 243 | 658 | MOVE PART -> themes/files | TH-R2 (`theme-trash` is ALSO in T-TH-07's file list: double claim, see INDEX) |
| `visitor-publication` 156, `active-theme` 223, `verify-active-theme` 69 | 448 | MOVE PART | TH-R3 |
| `publish-content` 831, `active-theme-publish-content` 110 | 941 | MOVE PART -> themes/publish | BLOCKED on the publish framework (audit2 B02/B08; publish-engine design keeps domain contributors out of its 48 files). `buildHandler` 606-822 is one 217-line function: split in Tovu is the only work possible now |
| `index` 221, `public-page-security-headers` 51, `structure-only-theme` 54, `theme-id-aliases` 34, `capability-card` 29, `rendering` 18, `catalog` 3 | 410 | STAY | STAY (barrel, security headers policy, product defaults) |
Sum 2,978 = lane T's STAY total.

## TH-R1 (design + run): previews, watcher, roster
State cells (verified from the survey and file names; read the files before the design is accepted): watcher singleton (`theme-watcher.ts`, `startThemeWatcher` 45-97 is 53 lines: over 50), roster cache (`theme-roster-sync.ts`), refresh delivery (`preview-refresh.ts`, 11 prod importers). Generic: debounce + file-watch -> refresh event; preview switcher HTML and its state machine. Tovu: settings access, mounting preview endpoints, roster source, the switcher's saved setting (`theme_update_preview_switcher` is concurrency-guarded: lost-updates SITES row 63).
Target `@jini-ai/cms/theme/preview` (universal: switcher HTML and state) and `@jini-ai/cms/theme/node` (watcher). Instance ownership becomes explicit: `createThemeWatcher({ watch, onChange, clock })` returns `{ stop() }`; Tovu's composition root owns the one instance.
Characterization first: watcher start twice = one underlying watch; `stop()` leaves no timer and no handle (fake timers + recording fake of the watch port: assert `close` called once); a burst of N events yields one refresh; switcher HTML escapes theme names (sentinel `<script>` name, assert escaped) and is byte-identical for a fixed roster; roster cache invalidates on rename/delete.
Prerequisites: T-TH-05 (theme-files split) landed, because the watcher reads theme paths. `theme/index.ts` has 33 outside importers: serial with every T-TH sheet. Estimate: 80k Opus design + 180k run.

## TH-R2 (after T-TH-05 and T-TH-07): asset operations, file import, trash
`asset-operations.ts` 237 (8 prod importers, 0 tests: write the tests first), `theme-file-import.ts` 178 (CLASSIFY: cms/media sniffer), `theme-trash.ts` 243 (paired theme + original rollback at about :128).
- `theme-trash.ts`: resolve the double claim first: T-TH-07 lists it and marks it STAY ("binds Tovu trash feature; generic part is the fs move helper only"). Decision here: T-TH-07 keeps the fs move helper; TH-R2 moves the paired-rollback WORKFLOW behind a `TrashPort` (`@jini-ai/cms/trash` already has the domain; never a permanent delete). Run TH-R2 after T-TH-07 and K-07/K-08 (trash tools and SQL).
- Characterization first: trash then restore returns byte-identical theme AND original; a failure between the two moves rolls the first back (inject a throwing fake for the second move; assert the first is restored and the failure is reported, never swallowed); import refuses a file whose sniffed type disagrees with its extension, at size limit-1 / limit / limit+1; path containment deny tests.
Estimate: 220k tokens.

## TH-R3 (small, READY after T-TH-06): visitor publication and active-theme resolution
`visitor-publication.ts` 156 (CLASSIFY: MOVE-AFTER agentic; lane T says CLASSIFY owns it): move to `@jini-ai/agentic` only with routing/storage ports; no sheet existed. `active-theme.ts` 223 (15 prod importers): generic resolution (fallback chain, alias map applied) vs Tovu default theme ids (`theme-id-aliases.ts` stays). `verify-active-theme.ts` 69 is in audit2 B15's file list (label only).
Characterization: resolution table (configured, missing on disk, alias, preview override, structure-only fallback) with the exact theme id returned; the public-page security headers are unchanged for a page rendered through a preview override (header snapshot).
Estimate: 150k tokens.

## Could not verify
- None of the 11 TH-R files was read line by line in this run (lane T's inventory, the survey and the declaration map were used). The TH-R1 design must start by reading them.
- That T-TH-05/06/07 will leave these files' blobs unchanged (they will not: regenerate `TH-R*.files.tsv` after each lands).
