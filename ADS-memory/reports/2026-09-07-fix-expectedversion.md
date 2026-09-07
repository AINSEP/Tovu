# Fix report — the `expectedVersion` cluster (C01 / C02 / SEO-01 / arch §4.15)

Agent A (Programmer, Execution). Branch `restructure/apps-website-phased`. Started 2026-09-07.

Scope: `apps/website/src/features/post/**`, `apps/website/src/features/seo/write-service.ts`,
`apps/website/src/server/inbound/admin-http/routes/pages/update.ts`. Nothing in `apps/desktop/`,
`apps/admin/`, or MCP/media-import.

---

## Verification pass (every audit claim read against source before touching anything)

### C01 — VERIFIED (audit claim is accurate)
- `apps/website/src/features/post/post.ts:974` — `assertExpectedVersion(existing, input.expectedVersion)`
  is a pure in-memory compare (`post.ts:919-927`) against the row read at `:969`.
- Between it and the write: `:977 await assertSlugAvailableForUpdate` (repo read),
  `:982 await runBeforeSaveHook` (plugin hook, arbitrary latency), then `:998 await deps.repo.save(post)`.
- `apps/website/src/features/post/repo.sqlite.ts:163-187` — `save()` is
  `INSERT … ON CONFLICT(target: posts.id) DO UPDATE SET …` with **no** `version` in the predicate.
  Confirmed by reading the `onConflictDoUpdate` `set` list: 16 columns, no `where`.
- `apps/website/src/features/post/repo.memory.ts:61-69` — same shape (`findIndex` on `record.id`,
  unconditional overwrite).
- The doc comment at `post.ts:906-918` does say "Optimistic-concurrency compare-and-set". It is a
  compare, then an unconditional set. **The audit's reading of the comment is correct.**
- The correct primitive is in the same file: `repo.sqlite.ts:234-251` `writeAutosave` uses
  `eq(posts.version, required.snapshot.baseVersion)` and reports `applied: result.changes > 0`.

### C02 — VERIFIED (audit claim is accurate)
- `routes/pages/update.ts:22-32` `parsePageUpdateBody` returns exactly
  `Pick<UpdatePostInput, "title" | "slug" | "bodyJson" | "status">`. No `expectedVersion`.
- `:154` `...parsePageUpdateBody(req.body)` is the only spread into `updatePost`'s `input`.
- `:35-57` `sendPageUpdateError` has no `PostVersionConflictError` branch — and since
  `PostVersionConflictError extends PostConflictError`, the `:48` branch would answer it as
  `SLUG_CONFLICT` if one ever reached the route.
- Contrast `routes/posts/update.ts:47` (`expectedVersion: parseExpectedVersion(body.expectedVersion)`)
  and `:75-79` (the `PostVersionConflictError` branch placed deliberately BEFORE `PostConflictError`).

### SEO-01 — VERIFIED (audit claim is accurate)
- `apps/website/src/features/seo/write-service.ts:215-229` — `findById` (await), merge, then
  `postRepo.save({ ...existing, seoExtJson, version: existing.version + 1 })`. No predicate.

### arch §4.15 — VERIFIED
- Four `updatePost` call sites; the pages arm is the one without the guard, exactly as claimed.
  `features/pages/html-document-store.sqlite.ts` is the third mechanism (store-remembered version).

---

## RED evidence

### C01 — `apps/website/src/features/post/__tests__/post.concurrent-save.test.ts`
Command (repo root): `node --import tsx --test apps/website/src/features/post/__tests__/post.concurrent-save.test.ts`

Why the EXISTING suite proves nothing: every test in `post.optimistic-concurrency.test.ts` is
sequential — operator A's promise is fully awaited before B starts — so it passes under the broken
code and the fixed code alike. The new file interleaves two real `updatePost` calls across the
compare→write window by parking operator A inside the before-save hook.

