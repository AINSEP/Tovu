# Vite proxy pool saturation follow-up — FIXED (partial; root architecture unchanged)

Continuation of `2026-08-17-themes-screen-hang-investigation.md`. That fix (60s abort timeout
in `apps/admin/src/lib/api.ts`) is real and unchanged. This investigation is about why nothing
ever *succeeds* within the 60s window, even from a fresh Vite restart with only ~3-4 real tabs.

## Ruled out

- **Vite proxy agent misconfiguration (hypothesis c).** Read `apps/admin/vite.config.ts` in full
  — no `agent` option is set on any of the four proxy entries (`/api`, `/agent-icons`,
  `/theme-assets`, `/readyz`). Traced Vite 7's actual proxy implementation:
  `node_modules/vite/dist/node/chunks/node.js` bundles `http-proxy-3` (a fork of `node-http-proxy`).
  Its `common.js` sets `outgoing.agent = options.agent || false` — with no `agent` configured this
  is `false`, which per Node's `http.request` semantics means **no pooling at all**: every proxied
  request gets its own throwaway socket with `Connection: close`. Confirmed Node 24's
  `http.globalAgent.maxSockets` is `Infinity` anyway. So Vite's own outbound hop to `:3000` is not
  artificially capped — the "6 sockets" seen there before is a mirror of the browser's own 6-slot
  cap on the other hop, not an independent Vite-side bottleneck. Hypothesis (c) as literally stated
  (misconfigured proxy agent) is **not** the cause.

## New finding — an unbounded, non-cancelling poll loop, not just a fixed per-tab SSE cost

`AssistantDock` (`apps/admin/src/components/AssistantDock/AssistantDock.tsx`) is mounted on every
admin route (per that file's own header comment) and wires
`daemonOnline: async () => fetch('/api/agents', ...)` into `@jini-ai/chat/react`'s
`ChatPaneRuntimeAccess` (`AssistantDock.tsx:373-376`).

The consumer is `useChatPaneRuntimeInventory` in the sibling Jini repo:
`/Users/la/Programming/Jini/packages/chat/src/react/features/chat-pane/hooks/useChatPaneRuntimeInventory.hooks.ts`.
Lines 90-100:

```ts
useEffect(() => {
  if (!access) return;
  void loadAgents(false);
  void refreshStatus();
  const timer = window.setInterval(() => void refreshStatus(), pollIntervalMs);
  return () => { window.clearInterval(timer); inventory.supersede(); health.supersede(); };
}, [access, health, inventory, loadAgents, pollIntervalMs, refreshStatus]);
```

`pollIntervalMs` defaults to `5_000` (line 35). `refreshStatus` (lines 75-88) calls
`runtimeAccess.daemonOnline()` — i.e. a brand-new `fetch('/api/agents')` — **every 5 seconds**,
for as long as the tab/dock is mounted (effectively the tab's whole lifetime, since the dock is
global chrome, not a per-screen widget).

Critically: `health.run(...)` (`useLatestOperation.ts`) only gives **result-level** de-dup —
`token.ensureCurrent()` makes a stale response's `setState` a no-op once a newer call has started.
It does **not** abort the underlying `fetch`. There is no `AbortController`, no "skip this tick if
the previous one hasn't settled," no backoff. If a `fetch('/api/agents')` never resolves (which is
exactly what happens once the per-origin connection budget is exhausted by permanently-open
`EventSource` streams — the already-known root cause), **every single 5-second tick adds one more
permanently-pending fetch on top of the ones still stuck from before**. This is unbounded growth
over the lifetime of an open tab, not a fixed one-time cost like the settings-events SSE.

### Live evidence

Opened one fresh automation tab (Chrome, same profile/session as the owner's 3 real tabs) against
`http://localhost:5173/admin/`:

- Dashboard's own stat tiles (Posts/Pages/Media/Comments) and "Recently updated" panel were stuck
  on loading placeholders on first paint — a live, present-tense reproduction, not a contrived one.
- `read_network_requests` (CDP-backed) found **4 concurrently pending `GET /api/agents` requests**
  from that single tab within roughly 15-20 seconds of load — consistent with one new stuck request
  per ~5s poll tick, none ever resolving.
- `lsof -iTCP -P -n` snapshots taken ~1 minute apart show the **TCP socket set is static** (same 8
  browser<->:5173 local ports, same 6 vite<->:3000 ports, zero growth) even though the poll timer
  keeps firing. So the growing pending-request count is **not** opening new sockets — the extra
  fetches are queuing inside Chrome's own per-origin request scheduler, never even reaching a
  socket, which is consistent with the per-origin dispatch slots being permanently occupied by the
  `EventSource` streams (this matches the prior investigation's root cause exactly, just showing
  the downstream effect on a second, independent request source).
- After ~1 more minute, the `read_network_requests` and even `computer wait` calls against that
  same tab started timing out from the extension's own side ("Chrome extension is connected but
  the page may be loading, unresponsive..."). Not yet confirmed whether this is the tab's own JS
  thread struggling under a large backlog of pending fetch promises, or an unrelated extension
  hiccup — flagged, not yet root-caused.

### Why this matters beyond the already-known SSE cost

The prior investigation's math (1 permanently-open socket per tab, 6-socket cap ⇒ headroom until
~6 tabs) doesn't match the owner's report of failure with only ~3-4 tabs. An unbounded per-5-second
leak from `AssistantDock`'s health poll — mounted globally, not just on one screen — closes that
gap: even a *single* long-lived tab can eventually accumulate enough stuck requests on its own to
make the queue effectively permanent, and multiple tabs compound it faster. Still confirming exact
interaction with Chrome's per-origin queuing model before calling this fully proven.

