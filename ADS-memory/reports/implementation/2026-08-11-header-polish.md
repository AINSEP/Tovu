# Header polish — title underline scope + Explore callout collapse

Dispatched by team-lead as a `<<SUBAGENT_DISPATCH>>` (agent name `HeaderPolish`). Persona bootstrap
(`AI-Dev-Shop/agents/programmer/skills.md`, Programmer v1.7.1) confirmed loaded in the first reply.
Branch `general-work`, not switched, not pushed.

**Commits**: work landed across three commits, two of them autonomous Coordinator checkpoints taken
mid-session (not authored directly by me, but captured exactly my in-flight edits — see
"How this got committed" below) plus one I made directly at the end:

- `607a412` — checkpoint: title-underline CSS (styles.css, pages.css)
- `a7eedab` — checkpoint: InfoTip component + Explore callout collapse (InfoTip.tsx, ThemeExplore.tsx,
  styles.css)
- `760e615` — mine: the placement-flip fix + its tests, found during live verification after the
  checkpoints already ran

## How this got committed (read before assuming anything is missing)

Partway through this task the Coordinator took two automatic "session may be disconnected" snapshot
commits of my uncommitted work (`607a412`, `a7eedab` — see their own messages: "captured mid-write,
UNREVIEWED, verify rather than trust"). This is a real, working safety net in this repo, not a
git-index accident: both commits' diffs are scoped to exactly my files and explicitly exclude other
agents' concurrent edits (AssistantDock.tsx, AgentPlugins.tsx, panels.tsx, etc. — see `607a412`'s own
message). Practical effect: `git status`/`git diff` on `pages.css` and `ThemeExplore.tsx` show clean
right now even though this report covers changes to them — they're not missing, they're already in
history. Everything below was verified against the final state on disk / at `HEAD`, not against
either checkpoint in isolation.

## Change 1 — title underline stops at the title, not the row

**Files**: `apps/admin/src/styles.css` (`.editor-title-row` / `.editor-title-row .editor-title`),
`apps/admin/src/styles/pages.css` (`.page-title-row .editor-title`, same treatment for Pages).

**The ask**: commit `5d73e41` had moved the title's `border-bottom` off the (half-width) `.editor-title`
input and onto the whole `.editor-title-row`, so the rule ran the full row width under both the title
and the slug group. Owner wanted it back under the title only, but "make it look deliberate rather
than truncated" — a bare revert had already been tried and rejected live once (border-bottom on
`.editor-title` stopping dead at the 50% mark next to the slug group, "ended mid-air").

**What I tried and rejected first**: recoloring the resting border to `--accent-text` (the token
`.editor-title:focus` already uses) to read as an intentional accent rule. Rejected after checking
computed style: this theme's `--accent-text` resolves to `oklch(26% 0.006 260)`, effectively
indistinguishable from `--fg`'s `oklch(24% 0.022 262)` — it just read as "bolder line," not "accent."
Worse, it would have made the `:focus` state invisible on this field, since focus and rest would then
share the same color — the ONLY visible focus signal this input has (`outline: none; box-shadow: none`
on `.editor-title:focus`).

**What shipped**: a left-to-right fade via `border-image` instead of a flat `border-bottom-color` —
solid for the first 65% of the title's own width, tapering to transparent at the edge. Verified live,
side by side, that a hard-edged hairline reads as clipped while the same line with a soft trailing
edge reads as a deliberate typographic accent. `border-image` takes over painting that edge entirely
once set, so a dedicated `.editor-title-row .editor-title:focus` (and the Pages equivalent) rule
swaps the gradient's solid stop to `--accent-text`, preserving the focus affordance through the
gradient instead of a flat color change. Same rule, same reasoning, both editors — kept in sync per
the dispatch's own ask to check Pages for the same treatment.

```css
.editor-title-row .editor-title {
  flex: 1 1 50%; max-width: 50%; min-width: 0;
  border-bottom: 1px solid var(--border);
  border-image: linear-gradient(to right, var(--border) 65%, transparent) 1;
}
.editor-title-row .editor-title:focus {
  border-image: linear-gradient(to right, var(--accent-text) 65%, transparent) 1;
}
```

**Verification — `getBoundingClientRect` + computed style, both editors, four widths, both real
browser (Playwright, :5173) and screenshots**:

| Width | Screen | Row width | Title width | Ratio | Border-image (rest) |
|---|---|---|---|---|---|
| 1280 | Posts | 968px | 484px | exactly 50% | `oklch(0.915 0.007 255)` (`--border`) fading to transparent |
| 768 | Posts | 736px | 368px | exactly 50% | same |
| 640 | Posts | 616px | 616px | 100% (mobile stack) | same |
| 390 | Posts | (stacked) | full width | 100% | same, screenshot confirmed |
| 1280 | Pages | 1154px | 577px | exactly 50% | same |

Focus-state color confirmed by reading `getComputedStyle(...).borderImageSource` before vs. after
`element.focus()` on the SAME node (both editors): rest = `oklch(0.915 ...)`, focus =
`oklch(0.26 0.006 260)` (`--accent-text`) — the gradient recolors distinctly, so the focus affordance
this input had before is intact, just carried by the gradient instead of a flat border color.

