# Resource leak sweep — recurring operations with no cancellation

Status: DONE

Swept Tovu and Jini for the bug shape found today: "a recurring operation
(timer, interval poll, or long-lived connection) with no cancellation/
cleanup, silently accumulating and exhausting a shared, finite resource" —
same shape as `settings-events.ts`'s permanent EventSource and
`useChatPaneRuntimeInventory`'s non-single-flight 5s poll.

Ground truth reports:
- `ADS-memory/reports/2026-08-17-themes-screen-hang-investigation.md`
- `ADS-memory/reports/2026-08-17-vite-proxy-pool-saturation-investigation.md`

Enumerated: every `new EventSource(`, `new WebSocket(`, `setInterval(`/
`window.setInterval(`, module-level pub/sub buses, and raw `fetch(` bypassing
Tovu's `lib/api.ts` seam, across both repos (excluding `node_modules`, build
output, `dist-debug`, and `src/themes/static/mui-marketing/` per the brief).
`new WebSocket(` returned zero hits in either repo.

## Findings table

| Site | Repo | Type | Classification | Notes |
|---|---|---|---|---|
| `apps/admin/src/lib/settings-events.ts:50` `subscribeToSettingsChanges` | Tovu | EventSource | OUT OF SCOPE (known, documented) | Not touched, per brief — owner has not yet decided the architectural fix. |
| `AssistantDock.tsx` 3 raw fetches + Jini `useChatPaneRuntimeInventory` poll | Tovu+Jini | poll/fetch | ALREADY FIXED (today, prior dispatch) | Ground truth for this sweep; re-verified still in place (timeout + single-flight `daemonOnline`). |
| `assistant-transport.ts` `subscribeToRun` via `startRun` | Tovu | EventSource | FINE | `input.signal` wired through; `signal.addEventListener("abort", ...)` closes the source on abort. |
| `assistant-transport.ts` `reattachRun` → `subscribeToRun` | Tovu | EventSource | **CONFIRMED BUG — FIXED (this session)** | See "Bug found and fixed" below. |
| `frontend-session-bridge.ts` `createFrontendSessionBridge` | Jini | EventSource | FINE | Deliberately long-lived (module doc explains why), closed via explicit `.close()`. Both consumers (`AgentLab.tsx`, `WebMcpLab.tsx` in `examples/reference-web`) call `session.close()` in `useEffect` cleanup. Not consumed by Tovu `apps/admin` today. |
| `asset-grid/dependencies.ts:70` `createBrowserSseLiveUpdatesPort` | Jini | EventSource | FINE | Returns `() => es.close()`; its one real consumer, `useAssetGridLiveUpdates.ts:140`, calls `liveUpdates.subscribe(...)` inside a hook and holds the returned `unsubscribe`. |
| `src/index.ts:162` boot-parent watchdog | Tovu | setInterval | FINE (by design) | One timer for the process's whole lifetime, deliberately not cleared/unref'd — comment states this explicitly. Not a per-connection/per-poll-tick cost. |
| `agent-daemon-server.ts:178` parent watchdog | Tovu | setInterval | FINE (by design) | Same pattern as above, same author reasoning. |
| `settings/events.ts:269-273` (3 SSE-side timers: poll/keepalive/reauthorize) | Tovu | setInterval | FINE | Explicitly cleared via `req.on("close", close)` / `res.on("close", close)` — comment: "Without this the timers outlive the response and every reconnect leaks another pair." |
| `packages/ui/src/utils/dom-subscriptions.ts` `scheduleInterval`/`scheduleTimeout`/`subscribeWindowEvent`/etc. | Jini | utility | FINE | Correctly-designed disposer-returning utilities; SSR-guarded. |
| `useConnectorAuthorization.ts:265` | Jini | setInterval (React) | FINE | `useEffect` returns `() => clearInterval(interval)`. |
| `useMemoryExtractions.hooks.ts:188` | Jini | setInterval (React) | FINE | Same pattern. |
| `packages/mcp/src/core/oauth.ts` PKCE state sweeper | Jini | setInterval (class) | FINE | Self-clearing when its store empties, explicit `stop()`, `.unref()`'d so it can't block process exit; single per-process timer, not per-request. |
| `packages/agent-runtime/src/providers/pkce.ts` | Jini | setInterval (class) | FINE | Same pattern/author as above. |
| `packages/integrations/src/composio/composio.ts` `startCatalogRefreshLoop`/`stopCatalogRefreshLoop` | Jini | setInterval (class) | FINE | Explicit start/stop pair, `.unref()`'d, single per-process timer. |
| `packages/http-kit/src/raw-sse.ts` `keepAliveTimer` | Jini | setInterval | FINE | `.unref()`'d, cleared in `close()`, wired to `req.on('close', close)` — this is very likely the origin of the pattern `settings/events.ts` reuses. |
| `examples/reference-web/src/daemon.ts` `attachmentPruneTimer` | Jini (example) | setInterval | FINE | `.unref()`'d, single per-process timer. |
| `examples/reference-web/src/daemon.ts` `waitForA2uiAction`'s `pollTimer` | Jini (example) | setInterval | FINE | Cleared on both the cancel branch and the message-received branch. |
| `examples/reference-web/src/runtime-access.ts` `PLAYGROUND_RUNTIME_ACCESS` (the other real `ChatPaneRuntimeAccess` consumer besides Tovu) | Jini (example) | fetch (polled by the same hook) | FINE | Already uses `fetchWithTimeout(..., { timeoutMs: FETCH_TIMEOUT_MS.QUICK })` on all three methods — has the timeout Tovu's `AssistantDock` was missing before today's earlier fix. No single-flight dedup, but bounded, so no unbounded growth — lower risk than what Tovu had. |
| `App.hooks.tsx`, `ChatFab.hooks.tsx`, `Select.hooks.tsx`, `MediaPickerDialog.hooks.tsx`, `WidgetPickerDialog.hooks.tsx`, `use-escape-to-cancel.hooks.ts` (×2), `use-theme-explore.hooks.ts`, `use-dirty-guard.hooks.ts` — 12 `document`/`window`.addEventListener sites | Tovu | addEventListener (React) | FINE (sampled) | Spot-checked the globally-mounted ones (`App.hooks.tsx`'s Escape/media-query listeners, `ChatFab`'s resize + pointermove/pointerup drag listeners) — all follow the standard `useEffect` cleanup-return idiom, or attach/detach symmetrically around a drag gesture. Did not individually re-verify all 12; this idiom was consistently correct everywhere sampled. |
| `assistant-dock-bus.ts` `subscribeToAssistantDock` | Tovu | pub/sub bus | FINE | Only real consumer passes it directly as the subscribe function to `useSyncExternalStore` — React itself owns the subscribe/unsubscribe lifecycle; no way to leak. |
| `settings-refresh-bus.ts` `subscribeToSettingsRefresh` | Tovu | pub/sub bus | FINE | Callers (`use-admin-execution-credential.hooks.ts`, `use-admin-locale.hooks.ts`, `use-settings-slice.hooks.ts`) store and invoke the returned `unsubscribe` in effect cleanup. |
| One-shot raw `fetch()` calls bypassing `lib/api.ts`: `assistant-chats.ts` (6 call sites), `assistant-transport.ts`'s BYOK-turn/start/status/cancel fetches, `a2ui-action-poster.ts:159`, `post-template-dependencies.hooks.ts:13`, `tool-catalog-composer-source.ts:115` | Tovu | fetch | **DIFFERENT BUG CLASS — flagging, not fixing** | None of these repeat/poll — each fires once per user action (open chat pane, send message, view template). No timeout, so each *can* hang, but they don't *accumulate* the way a poll or a permanent connection does. Same underlying exposure class as what the original Themes investigation called "systemic, not Themes-specific" for `lib/api.ts` callers — but blanket-adding timeouts to all of these (especially the BYOK-turn fetch, which is deliberately "one request/response holding the whole turn open" per its own module doc) is a broader call than this sweep's scope. See proposal below. |

