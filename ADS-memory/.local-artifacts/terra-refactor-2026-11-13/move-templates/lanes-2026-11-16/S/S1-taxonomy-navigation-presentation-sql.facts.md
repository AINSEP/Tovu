# S1-taxonomy-navigation-presentation-sql — machine-verified facts (generated; do not hand-edit)

Source: Tovu tree at `LANE_ROOT` (ref `integ/merge-final-2026-11-16`) @ `232764af5`. Regenerate: `LANE_ROOT=<tovu clone> python3 scripts/inv.py && LANE_ROOT=<tovu clone> python3 scripts/rep.py && LANE_ROOT=<tovu clone> python3 scripts/facts.py [<out dir>]`. Blobs are `git hash-object` of that tree; a sheet executor re-checks every blob (COMMON STOP-on-mismatch).

Files: 8, 1130 lines (tests not counted).

## Files
| path (under apps/website/src) | lines | blob | CLASSIFY label | audit row | existing sheet/design mention | prod importers | test importers |
|---|---|---|---|---|---|---|---|
| features/taxonomy/repo.ts | 555 | ea1cb9827ebe04f7011e176bbda176552a1976dc | MOVE | - | - | 1 | 1 |
| features/taxonomy/repo.rows.ts | 81 | baea5a6977982c3af6a5b69fc37753bddd84be8f | MOVE | - | - | 1 | 0 |
| features/taxonomy/repo.sqlite.ts | 44 | 98be9d81a558bb6e6edd677897330f514bbc3543 | DELETE | - | - | 5 | 9 |
| features/navigation/repo.ts | 332 | a5a4a46e48f60304e777782490a8671722281750 | MOVE | - | - | 1 | 4 |
| features/navigation/repo.sqlite.ts | 23 | f50c1d607c8a9930d5183e85f23fde02495420af | - | - | - | 3 | 2 |
| features/presentation/repo.ts | 51 | e25eefb862467313526679f8375133aabe5510c7 | MOVE | - | - | 1 | 1 |
| features/presentation/repo.rows.ts | 29 | a378b505d215b8137a11659c4dedca39f2fac33e | MOVE-AFTER | - | - | 1 | 0 |
| features/presentation/repo.sqlite.ts | 15 | 4c62d322dae4f9549695ddb21d1f88ca39e11458 | - | - | - | 2 | 2 |

## Per file: exports, tables, lock keys, imports that leave the folder, importers

### features/taxonomy/repo.ts (555 lines)
- exports (4): SqlTaxonomyRepo, SqlTermRepo, SqlEntryTermRepo, SqlTaxonomyRevisionRepo
- re-exports: {AssignedTermView, EntryTermReadPort, TaxonomyPublishReadPort, TermPublishReadPort} from ./contracts.js
- tables touched: entry_terms, taxonomies, taxonomy_revisions, terms
- lock keys: 163: await this.kernel.lockKey(`taxonomy:${this.workspaceId}`); | 419: await this.kernel.lockKey(`taxonomy:${this.workspaceId}`);
- flags: -
- npm/@jini-ai imports: kysely
- same-folder imports: features/taxonomy/contracts.ts, features/taxonomy/index.ts, features/taxonomy/repo.rows.ts
- imports leaving the folder: platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (1): features/taxonomy/repo.sqlite.ts
- test importers (1): features/taxonomy/__tests__/repo.dialects.test.ts

### features/taxonomy/repo.rows.ts (81 lines)
- exports (7): TaxonomyRowSelect, TermRowSelect, toTaxonomy, toTaxonomyRow, toTerm, toTermRow, toTaxonomyRevisionRow
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/contracts/storage, kysely
- same-folder imports: features/taxonomy/index.ts
- imports leaving the folder: platform/db/content-database.generated.ts
- prod importers (1): features/taxonomy/repo.ts
- test importers (0): -

### features/taxonomy/repo.sqlite.ts (44 lines)
- exports (4): SqliteTaxonomyRepo, SqliteTermRepo, SqliteEntryTermRepo, SqliteTaxonomyRevisionRepo
- re-exports: {AssignedTermView, EntryTermReadPort, TaxonomyPublishReadPort, TermPublishReadPort} from ./contracts.js
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/taxonomy/contracts.ts, features/taxonomy/repo.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/sqlite/content-db.ts
- prod importers (5): server/routes/types.ts, server/runtime/composition/deps.ts, server/runtime/composition/memory-deps/slices/taxonomy-trash-repos.ts, server/runtime/composition/peer-site-reads.ts, server/runtime/composition/publish-content-seed-hash.ts
- test importers (9): features/entries/__tests__/unit/publish-content.test.ts, features/publish-content/__tests__/round-trip-harness.ts, features/taxonomy/__tests__/integration/repo.sqlite.integration.test.ts, features/taxonomy/__tests__/publish-content.test.ts, features/trash/__tests__/term-trash-flow.test.ts, server/inbound/admin-http/routes/taxonomy/__tests__/assign-terms.not-live.test.ts, server/inbound/admin-http/routes/taxonomy/__tests__/list.test.ts, server/inbound/public-http/routes/site/__tests__/integration/taxonomy-render-surface.integration.test.ts, server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts

### features/navigation/repo.ts (332 lines)
- exports (2): SqlMenuRepo, SqlNavLocationBindingRepo
- tables touched: menus, nav_location_bindings
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/navigation, @jini-ai/core/contracts/storage, kysely
- same-folder imports: -
- imports leaving the folder: platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (1): features/navigation/repo.sqlite.ts
- test importers (4): features/navigation/__tests__/footer-page-links.test.ts, features/navigation/__tests__/repo.compare-and-set.postgres.test.ts, features/navigation/__tests__/repo.sqlite.compare-and-set.test.ts, features/navigation/__tests__/repo.sqlite.test.ts

