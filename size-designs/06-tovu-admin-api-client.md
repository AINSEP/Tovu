> **Revision 2:** read `## Revision 2` at the end first; it overrides the sections above where they differ.

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


## Revision 2 (2026-11-16, after the Codex judgment)

Re-verified at Tovu `integ/wave-b-r2` (65302ee5): `apps/admin/src/lib/api.ts` 4,484 lines, 254 functions, none over 50 code lines. **642 files import it; 19 test files `vi.mock` it**; `development/scripts/check-admin-api-routes.ts:93-94` reads it by path. The admin app runs **vitest**. Judge: "needs rework" (6 majors, 2 minors). **8 accepted (one with a different staging than proposed), 0 rebutted.**

### R1. Changes to the target (override §2-§4)

1. **Transport layering (no cycle):**
   ```
   lib/admin-http/
     config.ts          BASE ("/api/admin/v1", api.ts:23), WORKSPACE_ID (21)            imports nothing
     request.ts         requestOnce (2671), requestRidingOutRestart, request (2719),
                        authenticatedAdminRequest (2779), ApiError                      imports config
     urls.ts            URL-only builders                                               imports config
   ```
   `requestOnce` reads `BASE` (2675) and `authenticatedAdminRequest` calls `request` (2783-2790); both now point downward. §2's `admin-urls.ts` that held `BASE` **and** `authenticatedAdminRequest` is replaced by this.
2. **`request` complexity 11 → split:** the inner `try { if (error instanceof ApiError && (status === 0 || status >= 500)) publishAdminFailure(…) } catch {}` (2726-2730) becomes `publishFinalFailure(required)` with the comment "Notice effects must never replace the original request rejection" moved with it. `request` keeps try → `requestRidingOutRestart` → catch → publish → rethrow. Characterization first: 500 and network error publish once with the same body/path/method/generation; 4xx does not; a throwing publisher still rejects with the **original** error.
3. **Self-references to the aggregate.** Four method bodies read `api.` and cannot move byte-for-byte: `api.me` (2860), `api.pollExternalMcpOAuthDevice` (3352), `api.mediaOriginalUrl` (3422), `api.spec` (3571). Rule: a self-reference is rewritten to the **feature object it now lives in** (`mediaApi.mediaOriginalUrl`), keeping the late property lookup so a `vi.spyOn(mediaApi, 'mediaOriginalUrl')` still intercepts. If caller and callee land in different features, the caller moves to the callee's feature file (they are one responsibility); it never imports a sibling feature client. Step 0b lists the four sites with caller, callee and chosen file; the sheet is reviewed before step 2. These four are the only authorised body edits.
4. **Mock factories are migrated, not copied.** The 19 `vi.mock("…/lib/api")` factories return `{ ...actual, api: { ...actual.api, ...overrides } }`. For a feature module that exports `mediaApi` the same body overrides nothing. Per test file, in the commit that moves the methods it overrides: mocked specifier → the feature module; export key `api` → `<feature>Api`; `actual.api` → `actual.<feature>Api`; `importOriginal<typeof import(…)>` type path; if a test overrides methods of two features it gets two `vi.mock` calls. **Proof of interception:** for each migrated test, remove one override and run it — it must fail; restore. The executor records that check in the commit message.
5. **Synchronous URL builders are a separate class.** `templatePreviewUrl` (2921), `mediaOriginalUrl` (3409), `mediaPreviewRenditionUrl` (3417) return strings and never fetch. The request-shape table covers fetching members only (216 of 219 if the member count stands; step 0b recounts); the three builders get return-value snapshots. Existing response-transformation and option-branch tests stay.
6. **Host clients stay in Tovu.** §6's "features take their API folders into `@jini-ai/admin` / `@jini-ai/user-management`" is **withdrawn**. These clients hard-code Tovu's base path, workspace and routes; untangle `DESIGN.md` §3 keeps implementation bindings in the host and gives packages ports. Only a generic transport mechanism could ever be a Jini candidate, behind an injected contract, and nothing here creates one. The `PostsApiPort` example is removed: the real port is `PostEditorPort`, already bound in `post-editor-dependencies.hooks.ts:13-25`.
7. **Tool consumer:** `check-admin-api-routes.ts` is updated in the final commit to read the feature client files and `lib/admin-http/urls.ts` (a glob over `apps/admin/src/**/api/*.api.ts` — the exact glob comes from the final tree). No forwarding file is kept for it.
8. **Green baseline is a prerequisite.** "The same failing test names as before" is no longer an accepted gate. Step 0 runs `npx vitest run` in `apps/admin` and `npm run typecheck` on the unmodified base; if either is red the executor stops and reports the failures (owner decision 06-b: fix first or grant a named exception). Every later commit must be green.