## Bug found and fixed: `reattachRun` silently dropped its cancellation signal

**Root cause.** Jini's `ChatTransport.reattachRun(runId, handlers, options?: ReattachRunOptions)`
interface (`packages/chat/src/core/transport.ts`) gained an optional third parameter on 2026-07-29
— `packages/chat/src/core/source-map.md`'s own entry states this was a **post-merge audit fix for
a resource leak**: "`reattachRun` had no cancellation seam at all... a reattached SSE/WebSocket
stream can outlive the component that opened it... The connection and its read loop simply kept
going." `useRunStream.reattach()` (`packages/chat/src/react/hooks/useRunStream.ts:184`) was updated
to create an `AbortController`, abort it on unmount/reset/supersession, and pass it as
`options.signal`.

Tovu's `apps/admin/src/lib/assistant-transport.ts` implements `ChatTransport` as a plain object
literal typed via `: ChatTransport`. Its `reattachRun` kept its **original 2-parameter signature**
— TypeScript's structural typing allows a function with fewer parameters to satisfy an interface
whose extra parameter is optional, so this compiled cleanly and gave no signal anything was wrong.
The 3rd argument `useRunStream` now passes was silently discarded, and `subscribeToRun` (the
function that actually opens the `EventSource`) was called with no signal at all — identical in
effect to how it looked before the 2026-07-29 Jini-side fix ever shipped. Any abort from
`useRunStream` (component unmount, conversation switch/reset, or a superseding
start/reattach) did nothing on Tovu's side: the reattached run's `EventSource` stayed open
permanently, one more connection slot gone, for as long as the tab lived — every bit as real as the
two bugs fixed earlier today, just reached by "reattach a run" (page reload with a run in progress,
or switching back to a conversation with one still streaming) rather than by simple tab count.

