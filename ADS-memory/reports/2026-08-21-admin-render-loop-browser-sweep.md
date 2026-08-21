# Admin browser sweep — no render loops from the hook-dependency pass

Generated 2026-08-21 · Branch `general-work` · repo-local Playwright (headless chromium), not MCP
Dispatch: `browser-sweep` (Sonnet, qa-e2e persona) · verified independently by the coordinator from the raw JSON

## Why this ran

Commits `d8741bc9`, `5f67fcc3`, `691be855`, `bc442853` changed React hook **dependency arrays** across
~35 files in `apps/admin`. That is the change class that produces infinite re-render loops and refetch
storms, and **neither is reliably caught by unit tests** — every vitest suite was green and both
typechecks passed before this sweep ran. Green tests were not evidence.

## Method — measured, not looked at

Screenshots are worthless for this: a render loop looks completely normal in a still image. Per screen:
navigate, settle ~3s, then record **every network request with a relative timestamp** over a 10s window
with zero interaction, and compute inter-arrival gaps.

Read: gaps > 2000ms = periodic poll (benign). Max gap < 300ms = mount storm (the bug shape). The count
alone is ambiguous — `x2` means opposite things at `[t=0, t=12]` versus `[t=0, t=5000]`.

`waitUntil: "networkidle"` was avoided throughout — it never resolves against this admin (open SSE
settings feed) and fails silently.

## Result — 23 screens, clean

All 21 admin screens plus Posts (editor) and a real Widgets **region editor** (`/widgets/regions/footer`).
**9 of the 23 are `port`-touched screens** — the 10 fetching effects that gained `port` this pass.

Independently re-parsed from `sweep2-results.json` by the coordinator:

| metric | value |
|---|---|
| screens measured | 23 |
| distinct URLs in ANY idle window | **exactly one: `GET /api/agents`** |
| request series with a burst-shaped gap (<2000ms) | **0** |
| screens with console errors or pageerrors | **NONE** |
| screens that failed to navigate | **NONE** |
| screens with more than one request URL | **NONE** |

Every gap was ~5000ms ± 30ms. Traced to source: a `window.setInterval` in `AssistantDock.hooks.tsx`
polling `AGENTS_URL = "/api/agents"` every 5s. The dock is `hidden`-but-never-unmounted app-wide
(ADR-049), so it polls identically on every route. **One global timer, pre-existing, not per-screen.**

No `Maximum update depth exceeded`, `Too many re-renders`, or hook-count-mismatch anywhere, across 6
script runs.

### SSE exclusion was verified, not assumed
Two SSE endpoints exist (`apps/admin/src/lib/settings-events.ts:32`, `assistant-transport.ts:35/258`):
the workspace settings change feed and `/api/runs/{runId}/events`. The sweep logged an explicit
`sseSeenExcluded` array per screen rather than silently filtering — **it came back empty on all 23**.
`EventSource` fires one `request` event at connection-open, during the settle phase, before recording
starts. So nothing was hiding behind "that's just the SSE."

## Verdict

The `port` / `onCancel` / `commitActiveId` / `setExecutionConfig` dependency-array changes are clean.
Nothing screws up and nothing endlessly reloads. Escape-to-cancel works correctly on all four dialogs
the `onCancel` change touched — closes exactly once, page stays interactive.

## Two findings OUTSIDE this change's scope

1. **Media Picker's Cancel button is unreachable with real media loaded.** Measured at **y=3254 against
   a 1400px viewport**, at two viewport sizes; Playwright could not scroll it into range. Cause
   confirmed by reading CSS: `.media-picker-grid`/`.media-picker-item` have **zero rules anywhere**, so
   `<img>` renders at native size, and `.settings-dialog` (`styles.css:2049`) sets `max-width` but no
   `max-height`/`overflow`. Cancel sits after the grid, so it is pushed down without limit.
   **Pre-existing, not caused by this pass** — Escape uses the same `onCancel` and works. **jsdom has no
   layout engine, so no unit test at any count can catch this.** Fix pattern already in the repo:
   `apps/admin/src/styles/form-field-attrs.css:29-33`.
2. **Widget Picker threw four `401 Unauthorized` plus "settings change feed closed by the server"** on
   open. The dialog still opened and Escape still worked. Could not be root-caused: possibly a real
   session bug, possibly an artifact of the harness doing 4 fresh logins in ~10 minutes. No
   single-session-enforcement code found in the admin frontend; backend not checked. **UNRESOLVED.**

## Handoff contract
- **Inputs:** repo-local Playwright against the already-running dev servers (PID 9969 :5173, PID 60795
  :3000 — neither restarted); `sweep2-results.json` raw per-request timestamps.
- **Risks:** finding 2 is unexplained. Finding 1 is user-facing and dispatched separately.
- **Not covered:** authenticated flows beyond navigation and the four dialogs; no data mutation tested.
