# Scoping: split AI chat data out of `content.db`

Persona: Software Architect (`AI-Dev-Shop/agents/software-architect/skills.md` loaded, confirmed
at top per dispatch instruction).

Read-only scoping task. No production code changed, no tests written or run, no test/build/tsc
commands executed. No ADR produced (house rule: thin slice before ADR). `sites/**` was never
opened, copied, or probed.

## The decision (verbatim from the owner)

> "we need to basically have two databases, one for chat, the AI, one for actual site content...
> I don't think that should be too big... we just don't push the AI chat or maybe we have the
> option to, but we don't push it by default."

## Verdict up front

**"Not too big" holds for the wiring change itself, and is smaller than it looks** — this
codebase already has a working precedent for exactly this shape (see "Existing precedent" below).
**It does NOT hold if the scope silently includes migrating live production chat data
(`sites/tovu-com/content.db`, ~44MB, 96% chat) or building the not-yet-existing "push/don't push"
consumer.** Those are real, separate pieces of work. See Blockers.

---

## 1. Table inventory

### Chat/AI-owned (3 tables, NONE have a `sqliteTable` Drizzle declaration)

| Table | Source | Owner | Notes |
|---|---|---|---|
| `ai_chats` | `apps/website/src/platform/db/drizzle/0023_ai_chat_history.sql:39-56` | `@jini-ai/sqlite`'s `CHAT_HISTORY_DDL`, copied verbatim | conversation header: scope_id, owner, title |
| `ai_chat_messages` | same file, `:58-77` | same | FK `conversation_id -> ai_chats(id) ON DELETE CASCADE`; `events_json` is documented as 96% of live `content.db` bytes (`development/scripts/seed-site.mjs:8-9`) |
| `assistant_agent_sessions` | `apps/website/src/platform/db/drizzle/0051_assistant_agent_sessions.sql:24-30` | Tovu-owned, NOT Jini | FK `conversation_id -> ai_chats(id) ON DELETE CASCADE`; per-(conversation,agent) CLI session-resume id, read/written only via raw prepared statements in `apps/website/src/assistant/persistence/agent-session-store.ts:56-65` |

These three are the exact set independently re-verified against the prior finding in
`reference_three_raw_sql_tables_invisible_to_copy_order.md` (2 days old) — still accurate. They
are invisible to `collectCoreTables()` (`apps/website/src/platform/db/migration/manifest.ts:71,94`,
filters on `Symbol.for("drizzle:IsDrizzleTable")`) and therefore to `computeCoreTableCopyOrder()`
(`manifest.ts:783-784`) and every Postgres-migration classification. They are hand-registered with
rationale in `RAW_SQL_MANAGED_TABLES` in
`apps/website/src/platform/db/__tests__/schema-migration-drift.test.ts:134-138`, which excuses them
from the schema↔migration drift guard but does not close the copy-order gap.

**No other table joins to or FKs into these three.** Verified: `agent_tool_attempts`
(`schema.ts:1395-1413`, the one Drizzle-declared table that looks chat-adjacent — it logs
agent/tool invocations) has its own `run_id`/`attempt_id`/`workspace_id` and no `conversation_id`
column at all; grepping the whole `apps/website/src` tree for `ai_chats`/`ai_chat_messages` finds
only doc-comment prose (warnings not to paste secrets into chat) and the one real wiring site in
`deps.ts` — no other query joins across the chat/content boundary. **This means the split has no
cross-database JOIN or FK to design around** — the single sharp edge is
`assistant_agent_sessions.conversation_id -> ai_chats.id`, which is chat-to-chat, not
chat-to-content.

### Content-owned

Everything else in `schema.ts` (~80 `sqliteTable` declarations at `apps/website/src/platform/db/schema.ts` — full list via `grep -n "sqliteTable(" schema.ts`): `posts`, `workspaces`, `menus`, `members*`, `settings*`, `redirects*`, `identity*` (principals/sessions/roles/policies/apiKeys), `contentTypes`/`entries`+revisions, `media`/`assetBlobs`/`assetRenditions`, all `*CredentialSets`/`*Credentials` (publish, source-control, vendor, media-provider, custom, admin-execution, site-assistant), `composio*`, `externalMcpServers`, `commerce*`, `deployment*`/`releases`, `webhookSubscriptions`/`webhookDeliveries`, `databaseWriteWatermark`. All durable/low-write, all genuinely site content or site configuration.