Note on process: one early measurement of this looked like focus and rest were already the SAME
color — that was `getComputedStyle`'s live-object behavior (`cs.borderImageSource` reflects current
state whenever read, not a snapshot from when `cs` was created), not a real bug. Caught by re-running
with the string value captured immediately, before calling `.focus()`, in one function call.

## Change 2 — Explore's "editing your own copy" collapses to one line + tooltip

**Files**: `apps/admin/src/features/themes/ThemeExplore.tsx`, `apps/admin/src/styles.css`,
`apps/admin/src/components/InfoTip.tsx` (reused + extended, not rebuilt).

**Before checking for an existing component** (per the dispatch's explicit instruction), searched for
tooltip primitives already in this admin. Found `components/InfoTip.tsx` — a fully built, portaled,
hover/focus-opening "ⓘ" tooltip with its own CSS (`styles.css` lines ~356–388), added 2026-08-09 for a
Menus column header. `grep` showed it had **zero actual call sites** — built, styled, never wired up.
Reused it as-is rather than building a second bespoke tooltip (the dispatch's own stated concern:
"a second bespoke tooltip is exactly the duplication pattern that has bitten this codebase
repeatedly"). It already opens on hover AND focus (keyboard-reachable via `tabIndex={0}` +
`aria-label`) and is NOT the native `title` attribute (that was tried and rejected for this exact
component already, per its own doc comment: too slow, inconsistent with screen readers, invisible on
touch).

**Split the old `ThemeExploreDirectionsNotice`** (which handled two unrelated cases behind one
`hasOriginal` branch) into two components:
- `ThemeExploreDirectionsNotice` — now only the no-original **warning** (`hasOriginal: false`). Left
  as a full, un-collapsed `.notice.warning` — it's an actionable limitation ("edits here cannot be
  reset"), not reassurance, so it stays visible rather than being tucked behind a tooltip an operator
  might not open before editing.
- `ThemeExploreCopyTip` (new) — the reassurance case. Renders `"You're editing your own copy."` as
  plain text plus an `<InfoTip>` whose label carries the rest of the original sentence
  ("An untouched original is kept separately...") AND the copy-lineage clause ("Copied from X vY.")
  when present — the owner's own framing was "the rest of the message" as one unit, so both fold into
  the same tooltip rather than the lineage staying its own visible clause.

**Positioned in the header's own actions column**, not as a styled sibling of `.page-header`: added
`.theme-explore-header-actions` (flex column, `align-items: flex-end`, `margin-left: auto`) wrapping
BOTH the existing `.page-actions` button row (← All themes / Save / Reset) and the new
`.theme-explore-copy-tip` line beneath it. `margin-left: auto` (not just `.page-header`'s own
`justify-content: space-between`) matters specifically at the wrap breakpoint: when `.page-header`
wraps the actions column onto its own line below the title, `space-between` has nothing left to
distribute a single wrapped item against and would otherwise leave it flush left — auto margins are
resolved per flex line, so this keeps it pinned right in both the same-row and wrapped-row cases
(verified at all four widths below).

Removed the old `.theme-explore-directions` CSS entirely (border-left, `max-width: 50%` card sizing,
its own 640px override) — nothing renders with that class anymore.

**Verification — live, `getBoundingClientRect`, real browser at :5173, `theme=basic`**:

| Metric | Value | Reads as |
|---|---|---|
| `.theme-explore-copy-tip` height | 18.47px | one line (confirmed, not wrapped) |
| Tip right edge vs. header right edge vs. button-row right edge | 1426 / 1426 / 1426 (all equal) | flush right-aligned under the button row |
| Gap between header bottom and file-list-grid top | 24px (`--space-6`, one flex gap) | old block's two 24px gaps + its own ~85-95px height (a 3-line `.notice` at the removed `max-width: 50%`, per the owner's own "taking three lines" description) are gone; **before** figure is calculated from the removed CSS's own padding/line-height/border values, not re-measured live, since recreating the old DOM to screenshot it would have required a `git stash` across a shared multi-agent working tree — reconstructed reasoning only, flagged as such |
| Icon `aria-label` | "An untouched original is kept separately, so you can change anything here without losing what you started from." (no lineage on the `basic` theme, which has none) | tooltip content matches source, conditional lineage clause omitted correctly when absent |

**Breakpoints checked, all four, live**: 1280 (side-by-side row) — 768 (still side-by-side, actions
column right edge = header right edge) — 640 and 390 (both wrap the actions column below the title,
right-aligned, `actionsCol.right === header.right` confirmed at both, no overflow of the `nowrap` tip
line). Screenshots taken at all four; representative ones and the raw measurement JSON are in
`/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/2743b351-85fd-4e95-971f-cffec36e9a3c/scratchpad/header-polish-screenshots/`
(not committed — working artifacts, not product files).

### Bug found live, fixed, and tested: InfoTip clipped at the viewport top

