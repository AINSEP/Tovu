# Build: `content_post_duplicate` + the two silent-failure surfaces + the misleading `page.navigate` error (2026-09-07)

Programmer. Bootstrap confirmed: `AI-Dev-Shop/agents/programmer/skills.md` loaded. Design followed:
`ADS-memory/reports/2026-09-07-page-tool-gap.md` (Software Architect). Per the owner's override
recorded there, this is Option A — the first-class tool, not the compose-it-yourself fallback.

## Task 1 — `content_post_duplicate`

**Files:**
- `apps/website/src/features/post/duplicate-embeds.ts` (new) — pure widgetEmbed placement-copy logic.
- `apps/website/src/features/post/agent-tools.ts` — new catalog entry + header count fix (3 reads / 4 writes).
- `apps/website/src/features/post/tool-registrations.ts` — handler, `postDerivedRisk` entry,
  `resolveAdminUrl`, `PostToolDeps.pagesHtmlStore` (optional, structural).

**Signature:** `content_post_duplicate({ id, kind, title?, slug?, status? })`, permission
`content.write` (mirrors `content_post_create`). `kind` plays the SAME disambiguation role it plays
in `content_post_get`/`content_post_update` (disclosed asymmetry: `kind:"page"` guards a mismatched
actual `kind:"post"` row as not-found; `kind:"post"` does not guard the other way). The COPY's own
`kind` is always the SOURCE's real kind — kind is immutable once created, so a copy can never be a
different kind than what it copies, regardless of which `kind` value the caller passed to disambiguate.
`title` defaults to `"Copy of <source title>"`, `slug` defaults via `createPost`'s own derivation
(same collision disambiguation), `status` **always** defaults to `"draft"` even when the source is
published — a copy must never silently go live.

### The widgetEmbed decision — **(1), the deep-copy path, genuinely supported by existing seams**

I read `widgets/embed-service.ts` (read-only — not in the excluded-files list, which only covers
`contracts/core/embeds/marker.ts` and `widgets/resolver-service.ts`) to find the real data model.
Finding, confirmed by `collectEmbeds`: a `widgetEmbed` node's `attrs` carries **both** `placementId`
*and* `widgetEntryId` inline — not just `placementId`, contrary to `agent-tools.ts`'s own published
`TIPTAP_DOC_SCHEMA` (documentation for the model, not a runtime validator, per that file's own
header; the mismatch is pre-existing and out of this dispatch's scope, noted in
`duplicate-embeds.ts`'s header rather than fixed, since `content_post_duplicate` never authors a
`bodyJson` from scratch). There is no separate "placement" table keyed by `placementId` alone —
every real lookup (`loadHostEntry` + `removeEmbedByPlacementId`) combines it with the host entry's
own id. `widgetEntryId` is the actual live reference to a reusable widget instance, and referencing
the same instance from multiple documents at once is the intended, supported shape of a widget
(`widgets_get_instance`'s own "where-used" disclosure names multiple simultaneous references as
normal).

So the correct deep copy needed **no call into the widgets domain at all**: `duplicate-embeds.ts`'s
`copyBodyJsonWithFreshEmbedPlacements` walks the copied `bodyJson` tree and mints a **fresh
`placementId`** on every `widgetEmbed` node (via `idGen.newId()`, the same minting `insertWidgetEmbed`/
`reorderEmbedSlots` already use) while carrying `widgetEntryId` over **unchanged**. This removes any
future ambiguity about `placementId` uniqueness across rows while preserving the intended,
documented shared-widget-instance behavior — it is not a workaround, it is the actually-correct
semantics once the real node shape was confirmed.

Regression coverage: `duplicate-embeds.test.ts` (pure function, 6 cases including nested/malformed
nodes) and `tool-registrations.duplicate.test.ts`'s dedicated widgetEmbed test, which asserts BOTH
that the copy's `placementId` differs from the source's AND that **the source row's own `bodyJson` in
the repo is completely untouched** after duplicating it — the actual silent-corruption regression.

### HTML-bodied pages — covered

