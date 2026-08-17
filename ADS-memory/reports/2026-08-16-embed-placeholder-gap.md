# Embed placeholder gap — `resolveHtmlPageEmbeds` "unknown embed type" warning for `menu`/`partial`

Status: **FIXED** (log-only bug — the public site was never broken)
Author: Programmer subagent (Claude Sonnet 5), dispatched by team-lead
Trigger: a real GitHub Pages export (`gh-pages` commit `c0e52de2`,
https://leonaburime-ucla.github.io/tovu-demo/) printed
`[widgets] resolveHtmlPageEmbeds: unknown embed type, every occurrence degrades to the placeholder`
~17 times for `type: 'partial'` and `type: 'menu'`, read as evidence the live site was shipping
placeholders where nav/menu content should render.

## Root cause — none of the three hypotheses in the dispatch brief

The brief asked whether `partial`/`menu` were (a) missing from the resolver registry, (b) registered
but not wired into the public path, or (c) deliberately unsupported. The real answer is a fourth
shape the brief didn't anticipate: **they are correctly implemented and correctly resolved — just not
by the module that logged the warning.**

- `src/widgets/resolver-service.ts`'s `HTML_EMBED_RESOLVERS` registry only ever owned `widget`,
  `media`, `post`, `content`. `partial` and `menu` were never meant to be in it.
- `partial`/`menu` are owned end-to-end by `src/features/theme/static-render.ts`'s `resolveSlots`
  (`partial`) and `injectMenuEmbeds` (`menu`), which run **after** `resolveHtmlPageEmbeds` in
  `src/server/routes/site/pages.ts`'s `renderViaTemplate` (`resolveHtmlPageEmbeds` +
  `renderHtmlPageBody` first, then `renderStaticPage`).
- `render.ts`'s `renderHtmlPageBody` already has an `isPageEmbedType()` ownership check (added
  2026-08-10) that correctly leaves `partial`/`menu` markers **untouched** for that later stage — this
  guards against a real, previously-shipped bug (the 2026-08-10 marker unification briefly made every
  consumer see every marker type, and this stage started substituting placeholders over navs/footers
  before that check was added). That fix was never undone; it was live and correct the whole time.

**Verified against the live artifact, not just the code.** Curled
`https://leonaburime-ucla.github.io/tovu-demo/` directly:

```
<nav class="main-nav" data-embed-config='{"type":"menu","id":"menu-header-nav"}'>
  <a href="/tovu-demo/about">About</a><a href="/tovu-demo/contact">Contact</a>
  <a href="/tovu-demo/team">Team</a><a href="/tovu-demo/faq">FAQ</a><a href="#">Legal</a>
</nav>
```

Real, resolved links. `grep -o widget-placeholder` on the fetched page: zero matches, anywhere. The
site never shipped a placeholder for `menu`/`partial`. The export's own doc (`site-exporter.ts`)
confirms it boots the real app and fetches over real HTTP — it is not a second renderer, so this is
the same pipeline a live request hits.

## The actual bug

`resolveHtmlPageEmbeds`'s "unknown embed type" `console.warn` did not know about the ownership split
`isPageEmbedType` already encodes. It logged the identical, alarming "every occurrence degrades to the
placeholder" message for:
1. a genuine author typo / truly unregistered type (the case the warning exists for), and
2. `partial`/`menu` — routine, expected, present-on-every-render theme-structural markers that get
   resolved correctly one step later.

The message is factually false for case 2: those markers do not degrade to a placeholder; they degrade
to nothing at this stage and are filled in by `static-render.ts` moments later. Left as-is, this fires
on every static-tier page render, which both cries wolf about a real outage and — the more durable cost
— trains anyone reading the log to ignore this line, burying the one case it's actually for.

## Fix

`src/widgets/resolver-service.ts`:
- Added `THEME_OWNED_MARKER_TYPES` (`Set(["partial", "menu"])`), documented with the live-verification
  evidence above and an explicit "do not add these to `HTML_EMBED_RESOLVERS` instead" warning (doing so
  would reintroduce the substitution bug `isPageEmbedType` already fixed once).
- The "unknown embed type" `console.warn` in `resolveHtmlPageEmbeds` now skips types in that set.
  Resolution behavior is byte-identical — those types were already, and remain, absent from the
  returned map; only the log line changed.
- Extended `resolveHtmlPageEmbeds`'s own doc to state explicitly that "absent from this map" does not
  mean "renders as a placeholder" for a theme-owned type — that conflation is what caused the false
  alarm in the first place.

## Regression tests (RED confirmed before the fix)

`src/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts`, two new cases:
- `menu`/`partial` markers must not log the "unknown embed type" warning. **Failed before the fix**
  (both types logged the misleading warning; `29/30` passing). **Passes after** (`30/30`).
- A genuinely unregistered/typo type (`"widgt"`) must still log it exactly once — proves the carve-out
  didn't silence real diagnostics.

Full scoped runs after the fix, all green:
- `src/widgets/__tests__/**/*.test.ts` — 107/107
- `src/core/entry-refs/__tests__/**/*.test.ts` (shares the marker vocabulary) — 28/28

No e2e added: the defect and its fix are entirely inside a `console.warn` call in a pure server-side
resolver function — nothing about the rendered DOM changes in either the editor or the public site (the
public output was already correct, confirmed live above), so a browser-driven e2e cannot observe the
thing that changed. This is a deliberate, disclosed deviation from the "UI bugs need e2e" default, not
an oversight — that policy exists for the editor/public-renderer split, and this bug lived on neither
side of it.

## Scope note

Per dispatch boundaries, this fix touches only `src/widgets/resolver-service.ts` and its own test file
— no changes to `render.ts`, `static-render.ts`, `pages.ts`, or anything under `src/export/`, all of
which were already behaving correctly and are owned by other agents in this session regardless.

## Verification commands

```
npx tsx --test src/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts
npx tsx --test src/widgets/__tests__/**/*.test.ts
npx tsx --test src/core/entry-refs/__tests__/**/*.test.ts
npx tsc --noEmit -p .
npx eslint src/widgets/resolver-service.ts src/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts
```
