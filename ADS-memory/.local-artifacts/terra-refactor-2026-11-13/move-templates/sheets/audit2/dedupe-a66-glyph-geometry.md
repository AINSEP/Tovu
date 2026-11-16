# DEDUPE-A66: glyph geometry (honest scope: Tovu-internal path dedupe; no Jini catalog change) (template T-DEDUPE)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b`. Row `audit2:A66`. No blockers. **Row premise does not hold: the sheet shrinks the job and says why.**

Tier: one Sonnet slice (Tovu only). est. executor tokens ≈ 14k (the audit estimated 40k for the 11-file sweep). Chrome look owed only for S1's desktop files (byte-identical geometry: expect no pixel change).

## Finding (measured, not assumed)
The row says "reuse matching ui Icon names, add missing path data to `ICON_PATH_DATA`, delete local SVG copies". A script compared every `d="..."` string in the 11 files (about 73 path strings) with every path string in `packages/ui/src/react/components/Icon.tsx` (`ICON_RENDERERS`, ~110 names, all drawn on a 24 grid) plus `ICON_PATH_DATA`:
```
python3 (regex d="…" over the 11 files vs Icon.tsx) -> 0 byte-identical matches
```
The two catalog entries Tovu could use (`document-outline-compact`, `folder-outline-compact`, `chevron-right-wide`) are ALREADY adopted (`skills-visuals.tsx:4,10`; `sites-visuals.tsx:2,22,32`). Everything left is either a different drawing of the same idea or Tovu-only artwork. Adopting a near-miss changes pixels, which is a design decision (owner rule "UI change = look at it"), not a mechanical dedupe. So:

