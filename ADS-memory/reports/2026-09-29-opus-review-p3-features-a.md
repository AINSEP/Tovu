# Opus review, part 3 of 6: features A (trash, post, newsletter, identity, members)

- Range: `962f928fb..HEAD` on `restructure/apps-website-phased`, excluding theme commits 5179f6f32, 0925ef1e9, c52b8d547.
- Persona: `AI-Dev-Shop/agents/code-inspection/skills.md` (loaded).
- Mode: read-only. All code read with `git show HEAD:` / `git diff`. No app, test, build or sensor runs. The `code_metrics`, `dependency_graph`, `type_safety` and `duplication` slots were **not executed** (the dispatch forbids running tools), so this report makes no claim about any of them. The module cycle in finding 5 was found by reading imports.
- Not re-reported: the 11 fixed items in `2026-09-28-codex-sol-review-today.md`, and the parked ones (members email/consent check-then-insert, newsletter token consume without a lock, no real-Postgres concurrency suites).

Counts: critical 0, high 0, medium 3, low 8.

## Bugs

### 1. MEDIUM: the generic trash adapter's version check can be bypassed on Postgres
`apps/website/src/features/trash/table-adapter.ts:190-229` (`hide`), `:239-257` (`unhide`), `:164-175` (`writeMarker`).

`hide`/`unhide` read the row's version, compare it with `expectedVersion`, and then run an `UPDATE` whose `WHERE` has only workspace, id and scope. The version is not in it. The only protection is `lockKey("trash:<type>:<ws>:<id>")`, and only Trash code takes that lock. A domain writer (the menu, term, taxonomy, form or widget update routes) does not take it. On Postgres (READ COMMITTED) the sequence goes like this:
1. `hide` for menu M reads version 3, which matches the version shown in the confirm dialog.
2. The menu-update route commits new content at version 4.
3. `hide`'s `UPDATE` runs with no version predicate. It trashes M and bumps it to 5.

So the user confirmed trashing version 3 but trashed a version they never saw, and the optimistic-concurrency check (`version-changed`) is lost. On the old code this could not happen: the SQLite transaction was synchronous under `BEGIN IMMEDIATE`. On SQLite it still cannot happen, because the turn lock serializes it. The file header (`:14-17`) says the read-then-write is "as atomic as `flipMarker`'s single compound `UPDATE ... WHERE`". That is false on Postgres.
- **Same pattern:** `apps/website/src/features/trash/adapters/user.ts:21-24, 109-139`. Its header says the advisory lock "keeps a second writer of the same principal out", but `SqlPrincipalRepo.save` (`identity/repo.ts:94-107`) never takes that lock. A concurrent re-enable can be overwritten, and `priorMarker` is recorded from a stale read.
- **Fix:** put the version (and the "marker is live / not live" predicate) into `writeMarker`'s `WHERE` and treat 0 affected rows as `version-changed`, as `flipMarker` does (`adapters/marker-sql.ts:84-107`). Or read with `SELECT … FOR UPDATE` on Postgres. The advisory lock can remain for Trash-vs-Trash ordering.
- `purge` (`:270-301`) has the same read-then-write shape. Its final `DELETE` does carry the version predicate, but the `purgeFirst` cascades run before it. A version bump in the gap would delete the children and keep the parent, and the transaction would commit (it returns `version-changed` instead of throwing). The only writer that can bump a trashed row's version today is restore, which takes the same lock, so this part is PLAUSIBLE only.

### 2. MEDIUM: `content_post_list` excerpts are empty for HTML-format pages
`apps/website/src/features/post/tool-registrations.ts:521-537` (`toPostListRow`).