Bespoke-HTML pages (`bodyFormat: "html"`, written via `pages_write_html`) are a separate body column
`content_post_create`/`createPost` cannot touch (CIC-3). `content_post_duplicate` reads the source's
HTML via a new optional `PostToolDeps.pagesHtmlStore` (structurally typed locally — see below — to
avoid a module cycle) and seeds it onto the new row via `ensureHtmlFormat`, mirroring
`pages_write_html`'s own sequence.

If `pagesHtmlStore` is absent, the call is **rejected before anything is written** (source is read,
but the new row is never created) with an explicit message naming the page and saying its content
was never copied — never a silently empty/broken copy. Test:
`tool-registrations.duplicate.test.ts`'s "NO pagesHtmlStore wired" case asserts both the rejection
AND that no orphan row was left behind (`postRepo.list()` count unchanged).

**Module-cycle avoidance:** `features/pages` already imports `PostRepoPort` as `import type` from
`features/post`. Importing `features/pages`'s real `PagesHtmlDocumentStoreFactory` type into
`features/post` would close a cycle `check:architecture` would flag. Declared a structurally
identical `DuplicatePagesHtmlStoreFactory` locally instead — the same Option-B-style injection this
file's own `contributePostTools` history already documents for `listPublishedPosts`/
`extractGitHubLogin`. **No composition-root change was needed**: `server/routes/types.ts`'s
`RouteDeps.pagesHtmlStore` already carries the real factory, and every `PostToolDeps` this repo
constructs in production is built from (or assignable from) that same object — confirmed by a clean
root `tsc` with the new field added (see below).

## Task 2 — the three silent-failure surfaces

1. **`tool-search-keywords.ts`** — added "copy duplicate clone" to `content_post_search`/`_list`/
   `_get`/`_create`, plus a full new entry for `content_post_duplicate` itself phrased from the
   failing production request's own words. Test: `tool-search-keywords.content-post-copy.test.ts`.
2. **Registration wiring** — proven by the RED phase itself: before the handler existed,
   `buildPostRegistrations` threw *"post catalog entry 'content_post_duplicate' is neither wired nor
   declared unwired"* (the file's own no-`unwiredToolIds` tripwire) on every test that called it —
   captured verbatim in the RED run. Every one of `tool-registrations.duplicate.test.ts`'s 11 tests
   now exercises the tool through `buildPostRegistrations` end to end (real handler, real
   `executeCommand`, real in-memory repo), not a unit test of an unwired function.
