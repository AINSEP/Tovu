# Pages editor layout fixes — 2026-08-11

Dispatched as `PagesEditorLayout`. Three owner-requested layout changes to
`apps/admin/src/features/pages/PageEditor.tsx`, all UI-first per owner
instruction ("make the UI fixes ... so I can see it"). No new tests were
authored for these changes — see "Testing" below for why, and what already
exists.

## Screen
`http://localhost:5173/admin/pages/hacker-news`

## Files touched
- `apps/admin/src/features/pages/PageEditor.tsx` — JSX restructuring only,
  no state/logic changes
- `apps/admin/src/styles/pages.css` — all new CSS lives here (Pages-editor-
  exclusive stylesheet); `apps/admin/src/styles.css` was never touched

## Change 1 — close the toolbar-to-preview gap

**Measured before changing anything** (`getBoundingClientRect`, toolbar
`.bottom` to preview-pane `.top`): 36px. Root cause: `.page`'s flex
`gap: var(--space-6)` (24px, applies between every row) plus the toolbar's
own `margin: 1rem 0 0.75rem` bottom margin (12px) — two independent rules
stacking, not one.

Fix: cancel exactly the 24px flex gap for that one boundary via
`margin-top: calc(-1 * var(--space-6))` on `.page > .page-preview-frame`,
`.page > .page-html-source`, `.page > .interactive-html-editor`. What's left
is the toolbar's own pre-existing 0.75rem bottom margin — no new magic
number, and the rhythm between every OTHER row (header→title, title→slug,
slug→toolbar) is untouched.

**Scoping trap avoided:** `.page-editor-toolbar` / `.page-preview-frame` /
`.page-html-source` are shared class names — `ThemeExplore.tsx` reuses all
three, verbatim, for its own Explore screen. But `ThemeExplore.tsx` nests
them one level deeper, inside `.theme-explore-main`, while `PageEditor.tsx`
renders them as direct children of `.page`. The `.page >` child combinator
exploits that structural difference to scope the fix to Pages only. Verified
live on `/admin/themes/explore?theme=basic`: its own toolbar-to-content gap
(12px, from that screen's own separate 2026-08-11 tuning at
`.theme-explore-main .page-editor-toolbar { margin-top: 0 }` in
`styles.css`) was unaffected.

Measured after: 12px, on all three tabs (Preview/HTML/Interactive).

**Regression check (commit `3ac885e`):** clicked Desktop/Tablet/Mobile and
read `.page-preview-scaler`'s inline style each time. Desktop: `scale(0.9)`
(1280px content scaled into a ~1154px pane — matches). Tablet/Mobile:
`scale(1)` (pane wider than content, `Math.min(1, ...)` correctly holds at
1, no upscaling). ResizeObserver-driven pane tracking is intact.

## Change 2 — merge template dropdown into the toolbar row

Moved the template `<select>` (previously its own standalone row,
`.editor-template-picker`) into a new `.page-editor-toolbar-end` wrapper
inside `.page-editor-toolbar`, alongside the device-width `Desktop | Tablet
| Mobile | 1280px` segmented control. `.page-editor-toolbar`'s existing
`justify-content: space-between` still only has two children to place: view
tabs (left), this new group (right).

