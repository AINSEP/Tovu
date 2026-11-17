# S14a. One deadline model for page capture: work, fallback reserve, hard stop (C6, mechanism M8, Jini)

Repo: Jini. Package: `diagnostics`. Estimate: 170k Sonnet. Prerequisites: none. No owner decision (the cap is a host value, S14b).

## The three deadlines, defined together (judge finding 12; lesson 35)
For one capture with hard limit `T` and reserve `R` (`R < T`):
| Name | When | What it does | Owner |
|---|---|---|---|
| work deadline | `T − R` | ordinary work (navigation, requested wait, load wait, scroll) must be finished. If the page has **committed navigation**, work stops and the fallback starts. If not, the capture fails | Jini `renderPage` (new `softDeadlineMs`) |
| fallback window | `T − R` … `T` | `consume` runs once on the current page with what is left of `T` | Jini `renderPage` |
| hard stop | `T` | today's `AbortSignal` fires, the context is closed (`consumeOnePage`'s `onAbort`) | Jini `renderPage` (unchanged) |
| outer race | `T` (host) | drops the whole browser if the renderer hung | Tovu (S14b) |
A fallback can never need time after `T`: it starts at `T − R` at the latest. A **caller cancel** (`options.signal`)
is not a deadline: it never starts fallback work.

## Read first
`../DESIGN.md` §2.8, M8. `rg -n "export async function renderPage|AbortSignal.timeout|function consumeOnePage|onAbort|function waitForLoad" packages/diagnostics/src/web-evidence/render-page.ts` ·
`rg -n "class PageWorkBudget|Date.now\(\)|setTimeout" packages/diagnostics/src/web-evidence/page-work-budget.ts`.

## Inventory step
`rg -n "renderPage\(" packages ../Tovu/apps --glob '!**/*test*'` restricted to callers of **this** `renderPage`
(Tovu has unrelated functions of the same name in `routes/site/newsletter-*.ts`: exclude them). Every caller that does
not pass the new option must behave exactly as today.

## Step 0: the clock seam (no behaviour change; commit alone)
Today the budget reads `Date.now()` / `setTimeout` and the hard stop is `AbortSignal.timeout`, which a fake clock
cannot drive together. Add an optional typed port `clock?: { now(): number; setTimeout(fn, ms): unknown; clearTimeout(h): void; deadlineSignal(ms): AbortSignal }`
to `RenderPageOptions` and `PageWorkBudget`'s options, defaulting to the real functions. Existing tests unchanged and green.
Add `diagnostics/src/web-evidence/testing/fake-clock.ts` (a fake of that port), public entry `./web-evidence/testing` (`universal`).

## Characterization (passes today; fake page + the fake clock; no real browser)
1. navigation commits at 3 s, wait phase needs 18 s more, `timeoutMs: 20_000` → `PageWorkTimeout`, `consume` never called.
2. navigation never commits → `PageWorkTimeout` at 20 s; the context `close` was called.
3. caller aborts at 5 s → the caller's abort reason is thrown, `consume` never called, context closed.

## Red-first (option `softDeadlineMs: 16_000`, `onSoftDeadline: 'consume-current'`, `timeoutMs: 20_000`)
1. case 1 → `consume` is called **once**, at 16 s, with `session.phaseTimedOut === 'wait'` and a budget whose
   `remainingMs()` is 4 000; its result is returned.
2. the same, timing out in the load wait → `phaseTimedOut === 'load'`.
3. navigation not committed at 16 s → fails at 16 s with `PageWorkTimeout`; `consume` never called.
4. simultaneous boundary, one clock: fallback `consume` still running at 20 s → hard stop closes the context,
   `PageWorkTimeout` is thrown **once**; `consume`'s late settlement is swallowed; no second `consume`.
5. caller cancel at 15.9 s, 16 s and 17 s (during the fallback) → the caller's reason is thrown; **no fallback is
   started by a cancel**, and a fallback that was running is abandoned; context closed.
6. `softDeadlineMs` ≥ `timeoutMs`, negative or NaN → throws a `RangeError` at call time (a reserve of zero is a caller bug).
7. without the option → identical to the characterization.

## Change (one gated commit per item)
1. `web-evidence/capture-budget.ts` (pure), public entry `./web-evidence/capture-budget` (`universal`):
   `captureBudget({ settleMs, fullPage, waitForSeconds }, { baseMs, fullPageMs, capMs, reserveMs })` →
   `{ totalMs, softDeadlineMs, reserveMs }` with `softDeadlineMs = totalMs − reserveMs`. Tests: `{ settleMs: 0, fullPage: false }`
   → total 20 000, soft 16 000; grows with the request; never above `capMs`; negative or NaN inputs → base; `reserveMs` ≥ `totalMs` → `RangeError`.
2. `render-page.ts`: `softDeadlineMs` / `onSoftDeadline` as in the red-first cases. `RenderSession` gains optional
   `phaseTimedOut`. Keep the comment "A native total timer remains firm…" on the hard stop.
3. Do not touch `createRequestRouter`, origin policy or any egress rule.

## Acceptance
All cases green; other `renderPage` callers' tests unchanged (counts recorded); gate green for `diagnostics`; new exports listed for REL.
