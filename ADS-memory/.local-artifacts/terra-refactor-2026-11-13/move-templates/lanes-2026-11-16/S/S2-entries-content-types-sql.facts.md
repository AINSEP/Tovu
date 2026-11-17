# S2-entries-content-types-sql — machine-verified facts (generated; do not hand-edit)

Source: Tovu tree at `LANE_ROOT` (ref `integ/merge-final-2026-11-16`) @ `232764af5`. Regenerate: `LANE_ROOT=<tovu clone> python3 scripts/inv.py && LANE_ROOT=<tovu clone> python3 scripts/rep.py && LANE_ROOT=<tovu clone> python3 scripts/facts.py [<out dir>]`. Blobs are `git hash-object` of that tree; a sheet executor re-checks every blob (COMMON STOP-on-mismatch).

Files: 8, 754 lines (tests not counted).

## Files
| path (under apps/website/src) | lines | blob | CLASSIFY label | audit row | existing sheet/design mention | prod importers | test importers |
|---|---|---|---|---|---|---|---|
| features/entries/repo.ts | 272 | 2367c246f3d7f5c9422f321a6cd90f1bdebd20cf | MOVE-AFTER | - | - | 1 | 3 |
| features/entries/repo.rows.ts | 62 | b64c51a76e45d0eb6ebbc187313f16a234c80f46 | MOVE-AFTER | - | - | 1 | 1 |
| features/entries/repo.sqlite.ts | 17 | 66c6534034bdbe14ad1b3f6175ccc6e8c2ca71e7 | DELETE | - | - | 4 | 7 |
| features/entries/trash-aware-memory-repo.ts | 209 | 09e5e7af77dc0dc131469dad385a3f7d212e0c40 | DEDUPE | - | - | 5 | 15 |
| features/content-types/repo.ts | 69 | 5ed4919f8925009b36292d0a011faf46d7e9400a | MOVE | - | - | 1 | 1 |
| features/content-types/repo.rows.ts | 93 | ff55f936ac5ca654232d3ba466faa889f0f079f8 | MOVE | - | - | 1 | 0 |
| features/content-types/repo.sqlite.ts | 15 | 1ee3df32cebc43f582812b0655696c050c0146d7 | - | - | - | 3 | 4 |
| features/content-types/repo.memory.ts | 17 | eb6b63516357b6c304dcd447abf2d122afe44f1e | SHIM | - | - | 0 | 1 |

## Per file: exports, tables, lock keys, imports that leave the folder, importers

### features/entries/repo.ts (272 lines)
- exports (2): SqlEntryRepo, entryRepoFor
- re-exports: {EntryPublishReadPort} from ./contracts.js
- tables touched: entries, entry_revisions
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/contracts/storage, @jini-ai/db/kernel, kysely
- same-folder imports: features/entries/contracts.ts, features/entries/index.ts, features/entries/public-list.ts, features/entries/repo.rows.ts
- imports leaving the folder: features/media/access-evidence.ts, platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (1): features/entries/repo.sqlite.ts
- test importers (3): features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts, features/entries/__tests__/integration/repo.compare-and-set.test.ts, features/entries/__tests__/integration/repo.dialects.test.ts

### features/entries/repo.rows.ts (62 lines)
- exports (4): EntryRow, toRecord, toRow, toRevisionRow
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: kysely
- same-folder imports: features/entries/index.ts
- imports leaving the folder: platform/db/content-database.generated.ts
- prod importers (1): features/entries/repo.ts
- test importers (1): features/entries/__tests__/unit/repo.rows.unit.test.ts

### features/entries/repo.sqlite.ts (17 lines)
- exports (1): SqliteEntryRepo
- re-exports: {EntryPublishReadPort} from ./contracts.js
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/entries/contracts.ts, features/entries/repo.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/sqlite/content-db.ts
- prod importers (4): server/routes/types.ts, server/runtime/composition/deps.ts, server/runtime/composition/peer-site-reads.ts, server/runtime/composition/publish-content-seed-hash.ts
- test importers (7): features/entries/__tests__/integration/repo.sqlite.integration.test.ts, features/entries/__tests__/unit/publish-content.test.ts, features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts, features/publish-content/__tests__/round-trip-harness.ts, features/trash/__tests__/widget-trash-flow.test.ts, features/widgets/__tests__/integration/embed-service.integration.test.ts, server/inbound/public-http/routes/site/__tests__/integration/media-validation.integration.test.ts

