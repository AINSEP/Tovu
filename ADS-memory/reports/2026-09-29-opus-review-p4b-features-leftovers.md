# Review part 4b: features B leftovers (lipay 1-560, thin repo.sqlite.ts, L4 callers)

Reviewer: Opus 5.5, with the code-inspection persona loaded. This continues `2026-09-29-opus-review-p4-features-b.md` and does not repeat its findings (H1, M1, M2, L1-L7, X1-X3). It also leaves out the 11 issues fixed in the codex-sol report and the parked items (redirect lock names, real-Postgres concurrency suites). The range is 962f928fb..HEAD. The review was read-only through `git show` and `git diff`; nothing was run.

Counts: critical 0, high 0, medium 0, low 4 (2 of them PLAUSIBLE). There is also 1 confirmation that upgrades a part-4 finding and 1 excess note.

## Bugs

### B1 (LOW): storefront display price flips between equal-priced rows on Postgres. This confirms part-4 L4 for commerce.
- `features/commerce/repo.ts:176` `listByProduct` has no `ORDER BY`. `features/commerce/storefront.ts:88` `pickDisplayPrice` reduces with a strict `<`, so on a tie the first row wins.
- Callers: `server/inbound/public-http/routes/site/products.ts:68` (`resolveStorefrontProducts`, which serves both the `/products` render and the static export's route manifest).
- What goes wrong: a product has two active one-time prices with the same `unit_amount_cents`, for example 1000 USD and 1000 EUR, or a replacement price added before the old one is archived. On SQLite, rowid order always shows the older one. On Postgres the heap order can change after an UPDATE or VACUUM, so the page and the export can switch the displayed price or currency with no edit. Two exports of the same data can also differ.
- Fix: `orderBy("created_at").orderBy("id")` in `listByProduct`, or add a deterministic tiebreak in `pickDisplayPrice`.

### B2 (LOW): admin taxonomy, forms and redirects lists come back in arbitrary order on Postgres. This confirms part-4 L4 for these three.
- The callers do not re-sort:
  - `listTaxonomiesWithTerms` (`@jini-ai/cms/src/taxonomy/list.ts:36-49`) iterates `taxonomies.list()` and `terms.listByTaxonomy()` as returned (`features/taxonomy/repo.ts:148,265`).
  - `server/inbound/admin-http/routes/forms/list.ts:30` passes `formDefinitionRepo.list()` (`features/forms/repo.ts:60`) straight to `toAdminFormDefinitionListResponse`.
  - `server/inbound/admin-http/routes/redirects/list.ts:37` does the same with `redirectRepo.list()` (`features/redirects/repo.ts:115`, through `rowsOf`, which has no ORDER BY).
- What goes wrong: on SQLite the admin lists show rows in creation order. On Postgres the order is whatever the scan returns, and it can change after updates. Term order within a taxonomy (the admin tree and the MCP `list` tool) shuffles in the same way.
- I did not check whether the admin React side sorts client-side. If it does, this drops to cosmetic for the UI, but not for the MCP tool output.
- Fix: order by `created_at, id` (or `name`) in each list, as `listModerationQueue` already does.

### B3 (LOW, PLAUSIBLE): collection `where` and `sort` on custom fields differ across dialects for mixed JSON types
- `features/entries/repo.ts:199-217` uses `jsonScalarEquals` and `jsonSortKey` (`platform/db/kernel/dialect.ts:51-72`).
- Equality: SQLite binds a boolean filter as `1`/`0`, so `where: {featured: true}` also matches entries whose field holds the number `1`, and `where: {n: 1}` matches `true`. Postgres jsonb equality is type-strict. The same site can therefore list different entries after a move to Postgres.
- Sort: SQLite's `json_extract` puts numbers (and booleans, read as 0/1) before text. Postgres jsonb orders `Null < String < Number < Boolean`, so text sorts BEFORE numbers and booleans sort after all numbers. The sort-key doc comment says numbers sort as numbers on both dialects. That holds only when every value has the same JSON type.
- Reach: this only matters when a custom field holds mixed JSON types across entries (for example, a field retyped from text to number without migrating values). PLAUSIBLE, not proven reachable through validated writes.
- Fix: document the single-type precondition, or cast per declared field type on both dialects.

### B4 (LOW, PLAUSIBLE): a lipay webhook body containing a NUL byte fails to insert on Postgres. This extends part-4 L5 to lipay.
- `features/plugins/lipay/lipay-plugin.ts:1054` stores `rawBody.toString("utf8")` into `p_lipay__events.payload` (TEXT, which is `text` on Postgres). Postgres text rejects `\u0000`; SQLite stored it.
- What goes wrong: the insert throws out of `handleWebhook` instead of returning an ack, so the route gives a 5xx and the provider retries forever. That is the "retry storm" the file says it avoids (`:1063-1064`). Invalid UTF-8 is also silently replaced with U+FFFD, so the payload is not verbatim, which contradicts the header's "persisted verbatim" (`:29-31`). That part predates this change.
- `activateLipay` still has no production caller (part-4 X2), so this is latent.
- Fix: store the payload base64-encoded or as BLOB/bytea, or strip NULs and flag the event.

## Excess

- **X4 (LOW)**: `features/comments/repo.ts` `applyModeration`, the "0 rows updated, so re-read and report a conflict" arm (after the version-guarded UPDATE). The method now takes `lockKey("comments:<ws>:<id>")` and checks `version` under it before the UPDATE, so the guarded UPDATE cannot miss on any dialect and the arm is unreachable. This is the same pattern as part-4 X3 (store-plugin). Keep the `version =` guard in the WHERE as a backstop if wanted. The re-read branch can go, or should carry a comment saying it is defensive.

## Checked and clean

- **lipay-plugin.ts lines 1-560** (manifest, record types, row mappers, validation and pure transition helpers):
  - The only changes from the base are types (`as const`, `type` instead of `interface`, the new `EventRow`/`LipayTables`) and the deleted SQLite-only `isUniqueViolation`. The keyed inserts now use `ON CONFLICT (workspace_id, idempotency_key) DO NOTHING` against the matching unique `idem` indexes.
  - The `INTEGER` columns become `bigint` on Postgres, and `parseInt8` returns a `number` for safe values. So the `===` comparisons in `resolveExistingCharge`/`resolveExistingRefund` still hold, because `invalidAmount` forces safe integers.
  - `selectPaymentByRef` now closes over the plugin's `workspaceId`, where the base took it as a parameter. The base's only call site passed that same `workspaceId`, so behavior is unchanged.
- **comments `repo.sqlite.ts`** (base body diffed against the new `repo.ts`):
  - Queries, ordering and the atomic create-with-log are the same.
  - Empty `includeStatuses` now short-circuits to `[]`, the same result as SQLite's `IN ()`.
  - The keyset `(created_at, id) >` was expanded to an OR/AND. That is equivalent.
- **entries `repo.sqlite.ts`**:
  - The upsert keeps `WHERE deleted_at IS NULL`, and the JSON columns are stringified.
  - `nullsFirst`/`nullsLast` reproduce SQLite's default NULL placement, and the `id` tiebreak is kept.
  - The `transaction()` join semantics are preserved by `kernel.transaction`.
  - The exact-message match became `isUniqueViolation`, which part-4 L2 already covers.
- **forms `repo.sqlite.ts`**: the reads, update and keyset pagination are the same. The create change is covered by part-4 L1.
- **redirects `repo.sqlite.ts`**:
  - The in-memory filters moved into SQL (`status`, `match_type`, `override = 1`). `override` and `tombstoned` are `bigint` on Postgres (`schema.postgres.ts:1113,1129`), so `= 1` is valid.
  - Tie-break sorting still happens in JS.
  - `listRevisionsForTests` is now async and orders `seq asc` directly, where the base used desc then reverse. The result is the same.
- The taxonomy, settings, commerce and pages `.sqlite.ts` files are thin subclasses that part 4 already covered.
- Architecture: no raw driver access in these files. Every statement goes through `kernel.run`/`transaction`/`lockKey`. No new cross-slice imports were seen.

## Not reviewed

- `plugins/__tests__/stale-columns-proxy.ts` (test support).
- The unchanged regions of `data-module.ts` (validation, header).
- Admin React components, to see whether they sort client-side (B2).
- Mechanical sensors (code_metrics, dependency_graph, type_safety, duplication) were not run. Their result is INCONCLUSIVE, not a pass.
