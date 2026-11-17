# D0: `@jini-ai/desktop-host` gets `./bridge`, `./ipc` and a ready-line launcher option

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/gap-d0-desktop-ipc`. Estimate: ~140k Sonnet.
Owner: `@jini-ai/desktop-host` (imports: itself + `@jini-ai/core`; **no `electron` dependency**: Electron objects
are injected). Prerequisite: a base that contains `moves/audit2-desktop` (merge-b or merge-final).
Closes G11, G12, G13.

## Inventory

```sh
node -e 'const j=require("./packages/desktop-host/package.json");console.log(Object.keys(j.exports),j.jini.entries,j.dependencies,j.peerDependencies)'
sed -n 1,25p packages/desktop-host/src/index.ts; sed -n 30,80p packages/desktop-host/src/bridge.ts
rg -n "^import" packages/desktop-host/src/{bridge,sidecar,logging,windows-registry}.ts
rg -n "interface SidecarLaunchOptions" -A 25 packages/desktop-host/src/*.ts; sed -n 150,215p packages/desktop-host/src/sidecar.ts
cat examples/reference-desktop/src/preload.cts; rg -n "ipcMain\.handle|senderFrame|event\.sender" examples/reference-desktop/src packages/desktop-host/src -g '!**/__tests__/**'
rg -n "desktop-host" ../Tovu/apps/desktop/src -l | head -20        # Tovu importers of the root entry (report count; no Tovu edit in this sheet)
```

Expected: exports have no `./bridge`, no `./ipc`; root re-exports `sidecar.ts` (`node:child_process`) beside
`bridge.ts`; the launcher sends child stdio to a log fd; reference-desktop registers 4 string channels by hand.

## Target

| Subpath | Surface | Rules |
|---|---|---|
| `./bridge` (`jini.entries`: universal) | everything `bridge.ts` exports today (`JINI_HOST_GLOBAL`, client types, `getJiniHost`…) | re-export file only; the root keeps exporting the same names. Test: the built `dist/bridge.js` import graph contains no `node:` specifier (walk imports in a test with the real file list, not a regex over one file). |
| `./ipc` (universal; types name no Electron type: structural ports) | `defineChannels<T>(table)`; `exposeBridge({ contextBridge, ipcRenderer, channels, globalName })`; `handleTrusted({ ipcMain, channels, isTrustedSender, handlers })`; `IpcSenderRejectedError` | below |
| launcher | `SidecarLaunchOptions.readyLine?: { pattern: RegExp; timeoutMs: number }` and `SidecarHandle.ready?: Promise<{ line: string; match: RegExpMatchArray }>` | additive; default behaviour (stdio -> log fd) unchanged when omitted |

`./ipc` contract:
- A channel table is `{ [name]: { kind: 'invoke' | 'event'; channel: string } }` with host-chosen channel
  strings; the kit has no channel names of its own.
- `handleTrusted` checks **every** call: `isTrustedSender({ senderFrame, channel })` must return `true`
  before the handler runs; anything else (false, throw, missing frame) rejects with
  `IpcSenderRejectedError` and the handler is **not** invoked. There is no "trust all" default: the argument
  is required. It returns `dispose()` removing all handlers; registering a channel twice throws.
- `exposeBridge` exposes one frozen object; `invoke` channels become functions; `event` channels become
  `subscribe(listener) => unsubscribe` that never passes the Electron event (so `event.sender` cannot leak).
  Channels not in the table cannot be reached.
- Ready line: when `readyLine` is set, stdout is piped, **teed** to the log file (same bytes, same order),
  scanned line by line with a bounded line buffer (64 KB; a longer line is truncated for matching and the
  bound is stated in a comment); `ready` resolves on first match, rejects on timeout or early exit with a
  typed error; after resolve/reject the scanner stops retaining data. Stderr handling unchanged.

## Tests first (vitest; fakes implementing the injected Electron shapes)

| Test | Must fail when |
|---|---|
| deny first: untrusted sender -> rejected, handler call count 0; `isTrustedSender` throwing / returning a truthy non-boolean / resolving a promise -> rejected (fail closed) | the check is skipped or coerced |
| trusted sender -> handler receives the args, result returned; handler throwing -> rejection carries a redacted message, not the stack (assert the exact shape) | — |
| `dispose` removes every handler (fake `ipcMain` handler count back to 0); double registration throws | cleanup missing |
| `exposeBridge`: object and nested members frozen; `subscribe` listener receives payload only (assert `arguments.length` and no object with `sender`); `unsubscribe` removes the listener (count 0); unknown channel not present | event leak or listener leak |
| ready line: match across two chunks; match after 3 non-matching lines; timeout rejects with the typed error and kills nothing by itself; child exits before the line -> rejects; log file content equals the full stdout (tee) ; no `readyLine` -> stdout not piped (existing test still green) | chunk-boundary bug, lost log output, changed default |
| `./bridge` import graph has no `node:` module | a node import sneaks into the renderer entry |

## Steps (commit each; each green alone)

1. `./bridge` re-export + `exports`/`jini.entries` + graph test. 2. `./ipc` (new files `src/ipc/*.ts`) + tests
   + export. 3. Ready-line option + tests. 4. `examples/reference-desktop`: replace the hand-written preload
   and `ipcMain.handle` calls with the kit (same 4 channels, same behaviour; its `security.test.ts` stays
   green; add one test that a call from a non-main frame is refused). 5. Changeset `@jini-ai/desktop-host`
   minor; package README section "IPC".

## Acceptance

desktop-host gates; Jini repo gates; reference-desktop typecheck/test/build; Tovu typecheck linked (root
entry unchanged: zero edits expected). `rg -n "from 'electron'" packages/desktop-host/src/ipc` is empty.

## Not verified by the planner

`SidecarHandle`'s shape; whether the preload must stay CommonJS (`preload.cts`) under `sandbox: true` (it is
today; keep it); how `jini.entries` labels a types-only universal subpath in a "desktop" package; Tauri parity
(out of scope: the kit is Electron-shaped by injection only).
