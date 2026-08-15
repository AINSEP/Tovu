# Verification of Terra 5.6 (xhigh) slug-collision audit — by execution

**Date:** 2026-08-15 · **Verifier:** Programmer (Claude, sonnet), persona `AI-Dev-Shop/agents/programmer/skills.md`
**Target audit:** `ADS-memory/reports/external-audit/runs/2026-08-15-terra-xhigh-slug-collision-default.md`
**Method:** execution wherever practical (temporary probe tests through the real admin write path,
a scratch `drizzle-kit generate` run, a raw sqlite INSERT probe), source-reading where an absence or
a type shape is the whole claim. **No production code was changed.** All temporary test additions were
added, run, and then reverted; `git diff --stat` on every touched file confirmed clean before finishing.

Repo state: HEAD `860ea15`, diff against Terra's audited commit `94f2b2a` on every file this task
touches is empty — Terra's citations are current, not stale.

---

## Verdicts

### 1. The unchecked checkbox persists a distinguishable `false` — CONFIRMED (execution)

Extended the existing round-trip pattern in
`src/server/__tests__/routes/post-template-site-serving.test.ts` (which already proves `false → true`
through the real admin `PUT`) with the missing reverse direction: create a post already overriding
(`overridesThemePage: true`), confirm it wins, `PUT` through the real authenticated admin route with
`overridesThemePage: false`, then assert the stored value.

```
test('PROBE: unchecking overridesThemePage through the admin API persists a real false, not absent', ...)
  assert.equal(stored?.overridesThemePage, false, "an explicit uncheck must persist as boolean false, not undefined");
  assert.notEqual(stored?.overridesThemePage, undefined, ...);
  // theme page wins again after uncheck
```

Command: `node --import tsx --test "src/server/__tests__/routes/post-template-site-serving.test.ts"`
Result: `✔ PROBE: unchecking overridesThemePage through the admin API persists a real false, not absent (100.452145ms)`

Chain traced and confirmed by reading: `PostEditor.tsx:895` (`checked={overridesThemePage}`) →
`use-post-editor.hooks.ts:669-674` (`save()` always sends the current boolean, never omits it) →
`update.ts:121` (`overridesThemePage: req.body?.overridesThemePage`, forwarded verbatim) →
`post.ts:720` (`...(input.overridesThemePage !== undefined ? { overridesThemePage: input.overridesThemePage } : {})`
— preserves `false` because `false !== undefined`) → `repo.sqlite.ts:118` (persists it).
**This is the load-bearing claim and it holds under real execution, not just static reading.**

### 2. Nullable alone would not work — CONFIRMED (source, all three coercion points independently verified)

- `src/features/post/repo.sqlite.ts:118` — `overridesThemePage: record.overridesThemePage ?? false`
- `src/server/http/shared/post.ts:30` — `overridesThemePage: post.overridesThemePage ?? false`
- `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:560` and `:583` —
  `setOverridesThemePage(post.overridesThemePage ?? false)` and the mirrored `original` baseline

All three squash `null`/`undefined` back to `false` unconditionally. Making the column nullable
changes nothing observable until all three are re-plumbed to treat `null` as a genuine third state
(and the React `useState<boolean>` at `use-post-editor.hooks.ts:348` would need to become tri-state
too). Confirmed.

### 3. Changing only the column DEFAULT is a trap — CONFIRMED (execution, decisive)

Wrote and ran a standalone probe (`better-sqlite3` directly, not the ORM) that copies
`repo.sqlite.ts`'s exact write logic (`record.overridesThemePage ?? false`) against a table whose
`overrides_theme_page` column has `DEFAULT 1` (simulating "just flip the DB default"):

```
Column-level DEFAULT (simulated): 1 (true)
JS row value written by repo.sqlite.ts's `?? false` coercion: false
Actual value stored after INSERT: 0
RESULT: CONFIRMED — the explicit JS-side `?? false` always wins; the column's own DEFAULT TRUE
is never reached because repo.sqlite.ts always supplies an explicit value for this column on every write.
```

Every `createPost` call produces a `PostRecord` with `overridesThemePage` absent (see verdict 6 below
— `CreatePostInput` has no such field), so this isn't a hypothetical edge case: it's what happens on
every single new post today. A DB-level `DEFAULT true` would be silently dead code. Confirmed.

### 4. The collision lookup is kind-blind — CONFIRMED (execution)

`findBySlug` (`repo.sqlite.ts:84-91`) filters only on `workspaceId` + `slug` — no `kind` predicate —
and `pages.ts:765-773`'s collision branch calls exactly this through `getPublishedPostBySlug`. Added
a temporary probe (`kind: "page"` row at a colliding slug, `overridesThemePage: true`) through the
same test harness:

