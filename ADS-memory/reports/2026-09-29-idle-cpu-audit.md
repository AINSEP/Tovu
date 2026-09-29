# Idle-CPU audit — Tovu desktop, admin, site assistant, themes (2026-09-29)

Owner request: make sure Tovu never burns CPU while idle (another Electron app on this Mac was
redrawing constantly: renderer + GPU ~50% each, WindowServer 80%).

## Findings

Severity: **high** = runs forever while idle; **medium** = runs forever but cheap / only on one screen;
**fine** = only while something is actually happening.

| # | Where | What | Severity | Status |
|---|---|---|---|---|
| 1 | `apps/admin/src/styles.css:2477` (`.theme-card.active::before`) | `theme-card-border-beam 4.26s linear infinite` animates a registered custom property inside a conic gradient: a main-thread repaint every frame for as long as the Themes screen is open | high (while on Themes) | **Fixed**: 3 sweeps then rest; hover resumes |
| 2 | `apps/desktop/src/renderer/App.hooks.ts:100` (`useSitesPolling`) | `setInterval(load, 4000)` for the app's whole life, hidden or not. Each tick: IPC → main `handleList` → `relocateMovedSites` (scans sibling folders when a tracked site is missing) + per-site file reads, then a grid re-render | high (always on) | **Fixed**: `startVisibleInterval` stops it while the window is hidden, polls at once when shown |
| 3 | `apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx` `daemonOnline` | Jini `ChatPane` (`useChatPaneRuntimeInventory`) calls it every 5s on a bare `setInterval` while the dock is mounted. Each call = `GET /api/agents` → site server → agent daemon (+ live-model enrichment) | medium (always on, two processes) | **Fixed for hidden pages**: `skipProbeWhileHidden` answers from the last result while hidden. Still polls every 5s while visible (see Remaining) |
| 4 | `apps/admin/src/features/voice-input/push-to-talk-mic-button.css:59` | recording dot pulse, infinite | fine (only while recording) | Added `prefers-reduced-motion` |
| 5 | `apps/desktop/src/renderer/app.css:1233` `.card.is-stopping .state__dot` | pulse, infinite | fine (only while stopping) | Reduced-motion rule covered only `is-starting`; now covers both |
| 6 | `apps/desktop/src/renderer/app.css:665` `.spinner` | spin, infinite | fine (rendered only while a server boots / admin loads) | Allowlisted |
| 7 | `content/themes/static/{basic-2,tovu-starter,tovu-theme,tailark-quartz-libre}/css/theme.css` `.logo-track` | public-site logo marquee, infinite | medium-low (public site only; transform-only, compositor; reduced-motion handled) | Allowlisted, unchanged (design) |
| 8 | `apps/desktop/src/renderer/public/vendor/kuinetic/` | vendored animation lib: `infinite` CSS + rAF | none today | Only activates on `data-kui` attributes; nothing in the renderer uses one. Its rAF use is event-driven |
| 9 | `apps/desktop/src/auto-update-controller.ts:177` | main-process `setInterval`, 15 min, `unref` | fine | Allowlisted |
| 10 | `apps/admin/.../use-static-publish.hooks.ts`, `use-static-export.hooks.ts` | 1.5s polls | fine (only while a publish/export is running) | — |
| 11 | Electron main/webview | no `backgroundThrottling: false`, no `powerSaveBlocker`, no throttling-off switches | fine | Guarded |
| 12 | `<video>` in `Media.tsx:269`, `media-embed-extension.tsx:112` | `controls`, no autoplay/loop | fine | Guarded |
| 13 | Jini (`/Users/la/Programming/Jini/packages/chat`) | `useChatPaneComposerPlaceholder` rotates every 4s (off under reduced motion); `useRunActivity` 1s tick only while a run is active; spinner CSS only while running | low | Out of this repo — not changed |

## Guards

- **Static, in the root suite:** `development/scripts/check-idle-motion.ts` +
  `development/scripts/__tests__/check-idle-motion.test.ts`. Fails on `backgroundThrottling: false`
  (and throttling-off switches), `<video|audio autoplay|loop>` in UI markup, an `infinite` CSS
  animation or Tailwind `animate-spin|pulse|ping|bounce` not in its allowlist (each entry says why it
  only runs while something is happening), a file with an allowed one but no `prefers-reduced-motion`,
  a `setInterval(` in desktop/admin/site-chat code not in its allowlist, and stale allowlist entries.
  Run alone: `npm run check:idle-motion`, or
  `node --import tsx --test development/scripts/__tests__/check-idle-motion.test.ts`.
- **Live, opt-in:** `npm run test:idle-cpu` (`development/scripts/measure-idle-cpu.mjs`). Launches the
  desktop app via Playwright `_electron` with a throwaway `TOVU_DESKTOP_USER_DATA_DIR` (safe beside the
  owner's app), waits 10s, samples `ps` CPU time of the Electron tree over 30s, fails above 3% of one
  core. `--admin-url http://127.0.0.1:<port>/admin/ [--path /themes]` measures the admin in headless
  Chromium instead (signs in as `admin`/`tovu-dev`, override with `TOVU_IDLE_ADMIN_USER`/`_PASSWORD`).
  `--idle`, `--settle`, `--max` tune it. Build the renderer first (`cd apps/desktop && npm run
  build:renderer`) or it measures the last bundle.

## Measured

2026-09-29, desktop mode, renderer rebuilt with fix #2, machine otherwise heavily loaded:
**0.69% of one core** total over 30.3s (main 0.33%, renderer 0.33%, helpers 0.03%); page main
thread 0.20%. PASS. This instance has no sites (throwaway userData), so it measures the shell,
not an open admin; the admin mode was not run (one live run allowed).

## Remaining

- The dock's 5s `daemonOnline` poll still runs while the page is visible. A cheaper health endpoint
  (not the full `/api/agents` proxy + enrichment) or a Jini-side visibility check would cut it
  further; Jini's `useChatPaneRuntimeInventory` should pause on `visibilitychange` itself.
- `handleList`'s `relocateMovedSites` runs on every 4s poll while visible; with a missing tracked
  site it re-scans sibling folders each time. Could run only on focus / rescan.
- Run `npm run test:idle-cpu -- --admin-url ... --path /themes` against a live site to measure the
  admin (not yet done).
- A pre-existing, unrelated failure: `apps/admin/src/components/__tests__/AssistantDock.runtime-access.unit.test.tsx`
  fails to load — its `@jini-ai/chat/react` mock lacks `mcpUiSurfaceSlotKey`.
