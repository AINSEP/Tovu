# Media page image size cap — 2026-09-08

## Task
Owner: admin Media page (`https://localhost:3000/admin/media`) asset tiles scale up with
screen width and get unnecessarily large on a wide display. Cap at half their current
maximum size. Small sizing fix only — no grid/layout restructuring.

## Constraint found
`apps/admin/src/styles/media.css:29-33`, `.media-grid`:

```css
grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr));
```

The actual maximum-size driver is the **second `minmax()` argument, `1fr`** — not the
360px min-width (that's the floor, doubled from 180px on 2026-09-07 for readability, and
untouched here). `1fr` marks the track as flexible, so CSS Grid's "expand flexible tracks"
step gives it every byte of leftover row space with no ceiling — literally
"without a hardcoded ceiling," per that file's own existing comment. `.media-card-media`
(`width:100%; height:100%; object-fit:cover`) then fills whatever size the track resolves
to, so the rendered image grows in lockstep with the track.

Measured live (Playwright, real dev server, no mocking) before the fix:

| viewport | container width | columns | card width |
|---|---|---|---|
| 1920×1080 | 1780px | 4 | **433px** |
| 2560×1440 | 2420px | 6 | 390px |
| 3840×2160 | 3700px | 9 | 397px |

Worked the auto-fill math (`n = floor((W+gap)/(360+gap))`, gap=16px) across the bracket
boundaries: the true ceiling this design can ever produce is ~454px, at the worst-case
bracket near a ~1620–1860px container (just under the point a 5th column would fit).
Wider than that, more columns fit and per-card overshoot shrinks back toward 360px — so
"current maximum" isn't one fixed number, it's a range that peaks around 433–454px on
realistic wide desktops and never exceeds ~454px at any width.

Half of that range (half of anything from 390px–454px) lands at 195–227px, below the
360px floor already set by the min side of the `minmax()`. Per the
CSS Grid spec, an inverted `minmax(min, max)` where `max < min` folds the track to a fixed
size equal to the minimum — so a literal "half of the current maximum" cap and "remove the
ceiling-less growth entirely, hold at the 360px floor" are the same outcome here. That's
the fix: replace the unbounded `1fr` with the same 360px the floor already uses, giving
the track a real, finite maximum instead of none.

## Change
`apps/admin/src/styles/media.css`:
```diff
- grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr));
+ grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 360px));
```
Plus an updated doc comment above the rule explaining the measurement, the math, and why
the fixed 360px cap is the correct rendering of "half of current maximum." No other file
touched. Narrow-viewport behavior (`min(360px, 100%)` on the floor) is untouched — CSS
Grid's "maximize tracks" step still fills a non-flex track's available leftover space up
to its own max, so a single sub-360px column on a narrow viewport still grows to fill the
container exactly as before; only the wide-viewport overshoot past 360px is gone.

## Verification (Playwright, live dev server, no restart)
Measured `.media-grid` computed `grid-template-columns` and card
`getBoundingClientRect().width` directly in the browser, before and after:

| viewport | before | after |
|---|---|---|
| 1920×1080 | 433px | **360px** |
| 375×800 (narrow) | 351px (fills container, no overflow) | 351px (unchanged — still fills container, `scrollWidth - clientWidth === 0`) |

Screenshots (repo-relative, `.playwright-mcp/`):
- Before, 1920×1080: `page-2026-09-08T16-13-32-291Z.png` — cards stretched to 433px, 4 per
  row filling the full row width.
- After, 1920×1080: `media-cap-after-1920.png` — cards hold at 360px, visible empty
  margin on the right of each row, everything else (tabs, upload form, card chrome,
  eye/expand icons, titles, status pills) unchanged.

No grid restructuring, no layout-system change, no other rule touched — confirmed via
`git status --short apps/admin/src/styles/media.css` (only file modified).

## tsc / tests
- `apps/admin`: `npx tsc --noEmit -p .` from `apps/admin/` → **0 errors** (matches the
  documented 0-error baseline; this is a CSS-only change so none were expected).
- No existing test in `apps/admin/src/features/media/__tests__/` asserts on `media-grid`
  or `grid-template-columns` (jsdom doesn't compute real grid track layout, so a unit test
  wouldn't exercise the actual bug/fix) — verification is the live-browser measurement
  above, not a unit test. No test file changed or added.

## Commit
`a79b8991` — `fix(admin): cap media grid card width, remove unbounded wide-screen stretch`

## Scope
Single file: `apps/admin/src/styles/media.css`. Dev server was not restarted (API
briefly bounced on its own ~3s after the CSS save per the existing tsx-watch behavior,
then came back — expected, not something I did).