### Ambiguous

- **`agent_tool_attempts`** (`schema.ts:1395-1413`) — an append-only audit log of agent tool
  invocations, `workspace_id`-scoped. Not chat conversation data (no `conversation_id`), but
  unbounded/high-write like chat, and `seed-site.mjs`'s `PRUNE_TABLES` already groups it with the
  operational/audit-log category (not the "dev chat transcripts" category — see
  `development/scripts/seed-site.mjs:56-61`) rather than with the three chat tables. **Recommend
  leaving it in `content.db`** for the thin slice — it is workspace audit trail, not "AI chat," and
  splitting it is not required by any of the five acceptance criteria. Flag it for the owner as a
  candidate for a later pass if "chat db" is meant more broadly as "everything AI-generated."
- **`siteAssistantCredentials`** (`schema.ts:1433-1504`) and **`adminExecutionCredentials`** —
  per-workspace assistant *configuration* (provider, sealed API key), not conversation data. Low-write,
  durable. Stays in `content.db`.

---

## 2. `content.db` open/creation seam — ONE chokepoint

`apps/website/src/platform/db/sqlite/content-db.ts` is the only place `content.db` is opened:

- `openContentDb(filePath, seed?, recover?)` (`content-db.ts:73-89`) — creates/opens, sets pragmas
  (WAL, `foreign_keys = ON`, `busy_timeout = 5000`), runs `migrate(db, { migrationsFolder:
  MIGRATIONS_DIR })` (`:85`, `MIGRATIONS_DIR` at `:46` = `../drizzle`), ensures the watermark row,
  optionally seeds.
- `openContentDbReadOnly(filePath)` (`:110-114`) — read-only variant, no migrate, used only by
  offline scripts.

Both are called from exactly one place in the running server:
`apps/website/src/server/runtime/composition/deps.ts`'s `resolveOrOpenContentDb()`
(`deps.ts:547-562`), itself called once from `createSqliteRouteDeps()` (`deps.ts:657-674`). Every
downstream repo/adapter in that ~1500-line composition function is handed either the typed
`ContentDb` (Drizzle handle) or its raw `.$client` (the underlying `better-sqlite3.Database`).

**The chat wiring is exactly two lines inside that one function:**
- `deps.ts:1159` — `chatHistory: createChatStoreFactory(db.$client)`
- `deps.ts:1162` — `agentSessions: createSqliteAgentSessionStore(db.$client)`

Both pass the SAME raw handle as everything else — there is no separate chat connection today.
`createChatStoreFactory` / `createInMemoryChatStoreFactory`
(`apps/website/src/assistant/persistence/store-factory.ts:23-52`) are themselves DB-path-agnostic:
the factory takes a `better-sqlite3.Database` and does not care which file it came from. This is
the seam a second database threads through with the least code change — **a one-file, two-line
edit** (see thin slice below), not a refactor of the ~80-table composition root.

**Verdict: one chokepoint**, not many. The 1500-line size of `deps.ts` looks alarming but almost
none of it touches chat; the chat surface is isolated to those two call sites plus the two
persistence files listed above.

---

## 3. Migration story

`content.db`'s migration story is: one `schema.ts`, one `drizzle/` folder (58 migrations,
`0000`–`0057`), one `drizzle.config.ts`, one `migrate()` call at `content-db.ts:85`. A
schema↔migration drift guard (`schema-migration-drift.test.ts`, commit `45400a0f` per prior
finding) enforces that every `sqliteTable` in `schema.ts` has a matching migration and vice versa —
**editing `schema.ts` without a paired migration breaks every query on save**, per that guard; this
constrains the slice to never touch `schema.ts` for the chat tables (they were never declared there
to begin with, so this is a non-issue for them specifically).

### Existing precedent for a second SQLite file — already shipped

Tovu already runs a **second, physically separate SQLite database** alongside `content.db`:
`ops/database-journal.db`, with its own:
- schema: `apps/website/src/platform/db/sqlite/database-journal-schema.ts`
- migrations folder: `apps/website/src/platform/db/drizzle-database-journal/` (2 migrations)
- config: `apps/website/src/platform/db/drizzle.database-journal.config.ts`
- open function: `openDatabaseJournalDb(filePath)` in
  `apps/website/src/platform/db/sqlite/database-journal-db.ts:40-47` — same shape as
  `openContentDb`, own `migrate()` call, own `MIGRATIONS_DIR`.

