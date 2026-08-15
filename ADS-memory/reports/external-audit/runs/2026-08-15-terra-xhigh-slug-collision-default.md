# External audit — Terra 5.6 (xhigh) on the slug-collision default flip

**Date:** 2026-08-15 · **Peer:** `gpt-5.6-terra`, `model_reasoning_effort="xhigh"`, codex-cli 0.147.0
**Target:** detached worktree at `94f2b2a` · **Run:** `turn.completed`, 0 `error` / 0 `turn.failed`,
244 `command_execution` events
**Question:** is the "stored `false` is ambiguous" blocker real, and what is the
best / easiest / lowest-blast-radius fix?

**Headline: the Coordinator's proposed fix (CLAIM 4, nullable tri-state) was REFUTED.**
CLAIMS 1-3 were confirmed. Terra proposed a better option (E) that the Coordinator had not listed.

> Terra had no `node_modules` and could not run tests; it correctly limited CONFIRMED labels to
> source-readable facts. Findings below are **not yet independently re-verified by the Coordinator.**

---

## VERDICT

- **CLAIM 1 — CONFIRMED.** The static-page gate is exactly `static` tier, non-`index` slug, and a present `theme.pages[slug]`; a published, non-trashed matching record wins only when its flag is truthy, otherwise the theme page is rendered. `src/server/routes/site/pages.ts:765–781`, `src/features/post/post.ts:818–828`
- **CLAIM 2 — CONFIRMED.** Both declared schemas use `NOT NULL DEFAULT false`; SQLite’s checked migration adds the same shape. `src/db/schema.ts:117`, `src/db/schema.postgres.ts:799`, `src/db/drizzle/0029_absurd_betty_brant.sql:1`
- **CLAIM 3 — CONFIRMED (reachability; not measurable in this checkout).** The collision-only checkbox sets a real boolean, and every Save serializes it—including `false`; the route forwards it, domain logic preserves any value other than `undefined`, and the repo writes it. Thus an author can save `true`, uncheck, save, and store an intentional `false`. `apps/admin/src/features/posts/PostEditor.tsx:884–896`, `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:660–674`, `src/server/routes/admin/posts/update.ts:113–122`, `src/features/post/post.ts:719–724`, `src/features/post/repo.sqlite.ts:117–140`
- **CLAIM 4 — REFUTED as written.** Making only the column nullable is insufficient: the repo, HTTP serializer, and editor all coerce missing/null values to `false`; additionally, no migration can identify which historical `false` values were never decided. `src/features/post/repo.sqlite.ts:117–119`, `src/server/http/shared/post.ts:29–31`, `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:560–583`

## RECOMMENDATION

**E — capture the new default at creation time, keep the existing resolver.**

Tell the owner: **“Make newly created posts/pages store `overridesThemePage: true`, preserve every existing stored value, and do not reinterpret legacy `false`—that delivers post-first defaults without guessing at past author intent.”**

This optimizes correctness and data blast radius over the theoretical flexibility of tri-state. Both normal post and page creation already flow through `createPost`, so that is the principal change point. `src/server/routes/admin/posts/create.ts:67–80`, `src/server/routes/admin/pages/create.ts:60–73`, `src/features/post/post.ts:622–637`

Implementation should also change both schema defaults to `true`, the SQLite repo’s missing-value fallback, serializer/editor fallbacks, and collision-warning copy. The creation record itself must explicitly carry `true`; otherwise the create response is built from the pre-save record and currently serializes an absent flag as `false`. `src/features/post/post.ts:622–638`, `src/server/routes/admin/posts/create.ts:83`, `src/server/http/shared/post.ts:19–31`

## RANKING

1. **E — creation-time binary default (recommended).** High correctness for the requested rollout, low semantic blast: existing `false`/`true` values keep their behavior; future content is explicitly post-first.
2. **A — nullable tri-state.** Correct but more invasive; it requires nullable plumbing through persistence, HTTP, editor state, inverses, serving, and export. It still cannot retroactively classify historic `false` values.
3. **D — rename the theme page.** Best per-collision product alternative when both resources should remain reachable, but it does not establish post-first defaults and intentionally changes the theme page’s public URL. `apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:424–464`, `apps/admin/src/features/themes/ThemeExplore.tsx:578–590`
4. **B — backfill currently colliding rows then flip.** High operational blast and weak value: the SQLite migration already made existing values `false`; identifying collisions requires each workspace’s active theme files, not a database-only query. `src/db/drizzle/0029_absurd_betty_brant.sql:1`, `src/features/theme/theme.ts:571–580`
5. **C — only change `DEFAULT true`.** Insufficient: the canonical repo explicitly supplies `record.overridesThemePage ?? false`, so the database default is bypassed for normal writes. `src/features/post/repo.sqlite.ts:117–123`

## BLAST RADIUS

| Scope | Observed boundary |
|---|---|
| Current collision branch | One workspace’s active static theme, a matching non-`index` slug, and a published, non-trashed record. The lookup is **kind-blind**, so database Pages are affected too—not only Posts. `src/server/routes/site/pages.ts:765–786`, `src/features/post/post.ts:818–828` |
| Shipped theme surface | The source tree contains seven static themes with **1–21** candidate slug stems per active theme (**77 total excluding `index`**). This is an inventory count, not a collision count; the loader accepts every `pages/*.html` file. `src/features/theme/theme.ts:571–580` |
| Effect of E | **Zero existing stored records change.** A public URL changes only when a newly created, subsequently published record collides with the active static theme. |
| Actual affected rows | **INFERRED / unknown.** No deployment `content.db` is present to count published matching slugs. |

## TRAPS

- SQLite likely needs a `posts` table rebuild to change an existing column’s default; preserve every `0/1` value and recreate both post indexes. Existing rebuild migrations explicitly test row/index survival. `src/db/drizzle/0024_lethal_weapon_omega.sql:1–33`, `src/db/__tests__/posts-body-format-migration.test.ts:115–137`
- Edit `src/db/schema.ts` and regenerate—not hand-edit—`schema.postgres.ts`; the PostgreSQL schema is generated and CI checks exact drift. `development/scripts/generate-postgres-schema.ts:603–638`, `src/db/__tests__/schema-postgres-drift.test.ts:1–35`
- For E, update all missing-value fallbacks consistently, especially the command inverse at `src/server/routes/admin/posts/update.ts:91–103`; otherwise a revert can reintroduce an old default.
- The editor warning and serving/export are already inconsistent: the editor warns for every `theme.pages` key, while live serving excludes only `index`; export additionally excludes `404` and declared template shells. `src/server/routes/admin/presentation/get.ts:52–56`, `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:604`, `src/server/routes/site/pages.ts:765`, `src/export/route-manifest.ts:140–157`
- The preference is not tied to a theme ID. A stored value applies if a later active static theme has the same slug, so a theme switch can create a new collision with an old preference. `src/server/routes/site/pages.ts:141–163`, `src/server/routes/site/pages.ts:765–781`
- D’s rename flow does not preserve old inbound URLs; the UI explicitly warns that direct links need updates. Given the supplied per-workspace theme copies, that workaround must also be repeated per affected workspace. `apps/admin/src/features/themes/ThemeExplore.tsx:578–590`, `src/server/routes/admin/themes/explore.ts:922–928`
- No tests were executed because this checkout has no `node_modules`; the code path findings above are source-confirmed.
