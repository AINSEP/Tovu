# D0: WITHDRAWN in revision 3 — the desktop-extraction plan builds these surfaces

Coordinator decision (2026-11-16, Opus review blocker "the desktop wave duplicates the desktop-extraction plan"):
**one owner per shared surface.** This sheet used to add `desktop-host` `./bridge`, an `./ipc` kit
(`defineChannels` / `exposeBridge` / `handleTrusted`, `src/ipc/*`) and a `readyLine` option on
`createNodeSidecarLauncher`. All three are owned by `plan/desktop-extraction-2026-11-16`:

| Surface | Owner sheet there | What this plan does |
|---|---|---|
| `@jini-ai/desktop-host/bridge` (renderer-safe entry) | desktop **D0d** | consumes it; notes D1 lists D0d as a prerequisite |
| IPC kit `@jini-ai/desktop-host/electron/ipc` (`createTrustedIpc`, `isTrustedIpcSender`, policies `'frame'`/`'main-frame'`/`'main-frame-and-page'`, required `reportRefusal`) and `@jini-ai/desktop-host/electron/ipc/preload` (`createPreloadBridge`) | desktop **D1a** (name chosen there: `./electron/*` is `desktop-host`'s existing subpath naming; `./ipc` is withdrawn) | consumes it; notes D1 lists D1a as a prerequisite |
| `createNodeSidecarLauncher` and any ready-line wait | desktop **D3a** (sidecar `./ready-line`) and **D3c1** (one launcher) | notes D1 uses today's launcher with an HTTP readiness probe (`waitUntilReady({ probe, isReady })`, `desktop-host/src/sidecar.ts:52`); no `readyLine` option is added |
| the sandboxed-preload bundling pattern (esbuild, `electron` external) | desktop **D1a** decision 7 (`examples/reference-desktop`) | notes D1 copies the same build line for its own preload |

The judge findings this sheet answered (5, 24) are carried by desktop D1a (bundling) and notes D1 (shutdown and
readiness failure). Owner decision OD-N12 (may an example depend on esbuild) is moot: `esbuild` is already declared by
`packages/agent-plugins`, `analytics`, `cookie-consent` and `provider-plugins` on merge-final.