```
✖ C01: a save that passed the version compare must NOT land after another save won the row while it sat in the before-save hook (5.264829ms)
  AssertionError [ERR_ASSERTION]: Missing expected rejection.
      at async TestContext.<anonymous> (post.concurrent-save.test.ts:123:3)
    operator: 'rejects'

✖ C01: two saves from the same basis interleaved through the hook produce exactly one winner, not two 200s (2.245327ms)
  AssertionError [ERR_ASSERTION]: the second save must be rejected, not silently applied
  + actual - expected
  + 'fulfilled'
  - 'rejected'

ℹ tests 2 / pass 0 / fail 2
```

`Missing expected rejection` is the exact failure the finding predicts: the stale save resolves 200.

---

## Status: all four closed. See the Findings section below.

### C02 — `apps/website/src/server/__tests__/routes/pages-update-expected-version.test.ts`
Command (repo root): `env -u TOVU_ADMIN_PASSWORD node --import tsx --test apps/website/src/server/__tests__/routes/pages-update-expected-version.test.ts`

(`env -u TOVU_ADMIN_PASSWORD` is mandatory — with it exported, `/auth/login` 401s and every
assertion fails at the harness, not at the finding.)

Harness note: `createApp()` with no arguments is the HERMETIC in-memory composition
(`app.ts:263 createRouteDeps`, "In-memory route deps seeded from `./seed`. Default for tests/dev.")
— no filesystem, no `content.db`. `pages-update-html-auth.test.ts:52-54` claims the opposite
("that boots the real composition root against the real `content.db`"); that comment is FALSE and
should go in the false-comment register.

```
✖ C02: PUT /pages/:id with a stale expectedVersion is refused 409 VERSION_CONFLICT, and the winning content survives
  AssertionError: a stale basis must be refused, got 200: {"post":{...,"version":3,...,
    "bodyJson":{...,"text":"operator A — must not win"}}}
  200 !== 409

✖ C02: PUT /pages/:id rejects a malformed expectedVersion with 400 rather than treating it as 'no basis sent'
  AssertionError: {"post":{...,"version":2,...,"text":"mistyped basis"}}
  200 !== 400

ℹ tests 4 / pass 2 / fail 2
```