| Tovu glyph | Closest Jini name | Verdict |
|---|---|---|
| `Media.hooks.tsx:72` `TrashMediaIcon` (`M4.5 7h15M9.5 7V4.75h5V7M6.5 7l.9 12.25h9.2L17.5 7M10.25 10.5v5.5M13.75 10.5v5.5`) | `trash-compact` (`M4.5 7h15M9.5 7V4.6h5V7`, `M6.6 7l.9 12.4h9l.9-12.4`, `M10.4 10.5v6M13.6 10.5v6`) | near-miss (0.05-0.15 units). Owner-look option, NOT executed here |
| `import-export-tabs.tsx:25` `OtherIcon` (three stroked circles r=1) | `more-horizontal` (three FILLED dots r=1.75, `fill=currentColor stroke=none`) | different look; keep local |
| `Library.hooks.tsx:16` `UploadIcon` (`M12 15V4M7.5 8.5L12 4l4.5 4.5` + tray) | `upload` | different path bytes and tray; keep local |
| `themes-visuals.tsx` `CompassIcon` | none (no compass in `IconName`; the file header says so) | stays (the audit's "compass label was DEDUPE without equivalent" is correct) |
| `database-visuals.tsx`, `sites-visuals.tsx` (tray, star, alert triangle `M12 4.5 3.5 19h17z`) | `alert-triangle` is Lucide-shaped, different | keep local |
| desktop `icons.tsx`/`tool-icons.tsx` (20-unit grid, `viewBox 0 0 20 20`, `IconFrame` class `icon`) | Jini `Icon` is a fixed 24 grid | different coordinate system; cannot share path data |
| `IconFrame` (`icon-frame.tsx`) | — | stays: its `className="icon"` is the desktop stylesheet's contract; not generic |
| `navAvailability` (`nav-availability.ts`) | — | stays: emits `data-tip`/`title` for the desktop's own tooltip attribute; Jini has no equivalent contract (a "tooltip port" would be a new design: out of scope) |

## What is real: six identical path strings repeated inside Tovu
Programmatic duplicate scan (same census over the 11 files):
```
2x  sites-visuals.tsx    "M4.5 14.5v4h15v-4"                 (ExportSiteIcon + ImportSiteIcon tray)
3x  icons.tsx            "M16.5 10a6.5 6.5 0 1 1-2-4.7"      (refresh arc: reload nav, update menu, restart...)
3x  icons.tsx            "M17 2.5V6h-3.5"                    (refresh arrowhead, same 3 icons)
2x  icons.tsx+tool-icons.tsx "M3.5 13v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3"   (tray)
2x  icons.tsx+tool-icons.tsx "M9.5 9.5 17 17M13.5 14l-1.5 1.5M15.5 16l-1.5 1.5"  (hammer handle)
2x  icons.tsx+tool-icons.tsx "M3 6h14M3 14h14"                (two bars)
```
Verify each count with `rg -c '<string>' <file>` before editing; a different count = STOP.

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/admin/src/features/sites/sites-visuals.tsx | blob 666ce8c8ff9a0dd0d4e2342e6cb45fa833660f97 | edit
  - apps/desktop/src/renderer/icons.tsx | blob 68c9b5ee68cdcfd7f8fe33e9013be83f35abb5da | edit
  - apps/desktop/src/renderer/tool-icons.tsx | blob f49a293293e7fe6c73fa1b7d120b636166efc0b7 | edit
  - apps/desktop/src/renderer/icon-frame.tsx | blob e62bdf8b57ce78383450916ccba1fdf46cb7667c | keep (read-only reference)
  - not touched (read for the table above): admin database-visuals 322d38d3.., import-export-tabs 4549e675.., Library.hooks 3440fe03.., Media.hooks 2fede276.., skills-visuals 672a5349.., themes-visuals 64145b5d.., desktop nav-availability 33ca8020..
jini_guards:
  - packages/ui/src/react/components/Icon.tsx | blob eb0dcc92ea9ec8c826de688e4e027ffc1d07d5bc (NOT edited)
  - packages/ui/src/icon-name.ts | blob 3fa57132ceefbd614339a726fff4f69df3a1cd24 (NOT edited)
```
Importer census (all three edited files export unchanged names): `rg -n "sites-visuals|renderer/icons|tool-icons" apps --glob '!**/node_modules/**'`. Exports are unchanged, so no importer edits.

## DEDUPE-A66-1 — Tovu only (one commit, Sonnet)
No Jini commit (COMMON 'Jini first' not applicable; no changeset). The shared constants stay file-local: a new shared module for six strings across two files in one folder is overkill, and a cross-folder `glyph-paths.ts` is a forwarder shell in all but name.
1. `sites-visuals.tsx` (edit): add `const TRAY_PATH = "M4.5 14.5v4h15v-4";` above `ExportSiteIcon`; replace both `<path d="M4.5 14.5v4h15v-4" />` with `<path d={TRAY_PATH} />` (2 replacements; the new text contains the old string only inside the constant: do each replacement once, then re-count).
2. `icons.tsx` (edit): module constants after the `import` block: `const REFRESH_ARC = "M16.5 10a6.5 6.5 0 1 1-2-4.7"; const REFRESH_HEAD = "M17 2.5V6h-3.5";` replace the three occurrences of each (6 edits). The tray, hammer-handle and two-bar strings are shared with `tool-icons.tsx`: because `tool-icons.tsx` "must not import `icons.tsx`" (its header: module-level tables run before tests publish the `React` global), put those three strings in `renderer/icon-paths.ts` (a plain `.ts` with ONLY the three `export const` strings, no JSX, no React import) and import it from both. Replace 2 occurrences each.
3. `tool-icons.tsx` (edit): import the three strings from `./icon-paths.js` (check the repo's import specifier style in `tool-icons.tsx:1-9`: `.js` suffix), replace 3 occurrences.
4. Tests: existing render tests for `icons.tsx`/`tool-icons.tsx` (`rg -l "SectionIcon|ToolIcon|NavIcon|MenuIcon" apps/desktop/src --glob '*.test.*'`) must pass unchanged; ADD one test in `renderer/icon-paths.test.ts`: the rendered `<path d>` set of `ToolIcon kind="import"` and `MenuIcon kind="update"` contains the exported constants (pins that the dedupe did not change geometry). Record before/after test counts.
5. Census: re-run the duplicate scan: no string except the six constants' definitions occurs more than once per file; eslint on the 4 touched files; commit `refactor(desktop,admin): name repeated glyph paths once`.

## Not done, and why (for the coordinator)
- Jini `Icon`/`ICON_PATH_DATA` get no additions: nothing in the 11 files is both generic and repeated across features.
- Near-miss adoption (`TrashMediaIcon` -> `trash-compact`) is a visual decision: if the owner approves after a Chrome look at the Media tab row, it is a 1-line change (`<Icon name="trash-compact" size={size} />`, drop `LINE_ICON` use there), but note `Icon` defaults `strokeWidth` 1.6 vs `LINE_ICON` 1.5: pass `strokeWidth={1.5}`.
- Row 107-style "DEDUPE must not delete the Tovu glyph before an equivalent exists" is respected: nothing is deleted.

## untangle overlap
`packages/ui` untangle (R5, wave E) edits `Icon.tsx`; this sheet does not touch it, so no ordering constraint. The audit's "run before R5" advice is moot.

## STOP specific to this sheet
- A duplicate count differs from the table.
- A render test needs an edited assertion.
- Anything outside the three Tovu files appears necessary.