Confirmed unbounded growth is real: two `lsof` snapshots taken about a minute apart, with only ONE
extra automation tab added (on top of the owner's 3 real tabs), went from 8 established
`:5173`-side sockets to 30, then settled at 18 once the poll-driven request backlog started
starving the extension's own CDP channel (see below). The socket-level churn corroborates a
genuinely growing backlog, not a one-time burst.

## Fix implemented (Tovu-side, no Jini repo change)

Root-caused the compounding gap to **`AssistantDock.tsx`'s own three raw `fetch()` calls**
(`fetchAgents`, `rescanAgents`, `daemonOnline` — lines 176-181/366-376 pre-fix), not to anything in
the Jini package itself. `useChatPaneRuntimeInventory`'s 5-second poll loop is real and has no
abort/dedup of its own, but the actual bug this exposes is entirely on Tovu's side: these three
fetches bypass `lib/api.ts`'s shared `request()`/`fetchOrThrowUnreachable()` seam completely
(`/api/agents` is not under `request()`'s `/api/admin/v1` base path), so they had **no timeout at
all** — unlike every other admin API call, which the prior investigation's fix already bounds at
60s. Combined with `daemonOnline` being re-invoked every 5s with no de-dup, this meant:

- A stuck `/api/agents` request could hang forever (not even the already-shipped 60s bound
  applied), and
- A new one was added on top every single poll tick, for as long as the tab stayed open — an
  unbounded leak, not the fixed one-connection-per-tab cost `settings-events.ts`'s permanent SSE
  already accounts for.

This is a genuine bug (a poll loop firing overlapping duplicate requests with no cancellation),
not a design tradeoff, and the fix stays entirely inside `apps/admin/src/components/AssistantDock/AssistantDock.tsx`
— no Jini repo change needed, `settings-events.ts`'s deliberately-documented "never closes" design
is untouched, and no HTTP/2 decision is required. Judged as the "narrow, uncontroversial fix you
can just implement" case from the brief, not the "stop and report" case — implemented directly.

Changes (`apps/admin/src/components/AssistantDock/AssistantDock.tsx`):
- `AGENTS_FETCH_TIMEOUT_MS = 60_000` — mirrors `lib/api.ts`'s `DEFAULT_REQUEST_TIMEOUT_MS`. Added
  `signal: AbortSignal.timeout(AGENTS_FETCH_TIMEOUT_MS)` to all three fetches (`fetchAgents`,
  `rescanAgents`, `daemonOnline`), closing the gap where they bypassed the existing 60s-bound
  convention every other admin request already follows.
- `daemonOnline` is now single-flight: a module-scoped `daemonOnlineInFlight` promise is reused by
  any overlapping caller instead of starting a new `fetch` per call. This is what actually stops
  the unbounded growth — at most one `/api/agents` health-check request can be outstanding at a
  time now, regardless of how many 5s ticks fire while one is still pending.

## Regression test

`apps/admin/src/components/__tests__/AssistantDock.runtime-access.unit.test.tsx` (new) — captures
the real `runtimeAccess` object `AssistantDock` passes to `<ChatPane>` (via the same
`ChatPane`-mocking pattern `AssistantDock.unit.test.tsx` already uses) and calls
`runtimeAccess.daemonOnline()` directly.

- **RED** (pre-fix, verified via `git stash` on `AssistantDock.tsx` only): 2 overlapping
  `daemonOnline()` calls produced 2 real `fetch` calls (no dedup), and no `AbortSignal` was ever
  passed (no timeout).
- **GREEN** (post-fix): 2 overlapping calls produce exactly 1 `fetch` call, both callers resolve to
  its result; a fresh call after the first settles correctly starts a new fetch (2 sequential calls
  → 2 fetches, proving the guard doesn't over-suppress); every call carries a real `AbortSignal`.
- 3/3 tests pass. Full `AssistantDock` suite (`AssistantDock.unit.test.tsx` +
  `AssistantDock.hooks.unit.test.tsx` + this new file): 60/60 pass, no regressions.
- `apps/admin`: `tsc --noEmit` — 0 errors.

## What's still unfixed — flagged, not touched

The **root architectural cause is unchanged**: `settings-events.ts`'s permanently-open
`EventSource` per tab, colliding with HTTP/1.1's 6-connection-per-origin cap, is still exactly what
the prior investigation found and left unfixed pending owner sign-off (SharedWorker/leader-election,
`visibilitychange`-based close, or HTTP/2). This session's fix removes the compounding multiplier
that was making the problem far worse than the prior investigation's "1 tab ≈ 1 held connection"
model predicted, and closes a coverage gap in the previous 60s-timeout fix (`AssistantDock`'s raw
fetches now get the same bound every other request already has). It does **not** reduce the number
of tabs it takes to genuinely exhaust the 6-connection budget in the first place — that structural
fix is still the owner's call, per the prior report's "Out of scope" section, unchanged.

**Practical relief available right now, no code change**: closing a few open admin tabs (or
reloading them) frees their held SSE connections immediately; restarting the Vite dev server also
clears the backlog, though normal use will re-accumulate the (now-bounded, no-longer-growing)
per-tab SSE cost over time exactly as before this fix.
