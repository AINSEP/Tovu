# Refactor pattern: lists cut off at a limit (one cursor contract)

## Problem
List calls with a limit but no cursor and no "more exist" signal (members 100, newsletter 100, other-site keys 50, visitor assistant 20) return the first N rows silently.
The admin screen and the assistant both believe they have everything; older rows are unreachable.
Forms submissions, trash, comments and the Jini admin entity list already page as `{ items, nextCursor }`; Jini media (`packages/cms/src/media/list-page.ts` `listMediaPage`) and the media tools already return `{ media, nextCursor }` / `{ documents, nextCursor }` — the existing-key-plus-`nextCursor` shape T3/T4 copy; the Jini chat store pages conversations/messages with its own owner-bound cursor (`packages/chat/src/store/sql/cursor.ts`). The rest do not.

## Rule
Every capped list returns `{ items, nextCursor }` (`nextCursor: null` on the last page) over a keyset order ending in the row id, and accepts `{ limit?, cursor? }`. Tools tell the model in words when the list is incomplete. Admin lists show "Load more" while `nextCursor !== null`. Deliberate caps listed as exempt stay as they are.

## Mechanism (already built — use it)
Jini `@jini-ai/core/list-page` (Jini clone branch `w3-db-main`, commit 64619ab41 on Jini main 0.7.1; `packages/core/src/list-page.ts`):
- `interface ListPage<T> { items: readonly T[]; nextCursor: string | null }`
- `parseListPageRequest({ value: { limit, cursor } }, { defaultLimit, maxLimit }?) → { limit, cursor: string | null }` — query strings or tool input; over-large limits are clamped, malformed ones are a `ToolInputError` (400).
- `encodeListCursor({ position })` / `decodeListCursor({ cursor, shape })` — opaque base64url of the position `[...sortValues, id]`. `shape` is the position's component types (e.g. `['number', 'string']`), given by the caller, never learned from a row. A foreign or wrong-typed cursor is refused ("invalid cursor"), never restarts at page one.
- `pageFromOverfetch({ rows, limit, positionOf })` — cut a page from a query that fetched `limit + 1` rows.
- `pageFromArray({ rows, limit, cursor, positionOf, shape })` — the in-memory twin; it validates the cursor before anything else, even for an empty list (ascending; for a descending order make `positionOf` return the key so ascending order matches, or keep SQL ascending).
- `listPageForModel({ page, toolId })` → `{ items, nextCursor, more? }` — `more` says "This is NOT the full list … call <tool> again with cursor set to nextCursor".
Existing cursors stay where they are: `@jini-ai/cms` `encodeKeysetCursor` (`packages/cms/src/core/keyset-cursor.ts:17`, used by media), Tovu `platform/db/keyset-cursor.ts`, and the chat store's owner-bound `encodeCursor` (a chat list site reuses THAT one, so a cursor cannot cross owners). Every other new site uses `encodeListCursor`.
Worked example (T1 + T2 + T3 + T4, commit b1aed55c1 in the Tovu clone): members — `apps/website/src/features/members/repo.ts` `SqlMemberRepo.list`, `repo.memory.ts`, `tool-registrations.ts` `members_list`, `server/inbound/admin-http/routes/members/list.ts`; test template `apps/website/src/features/members/__tests__/member-repo.list-cursor.test.ts`.

## Decision table

### T1 T-REPO — repo list method with a limit
Port before: `list(required: { workspaceId; afterId?; limit? }): Promise<R[]>` → after: `list(required: { workspaceId: string }, optional: { limit?: number; cursor?: string | null } = {}): Promise<ListPage<R>>`.
SQL before:
```ts
const rows = await this.kernel.run((db) => db.selectFrom("t").selectAll().where("workspace_id", "=", ws).orderBy("id").limit(limit).execute());
return rows.map(toRecord);
```
after (sort key `k`, tie-breaker `id`; for id-only order the position is `[id]`):
```ts
const limit = Math.min(optional.limit ?? MAX_PAGE, MAX_PAGE);
const marker = optional.cursor ? decodeListCursor({ cursor: optional.cursor, shape: ['string', 'string'] }) : null;
const rows = await this.kernel.run((db) => {
  let query = db.selectFrom("t").selectAll().where("workspace_id", "=", required.workspaceId);
  // `(k, id) > (?, ?)` spelled out, so no dialect's row-value support is assumed.
  if (marker) query = query.where((eb) => eb.or([eb("k", ">", marker[0]), eb.and([eb("k", "=", marker[0]), eb("id", ">", marker[1])])]));
  return query.orderBy("k").orderBy("id").limit(limit + 1).execute();
});
return pageFromOverfetch({ rows: rows.map(toRecord), limit, positionOf: (r) => [r.k, r.id], shape: ['string', 'string'] });
```
Keep the existing default/max constants. The repo itself takes only `cursor`; an `afterId` the tool or route already accepts stays there as an alias: `encodeListCursor({ position: [afterId] })` (id-only orders). Callers that read the old array move to `.items` in the same commit.

### T2 T-MEMORY — in-memory twin
`return pageFromArray({ rows: filtered, limit, cursor: optional.cursor ?? null, positionOf: (r) => [r.k, r.id], shape: ['string', 'string'] });` with the same limit clamp as the SQL repo.

