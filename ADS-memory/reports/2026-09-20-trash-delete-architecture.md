# Trash / delete architecture — design + migration

Author: Claude Opus 5 (software-architect persona), 2026-09-20.
Branch: `restructure/apps-website-phased`. Migration written and verified green.

---

## Owner summary

- **Phase 1 is LOCAL admin trash**, not production trash. Two different features share the name; see §0.
- **One table, `trashed_items`**, keyed `(workspace_id, entity_type, entity_id)`. The row IS the trash marker. Restore deletes it.
- **It stores a display snapshot** (title + subtitle) captured from columns at delete time. So a row whose payload is corrupt **still lists and still restores** — that is the bug we are designing around, and I verified it is real.
- **Phase 1 covers Posts, Comments, Media, Redirects.** Widgets, Collection entries and Theme files come in phase 2. The screen says so out loud — see §4.
- **Agents get trash / restore / list. No purge tool exists, at the registry, not in prompt wording.**
- **60-day purge is a backstop.** The list hides expired rows the instant it opens; a background sweeper reclaims the bytes when the site is next running.
- **Migration is written and verified**: 71 migrations apply clean, schema-drift guard 12/12, Postgres parity 14/14, manifest 55/55.
- **One thing to know:** `newsletter_remove_subscription` is an agent-callable tool that does a real `DELETE FROM` today. It violates the ruling right now. See §8 owner decisions.

---

## 0. Which feature this is — resolving the conflict

`ADS-memory/reports/2026-09-19-production-trash-bin-design.md` (Codex, read-only) and this document are **two different features that share a word**. Stating it plainly, because building either one while thinking it is the other would be expensive:

| | Codex's design | **This design (phase 1)** |
|---|---|---|
| Where the delete happens | On the **production/destination** site, across the publish wire | On the **local** site, in the admin UI |
| What is deleted | A published entity on a peer | A row in this site's own `content.db` |
| Mechanism | `operation: "trash"` discriminator on the wire + destination-owned `purge_after` on `posts` + a `production_deletion_fences` table | A local `trashed_items` index table |
| Triggered by | An explicit "Delete on production" command after destination selection | The ordinary Delete button / agent trash tool |

**Phase 1 is local admin trash.** Reasons: it is what the owner directive describes ("we have the tab, maybe we should just build it"); the Trash tab stub is a local admin screen; and it needs no artifact-format change, no peer capability negotiation, and no Jini publish. Codex's design is a genuinely separate, larger piece of work gated on artifact `operation` reservation.

**Forward compatibility with Codex's design — deliberate, three points:**

1. **Codex keeps the entity row and adds lifecycle columns; I keep the entity row and add an index row.** Neither deletes the entity. Both are compatible with the other landing later. I do **not** add `purge_after` to `posts`, so Codex's `posts.purge_after` remains free to mean exactly what that design says: *destination-owned production retention*. Local retention and production retention are different clocks on different machines and must not share a column.
2. `trashed_items.entity_type` / `entity_id` is the same identity triple Codex's `production_deletion_fences` uses (`workspaceId, entityType, entityId`). When that lands, the two tables are siblings with a shared key shape, not rivals.
3. This design does **not** touch pack/export. The existing sender-side `isTrashed` guard (`features/post/publish-content.ts`) keeps filtering trashed rows out of ordinary publishes, which is what makes "local delete never deletes live" true. Nothing here changes that.

**Non-goal, stated so nobody assumes it:** trashing locally does not trash on production, and this design gives no way to do so. That is Codex's feature.

---

## 1. Data model

**I agree with the coordinator's position.** One platform-level index table with a display snapshot. Below is why it is right rather than just acceptable, then the exact shape.

### 1.1 The constraint that determines the whole model — verified

The brief called this load-bearing and asked me to verify it myself. I did.