Focusing the new icon showed the tooltip bubble rendering at `top: -5.2px` — clipped against the
browser window itself. Root cause: `InfoTip` always opens above its trigger (a deliberate owner
preference from its original Menus use case, where there was always room), but this new call site
sits only ~74px below the viewport top, closer than any previous caller. Not an "ancestor clips it"
problem (the component already solves that with a portal) — the viewport itself was the ceiling this
time.

Fixed with a headroom check (`ABOVE_HEADROOM_PX = 176`, chosen generously above the ~72px this
3-line label actually measures at, since the portal only mounts once `open` is already true — there's
no real bubble height to read at the decision point, only an estimate): below that much room above
the icon, the bubble opens downward instead, with a mirrored CSS variant (`.info-tip-bubble-below`)
for the transform and arrow direction. Verified live after the fix: bubble `top: 100.4px` (fully
on-screen), `className` correctly switches to `info-tip-bubble info-tip-bubble-below`, screenshot
confirms the arrow now points up at the icon from below.

This is a shared, previously-unused component — the fix and its two new unit tests (mocking
`getBoundingClientRect` to drive both the above and below branches explicitly, since jsdom's default
all-zero rect already happens to exercise "below" without a test ever asserting on it) are committed
separately at `760e615`, after the two Coordinator checkpoints had already captured everything else.

### Accessibility addition: Escape dismissal

The dispatch required keyboard dismissibility beyond focus/hover for any tooltip in scope. `InfoTip`
already opened on focus and closed on blur, but had no way to close-in-place without moving focus.
Added an `onKeyDown` handler on the icon: Escape while open calls the same `hide()` used by
`onMouseLeave`/`onBlur`, with `stopPropagation` so it can't also bubble to a future ancestor
dialog/drawer that treats Escape as "close me." Covered by 2 of the 8 tests in
`InfoTip.unit.test.tsx` (closes without moving focus off the icon; no-op when already closed).

Also corrected two stale claims in `InfoTip.tsx`'s own header comment while already touching it
(per the standing instruction to verify comment claims rather than trust them): it asserted Menus'
"Assign location" column was its "first real use" — `grep` showed zero actual call sites anywhere
before this task, so that never happened; ThemeExplore.tsx is the actual first caller. Reworded
without deleting the underlying `.list-table`/`overflow: hidden` portal justification, which is still
valid reasoning even though the specific scenario it described was hypothetical, not historical.

## Test results

- `ThemeExplore.unit.test.tsx`: 43/43 (baseline, unchanged — no test asserted on the removed
  `.theme-explore-directions` markup/text)
- Posts (`rules`, `PostTemplateModal`, `PostEditor`, `Posts`): 90/90 (baseline, unchanged)
- `PageEditor.unit.test.tsx`: 38/38 (unchanged — pages.css is pure CSS, no markup touched)
- `InfoTip.unit.test.tsx` (new): 8/8 — open/close on focus, blur, hover/unhover, Escape (2 cases),
  and the two new placement-flip cases
- Combined final sweep across all seven files: **183/183 passed**

No new unit tests for the pure-CSS underline change (Change 1) — jsdom has no layout engine, matches
standing guidance. `InfoTip.unit.test.tsx` IS new despite that: it's interaction/state logic
(open/close/placement), not layout, and is directly testable in jsdom without a real renderer.

`cd apps/admin && npx tsc --noEmit`: **35 errors, unchanged from the stated baseline**, none in any
file this task touched. (One intermediate run briefly showed 43 — traced to `PageEditor.tsx` type
errors from a different concurrent agent's in-flight work, confirmed via `diff` of the error file
lists between two tsc runs; not caused by anything here, and gone by the final check.)

## Concurrency

Touched only `styles.css`, `styles/editor.css` (not actually needed), `styles/pages.css`,
`ThemeExplore.tsx`, and `components/InfoTip.tsx` (+ its new test file) — all within the dispatch's
stated ownership. Never touched `PostEditor.tsx`, `PageEditor.tsx`, or any `hooks/` file. Confirmed
via `git diff --stat` before each stage/commit that only my own files were included; the two
Coordinator checkpoints independently confirm the same scoping from their own diffs.

## Loop Alert

Browser-automation verification (Playwright MCP, shared across ~15+ concurrent agents this session)
was severely degraded for a stretch: repeated 60s navigation timeouts and two ~30-minute hangs on
`browser_evaluate`, while `curl` against the same dev server URLs confirmed the app itself responded
in single-digit milliseconds throughout — the contention was in the shared browser tool layer, not
the product. Recovered after closing stuck tabs and opening fresh ones (worked on the 2nd–3rd retry
each time); every live number and screenshot in this report was captured after recovery, none are
stale/pre-fix. Flagging this because it cost real time and could recur for the next agent hitting the
same shared browser.

## Known gaps

- The "before" vertical-space figure for Change 2 is calculated from the removed CSS's own values
  (padding, line-height, the owner's stated "three lines"), not re-measured against a live pre-change
  render — reconstructing that would have needed a `git stash` across a working tree with other
  agents' uncommitted work sitting in it, which was ruled out as too risky. The "after" figures are
  all directly measured.
- Did not touch `styles/editor.css` — read it during discovery, found no title-row-relevant rules
  there (the underline lives in `styles.css`), so nothing changed there.
