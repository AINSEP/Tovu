# S2 (revision 3) — content-types and entries SQL repos -> `@jini-ai/cms/{content-types,entries}/sql`; the trash-aware memory repo

Template: T-SQLREPO rev 2. Facts: `S2-entries-content-types-sql.facts.md` (8 files, 754 lines). Three runs, serial.
Revision 2 fixes judge findings 1 (cache-invalidation contract), 6 (declared owners, entry contracts, `offset`) and 16
(the content-type binding HAS 3 production importers: it stays), and writes round-1 item 2 (S2c).
Revision 3 re-read every claim on Tovu merge-final `232764af5` / Jini `65d73b0d5`; corrections are listed in "Revision 3" at the end.

```
id: S2a-content-types-sql (~100k) -> S2b-entries-sql (~200k, cut point after J1) -> S2c-entries-trash-aware-memory (~110k)
jini_target: cms NEW ./content-types/sql and ./entries/sql (node); S2c adds one universal file under ./entries
prerequisites:
  - S0 DONE (P6, P7; `schemaErasedKernel`): `rg -n "export function schemaErasedKernel" apps/website/src/platform/db/content-kernel.ts`
  - xpkg R6-R9 landed (it owns cms's manifest in wave 1 and the `ColumnCatalogPort` precedent): `rg -n "ColumnCatalogPort" packages/cms/src/forms`
  - lost-updates: if a lost-updates sheet is scheduled on `features/entries/repo.ts` it runs first (INDEX-SU §3); then re-take facts
  - audit2 A08 (moves `features/media/access-evidence.ts`): S2b and A08 never run in the same wave; S2b works before or after it
successor_of: S1c (cms manifest), S0
```

## S2a — content types
**split.** `repo.ts` (`SqlContentTypeRepo`) MOVE; `contentTypeRepoFor` (`repo.ts:67`) is NOT moved (it takes Tovu's
`ContentKernel` and would have to bind tables and owners): T1 deletes it, its one caller
`__tests__/repo.dialects.test.ts:7,35` builds `new SqliteContentTypeRepo({ store: kernel })`, and the `repo.sqlite.ts`
header sentence "new code calls `contentTypeRepoFor`" names the class instead; `repo.rows.ts` MOVE; `repo.sqlite.ts` STAY-WIRING
(3 prod + 4 test importers); `repo.memory.ts` (17-line re-export shim, 1 dynamic test importer) DELETE, the importer
`assistant/__tests__/tool-registrations.widgets-authorization.test.ts:137` repoints to `@jini-ai/cms/content-types`;
`declared-owners.ts` **STAY-PRODUCT** (its values are the widgets constants; `features/content-types/publish-content.ts`,
`entries/unreadable-owner-entries-repair.ts` and the barrel keep importing it).
**The owner lookup is a required data port (finding 6).** Today `repo.rows.ts:10,31,51-53` calls `declaredOwnerFor` on
every read and write and lists `DECLARED_CONTENT_TYPE_OWNERS` in the refusal. In Jini:
`ContentTypeSqlRequired = { kernel; tables: { contentTypes: string; revisions: string }; declaredOwners: Readonly<Record<string, string>> }`
— data, not a callback, so the host cannot change the rule, only the table. `repo.rows.ts` exports
`contentTypeRowMapper({ declaredOwners }, _optional = {})` returning `{ toRecord, toRow, toRevisionRow, updatableColumns }`
with bodies verbatim; the lookup stays `Object.prototype.hasOwnProperty.call(declaredOwners, key)` (never `declaredOwners[key]`
alone: a type keyed `constructor` must have no owner). No default: a host that passes `{}` stores only `site`-owned types.
Tovu binding (`repo.sqlite.ts`): `declaredOwners: DECLARED_CONTENT_TYPE_OWNERS`.
**characterization (T0).**
| Risk | Test (real SQLite kernel, unmoved code) | Mutation -> RED |
|---|---|---|
| A widget type read back without its owner validates entries under the wrong namespace | save + read the widget and widget-area types: `owner` equals the declared namespace | return no owner in `toRecord` |
| Other types gain an `owner` key | a site type read back: `"owner" in record === false` | spread `owner: undefined` |
| An undeclared owner is dropped silently | `save` with `owner: "x"`: throws; message equals today's text including the `key=owner` list; no row written | remove the throw |
| Prototype keys resolve to an owner | type keys `constructor`, `toString`: no owner, save succeeds | use a plain index lookup |
| Tombstone / version / revisions | existing `__tests__/repo.dialects.test.ts` stays, repointed | - |
**wiring.** `repo.sqlite.ts`: `SqliteContentTypeRepo` keeps name and `({ store })`; `super({ kernel: schemaErasedKernel({ store }), tables: { contentTypes: "content_types", revisions: "content_type_revisions" }, declaredOwners: DECLARED_CONTENT_TYPE_OWNERS }, {})`.