It calls `extractPostPlainText(post.bodyJson)` without checking `bodyFormat`. For an `"html"` row (Pages vibecoding), `toRecord` fills `bodyJson` with the placeholder `DEFAULT_BODY_JSON = { type: "doc", content: [] }` (`post.ts:917`, `repo.rows.ts:41-62`). So every HTML page is listed with `excerpt: ""` and `bodyChars: 0`. The new tool description (`agent-tools.ts:763-767`) tells the agent that `bodyChars` is "the full plain-text length", so the agent reports those pages as empty. `repo.rows.ts:52-53` spells out the rule this breaks: "any new consumer of `bodyJson` must check `bodyFormat`".
- **Fix:** for `bodyFormat === "html"`, derive the excerpt and length from `bodyHtml` stripped to text, the same way `deriveExcerpt` in `features/seo/seo.ts` does.

### 3. MEDIUM (PLAUSIBLE impact): `saveBatch` holds one transaction for N sequential statements, against ADR-067 §6 "short transactions"
`apps/website/src/features/newsletter/repo.ts:480-485`, called from `send-pipeline.ts:161` with every send row of a campaign's audience.

On SQLite the old loop was synchronous and fast. On PGlite every `save` is one socket round trip, and the whole loop runs inside one transaction on PGlite's single connection. A 5,000-subscriber campaign blocks every other client (API requests and the agent daemon) for 5,000 round trips. ADR-067 §6 names "short transactions" as a kernel rule for code that may run on PGlite.
- **Fix:** use a multi-row `insertInto(...).values(chunk)` with `onConflict(id).doUpdateSet(...)` in chunks of about 200–500 rows, each chunk its own statement (or its own transaction, if all-or-nothing can be relaxed to per chunk).

### 4. LOW: list queries without `ORDER BY` now return a different order on each engine
- `apps/website/src/features/post/repo.ts:71-76` (`list`) and the identity `list`/`listBy*` methods (`identity/repo.ts:87-92, 153-158, 253-266, 302-307, 372-377`, …).

This is unchanged from the old code, but on SQLite the order was stable rowid (insertion) order, and an upsert keeps the rowid. On Postgres every `UPDATE` writes a new tuple, so heap order changes after edits. The concrete effect: `content_post_list` does `allPosts.slice(0, limit)` (`tool-registrations.ts:680-681`) over `listAdminPosts`, which filters but does not sort (`post.ts:1732-1733`). On Postgres, which 50 posts come back, and in what order, changes whenever a post is edited. The admin list order is PLAUSIBLE-affected (it depends on whether the UI sorts on the client).
- **Fix:** add an explicit `orderBy` (for example `created_at, id`, or `id`) wherever a caller slices or displays the result.

## Architecture

### 5. LOW: new runtime import cycle in post search
`post/search-index.ts:7-8` imports `pgPostSearch` and `sqlitePostSearch` as values. `search-index.postgres.ts:5` imports `toPostSearchHit` as a value from `search-index.ts`. `search-index.sqlite.ts:5,139` imports `toPostSearchHit` and re-exports `SqlitePostSearchIndex` from `search-index.ts`. That is two cycles, neither present at `962f928fb`. The sqlite file's own comment (`:138`) admits it ("evaluated inside the module cycle"). It works today only because no module touches the other at top level.
- **Fix:** move `PostSearchRow`, `toPostSearchHit`, `SearchProjectionTables` and the `PostSearchDialect` type into a leaf module (for example `search-rows.ts`) that both dialect files import.

### 6. LOW: `Sqlite*` shim classes are now dialect-neutral but keep SQLite names, and are used on the Postgres path
- The shims: `members/repo.sqlite.ts` (6 classes), `newsletter/repo.sqlite.ts` (6), `identity/repo.sqlite.ts` (10), `identity/user-purge.sqlite.ts`, `post/repo.sqlite.ts`, `post/search-index.ts:93` (`SqlitePostSearchIndex extends PostSearchIndex {}`), `trash/repo.sqlite.ts`, `trash/db-port.sqlite.ts` (`createSqliteTrashDb` = `contentKernel`).
- Composition passes the kernel into them on every engine, for example `deps.ts:1344` `purge: new SqliteUserPurge(kernel)` and `deps.ts:1351` `createTableTrashAdapter({ entry, db: sqliteTrashDb })`. Their headers say they exist "so call sites that construct them from the content db handle stay as they are", but those call sites now pass a kernel.
- Under ADR-067 §3 ("the body never branches on the engine") this is naming debt, not a behavior bug. It will mislead the next reader of the Postgres branch.
- **Fix:** switch composition to the `Sql*`/`…RepoFor(kernel)` names and delete the shims once test call sites are migrated.