`widgets_trash_instance` cannot trash a broken row. `trashWidgetInstance` calls `parseWidgetInstancePayload(current.fieldsJson)` at `apps/website/src/features/widgets/write-service.ts:300`, then rebuilds via `buildWidgetInstanceFieldsJson({...payload, status: "trash"})` at :307. `purgeWidgetInstance` does the same at :373. The parser is a read-through with four throw points, all in `apps/website/src/features/widgets/entry-payload.ts`:

- `readPayloadString` throws `"widgets: malformed fieldsJson (expected an object)"` when `fieldsJson` is not a plain object
- throws `"widgets: malformed fieldsJson (missing ext)"` when `ext` is not a plain object
- throws `` `widgets: malformed fieldsJson (missing fields.ext.${owner}.payload)` `` when the owner bag or its `payload` string is absent
- `parseWidgetInstancePayload` then calls `JSON.parse(...)` on that string, which throws on malformed JSON

Widgets store `status` **inside** `fields_json`, so flipping the status *requires* the parse. The tool therefore fails on exactly the rows a user most wants gone. **Claim confirmed, and it is the single most important input to this design.**

The generalised rule it produces:

> **A trash operation must never round-trip the entity payload, and listing the trash must never read the entity at all.**

### 1.2 Why an index table beats a per-domain column

