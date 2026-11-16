# Handoff: sheets-fix2 (2026-11-15, stopped at the 250k context line)

Planning files only. No clone edits, no commits, no tests, no processes left running.

## Done
1. **C4:** H3 banner. H2: `reportInternalError` required, `createSseStream({ scheduler }, optional)`, `defaultScheduler` and the `randomUUID` default deleted, §5 STOP rewritten, §0.8 text fixed. H4: guards for `http-kit/src/{adapter,origin,sse}.ts` added. New §11.
2. **C5 no-shells revision** (end of `sheets/C5.md` + banner), with:
   - guards filled at Jini `af2389793`;
   - `validateEmailSourceTemplate` confirmed pure;
   - deletes instead of re-exports, including the old shells (`address.ts:5-6,39` and the `vault.types.ts` line-2 re-export of 20 core types);
   - no aliases (`HttpTransportAdapter` renamed away; no `BlobStorage<Buffer>` alias; no `HttpClientPort` re-export).
   - New `sheets/C5.repoint.tsv`: 383 rows in 260 files, 0 stale. Config: `scripts/census/c5.json` + `c5.post.json`.
3. **C8:** banner. §9.3 text: the sdk line is deleted. §9.2: the deleted Tovu observability file. New §10 (ruling b, W0 drift).
4. **C6 §12:**
   - The scripted copy order (`scripts/c6/copy-order.cjs`).
   - Ruling (c) `piGracefulShutdownMs` → `defs/pi/options.ts`.
   - A **NEW BLOCKER:** `ModelDiscoveryDeps` → `ProviderModelsInput`. A fix is recommended there.
   - A desktop correction.
5. **Staleness:**
   - **C10:** 2 rows split into MOVE + MANUAL (`DynamicValueSchema` → `parseDynamicValue` is a call-shape change).
   - **C3/C3t:** rows rewritten into the applier grammar (`scripts/fix-stale-2026-11-15.py`):
     - export rows get `export-from`, inline rows get `import('…')`;
     - DROP-NAMES rows and the 2 export/MOVE shells become `DROP`;
     - DELETE-FILE rows become `MANUAL`;
     - T-SK gets `StorageKernel->KyselyKernel`;
     - the SK-HOST/DEBT/TEST/DB rows split into a core MOVE row and an in-place rename row (phase `c3-rewrite`);
     - SK-CORE, MS-* and T-MS go to phase `c3-rewrite`.
   - **Census blind spot fixed:** `#src/` alias resolution in `scripts/repoint-census.cjs`, `scripts/c3t/tovu-facade-census.cjs` and `scripts/c3t/tovu-barrel-census.cjs`. Results:
     - C3t regenerated: 230 → 298 rows, +54 files.
     - C10-shell: +15 rows.
     - C3: +49 rows for importers that use the Tovu `export *` barrel `contracts/core/commands`.
   - New `scripts/barrel-sweep.py`: a read-only check for uncovered re-export barrels.

## Dry-run stale counts (`--phase all --dry-run`, Jini `af2389793`, Tovu `54dac1ff3`), before → after
| TSV | Before | After |
|---|---|---|
| C3 | 21 | 0 (496 rows) |
| C3t | 3 | 0 (298 rows) |
| C10 | 2 | 0 |
| C5 | n/a | 0 (new) |
| C10-shell | 0 | 0 (30 rows) |
| C1-plus, C2, C2-addendum, C4, C6, C7, C8, C9-ui, C9a | 0 | 0 |

The W0 commits created no missing rows. Checked: the new Jini files import nothing that moves; Tovu's 54 observability importers use no C8-moved name.

## Remaining (numbered)
1. **P-APPLY2 (new, before the C3 pass):** extend `scripts/apply-repoint.mjs`. Sonnet ~30k, plus tests, written red-first.
   - (a) In-place rename when `new_spec == old_spec` and `rename` has `Old->New`. v1 skips these rows and counts them as `keep`: 83 rows in C3.
   - (b) Type-argument templates from the `rename` text (`StorageKernel<X> => StorageKernel<Kysely<X>, X>`, bare `MigrationStep` → `MigrationStep<KyselyKernel<unknown>>`), plus the import it adds (`Kysely` from `kysely`; `KyselyKernel`).
   - (c) Inline `import('x').Old` with a same-spec rename (the `other-site-keys.ts` row).
   - Phase `c3-rewrite` holds every row that needs it. Until P-APPLY2 lands, a `--phase wave` pass must not run C3/C3t alone. Run `--phase wave,c3-rewrite` after P-APPLY2.
2. **C11 sheet (L-BASE-PURITY):** not written. The data is in `handoffs/sheets-fix.md` item 2. Apply ruling (a): `createRandomUuidGenerator` and `createSystemClock` go to platform as required ports, with no L6 allow-list. That means 187 importer files and a census through `repoint-census.cjs`.
3. **LANES.md:**
   - The "Wave B final" section is not written. Inputs:
     - C3 ~410k (C3t ~110k, now +54 files, so ~+25k).
     - C5: 383 rows.
     - P-APPLY2.
     - C11a/b.
     - C6 and P-ZOD in wave C.
     - The sheets-fix.md P-ZOD note (item 6).
   - Order and overlap are in the dispatch. File overlap to check: C3 and C5 both touch Tovu importers. Rows are re-resolved by statement, and the serial applier runs TSVs one after another, so there is no same-file conflict inside a lane.
4. **Optional cleanup:** fold the old "re-export" body text into the revision sections (C4, C8, C9a, C10). The banners already say the revisions win.

## Decisions taken (coordinator may veto)
- **No-shells applies to existing shells as well as lane-created ones.** These are deleted with their importers repointed: `vault.types.ts` line 2, `address.ts:5-6,39`, Tovu `gated-mutations/ports.ts:13`, cms `taxonomy/write-service.ts:2`.
- **Tovu `export *` barrels of Jini subpaths stay** (`contracts/core/{index,commands/index,commands/revert}.ts`). Only importers of *moved* names are repointed. Deleting the barrels is a separate Tovu-wide shell lane (owner question below).

## Owner questions (new)
1. **Tovu-wide Jini re-export barrels.** Tovu has barrels such as `contracts/core/commands/index.ts` (`export * from "@jini-ai/cms/core/commands"`) and `features/settings/index.ts` (named re-exports of `@jini-ai/core/settings`). These are shells under the rule, but they predate the untangle work.
   - **Recommendation:** delete them in one scripted Tovu lane after wave B, with the same census and applier. The rule allows no exceptions.
2. **C6 `ModelDiscoveryDeps`:** take the core `ProviderModelsQuery` fix (recommended), or keep the deps bag in agent-runtime.

## Warnings
- **Census blind spot:** `#src/` aliases were invisible to every census before this fix, so other lanes' Tovu rows could miss importers that go through Tovu barrels. `scripts/barrel-sweep.py` shows only the cases now fixed. Re-running every lane census with the patched `repoint-census.cjs` and diffing against the TSVs was not done (~20k).
- `scripts/c3t/barrels.raw.tsv` now holds only the C10 barrel census. The old sdk rows were dropped; they live in C8.
- Write TSVs with `'\t'.join`, never `csv.writer`.