This is the shape the brief specifically asked to hunt for, in its purest form: **a cross-repo
interface contract added a cancellation seam specifically to close a known leak, and one consumer
implementation silently never adopted it** — invisible to the type checker, invisible to a diff of
either repo in isolation, only visible by tracing the interface from its Jini declaration through to
every structural implementation.

**Fix** (`apps/admin/src/lib/assistant-transport.ts`):
- Imported `ReattachRunOptions` from `@jini-ai/chat/react` (already re-exported there).
- `reattachRun(runId, handlers)` → `reattachRun(runId, handlers, options?: ReattachRunOptions)`.
- `subscribeToRun(runId, handlers)` → `subscribeToRun(runId, handlers, options?.signal)` — reusing
  the same `signal?.addEventListener("abort", ...)` close path `startRun`'s call already exercises.

**Regression test** (`apps/admin/src/lib/__tests__/assistant-transport.daemon.unit.test.ts`, new
test in the `reattachRun — daemon path` describe block):
- **RED** (pre-fix): `controller.abort()` after `reattachRun("run-9", h, { signal: controller.signal })`
  left `source.closed === false` — `AssertionError: expected false to be true`.
- **GREEN** (post-fix): same assertion passes.
- Full file: 38/38 passed. Three sibling `assistant-transport.*.unit.test.ts` files (byok, a2ui,
  transcript, translate — 69 tests): all still pass, no regressions.
- `apps/admin`: `tsc --noEmit` — 0 errors.

## Proposals for catching this bug class systematically (not implemented — for owner sign-off)

### 1. A narrow, opt-out-able lint check for React hooks specifically

Scope it to exactly the pattern every FINE case above shares and every risky case above lacks:
*"a `useEffect` (or custom hook body) that calls `setInterval`/`new EventSource`/`new WebSocket`/
`.addEventListener` must have a cleanup path that calls the matching
`clearInterval`/`.close()`/`.removeEventListener`."* This is checkable with reasonable precision
(low false-positive rate) specifically inside `useEffect` callback bodies, because React's own
contract already requires a cleanup function return there — unlike a bare module-level `setInterval`
call (e.g. the process watchdogs above), where "correct" varies by design intent and a rule would
need to understand `.unref()`/singleton-lifetime reasoning it can't infer. Recommend requiring
manual sign-off via an inline suppression comment for the deliberate cases (`settings-events.ts`
would need one, and should say why) rather than a hard block — this sweep's own findings show most
"looks unclosed" cases are actually fine by design, and a hard-blocking rule would train the team to
add suppressions reflexively instead of reading them.

