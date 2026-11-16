# 06 — Tovu `apps/admin/src/lib/api.ts` (replaces `AssistantDock.tsx`)

**Why this target:** `AssistantDock` is listed DONE on `origin/refactor/size-tovu` (4c3d6f46: state bundles + `DockChatPane`), so it is not redesigned. The next hardest Tovu entry in the 2026-11-11 ranking is hotspot **#2 overall**, `apps/admin/src/lib/api.ts`.

Measured at `origin/integ/wave-b-fixed`: 4,484 lines (2,522 code). Importers: 373 production files, 287 test files. 20 `vi.mock(…/lib/api)`, 45 files that `vi.spyOn(api, …)` or assign to `api.x`. Three tests read the file as text.

## 1. Current shape

| lines | content |
|---|---|
| 1-61 | imports; two re-export statements (58, 60) |
| 21-35 | `WORKSPACE_ID`, `BASE`, publish-content path builders |
| 62-2343 | **DTO types**: 147 exported interfaces, 45 type aliases, 3 const tables (`ADMIN_SITE_KEY_STATES` 929, `NO_THEME_ID` 1473, `CONTENT_TYPE_FIELD_KINDS` 1896), one stray function (`flattenAdmissionConnection` 440) |
| 2345-2451, 2839-2842 | `ApiError`, error codes, timeout/unreachable messages, `describeApiError` |
| 2464-2602 | fetch-failure translation, unauthenticated listeners, keepalive limit, `buildFetchInit`, JSON body parsing |
| 2629-2775 | `buildRequestFailedError`, `requestOnce`, `requestRidingOutRestart`, `request`, `requestPayload` |
| 2779-2801 | `authenticatedAdminRequest`, `authenticatedAdminUrl`, `adminSitePreviewUrl` |
| 2844-4484 | **`export const api = { … }`: one object literal, 219 methods, 1,018 code lines** |

Methods by first route segment (script-derived): `system` 46 · `mcp-servers` 13 · `assistant` 12 · `themes` 11 · `media` 11 · `taxonomy` 10 · `users` 9 · `posts` 8 · `auth` 7 · `policies` 7 · `recovery` 7 · `database` 6 · `plugins` 6 · `pages` 5 · `integrations` 5 · `fs-files` 5 · `members` 4 · `menus` 4 · `roles` 4 · `content-types` 4 · `entries` 4 · `trash` 4 · `publish-content` 5 · `widgets` 3 · `agent-plugins` 3 · `presentation` 2 · `workspace` 2 · `settings` 2 · 9 singletons.

Three responsibilities share the file: an HTTP transport, the DTO vocabulary of 40 features, and 40 feature clients. Every admin feature imports all of it to call two endpoints.

## 2. Target shape

```
apps/admin/src/lib/api-client/                 TRANSPORT ONLY — no feature vocabulary
  api-error.ts            ApiError, API_UNREACHABLE_CODE, REQUEST_TIMEOUT_CODE, messages, describeApiError    ~160
  fetch-failure.ts        errorName, throwTranslatedFetchFailure, fetchOrThrowUnreachable                     ~70
  unauthenticated.ts      listener set, onUnauthenticated, notifyIfUnauthenticated                            ~60
  fetch-init.ts           KEEPALIVE_MAX_BODY_BYTES, bodyFitsKeepalive, buildFetchInit                         ~60
  request.ts              parseJsonBody, buildRequestFailedError, requestOnce, requestRidingOutRestart,
                          request, requestPayload                                                             ~230
  admin-urls.ts           WORKSPACE_ID, BASE, authenticatedAdminRequest, authenticatedAdminUrl,
                          adminSitePreviewUrl                                                                 ~80

apps/admin/src/features/<feature>/api/          ONE CLIENT PER FEATURE
  <feature>-api.ts        export const postsApi = { listPosts, createPost, … } — methods moved verbatim
  <feature>-api.types.ts  the DTOs whose only producer is this feature's routes
```

Route segment → feature folder (all folders exist under `apps/admin/src/features/`):

| segment(s) | home | segment(s) | home |
|---|---|---|---|
| `auth` | `auth` | `users`, `roles`, `policies` | `users`, `roles` |
| `posts` | `posts` | `pages` | `pages` |
| `themes`, `presentation` | `themes` | `media` (+ the 3 URL builders) | `media` |
| `taxonomy` | `taxonomy` | `content-types`, `entries` | `collections` |
| `menus` | `menus` | `widgets` | `widgets` |
| `members` | `members` | `comments` | `comments` |
| `forms` | `forms` | `trash` | `trash` |
| `plugins` | `plugins` | `agent-plugins`, `mcp-servers` | `integrations` |
| `assistant`, `readyz` | `ai-assistant` | `settings`, `workspace` | `settings`, `workspace` |
| `database` | `database` | `recovery` | `recovery` |
| `publish-content`, publish destination | `publish-content` | `analytics` | `analytics` |
| `integrations` (webhook subscriptions) | `integrations` | `fs-files` | `fs-files` |
| `project-keys` | `providers` | `system/*` (46) | by **second** segment: deployment/dockerfile → `deployment`; observability/tool-gaps/server-logs → `observability`; mail → `email`; sites/site-profile/site-key/backup → `sites`; export/share/import → `import-export`; consent → `consent`; credentials (publish/custom/source-control) → `security` / `source-control`; daemon/subagents/permanent-deletes → `ai-assistant` |

Expected result: ~32 `*-api.ts` files (30-200 lines; `system` never becomes one file) and ~32 `*.types.ts` files (40-350 lines). `lib/api.ts` is **deleted**; there is no aggregate `api` object and no forwarding module.

### Why an object per feature, not free functions