**Order confirmed by measurement** at 1512px viewport: tabs
`x: 272–522`, device group `x: 898–1190`, template `x: 1202–1426`
(== the row's own right edge) — tabs left, device-width middle, template far
right, matching the requested shape exactly. `sameBand` check (all three
tops within <1px) confirmed one row.

**Verified against the concurrent `PageShell` agent's work mid-task:** the
dropdown went from disabled (`No templates for this theme`) to enabled with
a real entry (`page-shell.html`) partway through this session — the theme's
`pageTemplate` array landed live. Re-measured after: still one row, still
right-justified, no layout break from the wider real template name.

**Narrow-viewport degrade** — three variable-width clusters on one row
collide sooner than the old two-cluster toolbar did, so:
- `.page-editor-toolbar-end` got its own `flex-wrap`, independent of the
  toolbar's own, so the device+template pair can drop to a second line
  without moving the tabs above them.
- Under 720px, the template `<select>` shrinks from its shared 14rem width
  (`.editor-template-picker select`, `styles.css`, shared with
  `PostEditor.tsx`) down to 11rem — scoped as
  `.page-editor-toolbar-end .editor-template-picker select` so Post's own
  picker is untouched.

Tested at 1512px (one row), 900px (still one row, tight), 700px (two rows:
tabs / device+template), 480px (three rows: tabs / device / template) — zero
horizontal overflow (`scrollWidth <= clientWidth`) at every width.

## Change 3 — title capped at half width, slug row right-justified beside it

New `.page-title-row` wraps the title `<label>` and the `.editor-slug` div,
replacing their previous two separate stacked rows.

**Trap found and avoided:** the first attempt put the width-capping class on
the title's `<label>` (`className="a11y-label-wrap page-title-field"`).
`.a11y-label-wrap` (`styles/editor.css`) is `display: contents` by design —
it exists precisely so the label drops out of the box tree and its child
`<input>` becomes the real flex item of whatever row contains it, so a
sighted-but-unlabeled input never breaks a row's layout math. That same
property means a class *on the label* sits on a box that is never generated
and does nothing. `getBoundingClientRect()` on `.page-title-field` returned
an all-zero rect — that's what caught it, not the screenshot, which looked
identical either way. Fixed by scoping the rule to
`.page-title-row .editor-title` (the actual flex child) instead.

Rule: `.page-title-row .editor-title { flex: 1 1 50%; max-width: 50%;
min-width: 0; }`, with the row itself using
`justify-content: space-between` so `.editor-slug` (no explicit width) hugs
the row's own right edge — literally "the other half of that line."

Verified: title width ÷ row width = exactly `0.5`. Slug group's right edge
== row's right edge (1472px both, at 1512px viewport). No horizontal overlap
between the two boxes. Full 37px vertical overlap between title and slug
(same row, not stacked — the shorter slug group is vertically centered
against the taller title's line-height via `align-items: center`, so their
`top` values differ by design; overlap, not `top` equality, is the right
same-row check). Stacks to full width under 640px (same breakpoint
`.editor-slug-row`, the Post editor's equivalent row, already uses) — tested
at 600px, confirmed stacked, zero overflow.

**Regression check:** `PostEditor.tsx`'s own title row (different markup,
never wrapped in `.page-title-row`) still measures full container width
(1200px == row width) on `/admin/posts/theme-authoring` — untouched, as
expected since `.editor-title`/`.editor-slug` themselves were never edited,
only wrapped in a new scoped selector.

## Testing

No new unit tests were authored. This was pure CSS/layout/JSX-restructuring
work with no new logic-bearing functions — jsdom (the existing unit-test
environment) has no layout engine, so a test asserting a class name would
not actually detect any of the three problems being fixed, matching the
owner's explicit instruction not to author test theater for pure CSS
changes. No existing test broke (nothing in
`apps/admin/src/components/__tests__/` or `apps/admin/src/features/pages/`
references the toolbar/title-row DOM shape that changed), so nothing needed
fixing either.

`npx tsc --noEmit` (from `apps/admin/`): 35 errors both before and after all
three changes — identical diff (`diff` of the two runs' output is empty).
None of the 35 are in `PageEditor.tsx` or `pages.css`.

## Commits (in landing order)
1. `b9a2206` — fix(pages): close the gap between the editor toolbar and its content pane
2. `486c75c` — feat(pages): merge the template picker into the editor toolbar row
3. `46f0234` — fix(pages): cap the title input at half width, slug row right-justified beside it

## Concurrency notes
- Never touched `apps/admin/src/styles.css` — all new CSS went into the
  already-existing, Pages-exclusive `apps/admin/src/styles/pages.css`, so no
  contention with `ExploreHeader`'s concurrent edits to the theme-Explore
  rules in the shared file.
- `PageShell`'s concurrent template-array work landed on `basic`'s
  `theme.json` mid-session and changed the dropdown's disabled/enabled state
  live — accounted for above, no rework needed.
- Every commit: explicit-path `git add`, `git diff --name-only --cached`
  confirmed exactly my files, `git show --stat HEAD` confirmed after.
- One incidental observation, not investigated further (out of this task's
  scope): the admin app twice navigated itself away from
  `/admin/pages/hacker-news` mid-session (once to `/admin/themes`, once to
  `/admin/pages/faq`) with no action from this agent. Static HTTP 500s on
  `auth/me` / `settings/effective` were also observed intermittently.
  Neither is related to this task's CSS/JSX-only changes (no server, router,
  or data-fetching code was touched) — flagging in case another concurrent
  agent's backend work is the cause.

## Deviations from the brief
None. All three changes match the brief's target shapes exactly, verified
with `getBoundingClientRect` measurements before/after per the brief's own
instruction, not screenshots alone (though screenshots were also taken for
the owner).
