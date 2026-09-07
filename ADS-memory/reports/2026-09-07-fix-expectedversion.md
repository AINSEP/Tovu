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

## Status

- C01 — RED captured; fix in progress.
- C02 — pending.
- SEO-01 — pending.
- arch §4.15 — pending.