## S2b — entries
**split.** `repo.ts` (`SqlEntryRepo`) MOVE; `entryRepoFor` (`repo.ts:270`) is NOT moved, as `contentTypeRepoFor` in S2a:
T1 deletes it, its one caller `__tests__/integration/repo.dialects.test.ts:13,105` builds `new SqliteEntryRepo({ store: kernel })`,
the `repo.sqlite.ts` header sentence naming it is reworded; `repo.rows.ts` MOVE; `repo.sqlite.ts` STAY-WIRING (4 prod + 7 tests).
**Contract destinations (finding 6), all landed by S2b's J1 before the class that implements them:**
| Contract (today) | Destination | Tovu after T1 |
|---|---|---|
| `TrashableEntryRecord`, `EntryPublishReadPort` (`features/entries/contracts.ts:23-34`) | NEW `packages/cms/src/entries/publish-read-port.ts`, named type exports from `./entries` | the two declarations are deleted from `contracts.ts` (the layout constants stay); importers repoint to `@jini-ai/cms/entries`: `features/entries/repo.ts:17`, `trash-aware-memory-repo.ts:2`, `features/entries/publish-content.ts:23` (today through the trash-aware repo's re-export), `features/publish-content/tovu-publish-ports.ts:24` (`EntryPublishReadPort`; the same line's `EntryListExcludingTypesPort` is already a Jini re-export and repoints with it), `server/routes/types.ts:119` (today through `repo.sqlite.ts`), `memory-deps/slices/trash-adapters-forms-widgets.ts:4`. The re-export lines `repo.sqlite.ts:5` and `trash-aware-memory-repo.ts:3` are deleted (no shell). Census: `rg -n "EntryPublishReadPort|TrashableEntryRecord" apps/website/src -g '*.ts'` |
| `CollectionListQuery.offset` (Tovu `public-list.ts:57-63` has it; Jini `widgets/resolvers/ports.ts:9-14` does not) | add `readonly offset?: number` to the Jini type (additive, changeset minor) | `public-list.ts` is not edited; its own declaration stays structurally equal (the typecheck gate proves it). Deduplicating the two declarations is not this sheet |
| `EntryDisplayListPort`, `EntryListExcludingTypesPort` | already in Jini `widgets/resolvers/ports.ts`; the class imports them type-only by leaf path | - |
**ports (required constructor fields; a missing binding is a compile error).**
1. `onWriteSettled: (event: { repo: object }) => void` — **finding 1.** Today `save` (`repo.ts:129-130`) and `transaction`
   (`:223`) call `invalidateMediaAccessEvidence({ owner: this })` in `finally`: after success AND after failure, and the
   caches are keyed by repository object identity (`features/media/access-evidence.ts:16-17,35`). The Jini class calls
   `this.onWriteSettled({ repo: this })` at the same two points, in `finally`, synchronously. Tovu binds
   `onWriteSettled: ({ repo }) => invalidateMediaAccessEvidence({ owner: repo })`. `repo` is the `SqliteEntryRepo`
   instance composition already passes as `entryRepo` to `getMediaAccessEvidenceCache`
   (`server/inbound/public-http/routes/site/media-rendition.ts:278`), so identity is preserved. No entry id is passed: a
   transaction has none. Nothing is invalidated less often than today.
