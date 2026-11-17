# S7 — media SQL repos and the versioned-media port -> `@jini-ai/cms/media/sql`

Template: T-SQLREPO. Facts: `S7-media-sql.facts.md` (4 files, 997 lines, 27 test files).

```
id: S7a-versioned-media-port (~110k): features/media/versioned-media-repo.ts, guard-rendition-repo.ts -> cms ./media (existing)
    S7b-media-sql (~240k, cut point after J1): platform/db/repos/media-repo.ts (719) -> cms NEW ./media/sql (node)
prerequisites: S0 green (P1 `asset_blobs:<ws>:<sha>` and `slugLockKey`; P6). S7a before S7b. OD-5 (`listColumns` from
  `@jini-ai/db/kernel` at media-repo.ts:5). audit2 sheet A08 (cms/media server additions) edits `features/media/index.ts`
  importers: run serially with S7; whichever runs second re-takes blobs. R9 landed.
```

## split
- `versioned-media-repo.ts`: `VersionedMediaRepoPort` (the optimistic `saveIfVersion` / `insertIfAbsent` / retire-list extension of `MediaRepoPort`) and `InMemoryVersionedMediaRepo` MOVE to `packages/cms/src/media/versioned-repo.ts` (+ memory twin beside `repo.memory.ts`). First diff `InMemoryVersionedMediaRepo` against Jini's `media/repo.memory.ts`: if the Jini memory repo can gain the three methods, EXTEND it (one owner) instead of adding a second memory class; the diff decides, record it.
- `guard-rendition-repo.ts` (24) MOVE beside `rendition-service.ts` (CLASSIFY: port `saveRenditionIfSource`).
- `media-repo.ts`: `SqlMediaRepo`, `SqlAssetBlobRepo`, `SqlMediaContentTypeStore`, `SqlAssetRenditionRepo`, `SqlTransformDefinitionRepo` MOVE. Five classes in 719 lines: one Jini file per class under `media/sql/` (owner size limits inside each file), shared mappers in `repo.rows.ts`. `MediaContentTypeStorePort` is imported from the Tovu media barrel: CLASSIFY marks `content-type-store.ts` DELETE-AFTER-PARITY against `cms/widgets/host-ports.ts:29 MediaContentTypeStore…`; S7b does NOT resolve that parity: `SqlMediaContentTypeStore` implements whichever port the Tovu class implements today, moved as a type if it is Tovu-only.
- plan-v6 warned "dynamic `selectFrom` targets, read first": grep `selectFrom\(` with a non-literal argument in media-repo.ts before writing table types; every dynamic target must map to a `tables` key.
- `sqlite/media-repo.sqlite.ts` (46) STAY-WIRING (3 prod + 12 tests).

## Characterization (T0)
| Risk | Test | Mutation -> RED |
|---|---|---|
| Two uploads of the same bytes create two blobs / a blob row is lost | concurrent `insertIfAbsent` of one sha: one row; lock key recorded | remove the blob lock |
| Slug collision under concurrency | two saves of the same slug in one workspace: second gets today's outcome (suffix or conflict; pin it); `slugLockKey` recorded (5 sites) | remove a slug lock |
| Stale media save overwrites a newer version | `saveIfVersion` with an old version: refused, row unchanged | drop the version predicate |
| Blob GC deletes a referenced blob | NOT enabled here (plan-v6: "do not enable blob GC's where-used check"); assert the repo's retire-list read returns exactly today's set for a fixture | widen the query |
| Column probing differs per dialect (`listColumns`) | dialect matrix test of the one method that uses it | bind the wrong helper |
| Rendition saved for a source that changed | `saveRenditionIfSource` refuses when the source version moved | drop the guard |

## stops
- Never permanent deletes: any `deleteFrom` on media or blob rows that is not already present, or a purge path reachable without the trash adapter.
- A dynamic table target without a `tables` key.
Not verified while planning: media-repo.ts body (exports, tables, locks and importers only); the memory-repo diff.