**This would NOT have caught today's actual bug** (`reattachRun`) — that one has no `useEffect` in
Tovu at all; the leak is entirely inside a plain function implementing an interface. See #2.

### 2. A contract-conformance checklist step for cross-repo interface changes (this is what actually would have caught it)

When a shared package (Jini) changes an interface specifically to add a cancellation/disposal seam
that closes a known resource leak — exactly what `source-map.md`'s 2026-07-29 entry documents — the
change is only complete once every **structural** implementation of that interface, in every
consuming repo, is confirmed to pass the new option through. This is not something a lint rule
inside either repo alone can catch: Tovu implements `ChatTransport` as an object literal, and
nothing forces re-verification against a new version of an interface it structurally (not
nominally) satisfies. Concretely propose:
- Add a step to `AI-Dev-Shop/agents/programmer/skills.md` (or `change-management/SKILL.md`, which
  already covers phased rollout/compatibility windows) under a new heading like "cross-repo contract
  adoption": when editing a shared interface specifically to close a resource leak, grep every
  consuming repo (`grep -rn ": ChatTransport"` / equivalent) for implementations, and confirm each
  one's new-parameter arity and behavior, not just its compile success. Record the check (or its
  absence) in the change's `source-map.md`/handoff entry.
- Would also be worth a one-line note in Jini's own `source-map.md` 2026-07-29 entry acknowledging
  Tovu (a known downstream consumer) needed the same update and, until this session, didn't have it
  — so a future reader doesn't assume "shipped" meant "adopted everywhere."

### 3. `bug-taxonomy.md` additions (drafted here, not yet written to the file — owner sign-off first)

Two additions under **Resource Management**, plus one under **API & Contract**:

- `RES-POLL-NO-DEDUP` — Poll loop fires overlapping duplicate requests with no single-flight guard
  or cancellation; a stuck response compounds into unbounded pending requests instead of staying at
  one. (What `AssistantDock`'s pre-fix `daemonOnline` was.)
- `RES-BROWSER-SOCKET-LEAK` — A long-lived browser resource (`EventSource`/`WebSocket`/long-poll)
  is opened without a cancellation path reachable from unmount/reset/navigation, permanently
  consuming one of the browser's per-origin HTTP/1.1 connection slots (6 in Chrome) — distinct from
  `RES-LISTENER-LEAK`'s generic "handler never unregistered" in that the exhausted resource is a
  finite, shared, cross-tab OS/browser budget, not process memory. (What `settings-events.ts` is,
  by deliberate design, and what the `reattachRun` bug was, by accident.)
- `API-SEAM-PARTIAL-ADOPT` (under API & Contract) — An interface gains an optional parameter
  specifically to close a known defect (leak, missing auth, etc.); structural typing lets an
  existing implementation compile unchanged without adopting it, so the fix silently does not apply
  to that consumer. Severity is context-dependent on what the seam was protecting — here, a resource
  leak; the pattern generalizes to any optional-parameter contract fix.

### 4. Standing multi-tab soak check

Bug #1 (`settings-events.ts`) was originally caught by the owner watching real tab count degrade
`:5173`. `development/e2e/themes-presentation-request-timeout.spec.ts` (from today's first fix) is
the closest existing precedent — a hermetic Playwright config that opens extra raw `EventSource`
connections to reproduce pool exhaustion deterministically. Propose generalizing that into a standing
(not necessarily CI-blocking — real-wall-clock, ~1.5min per run) periodic check: boot hermetically,
open N tabs (or N EventSource/poll-loop simulations) against the admin app, and assert the app still
completes a basic screen load within the existing 60s timeout bound. This wouldn't have caught
`reattachRun` specifically (that needs a run in progress, not just open tabs) but would catch any
*future* regression in the class of bug this sweep was for. Not implemented — proposing the pattern
for sign-off, per the same "propose, don't implement" instruction as the other three items.