### T3 T-TOOL — assistant list tool
Input schema: add `cursor: { type: "string", description: "nextCursor from the previous call. Omit for the first page." }` and `limit` (integer, 1..max). Handler: `const { limit, cursor } = parseListPageRequest({ value: input }, { defaultLimit: X, maxLimit: X });` → call the repo → `return { ...listPageForModel({ page, toolId: "<this tool id>" }), items: page.items.map(toView) }` — keep the tool's existing array key name too if its description names it (e.g. `members: page.items.map(toView)`), so: `{ members, nextCursor, more }`. Keep an existing `afterId` input as an alias mapped to `encodeListCursor({ position: [afterId] })` (id-only orders), refusing both at once; keep any existing "unknown afterId" refusal. Add `cursor` to the schema and update the schema contract test (members: `agent-tools.contract.test.ts`).

### T4 T-HTTP — GET route
`const { limit, cursor } = parseListPageRequest({ value: req.query }, { defaultLimit, maxLimit });` → `res.json({ <existingKey>: page.items.map(toResponse), nextCursor: page.nextCursor })`. KEEP the existing array key (no client breaks); ADD `nextCursor`. Map `ToolInputError` to `400 { error, code: "VALIDATION_ERROR" }`. If the route already parses `limit` leniently (bad limit → default) and a test pins that, keep that parse and read only `cursor` (members route does).

### T5 T-ADMIN — admin list screen/hook
Keep fetched pages in state; render a "Load more" button below the list while `nextCursor !== null` that fetches with `cursor=nextCursor` and appends. Follow `@jini-ai/admin` `EntityList` (`packages/admin/src/react/entities/EntityList.tsx`) and the theme's existing button. Never auto-load every page in a loop. Show nothing extra on the last page.

### X EXEMPT — leave alone
- X1 drain loop (called until fewer than `limit` come back), X2 ranked top-K search, X3 deliberate small display cap ("latest N" / collapse with show-all), X4 not a list cap (byte/memory/ring buffer, batch-size validator, ambiguity probe).

## Do NOT
- Use OFFSET paging (rows shift under concurrent writes); use a row-id-as-cursor that must still exist; restart at page one on a bad cursor.
- Return `total` instead of `nextCursor`, or rename an existing response key.
- Raise the limit as the "fix".
- `as any`, `!`, `eslint-disable`; delete "why" comments.

## Verify a site is fixed
1. Regression test FIRST (run, see RED): insert `limit + 1` rows; first page has `limit` items and a non-null `nextCursor`; second page (with that cursor) has the remaining row and `nextCursor: null`; together they contain every id exactly once. SQL repos via `describeEachDialect`; memory twin through the same body. Tools: first call output contains `more` and `nextCursor`. Routes: response has the old key plus `nextCursor`.
2. Mutation: change `limit(limit + 1)` to `limit(limit)` (or drop `nextCursor` from the response) → RED → restore.
3. Run one file only (commands in `lost-update.md` → Verify; same resolver shim).

## Status / remaining (2026-11-13)
Done: Jini mechanism on main (`w3-db-main` 64619ab41, unit tests). Members example (T1+T2+T3+T4, b1aed55c1): regression test 12/12 RED before, GREEN after; mutation `limit(limit + 1)`→`limit(limit)` 4 RED; route and tool mutations (drop `nextCursor`) RED. NOT done: T5 admin "Load more" for members (`apps/admin/src/features/members/`, `api.listMembers` in `apps/admin/src/lib/api.ts`) — a UI change; and the Jini release + Tovu bump.

## Decisions on the rows the first Terra run stopped on (2026-11-13, Opus)
Terra's first run: Tovu `84d9382e2` / Jini `d5680965c` (rows 1, 2, 6, 11, 12, 14, 15). Follow-up job: `list-cursor-followup.terra-prompt.md` (READY). Admin "Load more": `ui-lane.md`.
- Row 3 redirects: not a cursor site — the repo already loads every wildcard rule; the 500 cap is a deliberate per-request bound (OQ-01). Fix = refuse the 501st ACTIVE wildcard rule at write time with plain words.
- Row 4 commerce `listActive`: EXEMPT X4 — its one live caller reads 25 to decide "more than 24?"; nothing exposes the list.
- Row 5 routine runs: keep the lenient `limit` parse; cursor errors use the daemon adapter's own `validationError` (nested BAD_REQUEST → 400), not a flat `VALIDATION_ERROR` (unmapped there → 500).
- Row 7 visitor search: cursor position = `[slug, type]`, both already public in every result; order becomes slug order. No internal id ever enters the cursor.
- Rows 13/16 send log: split — the pipeline keeps `listByCampaign` (X1 drain); the tool and admin route move to a new `listByCampaignPage`.
- Row 17 DNS host picker: not a cursor — query the latest reachable publish per target (`listLatestReachableUrls`, max-id-per-target like `listDestinationHistory`); no stable row id needed.
- Row 18 other-site keys: keep the 50/site display cap but say so in words; `find`/`adopt` address one row by id, never through the capped list.
- Mechanism bug C1 (revised 2026-11-13 after Codex review): the arity came from `positionOf(first)`, so an empty list could not validate a cursor. Also, only primitive types were checked, so a string where a number belongs was accepted and could skip rows. Fix: an explicit `shape`, validated before the empty return (follow-up row C1). Callers already merged in the integration clone must be updated too.
- Later (not scheduled): a list discriminator inside `encodeListCursor` so a cursor from another list with the same position shape is refused instead of skipping rows (queries stay workspace-scoped, so no cross-tenant read).
- Bug logged for the owner: `features/newsletter/send-pipeline.ts:137` reads at most 100000 send rows for one campaign.
- OWNER questions: none.