The stale write LANDED (operator A's text on the row at version 3) and the mistyped `"1"` basis was
silently ignored. The two passing tests are the deliberate controls — happy path and
guard-stays-opt-in — which pass before and after, and are there to pin that the fix does not
broaden.

### SEO-01 — `apps/website/src/features/seo/__tests__/write-service.concurrent-save.test.ts`
Command (repo root): `node --import tsx --test apps/website/src/features/seo/__tests__/write-service.concurrent-save.test.ts`

```
✖ SEO-01: an SEO-only write must not revert a content save that landed between its read and its write
  AssertionError: the concurrent content save must survive an SEO-only write
  + actual - expected
    { +   content: [],
      -   content: [ { content: [ { text: "an operator's real content edit", … } ] } ], type: 'doc' }

✖ SEO-01: the uncontended path is unchanged — one predicated write, version advances by exactly one
  AssertionError: no retry, no second write, on an uncontended row
  + actual: [ 'save' ]   - expected: [ 'saveIfVersion' ]
```

The concurrent content edit was reverted to the empty seed document by an SEO title write, and the
write went through the unconditional `save()`. The interleave is deterministic (a repo decorator
lands the competing save inside the read-to-write gap), not timing-dependent.

---

## What was changed

| File | Change |
|---|---|
| `apps/website/src/features/post/post.ts` | `PostRepoPort.saveIfVersion` added (documented); `versionConflictMessage` + `persistUpdatedPost` extracted; `updatePost` writes through the latter |
| `apps/website/src/features/post/repo.sqlite.ts` | `toRow`/`updatableColumns` extracted out of `save()`; `saveIfVersion` = `UPDATE … WHERE id AND workspace_id AND version`, index refreshed only on an applied write |
| `apps/website/src/features/post/repo.memory.ts` | `saveIfVersion` mirroring the SQL predicate (workspace included) |
| `apps/website/src/server/inbound/admin-http/routes/pages/update.ts` | `parseExpectedVersion` forwarded; `PostVersionConflictError` branch placed BEFORE `PostConflictError`; header records the behavior change and the two remaining deliberate omissions |
| `apps/website/src/features/seo/write-service.ts` | `mergeOverridesOntoCurrentRow`: read → merge → `saveIfVersion`, bounded 3-attempt re-read on a lost row |
| `apps/website/src/features/seo/errors.ts`, `index.ts` | `SeoConcurrentWriteError` |
| `apps/website/src/server/inbound/admin-http/routes/seo/put-entry.ts` | 409 `SEO_CONCURRENT_WRITE` instead of the generic 500 |
| `apps/website/src/features/pages/html-document-store.sqlite.ts` | Doc only — why the read-remembered basis stays (arch §4.15) |

Design note — why `saveIfVersion` and not a predicate on `save()`: `routes/pages/update.ts:159` and
`routes/posts/update.ts`'s gateway `rollback` restore a captured pre-image whose `version` is OLDER
than the row's current one, and `postDeleteReverter` does the same. Predicating `save()` itself
would have made every unit-of-work compensation a silent no-op — the fix would have created a worse
bug than the one it closed.

---

## Findings

### C01 — VERIFIED-AND-FIXED
`updatePost` now writes through `saveIfVersion` when the caller opted in; a rejected write re-reads
to name the real current version. Unversioned callers keep last-write-wins (unchanged, pinned by
the pre-existing test at `post.optimistic-concurrency.test.ts:118`).

### C02 — VERIFIED-AND-FIXED
`PUT /pages/:pageId` forwards and maps `expectedVersion`. The `PostVersionConflictError` branch sits
above `PostConflictError` because the former extends the latter — without that ordering a version
conflict would have answered `SLUG_CONFLICT`.

### SEO-01 — VERIFIED-AND-FIXED (partially — see the open question below)
The lost-update half is closed. The *other* half the audit named — that the SEO version bump makes
an open editor's autosave basis stale and 409s its next Save for content nobody changed — is
deliberately NOT changed: it is a contract question about what `posts.version` means, not a
concurrency bug, and changing it would move behaviour no test currently pins.

### arch §4.15 — VERIFIED-AND-FIXED (as far as code goes)
Every writer of `posts.version` is now version-predicated. Two mechanisms remain and the difference
is legitimate: client-stated basis (HTTP PUT, opt-in) vs. read-remembered basis (in-turn splice,
mandatory). Recorded in `html-document-store.sqlite.ts`'s header rather than collapsed into one
mechanism.

---

## FOR LEONA — user-visible behaviour changes (I do not rule on these)

1. **`PUT /pages/:pageId` with a stale `expectedVersion` → `409 VERSION_CONFLICT`** (was `200` +
   silent clobber). Reach: external API clients only — the admin has no client for this route
   (`apps/admin/src/lib/api.ts:2140-2168` has `createPage/getPage/updatePageHtml/deletePage`; the
   Pages editor saves through `api.updatePost` → `/posts/:id`). Identical in shape to the change
   `posts/update.ts` already shipped.
2. **`PUT /pages/:pageId` with a MALFORMED `expectedVersion` → `400 VALIDATION_ERROR`** (was
   silently ignored). Same reach.
3. **`PUT /seo/entries/:entryId` can now return `409 SEO_CONCURRENT_WRITE`** — only after three
   consecutive lost races on one row, which needs three writers inside one request's microtask
   gaps. Previously the request always returned 200, and on a race it silently reverted the other
   writer's content.
4. **A `PUT /posts/:postId` carrying `expectedVersion` can now 409 where it previously 200'd** —
   specifically when the row was won during the slug check or a plugin's before-save hook. This is
   the C01 fix working, but it is a real new 409 for a client that today gets a 200.

## Open question for the queue (NOT actioned)
`setEntrySeoOverrides` still bumps `posts.version`, so an SEO-only edit pauses an open editor's
autosave ("Someone else saved this while you were editing") and 409s its next explicit Save. Whether
an SEO-metadata write should advance the content version at all is a contract decision — the command
gateway's revert guard (`appliers.ts`'s `currentVersion`) reads that column too.