### features/navigation/repo.sqlite.ts (23 lines)
- exports (2): SqliteMenuRepo, SqliteNavLocationBindingRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/navigation/repo.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/sqlite/content-db.ts
- prod importers (3): server/runtime/composition/deps.ts, server/runtime/composition/peer-site-reads.ts, server/runtime/composition/publish-content-seed-hash.ts
- test importers (2): features/trash/__tests__/menu-trash-flow.test.ts, server/runtime/composition/__tests__/publish-content-seed-hash.test.ts

### features/presentation/repo.ts (51 lines)
- exports (2): SqlPresentationSettingsRepo, presentationSettingsRepoFor
- tables touched: presentation_settings
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/presentation
- same-folder imports: features/presentation/repo.rows.ts
- imports leaving the folder: platform/db/content-kernel.ts
- prod importers (1): features/presentation/repo.sqlite.ts
- test importers (1): features/presentation/__tests__/repo.dialects.test.ts

### features/presentation/repo.rows.ts (29 lines)
- exports (3): PresentationSettingsRow, toPresentationRecord, toPresentationRow
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/presentation, kysely
- same-folder imports: -
- imports leaving the folder: platform/db/content-database.generated.ts
- prod importers (1): features/presentation/repo.ts
- test importers (0): -

### features/presentation/repo.sqlite.ts (15 lines)
- exports (1): SqlitePresentationSettingsRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/presentation/repo.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/sqlite/content-db.ts
- prod importers (2): features/presentation/index.ts, server/runtime/composition/publish-content-seed-hash.ts
- test importers (2): features/presentation/__tests__/integration/repo.sqlite.integration.test.ts, features/publish-content/__tests__/round-trip-harness.ts

## Test files that import a file of this sheet (blob-guard each before editing)
| test | lines | blob |
|---|---|---|
| features/taxonomy/__tests__/repo.dialects.test.ts | 462 | 1466c6fbaa350df9ad44335949deb27a2d1b848e |
| features/entries/__tests__/unit/publish-content.test.ts | 277 | 3bdf4bfb5547a6fa70641614a6adea255ca83e4c |
| features/publish-content/__tests__/round-trip-harness.ts | 173 | 3bb925aeccd187a3b1b4a3b0cead5f9e286c1f20 |
| features/taxonomy/__tests__/integration/repo.sqlite.integration.test.ts | 436 | dacc2ee1aec26780574ea45a9d6e77570efd1396 |
| features/taxonomy/__tests__/publish-content.test.ts | 85 | 024b68082545a04ab4b350d8f86e3313f6059cd8 |
| features/trash/__tests__/term-trash-flow.test.ts | 372 | 2540cbc7d7a608c0dd9b9cc2f7080dbe031a22ad |
| server/inbound/admin-http/routes/taxonomy/__tests__/assign-terms.not-live.test.ts | 83 | d56f5c70db3c08f806b143462664ae26877f9c9d |
| server/inbound/admin-http/routes/taxonomy/__tests__/list.test.ts | 121 | 1a09b6f40a12e8357034d4cca488d0f85ff4e575 |
| server/inbound/public-http/routes/site/__tests__/integration/taxonomy-render-surface.integration.test.ts | 346 | 58703782999c9ee2c889a633704ac4cb48288526 |
| server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts | 383 | c221df0710feda72c3b9c134571827b6e8ddc1ff |
| features/navigation/__tests__/footer-page-links.test.ts | 265 | 0fdcfe771b064c5bb72b927d22b8f37479dbb26e |
| features/navigation/__tests__/repo.compare-and-set.postgres.test.ts | 134 | cd837f5dc66e3bb6d1303d91c1fe6e3b57e3e823 |
| features/navigation/__tests__/repo.sqlite.compare-and-set.test.ts | 239 | d8467cfe51b01f5ed0d31b621070a27b16726038 |
| features/navigation/__tests__/repo.sqlite.test.ts | 333 | 410181fdacae8c4346f2988932bcd72b926e1132 |
| features/trash/__tests__/menu-trash-flow.test.ts | 215 | 88769f2773be1273afe16b3ba4b5f790897db91b |
| server/runtime/composition/__tests__/publish-content-seed-hash.test.ts | 122 | 7f77558242a5a9b77397ac8163a08381f1e09ef7 |
| features/presentation/__tests__/repo.dialects.test.ts | 67 | 7374314a4dab77e4fcff8fb4da8b206ff2fccaf5 |
| features/presentation/__tests__/integration/repo.sqlite.integration.test.ts | 98 | 9b091a6f61b702721df69c0140b1a12d4f3e0684 |

## vi.mock / vi.doMock / importActual sites that name a file of this sheet (lesson 2: mock factories are consumers)
- none found by pattern (re-check with the census at execution)

## Path-keyed baselines / configs that name a file of this sheet (lesson 10: debt does not follow moved code silently)
- development/scripts/write-path-inventory.baseline.json: `src/features/presentation/repo.sqlite.ts` at lines 297 (1 hits)
- development/scripts/check-architecture.baseline.json: `src/features/taxonomy/repo.sqlite.ts` at lines 290 (1 hits)

## Census command (run from the Tovu clone root; every hit must be listed above)
```
rg -n --no-heading -e 'repo|repo\.rows|repo\.sqlite' apps development scripts --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx' -g '*.json' -g '*.mjs' -g '*.cjs' | rg 'navigation|presentation|taxonomy'
```
