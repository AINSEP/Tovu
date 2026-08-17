# Embed placeholder gap — `resolveHtmlPageEmbeds` "unknown embed type" warning for `menu`/`partial`

**This is a diagnostics bug, not a rendering bug.** The public site never shipped a placeholder for
`menu`/`partial` — the log line claiming it did was false. `resolveHtmlPageEmbeds` warns about types it
does not own, because it has no knowledge of the two-stage marker-resolution split
`renderViaTemplate`/`static-render.ts` implement.

Status: **FIXED**
Author: Programmer subagent (Claude Sonnet 5), dispatched by team-lead
Trigger: a real GitHub Pages export (`gh-pages` commit `c0e52de2`,
https://leonaburime-ucla.github.io/tovu-demo/) printed
`[widgets] resolveHtmlPageEmbeds: unknown embed type, every occurrence degrades to the placeholder`
~17 times for `type: 'partial'` and `type: 'menu'`.

**Correction on the trigger read:** the "the live site is shipping placeholders" reading came from
team-lead reading this export log, not from the page itself — the dispatch brief that opened this
investigation stated it as established fact. It wasn't: see "Verified against the live artifact"
below. Recording this plainly because the log made a false claim look like a live content defect, and
someone acted on it before this investigation checked the actual page.

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

`resolveHtmlPageEmbeds`'s "unknown embed type" `console.warn` fires whenever a marker type has no entry
in `HTML_EMBED_RESOLVERS` — the same test `isPageEmbedType()` (`render.ts`) already performs for a
different purpose (deciding whether to leave a marker untouched for substitution). But that single bit
of information — "is this resolver-service's own type, yes/no" — cannot distinguish the two very
different reasons a type can be absent from the registry:
1. a genuine author typo / truly unregistered type (the case the warning exists for), and
2. `partial`/`menu` — routine, expected, present-on-every-render theme-structural markers, KNOWN and
   owned by `static-render.ts`, just not by this module.

`isPageEmbedType()` returns `false` for both, so it cannot be reused as-is to gate the warning: doing
so would silence it for case 1 too, which is the one case it exists to catch (see "reuse decision"
below for why `isPageEmbedType()` isn't the right sibling despite the superficial resemblance).

The message is factually false for case 2: those markers do not degrade to a placeholder; they degrade
to nothing at this stage and are filled in by `static-render.ts` moments later. Left as-is, this fires
on every static-tier page render, which both cries wolf about a real outage and — the more durable cost
— trains anyone reading the log to ignore this line, burying the one case it's actually for.

This is the same failure class this codebase has been bitten by before: `verifyPublishCredentialById`'s
doc comment asserted "never throws" and was false, and a caller trusted that claim and skipped a
`try/catch`, which became a process-killing bug (see `feedback_verify_claims_in_code_comments` /
`reference_symptom_reachable_by_many_routes` project history). A log line asserting an outcome the code
does not actually guarantee is the cheap version of the same defect — the fix here is to make the
message truthful, not to delete it.

## Reuse decision: `isPageEmbedType()` is not the right single source of truth

Team-lead's review correctly flagged the risk of a second, independent `partial`/`menu` list drifting
from the real owner. The instinct to reuse `isPageEmbedType()` for that is reasonable on its face, but
it doesn't hold up mechanically: `isPageEmbedType(type)` is defined as `Object.hasOwn(HTML_EMBED_RESOLVERS,
type)` — it is already exactly what this loop's own `HTML_EMBED_RESOLVERS[type]` lookup tests. It
encodes one fact ("is this resolver-service's own type"), which is `false` for `partial`/`menu` AND for
a genuine typo alike. There is no second fact hiding inside it to distinguish "known, owned elsewhere"
from "owned nowhere" — reusing it as the warning's skip condition would silence the warning for BOTH
cases, which fails the explicit requirement (and the paired regression test) that a real typo type must
keep warning.

The fact this warning actually needs — "which types does `static-render.ts` itself treat as
theme-structural" — exists today only as inline string-literal comparisons inside that file
(`injectMenuEmbeds`'s `marker.type !== "menu"`, `resolveSlots`'s `marker.type !== "partial"`). The
real single-source-of-truth fix is hoisting that fact into `core/embeds/marker.ts` — the shared,
layer-neutral marker module both `resolver-service.ts` and `static-render.ts` already import from, so
no new or circular dependency is introduced — as an exported constant, then having `static-render.ts`
read its two checks off that constant instead of its own literals. That is a small, mechanical,
behavior-preserving edit, but it lands inside `static-render.ts`, which this dispatch's file-ownership
rules assign to a different agent (`arch-export-edge`) — asked before touching it rather than taking it.

Until that's authorized, the shipped fix hardcodes the same two literals in `resolver-service.ts` with
a comment naming the actual sibling that must stay in sync (`static-render.ts`'s `resolveSlots`/
`injectMenuEmbeds`, not `isPageEmbedType()`) and pointing at this section for the upgrade path.

**Decision: HOLD the hoist, per team-lead, 2026-08-16.** Not a disagreement with the diagnosis — three
independent reasons: (1) `static-render.ts` is `arch-export-edge`'s active territory tonight, and a
concurrent edit there is a collision risk not worth buying for a cleanup; (2) the owner asked to close
out and review this batch, and every extra edit widens that diff; (3) the shipped interim version is
correct, tested both directions, and already documents the exact upgrade path below — a safe resting
state, not a stopgap that silently misleads.

### Follow-up (HELD, not authorized tonight)

**Blocked on:** `src/features/theme/static-render.ts` is `arch-export-edge`'s active territory
tonight (mid-refactor moving `resolveActiveTheme`/`resolveActiveThemeId`/`resolveStorefrontProducts`
into `src/features/theme/`, uncommitted tree already touches `src/features/theme/index.ts`) —
team-lead's call, 2026-08-16, to avoid a collision for a cleanup-grade change. Re-check that
agent/file's status before picking this up; it may be clear by the time this is read.

**Exact change, so no re-derivation is needed:**

1. In `src/core/embeds/marker.ts` (neutral — both consumer files below already import from it, so
   this introduces no new dependency edge and no circularity), export:
   ```ts
   export const THEME_STRUCTURAL_MARKER_TYPES: ReadonlySet<string> = new Set(["partial", "menu"]);
   ```
2. In `src/features/theme/static-render.ts`, replace the two inline literal comparisons with reads
   off that constant, behavior-preserving:
   - `injectMenuEmbeds`: `if (marker.type !== "menu" || ...)` → `if (!THEME_STRUCTURAL_MARKER_TYPES.has("menu") || marker.type !== "menu" || ...)` is unnecessary ceremony for a 2-member set — simplest faithful change is importing the constant for documentation/drift-prevention purposes and keeping the direct `"menu"`/`"partial"` string comparisons as-is, OR (cleaner) exporting two named constants (`MENU_MARKER_TYPE = "menu"`, `PARTIAL_MARKER_TYPE = "partial"`) from `marker.ts` instead of a set, and having both `static-render.ts`'s two comparisons AND `resolver-service.ts`'s set literal reference those same two named exports. Whoever implements this should pick whichever of the two shapes reads more naturally at each of the three call sites (two in `static-render.ts`, one in `resolver-service.ts`) — the set-vs-named-constants choice is a style call, not a correctness one.
   - `resolveSlots`: same treatment for the `"partial"` comparison.
3. In `src/widgets/resolver-service.ts`, replace the local `THEME_OWNED_MARKER_TYPES` definition
   (currently `new Set(["partial", "menu"])`, ~line 788) with an import of whatever `marker.ts` ends
   up exporting from step 1, and drop the "kept in sync manually" language from its doc comment
   (~lines 780-786) since it will no longer apply.
4. Re-run this ticket's verification commands (bottom of this report) plus
   `src/features/theme/__tests__/**/*.test.ts` (static-render.ts's own suite) to confirm no
   regression on either side of the new shared constant.

**Generic embed contract interaction: none.** The settled-but-unimplemented `data-embed-type`
registry-keyed-resolver plan (`ADS-memory/reports/media-embeds/IMPLEMENTATION-PLAN-data-embed-type-2026-08-07.md`)
is entirely about `HTML_EMBED_RESOLVERS`'s own shape (widget/media/post/form-successor types). Neither
this fix nor the proposed `core/embeds/marker.ts` hoist touches `HTML_EMBED_RESOLVERS` or its resolver
signature — `partial`/`menu` are a separate vocabulary that plan explicitly does not cover (theme
structure, not page-embeddable content), so there's nothing here that fits or fights that plan.

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