### R2. Signatures (practice 2) — staged, not optional

The judge counted 62 zero-parameter and 42 one-parameter methods (not re-measured here). They break `(required, optional = {})`. Changing 219 signatures touches call sites in up to 642 files, so it is **not mixed into the move** (one refactor type per change), but it is no longer "optional":

- **Phase 1 (this design):** move, repoint, delete `lib/api.ts`. No signature changes except R1.3.
- **Phase 2 (mandatory follow-up, one commit per feature client):** each method becomes `(required, optional = {})`; every caller of that client is updated in the same commit; the request-shape table must stay byte-identical. A method with no inputs is `(required: Record<string, never>, optional = {})` only if the repo rule requires the placeholder — **owner decision 06-c**, because practice 2 also says "never `?: Record<string, never>`". Until that is answered phase 2 covers the 42 one-parameter and the multi-positional methods only.

### R3. Migration graph (overrides §3)

| # | commit | needs |
|---|---|---|
| 0a | green baseline; request-shape table (fetching members), URL-builder snapshots, `request` failure-publish tests | — |
| 0b | sheets: member → feature file; importer → members used (642 files); 19 mock factories → members overridden; 4 self-references; tools reading the path | — |
| 1 | `lib/admin-http/config.ts`, `request.ts` (with the `request` split), `urls.ts`; `api.ts` imports them | 0 |
| 2 | one feature client per commit: methods + their DTO types + the callers and mock factories of those methods | 1 |
| 3 | delete `lib/api.ts` (and its re-export lines 58/60); update `check-admin-api-routes.ts` | all of 2 |
| P2 | phase 2 signatures, one feature per commit | 3 + decision 06-c |

A feature-client commit is atomic: after it, no file imports a moved member from `lib/api.ts`, and `api` no longer has that member (so a missed caller is a compile error, not a silent stale path).

### R4. Owner practices check

| # | status |
|---|---|
| 1 DI | unchanged in phase 1: components still import a concrete client. **Conflict flagged:** practice 1 wants features to receive a port from the host; today only the post editor does (`PostEditorPort`). Binding every feature to a port is outside a size split — listed as follow-up, per feature |
| 2 args | R2 |
| 3 size | no function over 50; `request` complexity fixed (R1.2); files ≤500 after the split |
| 4 slicing | one client file per admin feature, DTOs beside their client |
| 5 no re-exports | `lib/api.ts` deleted, lines 58/60 gone, no forwarder |
| 6 comments | move with methods |
| 7 boundaries | nothing moves to Jini (R1.6) |
| 8 tests | **conflict flagged:** the 19 tests use `vi.mock` of a module. It is the app's own module, not another package's internals, so it does not break practice 8's letter; replacing module mocks with injected fakes belongs to the port follow-up in row 1 |
| 9 errors | no text changed; the failure-publish path is pinned |
| 10 | no silent change; R1.3 edits are listed |
| 11 | no new abstraction |
| 12 memory/IO | no request added or removed; table proves the same requests |

### R5. Estimate

Phase 1: ≈44 commits, Sonnet **≈820k tokens** (was 720k: sheets, mock-factory migration with interception proof). Phase 2: ≈25 commits, ≈450k, not in the total until 06-c is decided. Risk: **medium-high**.

## Judge response

| # | sev | verdict | what changed / evidence |
|---|---|---|---|
| 1 | major | accepted | `api.mediaOriginalUrl` at 3422 confirmed; three more found (2860, 3352, 3571). R1.3 |
| 2 | major | accepted | 19 `vi.mock` factories of `lib/api` on this base. R1.4, with a per-test interception proof |
| 3 | major | accepted | `BASE` (23) read at 2675; `authenticatedAdminRequest` (2779) calls `request`. R1.1 |
| 4 | major | accepted, staged differently | Complexity: fixed now (R1.2). Signatures: made mandatory but as phase 2, per feature, because mixing 219 signature changes into a move breaks "one refactor type per change"; the zero-parameter form needs decision 06-c |
| 5 | major | accepted | `BASE`/`WORKSPACE_ID` hard-coded at 21-23; untangle DESIGN §3. R1.6 |
| 6 | minor | accepted | Three synchronous builders at 2921, 3409, 3417. R1.5 |
| 7 | minor | accepted | `check-admin-api-routes.ts:93-94` reads the path. R1.7 |
| 8 | major | accepted | R1.8: green baseline or stop |

Accepted 8 · rebutted 0 · blockers left 0.
