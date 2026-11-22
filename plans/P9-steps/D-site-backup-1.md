# D-site-backup-1 — site-backup → @jini-ai/devops (Jini step J then Tovu step T)

Lane D. Batch J:6 T:12. Depends on: C-contracts-core-3. Est: J 31 min, T 21 min.

## J — move verbatim into Jini (2 files, 56 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/site-backup/share-export-failure.ts` | `packages/devops/src/backup/site/share-export-failure.ts` | 27 |  |
| `apps/website/src/contracts/core/tool-metadata/site-backup.ts` | `packages/devops/src/backup/site/tool-metadata.ts` | 29 | W2 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/devops" exports["./backup/site/share-export-failure"]
- "@jini-ai/devops" exports["./backup/site/tool-metadata"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 2 sources, rewrite every importer (6 lines)

```
apps/website/src/features/site-backup/__tests__/share-backend.unit.test.ts:15  '../share-export-failure.js' -> '@jini-ai/devops/backup/site/share-export-failure'
apps/website/src/features/site-backup/share-backend.ts:4  './share-export-failure.js' -> '@jini-ai/devops/backup/site/share-export-failure'
apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-share-failures.test.ts:11  '#src/features/site-backup/share-export-failure' -> '@jini-ai/devops/backup/site/share-export-failure'
apps/website/src/server/inbound/admin-http/routes/system/site-share-password.ts:8  '#src/features/site-backup/share-export-failure' -> '@jini-ai/devops/backup/site/share-export-failure'
apps/website/src/contracts/core/tool-metadata/index.ts:48  './site-backup.js' -> '@jini-ai/devops/backup/site/tool-metadata'
apps/website/src/features/site-backup/tool-registrations.ts:3  '../../contracts/core/tool-metadata/site-backup.js' -> '@jini-ai/devops/backup/site/tool-metadata'
```

## Tovu tests that must stay green (2; import lines are repointed above, assertions untouched)
- `apps/website/src/features/site-backup/__tests__/share-backend.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-share-failures.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/contracts/core/tool-metadata/site-backup.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/contracts/core/tool-metadata/site-backup.ts:6: site_import_backup: { search: { keywords: "install import site share url link zip new separate restore", queries: ["Install the site at this
apps/website/src/contracts/core/tool-metadata/site-backup.ts:24: site_share_create: { search: { keywords: "share export site zip portable link download drafts", queries: ["Share this site", "Export this si
```

## Named mutation
in the Jini copy of `site-backup.ts`, negate the first `if (` condition of its first exported function; a NEW characterization test (write it first, tests-first rule) must go red, then revert