### features/entries/trash-aware-memory-repo.ts (209 lines)
- exports (1): TrashAwareInMemoryEntryRepo
- re-exports: {TrashableEntryRecord} from ./contracts.js
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/entries/contracts.ts, features/entries/index.ts, features/entries/public-list.ts
- imports leaving the folder: features/media/access-evidence.ts
- prod importers (5): features/entries/publish-content.ts, server/runtime/composition/memory-deps/slices/comments.ts, server/runtime/composition/memory-deps/slices/memory-trash.ts, server/runtime/composition/memory-deps/slices/repos.ts, server/runtime/composition/memory-deps/slices/trash-adapters-forms-widgets.ts
- test importers (15): assistant/__tests__/tool-registrations.trash-item.test.ts, assistant/__tests__/tool-registrations.widgets-contracts.test.ts, features/entries/__tests__/integration/repo.compare-and-set.test.ts, features/entries/__tests__/unit/trash-aware-memory-repo.display.unit.test.ts, features/widgets/__tests__/agent-tools.trash-confirmation.test.ts, features/widgets/__tests__/support/memory-widget-trash.ts, features/widgets/__tests__/unit/create-core-resolvers.unit.test.ts, features/widgets/__tests__/unit/gallery-resolver-wiring.unit.test.ts, features/widgets/__tests__/unit/publish-content.test.ts, features/widgets/__tests__/unit/resolvers-recent-entries.unit.test.ts, server/inbound/public-http/http/site/__tests__/leading-style-regression.test.ts, server/inbound/public-http/routes/site/__tests__/embeds-everywhere.route.test.ts, server/inbound/public-http/routes/site/__tests__/integration/media-validation.integration.test.ts, server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts, server/inbound/public-http/routes/site/__tests__/resolve-html-format-content-markers.test.ts

### features/content-types/repo.ts (69 lines)
- exports (2): SqlContentTypeRepo, contentTypeRepoFor
- tables touched: content_type_revisions, content_types
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/content-types/index.ts, features/content-types/repo.rows.ts
- imports leaving the folder: platform/db/content-kernel.ts
- prod importers (1): features/content-types/repo.sqlite.ts
- test importers (1): features/content-types/__tests__/repo.dialects.test.ts

### features/content-types/repo.rows.ts (93 lines)
- exports (6): ContentTypeRow, syntheticId, toRecord, toRow, updatableColumns, toRevisionRow
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: kysely
- same-folder imports: features/content-types/declared-owners.ts, features/content-types/index.ts
- imports leaving the folder: platform/db/content-database.generated.ts
- prod importers (1): features/content-types/repo.ts
- test importers (0): -

### features/content-types/repo.sqlite.ts (15 lines)
- exports (1): SqliteContentTypeRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/content-types/repo.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/sqlite/content-db.ts
- prod importers (3): server/runtime/composition/deps.ts, server/runtime/composition/peer-site-reads.ts, server/runtime/composition/publish-content-seed-hash.ts
- test importers (4): features/content-types/__tests__/integration/repo.sqlite.integration.test.ts, features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts, features/trash/__tests__/widget-trash-flow.test.ts, features/widgets/__tests__/integration/embed-service.integration.test.ts

### features/content-types/repo.memory.ts (17 lines)
- exports (0): -
- re-exports: {InMemoryContentTypeRepo,
  NoopContentTypeIndexProvisioner,
  toContentTypeOutbox,} from @jini-ai/cms/content-types
- tables touched: -
- lock keys: -
- flags: await import
- npm/@jini-ai imports: @jini-ai/cms/content-types
- same-folder imports: -
- imports leaving the folder: -
- prod importers (0): -
- test importers (1): assistant/__tests__/tool-registrations.widgets-authorization.test.ts

