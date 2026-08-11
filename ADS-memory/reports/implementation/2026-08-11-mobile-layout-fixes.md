# Mobile layout fixes — slug row + Explore banner

Dispatched by team-lead as a `<<SUBAGENT_DISPATCH>>` (agent name `MobileFixes`). Persona bootstrap
(`AI-Dev-Shop/agents/programmer/skills.md`) confirmed loaded. Branch `general-work`, not switched, not
pushed. Pure CSS task — no new unit tests added (jsdom has no layout engine; only fixed an existing
test if it broke, and none did).

Commit: `161d124` — `fix(admin): repair two mobile-only CSS layouts (slug row + Explore banner)`.

## Concurrency note (load-bearing for how this was committed)

`PostEditorTabs` was concurrently editing `apps/admin/src/styles.css` in the same working tree (adding
a `border-bottom` to `.editor-title-row`/`.editor-title` and removing the now-unused
`.editor-slug-row { flex-direction: column; ... }` mobile rule). A plain `git add apps/admin/src/
styles.css` would have swept their uncommitted work into my commit. Used `git add -p` (answered
y/n/n/y to the four hunks `git diff` showed) to stage only my two hunks, then confirmed with `git diff
--cached --stat` (24 insertions, 1 deletion — matches exactly my two edits) before committing. `git
status --short` afterward still shows `apps/admin/src/styles.css` modified, which is expected: that's
PostEditorTabs' remaining unstaged work, untouched by me.

## Bug 1 — slug row split into three lines below 640px (Pages AND Posts)