45 test files spy on members and 20 mock the module. ES-module namespace exports cannot be spied on; an exported object can. `postsApi.listPosts` keeps every existing test technique working after a rename, and each object can be checked against the feature's existing port: `export const postsApi = { … } satisfies PostsApiPort` where a port interface already exists (`hooks/post-editor-port.hooks.ts`). New tests fake the port interface, they do not mock the module.

### Signatures

Methods move byte-for-byte, including their comments. The only edit allowed inside a moved method is replacing a `_options: Record<string, never> = {}` / `_optional: Record<string, never> = {}` placeholder parameter — and only in a **separate final commit per feature**, because it is a signature change that needs its call sites checked (owner args rule). `request`/`requestOnce` keep their current signatures.

Direction: `features/*/api/* → lib/api-client/*`; `lib/api-client/*` imports no feature. A feature that needs another feature's DTO imports the type from that feature's `api/*.types.ts` (type-only import).

## 3. Step order

0. **Inventory, no source change.** A ts-morph script (`development/scripts/api-split-inventory.mjs`, deleted at the end) writes `size-designs/work/api-members.tsv`: member, lines, first/second route segment, target feature, number of call sites, and for each DTO: which members reference it and which files import it. It also lists: dynamic access (`api[…]`), spreads of `api`, every `vi.mock`/`spyOn` site, and the three source-reading tests. **Stop and report** if any member has no rule-derived home or any DTO is produced by two features — those rows need an owner/coordinator decision (expected: `AdminUser`, a few shared envelope types → `lib/api-client/` is *not* their home; put them with `auth`).
1. Transport: create the six `lib/api-client/*` files; `api.ts` imports them. Repoint the non-`api` importers (`ApiError`, `describeApiError`, `onUnauthenticated`, `requestOnce`, …) by codemod. Delete the two re-export statements and repoint their users.
2. **One feature per commit**, smallest first (`forms`, `analytics`, `comments`, … `system/*` groups last):
   a. create `features/<f>/api/<f>-api.ts` + `.types.ts`, cut the members and DTOs out of `api.ts`;
   b. codemod: every property access `api.<member>` whose `api` resolves to `lib/api` → `<f>Api.<member>`, fix imports (add the feature import; drop `api` if unused); repoint type imports;
   c. tests: `vi.spyOn(api, "<member>")` → `vi.spyOn(<f>Api, "<member>")`; module mocks that override `<member>` get a second `vi.mock` for the feature module with the same factory body for those members. No assertion is edited.
   d. gate: admin `tsc`, the feature's tests, and every test file the codemod touched.
3. When `api` is empty: delete `lib/api.ts`, the inventory script, and the `api.ts` entries in `size-debt.json`.
4. Optional, per feature: the placeholder-parameter cleanup described above.

Every intermediate commit compiles because `api` still holds the members not yet moved.

## 4. Tests

- Before step 1 record the admin baseline as a list of failing test **names** (the suite has known red tests: `refactor/size-tovu` notes pages 190, themes 183, sites 48, AssistantDock 39). Each feature commit must leave that list unchanged.
- Characterization to add first: `lib/__tests__/api-request.characterization.test.ts` against a fake `fetch` — one case per transport branch: 200 JSON, 204, unparseable body, 401 (listener fired once), timeout code, unreachable code, `retryWrites` riding out a restart, keepalive body over the limit. It pins step 1.
- For step 2 the pin is a generated **request-shape table**: for every member, call it with a recorded sample argument against the fake `fetch` and snapshot `method, path, headers, body`. Generated once from the unmodified file by the inventory script (sample args from the parameter types; members needing hand-written samples are listed), re-run against the feature objects with a member→object map. 219 rows; any drift is a moved-code bug.
- The three source-reading tests: repoint to the file holding the anchor, keep assertions.

## 5. Risks

| risk | de-risk |
|---|---|
| 660 files touched; a missed call site | `api` shrinks to `{}` and is deleted — a missed site is a compile error, not a silent bug |
| module-mock tests silently stop intercepting (mock still targets `lib/api`, code now calls `postsApi`) | step 2c; then grep for any remaining `lib/api` string; the request-shape table uses the real objects |
| DTO owned by several features → import cycles between feature `api/` folders | step-0 inventory flags them before any move; type-only imports |
| `system/*` mapping judgment | table above + stop-and-report on unmapped second segments; never a `system-api.ts` dumping ground |
| churn collision: `api.ts` has 194 commits in 90 days | run in one sitting on a quiet branch; rebase per feature commit is trivial (cut/paste) but the codemod must be re-run after each rebase |

## 6. Interaction with planned work

- `CLASSIFY-files.tsv`: `api.ts` is MIXED ("see breakdown" — not in the files given to this run). The transport half is generic: `lib/api-client/*` is the candidate for `@jini-ai/ui/fetch-query` (Tovu already has `lib/fetch-query/`). Flag; do not move here.
- Admin features slated to MOVE to `@jini-ai/admin` / `@jini-ai/user-management` take their `api/` folder with them as a host-bound port implementation — this split is what makes those moves file-level.
- Untangle lanes R1/R2 edit Jini admin only; `apps/admin/src/main.tsx` (coordinator-serialized) is not touched.
- **Owner decision needed:** the 2,280 lines of hand-written DTOs duplicate what `packages/contracts` / `openapi/` are for. This design moves them verbatim; replacing them with generated/contract types is a separate decision.

## 7. Estimate

≈40 commits. Sonnet executor **≈720k tokens** (inventory + request-shape table 90k; transport 70k; 32 feature commits × 16k; cleanup 50k). Risk: **medium-high** — mechanical, compile-checked, but the widest blast radius of the ten.
