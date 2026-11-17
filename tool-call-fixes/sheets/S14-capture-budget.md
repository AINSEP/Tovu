# S14. Screenshot budget from the request; best effort once the page has loaded (C6, mechanism M8)

Repos: Jini (`diagnostics`), Tovu. Estimate: 180k Sonnet. Prerequisites: none. OD-5 sets the cap (proposal 45 s).

## Read first
`../DESIGN.md` §2.8, M8. Jini `diagnostics/src/web-evidence/render-page.ts` (the phases: context, navigation, wait,
load wait, `consume`), `page-work-budget.ts` (`PageWorkBudget`, `PageWorkTimeout`).
Tovu `apps/website/src/features/web-screenshot/web-screenshot.ts` (`CAPTURE_DEADLINE_MS`, the message builder near
"did not finish rendering", `settleMs`), `playwright-page-capture.ts` (`shoot`, `shootFrame`, the outer race,
`FALLBACK_FRAME_RESERVE_MS`), `desktop-page-capture.ts`, existing capture tests and their fake page.

## Inventory step
Every reader of `CAPTURE_DEADLINE_MS` and every test asserting `20 seconds` or `exceeded 20000ms` (both repos). Every other caller of `renderPage` (evidence, crawl): their behaviour must not change (they do not pass the new option).

## Characterization (passes today; fake page + fake clock, no real browser)
1. navigation resolves at 3 s, requested wait 18 s → `timeout`, no image.
2. `fullPage` scroll takes 19 s → `timeout`, no image.
3. stable-frame screenshot never settles → current frame + the existing note (already works; pin the note text).
4. navigation never commits → `timeout`.

## Red-first
`captureBudget` (pure): `{ settleMs: 0, fullPage: false }` → 20 000; `{ settleMs: 10_000, fullPage: true }` → 20 000 + 10 000 + full-page allowance; never above the cap; reserve 4 000; negative or NaN inputs clamp to base.
Capture: cases 1 and 2 → an image is returned with a note exactly
`page loaded but did not settle within N s; captured the current frame (content may still be loading).`
Case 4 → still fails, with `this site did not answer within N seconds.` and N is the real budget.
A page that hangs the renderer (screenshot call never returns) → the outer race still fails and closes the browser, at the computed total (not at 20 s, not never).

## Change
1. Jini: `web-evidence/capture-budget.ts` (pure). `renderPage` gets an optional `onBudgetExhausted: 'fail' | 'consume-current'` (default `'fail'`): with `'consume-current'`, a `PageWorkTimeout` raised after navigation committed calls `consume` once with a short fresh reserve budget and `phaseTimedOut: 'wait' | 'load'`. Before commit it still throws.
2. Tovu: compute the budget per request; pass it to `renderPage` and to the outer race; scroll timeout in `consume` falls through to the frame instead of rethrowing (it rethrows today when the error is `PageWorkTimeout`); message uses the real number.
3. Keep every egress rule, router and origin policy exactly as they are (do not touch `createRequestRouter` options).

## Acceptance
All cases green with exact text; other `renderPage` callers' tests unchanged; no real network or browser in tests; the tool description's stated limits (if it quotes 20 s) updated together with the guide lint.
