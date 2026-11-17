# S7 (revision 2) — media SQL repos and the versioned-media port -> `@jini-ai/cms/media` and `./media/sql`

Template: T-SQLREPO rev 2. Facts: `S7-media-sql.facts.md` (4 files, 997 lines, 27 test files).
Revision 2: aligned with the revised template (injected column catalog instead of a `@jini-ai/db` import, file
partition, the existing delete paths listed, no edit to the shared transaction test).

```
id: S7a-versioned-media-port (~110k): features/media/versioned-media-repo.ts, guard-rendition-repo.ts -> cms ./media (existing, node)
    S7b-media-sql (~240k, cut point after J1): platform/db/repos/media-repo.ts (719) -> cms NEW ./media/sql (node)
prerequisites: S0 DONE (P1 `asset_blobs:<ws>:<sha>` and the slug key; P6). xpkg R6-R9 landed (`ColumnCatalogPort`:
  `rg -n "ColumnCatalogPort" packages/cms/src`). audit2 A08 (cms/media server additions) never in the same wave as S7.
successor_of: S4b (cms manifest); S7b: S7a
```

## S7a
- `versioned-media-repo.ts`: `VersionedMediaRepoPort` (:39; the optimistic `saveIfVersion` :49 / `insertIfAbsent` :58 /
  retire-list extension of `MediaFileReplacementRepoPort`, su-refresh: not `MediaRepoPort`) MOVE to `packages/cms/src/media/versioned-repo.ts`. `InMemoryVersionedMediaRepo`: step 0
  diffs it against Jini's `media/repo.memory.ts` method by method and writes the table into the report; if the Jini
  memory repo can gain the three methods with every existing test green, EXTEND it (one owner); otherwise MOVE the class
  beside it. The sheet does not guess: the table decides, and the T0 rows below run against whichever class results.
- `guard-rendition-repo.ts` (24) MOVE beside `rendition-service.ts` (port `saveRenditionIfSource`).
- Tovu after T1: both files deleted, importers (facts file) repointed to `@jini-ai/cms/media`; `media-repo.ts:8` imports
  `VersionedMediaRepoPort` from Jini. `MediaContentTypeStorePort` stays where it is today (S7b note).

## S7b
**partition** (su-refresh: ranges re-read on refactor/terra; each class's mapper sits just above it). `media-repo.ts`: helpers
and mappers :1-164, `SqlMediaRepo` :165-457 (293), `toAssetBlobRecord` + `SqlAssetBlobRepo` :459-536, doc +
`SqlMediaContentTypeStore` :537-584, `toAssetRenditionRecord` + `SqlAssetRenditionRepo` :585-652,
`toTransformDefinitionRecord` + `SqlTransformDefinitionRepo` :653-719.
| New file (`packages/cms/src/media/sql/`) | Content | ~Lines |
|---|---|---|
| `repo.rows.ts` | table interfaces (`media`, `media_slug_history`, `asset_blobs`, `asset_renditions`, `transform_registry`, + the content-type store's table) and the row mappers from :1-164 | 200 |
| `slug-history.ts` | the slug-history helpers (incl. the delete at :147) and `slugLockKey` (:161), string unchanged | 60 |
| `media-repo.ts` | `SqlMediaRepo` | 330 |
| `asset-blob-repo.ts`, `content-type-store.ts`, `asset-rendition-repo.ts`, `transform-definition-repo.ts` | one class each | 60-80 each |
**ports.** `columns: ColumnCatalogPort` (required): `media-repo.ts:180` calls `listColumns(this.kernel, "media")` from
`@jini-ai/db/kernel`; the Jini class calls the injected port with the bound table name and Tovu binds
`listColumns` on the same kernel (binding test: recording fake receives the `media` table name; LESSONS 12).
`SqlMediaContentTypeStore` implements `MediaContentTypeStorePort`, imported today from the Tovu media barrel (`media-repo.ts:8`).
Step 0 resolved (su-refresh): the declaration is Tovu-only, `features/media/content-type-store.ts:34` (`getMany` + `set`),
with 10 production importers outside the facts write set (incl. `server/routes/types.ts`); Jini has a `getMany`-only subset
at `cms/widgets/host-ports.ts:29`. Smallest change: the Tovu declaration STAYS; the Jini class implements a Jini-local
`MediaContentTypeStore` interface with the same two members, declared in `media/sql/content-type-store.ts`; T1's
`npm run typecheck` proves the Tovu binding still satisfies Tovu's port. Merging the three declarations is NOT this sheet
(follow-up, recorded in the report).
**Existing deletes (move verbatim, add none):** slug-history row on slug reuse (:147), renditions of a replaced file
(:379) and of an asset (:648), the media row + its slug history on purge (:445-446, reached only through the Trash's
purge today: T0 pins the caller), a blob row (:531, blob GC is NOT enabled and stays so).
**characterization (T0).**
| Risk | Test | Mutation -> RED |
|---|---|---|
| Same bytes twice create two blobs | concurrent `insertIfAbsent` of one digest: one row; `asset_blobs:<ws>:<sha>` recorded first | remove the lock |
| Slug collision under concurrency | two saves of one slug: today's outcome pinned; the slug key recorded at each of the 5 sites (:269, :313, :353, :395, :418) | remove each lock in turn |
| Stale save overwrites a newer version | `saveIfVersion` with an old version: refused (`MediaConflictError`), row unchanged | drop the version predicate |
| Purge reachable outside the Trash | `rg` of callers of the purge method in production code equals the Trash adapter list committed in the test | - (source-list pin, reviewed) |
| Retire list widens | the retire-list read returns exactly today's set for a fixture | widen the query |
| Column probing per dialect | dialect-matrix test of the method at :180 | bind a catalog that returns no columns |
| Rendition saved for a changed source | `saveRenditionIfSource` refuses when the source version moved | drop the guard |
**wiring.** `sqlite/media-repo.sqlite.ts` (46) STAY-WIRING, same class names and constructors, so
`platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts` needs no edit (if it does: STOP, T-SQLREPO §3).

## stops
- A `selectFrom` / `deleteFrom` target that is not a literal mapped to a `tables` key (T-SQLREPO §6 command).
- A new `deleteFrom`, or a purge path reachable without the Trash adapter (T-SQLREPO §6 delete gate).
Not verified while planning: method bodies of `media-repo.ts` beyond the cited lines; the memory-repo diff (step 0 of S7a).