2. `json: EntryJsonDialectPort` declared in `packages/cms/src/entries/sql/json-dialect-port.ts`:
   `{ scalarEquals(required: { column: Expression<unknown>; path: readonly string[]; value: string | number | boolean }): <return type of db's jsonScalarEquals>; sortKey(required: { column: Expression<unknown>; path: readonly string[] }): RawBuilder<unknown> }`.
   Tovu binds, from the SAME kernel it passes: `scalarEquals: ({ column, path, value }) => jsonScalarEquals(kernel.dialect, column, path, value)`, `sortKey: ({ column, path }) => jsonSortKey(kernel.dialect, column, path)` (`@jini-ai/db/kernel/dialect.ts:68,87` are positional `(dialect, column, path[, value])`: LESSONS 12).
**characterization (T0).**
| Risk | Test (unmoved code, real SQLite kernel, the REAL cache: `getMediaAccessEvidenceCache({ postRepo: {}, entryRepo: repo })` seeded with one entry holding a never-resolved promise) | Mutation -> RED |
|---|---|---|
| A successful entry write leaves stale access evidence | after `save`: the linked cache is empty | delete the `finally` call in `save` |
| A FAILED write leaves stale evidence (today it invalidates) | `save` refused by the slug index (trashed holder) and by a version conflict: error propagates AND the cache is empty | move the call out of `finally` |
| Transaction completion and failure | `transaction({ fn })` resolving, and rejecting: cache empty after each; nested call joins the outer transaction | delete the `finally` in `transaction` |
| Wrong owner invalidated | a second repo instance's linked cache is NOT cleared | pass a constant object as owner |
| Pagination | `listPublishedForDisplay` with `offset` 0, 1 and absent over 3 rows: exact ids | drop `.offset(...)` |
| JSON filter/sort per dialect | existing dialect-matrix tests + per helper: equality on string / number / boolean values; NULL sort keys first ascending, last descending; `id` tiebreak | swap the two helpers; drop `nullsFirst` |
| Unknown field name reaches SQL | a `where.field` failing `^\w+$` matches nothing and does not throw | remove the guard |
| Trash hidden; `findAny*` shows it; workspace scoping | trashed and live rows in two workspaces, each read method individually | drop a predicate |
| Slug held by a trashed row | create with that slug: `EntrySlugConflictError` with today's message | rethrow the raw error |
Binding tests (T1, Tovu): a recording fake of `EntryJsonDialectPort`'s targets asserts dialect, column, path and value
arrive in that order; the four cache rows above re-run through `SqliteEntryRepo` unchanged.
**wiring.** `repo.sqlite.ts`: `SqliteEntryRepo` keeps name and `({ store })`; builds `kernel = contentKernel({ store })` once
and calls `super({ kernel: schemaErasedKernel({ store: kernel }), tables: { entries: "entries", revisions: "entry_revisions" }, json: {...}, onWriteSettled: ... }, {})`.
After T1 `rg -n "(entryRepoFor|contentTypeRepoFor)\(" apps/website/src` prints nothing (merge-final: only the definitions and the two dialect tests named in the splits).

