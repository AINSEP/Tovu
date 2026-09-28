# ADR-067: Site Storage Choice

- Status: ACCEPTED
- Date: 2026-09-28
- Author: Claude Opus 5.5 / Leona Burime (owner decision O3 and the `ai_chat` schema, 2026-09-28)
- Relates: ADR-066 (Kysely query layer, one migration history), ADR-041 (ops journal), ADR-023 (plugin data
  modules), ADR-058 (site-key sealing), ADR-011/012 (install-dir compatibility surface). Plan:
  `ADS-memory/.local-artifacts/plans/2026-09-28-r1-plan.md` (§0 target shape, §6 owner decisions).

## Context

ADR-066 made every repo one Kysely body over the storage kernel, so the same content model can run on
SQLite, PGlite (embedded Postgres) or Postgres/Supabase. A site still needs a durable, per-site answer
to "which engine holds my data", readable before anything opens a database, and it must not break the
sites that exist today: every one of them is SQLite, and the dev site's `.site-meta.json` is partial
(only `siteKeyId`/`siteKeyFingerprint`). A throwaway `TOVU_CONTENT_STORE=pglite` env switch (posts only,
process-wide) proved PGlite could serve the post repo; it is deleted by this decision.

## Decision

1. **The choice lives in `.site-meta.json` as an optional `storage` field** (`platform/site-dir/types.ts`
   `SiteStorage`):
   ```
   storage?: { kind: "sqlite" }
           | { kind: "pglite" }                                  // data dir <site>/pglite/
           | { kind: "postgres", secretRef: "site" | { env: string } }
   ```
   Absent means `{ kind: "sqlite" }`. It is read only through `resolveSiteStorage(siteDir | ":memory:")`
   (`platform/site-dir/site-storage.ts`), which is lenient about a missing or partial meta file (SQLite)
   and strict about a present but wrong `storage` (`SiteDirInvalidError`): guessing SQLite for a site that
   asked for Postgres would boot an empty store in its place. `readSiteDir` validates the same field.
   New sites record `{ kind: "sqlite" }` explicitly; a duplicate keeps its source's kind.

2. **Secret placement (owner decision O3).** A Postgres connection string is never written into
   `.site-meta.json` — the validator refuses `connectionString`/`url`/`password` keys there.
   `secretRef: "site"` means the string is sealed with the site key (ADR-058) in the site folder;
   `secretRef: { env: "NAME" }` means it is read from that environment variable (servers, containers).
   The env override exists so a deployment can inject the secret without writing it to disk.

3. **One store opener, one composition body.** `openSiteStore(storage, paths, role)`
   (`server/runtime/composition/open-site-store.ts`) returns `{ content: ContentKernel, chat: ChatKernel,
   sqliteDb?, close }`. `createSiteRouteDeps` resolves the storage, opens the store, and builds every repo
   from the two kernels. The services that need the SQLite handle or file itself (restore-point file
   copies, the synchronous watermark stamp, the Drizzle-only transfer-destination repo) are grouped in
   ONE function, `sqliteOnlyServices` (`sqlite-only-services.ts`), called on the SQLite branch; the
   PGlite/Postgres branch supplies a twin with the same shape. The body never branches on the engine.
   Until that branch lands (R1 slice R1f) `pglite`/`postgres` are refused with `StorageNotAvailableError`
   before anything is created.

4. **AI chat tables on PGlite/Postgres live in their own Postgres schema, `ai_chat`** (owner decision,
   2026-09-28). Underscore, and not `chat`, so it is never confused with human-to-human chat. Same
   database / data dir as content (one instance, one move); content stays in `public`. The chat DDL,
   `CHAT_MIGRATIONS` and the `tovu_chat_migrations` ledger live inside `ai_chat`. Publishing and copying
   can include or exclude `ai_chat` separately. On SQLite, chat stays the separate `chat.db` file.

5. **The journal stays SQLite on every storage.** `ops/database-journal.db` (ADR-041: migration runs,
   ledger, restore-point index) is a local operational record of this install, not site content; it is
   never moved to PGlite/Postgres (`journal-kernel.ts` header).

6. **One owner per PGlite data dir.** Only one process may open a PGlite data dir. The site's API
   process owns `<site>/pglite/` and serves it on a Unix socket; the API process and the agent daemon
   both reach it as socket clients (`SiteStoreRole` `owner`/`client`). Code that may run on PGlite follows
   the kernel rules: no session `SET` (only `SET LOCAL`), no temp tables, no named prepared statements,
   no session advisory locks, short transactions. A second process opening the dir directly is a bug.

7. **Retention runs in the owner.** The hourly guest-chat expiry sweep (`startChatExpirySweep`) starts in
   the API process's composition, on the chat kernel; the agent daemon does not run a second one.

## Consequences

- Every existing site boots unchanged: no `storage` field is SQLite, and the dev site's partial meta
  file is covered by a test with exactly its shape.
- **Durability note (PGlite):** PGlite's fsync is a no-op under Node, so a committed transaction survives
  a process crash but not an OS crash or power loss. This must be written in the user-facing docs and
  accepted by the owner before PGlite is offered outside the CLI flag / meta file (it stays hidden from
  admin screens until then). SQLite and Postgres keep their normal durability.
- Features that are SQLite-only today (restore points as whole-file copies; the Jini watermark stamp until
  O2 lands) must report a capability on the other engines, never a 500; `sqliteOnlyServices`' pg twin is
  where that is decided. Post search already has a pg projection beside FTS5.
- The `TOVU_CONTENT_STORE` / `TOVU_PGLITE_DIR` switch and its prototype files are gone; data dirs it
  created are refused by the Postgres baseline step (a schema with tables but no ledger) and must be
  recreated.

## Alternatives rejected

- **An environment variable per process** (the prototype): process-wide, not per site, invisible in the
  site folder, and wrong for the desktop app running several sites.
- **Connection string in the meta file in plain text:** the site folder is copied, zipped and published;
  a secret there leaks with it (O3).
- **Two composition bodies (SQLite and Postgres):** 1300+ lines each drift; the kernel makes one body
  possible, so the only per-engine code is the opener and the `sqliteOnlyServices` seam.