A `purge_after` column on each domain table (Codex's shape, correct for *production*) fails the rule above for *local* trash:

- **Listing would have to fan out** across `posts`, `media`, `redirects`, `comments`, `entries`, … and read each domain's records to render a title. Every one of those reads is a parse opportunity. The widget bug reappears as a list that 500s.
- **The four phase-1 domains do not share a storage mechanism.** Verified: `posts` (`schema.ts:33`), `media` (`schema.ts:1345`) and `redirects` (`schema.ts:550`) are `sqliteTable` declarations; **`comments` is not in `schema.ts` at all** — it is a raw-SQL plugin dataModule table (`features/comments/data-module-install.ts`, queried as `COMMENTS_TABLE` in `repo.sqlite.ts`); and `entries` rows are written by `@jini-ai/cms` in a separate repo. A per-domain column means four different migration mechanisms, one of which is another repository.
- **Ordering and pagination across domains** is impossible without a common table — you cannot `ORDER BY trashed_at LIMIT 20` across four heterogeneous tables in one query.

The index table answers all three: one read, one sort, one paginate, zero entity reads, one migration.

### 1.3 The snapshot is display-only, not a record copy

**Decision (mine, non-escalating): store two display strings, not a full record snapshot.** Rejected the full-copy alternative because:

- Restore does not need it. The entity row is still there — `hide`/`unhide` moves a marker, it never removes data. A full copy would be a second source of truth that can silently diverge from the live row.
- It doubles the privacy-erasure surface. Codex's report already flags that "removed after 60 days" is not automatically erasure because revisions retain full snapshots (`schema.ts:245-274`). Adding a third full copy makes that worse for no gain.
- Two short strings keep the table narrow enough that the sweeper's index scan stays cheap.

**The snapshot is captured from columns the caller already holds.** This is the contract clause that makes it safe: at trash time the write-service has already loaded `current` for its permission and version checks, so `current.title` / `current.slug` are in hand **without** a payload parse. This works even for a corrupt widget, because `entries.title` is a real column and `fields_json` is the part that is broken.

### 1.4 Table shape

Written to `apps/website/src/platform/db/schema.ts` as `trashedItems`:

| column | type | notes |
|---|---|---|
| `id` | text PK | surrogate; gives the UI a stable checkbox handle |
| `workspace_id` | text NOT NULL | real FK → `workspaces.id` ON DELETE cascade |
| `entity_type` | text NOT NULL | `post` / `comment` / `media` / `redirect` / … |
| `entity_id` | text NOT NULL | |
| `trashed_at` | text NOT NULL | ISO |
| `purge_after` | text NOT NULL | `trashed_at` + retention window, local clock |
| `actor_principal_id` | text NOT NULL | who deleted it |
| `actor_plugin_id` | text | which plugin/agent, if any |
| `display_title` | text NOT NULL | snapshot, from columns |
| `display_subtitle` | text | slug / `from_pattern` / comment excerpt |
| `entity_version` | integer | version at trash time — the CAS guard |
| `purge_lease_owner` | text | sweeper claim lease |
| `purge_lease_expires_at` | text | sweeper claim lease |

Indexes:
- `trashed_items_identity_unique` UNIQUE `(workspace_id, entity_type, entity_id)` — makes trash idempotent; re-trashing an already-trashed entity is a no-op, not a duplicate row
- `idx_trashed_items_purge_after` `(purge_after)` — **deliberately global, not workspace-scoped**: the sweeper claims due rows across every workspace in the file in one query
- `idx_trashed_items_workspace_trashed_at` `(workspace_id, trashed_at)` — the list's ordering

**Two deliberate omissions, both load-bearing:**

- **No foreign keys to entity tables.** An FK could not span `sqliteTable` declarations, a raw-SQL plugin table, and a table owned by another repository. The `workspaces` FK *is* real and cascades.
- **No CHECK constraint on `entity_type`.** Open vocabulary, validated at the port. A phase-2 domain needs an adapter and **no migration** — which is what keeps phase 2 cheap.

`display_title` is NOT NULL, and the backfill writes `COALESCE(NULLIF(title,''), id)`, so the list never needs a null branch.

---

## 2. The port

### 2.1 Adapter contract — no `describe()`

```ts
/** One per domain. Registered at the composition root, resolved at CALL time. */
export interface TrashAdapter {
  readonly entityType: string;
  /** Move the domain's own marker to hidden. MUST NOT parse or rebuild the payload. */
  hide(required: { workspaceId: string; entityId: string }): Promise<void>;
  /** Move it back. MUST NOT parse or rebuild the payload. */
  unhide(required: { workspaceId: string; entityId: string }): Promise<void>;
  /** Physically remove. Compare-and-delete on expectedVersion. */
  purge(required: {
    workspaceId: string;
    entityId: string;
    expectedVersion: number | null;
  }): Promise<"purged" | "version-changed" | "already-gone">;
}
```

**Exactly three methods. No `describe()`, on purpose** — an adapter that can throw on read would reintroduce the widget bug the snapshot exists to avoid. If `describe()` existed, someone would eventually call it from the list path and the list would start 500ing on corrupt rows. The way to make that impossible is for the method not to exist.

**Two contract clauses to enforce in tests:**

1. **Trash/restore MUST NOT round-trip the payload.** Test: seed a row with deliberately malformed `fields_json`, call `hide` then `unhide`, assert both succeed and the malformed bytes are byte-identical afterwards. This is a genuine RED today for widgets.
2. **Listing MUST degrade.** Ladder: snapshot columns → `entity_type` + `entity_id` → bare `id`. Test: a `trashed_items` row whose entity table row has been deleted out from under it still renders and is still selectable for purge.

### 2.2 Service surface

```ts
export interface TrashPort {
  trash(r: {
    workspaceId: string; entityType: string; entityId: string;
    actor: { principalId: string; pluginId?: string };
    display: { title: string; subtitle?: string };
    entityVersion: number | null;
  }): Promise<void>;
  restore(r: { workspaceId: string; entityType: string; entityId: string }): Promise<void>;
  list(r: { workspaceId: string; entityTypes?: string[]; limit: number; cursor?: string }): Promise<TrashPage>;
  /** HUMAN-ONLY. Never exposed as an agent tool. */
  purgeSelected(r: { workspaceId: string; ids: string[]; actor: { principalId: string } }): Promise<PurgeReport>;
}
```

`display` is a **required** argument, not something the port derives. That is what forces the caller — who already holds the record — to supply it from columns, and makes "the port never reads the entity" checkable by signature rather than by discipline.

### 2.3 The registry trap

The brief flags this and it is real: `ToolRegistry` and routing's `phaseRegistry` are append-only with no unregister, so **anything that filters at REGISTRATION time runs exactly once** — two real bugs already.

**Therefore:** adapters go into a plain `Map<string, TrashAdapter>` built at the composition root and passed in as a dependency. Resolution is `adapters.get(entityType)` **at call time**, on every call. No module-level registry, no import-time side effects, no registration-time filtering.

**Unknown `entity_type` at call time** (e.g. a plugin was uninstalled): the row **still lists** from its snapshot — that is the whole point — but `restore` and `purge` return an explicit `adapter-unavailable` result, surfaced as "this item's section isn't installed". Honest, and it degrades rather than throwing.

---

## 3. Expiry

### 3.1 `startTrashSweeper` — modelled on the outbox drainer

I read `apps/website/src/contracts/core/events/outbox-drainer.ts` in full. It is the right template and I am copying its shape deliberately, not inventing one:

- **`unref`'d `setTimeout` loop**, rescheduled only after the current pass settles (never overlaps itself); a full batch reschedules at `0`, otherwise it waits `intervalMs`
- **Errors go to `onError` and the loop carries on** — a failing pass never ends the loop, and a throwing reporter is swallowed
- **`stop()` is idempotent** and awaits the in-flight pass
- Started from `apps/website/src/server/runtime/composition/serving-app.ts`, the same one place the drainer is started

**Lease: on the rows, not in a scheduler table.** The drainer's lease is on outbox rows via atomic `claimPending`, and I use the same trick on `trashed_items` rows via `purge_lease_owner` / `purge_lease_expires_at`. This is why I did **not** add Codex's `maintenance_job_state` / `maintenance_job_runs` tables: the row-level lease gives at-least-once semantics, crash recovery (an expired lease is reclaimable), and free boot catch-up, with no second table and no scheduler state to keep consistent.

Claim, in one transaction, two statements — **not** `UPDATE … LIMIT`, which needs a SQLite compile flag that is not guaranteed and does not port to Postgres:

```sql
BEGIN IMMEDIATE;
SELECT id, workspace_id, entity_type, entity_id, entity_version
  FROM trashed_items
 WHERE purge_after <= :now
   AND (purge_lease_expires_at IS NULL OR purge_lease_expires_at <= :now)
 ORDER BY purge_after
 LIMIT :batch;
UPDATE trashed_items
   SET purge_lease_owner = :owner, purge_lease_expires_at = :leaseUntil
 WHERE id IN (:ids);
COMMIT;
```

Then per claimed row: `adapter.purge({ expectedVersion })`, and **only on `"purged"` or `"already-gone"`** delete the `trashed_items` row. On `"version-changed"`, release the lease and leave the row alone.

### 3.2 The compare-and-delete predicate — why restore always wins

Hard-delete happens **only** when `purge_after <= now` **AND** `entity_version` is unchanged. Restore deletes the `trashed_items` row and bumps the entity's version, so a restore racing a sweep loses the row from under the sweeper and, even if the sweeper already claimed it, fails the version check. **The safe outcome (item survives) is the default on every race.** A restore can never be beaten by a purge.

### 3.3 Lazy read filter + the dormant-site cost

Paired with the sweeper: **the Trash list excludes `purge_after <= now`** in its WHERE clause. So:

- A site that sits closed for four months, then opens: the Trash shows **nothing expired**, instantly, in the first render — no waiting for a sweep.
- The first sweeper tick after boot then reclaims the disk.

**What that costs on a dormant site, stated plainly:** while the process is down, nothing runs, so the bytes stay on disk past day 60. The two halves of the promise have different guarantees:

- **"You won't see it after 60 days"** — guaranteed by the read filter, unconditionally, even if the sweeper never runs.
- **"The bytes are gone after 60 days"** — guaranteed only once the process next runs. On a site dormant for six months, the bytes live six months.

I judge this the right trade: the alternative is an external scheduler or cron, which the brief explicitly rules out and which cannot run on a dormant machine either. It should be said accurately in the UI — "removed after 60 days", not "erased after 60 days". Note also that this is only *removal from active content and Trash*; revisions and restore points retain their own copies on their own schedules (Codex's report makes the same point, and it is correct).

**Retention constant:** 60 days, one exported constant (`TRASH_RETENTION_DAYS = 60`), stamped into `purge_after` at trash time rather than computed at read time — so changing the constant later never retroactively purges what a user was promised.

---

## 4. Phase 1 scope

### 4.1 Ruling: the set is coherent, with one honest caveat

**Posts, Comments, Media, Redirects.** I verified all four have a marker and a `version` column for the CAS predicate:

| domain | marker | version | snapshot title | snapshot subtitle |
|---|---|---|---|---|
| posts | `deleted_at` (`schema.ts:98`) | yes | `title` | `slug` |
| comments | `status` (raw-SQL table) | yes | derived `"Comment on …"` | body excerpt |
| media | `status` (`schema.ts`) | yes | `title` | `slug` (nullable) |
| redirects | `status` (`schema.ts`) | yes | `from_pattern` | `to_target` |

**Is it coherent to a user?** Three of the four — posts, comments, media — are exactly what a person means by "stuff I deleted". Redirects are more of an operator object, but it has a real marker and a real ladder, the Trash tab's own stub comment already names `redirects_tombstone` as one of the three things it is meant to gather up, and excluding it would mean building an adapter later for no benefit. **Keep all four, one list, with a Type column and type filter chips.** Not separate screens — that would be a concept the user has to learn, for no gain.

The caveat is not the *set*, it is the *implied completeness*. Which leads to:

### 4.2 The screen must not imply coverage it lacks

A bin that silently omits a domain teaches the user it is complete when it is not — and worse, the owner's ruling says "delete always puts things in the Trash", so a user who deletes a widget and does not find it here will reasonably conclude the widget is unrecoverable, or that the Trash is broken.

**Required, not optional:**

- A persistent line under the list *and* in the empty state: **"Covers Posts, Comments, Media and Redirects. Widgets, Collection entries and Theme files are deleted in their own sections and aren't collected here yet."**
- It stays until phase 2 removes it. It is not a tooltip and not behind a disclosure — someone looking for a missing widget must see it without hunting.

### 4.3 Phase 2

Widgets, Collection entries, Theme files.

- **Widgets** need the status moved out of `fields_json` onto a real column first, or `hide`/`unhide` cannot satisfy the no-parse clause. That is the actual fix for the two broken production rows, and it is a schema change to `entries` — hence phase 2.
- **Entries** need a delete primitive in `@jini-ai/cms` (`/Users/la/Programming/Jini`), published via **pnpm, not npm**. Confirmed: `EntryRepoPort` exposes no delete/remove for any content type. Keep out of phase 1.
- **Theme files** are a filesystem move to `.trash/<epoch>/`, not a DB row. Its adapter is an ordinary `TrashAdapter` whose `hide`/`unhide` move directories and whose snapshot is the file path — the port shape already accommodates it, which is a useful check that the abstraction is not DB-shaped by accident.

---

## 5. Migration — written and verified

Four files, hand-written rather than generated. **Hand-written deliberately:** the git index is shared with live agents, and `drizzle-kit generate` diffs the *whole* of `schema.ts`, so it would have swept any other agent's uncommitted schema edits into my migration. The journal carries no content hash (`idx`/`version`/`when`/`tag`/`breakpoints` only) — drizzle hashes the `.sql` at runtime into `__drizzle_migrations` — so a hand-authored entry is safe, and the two prior entries (`when` 1799841600001/2, sequential +1) show it is already the house practice here.

1. `apps/website/src/platform/db/schema.ts` — `trashedItems` appended, with the full rationale in its doc comment
2. `apps/website/src/platform/db/drizzle/0070_trashed_items.sql` — `CREATE TABLE` + 3 indexes
3. `apps/website/src/platform/db/drizzle/meta/_journal.json` — entry `idx: 70`
4. `apps/website/src/platform/db/schema.postgres.ts` — the matching `pgTable` block + header count 90 → 91

### Traps checked, each one actually checked

- **`pgTable` extraConfig column identity** — parity test asserts FKs, indexes and column lists match *by meaning* via `getTableConfig()` on both schemas, not by token count. Green.
- **Regenerating migrations breaks hashes / partially applies** — avoided entirely by hand-writing. No existing `.sql` touched.
- **Type identity across packages under ESM/CJS** — not engaged: no new cross-package type crosses a boundary. `trashedItems` is consumed inside `apps/website`.
- **`schema.postgres.ts` is GENERATED with a CI drift check** — its header says DO NOT EDIT BY HAND. I hand-wrote the block in generator style and then let the drift test *run the generator* and compare. It passed, so the block is byte-identical to generated output. Verified, not assumed.
- **Migrations AUTO-APPLY to the live DB** — confirmed: `openContentDb` calls `migrate(db, { migrationsFolder: MIGRATIONS_DIR })` unconditionally (`platform/db/sqlite/content-db.ts:86`). This migration is additive-only — one new table, no data change, no ALTER on an existing table — so auto-apply on next boot is safe.
- **Migration manifest** — derives its structural facts from `schema.ts` via `getTableConfig()`, so a new table needs no manual entry. Confirmed green. `entity_version` is a bounded integer, not an autoincrement PK, so no identity-reseed or growth-class annotation is required.

### Verification actually run

```bash
# all 71 migrations apply to a fresh in-memory DB; table + 3 indexes present
node -e "…"   # ad-hoc, reproduced in §5 of this doc's working notes

node --import tsx --test --experimental-test-module-mocks \
  "apps/website/src/platform/db/__tests__/schema-migration-drift.test.ts"
# 12 pass, 0 fail

node --import tsx --test --experimental-test-module-mocks \
  "apps/website/src/platform/db/__tests__/schema-postgres-drift.test.ts" \
  "apps/website/src/platform/db/__tests__/schema-postgres-parity.test.ts"
# 14 pass, 0 fail — includes "schema.postgres.ts is up to date with schema.ts"

node --import tsx --test --experimental-test-module-mocks \
  "apps/website/src/platform/db/__tests__/migration-manifest.test.ts"
# 55 pass, 0 fail
```

All run from the repo root. Nothing skipped, nothing failing.

---

## 6. Backfill — no payload parse

One idempotent script, `development/scripts/backfill-trashed-items.ts`, re-runnable, four pure-SQL `INSERT … SELECT` statements. **Every one reads columns only** — no domain code, no parser, no ORM entity hydration. That is what lets it succeed on the corrupt rows.

`purge_after` for pre-existing markers is the hard question, and the answer is **not** "trashed_at + 60 days from the original marker", because for an item trashed 90 days ago that means purging it the instant the feature ships — silently destroying data the user never agreed to lose.

**Decision: backfilled rows get `purge_after = backfill_run_time + 60 days`.** The retention clock starts when the *feature* starts, not retroactively. `trashed_at` keeps the true original timestamp, so the UI shows "deleted 90 days ago" honestly while the countdown reads 60 days. This matches Codex's instinct ("do not automatically schedule legacy trashed rows for immediate purge") and is the only choice that cannot destroy data on deploy.

```sql
-- posts: deleted_at is the marker
INSERT OR IGNORE INTO trashed_items
  (id, workspace_id, entity_type, entity_id, trashed_at, purge_after,
   actor_principal_id, display_title, display_subtitle, entity_version)
SELECT lower(hex(randomblob(16))), workspace_id, 'post', id,
       deleted_at, :purgeAfter, :systemPrincipal,
       COALESCE(NULLIF(title,''), id), slug, version
  FROM posts WHERE deleted_at IS NOT NULL;

-- media: status = 'trashed'
INSERT OR IGNORE INTO trashed_items (…)
SELECT lower(hex(randomblob(16))), workspace_id, 'media', id,
       updated_at, :purgeAfter, :systemPrincipal,
       COALESCE(NULLIF(title,''), id), slug, version
  FROM media WHERE status = 'trashed';

-- redirects: tombstoned
INSERT OR IGNORE INTO trashed_items (…)
SELECT lower(hex(randomblob(16))), workspace_id, 'redirect', id,
       updated_at, :purgeAfter, :systemPrincipal,
       from_pattern, to_target, version
  FROM redirects WHERE status = 'tombstoned';

-- comments: raw-SQL table, status ladder
INSERT OR IGNORE INTO trashed_items (…)
SELECT lower(hex(randomblob(16))), workspace_id, 'comment', id,
       updated_at, :purgeAfter, :systemPrincipal,
       'Comment on ' || entry_id, substr(body_text, 1, 120), version
  FROM comments WHERE status = 'trash';
```

`INSERT OR IGNORE` against `trashed_items_identity_unique` is what makes re-running it free.

**Two notes for the implementer:** confirm each domain's exact marker literal (`'trashed'` vs `'trash'` vs `'tombstoned'`) against that domain's status enum before running — I did not verify the string values, only the columns. And the comments table name must come from `COMMENTS_TABLE`, since it is a plugin dataModule table whose name is not a literal in `schema.ts`.

---

## 7. Ordered build plan

Sized for one TDD + programmer pair. Steps 1–2 and 3 are parallelisable after step 0.

**Step 0 — migration. DONE, committed, verified green.**
`schema.ts`, `drizzle/0070_trashed_items.sql`, `drizzle/meta/_journal.json`, `schema.postgres.ts`.

**Step 1 — port + repo.** Create:
- `apps/website/src/features/trash/ports.ts` — `TrashAdapter`, `TrashPort`, `TrashPage`, `PurgeReport`
- `apps/website/src/features/trash/repo.sqlite.ts` — CRUD over `trashed_items`, list with the `purge_after > now` lazy filter, keyset pagination on `(trashed_at, id)`
- `apps/website/src/features/trash/repo.memory.ts` — test double, mirroring the comments feature's existing `repo.memory.ts` convention
- `apps/website/src/features/trash/write-service.ts` — `trash` / `restore` / `purgeSelected`, adapter resolved at call time from an injected `Map`

RED first: the two contract clauses from §2.1.

**Step 2 — four adapters.** Create `apps/website/src/features/trash/adapters/{post,comment,media,redirect}.ts`. Each is ~30 lines of column-only SQL. Wire each domain's existing delete write-service to call `TrashPort.trash(...)` in the same transaction as its marker flip, passing `display` from the record it already loaded.

**Step 3 — sweeper.** Create `apps/website/src/features/trash/sweeper.ts` (`startTrashSweeper`), copying `outbox-drainer.ts`'s loop shape. Change `apps/website/src/server/runtime/composition/serving-app.ts` to start it beside `startOutboxDrainer` and to build the adapter `Map`. Tests: lease reclaim after expiry; `version-changed` stands down; restore-vs-sweep race leaves the item alive.

**Step 4 — backfill.** Create `development/scripts/backfill-trashed-items.ts` per §6. Test: re-running twice produces the same row count.

**Step 5 — agent tools.** Create `apps/website/src/features/trash/tool-registrations.ts` exposing `trash_list_items` and `trash_restore_item` **only**. No purge tool. Add a registry-level test asserting no registered tool id matches `/purge/` — the enforcement the owner asked for, as a test rather than as prompt wording.

**Step 6 — UI.** Change `apps/admin/src/panels.tsx` (~line 1091) to replace the `Placeholder` with the real screen and drop `soon: true`. New `apps/admin/src/screens/trash/`. Checkbox rows, type filter chips, "Restore" and "Delete permanently" (confirmation modal, names the count), the §4.2 coverage line. Per house rule, logic goes in hooks, not `.tsx`. UI work needs Playwright screenshots before it is called done.

**Step 7 — close the hard-delete gap.** See §8.

---

## 8. Owner decisions

Only the four escalating classes. Everything else I decided and recorded above.

1. **`newsletter_remove_subscription` hard-deletes today, and an agent can call it.** *(security/destructive ruling — the only item I think genuinely needs your answer.)* I enumerated the delete-class tools: `comments_trash_comment`, `content_post_delete`, `media_trash_asset`, `newsletter_remove_subscription`, `redirects_tombstone`, `theme_trash_file`, `webhooks_delete_subscription`, `widgets_remove_embed`, `widgets_trash_instance`. There is **no purge tool anywhere**, so your "agents can never hard delete" ruling is already true for eight of them. The exception is `newsletter_remove_subscription`, which reaches a real `DELETE FROM` at `apps/website/src/features/newsletter/repo.sqlite.ts:400`. Options: (a) convert it to a soft delete with a `subscriber` trash adapter — one extra phase-1 domain; (b) de-register the tool, leaving removal human-only; (c) accept it as an intentional exception, since unsubscribe is arguably a privacy-erasure request that *should* delete outright. **My recommendation: (c) with a rename**, because GDPR-shaped erasure genuinely should not sit in a 60-day bin — but this is your call, not mine. I did not verify whether `webhooks_delete_subscription` hard-deletes; the implementer should check it before step 7.

2. **Does the 60-day promise mean "gone from Trash" or "erased everywhere"?** *(security ruling.)* Revisions retain full record snapshots (`schema.ts:245-274`), and change-sets, restore points and backups retain more. If the promise is erasure, their retention has to be aligned and that is a much larger piece of work. **My recommendation: the UI says "removed after 60 days", and erasure is a separate feature.** Flagging it because the wording is a commitment.

3. **Retention is 60 days, from your directive — confirming it applies to all four domains equally.** *(UX call.)* Spam comments in particular might warrant a shorter window, since a busy site can accumulate thousands. Default if you say nothing: 60 days for everything, one constant.

Not escalated, decided by me and recorded above: index table over per-domain column (§1.2); display snapshot over full record copy (§1.3); no `entity_type` CHECK constraint (§1.4); row-level lease over a scheduler-state table (§3.1); hand-written migration over `drizzle-kit generate` (§5); backfill clock starts at backfill time (§6).

---

## 9. Risks

- **The widget parse bug is not fixed by this work** — phase 1 does not include widgets. The two broken production rows stay stuck until phase 2 moves `status` onto a column. Worth saying out loud because the Trash screen shipping could easily be mistaken for having fixed them.
- **`comments` is a plugin dataModule table.** If that plugin is ever uninstalled, its `trashed_items` rows outlive their table. Handled by the §2.3 `adapter-unavailable` path — the rows list, and say their section is not installed — but it is untested territory.
- **Trashed posts keep reserving their slug** for the full retention window (`posts.deleted_at` is deliberately excluded from `posts_workspace_slug_unique`, `schema.ts:94`). A user who deletes a post and immediately recreates it at the same slug hits a conflict. The UI should explain the reservation. Verified in the schema; Codex's report flags the same thing.
- **The sweeper runs against every workspace in the file.** Correct for a per-site `content.db`, but if a single file ever hosts many workspaces the global `purge_after` index is what keeps the due-scan cheap — do not narrow it to a workspace-scoped index later without re-checking the sweep query plan.
- **Two features named "trash".** Someone will eventually read §0 too quickly and add production semantics to `trashed_items`. The table doc comment says local; keep it there.
