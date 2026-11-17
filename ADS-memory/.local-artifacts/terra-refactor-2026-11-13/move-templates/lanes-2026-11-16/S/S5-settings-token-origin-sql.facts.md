# S5-settings-token-origin-sql — machine-verified facts (generated; do not hand-edit)

Source: Tovu tree at `LANE_ROOT` (committed copy: `origin/integ/merge-a-2026-11-16`) @ `e801e9aee`. Regenerate: `LANE_ROOT=<tovu clone> python3 scripts/inv.py && LANE_ROOT=<tovu clone> python3 scripts/rep.py && LANE_ROOT=<tovu clone> python3 scripts/facts.py [<out dir>]`. Blobs are `git hash-object` of that tree; a sheet executor re-checks every blob (COMMON STOP-on-mismatch).

Files: 7, 943 lines (tests not counted).

## Files
| path (under apps/website/src) | lines | blob | CLASSIFY label | audit row | existing sheet/design mention | prod importers | test importers |
|---|---|---|---|---|---|---|---|
| features/settings/repo.ts | 426 | 4a9c6813876917493796d5858fc232b1f139d392 | - | - | - | 2 | 3 |
| features/settings/repo.sqlite.ts | 15 | 83c9f9646f8f17d0862468dc1268fbce4f97bbc4 | - | - | - | 3 | 4 |
| platform/db/repos/gated-mutation-token-repo.ts | 128 | 0111a04cf40fd4a9afcd247ab44f605074447a46 | MOVE-AFTER | - | - | 1 | 1 |
| platform/db/sqlite/gated-mutation-token-repo.sqlite.ts | 15 | f763ef22b636d8e8e22c7e0fdf05f62ef42fce24 | - | - | - | 1 | 1 |
| platform/db/repos/origin-repo.ts | 230 | e71bd9228d1854d80e29274aef379f1ad00cd70b | MOVE | - | - | 1 | 1 |
| platform/db/sqlite/origin-repo.sqlite.ts | 47 | 71fa83158c11fa3d3b01833f96602c547a87e328 | - | - | - | 2 | 2 |
| features/origin/configured-origin.ts | 82 | c85964afa6be58dddfc336135a20511f6ffe3b55 | - | - | - | 1 | 1 |

## Per file: exports, tables, lock keys, imports that leave the folder, importers

### features/settings/repo.ts (426 lines)
- exports (1): SqlSettingsRepo
- tables touched: setting_definitions, setting_revisions, setting_values_global, setting_values_user, setting_values_workspace
- lock keys: 352: await this.kernel.lockKey("setting_revisions");
- flags: -
- npm/@jini-ai imports: @jini-ai/core/primitives, @jini-ai/core/settings, kysely
- same-folder imports: -
- imports leaving the folder: platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (2): features/settings/repo.sqlite.ts, server/runtime/composition/agent-daemon-core-deps.ts
- test importers (3): features/settings/__tests__/repo.contract.test.ts, features/site-backup/__tests__/integration/saved-keys-store.fixture.ts, server/runtime/composition/__tests__/boot-settings-rejection.integration.test.ts

### features/settings/repo.sqlite.ts (15 lines)
- exports (1): SqliteSettingsRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/settings/repo.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/sqlite/content-db.ts
- prod importers (3): server/runtime/composition/deps.ts, server/runtime/composition/peer-site-reads.ts, server/runtime/composition/publish-content-seed-hash.ts
- test importers (4): features/publish-content/__tests__/round-trip-harness.ts, features/settings/__tests__/form-delivery-concurrency.integration.test.ts, features/settings/__tests__/purge-service.fk.test.ts, features/settings/__tests__/repo.sqlite.test.ts

### platform/db/repos/gated-mutation-token-repo.ts (128 lines)
- exports (1): SqlTokenStore
- tables touched: gated_mutation_tokens
- lock keys: 81: await this.kernel.lockKey(`gated_mutation_tokens:${params.token}`);
- flags: -
- npm/@jini-ai imports: kysely
- same-folder imports: -
- imports leaving the folder: contracts/core/gated-mutations/token.ts, platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (1): platform/db/sqlite/gated-mutation-token-repo.sqlite.ts
- test importers (1): platform/db/repos/__tests__/gated-mutation-token-repo.test.ts

### platform/db/sqlite/gated-mutation-token-repo.sqlite.ts (15 lines)
- exports (1): SqliteTokenStore
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: platform/db/sqlite/content-db.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/repos/gated-mutation-token-repo.ts
- prod importers (1): server/runtime/composition/deps.ts
- test importers (1): platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts

### platform/db/repos/origin-repo.ts (230 lines)
- exports (4): SqlOriginSettingRepo, seedDevCapabilityOriginOn, ConfiguredOriginWriteResult, registerConfiguredOriginOn
- tables touched: origin_settings
- lock keys: 211: await kernel.lockKey(`origin_settings:${workspaceId}`);
- flags: tovu-text
- npm/@jini-ai imports: @jini-ai/core/contracts/server/verified-origin, @jini-ai/core/primitives, kysely
- same-folder imports: -
- imports leaving the folder: platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (1): platform/db/sqlite/origin-repo.sqlite.ts
- test importers (1): features/origin/__tests__/repo.contract.test.ts

### platform/db/sqlite/origin-repo.sqlite.ts (47 lines)
- exports (3): SqliteOriginSettingRepo, seedDevCapabilityOrigin, registerConfiguredOrigin
- re-exports: {ConfiguredOriginWriteResult} from ../repos/origin-repo.js
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/contracts/server/verified-origin, @jini-ai/core/primitives
- same-folder imports: platform/db/sqlite/content-db.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/repos/origin-repo.ts
- prod importers (2): server/runtime/composition/deps.ts, server/runtime/composition/peer-site-reads.ts
- test importers (2): features/origin/__tests__/repo.contract.test.ts, features/seo/__tests__/sitemap.test.ts

### features/origin/configured-origin.ts (82 lines)
- exports (3): ConfiguredOriginOptions, resolveConfiguredOrigin, planOriginBoot
- re-exports: {OriginBootPlan} from @jini-ai/core/contracts/server/verified-origin
- tables touched: -
- lock keys: -
- flags: console, process.env, tovu-text
- npm/@jini-ai imports: @jini-ai/core/contracts/server/verified-origin, @jini-ai/core/primitives
- same-folder imports: -
- imports leaving the folder: contracts/core/runtime-mode.ts
- prod importers (1): features/origin/index.ts
- test importers (1): features/origin/__tests__/configured-origin.test.ts

## Test files that import a file of this sheet (blob-guard each before editing)
| test | lines | blob |
|---|---|---|
| features/settings/__tests__/repo.contract.test.ts | 394 | 8341c5de55fa85c601deea436492b9aa99ce6a3e |
| features/site-backup/__tests__/integration/saved-keys-store.fixture.ts | 15 | ab842007cfa3667cb363b3c64dfeede5ef458c22 |
| server/runtime/composition/__tests__/boot-settings-rejection.integration.test.ts | 56 | 226a8bbb002a86f22a12826bcbc26532f8a04948 |
| features/publish-content/__tests__/round-trip-harness.ts | 172 | 3a241a4fdf895caeccf950d5b2acb9e2ef3167ba |
| features/settings/__tests__/form-delivery-concurrency.integration.test.ts | 134 | 085e7b08535cfd21c520cde195c6314fd0901b27 |
| features/settings/__tests__/purge-service.fk.test.ts | 140 | 8aec22464f38f2df8e1530d369789e1f827552f9 |
| features/settings/__tests__/repo.sqlite.test.ts | 341 | c91aca9611dc54af88e8687922c619e6982f7a97 |
| platform/db/repos/__tests__/gated-mutation-token-repo.test.ts | 198 | 7140b5faf48959109b9ba6560aa852bef2ed9877 |
| platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts | 164 | 8f569ac0dc98f915d9928cf0356c605308067c2b |
| features/origin/__tests__/repo.contract.test.ts | 281 | 927314d0c4ee78804336048bcf5137e9ef4bc5b4 |
| features/seo/__tests__/sitemap.test.ts | 111 | ea97087a7c67c6894d47bf2966c913ebb4ccd501 |
| features/origin/__tests__/configured-origin.test.ts | 311 | 95459fc644e915eddeb2441f15ac38fdd374b909 |

## vi.mock / vi.doMock / importActual sites that name a file of this sheet (lesson 2: mock factories are consumers)
- none found by pattern (re-check with the census at execution)

## Path-keyed baselines / configs that name a file of this sheet (lesson 10: debt does not follow moved code silently)
- development/scripts/write-path-inventory.baseline.json: `src/features/settings/repo.sqlite.ts` at lines 449, 457, 465, 473, 481, 489, 497 (7 hits)

## Census command (run from the Tovu clone root; every hit must be listed above)
```
rg -n --no-heading -e 'configured\-origin|gated\-mutation\-token\-repo|gated\-mutation\-token\-repo\.sqlite|origin\-repo|origin\-repo\.sqlite|repo|repo\.sqlite' apps development scripts --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx' -g '*.json' -g '*.mjs' -g '*.cjs' | rg 'origin|repos|settings|sqlite'
```