**Root cause, confirmed by reading the cascade rather than assuming**: `.editor-slug` (`styles.css`,
shared by both editors — Pages' `.page-title-row .editor-slug` and Posts' `.editor-title-row
.editor-slug` both resolve to the same base rule, since neither `pages.css` nor the Posts-side rules
override the input's width) is a `display: flex; flex-wrap: wrap` row containing `/`, the slug
`<input>`, and the `view ↗` link. The `@media (max-width: 640px)` block set `.editor-slug input {
width: 100%; }` — a full-width flex child inside a wrapping flex row always isolates itself onto its
own line, which is exactly the three-line split reported ("/" alone, full-width input, "view ↗" alone).

**Fix**: `apps/admin/src/styles.css`, inside that same media block —
```css
.editor-slug input { flex: 1 1 auto; min-width: 0; }
```
`flex: 1 1 auto` lets the input grow to fill the leftover space next to the tiny `/` and `view ↗`
siblings instead of claiming the whole row; `min-width: 0` overrides the browser's default `min-width:
auto` on flex items, which floors at the input's content size and was defeating plain `flex-shrink`.

Confirmed via `git diff` that only ONE stylesheet actually controls the input's width at any
breakpoint (`pages.css`'s own mobile block only touches `.editor-slug`'s `justify-content`/`text-align`,
never the input) — so this one shared rule was the sole fix needed for both screens, not two separate
opinions layered on top of each other.

**Verification — `getBoundingClientRect`, both editors, all five widths**:

| Width | Screen | `/` top | input top | `view↗` top | x-ranges (no overlap) | Read as |
|---|---|---|---|---|---|---|
| 390 | Pages | 314.4 | 304.7 | 314.4 | 12–17 / 26.9–326.2 / 335.8–378 | one line |
| 495 | Pages | 294.9 | 285.2 | 294.9 | 12–17 / 26.9–431.2 / 440.8–483 | one line |
| 640 | Pages | 282.9 | 273.2 | 282.9 | 12–17 / 26.9–576.2 / 585.8–628 | one line |
| 768 | Pages | 186.6 | 176.8 | 186.6 | input fixed **224px** (14rem, unchanged) | desktop unchanged |
| 1280 | Pages | 145.1 | 135.3 | 145.1 | input fixed **224px** (14rem, unchanged) | desktop unchanged |
| 390 | Posts | — | 284.2 | 293.9 | 26.9–326.2 / 335.8–378 | one line |
| 495 | Posts | — | 284.2 | 293.9 | 26.9–431.2 / 440.8–483 | one line |
| 1280 | Posts | — | 134.8 | 144.6 | input fixed **224px** | desktop unchanged, matches Pages exactly |

(Text-baseline items sit a few px lower than the taller input due to `align-items: center` — that's
vertical centering, not a wrap; horizontal x-ranges are the proof that matters and none overlap at any
width.) Desktop input width is byte-identical before/after (14rem = 224px, untouched by the media
query) on both screens.

Screenshots (repo root, gitignored scratch location used by the Playwright plugin's default output
dir): `pages-slug-after-495.png`, `posts-slug-after-495.png` — both show `/ [slug] view ↗` on one row.
I did not capture "before" shots: reproducing the bug would have meant reverting my already-committed
hunk inside a file `PostEditorTabs` is actively editing, for a marginal screenshot-only benefit over
the numeric proof above — judged not worth the shared-file risk.

## Bug 2 — Explore banner stuck at half-width on mobile

**Root cause**: `.theme-explore-directions { max-width: 50%; }` (`styles.css`, added earlier today per
owner feedback that it ran full desktop width "unnecessarily") had no mobile release. The element is a
**sibling** of the `.theme-explore` file-list/editor grid (not a grid item), so it doesn't inherit that
grid's own `@media (max-width: 720px)` single-column collapse — it needed its own rule.

**Fix**: added directly after the existing desktop rule —
```css
@media (max-width: 640px) { .theme-explore-directions { max-width: 100%; } }
```
Used 640px (this file's dominant component-level mobile breakpoint, same one `.editor-slug` above
uses) rather than the grid's 720px: 720px is where the two-column file list/editor layout collapses, a
wider "tablet" cutoff than this one-sentence callout needs — at 768px the halved column already reads
as 2–3 lines, not the reported 7-line stack, so releasing the cap that early isn't warranted.

Also checked the subtitle (`.theme-explore-header.page-header .page-description { max-width: 34ch;
}`) per the brief's instruction to confirm rather than assume: measured width is a fixed **353.9px**
at both 1280px and 495px viewports (a `ch` cap doesn't scale with container), which is well under the
container width at every tested size (471px page width at 495px viewport) — never actually constrains
anything. Left unchanged, as suspected.

**Verification — `getBoundingClientRect`, `.theme-explore-directions` vs `.page` container width**:

| Viewport | `.page` width | banner width | ratio |
|---|---|---|---|
| 390 | 366 | 366 | 100% (mobile) |
| 495 | 471 | 471 | 100% (mobile, the owner's repro width) |
| 640 | 616 | 616 | 100% (breakpoint boundary, inclusive) |
| 768 | 736 | 368 | 50% (desktop cap resumes immediately above the boundary) |
| 1280 | 968 | 484 | 50% (desktop, unchanged from before this fix) |

Screenshot after fix at 495px: `explore-banner-after-495-v2.png` — banner spans the full column, reads
as three lines with no dead space, matching the "You're editing your own copy..." text. (An earlier
screenshot attempt, `explore-banner-after-495.png`, landed on a stale route — the admin app navigated
itself back to `/admin/posts/theme-authoring` mid-session on its own, unprompted by any click here; the
`browser_evaluate` calls immediately before and after both confirmed the correct Explore DOM was
present when measurements were taken, so the numeric proof above is unaffected. Flagging the
navigation glitch itself as an out-of-scope oddity — possibly related to the `AssistantDock` or SSE
work visible as modified/untracked elsewhere in `git status`, neither of which this task touched.)

## Files changed

- `apps/admin/src/styles.css` — the two `@media (max-width: 640px)` rules above. No other file
  touched; no TSX changed for either bug (confirmed both are pure CSS, as the dispatch predicted).

## tsc baseline

`cd apps/admin && npx tsc --noEmit` — **35** errors before and after (unchanged; both edits are
CSS-only, no `.ts`/`.tsx` touched). Baseline confirmed via fresh run before starting, not assumed.

## Architecture Audit

**PASS.** No ADR boundaries apply to CSS-only edits in an existing stylesheet; no new files, no new
dependencies, no cross-package changes. Stayed entirely inside `apps/admin/src/styles.css`, did not
touch `PostEditor.tsx`, `editor.css`, or anything under `src/features/theme/`, `src/server/`,
`src/core/embeds/`, `src/widgets/` (the concurrent `UnifiedContent` agent's territory, per dispatch).

## Pre-Completion Checklist

- Requirements re-verified: both bugs' exact reported symptoms (three-stacked-line slug row; half-width
  Explore banner) reproduced from the CSS cascade before editing, not assumed from the dispatch's own
  hypothesis alone.
- Fresh evidence: `getBoundingClientRect` tables above, captured after the fix was live, at 5 widths
  each, on both affected editors for bug 1.
- No tests deleted, weakened, or added (none applicable — CSS/layout, no jsdom coverage possible).
- Scope: `apps/admin/src/styles.css` only, and only the two hunks that are mine (verified via
  `git diff --cached` before committing, given the concurrent edit in the same file).
- Open items: none for this task. The stale-route navigation glitch noted above is unrelated and
  unresolved — flagging, not fixing, since it's outside this dispatch's file scope.

## Self-Validation

Required (runtime/UI behavior in scope) — **PASS**. Verified live against the dev server
(`localhost:5173`, already-running instance, not restarted) via the Playwright plugin (isolated
headless Chromium, never `chrome-devtools-mcp`). Critical path: both editors' slug rows and the Explore
banner at the owner's exact repro width (495px). Edge path: the breakpoint boundary itself (640px,
inclusive) and immediately above it (768px) to prove the desktop rule resumes correctly. No bounded
diagnosis pass needed — root cause was located by reading the cascade once, not by trial and error.

## Style Notes

No new or materially changed logic-bearing functions — CSS-only. Both new rules carry inline comments
explaining the mobile-vs-desktop reasoning and the specific mechanism (flex min-width default,
sibling-not-grid-item), matching this file's existing comment density.

## Risks / tech debt

None introduced. The `.editor-slug-row` mobile stacking rule that `PostEditorTabs` removed (visible in
the full `git diff` before I staged, not something I touched) is their concern, not mine — flagging
only so whoever reviews the final combined diff on this file knows two agents' hunks are interleaved by
line number even though they're unrelated changes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