## Test files that import a file of this sheet (blob-guard each before editing)
| test | lines | blob |
|---|---|---|
| features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts | 117 | 47f5e3b55b652ad6a7a35aa2a930a1c06d2ab204 |
| features/entries/__tests__/integration/repo.compare-and-set.test.ts | 169 | e558f63660780f3c41d182ce309e7d7034c06f5e |
| features/entries/__tests__/integration/repo.dialects.test.ts | 340 | dee94117920900a277a8d902b3238112f3325343 |
| features/entries/__tests__/unit/repo.rows.unit.test.ts | 33 | af9be247c00f559a79cf9326be9e3c85240a4a96 |
| features/entries/__tests__/integration/repo.sqlite.integration.test.ts | 73 | 558e37a349c18511383b4d069a61fab8382fdd35 |
| features/entries/__tests__/unit/publish-content.test.ts | 277 | 3bdf4bfb5547a6fa70641614a6adea255ca83e4c |
| features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts | 203 | 0a3955eb5b3933349044e9c0773234a56dbeda77 |
| features/publish-content/__tests__/round-trip-harness.ts | 173 | 3bb925aeccd187a3b1b4a3b0cead5f9e286c1f20 |
| features/trash/__tests__/widget-trash-flow.test.ts | 364 | 4df3687c01af0b972af3239ff81714f3e716be3b |
| features/widgets/__tests__/integration/embed-service.integration.test.ts | 616 | c5f7cd16c8044cc8ba62004c3eae4e10744bf027 |
| server/inbound/public-http/routes/site/__tests__/integration/media-validation.integration.test.ts | 151 | 2b9acf2cdbc03b755b2a7902a28c55256aa3e4e4 |
| assistant/__tests__/tool-registrations.trash-item.test.ts | 707 | d9000adee0070a2ec8c586611a3a7157eb3281ad |
| assistant/__tests__/tool-registrations.widgets-contracts.test.ts | 432 | 1af885320af5d83729601664bf4b3545677cb86d |
| features/entries/__tests__/unit/trash-aware-memory-repo.display.unit.test.ts | 432 | 8a5a6345c71c2103cf7c39cb13b9ba4332c9d6b2 |
| features/widgets/__tests__/agent-tools.trash-confirmation.test.ts | 140 | 0ae8c893d6329b51a69bb87f61c9100d01b1e754 |
| features/widgets/__tests__/support/memory-widget-trash.ts | 37 | 64cb6d8f455e7c83bf7478bf3a1b114069c294bb |
| features/widgets/__tests__/unit/create-core-resolvers.unit.test.ts | 152 | b917bc0ed783a74a15736a2c9b4128fedc964eb0 |
| features/widgets/__tests__/unit/gallery-resolver-wiring.unit.test.ts | 22 | 22c31db835a3e5347f3263fb42f10dc2ba0c9b5c |
| features/widgets/__tests__/unit/publish-content.test.ts | 225 | 938686c20b35470dbf62f38aa07c9fbf4d0cb0f5 |
| features/widgets/__tests__/unit/resolvers-recent-entries.unit.test.ts | 400 | 8ed3bcc5b49fa24e7b4cc4cf1e1dc2f81abd8c5f |
| server/inbound/public-http/http/site/__tests__/leading-style-regression.test.ts | 90 | 1755a29e0beee1472ad9da45aec7bbaa9eaa77fd |
| server/inbound/public-http/routes/site/__tests__/embeds-everywhere.route.test.ts | 719 | 95159f095db6c7450001880c47d2ceab0f83fb5b |
| server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts | 383 | c221df0710feda72c3b9c134571827b6e8ddc1ff |
| server/inbound/public-http/routes/site/__tests__/resolve-html-format-content-markers.test.ts | 300 | f2989d6c001ab3c71cd398c7d3ebb50355010603 |
| features/content-types/__tests__/repo.dialects.test.ts | 154 | e92dcbbec0f1785f87e19b803cfdbca8c2579377 |
| features/content-types/__tests__/integration/repo.sqlite.integration.test.ts | 176 | 09c29b6b8b83c815fdc43430d1a860e7ea3f9683 |
| assistant/__tests__/tool-registrations.widgets-authorization.test.ts | 290 | ede53b04e0bb4abd44a018a6d1605bec3a51263b |

## vi.mock / vi.doMock / importActual sites that name a file of this sheet (lesson 2: mock factories are consumers)
- none found by pattern (re-check with the census at execution)

## Path-keyed baselines / configs that name a file of this sheet (lesson 10: debt does not follow moved code silently)
- development/scripts/hardwiring-debt.json: `src/features/entries/repo.rows.ts` at lines 146, 153, 160 (3 hits)
- development/scripts/hardwiring-debt.json: `src/features/content-types/repo.rows.ts` at lines 111, 118, 125, 132 (4 hits)
- development/scripts/check-architecture.baseline.json: `src/features/entries/repo.sqlite.ts` at lines 285 (1 hits)

## Census command (run from the Tovu clone root; every hit must be listed above)
```
rg -n --no-heading -e 'repo|repo\.memory|repo\.rows|repo\.sqlite|trash\-aware\-memory\-repo' apps development scripts --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx' -g '*.json' -g '*.mjs' -g '*.cjs' | rg 'content-types|entries'
```