## Excess

### 7. LOW: probe for a table that always exists, with a wrong comment
`trash/adapters/post.ts:28-30, 80-86`: `hasSearchDocument ??= tableExists(...)` plus a catch-and-reset.

The comment says the projection "exists only where the database has a full-text index built on it (SQLite's FTS5)". But `post_search_document` is created on SQLite by drizzle migration 0022 and on Postgres/PGlite by migration step `0001_post_search` (`search-index.ts:27-29`), so the probe is always true on a migrated database. `SqlPostRepo.hardDelete` (`post/repo.ts:173-194`) deletes from the same table with no probe.
- **Fix:** drop the probe, or call `postSearchFor(kernel).remove(...)`.

### 8. LOW: pass-through indirection
`trash/db-port.ts` (`type TrashDb = ContentKernel`), `trash/db-port.sqlite.ts` (`createSqliteTrashDb` returns `contentKernel(db)`), and `trash-item-tool.ts:283-297` (`readGenericEntityDisplay` is a one-line forward to `readLiveSnapshot`). Three names for one thing.

### 9. LOW: coarse locks
- `members/repo.ts:337` locks `members:magic-tokens:<workspace>`, which serializes every magic-link consume in a workspace. The key only needs to be the token id.
- The `UPDATE … AND consumed_at IS NULL` result is not checked (`:353-361`). If the lock were ever bypassed, the second caller would get success instead of "already consumed", yet the docstring (`:330-334`) presents that clause as a safety net.
- `newsletter/repo.ts:121-126` locks one global `newsletter:campaigns` key for every campaign transaction in every workspace. This matches the old SQLite `BEGIN IMMEDIATE`, but on Postgres it could be keyed per campaign or per workspace.

## Slop

### 10. LOW: comments that are false after the conversion
- `trash/table-adapter.ts:14-17`: the atomicity claim (see 1).
- `trash/adapters/user.ts:21-24`: "keeps a second writer of the same principal out" (see 1).
- `post/search-index.ts:163-164` (`parseBodyJson`): "text on SQLite, already parsed on Postgres". `pg-types.ts` keeps `jsonb` as compact JSON text on every Postgres transport, so it is text on both. The `typeof raw !== "string"` branch is dead in production.
- `trash/db-port.ts:7-10` states "no `RETURNING`, anywhere" as a live rule. It was the Drizzle-era constraint. The sibling repos converted in this same range use `RETURNING` on every dialect (`post/repo.ts:133,187,228`, `newsletter/repo.ts:504,540`, `members/repo.ts:407`), and `table-adapter.ts` still pays an extra re-read for it.

### 11. LOW: leftovers from the edits
- `trash/trash-item-tool.ts:286`: one doc line runs to about 200 characters after the merge edit.
- `trash/trash-item-tool.ts:37-38`: a stray blank line where the drizzle import was removed.
- `post/post.ts:4`: imports `#src/platform/html/slug` while the file's other imports are relative.

## Checked and found fine
- **Postgres transaction abort:** no `isUniqueViolation`/catch-then-query inside a transaction anywhere in the slice. `tableExists(...).catch` rethrows. `consume` throws out of its transaction.
- **Booleans:**
  - `posts.overrides_theme_page` is a real boolean on Postgres and is read through `toBool`.
  - `is_default`, `visible_in_portal`, `is_builtin` and `is_frozen` are `INTEGER`/`bigint` on both engines, and `int8` parses to `number`, so `=== 1` holds.