---

## Evidence

Typecheck: `npx tsc -p tsconfig.json --noEmit` — clean, run after each of the three fixes.
(Reminder: `tsc` excludes `apps/website` tests; the test files were proven by running them.)

Complexity: `npx eslint --no-error-on-unmatched-pattern <the six changed source files>` — 0 errors,
2 warnings, both on pre-existing untouched lines (`repo.memory.ts:57` the `listPublishedPreviews`
sort ternary, `write-service.ts:181` `applyOverridesPatch`'s else-if). Ceiling of 9 not crossed:
`persistUpdatedPost` ~5, `mergeOverridesOntoCurrentRow` ~6, `saveIfVersion` (both adapters) ~3.
`npx biome lint` on the eight changed source files: 5 findings, all on pre-existing untouched lines
(`post.ts` empty interfaces at 348/414/438/508, `html-document-store.sqlite.ts:187`).

Test runs, all from the repo ROOT, one process at a time, exact file paths only:

- `node --import tsx --test apps/website/src/features/post/__tests__/post.concurrent-save.test.ts`
  → 2/2 pass (was 0/2)
- `node --import tsx --test apps/website/src/features/post/__tests__/repo.save-if-version.test.ts`
  → 10/10 pass, both adapters
- `env -u TOVU_ADMIN_PASSWORD node --import tsx --test apps/website/src/server/__tests__/routes/pages-update-expected-version.test.ts`
  → 4/4 pass (was 2/4)
- `node --import tsx --test apps/website/src/features/seo/__tests__/write-service.concurrent-save.test.ts apps/website/src/features/seo/__tests__/write-service.test.ts`
  → 26/26 pass (was 24/26)
- `node --import tsx --test apps/website/src/features/seo/__tests__/write-service.sqlite.test.ts apps/website/src/features/seo/__tests__/sitemap-invalidation.integration.test.ts`
  → 7/7 pass

Regression sweep 1 — 179/179 pass:
`post.test.ts`, `post.optimistic-concurrency.test.ts`, `post.autosave.test.ts`, `post.delete.test.ts`,
`post.body-format.test.ts`, `post.transition-events.test.ts`,
`tool-registrations.optimistic-concurrency.test.ts`, `list-published-previews.test.ts`,
`search-index.sqlite.test.ts`, `integration/post-plugin-hook.integration.test.ts`,
`contracts/core/commands/__tests__/integration/revert-plugin-ext.integration.test.ts`,
`contracts/core/commands/__tests__/command-atomicity.test.ts`,
`platform/export/__tests__/site-exporter.test.ts`,
`server/inbound/public-http/routes/site/__tests__/static-post-previews-resolution.test.ts`

Regression sweep 2 — 117/117 pass:
`admin-page-get-route.test.ts`, `admin-page-html-route.test.ts`,
`admin-post-page-delete-routes.test.ts`, `routes/pages-update-html-auth.test.ts`,
`packet-one-routes.test.ts`, `pages/__tests__/metadata-edit-preserves-html.test.ts`,
`pages/__tests__/tool-registrations.test.ts`, `pages/__tests__/html-document-store.sqlite.test.ts`,
plus all four new/changed suites.

The two sweeps cover every `PostRepoPort` implementation in the repo: `SqlitePostRepo`,
`InMemoryPostRepo`, and the two test classes that declare `implements PostRepoPort`
(`site-exporter.test.ts:31 FailingSlugPostRepo`, `static-post-previews-resolution.test.ts:96
CountingPostRepo`) — the latter two have no `saveIfVersion` and are unaffected because `updatePost`
only reaches for it when a caller opted in.

## Commits
`fb483601` RED (C01) · `13d642f2` fix C01 · `c0dd5f33` fix C02 (+RED) · `fd97ea4c` fix SEO-01 (+RED)
· `16200649` adapter contract · `8de1acb1` arch §4.15 doc
