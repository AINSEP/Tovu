# D2: WITHDRAWN in revision 3 — `examples/notes-desktop` is owned by the notes plan

Coordinator decision (2026-11-16, Opus review blocker "two plans build the same things"): **one owner per shared surface.**

| Surface | Owner | What this plan does instead |
|---|---|---|
| `examples/notes-desktop` (the second desktop app) | notes plan (`plan/notes-second-app-2026-11-16`, sheet `D1-notes-desktop.md`) | nothing; this sheet is withdrawn |
| devops Electron packaging recipe for a second app (`packages/devops/src/packaging/electron/README.md`) and the packaged notes proof | notes plan, sheet `D2-desktop-packaging.md` | nothing |
| `desktop-host` `./bridge` | **this plan**, D0d | notes D1 consumes it |
| IPC kit `./electron/ipc` + `./electron/ipc/preload` | **this plan**, D1a | notes D1 consumes it |
| `createNodeSidecarLauncher`, ready-line wait, `launchChild` | **this plan**, D3a / D3c1 | notes D1 uses today's launcher with an HTTP readiness probe; D3c1 later switches only its launcher binding line(s) |

The facts this sheet had verified (the launcher already in `desktop-host`; `examples/notes-app` CLI `[--db] [--port]` printing `listening on http://127.0.0.1:<port>` and depending on native `better-sqlite3`; the packaged-child runtime question, owner decision OD-6; loopback-only child; `sandbox: true`, `contextIsolation: true`, no `webviewTag`; a packaged smoke that relaunches and reads a note back) are carried by the notes plan's D1/D2 sheets.

"A second desktop app can be built from Jini alone" is now proven by notes D1 + D2, not here. The landing order in INDEX section 4 no longer has a D2 slot; this plan's D0d and D1a are prerequisites the notes plan names.
