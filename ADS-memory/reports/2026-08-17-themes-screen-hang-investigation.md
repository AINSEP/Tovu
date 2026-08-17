# Themes screen "Loading themes…" forever-hang — investigation and fix

**Status:** FIXED. Root cause is NOT a backend bug — it is a browser per-origin connection-pool
exhaustion caused by a deliberately-permanent SSE connection, colliding with HTTP/1.1's 6-connections-
per-origin cap. Fixed by bounding every admin API request with a client-side timeout.

## What was ruled out first

Followed the brief's suggested bisection (compare `presentation/get.ts` vs `themes/list.ts`) but that
comparison turned out uninformative: both routes call `deps.presentationRepo.findByWorkspaceId`, not
just one, so it couldn't discriminate auth-layer vs repo-layer as originally hoped.

Added temporary `fs.appendFileSync`-based timestamped instrumentation (not console.log — the backend's
stdout goes to the owner's own tty, `/dev/ttys002`, unreadable from this session) at every `await` in
`dev-auth.ts`'s `currentPrincipal`/`requireAdminSessionMiddleware` and `presentation/get.ts`'s handler.
Reproduced via a **fresh** Playwright-driven login (not curl — curl doesn't share Chrome's connection
pool, which turned out to be exactly the point). Every instrumented `await` resolved in low single-digit
milliseconds; no rejection, no catch fired, nothing hung. This ruled out `identityReady`, `validateSession`,
`deps.authorize`, and `presentationRepo.findByWorkspaceId` as the cause — all confirmed synchronous-under-
`better-sqlite3` (single shared connection, no pool, `busy_timeout=5000`), consistent with the CPU-idle
observation already noted in the brief.

One dead end worth recording: `src/server/boot/process-error-guards.ts`'s own header describes an
almost-identical-sounding prior incident (an uncaught async rejection under Express 4, "returning a
500/hanging") from 2026-08-16. This looked like a strong lead and shaped the early instrumentation plan,
but it was a red herring for THIS bug — nothing in the actual request path ever rejected.

## Root cause

`apps/admin/src/App.hooks.tsx:96` calls `subscribeToSettingsChanges(WORKSPACE_ID)`
(`apps/admin/src/lib/settings-events.ts`) once per mounted admin tab. That function opens an
`EventSource` to `GET /api/admin/v1/workspaces/:id/settings/events` and — by explicit design, per that
file's own comment — never closes it: "`EventSource` retries forever otherwise, including after the
component that opened it is gone... Deliberately not closed here."

Both the dev Vite server and the production Tovu server speak plain HTTP/1.1 (no HTTP/2 configured
anywhere — checked `apps/admin/vite.config.ts`). Chrome caps concurrent connections to one origin at 6
under HTTP/1.1. Each open admin tab permanently claims one of those 6 sockets for its settings-events
stream. Once enough tabs/reconnects/leftover streams accumulate against `localhost:5173` (or whatever
origin), **any other request** — including the Themes screen's `getPresentation()` call — has no free
connection and queues in the browser's own network stack indefinitely:

- The server never receives it → explains the reported CPU-idle backend.
- Nothing ever rejects (a queued-not-yet-dispatched fetch doesn't error) → explains "no error is ever
  shown either."
- It genuinely never resolves, not just slowly → explains "not slow, genuinely stuck forever."

### Reproduction (live, via Playwright MCP, not curl)

Opened successive real tabs against `http://localhost:5173/admin/` in the same browser profile (shared
connection pool). Settings-events SSE connect times climbed with each additional tab (tab 2: ~9s, tab 3:
~17s, tab 4: ~11s) — visible congestion, not open failure. On the next tab open attempt, `page.goto`
never fired `domcontentloaded` even after the full 60s Playwright tool timeout — confirmed a genuine,
deterministic hang once enough sockets were held, matching every reported symptom exactly.

This was later reproduced **hermetically** (fresh `TOVU_DB=memory` boot, fresh browser context, no
reliance on any pre-existing session state) by the regression test itself: opening 6 extra raw
`EventSource` connections to the same `/settings/events` endpoint from inside one already-logged-in tab
(on top of that tab's own real one), then navigating to `/admin/themes` — the `getPresentation()` request
never settled. See the regression test for the precise mechanism.

### Why curl "worked" and was a misleading signal

Curl makes its own direct connection, entirely outside Chrome's per-origin socket accounting. It was
never going to reproduce a pool-exhaustion bug regardless of auth state. The brief's framing ("auth-gated
specifically") was a reasonable hypothesis from the evidence available at the time, but the real
discriminator turned out to be "which HTTP client" (curl vs. a real, already-busy browser), not
"authenticated vs. not."

## Fix

`apps/admin/src/lib/api.ts` — `fetchOrThrowUnreachable`, the one fetch seam every `api.*` call goes
through (via `request()`): every request not carrying its own `AbortSignal` (no caller does today) is now
raced against `AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS)` (60s — generous enough to cover
`uploadMedia`'s worst case, a slow/mobile upload of the full 15mb body limit `server/app.ts` accepts).
A fired timeout is translated into
a normal `ApiError` (`code: REQUEST_TIMEOUT_CODE`, message names the likely cause — too many open tabs —
and the fallback of an unresponsive server) instead of leaking a raw `TimeoutError`/`DOMException`.

This does **not** fix the underlying connection-pool exhaustion (that would need a bigger change — e.g.
one shared SSE connection per browser via `SharedWorker`/`BroadcastChannel`, or closing the settings feed
on `document.visibilitychange` for backgrounded tabs — see Out of scope below). It converts a silent,
permanent hang into a visible, retriable failure within a bounded 60s window, for every admin screen, not
just Themes. `useThemes`'s existing `.catch((e) => setError(...))` and `Themes.tsx`'s existing
`if (!settings) return error ? <error> : <loading>` branch (both pre-existing, unmodified) mean the fix
required no changes on the Themes screen itself — only the shared fetch layer.

Files changed:
- `apps/admin/src/lib/api.ts` — `REQUEST_TIMEOUT_CODE`, `DEFAULT_REQUEST_TIMEOUT_MS`,
  `timeoutApiMessage`, `errorName` (duck-typed `.name` check — `DOMException instanceof Error` proved
  realm-dependent, true in plain Node, false observed in the vitest/jsdom test environment), and the new
  branch in `fetchOrThrowUnreachable`.
- `apps/admin/src/lib/__tests__/api-request-unreachable.unit.test.ts` — one new unit test for the
  `TimeoutError` → `ApiError` translation.
- `development/e2e/themes-presentation-request-timeout.spec.ts` (new) — real-browser regression test.
- `development/playwright.themes-presentation-timeout.config.ts` (new) — hermetic config, ports
  7991/7992/7993, follows `playwright.admin-session-expiry.config.ts`'s precedent.

## Regression test evidence

- **RED** (before the `api.ts` fix, hermetic fresh boot): `.notice.error` never appeared;
  `toBeVisible({ timeout: 75_000 })` failed with a real Playwright timeout — the same shape as the live
  bug, reproduced from a clean `TOVU_DB=memory` boot, not a polluted long-running session. (First proven
  at a temporary 15s/25s value during development, then re-verified end to end at the shipped 60s/75s
  values below.)
- **GREEN** (after the fix, at the shipped 60s production timeout): passes in ~1.3-1.6min (real
  wall-clock, since the test deliberately waits out the real 60s timeout rather than mocking it —
  `page.route` cannot simulate "never dispatched," only "dispatched then handled/aborted," which is not
  the actual failure mode).
- Companion unit test (`api-request-unreachable.unit.test.ts`) also failed first (`DOMException` not
  wrapped) then passed after the `errorName` duck-typing fix.
- `apps/admin` `tsc --noEmit`: 0 errors.
- Neighbor e2e suite `admin-session-expiry-kickback.spec.ts` (closest existing coverage of the same
  `request()`/`ApiError` code path): both tests still pass — no regression.

## Out of scope — flagging, not fixing

**This is systemic, not Themes-specific.** Every admin screen's every API call goes through the same
`request()` seam, so before this fix, ANY admin request could hang forever under the same connection-pool
exhaustion, not just `getPresentation()`. The fix applies uniformly (it's in the shared seam), so every
screen is now covered by the same 60s bound — but nothing was done to reduce how easily the pool actually
gets exhausted in the first place. If this keeps recurring in practice (e.g. developers habitually leaving
many admin tabs open), the real structural fix is reducing the number of permanently-held connections —
candidates, not attempted here:
- Share one SSE connection across tabs of the same origin via `SharedWorker` or leader-election +
  `BroadcastChannel`.
- Close the settings-events connection on `document.visibilitychange` (hidden) and reopen on visible,
  so only foregrounded tabs hold a socket.
- Move dev/prod to HTTP/2 (removes the 6-connection cap entirely via multiplexing) — much bigger
  infrastructure change, not attempted.

None of these were implemented: they touch `settings-events.ts`'s deliberately-documented "never closes"
design (extensive existing rationale in that file's own header) and are a larger architectural decision,
not a scoped bug fix.

## Unrelated, out-of-scope observation during investigation

While running the hermetic e2e config's fresh `TOVU_DB=memory` boot, the very first attempt crashed with
`ReferenceError: contributePostTools is not defined` at `src/server/tool-catalog-manifest.ts:49` — caused
by an **untracked, actively-being-edited** file from an unrelated concurrent session (confirmed via
`git status`: `src/server/tool-catalog-manifest.ts` untracked, `src/server/modules/assistant-byok.ts`
modified). A retry seconds later succeeded — the concurrent session had already moved the file past that
broken intermediate state. Not touched, not fixed, not this task's concern; flagging only because a fresh
boot failure could otherwise look like something this fix broke.