```
✔ PROBE: the collision lookup is kind-blind — a kind:page row collides with a theme page too (24.809236ms)
```

Confirmed both by reading (`repo.sqlite.ts:84-91`, `pages.ts:765-773`) and by execution.

### 5. Stored preference is not tied to a theme ID — CONFIRMED (source, decisive absence-proof)

`src/db/schema.ts:108-117` — `overridesThemePage` is a bare
`integer("overrides_theme_page", { mode: "boolean" })` column; the `posts` table has no theme-id
column anywhere near it, and `PostRecord`/`CreatePostInput`/`UpdatePostInput` carry no theme
reference at all. Meanwhile `resolveActiveThemeId` (`pages.ts:141-152`) reads a single **global**
`presentation_settings.activeThemeId` — one workspace-wide "which theme is active" setting,
independent of any post. So the collision check at `pages.ts:765` (`theme.pages[slug] !== undefined`)
always uses *whichever theme is active right now*, and gates on a boolean that was decided (or
defaulted) against *whatever theme was active when that boolean was last written*. Switching the
active theme to a different one that happens to ship a same-named page silently hands the old
decision to a collision the author never saw. This is a real, independently reachable latent bug —
confirmed, and (see "holes" section below) it also undermines part of Terra's own recommendation, not
just the status quo.

### 6. `schema.postgres.ts` is generated + CI drift check; SQLite needs a full rebuild for a default change — CONFIRMED (execution, both halves)

**Generated + drift-checked:** `development/scripts/generate-postgres-schema.ts`'s header states the
schema is derived, never hand-edited; `src/db/__tests__/schema-postgres-drift.test.ts` runs the
generator with `--check` and asserts exact-text match. Ran it fresh:

```
node --import tsx --test "src/db/__tests__/schema-postgres-drift.test.ts"
✔ schema.postgres.ts is up to date with schema.ts (run the generator and commit if this fails) (4549.159132ms)
```

It's a real, currently-passing gate — not aspirational.

**SQLite rebuild requirement:** Built an isolated scratch copy of `src/db/{schema.ts,drizzle/,drizzle.config.ts}`
inside the repo tree (so `node_modules` resolution works), flipped **only**
`overridesThemePage`'s `.default(false)` → `.default(true)` in the scratch schema, and ran the real
`drizzle-kit generate` binary against it. Drizzle-kit itself — not a guess about SQLite's
capabilities — produced a full 12-step rebuild identical in shape to the `0024` precedent already in
the repo: `CREATE __new_posts` (with `overrides_theme_page ... DEFAULT true`) → `INSERT ... SELECT`
copying every existing row's actual stored value → `DROP TABLE posts` → `RENAME __new_posts TO posts`
→ recreate both indexes. Scratch files deleted afterward; confirmed no tracked files were touched
(`git status --short` shows nothing beyond pre-existing untracked screenshots unrelated to this task).
Confirmed on both halves.

---

## The hole in Terra's Option E recommendation

**Every creation path does flow through `createPost` today** — verified, not assumed. Swept the repo
for every non-test caller of `createPost` and every direct `PostRepoPort.save()`/`insert(posts)` call:

- `src/server/routes/admin/posts/create.ts:68` and `src/server/routes/admin/pages/create.ts:61` —
  the two HTTP create routes, both call `createPost`.
- `src/features/post/tool-registrations.ts:318` — the assistant/MCP "create post" agent tool also
  calls `createPost` (a third path Terra's own citations didn't enumerate).
- `src/cli/commands/` has no post/content-creation command at all (`export.ts`, `init.ts`,
  `introspect.ts`, `serve.ts` only).
- `src/server/seed.ts` does not create posts.
- Other `PostRepoPort.save()` call sites that are NOT `createPost`/`updatePost` all operate on an
  **existing** row, not a new one: `reverters.ts` (undo — restores a stored pre-image, by design
  never through `createPost`), `html-document-store.memory.ts` (requires `load()`-ing the row first;
  spreads `...row`). Two other `.save(` hits (`restore-points.ts`, `plugin-runtime/{activation,quarantine}.ts`)
  are a *different* repo entirely (restore points / plugin activations), not `PostRepoPort` — false
  positives from the grep, checked and ruled out.

So Option E's premise holds for the codebase as it exists right now. But two real gaps remain:

**Gap 1 — `createPost`'s own fix only protects the *known* call sites; the fallback is what protects
the *next* one.** `CreatePostInput` (`post.ts:168-186`) has no `overridesThemePage` field today, so
"set it explicitly in `createPost`" is a type change, not a one-line default swap. If a future
contributor adds a fourth creation surface (bulk import, a new CLI command, a plugin-driven creator)
that calls `deps.repo.save()` directly the way `html-document-store.memory.ts` already does for
*existing* rows, and forgets `overridesThemePage`, the record falls through to `repo.sqlite.ts`'s
own fallback — which is exactly why Terra's plan is right to also flip that fallback (and the HTTP
serializer's and the editor's) to `?? true`, not just `createPost`'s literal. **This is not optional
polish — it is the actual safety net for "every path", and should be called out as such rather than
listed alongside cosmetic follow-ups**, since `createPost` alone only covers what exists today.

