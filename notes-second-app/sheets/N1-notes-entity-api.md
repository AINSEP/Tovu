# N1: note entity port, JSON entity routes, search, stale-write protection

## Revision 2 corrections (authoritative; they replace the steps they name)

**Judge 6 (lesson 38): `version` is not a creation field.** The descriptor marks `version` as persisted-only
(read-only, not required on create). This needs the create/persisted split from `GA-admin-entity-seams.md`; until it
lands, STOP rather than declaring `version` required. A person is never asked for a concurrency token.

**Judge 10:** the status field has all three service states: `draft`, `published`, `unpublished`
(`packages/cms/src/entries/types.ts:16`). Publish then unpublish ends in **`unpublished`**; fix the test. `slug` is
shown read-only after creation: `updateEntry` accepts no slug (`write-service.ts:347-371`).

**Judge 12:** `listEntries` takes `{ repo, workspaceId }` and forwards only `type`; there is no `limit`. Remove the
"200-row bound" claim and the `{ type, limit }` call. v1 search filters the rows the service returns, and the sheet
says so in the README ("reads the whole collection; fine for a demo, not a database bound"). A real bound is gap
**G20** (S2's owner). `search` in `AdminEntityListQuery` comes from `GA-admin-entity-seams.md`, a prerequisite here.

---

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/notes-n1-entity-api`. Touches only `examples/notes-app/**`.
Prerequisite: N0 merged. Estimate: ~90k Sonnet.

## Goal

Expose notes as one `AdminEntityPort` (the contract `@jini-ai/admin`'s entity screens consume) over the
existing `@jini-ai/cms/entries` services, reachable as JSON under `/api/entities/note`, with text search and
optimistic concurrency. No new note logic: the port is a mapping, the services stay the owner.

## Inventory (expected on merge-b)

```sh
sed -n 150,300p packages/admin/src/core/ports/entities.ts   # AdminEntityDescriptor, AdminEntityRow, AdminEntityListQuery, AdminEntityPage, AdminEntityPort (positional get/update/remove?)
node -e 'const j=require("./packages/admin/package.json");console.log(j.exports["./core"], j.jini.entries?.["./core"])'
rg -n "export type EntryStatus|interface EntryRecord" -A 24 packages/cms/src/entries/types.ts
rg -n "export (async )?function (createEntry|updateEntry|publishEntry|unpublishEntry)" -A 6 packages/cms/src/entries/write-service.ts
rg -n "listByWorkspace" -A 8 packages/cms/src/entries/list.ts
```

Expected: the port has `list(query?)`, `get(id)`, `create(input)`, `update(id, patch)`, optional `remove(id)`;
entry writes take `{ deps, input }` with `expectedVersion` and return a `Result` (`ok`/`error`);
`listByWorkspace` has no text option.

## Behavioural bindings to check (lesson 12)

| Port side | Service side | Mapping rule |
|---|---|---|
| `update(id, patch)` positional, no version | `updateEntry({ deps, input: { id, expectedVersion, … } })` | `patch.version` is **required** by this adapter; missing -> reject as validation error; pass it as `expectedVersion` |
| row `body: string` | `bodyJson: { text }` | same shape notes-app already uses (`noteBody`) |
| row `status: 'draft' \| 'published'` | `publishEntry` / `unpublishEntry` | a patch that changes `status` calls the matching service **after** `updateEntry` (if other fields changed) using the version the first call returned; a status value outside `EntryStatus` is a validation error |
| `list({ limit, cursor, search })` | `listEntries({ repo, workspaceId }, { type, limit })` | no cursor on the service: return `nextCursor: null` and cap `limit` at 200 (state the bound in a comment) |
| `remove` | none (entries have no delete) | **omit** `remove`; the screen then shows no delete control |
| errors | `Result.error` / thrown `entryVersionConflictError` | adapter throws typed `NoteEntityError { code: 'VALIDATION' \| 'NOT_FOUND' \| 'CONFLICT' }` |

## Files

| File | Content | Limit |
|---|---|---|
| `src/notes-entity.ts` | `NOTE_DESCRIPTOR` (`name: 'note'`, `titleField: 'title'`, fields: `title` text required queryable, `slug` text required, `body` text, `status` text, `version` integer required, `updatedAt` datetime) and `createNoteEntityPort({ deps }, optional = {})`. Use `import type` from `@jini-ai/admin/core` only (no runtime import of admin in the server). Add `@jini-ai/admin` to `dependencies`. | app mapping, stays; <= 150 lines |
| `src/gaps/note-search.ts` | `// GAP: G3`. Pure `filterNotesByText({ rows, text }, { limit = 50 } = {})`: case-insensitive substring over `title` and `body`, trims the query, empty query returns the input capped at `limit`. Complexity note: O(rows x text length), rows bounded by the 200 cap. | <= 40 |
| `src/gaps/entity-routes.ts` | `// GAP: G6`. `registerEntityRoutes({ app, port, basePath }, optional = {})` on the `Server` contract: `GET basePath` (query `limit`, `cursor`, `search`), `GET basePath/:id`, `POST basePath`, `PATCH basePath/:id`, `DELETE basePath/:id` only when `port.remove` exists. JSON body limit 256 KB (reuse `request-body.ts` from `@jini-ai/core/contracts/server` if it exports a bounded reader; say which). Error mapping: VALIDATION 400, NOT_FOUND 404, CONFLICT 409, each `{ error: { code, message } }`. Generic over the port: no `note` word in this file. | <= 120 |
| `src/routes/entities.ts` | wires `registerEntityRoutes({ app, port: noteEntityPort, basePath: '/api/entities/note' })` and `GET /api/session` returning `{ user: { id: OWNER_ID, … } }` in the `AdminAuthUser` shape (read `packages/admin/src/core/ports/auth.ts`). | wiring |
| `GAPS.json` | add both gap files with budgets. | |

## Tests first

| # | Test | Must fail when |
|---|---|---|
| T1 | `notes-entity.test.ts` with `InMemoryEntryRepo`: create -> row has `version` 1 and `status` draft; update title with current version -> version increments; **stale write**: two reads, first update succeeds, second with the old `version` throws `CONFLICT` and the stored title is the first writer's. | `expectedVersion` is dropped or taken from the stored row instead of the patch |
| T2 | same file: update without `version` -> `VALIDATION`; status `draft -> published` calls publish (row status published); `published -> draft` unpublishes; status `'banana'` -> `VALIDATION`; title + status in one patch -> both applied, final version = start + 2. | the status branch is skipped or uses a stale version for the second call |
| T3 | `note-search.test.ts`: 3+ rows with the matching row first, middle, last (three cases); case-insensitive; body-only match; whitespace-only query returns all (capped); `limit-1`, `limit`, `limit+1` rows. | `some`/`every` or `>`/`>=` mutations |
| T4 | `entity-routes.test.ts` through `createInMemoryServer` with a fake port object implementing `AdminEntityPort` (3 rows): list, list `?search=`, get 404, create 201 + body row, patch 409 body `error.code = 'CONFLICT'`, patch 400 on invalid JSON, body over the limit -> 413, `DELETE` -> 404/405 when the port has no `remove`, and 204 with a fake that has one. Then the HOSTILE table (`undefined`, `null`, `[]`, `{}`, `0`, `""`, `true`, string-for-object) as POST bodies: each is 400, never a 500. | error mapping or the missing-`remove` branch is wrong |
| T5 | add to N0's origin-guard test: the new `/api/entities/note` POST/PATCH are refused cross-origin. | routes are registered outside the guard |

## Steps (commit each)

1. T1–T2 red, then `notes-entity.ts`. 2. T3 red, then `note-search.ts`. 3. T4 red, then `entity-routes.ts`.
4. Wire `routes/entities.ts` into `registerNotesApp`; T5; update `GAPS.json`; README route list.

## Acceptance

Example-server gates of COMMON + `gaps`. `rg -n "note" examples/notes-app/src/gaps/entity-routes.ts` is empty.
The existing HTML routes and `scripts/smoke.ts` are unchanged and pass.

## Not verified by the planner

`EntryStatus` members; the exact `Result` error shape of the write services; whether `request-body.ts`
exports a bounded JSON reader; the `AdminAuthUser` fields.