3. **`adminUrl` on `content_post_get`/`_list`/`_create`** (and, as a natural consequence of sharing
   the same projection helper, `content_post_duplicate` too) — added `resolveAdminUrl` mirroring
   `apps/admin/src/features/pages/rules.ts`'s `pageAdminPath` (slug-preferred, id-fallback only for
   the literal root slug) and `apps/admin/src/features/posts/rules.ts`'s documented `/admin/posts/{id}`
   route, both prefixed with `/admin` (`@jini-ai/admin/core`'s `DEFAULT_ADMIN_BASE`). Extended, not
   replaced: `tool-registrations.public-url.test.ts`'s existing loose-field assertions all still pass
   unchanged. New file: `tool-registrations.admin-url.test.ts` (7 cases: post/page, slug vs id
   fallback, draft-is-never-null unlike publicUrl, list, create, duplicate).

## Task 3 — the misleading `page.navigate` error

Fixed Tovu-side only, per the constraint — no Jini package edited.

- `apps/website/src/assistant/rewrap-page-navigate-error.ts` (new): `rewrapPageNavigateError` (pure,
  pattern-matches `page-executor.ts:414`'s exact refusal text, rewraps with a message naming the real
  cause — an unregistered admin-screen id, not a missing CMS page — and steering toward
  `content_post_search`/`_get`/`_list`/`_duplicate`); `withPageNavigateErrorRewrap` (wraps only the
  `page.navigate` `ToolRegistration`'s handler in a `try`/`catch`, every other registration passed
  through as the identical object).
- `agent-daemon-server.ts`: one import + the existing registration loop now iterates
  `withPageNavigateErrorRewrap(frontendControl.toolRegistrations)` instead of the bare array.
- Wiring proof: `agent-daemon-server.page-navigate-error-rewrap.unit.test.ts`, reading the file's
  SOURCE (this file boots a real port/DB on import, so it is never imported directly by tests — same
  convention `agent-daemon-server.attachment-kind-filter.unit.test.ts` already established), anchored
  on the specific loop (this file has two `for (const registration of ...)` loops; the anchor is
  scoped to the one that names `withPageNavigateErrorRewrap(frontendControl.toolRegistrations)`
  precisely, not the generic prefix, after an initial false-positive anchor match was caught and
  fixed).

## RED → GREEN evidence

| Behavior | RED | GREEN |
|---|---|---|
| `duplicate-embeds.ts` pure function | implemented then tested (design was fully specified; 6/6 pass first run) | 6/6 pass |
| `rewrapPageNavigateError`/`withPageNavigateErrorRewrap` | `ERR_MODULE_NOT_FOUND` (module didn't exist) | 8/8 pass |
| `agent-daemon-server.ts` wiring | anchor initially matched the WRONG loop (`assistantRegistrations`), caught and fixed | 3/3 pass |
| `content_post_duplicate` handler | `buildPostRegistrations` threw "neither wired nor declared unwired" on all 11 tests | 11/11 pass |
| `adminUrl` | implemented alongside the handler (not isolated RED) | 7/7 pass |
| `tool-search-keywords` coverage | n/a (additive vocabulary, not logic) | 2/2 pass |

Full regression sweep (one `node --test` invocation per file, all from repo root,
`TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json`): every test in `features/post/__tests__/`,
`assistant/__tests__/{frontend-control-capabilities,tool-search-keywords*,rewrap-page-navigate-error}`,
`server/inbound/assistant/__tests__/{agent-daemon-server*,capability-manifest-prefix}`,
`features/pages/__tests__/*`, `features/widgets/__tests__/repo.contract` — **all green, zero
regressions**. `serve-command*.integration.test.ts` were NOT run (hard constraint).

## Root `tsc`

`npx tsc -p tsconfig.json --noEmit` currently exits **non-zero**, but the two errors are entirely
inside `apps/website/src/features/external-mcp/tool-registrations.ts` — an **untracked file this
session never touched**, confirmed by `git status`/`git diff` to belong to a different, concurrently
running agent's in-progress work (`apps/website/src/assistant/tool-registrations.ts` and
`agent-daemon-port.ts` also carry unrelated concurrent diffs referencing `ExternalMcpToolDeps`/
`SaveExternalMcpServerInput`, matching that same in-flight change). Zero errors trace to any file this
task touched. I did not attempt to fix or work around it — out of scope and not mine.

Test files themselves are not covered by root `tsc` (excludes `__tests__`) — no separate
type-checking command for `apps/website` test files was found in this repo (`tsconfig.tests.json`
excludes `apps` entirely). Verified only by successful `tsx` execution, consistent with this
project's own documented gap on this point.

## Scope discipline

- Did not touch `apps/website/src/cli/__tests__/**` (other agents' tree).
- Did not touch `contracts/core/embeds/marker.ts` or `widgets/resolver-service.ts` (read
  `widgets/embed-service.ts` only, which was not excluded, to establish the real node shape).
- Did not touch any Jini package.
- Did not touch `apps/admin/src/**` — read `apps/admin/src/features/{pages,posts}/rules.ts` and
  `apps/admin/src/lib/router.ts` only, to mirror their logic independently in `apps/website`.
- Did not run any `serve-command*.integration.test.ts`.
- No database writes outside test fixtures (`InMemoryPostRepo`/`InMemoryPagesHtmlDocumentStore`
  throughout).

## What remains open

- The pre-existing, unrelated `agent-tools.ts` `TIPTAP_DOC_SCHEMA`/`widgetEmbed` schema mismatch
  (documents only `placementId`, the real node also carries `widgetEntryId`) is disclosed in
  `duplicate-embeds.ts`'s header but not fixed — out of this dispatch's scope, and not something
  `content_post_duplicate` itself needed to correct (it never authors a `bodyJson` from a schema).
- The `features/external-mcp` root-`tsc` break is another agent's in-progress work, not mine to fix.

Commit sha(s): recorded after this report — see the reply message.
