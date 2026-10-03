# Review part 4 — features B (plugins, taxonomy, pages, settings, commerce, comments, entries, redirects, forms)

Reviewer: Opus 5.5 (code-inspection persona loaded). Range 962f928fb..HEAD, theme sync commits excluded. Read-only; code read via `git show HEAD:` / `git diff`. No tests/builds run. Stopped at the 250k context line (see "Not reviewed").

Counts: critical 0 · high 1 · medium 2 · low 9 (3 of them PLAUSIBLE).

## Bugs

### H1 (HIGH) — settings `coercion_json` is jsonb on Postgres; the repo writes a bare tag
- `apps/website/src/features/settings/repo.ts:77` writes `coercion_json: record.coercionTag` raw; `:55` reads it back raw.
- `coercionTag` is a plain coercer name (`"identity"` etc., `Jini/packages/cms/src/settings/definitions-dispatch.ts:43-45`, `write-service.ts:790-820`). The Postgres baseline declares the column `jsonb` (`platform/db/migrations/0000_legacy_baseline.postgres.ts:63`, `schema.postgres.ts:1210`).
- What goes wrong: on PGlite/Postgres every `saveDefinition` with a non-null `coercionTag`, meaning every retype (which requires one), fails with `invalid input syntax for type json`. Copying a SQLite site's `setting_definitions` rows into Postgres fails the same way. If the insert were made to succeed by JSON-encoding the tag, the reads would then return `"\"identity\""`, because jsonb comes back as JSON text.
- There is no test with a non-null `coercionTag` (a grep of the test files finds none), so the dialect suites cannot see this.
- Fix options: JSON-encode on write and decode on read in the repo, or make the column `text` in the pg baseline and generator. Pick one, and add a retype test on PGlite.

### M1 (MEDIUM, PLAUSIBLE) — plugin dataModule DDL and `CREATE TABLE IF NOT EXISTS` race across processes on Postgres
- `features/plugins/data-module.ts` works out its plan (existing tables and columns) OUTSIDE the transaction and takes no `lockKey` around plan plus DDL. `ensureJournal`, `ensureMigrationJournal` (`migration-journal.ts`) and `ensurePluginIdentityTable` (`plugin-identity.ts`) all use `CREATE TABLE IF NOT EXISTS`, which is not concurrency-safe on Postgres (a duplicate-key error on `pg_type`).
- What goes wrong: two API instances boot against one Postgres database. Both plan "create `p_comments__comments`" and one fails with `relation already exists` or `duplicate key … pg_type_typname_nsp_index`, so its boot fails. On SQLite the same process shares one connection and turn lock, so nothing breaks there. PGlite has a single owner, so it is not affected.
- Fix: take `kernel.lockKey("plugin-datamodule:<pluginId>")` (plus one lock for the bookkeeping tables), then plan and run the DDL inside that one transaction.

### M2 (MEDIUM, latent: `activateLipay` has no production caller) — lipay refunds can double-count and are no longer capped
- `features/plugins/lipay/lipay-plugin.ts:878-892`: the direct refund path now re-reads the payment under lock and ADDS `amount` to the current total. It has no `Math.min(…, amount_minor)` cap, unlike the event path at `:541-544`.
- Old code (`962f928fb`, `executeRefundAttempt`) wrote `stale payment.amountRefundedMinor + amount`. That overwrote the total, so a webhook that landed during the provider call was absorbed by accident.
- What goes wrong: the provider sends its `refunded` webhook while `provider.refund()` is still in flight, and `applyEvent` adds 500. The direct path then reads 500 and writes 1000, so `amount_refunded_minor` exceeds `amount_minor`. The root cause predates this change: nothing links a refund row to its refund event. The re-read turned the accidental overwrite into a double-count.
- Fix: link the event to the refund row (provider refund ref) and skip it once applied, or at least cap with `Math.min`.

### L1 (LOW) — forms `create` no longer maps the backstop unique violation
- `features/forms/repo.ts:72-96`: the conflict is now pre-checked under `forms:<ws>`, but the INSERT's own unique violation is no longer turned into `FormSlugConflictError`. The old code caught it.
- `update()` (`:105-116`) can change `slug` without that lock. A create racing an update's slug change now surfaces a raw DB error (500) instead of the 409 `FormSlugConflictError`.
- Fix: after the transaction, map `isUniqueViolation` to `FormSlugConflictError` (outside the tx, so the Postgres abort does not matter).

### L2 (LOW, PLAUSIBLE) — entries: a live-slug race on Postgres is reported as "in the Trash"
- `features/entries/repo.ts:105-111` maps ANY unique violation to the "is in the Trash — restore it…" message. On SQLite the chokepoint's check-then-save is serialized by `BEGIN IMMEDIATE`. On Postgres (READ COMMITTED, and the entries chokepoint takes no `lockKey`) two concurrent creates of the same slug both pass the live check, and the loser is told the slug is in the Trash.
- Fix: re-read the holder after the violation (outside the tx) and pick the message from `deleted_at`, or add a `lockKey` in the chokepoint.

### L3 (LOW) — commerce: new `CommerceProductSlugConflictError` is mapped nowhere
- Thrown at `features/commerce/repo.ts:117` and defined at `errors.ts:17`. Nothing catches it (grep: only the repo and errors.ts), so it is still a 500, as the raw constraint error was before. The class carries a `slug` field for a 409 mapping that does not exist yet. Add the route/tool mapping, or drop the class.

