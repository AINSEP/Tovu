# S14b. Screenshot budget from the request; current frame once the page has loaded (C6, mechanism M8, Tovu)

Repo: Tovu. Estimate: 150k Sonnet. Prerequisites: S14a.
Blocking decision: none.
Branching decision: **OD-5** (while OPEN: the "no" branch: the cap stays 20 s and only the current-frame fallback is adopted, case 6).
Landed check: `rg -n "softDeadlineMs" ../Jini/packages/diagnostics/src/web-evidence/render-page.ts`.

## Read first
`rg -n "CAPTURE_DEADLINE_MS|did not finish rendering" apps/website/src/features/web-screenshot/web-screenshot.ts` ·
`rg -n "deadlineMs|FALLBACK_FRAME_RESERVE_MS|function shootFrame|Promise.race|PageWorkTimeout" apps/website/src/features/web-screenshot/playwright-page-capture.ts` ·
`desktop-page-capture.ts`, the existing capture tests and their fake page.

## Inventory step
`rg -n "CAPTURE_DEADLINE_MS|20 seconds|exceeded 20000ms|20 s deadline" apps packages development ../Jini/packages`: every reader and every test.

## Characterization (passes today; fake page + S14a's fake clock from `@jini-ai/diagnostics/web-evidence/testing`)
1. navigation at 3 s, requested wait 18 s → `timeout`, no image.
2. `fullPage` scroll takes 19 s → `timeout`, no image.
3. stable-frame screenshot never settles → current frame + the existing note (pin the note text).
4. navigation never commits → `timeout`.
5. the outer race and `renderPage` use the same number today (pin both values).

## Red-first
1. cases 1 and 2 → an image, with the note exactly
   `page loaded but did not settle within N s; captured the current frame (content may still be loading).` where N is `softDeadlineMs / 1000`.
2. case 4 → still fails, with `this site did not answer within N seconds.`, N the real work deadline.
3. one clock, three owners: with budget `{ totalMs: T, softDeadlineMs: T − 4000 }`, the fallback frame starts at
   `T − 4000`; the stable-frame attempt inside the fallback gets at most what is left minus nothing more than the
   existing rule allows; at `T` the outer race rejects with `timeout` and the browser is closed; never two outcomes.
4. a page that hangs the renderer (screenshot never returns) → fails at the computed `T` (not at 20 s, not never).
5. caller cancel at any time → no image, no fallback frame, the cancel's own error (assert `page.screenshot` call count does not grow after the cancel).
6. OD-5 = no: `captureBudget` is called with `capMs: 20_000` and cases 1 and 2 still return the current frame at 16 s.

## Change (one gated commit per item)
1. Compute `captureBudget(...)` per request (static import `@jini-ai/diagnostics/web-evidence/capture-budget`); pass
   `timeoutMs: totalMs`, `softDeadlineMs`, `onSoftDeadline: 'consume-current'` to `renderPage` and `totalMs` to the outer race.
2. In `consume`: a scroll or settle timeout after the soft deadline takes the frame instead of rethrowing; the stable
   attempt's own reserve (`FALLBACK_FRAME_RESERVE_MS`) is taken from what is left before the **hard** stop, never added after it.
3. The message builder states the real number. Update the tool description if it quotes 20 s (the guide lint must pass).
4. Keep every egress rule, router and origin policy exactly as they are.

## Acceptance
All cases green with exact text; no real network or browser in tests; `desktop-page-capture` tests unchanged; gate green; changed sentences listed old → new.
