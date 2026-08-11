# Theme cleanup: dead code and test rot (2026-08-11)

Dispatched to a Sonnet subagent (persona: `AI-Dev-Shop/agents/programmer/skills.md`), branch
`general-work`. All four items authorized by the owner across prior handoffs; each carried a
"verify it's really dead before deleting" clause. Commits: `c408ff7`, `085e4c1`, `26cd91f`,
`8e06816`.

Worked alongside a second, concurrently-running agent editing `theme-files.ts`, `explore.ts`, and
`src/themes/static/basic/pages/pricing.html` — none of those files were touched by this work; every
`git add` used explicit paths, never a directory or `-A`, and staged diffs were reviewed before each
commit specifically to keep the other agent's uncommitted work out.

---

## Item 1 — the two poisoned test files: one deleted, one fixed (not deleted)

**`static-render.test.ts` — deleted, never executed.**

Traced root cause without running it (forbidden — it hangs and burns a CPU core). Every fixture in
the file authors an intermediate marker shape from mid-flight through the 2026-08-10 marker-spine
unification: separate `data-embed-type`/`data-embed-id` attributes plus an optional
`data-embed-config` for extras (e.g. `data-embed-type="menu" data-embed-id="X" data-embed-config='{"variant":"tree"}'`).
That design was collapsed further, before this session, to ONE `data-embed-config='{"type":...,"id":...}'`
attribute — confirmed against the real `src/themes/static/basic/nav.html` on disk
(`data-embed-config='{"type":"menu","id":"menu-header-nav"}'`) and against
`src/core/embeds/marker.ts`'s `MARKER_PATTERN`/`parseMarkerConfig`, which require `type` and `id`
to live inside the single JSON attribute — a marker missing `data-embed-config` entirely, or one
whose config has no `type` key, is not recognized at all. Every fixture in `static-render.test.ts`
predates that final collapse, so genuinely tests a retired design. (Whether that specific mismatch
is *also* what causes the literal hang couldn't be confirmed without running the file — treated the
hang warning as binding regardless.)

