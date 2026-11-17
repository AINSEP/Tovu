# G2: `@jini-ai/cms/entries/sql` (tables, repo, text + cursor) and no-op outbox ports

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/gap-g2-entries-sql`. Estimate: ~130k Sonnet.
Owner: `@jini-ai/cms`. Prerequisites: OD-N3 = yes; N1 merged. Closes G2, G3(a), G17.

## Inventory

```sh
ls packages/cms/src/forms/sql && sed -n 1,70p packages/cms/src/forms/sql/create-tables.ts    # the precedent: kernel typing, table-name injection, dialect handling
rg -n "@jini-ai/db" packages/cms/src/forms/sql -g '!**/__tests__/**'                         # must be empty or type-only via a local port; report what you find
rg -n "interface EntryRepoPort" -A 30 packages/cms/src/entries/write-service.ts
rg -n "interface EntryListPort" -A 16 packages/cms/src/entries/list.ts
sed -n 1,80p packages/cms/src/entries/repo.memory.ts                                         # reference semantics incl. appendRevision and save(row, { expectedVersion })
cat examples/notes-app/src/notes-repo.ts examples/notes-app/src/db.ts | head -140
rg -n "discardOutbox|noopDispatcher|FormOutboxPort|OutboxDispatcherPort" packages/cms/src -g '!**/__tests__/**' | head
# Tovu callers that would see an additive option:
rg -n "listByWorkspace\(" ../Tovu/apps ../Tovu/packages -g '!**/__tests__/**' | head -20
```

## Target (additive only; nothing existing changes shape)

| Surface | Detail |
|---|---|
| `./entries/sql`: `createEntriesTables({ kernel, tables }, optional = {})` | `tables = { entries, revisions }` (host-chosen names). Columns: one typed row per `EntryRecord` field that is filtered or ordered (`id`, `workspace_id`, `type`, `slug`, `status`, `title`, `version`, `updated_at`, `created_at`), the JSON payloads as text/jsonb per dialect, unique `(workspace_id, type, slug)`. Revisions table: `(entry_id, version)` unique + payload. SQLite and Postgres, same as forms. Derived identifier longer than 63 bytes on Postgres -> throw (review finding 7). |
| `entryRepoFor({ kernel, tables }, optional = {}): EntryRepoPort & EntryListPort` | Same observable behaviour as `InMemoryEntryRepo`, incl. `save` compare-and-set throwing `entryVersionConflictError`, `appendRevision` persisted, `transaction`. |
| `EntryListPort.listByWorkspace` optional args gain `text?: string` and `cursor?: string`; result gains `nextCursor?: string \| null` only if the port's result type can take it additively | `text`: case-insensitive substring on title and body text, parameterised (`LIKE … ESCAPE`), `%` and `_` in user input escaped. Explicit absence check (`text === undefined`), not truthiness: `''` means "no filter" by an explicit branch (lesson 20). Cursor = opaque `(updated_at, id)` keyset. `InMemoryEntryRepo` implements both. |
| Kernel typing | a **domain-local structural port** in `entries/sql/kernel-port.ts` (only the members used); no import of `@jini-ai/db` in non-test source. |
| `@jini-ai/cms/forms`: `discardFormOutbox`, `noopOutboxDispatcher` | exported constants (G17). |

Existing databases: none in Jini; Tovu keeps its own repo, so no data migration is in scope. State in the
changeset that the schema is new and not Tovu's.

## Tests first

1. **One contract suite** `entries/__tests__/support/entry-repo.contract.ts` run against `InMemoryEntryRepo`,
   SQLite (`better-sqlite3`) and PGlite (existing devDeps of cms; see how `forms/__tests__/repo.dialects.test.ts`
   builds its matrix): find by id/slug, workspace isolation (wrong workspace -> null), CAS conflict
   (expected vs found), revision appended per save inside the same transaction, rollback leaves neither row nor
   revision, list ordering with an equal-`updated_at` tie (stated order), `limit-1/limit/limit+1`.
   Broken-adapter self-test: a wrapper that ignores `expectedVersion`, one that drops the workspace filter,
   one that skips the revision: each must make the suite fail (AP12).
2. Text: 3+ rows, match first/middle/last; `%`, `_`, `\` in the query match literally; `''` and
   whitespace-only return everything; cursor walks all rows exactly once under inserts between pages.
3. `create-tables` : idempotent second call; an **independent** expected schema literal compared with
   `PRAGMA table_info` / `information_schema` (do not derive the expectation from the DDL builder: review
   finding 3); 64-byte derived name on Postgres throws the named error.

## Steps (commit each)

1. Contract suite + `InMemoryEntryRepo` passing it (plus `text`/`cursor` there). 2. `createEntriesTables`.
3. `entryRepoFor`. 4. `exports` entry `./entries/sql` (+ optional peers `kysely` as forms has) and the two
   no-op ports; changeset `@jini-ai/cms` minor; update the comment at `entries/index.ts:99`.
5. notes-app: `db.ts` uses `createEntriesTables`, `notes-repo.ts` deleted, `ports.ts` uses the exported
   no-ops, `gaps/note-search.ts` deleted (the entity port passes `search` to `listByWorkspace({ text })` and
   forwards `cursor`). **Data note:** the example's old `p_notes_app__entries` table is not migrated; the
   README says to delete `./data/notes.db` (example data only). `GAPS.json` rows removed.

## Acceptance

cms gates (test count up, none removed); Jini repo gates (`check:cross-package`: no cms -> db edge added);
Tovu typecheck linked (the optional args are additive: zero Tovu edits expected; if any is needed, STOP);
notes-app gates, `smoke.ts` restart proof, N5 e2e unchanged. Deletion ledger: `notes-repo.ts` 58,
`note-search.ts`, the data-module block of `db.ts`.

## Not verified by the planner

`EntryRepoPort`/`EntryListPort` full signatures; whether `listByWorkspace`'s return type allows an additive
`nextCursor`; how forms' dialect matrix obtains PGlite; whether Tovu's repo implements `EntryListPort`
structurally in a way an added optional arg could break under `exactOptionalPropertyTypes`.
