# DEDUPE-A10: eight byte-size formatters -> one `@jini-ai/core/text` `formatByteSize` (templates T-DEDUPE + T-MOVE)

> **STATUS (sheet-fixes-2, 2026-11-18): V1-V3 VOID (done); V4-V8 BLOCKED (owner decision). Do not dispatch this sheet.**
> The 2026-11-18 run (`origin/wave3/audit2-a:cloud-results/audit2-a.md`) stopped correctly: the guard `jini_must_not_exist: packages/core/src/text/format-byte-size.ts` fails because Jini 6f8dc8c2 landed `formatByteSize({ bytes }, { locale = 'en-US', megabyteLabel = 'MB' })` in `@jini-ai/core/text` with a deliberately FIXED display rule (its header: whole B/KB, one decimal from MB up, 1024-based). Re-derived on refactor/terra (Tovu ada11733f / Jini 4c1892368):
> - V1 (Jini admin/media) and V3 (Tovu `install-archive-size.ts`, via `megabyteLabel: 'MiB'`) are gone: DONE by the earlier run.
> - V2 is DONE too: `apps/admin/src/features/sites/site-transfer-rules.ts:12` (blob 8581e052) is `formatTransferBytes = invalid ? "—" : formatByteSize({ bytes })` over the core function; the dash is host policy for a missing value, not a second formatter.
> - V4 (website backup: `KiB`/`MiB`/`GiB`, one decimal KB, `.0` dropped), V5a-c (Jini ui: one decimal KB, no GB), V6 (dropzone: empty string for 0, no GB), V7 (connector: `No data`, auto KB digits), V8 (forms: `.0` dropped) all print DIFFERENT visible labels from the core rule. Consolidating them is either a visible behaviour change in 6 places (needs a failing test first per site and the owner's yes on one display rule) or widening the just-landed core contract with 4+ options (`labels`, `kilobyteDigits`, `trimZeroDecimal`, `largestUnit`) whose interplay with `megabyteLabel` must be designed. Neither is a sheet-drift fix.
> **Owner question A10-Q1 (recommendation):** converge V5a-c, V6 and V8 (Jini ui/admin, all `KB`-family labels in the same admin UI) to the core rule, each with a characterization test showing the old label RED and the new GREEN; keep V4 (backup manifest text in `KiB`) and V7 (connector "No data" semantics) as domain-specific formatters. On a yes, a new short sheet per package (ui, admin) replaces this one. The text below is the original revision, kept for history only.


Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`), every cited line read that day. Row `audit2:A10` (the row names 4 formatters; the census finds **8 in Jini + Tovu admin/website** and 3 more that stay). Startable now (no kit, no lane); nothing on the row is hard-blocked.

Tier: S1 Sonnet (new core file + tests), S2 Sonnet (collapse the Jini copies), S3 Sonnet (Tovu repoint). No Opus review needed: pure functions, parity table is the review. est. executor tokens ≈ 32k (S1 10k, S2 12k, S3 10k).

## Why this is not a drop-in dedupe (read first)
The row says "two of them already in Jini". Reading the bodies: **none of the eight is byte-identical to another**. They differ in unit labels (`KB` vs `KiB`/`MiB`), KB decimals (0, 1, or 1-below-10KB), whether `.0` is dropped, whether a GB tier exists, locale digits, and what a bad/zero value shows. A consolidated function therefore takes **options**, and every caller passes the options that reproduce its current output. The sheet pins this with a parity table (below) so the consolidation changes **no visible string**. Two honest exceptions (listed, both harmless, tested):
- fractional byte inputs: callers that printed `${bytes} B` now print `Math.round(bytes) B` (sizes are integers everywhere; `0.5` never occurs).
- `installArchiveSize` keeps its mixed `KB` / `MiB` labels (a Tovu quirk) through `labels`; unifying to `KB`/`MB` is a copy decision for the owner, **not made here**.

## The eight (blobs at integ/wave-b) and the options that reproduce each
| # | where | today | options passed after |
|---|---|---|---|
| V1 | Jini `admin/src/media/rules.ts:125` `formatByteSize({bytes},{locale='en-US'})` | B / KB (0 dec) / MB,GB (Intl, 1 dec, `.0` kept) | `{ locale }` (default `'en-US'` kept by the one caller) |
| V2 | Tovu `admin/features/sites/site-transfer-rules.ts:12` `formatTransferBytes` | `—` for null/NaN/∞/<0; KB 0 dec; MB,GB 1 dec | `{ invalid: '—' }` (null/undefined handled at the call: see S3) |
| V3 | Tovu `admin/components/InstallTabCard/install-archive-size.ts` `installArchiveSize` | B / KB(0) / `MiB`(1), no GB | `{ labels: ['B','KB','MiB','GiB'], largestUnit: 'MB' }` |
| V4 | Tovu `website/features/site-backup/sources.ts:587` `formatByteSize` (+ private `oneDecimal`:581) | B / KiB / MiB / GiB, 1 dec, **`.0` dropped** | `{ labels: ['B','KiB','MiB','GiB'], kilobyteDigits: 1, trimZeroDecimal: true }` |
| V5a | Jini `ui/src/features/skills/rules.ts:308` `formatSkillFileSize` | B / KB(1) / MB(1), no GB | `{ kilobyteDigits: 1, largestUnit: 'MB' }` |
| V5b | Jini `ui/src/features/asset-tree-browser/rules.ts:318` `humanBytes` | same as V5a | same |
| V5c | Jini `ui/src/features/viewer-shell/rules.ts:15` `humanFileSize` | same as V5a | same |
| V6 | Jini `ui/src/features/file-dropzone/rules.ts:38` `fileDropzoneSizeLabel` | `''` for 0/neg/NaN; KB(0); MB(1) | `{ largestUnit: 'MB', invalid: '', zero: '' }` |
| V7 | Jini `ui/src/features/memory/formatters.ts:187` `formatConnectorContextBytes` | `No data` for 0/neg/NaN; KB 1 dec below 10 KB else 0; MB(1) | `{ largestUnit: 'MB', kilobyteDigits: 'auto', invalid: 'No data', zero: 'No data' }` |
| V8 | Jini `admin/src/forms/html-rules.ts:89` private `formatByteSize` | B / KB(0) / MB (round to 1 dec, `.0` dropped) | `{ largestUnit: 'MB', trimZeroDecimal: true }` |

**Stay as they are (different semantics, not byte formatters in this family; record, do not touch):** `apps/website/src/features/fs-files/tool-registrations.ts:113` `kb` (KB only, 1 dec; belongs to row A16/CLASSIFY-41), `apps/desktop/src/stage-payload-run.ts:76` `megabytes` (a bare number, no unit), `apps/desktop/src/renderer/ResourcesPanel.tsx:26` (SI decimal `~1.2 GB`, 1e9 base, deliberately not 1024). Two tool-result strings in `website/.../media/byte-size.ts` are a size *resolver*, not a formatter.

## Guards (blobs at integ/wave-b)
```
tovu_files (edit):
  - apps/admin/src/components/InstallTabCard/install-archive-size.ts | blob 2d7b25e1ce080e10003509a073c6c0a001e918b3   (DELETE)
  - apps/admin/src/features/sites/site-transfer-rules.ts | blob 2cb13b1c690fe18b9346b79a5c618d4d23cdb3a5   (remove formatTransferBytes)
  - apps/admin/src/features/sites/SiteExportTab.tsx | blob 216bd5bb6e9a9384919a9ddb6dc2bcb4a1bb2b1a
  - apps/admin/src/features/sites/SiteImportTab.tsx | blob f1179702d99e576834bfd9fb8d53e23085e655b7
  - apps/admin/src/features/sites/__tests__/site-transfer-tabs.unit.test.tsx | blob 7c9012b33ea87f355a1f2132cf0af6138f544318
  - apps/admin/src/features/plugins/hooks/use-agent-plugin-install.hooks.ts | blob 034bd7ab2bc7733ed551ce03985d9cf5a19905b8
  - apps/admin/src/features/plugins/hooks/use-plugin-install.hooks.ts | blob 19919de16377369fa43d8e4ab427bc28011d67b8
  - apps/website/src/features/site-backup/sources.ts | blob 0f15dd128d24e972b296659ed39fcb47376398eb   (remove formatByteSize + oneDecimal)
  - apps/website/src/features/site-backup/backup-service.ts   (import list + 3 call sites; guard by text, hot file)
  - apps/website/src/server/inbound/admin-http/routes/system/site-imports.ts   (import + 1 call site; guard by text)
  - apps/website/src/features/site-backup/__tests__/sources.unit.test.ts   (the `formatByteSize` import :18 and table :623; guard by text)
jini_edited:
  - packages/core/src/text/index.ts | blob e9c8d69cdcf99ef0c7dea211a4c03eb735112f52
  - packages/core/package.json | blob 3829d4e032640f9914ad4110a5ec11a5d43d9f71   (NOT edited: "./text" already exported; guard that it stays so)
  - packages/admin/src/media/rules.ts | blob 947678bdf93893f536fa574a95edf1059156847d
  - packages/admin/src/forms/html-rules.ts | blob 75b07855b6e1fb8bd0008bda1908ad83442d9e9c
  - packages/ui/src/features/skills/rules.ts | blob 4896827cd964e7ec7f3e9bfeb4cb8cf75a2be88d
  - packages/ui/src/features/memory/formatters.ts | blob b7260e9d293ab3da275c6c541eb48611381b9437
  - packages/ui/src/features/asset-tree-browser/rules.ts | blob e2df1fefbace4390933c9fffb46bdbbb6d7fa979
  - packages/ui/src/features/file-dropzone/rules.ts | blob 059b78783227b18011756ae6c3c017d1f4568100
  - packages/ui/src/features/viewer-shell/rules.ts | blob e419db15ca74d298dbf5aecf51d8d562ee6db45c
jini_must_not_exist: packages/core/src/text/format-byte-size.ts
```
Both Jini `ui` and `admin` already depend on `@jini-ai/core` (`ui/package.json:290`, `admin/package.json:494`) and already import `@jini-ai/core/text` (`ui/src/utils/file-transfer.ts:28`, `admin/.../WidgetInstanceEditor.tsx:21`): no dependency change, COMMON rule 9 not triggered.

## Contract (new, `packages/core/src/text/format-byte-size.ts`)
```ts
export interface ByteSizeOptions {
  /** Four unit labels, bytes first. Default ['B','KB','MB','GB']. */
  readonly labels?: readonly [string, string, string, string];
  /** Digits for the KB tier: 0, 1, or 'auto' (1 below 10 KiB, else 0). Default 0. MB/GB tiers always use 1. */
  readonly kilobyteDigits?: 0 | 1 | 'auto';
  /** Drop a trailing `.0` on every decimal tier (`100 MiB`, not `100.0 MiB`). Default false. */
  readonly trimZeroDecimal?: boolean;
  /** 'MB' stops the ladder at MB (a 1 GiB value prints `1024.0 MB`); 'GB' (default) adds the GB tier. */
  readonly largestUnit?: 'MB' | 'GB';
  /** When set, decimals come from Intl.NumberFormat(locale); else `toFixed` (en digits). */
  readonly locale?: string;
  /** Returned for a non-finite or negative value (default: the value is formatted as is, `NaN` -> '0 B'... see tests). */
  readonly invalid?: string;
  /** Returned for exactly 0 (default: `0 B`). */
  readonly zero?: string;
}
export function formatByteSize(required: { bytes: number }, optional: ByteSizeOptions = {}): string;
```
Behaviour rules (pin each in tests): (1) `!Number.isFinite(bytes) || bytes < 0` -> `invalid` if given, else `0 B` with the first label (no `NaN B`); (2) `bytes === 0` -> `zero` if given; (3) `< 1024` -> `Math.round(bytes) + ' ' + labels[0]`; (4) tier index 1/2/3 by `1024 ** n` with the ladder capped by `largestUnit`; the carry-over case `1048575` prints `1024 KB` (Tovu parity: no rounding-up promotion, pinned); (5) digits 0 uses `Math.round`; (6) `trimZeroDecimal` removes `/\.0$/` (and Intl: `minimumFractionDigits: 0`); (7) with `locale` the KB tier digits and MB/GB digits go through `Intl.NumberFormat(locale, { minimumFractionDigits: trim ? 0 : d, maximumFractionDigits: d })`. Complexity: one 6-line `tierOf({ bytes, max })`, one `digitsFor({ tier, bytes, kilobyteDigits })`, one `renderNumber({ value, digits, locale, trim })`; `formatByteSize` ≤ 25 lines, complexity ≤ 8.

```
id: DD-A10-1 .. DD-A10-3
feature: byte-size formatter consolidation
jini_survivor: @jini-ai/core/text formatByteSize (NEW, created by S1) | no blob yet
behaviour_diff: see "parity table"; every row `same` except the two exceptions above
real_caller_check: SiteImportTab.tsx:96 `formatTransferBytes({ bytes: controller.file.size })` (never null: a File); SiteExportTab.tsx:99 `share.bytes` is `number | null` (a failed export has no size): it relies on `—`. After S3 that caller passes `share.bytes ?? Number.NaN` -> `invalid: '—'` (explicit, tested), not a widened core signature.
jini_msg: "feat(core/text): one parameterised formatByteSize" (S1), "refactor(ui,admin): use core/text formatByteSize for byte labels" (S2) | tovu_msg: "refactor(admin,website): format byte sizes through @jini-ai/core/text"
changeset: @jini-ai/core: minor | "text: formatByteSize"; @jini-ai/ui + @jini-ai/admin: patch | "byte labels go through core/text (output unchanged)"
```

## Parity table (the S1 test file, `packages/core/src/text/__tests__/format-byte-size.test.ts`, written FIRST and GREEN-by-construction; each row is one `it.each` case)
Each row: variant options -> input -> expected (computed by hand from the current bodies, 2026-11-16).
| options | 512 | 1024 | 1536 | 10240 | 204800 | 1048575 | 1048576 | 9961472 | 3 MiB | 1 GiB |
|---|---|---|---|---|---|---|---|---|---|---|
| V1 `{locale:'en-US'}` | `512 B` | `1 KB` | `2 KB` | `10 KB` | `200 KB` | `1024 KB` | `1.0 MB` | `9.5 MB` | `3.0 MB` | `1.0 GB` |
| V2 `{invalid:'—'}` | `512 B` | `1 KB` | `2 KB` | `10 KB` | `200 KB` | `1024 KB` | `1.0 MB` | `9.5 MB` | `3.0 MB` | `1.0 GB` |
| V3 (install) | `512 B` | `1 KB` | `2 KB` | `10 KB` | `200 KB` | `1024 KB` | `1.0 MiB` | `9.5 MiB` | `3.0 MiB` | `1024.0 MiB` |
| V4 (backup) | `512 B` | `1 KiB` | `1.5 KiB` | `10 KiB` | `200 KiB` | `1024 KiB` | `1 MiB` | `9.5 MiB` | `3 MiB` | `1 GiB` |
| V5 (skills/tree/viewer) | `512 B` | `1.0 KB` | `1.5 KB` | `10.0 KB` | `200.0 KB` | `1024.0 KB` | `1.0 MB` | `9.5 MB` | `3.0 MB` | `1024.0 MB` |
| V6 (dropzone) | `512 B` | `1 KB` | `2 KB` | `10 KB` | `200 KB` | `1024 KB` | `1.0 MB` | `9.5 MB` | `3.0 MB` | `1024.0 MB` |
| V7 (connector) | `512 B` | `1.0 KB` | `1.5 KB` | `10 KB` | `200 KB` | `1024 KB` | `1.0 MB` | `9.5 MB` | `3.0 MB` | `1024.0 MB` |
| V8 (forms) | `512 B` | `1 KB` | `2 KB` | `10 KB` | `200 KB` | `1024 KB` | `1 MB` | `9.5 MB` | `3 MB` | `1024 MB` |
Edge rows (each its own `it`): V1 `{ locale:'de-DE' }` 9961472 -> `9,5 MB` (existing Jini test `legacy-rules.test.ts:38`, moved); V2 `Number.NaN`, `-1` -> `—`, `0` -> `0 B`; V6 `0`, `-5`, `NaN` -> `''`; V7 `0`, `-5`, `NaN` -> `No data`; default (no options) `NaN` -> `0 B`; fractional `1.4` -> `1 B` (the documented exception).
Verify a few cells while writing: V8 `10240` is `10 KB` (round), `3 MiB` V8 is `3 MB` (`Math.round(30)/10 = 3`), V7 `10240` is `10 KB` (`10240 < 10*1024` is false -> 0 digits), V7 `1536` is `1.5 KB`.

## DD-A10-1 — Jini core (commit 1)
0. Branch rule; blobs; `ls packages/core/src/text/format-byte-size.ts` fails (does not exist); `rg -n "formatByteSize" packages/core/src` prints nothing.
1. Tests first: write the parity-table file above (core uses vitest: copy the import/style of `packages/core/src/text/__tests__/is-abort-error.unit.test.ts`).
2. Code: `format-byte-size.ts` per Contract; add to `text/index.ts` (guard by text: append one `export { formatByteSize } from './format-byte-size.js'; export type { ByteSizeOptions } from './format-byte-size.js';` line after the `extensionForMimeType` line). Header `@file` + the Tovu "small ZIPs must show their actual scale" why-comment moved as the `kilobyteDigits` rationale, neutral wording ("a KB tier shown with 0 digits hides the scale of small files"). No README entry needed (existing subpath).
3. Checks: COMMON 2-9; `rg -n -i "tovu|site-chat|apps/" packages/core/src/text/format-byte-size.ts` prints nothing; no `console.*`; eslint; changeset; commit.

## DD-A10-2 — Jini consumers (commit 2)
Edits (each keeps the file's other contents; the replaced function is removed, its callers call core with the options of the table):
1. `admin/src/media/rules.ts:125-132`: delete `formatByteSize`; `MediaCard.hooks.ts:4,34` imports `formatByteSize` from `@jini-ai/core/text` and calls `formatByteSize({ bytes }, { locale })` (the hook's own `locale` default `'en-US'` stays where it is defined); `admin/src/media/index.ts:30` drops the export; `admin/src/media/__tests__/{legacy-rules,metadata-exports}.test.ts` lose the moved cases (they live in the core table) — `legacy-rules.test.ts:35-41` and `metadata-exports.test.ts:6` are deleted with a count: **before/after test count** is reported (honest-testing: no case disappears, each is re-found in the parity table).
2. `admin/src/forms/html-rules.ts:89-93`: delete the private function; `:68` calls core with `{ largestUnit: 'MB', trimZeroDecimal: true }`.
3. `ui/src/features/skills/rules.ts:308` `formatSkillFileSize`, `asset-tree-browser/rules.ts:318` `humanBytes`, `viewer-shell/rules.ts:15` `humanFileSize`, `file-dropzone/rules.ts:38` `fileDropzoneSizeLabel`, `memory/formatters.ts:187` `formatConnectorContextBytes`: **delete all five**, repoint their call sites with the table's options: `skills/react/components/SkillRow.tsx:3,380`; `asset-tree-browser/react/components/FilePreviewPane.tsx:4,100` and `AssetTreeFileRow.tsx:2,137`; `file-dropzone/react/components/FileDropzoneLightbox.tsx:7,89,111` (these two keep the `|| '…'` fallbacks because `zero`/`invalid` return `''`); `memory/react/components/MemoryConnectedPanel.tsx:15,348`; viewer-shell: `rg -n humanFileSize packages/ui/src` lists only the definition, the barrel and `__tests__/index.test.ts:20` (dead export: delete the export and the test line; census proves no caller).
4. Barrel/spec edits (guard by text): `ui/src/core.ts:293`, `skills/index.ts:6`, `memory/index.ts:25`, `asset-tree-browser/index.ts:40`, `file-dropzone/index.ts:23`, `viewer-shell/index.ts` (the `humanFileSize` export), `ui/docs/spec/api.spec.md:699,727,734,770,771` (five rows removed). Test updates: `skills/__tests__/rules.test.ts:9,469-488` (cases move to the core table), `memory/__tests__/formatters.test.ts:16,202-211`, `asset-tree-browser/__tests__/{rules,index}.test.ts:15,31,322-326`, `file-dropzone/{rules,index}.test.ts` (`:9,26,84-100`), `viewer-shell/__tests__/index.test.ts:20`. Component tests that assert the rendered strings (`rg -n "KB|MB" packages/ui/src/features/{skills,asset-tree-browser,file-dropzone,memory}/react -g '*test*'`) stay as the proof of unchanged output.
5. Census (all must print nothing): `rg -n "formatSkillFileSize|humanBytes|humanFileSize|fileDropzoneSizeLabel|formatConnectorContextBytes" packages -g '!node_modules' -g '!dist'`; `rg -n "toFixed\(1\)" packages/ui/src/features/{skills,asset-tree-browser,viewer-shell,file-dropzone,memory}` prints no byte formatter.
6. Rule 14 check: Tovu imports none of the deleted names (`rg -n "humanBytes|humanFileSize|formatConnectorContextBytes|fileDropzoneSizeLabel|formatSkillFileSize" apps` prints nothing at integ/wave-b; re-run before deleting). The one exception is `formatByteSize` from `@jini-ai/admin/media`, imported by Tovu `apps/admin/src/features/media/__tests__/use-media-card-metadata.hooks.unit.test.tsx:3` and injected by `use-media-card-metadata.hooks.ts:6-25` as a `formatters` port: **S3 repoints that test import** to `@jini-ai/core/text` in the same Tovu commit; S2 must therefore land **after** S3's Tovu change is prepared — resolve by ordering: S3 lands first on the Tovu side only if Jini S1 is published; otherwise keep the admin `formatByteSize` export in S2 and delete it in the follow-up (flag in the report). Default decision: **S2 keeps the `admin/media` export until S3's repoint lands, then a 5-line follow-up commit deletes it** (so no Jini commit ever breaks the Tovu pin).
7. Checks as DD-A10-1; one commit `refactor(ui,admin): byte labels through core/text`.

## DD-A10-3 — Tovu (commit 3; after Jini S1 is available to the file: dependency)
1. `use-plugin-install.hooks.ts:8,107` and `use-agent-plugin-install.hooks.ts:7,176`: import `formatByteSize` from `@jini-ai/core/text`; call `formatByteSize({ bytes: zipFile.size }, INSTALL_ARCHIVE_SIZE)` where `INSTALL_ARCHIVE_SIZE` is a `const` object `{ labels: ['B','KB','MiB','GiB'], largestUnit: 'MB' }` exported ONCE from `apps/admin/src/features/plugins/hooks/install-archive-size.ts` (a 4-line constants file, not a function wrapper: no forwarder); the why-comment ("Small ZIPs must show their actual scale; rounding every upload to MiB hides useful size data") moves to that constant. `git rm` `components/InstallTabCard/install-archive-size.ts`.
2. `site-transfer-rules.ts`: delete `formatTransferBytes` (lines 10-18, its doc comment goes); `SiteExportTab.tsx:10,99` -> `formatByteSize({ bytes: share.bytes ?? Number.NaN }, { invalid: '—' })`; `SiteImportTab.tsx:13,96` -> `formatByteSize({ bytes: controller.file.size }, { invalid: '—' })`; `site-transfer-tabs.unit.test.tsx:27` import list loses `formatTransferBytes` (3 uses: re-pointed to the core call with the same expected strings; keep every assertion, COMMON rule 20).
3. Backup: `sources.ts:581-591` remove `oneDecimal` and `formatByteSize`; add `export const BACKUP_BYTE_SIZE = { labels: ['B','KiB','MiB','GiB'], kilobyteDigits: 1, trimZeroDecimal: true } as const;` (kept: the 7 call sites in `sources.ts:607,627,630,638`, `backup-service.ts:44,519,526,751`, `site-imports.ts:7,55` all pass it); import `formatByteSize` from `@jini-ai/core/text`. `sources.unit.test.ts:18,623` imports the core function and passes `BACKUP_BYTE_SIZE` (the table at :623 keeps every row).
4. `use-media-card-metadata.hooks.unit.test.tsx:3`: `import { formatByteSize } from "@jini-ai/core/text"`.
5. Census: `rg -n "installArchiveSize|formatTransferBytes|install-archive-size" apps` prints nothing; `rg -n "formatByteSize" apps/website/src` hits only imports from `@jini-ai/core/text`; `rg -n "from \"#src/features/site-backup/sources\"" apps/website/src | rg formatByteSize` prints nothing.
6. eslint; commit; report the exact SHA list. No Chrome look needed (strings unchanged); owed: one cloud run of the admin sites + plugin-install tests and the website site-backup tests.

## untangle overlap (execute after wave B merge)
- `backup-service.ts`, `sources.ts`, `site-imports.ts` are website hot files for lanes R-BARRELS/C4 (import-path edits): guard by exact text, never blob; re-read the import block at apply time.
- `site-transfer-rules.ts` and the plugins hooks are touched by A28/A31 (disjoint lines): text guards.
- A02 (media swap) deletes Tovu's `features/media/hooks/*`; `use-media-card-metadata.hooks.ts:6-25` may disappear first: then S3 step 4 is a no-op and the S2 follow-up deletes the `admin/media` export directly.
- A16 owns `fs-files/tool-registrations.ts:113` `kb`; do not touch it here.

## STOP specific to this sheet
- Any parity-table cell fails when you hand-evaluate the new function (the table is the spec: stop, report the cell).
- A caller's current output has a form not in the table (re-run the census; a ninth formatter means the sheet is stale).
- Jini `ui`/`admin` would need a new dependency or a non-`/text` core import.
- A deleted Jini export is imported by Tovu or `examples/` (`rg -n "<name>" /home/user/Jini/examples apps`).