### L4 (LOW, PLAUSIBLE) — row order and collation differ on Postgres
- These lists have no `ORDER BY`, so on SQLite they came back in rowid (insertion) order: `redirects/repo.ts:115` `list`, `forms/repo.ts:60` `list`, `taxonomy/repo.ts:148,265` `list`/`listByTaxonomy`, `commerce/repo.ts:176,216` `listByProduct`/`listItems`, and the `settings/repo.ts:275-299` value lists. On Postgres they come back in arbitrary order.
- These orderings have no tiebreak: `comments/repo.ts:52` (`created_at` only) and `taxonomy/repo.ts:500` (`added_at` only).
- Text `ORDER BY` columns (`commerce listActive` name, `store listProducts` title, entries `title` sort, `site-title-preservation` `workspace_id`) sort by the database collation on Postgres, versus binary on SQLite. `sealed-credential-inventory.ts:251` already handles this; these do not.
- I did not check whether callers re-sort.

### L5 (LOW) — jsonb normalizes stored JSON on Postgres
- `commerce_webhook_events.payload_json` (`commerce/repo.rows.ts:199`) is documented as "stored whole for audit/replay" (`webhook-inbox.ts:40`), but jsonb reorders keys and strips whitespace. The stored bytes are then no longer the signed body, so it cannot be re-verified. A non-JSON provider body is rejected outright.
- `entries.fields_json` key order also changes. That matters to anything that hashes or compares serialized `fieldsJson`; not verified.
- Public text inputs (comments `body_text`, form `data_json`) containing `\u0000` fail on Postgres (text and jsonb reject NUL), where SQLite stored them.

### L6 (LOW) — misleading comment in the pages html store
- `features/pages/html-document-store.ts:370-373,475-478`: the comments say a 0-row CAS result "throws … and, inside `revisions.transaction()`, rolls the pre-conversion append back too". It does not. `runConversion` RETURNS 0, the transaction commits the pre-conversion revision, and the throw happens afterwards (`:379`). This predates the change and was carried over verbatim.

### L7 (LOW) — misleading refusal text for a region collision
- `features/pages/tool-registrations.ts:234-240` `describeHandleCollision` says the handle is one "which page … already uses". A fragment that duplicates a NEW handle inside itself (two elements, same fresh handle) is also refused by `handlesMadeAmbiguous`, and there the message is wrong.

## Excess

- **X1 (LOW)**: two construction paths per repo. Production builds the `Sqlite*` subclasses (`new SqliteSettingsRepo(kernel)`, `deps.ts:971,1247,1464-1479,1500,1999-2036`) even on a Postgres kernel. The new `*RepoFor()` factories (`settingsRepoFor`, `commentRepoFor`, … 15 in all) are used only by their own file plus one test. Keep one path: rename, or use the factories. The `Sqlite` name is also wrong for PG sites.
- **X2 (LOW)**: `features/plugins/deploy/deploy-plugin.ts` was fully ported to the kernel, but `activateDeploy` has no production caller (tests only). `bootstrapDeploy` was deleted. The same holds for `activateLipay`. That is spike code carried through a dialect port.
- **X3 (LOW)**: `store-plugin.ts:117-158` takes `lockKey` per product AND keeps the OCC version guard plus the 5-try retry loop. Under the lock the OCC miss cannot happen on any dialect, so the retry loop is dead.

## Slop

- `comments/repo.ts:191` `record!`, a non-null assertion on a re-read inside the tx.
- `settings/repo.ts:51`: `Number(row.secret) === 1` where the rest of the slice uses `toBool`.

## Architecture (ADR-067 / ADR-066)

- No raw SQLite outside drivers in the slice. Every statement goes through `kernel.run`/`transaction`/`lockKey`. No session advisory locks (ADR-067 §6). Provider calls in lipay stay outside transactions.
- H1 is a schema/repo contract break between the generated pg schema (jsonb for `*_json`) and a repo that stores non-JSON in a `*_json` column. Worth a guard: a test asserting every `*_json` write is `JSON.stringify` output.
- No `.tsx` in scope. I did not run a complexity tool; `declareDataModule` and `applyEvent` read at or near the ceiling but the structure is unchanged from the base.

## Files reviewed (HEAD)

settings/repo.ts, repo.sqlite.ts, site-title-preservation(.sqlite).ts; pages/html-document-store(.sqlite).ts, regions.ts (diff), tool-registrations.ts (diff); comments/repo.ts, repo.rows.ts, data-module-install.ts; redirects/repo.ts, repo.rows.ts, phase-handler.ts (diff); forms/repo.ts, repo.rows.ts, duplicate-slug.ts (diff); entries/repo.ts (repo.rows.ts scanned); taxonomy/repo.ts, repo.rows.ts (scanned), repo.sqlite.ts, tool-registrations.ts (diff); commerce/repo.ts, repo.rows.ts (scanned), repo.sqlite.ts, errors.ts, webhook-inbox.ts (diff); plugins/plugin-store.ts, data-module.ts (diff), migration-journal.ts (diff), migration-recovery.ts (diff), plugin-identity.ts, snapshot.ts (diff), index.ts (diff), store/store-plugin.ts, deploy/deploy-plugin.ts (diff), lipay/lipay-plugin.ts lines 560-1080.

## Not reviewed

- lipay-plugin.ts lines 1-560 (manifest, row mappers, pure helpers): only the index lines were seen.
- The full text of entries/forms/redirects/comments `repo.sqlite.ts` (only confirmed they are thin subclasses by pattern).
- `plugins/__tests__/stale-columns-proxy.ts` (test support).
- data-module.ts unchanged regions (validation, header).
- Whether list callers re-sort (L4).
- Mechanical sensors (code_metrics, dependency_graph, type_safety, duplication): not run. Report them as INCONCLUSIVE, not a pass.
