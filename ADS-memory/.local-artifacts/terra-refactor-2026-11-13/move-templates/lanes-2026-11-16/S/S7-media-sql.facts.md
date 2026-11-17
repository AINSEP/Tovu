# S7-media-sql — machine-verified facts (generated; do not hand-edit)

Source: Tovu `origin/integ/merge-b-2026-11-16` @ `491632dc5`. Regenerate: `python3 scripts/inv.py && python3 scripts/rep.py && python3 scripts/facts.py <out>`. Blobs are `git hash-object` of that tree; a sheet executor re-checks every blob (COMMON STOP-on-mismatch).

Files: 4, 997 lines (tests not counted).

## Files
| path (under apps/website/src) | lines | blob | CLASSIFY label | audit row | existing sheet/design mention | prod importers | test importers |
|---|---|---|---|---|---|---|---|
| platform/db/repos/media-repo.ts | 719 | 8734540bb227e9623b0274d070a8d0f9f8c41efb | MOVE-AFTER | - | - | 2 | 10 |
| platform/db/sqlite/media-repo.sqlite.ts | 46 | b7073b681dc684bebf32988dd67dee75e091f06b | - | - | - | 3 | 12 |
| features/media/versioned-media-repo.ts | 208 | 0d6b08b48cb5481341d086e6e58be5076bd399e6 | MOVE | - | - | 3 | 7 |
| features/media/guard-rendition-repo.ts | 24 | f7ca58518ace6e19582d7fd4633485f0afee97d7 | MOVE | - | - | 2 | 2 |

## Per file: exports, tables, lock keys, imports that leave the folder, importers

### platform/db/repos/media-repo.ts (719 lines)
- exports (5): SqlMediaRepo, SqlAssetBlobRepo, SqlMediaContentTypeStore, SqlAssetRenditionRepo, SqlTransformDefinitionRepo
- tables touched: asset_blobs, asset_renditions, media, media_slug_history, transform_registry
- lock keys: 269: await this.kernel.lockKey(slugLockKey(record.workspaceId)); | 313: await this.kernel.lockKey(slugLockKey(record.workspaceId)); | 353: await this.kernel.lockKey(slugLockKey(required.workspaceId)); | 395: await this.kernel.lockKey(slugLockKey(record.workspaceId)); | 418: await this.kernel.lockKey(slugLockKey(record.workspaceId)); | 510: await this.kernel.lockKey(`asset_blobs:${record.workspaceId}:${record.sha256}`);
- flags: tovu-text
- npm/@jini-ai imports: @jini-ai/cms/media, @jini-ai/core/contracts/storage, @jini-ai/core/primitives, @jini-ai/db/kernel, kysely
- same-folder imports: -
- imports leaving the folder: features/media/index.ts, platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (2): platform/db/sqlite/media-repo.sqlite.ts, scripts/forms-maintenance.ts
- test importers (10): features/forms/__tests__/form-file-maintenance.test.ts, features/forms/__tests__/form-file-purge.test.ts, features/forms/__tests__/form-file-renditions.test.ts, features/media/__tests__/created-by.test.ts, features/media/__tests__/library-persistence.test.ts, features/media/__tests__/provenance.integration.test.ts, features/media/__tests__/replacement.dialects.test.ts, features/media/__tests__/repo.contract.test.ts, platform/db/repos/__tests__/media-content-type-store.test.ts, server/inbound/admin-http/routes/media/__tests__/upload-concurrent.test.ts

### platform/db/sqlite/media-repo.sqlite.ts (46 lines)
- exports (5): SqliteMediaRepo, SqliteAssetBlobRepo, SqliteMediaContentTypeStore, SqliteAssetRenditionRepo, SqliteTransformDefinitionRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: platform/db/sqlite/content-db.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/repos/media-repo.ts
- prod importers (3): server/runtime/composition/deps.ts, server/runtime/composition/peer-site-reads.ts, server/runtime/composition/publish-content-seed-hash.ts
- test importers (12): features/media-import/__tests__/replace-file.test.ts, features/media/__tests__/import-media-entity.test.ts, features/media/__tests__/library-persistence.test.ts, features/media/__tests__/media-producing-previews.test.ts, features/media/__tests__/publish-content.apply.test.ts, features/media/__tests__/publish-content.overwrite.test.ts, features/media/__tests__/repo.contract.test.ts, features/site-backup/__tests__/library-share.integration.test.ts, platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts, server/inbound/admin-http/routes/media/__tests__/replace.test.ts, server/inbound/public-http/routes/site/__tests__/integration/media-replace-cache.integration.test.ts, server/runtime/composition/__tests__/peer-site-reads.fixture.ts

### features/media/versioned-media-repo.ts (208 lines)
- exports (2): VersionedMediaRepoPort, InMemoryVersionedMediaRepo
- tables touched: -
- lock keys: -
- flags: tovu-text
- npm/@jini-ai imports: @jini-ai/cms/media, @jini-ai/core/primitives
- same-folder imports: -
- imports leaving the folder: -
- prod importers (3): features/media/guard-rendition-repo.ts, features/media/index.ts, features/media/where-used.ts
- test importers (7): features/media/__tests__/guard-rendition-repo.test.ts, features/media/__tests__/mediawidget-where-used.test.ts, features/media/__tests__/verify-published-media.test.ts, features/media/__tests__/versioned-rendition.unit.test.ts, server/inbound/public-http/http/site/__tests__/leading-style-regression.test.ts, server/inbound/public-http/routes/site/__tests__/integration/media-validation.integration.test.ts, server/inbound/public-http/routes/site/__tests__/resolve-html-format-content-markers.test.ts