- **JSON:** `jsonb` round-trips as compact text through `PG_PARSERS`. Nothing re-hashes the stored `state_json`, so jsonb key reordering does not break `content_hash`.
- **Identity columns:** `member_revisions`/`newsletter_campaign_revisions` `seq` are `GENERATED ALWAYS AS IDENTITY` and are never inserted explicitly. `post_revisions.seq` is caller-supplied on both engines.
- **Kysely `is`/`is not` with `null`** in `flipMarker` compiles to literal `NULL` (no bound `IS $1`).
- **Keyset pagination** (`trash/repo.ts` list, `members` list) uses the same collation for `ORDER BY` and `<`/`>`, so it stays consistent under non-C collations.
- **Counters:** `newsletter` `counters_json` is excluded from `updatableCampaignColumns`, so a campaign re-save cannot overwrite `incrementCounter`.
- **One kernel:** `createUserTrashAdapter` and `SqliteUserPurge` get the same kernel in `deps.ts`, so `purgeUser` joins the adapter's transaction.
- **Raw SQLite:** no `better-sqlite3`, `$client`, `.prepare(` or `drizzle-orm` import remains in non-test source in the slice.
- **Postgres search:** `to_tsquery` input is built only from `[a-z0-9]+` terms, and an empty query is refused upstream (`search.ts:245-250`). Rank weights (`{0.125,0,0.5,1}`) keep the 8:4:1 ratio.

## Files reviewed (HEAD, non-test)
- trash: `adapters/{comment,marker-sql,media,post,redirect,user}.ts`, `db-port.ts`, `db-port.sqlite.ts`, `entry-sql.ts`, `index.ts`, `move-to-trash.ts`, `not-trashed.ts`, `registry.ts`, `repo.ts`, `repo.sqlite.ts`, `table-adapter.ts`, `trash-item-tool.ts` (changed hunks)
- post: `repo.ts`, `repo.rows.ts`, `repo.sqlite.ts`, `search-index.ts`, `search-index.sqlite.ts`, `search-index.postgres.ts`, `search-index.memory.ts`, `index.ts`, `post.ts` (diff + `createPost` + `listAdminPosts`), `agent-tools.ts` (diff), `tool-registrations.ts` (diff + `toPostToolView`)
- newsletter: `repo.ts`, `repo.rows.ts` (campaign + list parts), `repo.sqlite.ts`, `data-module-manifest.ts` (diff + column types), `send-pipeline.ts` (`freezeAudience`, context only), `subscriptions.ts` (import loop, context only)
- identity: `repo.ts`, `repo.sqlite.ts`, `user-purge.ts`, `user-purge.sqlite.ts`, `user-purge-types.ts` (diff), `wiring.ts` (diff)
- members: `repo.ts`, `repo.rows.ts` (member/tier parts), `repo.sqlite.ts`, `write-service.ts` (catch site, context only)
- Context only (other reviewers' scope): `platform/db/kernel/{port,kernel-core,dialect,index}.ts`, `drivers/pg-types.ts`, `content-kernel.ts`, `schema.postgres.ts` (column types), `server/runtime/composition/deps.ts:1290-1360`, ADR-067.

## Not reviewed
- `post/__tests__/search.eval.ts` and `post/__tests__/pglite-repo.fixture.ts` (test files; the eval's agreement claim was not checked).
- The rest of `newsletter/repo.rows.ts` (subscription, send and token mappers beyond the table types) and `members/repo.rows.ts` (session, token and consent mappers). I looked at them only for `toBool` / `JSON` / `Number` use.
- Migration `0001_post_search` (the `tovu_search` text-search config) and the kernel drivers: part 1's scope.
- Complexity / cycle / type-safety / duplication sensors: not run (read-only dispatch).
