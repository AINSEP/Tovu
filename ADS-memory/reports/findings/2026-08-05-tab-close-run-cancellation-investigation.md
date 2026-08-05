# Cancel-on-tab-close investigation — 2026-08-05

Investigation only, per Coordinator dispatch and subsequent HOLD. **No production code was
written.** The underlying product decision was reopened by the owner mid-investigation (see
Status below) — this report preserves the findings as evidence for that decision, not as a spec
to build against.

## Status: decision reopened, on HOLD

Original ask: closing a browser tab should cancel the run it was watching, because a run
surviving a closed tab burns tokens with nobody watching.

That decision was reopened after dispatch: the owner runs several agents concurrently, which
reframes the tradeoff as asymmetric — getting "keep running" wrong wastes tokens (bounded,
recoverable); getting "cancel" wrong destroys in-flight work (irreversible, and the tokens are
paid again on re-run). Tabs close for boring reasons constantly when several agents are running
at once. The Coordinator's recommendation to the owner, informed by this investigation, is to
keep runs alive and instead make them **visible** on reopen — a "this kept running while you were
away" affordance with a manual cancel button, so cancellation is deliberate rather than inferred.
Awaiting the owner's call. **If that direction is chosen, the `subscribers.size` transition found
below is probably still the right hook — for display, not cancellation.**

## Confirmed root cause (true regardless of which direction is chosen)

`useRunStream.ts` (`@jini-ai/chat/react`, `packages/chat/src/react/hooks/useRunStream.ts`) tears
down the browser-side *subscription* on unmount (`teardownSubscription` in the `useEffect`
cleanup, line ~84) but never calls `transport.stopRun()`. Compare `cancel()` (line ~167), which
*does* call `void transport.stopRun(runId)` — but only on an explicit user cancel-button click.
Closing a tab (or navigating away, or the component simply unmounting) hits the unmount path, not
`cancel()`, so the daemon-side run is never told to stop. This is *why* a run survives a closed
tab today. This fact doesn't depend on which product direction is chosen — it's the mechanism
that needs to change if cancel-on-close is ever built, and it's also the mechanism a
visibility-on-reopen feature needs to leave alone (a `stopRun` firing on ordinary unmount would
break reattach-after-reload today).

## Existing machinery traced

- **Cancel path (already correct, would be reused, not duplicated):**
  `POST /api/runs/:runId/cancel` (Tovu `src/server/modules/assistant.ts:489`, plain
  `proxyPassthrough`) → Jini's `runCancelRoute`
  (`packages/http-kit/src/runs.ts:193`) → `RunLifecycle.cancel()`
  (`packages/daemon/src/run-lifecycle.ts:524`). `cancel()` sets `cancelRequested`, fires
  `cancelListeners` synchronously; `agent-executor.ts` subscribes via `onCancelRequested` at 3
  call sites and is what actually stops the subprocess, then calls
  `finish({status:'cancelled'})`. Any auto-cancel mechanism should call into this same path, not
  invent a second one.
- **`RunCancelRequest.reason` already exists** (`packages/protocol/src/run.ts:29`:
  `{ runId: string; reason?: string }`) — an auto-cancel could tag itself (e.g.
  `reason: 'no-active-watchers'`) for observability with **zero wire-protocol change**.
- **Reusing `cancel()` means "shows as cancelled on reopen" is already satisfied for free.**
  `RunLifecycle`'s public `RunStatus` only ever reports `state`; there is no separate "vanished"
  state. A run cancelled by any path (manual click or a future auto-cancel) ends up
  `state: 'cancelled'` via the same `finish()` transition. No new terminal state or reopen-display
  logic would be needed for that specific requirement.