### features/media/guard-rendition-repo.ts (24 lines)
- exports (1): guardMediaRenditionRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/media
- same-folder imports: features/media/versioned-media-repo.ts
- imports leaving the folder: -
- prod importers (2): features/media/index.ts, server/inbound/public-http/routes/site/media-rendition.ts
- test importers (2): features/media/__tests__/guard-rendition-repo.test.ts, server/inbound/admin-http/routes/media/__tests__/replace.test.ts

## Test files that import a file of this sheet (blob-guard each before editing)
| test | lines | blob |
|---|---|---|
| features/forms/__tests__/form-file-maintenance.test.ts | 213 | 401a60240bf56c4eefd161d36086f3a20752361b |
| features/forms/__tests__/form-file-purge.test.ts | 145 | 9351c3637628fd48c206fffa0371141377655408 |
| features/forms/__tests__/form-file-renditions.test.ts | 147 | 3410d179eca09653f9caec8bde506876fff51547 |
| features/media/__tests__/created-by.test.ts | 148 | e600c67ba46eff76e1911e74878014c2f9265421 |
| features/media/__tests__/library-persistence.test.ts | 72 | da41feb5a32fa9473f10b1ce31d0cf546e1d6ece |
| features/media/__tests__/provenance.integration.test.ts | 32 | 7e2973860a98dc6dad0960fcb235bfc2f2c50b88 |
| features/media/__tests__/replacement.dialects.test.ts | 68 | f9cf4de60dce1152bf58f351ee472de06e698599 |
| features/media/__tests__/repo.contract.test.ts | 728 | 4f5d176138d2a6597a6163002dd1dcd9e0471b6f |
| platform/db/repos/__tests__/media-content-type-store.test.ts | 162 | c1362de98e2e4e2c03ec9c4731c8c9a5a4feb860 |
| server/inbound/admin-http/routes/media/__tests__/upload-concurrent.test.ts | 70 | f0959834bdbf06463e4f26862d0aa1bcd6fb6fe6 |
| features/media-import/__tests__/replace-file.test.ts | 228 | 2f3840f2cf5310c6a27bffbb1eebd03134540f9f |
| features/media/__tests__/import-media-entity.test.ts | 439 | 7be12daa6f02eff0e4e7ea486f577fad5f396a11 |
| features/media/__tests__/media-producing-previews.test.ts | 134 | 19c8db321dcdf73cbb8bde4062f1e5ad89ec3171 |
| features/media/__tests__/publish-content.apply.test.ts | 696 | 718c74235412dfadebc3e4da8055b00c19b470ff |
| features/media/__tests__/publish-content.overwrite.test.ts | 255 | 4587ff4d5610e12deb6e46f621352cedc3127739 |
| features/site-backup/__tests__/library-share.integration.test.ts | 358 | fc14314bfc4bb7915cc7370365ff7b58dc7a69b4 |
| platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts | 164 | 8f569ac0dc98f915d9928cf0356c605308067c2b |
| server/inbound/admin-http/routes/media/__tests__/replace.test.ts | 204 | 6fb008f59a1877864f4408b095a0f75029f654f3 |
| server/inbound/public-http/routes/site/__tests__/integration/media-replace-cache.integration.test.ts | 148 | 9c2eae529d7089a78d77733b7bce80f03e81c6d9 |
| server/runtime/composition/__tests__/peer-site-reads.fixture.ts | 155 | 870564d5421df8038f2de5c0634fd90b42ae6ba4 |
| features/media/__tests__/guard-rendition-repo.test.ts | 56 | 4e8f260685250a3490a7c801bc80260fb9034d9e |
| features/media/__tests__/mediawidget-where-used.test.ts | 100 | 49cdc064c13da9379d1820b72438d2944c62c619 |
| features/media/__tests__/verify-published-media.test.ts | 142 | 60bd8a660ac4737711bdd9c19745b31c4d6d7c7d |
| features/media/__tests__/versioned-rendition.unit.test.ts | 36 | 5e404db6309578f8ae454bca1fbf2740b7d3cf04 |
| server/inbound/public-http/http/site/__tests__/leading-style-regression.test.ts | 87 | aba67f8fe58d9f05bef76bc41eed1f59fe6f0d33 |
| server/inbound/public-http/routes/site/__tests__/integration/media-validation.integration.test.ts | 151 | 2b9acf2cdbc03b755b2a7902a28c55256aa3e4e4 |
| server/inbound/public-http/routes/site/__tests__/resolve-html-format-content-markers.test.ts | 304 | 8d5ac6c3ab6cc67b7f62a47243f2c36a412a4eaa |

## vi.mock / vi.doMock / importActual sites that name a file of this sheet (lesson 2: mock factories are consumers)
- none found by pattern (re-check with the census at execution)

## Path-keyed baselines / configs that name a file of this sheet (lesson 10: debt does not follow moved code silently)
- none in: development/scripts/write-path-inventory.baseline.json, development/scripts/hardwiring-debt.json, development/scripts/check-architecture.baseline.json, development/scripts/size-debt.json, knip.json, eslint.config.mjs

## Census command (run from the Tovu clone root; every hit must be listed above)
```
rg -n --no-heading -e 'guard\-rendition\-repo|media\-repo|media\-repo\.sqlite|versioned\-media\-repo' apps development scripts --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx' -g '*.json' -g '*.mjs' -g '*.cjs' | rg 'media|repos|sqlite'
```