**Gap 2 — Option E does not make "posts win by default" actually hold once a post's *situation*
changes after creation, and this affects new posts too, not only legacy ones.** The flag is decided
once, at creation time, against whatever theme is active then. Two ways a post's collision status can
change afterward without the flag ever being touched:
- **Theme switch** (claim 5, above): an admin activates a different static theme that happens to ship
  a same-slug page. Any post — legacy `false`, *or* freshly created-after-the-fix `true`-that-was-never-a-collision-until-now,
  *or* freshly created-after-the-fix `true`-decided-against-a-different-old-collision — keeps its old
  boolean, unre-evaluated. A legacy post silently loses to the new theme page it never used to collide
  with; conversely a new post's `true` (decided when there was no collision, or a different one) would
  silently win over a theme page an admin has never been warned it now shadows.
- **Slug edit onto an existing theme page**, post-creation: `updatePost` (`post.ts:706-722`) only
  touches `overridesThemePage` when the caller's `input.overridesThemePage !== undefined` — an editor
  save that changes only the slug field carries the old boolean forward unchanged, whatever it was.

Terra's own TRAPS section names the theme-ID gap but frames it as "a latent bug independent of the
flip." That undersells it: it means **Option E's stated goal — new content defaults to winning — is
only true at the instant of creation**, not durably. The one thing that keeps this from being a silent
trap in practice is that `hasSlugCollision` (`use-post-editor.hooks.ts:604`,
`staticPageIds.includes(slug)`) is evaluated live, so an admin who *happens* to reopen that specific
post after a theme switch will see the collision warning and can hand-correct it — there is no
data-loss or crash, only a silent default that persists until someone notices. Worth flagging to the
owner as a known residual gap either way (an audit surface listing posts whose `overridesThemePage`
disagrees with the *currently* active theme's collisions would close it; out of scope for this
verification pass to design).

---

## Aside: unrelated pre-existing test failures found in this file

Not part of the six claims, but discovered while running the scoped test file and worth flagging
separately since they weren't in the brief's known-failures list (`database-recovery.test.ts` ×5,
`menus.test.ts` ×2). Ran the **unmodified** file (confirmed via `git diff --stat` = clean both before
and after) and got 6 failures, all in the unrelated `templateChoice`/`postTemplate` rendering path,
alongside a console warning: `[theme] static page '...' is missing the exact token stylesheet
sentinel; design tokens were not injected`. All `overridesThemePage` tests (5 of them, including both
ROUND TRIP tests) pass cleanly on the same unmodified run:

```
✖ REGRESSION: a post whose templateChoice was never set renders its real content, not the diagnostic page
✖ a post explicitly opted out of templates still gets the diagnostic page
✖ null and "" produce different pages for otherwise identical posts
✖ an explicit templateChoice renders through that template, not the first one
✖ overridesThemePage true composes with the templateChoice fallback rather than bypassing it
✖ ROUND TRIP: saving "No template chosen" through the admin API persists "" and diagnoses on the site
ℹ tests 10 / pass 4 / fail 6
```

Likely cause (not investigated further — out of scope): a design-token injection requirement was
added to the static-page/template render path that this test file's hand-built `DiscoveredTheme`
fixture doesn't satisfy (`staticThemeWithPostTemplate()` has no token stylesheet). This blocks nothing
in the six claims above (none of the failing tests touch `overridesThemePage`), but it means this test
file is **not currently fully green on HEAD**, independent of the slug-collision question. Recommend
routing to whoever owns the design-token injection feature.

---

## Commands run (for reproducibility)

```
node --import tsx --test "src/server/__tests__/routes/post-template-site-serving.test.ts"
node --import tsx --test "src/db/__tests__/schema-postgres-drift.test.ts"
node .tmp-verification-probe/probe.mjs   # DEFAULT-trap sqlite probe, deleted after
cd .tmp-drizzle-probe && drizzle-kit generate --config=src/db/drizzle.config.ts   # deleted after
```

## Files touched during verification (all reverted, confirmed clean)

- `src/server/__tests__/routes/post-template-site-serving.test.ts` — two temporary probe tests added,
  run, then removed. `git diff --stat` confirmed empty before finishing.
- `.tmp-verification-probe/`, `.tmp-drizzle-probe/` — scratch dirs, deleted; never staged.

No production code was changed. No certified test was deleted, weakened, or left modified.