Its own file header states the reason it is physically separate: *"a physically separate file from
content.db, so that restoring content.db from a snapshot never erases the incident record
describing that very restore"* (`database-journal-db.ts:16-18`). **This is the exact same shape of
problem as criterion 2** (restore points shouldn't erase chat). The codebase already solved this
class of problem once, and the composition root already opens two DBs side by side
(`deps.ts` wires both `content.db` and `ops/database-journal.db`). A chat DB is a third instance of
a pattern that already exists twice.

### Would a chat DB need its own migrations folder / drizzle config / `__drizzle_migrations` table?

Only if the tables are declared in Drizzle. **They don't have to be.** `ai_chats`/`ai_chat_messages`
are already maintained by `@jini-ai/sqlite`'s own `ensureChatHistoryTables(db)` function — Tovu
already calls this directly for the in-memory test path
(`store-factory.ts:39-52`, `createInMemoryChatStoreFactory`). The ONLY reason migration
`0023`'s header gives for NOT calling `ensureChatHistoryTables` against a real file today is: *"a
second migrator against content.db would write DDL behind Tovu's snapshot/backup tooling... One
database, one migrator"* (`0023_ai_chat_history.sql:16-21`). **That objection is specifically about
sharing `content.db` — it does not apply to a dedicated chat file.** So the smallest version of
this slice does not need a new Drizzle schema file, a new migrations folder, or a new drizzle
config at all: `openChatDb(filePath)` can open the file, set pragmas, and call
`ensureChatHistoryTables(sqlite)` directly — mirroring `createInMemoryChatStoreFactory`'s existing
code, just against a persisted path instead of `:memory:`. `assistant_agent_sessions` (Tovu-owned,
not from Jini) is one `CREATE TABLE IF NOT EXISTS` statement (`0051_assistant_agent_sessions.sql:24-30`)
that would need to be run the same way (an inline bootstrap, not a generated Drizzle migration).

This avoids reproducing the `__drizzle_migrations` bookkeeping table and drift-guard machinery for
a schema that will churn slowly. If DDL evolves later, promoting to a real Drizzle
schema+migrations pair (matching `database-journal.db`'s pattern exactly) is the natural next step
— left as a followup, not required for the thin slice.

---

## 4. The four at-risk consumers

### Restore-point machinery — CONFIRMED whole-file copy, and the split fixes it for free

`apps/website/src/platform/db/sqlite/db-ops.ts:33-88` (`SqliteDbOpsAdapter`) wraps
`@jini-ai/infra/db/sqlite`'s `InfraSqliteDbOpsAdapter`. `captureRestorePoint`
(`db-ops.ts:68-72`, doc at `:62-65`) is explicitly documented: *"Captures a whole-file online-backup
copy of `content.db` (never a partial/logical export, AC-30)"* — SQLite's Online Backup API,
page-by-page, `@complexity O(db size)`. There is no table-level filtering possible at this layer;
it is a physical file backup.

**Consequence: a restore point cannot selectively exclude chat rows while chat lives inside
`content.db`.** But once chat data lives in a physically separate file, a restore-point capture
scoped to `content.db`'s path automatically excludes it — no code change needed in `db-ops.ts`
itself. This is the single strongest argument for a *file-level* split over a *row-tagging* or
*logical-export* approach (see rejected alternatives).

### `duplicateSite` — CONFIRMED ABSENT, independently reverified

`command grep -rn "duplicateSite" apps/website apps/admin apps/desktop` returns **zero hits**,
including test files. This independently reconfirms the prior audit. **There is no site-duplication
feature to scope a chat-exclusion behavior into yet.** Criterion 1 ("duplicating a site shouldn't
clone its chat history") is currently a requirement on a consumer that does not exist — it cannot
be satisfied or violated today because there is nothing to test it against. This is a real gap: if
this ships as "scoped and done," nothing yet enforces criterion 1. See Blockers.

### Static export (`site-exporter.ts`) — CONFIRMED unaffected, needs no change

`apps/website/src/platform/export/site-exporter.ts` never imports `content-db.ts`, `schema.ts`, or
any repo/`ContentDb` type at all (verified via import grep — its imports are `node:http`,
`resolvePathWithin`, `resolveThemeLayout`, `buildRouteManifest`, and route-manifest/ports types).
It boots an in-process HTTP server via `RouteDeps.createSiteApp()` and crawls rendered routes over
HTTP (`site-exporter.ts:29-41` doc). It reaches content only through the same route handlers a
real visitor would hit — never a raw DB query. **Criterion 5 already holds today, structurally, with
zero coupling to fix.** The split does not touch this file.

### Seed / `content.seed.db` flow — CONFIRMED, and already does the split's job manually

`development/scripts/seed-site.mjs` already **explicitly prunes** `ai_chat_messages`,
`assistant_agent_sessions`, and `ai_chats` from the pruned/VACUUMed `content.seed.db` it produces
(`PRUNE_TABLES`, `seed-site.mjs:48-53`), with the comment noting these were **96% of the live
db's bytes** on the day it was measured (`:8-9`). `hydrateContentDbFromSeed()`
(`apps/website/src/platform/db/sqlite/hydrate-content-db-from-seed.ts:95-116`) is the first-boot
copy of that seed into a fresh site's `content.db` — it is a dumb file copy with no table
awareness, so it inherits whatever the seed already excluded.

**This means the "don't ship chat by default" behavior for FIRST BOOT already exists**, achieved by
a hand-maintained exclusion list rather than a physical split. After the split, this exclusion list
entry becomes unnecessary (those three names can be deleted from `PRUNE_TABLES` since the tables
would no longer exist in `content.db` at all) — a simplification, not new work.

---

## 5. The "don't push chat by default, with an option to" surface

**No such seam exists today**, because there is no mechanism that "pushes" a site's data anywhere
by default in the first place:
- Fly/deploy (`apps/website/src/features/deployments/deploy-config-fly.ts`) mounts `sites/` as a
  persistent **volume** (`Dockerfile:175-184`) — the running container's `content.db` lives on that
  volume across deploys; a `fly deploy` ships code/image, not a fresh copy of site data. The
  Dockerfile's only data-shipping step is the pruned `content.seed.db` copied to
  `dist/content/seed-sites/` (`Dockerfile:92-98`), consumed only on a volume's very first boot.
- There is no `duplicateSite` (see above) and no other "export/copy this site's data" admin action
  found in `apps/website/src/features/deployments/` beyond static-site export (which, per above,
  doesn't touch the DB at all).

**So "push" in the owner's sentence most plausibly refers to whichever future mechanism ends up
copying `content.db` wholesale** — restore points (today) and site duplication (once built) being
the two concrete candidates already named in the acceptance criteria. **An "include chats" flag has
no home yet** because its target consumer doesn't exist. The nearest existing precedent for a
per-table include/exclude toggle is `seed-site.mjs`'s `PRUNE_TABLES` array — a hand-maintained
allowlist, not a runtime flag, and it runs at dev-time seed-authoring, not at
publish/duplicate/restore time.

**Recommendation:** don't build the flag yet. Build the physical split (below); the flag becomes a
one-line decision (skip vs. don't-skip opening `chat.db`, or skip vs. don't-skip copying its file)
once there is an actual copy operation to gate.

---

## 6. Recommended thin slice

**Physically separate the chat data into its own SQLite file, reusing the exact pattern
`ops/database-journal.db` already established**, without migrating any existing production rows
and without building the include/exclude flag (no consumer exists to gate yet).

### What it touches (estimate: ~120–180 new/changed lines across 5 files, no `schema.ts` change)

1. **New file** `apps/website/src/platform/db/sqlite/chat-db.ts` (~40 lines) — `openChatDb(filePath)`:
   open `better-sqlite3`, set `journal_mode = WAL` / `foreign_keys = ON` / `busy_timeout = 5000`
   (mirroring `content-db.ts:76-82`), call `ensureChatHistoryTables(sqlite)` (from `@jini-ai/sqlite`,
   already a Tovu dependency per `store-factory.ts:1-2`), then run the one
   `CREATE TABLE IF NOT EXISTS assistant_agent_sessions ...` statement inline (copied from
   `0051_assistant_agent_sessions.sql:24-30`) since it isn't Jini's to provide.
2. **`deps.ts`** (~15 lines) — add `defaultChatDbPath()` mirroring `defaultDatabaseJournalDbPath()`
   (`deps.ts:455-457`, itself mirroring `defaultContentDbPath()` at `:436-446`) —
   `<dirname of content.db>/chat.db`, overridable via a new `TOVU_CHAT_DB` env var. Open it once in
   `createSqliteRouteDeps()` next to the existing `resolveOrOpenContentDb()` call. Change the two
   wiring lines:
   - `deps.ts:1159` `createChatStoreFactory(db.$client)` → `createChatStoreFactory(chatDb)`
   - `deps.ts:1162` `createSqliteAgentSessionStore(db.$client)` → `createSqliteAgentSessionStore(chatDb)`
3. **`server/app.ts`** (~0 lines) — the in-memory test composition path
   (`createInMemoryChatStoreFactory()`, `app.ts:514`) is already a private, separate `:memory:` db;
   unaffected either way.
4. **`development/scripts/seed-site.mjs`** (~3 lines removed) — drop the three chat table names from
   `PRUNE_TABLES` (they will simply not exist in `content.db` any more once the split ships and a
   site's `content.db` is regenerated/reopened past that point). **Not required for the slice to
   work** — leaving the now-redundant entries is harmless (`DELETE FROM` a table with zero or no
   rows is a no-op) — but worth doing for clarity.
5. **One new/updated test** — a unit test opening two `openChatDb()`/`openContentDb()` instances
   against tmp files and asserting a `captureRestorePoint`-style whole-file copy of `content.db`'s
   path does not touch `chat.db`'s rows (or more simply, that `content.db`'s file no longer contains
   an `ai_chats` table at all post-split). Per this task's own read-only constraint, no test was
   written or run in this pass — this is a size estimate for the eventual slice, not a claim work
   is complete.

**Reversibility:** every change is additive or a 2-line redirect. Reverting is: point the two
wiring lines back at `db.$client`, delete `chat-db.ts`. No migration is destroyed, no `schema.ts`
edit to undo, no production file touched. This satisfies the standing "modular + reversible"
constraint directly.

**What this slice deliberately does NOT do** (see Blockers): migrate existing chat rows out of any
already-deployed `content.db`, delete the old raw tables from `content.db`'s migration history,
build `duplicateSite`, or build the "don't push by default" flag.

---

## 7. Rejected alternatives, and why

- **Row-level tagging (`db_source` column or similar) instead of a physical file split.** Rejected:
  does not solve criterion 2 at all — `captureRestorePoint`'s backup is file-level
  (`db-ops.ts:62-65`, "never a partial/logical export"); a tag inside the same file is still copied
  wholesale by the online-backup API. Would require rewriting restore-point capture from a physical
  backup to a logical dump-and-filter, which is a strictly bigger, riskier change to a
  crash-safety-critical path (`restoreFromArtifact`'s atomic-rename contract, `db-ops.ts:74-87`) for
  no benefit over the file split.
- **Declare `ai_chats`/`ai_chat_messages`/`assistant_agent_sessions` as real Drizzle tables in a new
  `chat-schema.ts` with a full `drizzle-chat/` migrations folder and config, mirroring
  `database-journal.db` exactly (including its Drizzle-managed migration story).** Considered and
  partially adopted (the file-separation part) but rejected for the DDL-management part in this
  slice: it would mean re-authoring `0023`'s DDL a second time as Drizzle builders (schema drift
  risk against `@jini-ai/sqlite`'s own DDL, exactly the risk `ddl-parity.test.ts` exists to catch
  for the CURRENT copy) and standing up a second drift guard. Reusing `ensureChatHistoryTables`
  directly is smaller and keeps the single source of truth in Jini, matching the reasoning
  `0023`'s own header already gives for why Tovu mirrors rather than re-derives that DDL.
- **Build `duplicateSite` and the publish/deploy include-chats flag as part of this same pass**, since
  the owner named them as the motivating consumers. Rejected for THIS slice: per this task's own
  charter ("thin slice before ADR," "smallest real, reversible change that proves the split works
  end to end"), the smallest end-to-end proof is the file split alone — the two named consumers are
  each a separate, real feature-sized piece of work (one of them from scratch), not incidental to
  proving the split works. Bundling them would make the slice not-thin. Flagged plainly as
  unfinished, not silently dropped — see Blockers.
- **Migrate existing rows out of live `content.db` files as part of this slice.** Rejected outright:
  this task is barred from opening `sites/**` at all, and a real migration of already-deployed data
  is exactly the kind of one-way, harder-to-reverse operation the "modular + reversible" constraint
  says to scope separately and carefully, not fold into a wiring change.

---

## 8. Blockers / what makes this bigger than "shouldn't be too big"

The **wiring change is genuinely small** (see thin slice above) and the owner's instinct is right
for that piece. But three things sit outside the wiring and are each real work, not incidental to
it:

1. **Existing production data.** `sites/tovu-com/content.db` already holds real chat rows in the
   three raw-SQL tables (per `seed-site.mjs`'s own measurement, 96% of a 34MB file on the day it was
   written). A live site upgrading past this split needs either (a) a one-time copy of existing rows
   from `content.db`'s raw tables into the new `chat.db`, with the old tables left in place but
   unwritten (reversible, the recommended path), or (b) accepting that pre-split conversations
   become invisible in the (new) chat db, which is a real product regression for anyone who has used
   the admin assistant before. This was explicitly out of scope for this task to touch or verify
   against the real file, so it is unverified in both directions and needs a decision from the
   owner, not just execution.
2. **`duplicateSite` does not exist.** Criterion 1 names a consumer that has to be built from
   scratch. That is not "wiring a flag" — it's a new feature (workspace/site cloning), and until it
   exists, "duplicating a site clones chat" is not even a bug today, because duplicating a site is
   not possible today. If the owner's mental model is "this split closes that gap," it does not —
   it only ensures that WHEN `duplicateSite` is eventually built, chat exclusion is nearly free
   (skip opening/copying `chat.db`).
3. **The publish/deploy "option to include" flag has no home.** As detailed in section 5, nothing in
   this codebase currently pushes a site's database contents anywhere on a recurring basis — Fly
   deploys ship code against a persistent volume, not a fresh data copy. Building a real
   include/exclude toggle means first deciding what operation it gates (restore-point capture? a
   future `duplicateSite`? a future explicit "export site data" admin action that doesn't exist
   either?). This is a design decision, not implementation, and was explicitly out of scope for this
   report to make (no ADR).

**Honest verdict:** the database split itself — the thing that makes items 1–3 above cheap once
each is tackled — is small and low-risk, on the order the owner expects. The full realization of
all five acceptance criteria (especially criteria 1 and 6, which each require a not-yet-existing
feature) is **not** "not too big" as a whole; it's a small foundational change plus at least one
genuinely new feature (`duplicateSite`) plus one open design question (what "push" gates). Recommend
shipping the file split now as its own reversible change, and scoping `duplicateSite` /
the publish flag as separate, explicitly named follow-up work rather than assuming they ride along
for free.

---

## 9. Could not verify

- **Whether any already-deployed site other than `tovu-com` exists**, and therefore how many
  production `content.db` files would need the data-migration decision in Blockers item 1. Not
  checked — would require inspecting `sites/**` or deployment records, both out of this task's
  read-only/no-`sites/**` scope.
- **Whether `@jini-ai/sqlite`'s `ensureChatHistoryTables` is safe to call against a file that
  already has a partially-migrated schema** (e.g., idempotency across repeated boots) beyond what
  `store-factory.ts`'s in-memory usage already implies (`ensureChatHistoryTables(db)` called once
  per fresh `:memory:` handle, `store-factory.ts:48`). The function's own implementation lives in
  the `@jini-ai/sqlite` package, not this repo, and was not read as part of this task (would require
  leaving `apps/website/src`, and this task's time/tool budget was spent on Tovu-side evidence).
  Marked UNVERIFIED rather than assumed.
- **Whether any admin UI or agent tool reads `ai_chats`/`ai_chat_messages` through a path other than
  `@jini-ai/sqlite`'s own store abstraction** (i.e., a raw SQL query somewhere outside
  `assistant/persistence/`). The grep sweep in section 1 found none, but a sweep is evidence of
  absence only as strong as the pattern list used — I did not additionally search for indirect
  access via a generic "query runner" utility that might not literally contain the string
  `ai_chats`.
- **Did not run any test, build, or `tsc`** per this task's explicit instruction — so nothing here
  has been confirmed by executing code, only by reading it. Two other agents hold the machine's test
  budget per the dispatch brief.

---

*No ADR was produced (house rule: thin slice before ADR). No `sites/**` file was opened, copied,
migrated, or probed. No test suite, build, or `tsc` was run.*
