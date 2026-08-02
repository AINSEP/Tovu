# `infra/`

Everything the running site keeps on disk — and nothing else. No source, no build artifacts.

| | Tracked in git? | Rebuildable? |
|---|---|---|
| `content.db*`, `ops/`, `uploads/`, snapshots, restore points | **no** — gitignored | **no.** This is real data. |
| this `README.md` | **yes** — the only tracked file here | n/a |

Deleting any of the data destroys local content.

The drizzle configs used to live here. They moved to `src/db/` on 2026-08-02, next to the schema
they read and the migrations they emit; this folder is data only now. The README stays tracked for
two reasons: it documents the data, and it guarantees the directory exists in a fresh clone —
`openContentDb` calls `new Database(path)` without creating the parent, so an absent `infra/` fails
boot with `SQLITE_CANTOPEN`.

---

## The database

```
content.db          the site's content: entries, pages, media rows, users, settings, chat history
content.db-wal      SQLite write-ahead log — pending writes not yet folded into the main file
content.db-shm      shared-memory index for the WAL
```

**The three are one database.** Copy, move, or back them up together — a `content.db` separated from a
non-empty `-wal` is missing its most recent writes. (SQLite will not silently corrupt in that case:
the WAL header carries a salt tied to the exact main-file version it was written against, so a
mismatched sidecar is detected and discarded. You lose the writes, you don't get a broken file.)

A clean shutdown checkpoints the WAL back into `content.db` and leaves it at 0 bytes. A large `-wal`
just means the process was killed rather than stopped.

## Why everything else is here too

One line in `src/server/deps.ts` decides this:

```ts
export function defaultContentDbPath(): string {
  return process.env.TOVU_CONTENT_DB ?? join("infra", "content.db");
}
```

Almost everything else derives its own location from `dirname(contentDbPath)`, so it follows the
database automatically and cannot be relocated independently:

- `ops/` — `deps.ts` resolves it as `<dirname(content.db)>/ops`
- `content.db.snapshot-<plugin>-<ts>` — `features/plugins/snapshot.ts`
- `restore-point-<scope>-wm<n>-<ts>.db` — `db/postgres/db-ops.ts` and its SQLite counterpart

**`uploads/` is the exception.** It resolves from `process.cwd()`, not from the database path, so it
is the one directory that has to be moved deliberately. If you ever relocate this folder, that's the
line that will be forgotten.

Until 2026-08-02 the default was the bare working directory, which made the repo root itself the
site folder — that's why `content.db`, `ops/`, `uploads/`, snapshots and restore points were all
scattered across it. Naming a subdirectory changed nothing architectural: a real deployment still
passes its own install dir, and `TOVU_CONTENT_DB` / `TOVU_MEDIA_UPLOADS_DIR` still override.

## `ops/` — sidecar journals

Physically separate SQLite files, deliberately not tables inside `content.db` (ADR-041 §2): they
must stay readable and writable when `content.db` is being swapped out from under the process during
a restore.

- **`database-journal.db`** — live. Holds the database ledger and the `restore_points` table.
- **`storage-journal.db`** — **almost certainly dead.** Superseded by the rename in
  `0001_rename_storage_ledger_to_database_ledger.sql`; the only mention of it left in `src/` is a
  stale comment. Left in place rather than deleted because it is 57 KB and nobody has proven it
  unreachable. Verify before removing.

## `uploads/`

Blob bytes written by `LocalFsBlobStore`, keyed by workspace (`ws/<workspace>/…`). The `media_asset`
rows in `content.db` point at these files, so the two are only meaningful together — deleting
`uploads/` leaves rows referencing files that no longer exist, which surfaces as broken media in the
admin rather than as an error.

## The drizzle configs (moved)

They now live at `src/db/drizzle.config.ts` and `src/db/drizzle.database-journal.config.ts`,
alongside the schema they read and the migrations they emit — none of which were ever in this
folder:

```bash
npm run db:generate                   # src/db/schema.ts                        → src/db/drizzle/
npm run db:generate:database-journal  # src/db/sqlite/database-journal-schema.ts → src/db/drizzle-database-journal/
```

Both are still invoked from the repo root, so their `schema`/`out` paths stay repo-relative rather
than relative to the config's own directory — which is why a config sitting in `src/db/` reads
`./src/db/schema.ts`. That is drizzle-kit resolving against CWD, not a mistake.

## Files you may find here that are safe to delete

- **`content.db.snapshot-*`** — a whole-database copy taken before a plugin's DDL (ADR-023 §4). A
  *committed* migration now deletes its own snapshot, so any that survive belong to a **failed** one
  and are its named recovery point. Read the failure before deleting.
- **`restore-point-*.db`** — captured restore points. Check `restore_points` in
  `ops/database-journal.db` before deleting: a row whose `artifact_ref` names the file is a restore
  point the Recovery screen still offers. (Known defect as of 2026-08-02: capture writes an **empty**
  `artifact_ref`, so rows and files are not actually linked and every `migrate-forward` leaves an
  orphan. Until that's fixed, an orphaned file here is expected rather than surprising.)