- **Trap #1 (`req.on('close')` fires on every POST) is already correctly avoided in the SSE
  path.** `createSseChannel` (`packages/http-kit/src/sse.ts`) listens on `res.on('close')`, not
  `req`, from construction time — line ~214. Tovu's own proxy hop
  (`src/server/modules/assistant.ts`'s `relayResponse`) independently does the same thing for the
  same reason, with a comment citing a measured repro (2026-08-05, isolated). Nothing here needed
  fixing; it was already right.
- **Watcher count already exists implicitly — no new registry needed for multi-tab safety.**
  Each open SSE connection to a run is one entry in `RunRecord.subscribers`, a `Set`
  (`packages/daemon/src/run-lifecycle.ts:139`), populated by `stream()` and removed by the
  `unsubscribe` closure it returns (`run-lifecycle.ts` ~line 706). `subscribers.size` reaching
  zero **is** "no tab is currently watching this run." A second tab watching the same run simply
  keeps the set non-empty; closing one tab does not touch the others' entries. This transition
  point (add on subscribe, remove on unsubscribe) is the one hook a future implementation — cancel
  *or* display — would attach to.
- **Client transport today.** `apps/admin/src/lib/assistant-transport.ts`'s `subscribeToRun()`
  owns the `EventSource` per run id (used by both `startRun` and `reattachRun` for the Local CLI
  path). No `pagehide`/`beforeunload`/`sendBeacon` wiring exists anywhere near the assistant/run
  code today. (`use-dirty-guard.hooks.ts` uses `beforeunload`, but for an unrelated unsaved-edits
  guard — not a pattern to reuse here as-is, since that hook needs a *synchronous, blocking*
  confirm dialog, not a fire-and-forget signal.)

## Why a single "disconnect + grace timer" is not sufficient (if cancel-on-close is ever built)

The brief's trap #2 requires a laptop sleeping and a backgrounded mobile tab to survive as
"still watching." Those two cases are **indistinguishable from a genuinely closed tab** at the
transport level — all three just look like "zero SSE watchers, no reconnect," and sleep/backgrounding
can last many minutes. This creates a real dilemma for a timer-only design:

- A grace timer short enough to make "closing the tab" cancel *promptly* (matching the stated
  rationale — don't keep burning tokens) will **false-cancel** a real backgrounded/sleeping tab
  that was never actually closed.
- A grace timer long enough to safely tolerate sleep/backgrounding makes "closing the tab" take
  that same many-minutes to actually cancel, which **undercuts the rationale** the whole feature
  exists to serve.

No single timer value resolves this — it is a structural conflict between the two requirements,
not a tuning problem.

### The two-signal design that resolves it (recorded for reference, not built)

1. **Fast, explicit path.** Client sends `navigator.sendBeacon` on `pagehide`, but **only when
   `event.persisted === false`**. This detail matters: `pagehide` also fires when a page is being
   frozen into the back-forward cache (bfcache) — e.g. mobile Safari backgrounding a tab, or a
   user navigating back/forward — and in that case `event.persisted === true` and the page may
   resume exactly where it left off. Sending the beacon unconditionally would treat a bfcache
   freeze as a close, which is precisely the false-positive trap #2 warns against. Only
   `persisted === false` is a genuine unload. sendBeacon carries same-origin cookies automatically,
   so `requireAdminSession` still gates it with no new auth mechanism. Server-side this should only
   *record intent* (e.g. a `noteWatcherLeaving(runId)` timestamp), not cancel immediately — the
   beacon and the SSE `res.close` event can arrive in either order, so the decision has to be made
   at whichever fires second.
2. **Slow, passive safety net.** When `subscribers.size` drops to 0 for a non-terminal run, arm a
   timer (the existing `createInactivityWatchdog` pattern in `packages/daemon/src/close-status.ts`
   is a directly reusable shape: `.unref()`'d, reset/cleared on new activity). Duration depends on
   whether an explicit leave signal landed recently: **short** if so (just enough to absorb the
   beacon/SSE-close race and an instant reconnect), **long** as a pure fallback for crash/force-quit/
   OS-kill, where no beacon can ever fire. On fire, if still at 0 watchers, call the existing
   `lifecycle.cancel({runId, reason: 'no-active-watchers'})` — reusing the traced cancel path
   above, not a new one.

Net effect if built: closing a tab normally cancels within seconds via the beacon; a genuinely
dead browser (crash) still gets cleaned up eventually via the long fallback; sleep/backgrounding
survives indefinitely because nothing fires early without the explicit signal.

### Where the change would span, if built

Four files across two repos — cited here as the concrete cost data point behind the
"is this worth it" question, not as an approved plan:

- `Jini/packages/daemon/src/run-lifecycle.ts` — new host-opt-in config + `noteWatcherLeaving()` +
  arm/clear hooked into `stream()`'s existing subscribe/unsubscribe.
- `Jini/packages/http-kit/src/runs.ts` — one new lightweight route calling
  `lifecycle.noteWatcherLeaving`.
- `Tovu/src/server/modules/assistant.ts` — one line adding the new path to the existing
  `proxyPassthrough` table (same pattern as `/cancel`).
- `Tovu/apps/admin/src/lib/assistant-transport.ts` — `subscribeToRun()` registers the `pagehide`
  listener alongside the `EventSource`, sends the beacon, cleans up on `finish()`/abort.

This is a contained change, not a rewrite — but it is real surface area, with residual
false-positive risk remaining even after the two-signal design (a crash still burns tokens for
the whole fallback window; a beacon can in principle be dropped by the browser under load). That
residual risk, weighed against the reframed asymmetric cost of a wrong cancel, is what's driving
the reopened decision.

## Three questions raised during investigation, and how they were provisionally answered

Recorded as open pending the owner's actual decision — **not** upgraded to settled just because a
provisional answer exists:

1. **Grace-period durations.** Proposed 5s post-signal / a longer (unspecified, TBD) safety-net
   fallback. Coordinator's provisional number: 5s post-signal, 10min fallback. Not confirmed by
   the owner; not implemented.
2. **BYOK path.** Flagged as **likely-fine-already but NOT independently verified** —
   `assistant-byok.ts`'s turn is one held-open POST with no separate daemon-side `RunLifecycle`
   record, so the browser aborting that fetch on tab close plausibly already kills the connection
   on its own. This was *not* traced end-to-end the way the Local CLI path was. Coordinator's
   provisional answer: BYOK is out of scope regardless, and keeping it flagged as unverified
   (rather than claiming it's fine) was correct — that distinction should stay honest in any future
   pickup of this work.
3. **SPA-internal navigation.** `pagehide`/`beforeunload` fire on real tab close/reload/cross-origin
   navigation, not on client-side route changes within the admin SPA. Confirmed out of scope: the
   product decision says "tab," not "view." A user navigating away from the chat view but staying
   in the tab is unaffected by anything in this report either way.

## What a future reader should take from this if the decision comes back "cancel-on-close"

Re-read this report in full before writing code — the two-signal design and the `persisted` check
are the load-bearing details, not incidental ones. Re-verify the BYOK assumption independently
before treating it as settled. Re-confirm the grace-period numbers with whoever owns the product
decision at that time; they were never actually approved, only proposed.

## What a future reader should take from this if the decision comes back "visibility on reopen"

The root cause section above still applies unchanged — `useRunStream.ts`'s unmount path is still
where a "kept running while you were away" run needs to be detected, just for a UI affordance
instead of a cancellation. The `RunRecord.subscribers` transition (packages/daemon/src/run-lifecycle.ts:139)
is likely still the right signal for "is anyone currently watching this run" — reused for display
state instead of triggering `cancel()`.