Independent corroboration: `theme-slot-honors-current-page.test.ts`'s own file header, written by
an earlier agent, already documents avoiding `static-render.test.ts` for the same reason ("that file
currently hangs... and is off-limits pending its own investigation").

Before deleting, checked for coverage that would become a real hole. Most of the file's assertions
were about the now-retired intermediate marker spelling (declining value). But several tests used
only current-spine fixtures and had no proven equivalent elsewhere: `renderMenuTree`'s tree-variant
edge cases (unavailable branch vs. leaf, `isCurrent`/`isActive` class hooks, authored
`cssClass`/`description`/`icon`), the malformed-`data-embed-config`-degrades-safely guarantee, and
menu label/href HTML-escaping (XSS). `theme-pages-render.canary.test.ts`'s real-theme sweep can't
stand in for these — it only proves what real themes happen to author, and no real theme ships
malformed JSON or an XSS payload as a menu label.

Recreated that coverage in a new file, **`menu-tree-render.test.ts`**, with fresh fixtures using
only the current single-attribute marker spelling — verified safe to run (never touches the poisoned
file), 9/9 green. Then deleted `static-render.test.ts` without ever executing it.

**`post-template-resolution.test.ts` — fixed, NOT deleted. Pushback on the brief's framing.**

This file does not test a retired design. It certifies `resolvePostTemplate`'s `templateChoice`
tri-state fallback logic (`null` vs. `""` vs. an explicit choice) — a regression fix unrelated to the
marker-spine change, with 14 tests and no equivalent coverage anywhere else in the suite.

Traced the "pre-existing failure" to one specific cause: the file's `POST_SLOT` fixture constant was
`'<div data-embed-type="post" data-embed-id="{{post}}"></div>'` — the same retired attribute pair
from item 1, missing the required `data-embed-config` attribute entirely. `resolvePostTemplate`'s
own "has a post slot" check (`markersOfType(html, "post").length === 0`) uses the shared strict
scanner, so it silently found zero markers on every fixture — every "template" assertion was
actually landing on "diagnostic" instead. The implementation's own inline comment already names this
exact history: "The literal `data-embed-id=\"{{post}}\"` this used to test for stopped existing the
moment the themes moved onto `data-embed-config`."

Fixed by rewriting `POST_SLOT` to the current marker spelling
(`'<div data-embed-config=\'{"type":"post","id":"{{post}}"}\'></div>'`) and updating the one
assertion that checked for the old literal substring. Two-line diff. Ran the fixed file (the "do not
run it" instruction was about not wasting time confirming a known-broken run, not a hang-safety
constraint like item 1's — there is no CPU-burn warning on this file) — **14/14 green**.

---

## Item 2 — dead `parent` inheritance: removed as specified, no pushback

Grepped every reference before touching anything: the manifest type field, the raw-JSON parser
branch, three functions (`inheritFromParent`, `resolveParentTheme`, `mergeManifests`), one constant
(`INHERITABLE_REQUIREMENT_ERRORS`), `basic-child/theme.json` (the only theme that ever declared
`parent`), and `theme-inheritance.test.ts` (the only test exercising the field, run against the real
`basic-child` through the real `loadTheme`). Confirmed no other reader exists anywhere in
`src/`/`apps/admin/src/` — `loadTheme()` was the only call site, and it now returns its own loaded
theme directly instead of branching into `inheritFromParent`.

`theme-pages-render.canary.test.ts` had its own defensive filter excluding any theme whose
`theme.json` declared a `parent` string from its per-theme sweep, plus a comment explaining that
exclusion and pointing at `theme-inheritance.test.ts`/`basic-child`. Simplified the filter (the
`parent` check is now unreachable — no theme can ever declare it again) and rewrote the comment so
it stops describing a child-theme concept that no longer exists in the codebase, rather than leaving
a stale pointer to a file I was deleting in the same change.

**Design-doc note, not an objection:** `development/docs/themes/theme-authoring-guide.md:3` (part of
another agent's uncommitted, unrelated in-flight edit — left untouched) references a *separate*,
not-yet-built "parent/child template system" design doc at
`ADS-memory/.local-artifacts/design/theme-template-parent-child-design.md`. Read it to confirm it's
a distinct, forward-looking proposal (copy-a-page-and-edit-it, region markers) that doesn't reuse or
depend on the runtime `parent` field being removed here — no conflict, just flagging that the phrase
"parent/child" will resurface in a future, unrelated design.

105/105 theme feature tests green after this change (`theme.test.ts`, `theme-static-tier`,
`theme-pages-render.canary`, `menu-tree-render`, `post-template-render.canary`,
`theme-slot-honors-current-page`, `theme-files`, `next-available-theme-id`). `tsc --noEmit` clean.

---

## Item 3 — allowlist tests: re-pointed, NOT deleted. Held the "just delete" option.

Both `liquid-allowlist.test.ts` and `handlebars-allowlist.test.ts` ENOENT on
`src/themes/templated/dispatch/` and `src/themes/handlebars/ledger/` — commit `4f6ce56` ("archive
old ones", 2026-08-09) moved both to `src/theme-archive/{dispatch,ledger}/`, files intact.

Before deleting, checked whether the allowlist logic they exercise still ships:
`liquid-allowlist.ts` and `handlebars-allowlist.ts` are live — `theme.ts`'s lint-before-publish and
each tier's `*-worker.ts` render-time re-check both depend on them, and they're the SSTI/XSS/
prototype-pollution/resource-bound guards for two of five theme tiers. Of the 49 total tests across
both files, only 3 read from the deleted fixture paths (the two "live template lints clean" checks,
plus the handlebars end-to-end `loadTheme()` check) — the other 46 are self-contained inline-string
unit tests that were never broken. Deleting either whole file would have thrown away real,
security-relevant coverage to fix a stale path. **Held that deletion.**

Fix: re-pointed the fixture reads at `src/theme-archive/dispatch/templates/` and
`src/theme-archive/ledger/templates/`. This is not a novel workaround — `theme.test.ts` already
made the identical fix for the same `dispatch` fixture ("the live themes/dispatch demonstrator
theme loads as valid end-to-end", pointed at `src/theme-archive/dispatch`), discovered while
running the item-2 regression sweep. Matched that precedent rather than inventing a different
approach (e.g. switching the liquid test to the newer `storefront` theme instead) — kept the
existing "live themes/..." test names/wording too, for the same consistency reason.

Note for `handlebars-allowlist.test.ts` specifically: `src/themes/handlebars/` currently ships zero
themes (confirmed by directory listing), so the archived `ledger` fixture is not just a convenient
substitute — it is the *only* real (non-hand-authored) handlebars template source left in the repo,
and the only thing currently exercising `loadTheme()`'s handlebars-tier path end-to-end.

49/49 green (32 handlebars + 17 liquid). `tsc --noEmit` clean.

---

## Item 4 — `novice` deleted, catalog copies slimmed

**`novice` deletion.** Grepped every reference repo-wide (case-insensitive) before deleting: 4 hits
total — this handoff doc, `apps/admin/.../ThemeExplore.unit.test.tsx` (a themeId string in a fully
mocked test that never touches a real theme folder — confirmed by running it unchanged after
deletion: 19/19 still green), an explanatory comment in `explore.ts` citing novice's file count from
a past bug writeup (off-limits file, left alone — still historically accurate regardless of the
theme's existence), and `novice/theme.json` itself. No hardcoded theme-count assertion anywhere.
`theme-pages-render.canary.test.ts`'s per-theme sweep is directory-driven, so it simply generated
fewer test cases after deletion (confirmed: no more `canary: novice — ...` cases in the run) with no
code change needed there.

`git rm -r src/themes/static/novice/` — **2.8M removed.**

**Catalog weight.** `downloadMarketplaceTheme` (`marketplace.ts`) is the one reusable code path that
writes into the originals catalog (`__original-themes__`) — it does two unfiltered `cpSync` calls,
one into the catalog, one into the live tier folder. Added a `filter` excluding `preview/` (`build-
preview.mjs`'s generated output — a full second copy of every page/script, once per color mode) from
BOTH copies: nothing reads a stale `preview/` in either the catalog or the editable copy, and
`explore.ts`'s own `GENERATED_DIRS` already hides it from the file list regardless of which copy is
being browsed.

**`screenshots/` deliberately NOT filtered, in either copy** — the tradeoff the brief specifically
flagged. `explore.ts`'s own comment already states screenshots stay listed for the working copy on
purpose (real marketing assets, not a copy of source). The risk was specifically the CATALOG copy:
excluding screenshots there would look like the same kind of win as excluding `preview/`, but isn't
— the catalog is what "reset to original" restores from, so a screenshot excluded there becomes
permanently non-resettable the instant a user edits or deletes their working copy's. Verified this
end-to-end rather than assumed it (per the brief's instruction), reading (not editing) `explore.ts`:
`listThemeFiles(...).filter(path => !isGenerated(path)).map(describeThemeFile...)` already drops
`preview/` paths from the listing *before* `resettable` is ever computed for them — so the catalog
change has zero interaction with that flag either way, and `resettable` for a screenshot stays
`existsSync(catalogDir/screenshots/x.png)` = true, exactly as before.

Accepted the size cost of keeping screenshots: in the one existing catalog entry (`basic`),
`screenshots/` (1.9M) is actually larger than `preview/` (568K) was — this is a smaller win than a
"exclude both, lose nothing" reading would give, traded deliberately for not silently breaking a
product guarantee.

Cleaned the one catalog entry the filter doesn't retroactively touch (it only applies to *future*
downloads): removed `src/themes/__original-themes__/static/basic/preview/` by hand (it was seeded
manually before this filter existed, and there is no reusable "add to catalog" tool in
`development/scripts/theme-tool.ts` — only `copy`/`page:*`/`slot:*`/`list`, all reading FROM an
already-populated catalog).

**Disk space:**

| path | before | after |
|---|---|---|
| `src/themes/static/novice/` | 2.8M | 0 (deleted) |
| `src/themes/__original-themes__/static/basic/` | 2.8M | 2.2M |
| **total reclaimed** | | **~3.4M** |

56/56 relevant theme tests green (`theme.test.ts`, `theme-pages-render.canary`,
`next-available-theme-id`) + 5/5 `marketplace-download-route.integration` + 19/19 admin
`ThemeExplore.unit`. `tsc --noEmit` clean.

---

## Final verification

- `npx tsc --noEmit` clean after every commit (checked 4 times, once per item).
- Repo-wide sweep for dangling references to everything deleted (`basic-child`, `theme-inheritance.
  test`, `static-render.test`, `novice`) after the last commit — every remaining hit is an
  intentional, past-tense historical mention in a doc comment (e.g. "36 of `novice`'s 79 files...
  before it was deleted"), none load-bearing.
- `curl localhost:3000/` → `200`, `<title>Basic — ...</title>` still renders — the owner's live
  server, not restarted, confirmed healthy after the changes. `curl localhost:5173/` → `302`
  (normal admin redirect). Neither server was killed or restarted.
- `src/themes/static/basic/` (active theme) untouched by this work; `pages/index.html` and
  `pages/pricing.html` show as modified in `git status` but are not mine (index.html is the owner's
  pre-existing hand-edit noted at dispatch; pricing.html belongs to the concurrent agent) — left
  unstaged both times `git status` was checked.
- Four commits, one per item, each with its own fresh-evidence test run and `tsc` check before
  committing. No `git add -A`/`git add <dir>` — every stage used explicit file paths, and each
  staged diff was reviewed (`git diff --cached --stat`) immediately before committing to keep the
  concurrent agent's `theme-files.ts`/`explore.ts` changes out.

## What was held back, and why

Two of the four "delete X" instructions were *not* executed as literally specified — both are
disclosed above with the specific evidence:

1. `post-template-resolution.test.ts` was fixed, not deleted (item 1) — it tests still-live logic
   with no coverage elsewhere; the "pre-existing failure" had a one-line root cause.
2. `liquid-allowlist.test.ts`/`handlebars-allowlist.test.ts` were re-pointed, not deleted (item 3) —
   the allowlists they exercise are live, security-relevant code; only 3 of 49 tests were actually
   broken.

Everything else — `static-render.test.ts`, the `parent` field + `basic-child`, and `novice` — was
deleted exactly as specified, after the requested verification.