## S2c — `entries/trash-aware-memory-repo.ts` (209 lines; round-1 item 2)
Behaviour diff, done while planning: it is NOT a variant of Jini's `InMemoryEntryRepo` (which implements 2 ports and has
no Trash marker); it WRAPS it (`private readonly inner = new InMemoryEntryRepo()`, `:68`), so the Jini file imports
`../entries/repo.memory.js` by leaf path. It implements the same four list/read ports as `SqlEntryRepo` plus `findAnyById`, `findAnyBySlug`,
`saveAny`, `hardDelete`, hides trashed rows, and invalidates at four sites (`:103` after `save`, `:112` in `transaction`'s
`finally`, `:165` after `saveAny`, `:176` after `hardDelete`). It is the memory twin of the SQL repo -> MOVE as its own
class `TrashAwareInMemoryEntryRepo` to `packages/cms/src/entries/repo.trash-aware.memory.ts` (universal, named export from
`./entries`), constructor gains the same required `onWriteSettled`; the four call sites keep their exact position (three
are NOT in `finally`: do not "harmonise" them). T0 pins each site with the real linked cache (as S2b) and runs S2b's
read/trash/slug rows against this class too (one contract table, two adapters). Tovu keeps no file: its 2 prod importers
construct the Jini class with the same binding expression as `repo.sqlite.ts`. Why-comments move.
**Importers (revision 3; the facts file lists 5 production importers, not 2).** The only construction is
`server/runtime/composition/memory-deps/slices/repos.ts:41` (`new TrashAwareInMemoryEntryRepo()` today, no argument; it gains
`{ onWriteSettled: ({ repo }) => invalidateMediaAccessEvidence({ owner: repo }) }`). Type-only, repointed to `@jini-ai/cms/entries`:
`memory-deps/slices/comments.ts:13`, `memory-deps/slices/memory-trash.ts:18`, `memory-deps/slices/trash-adapters-forms-widgets.ts:4`,
`features/entries/publish-content.ts:23`. The class imports `CollectionListQuery` / `CollectionSortBy` from Tovu
`./public-list.js` (`:6`): in Jini it takes `CollectionListQuery` from `../widgets/resolvers/ports.js` (type-only; it has
`offset` after S2b) and writes the sort type as `CollectionListQuery["sort"]["by"]` (Jini declares no `CollectionSortBy`);
`EntrySlugConflictError` / `VersionConflictError` come from `./errors.js` (`packages/cms/src/entries/errors.ts:48,56`).
STOP if `pnpm guard` reports an import cycle for `entries` <-> `widgets/resolvers` (that file already imports `entries/index.js` types).
**stop:** the memory class diverges from the SQL class on a row of the shared table: report the row, move nothing.

## commits / gates / stops
Each run: T0 -> J1 -> T1 with the gates of T-SQLREPO §5. S2a's tree after T1 compiles alone (entries still imports
Tovu's content-type barrel). S2b's J1 adds contracts, the `offset` field, the adapter, the export entry, in one commit.
- STOP if `features/media/access-evidence.ts` no longer exports `invalidateMediaAccessEvidence({ owner })` (A08 changed its shape): `rg -n "export function invalidateMediaAccessEvidence\(\{ owner \}" apps/website/src packages -g '!**/node_modules/**'` in both repos; re-plan the binding line only.
- STOP if a cms file would import `@jini-ai/db`: `rg -n "@jini-ai/db" packages/cms/src/{entries,content-types}`.
Not verified while planning: per-method sizes inside the two classes (the eslint gate measures them; `SqlEntryRepo` is one
272-line file, well under 500).

## Revision 3 (re-read on merge-final, R4-5)
Checked and correct: `repo.rows.ts:10,31,51-53` + `declared-owners.ts:25-27` (already `hasOwnProperty`); `entries/repo.ts:129-130,223`;
`access-evidence.ts:16-17,35` and the STOP pattern matches line 35; `media-rendition.ts:278`; `contracts.ts:23-34`;
`public-list.ts:57-63` has `offset`, Jini `widgets/resolvers/ports.ts:9-14` does not; Jini `db/src/kernel/dialect.ts:68,87`;
the four S2c invalidation sites `:103,112,165,176`; `repo.memory.ts:137` dynamic importer.
Corrected: (1) `contentTypeRepoFor` / `entryRepoFor` were listed as MOVE but only dialect tests call them: not moved, deleted,
callers named. (2) `EntryPublishReadPort` importer `type-registry.ts` does not exist as such: it is `tovu-publish-ports.ts:24`;
the full importer list and a census are now in the table; `repo.sqlite.ts` re-export is line 5, not 4. (3) S2c had "2 prod
importers": there are 5 (1 construction, 4 type-only), now listed; its `public-list.js` and error imports get Jini sources.
