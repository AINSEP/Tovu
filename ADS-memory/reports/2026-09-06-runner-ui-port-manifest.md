# Tovu-Runner UI port — file manifest

- Date: 2026-09-06
- Source: `/Users/la/Programming/Tovu-Runner` (`src/{renderer,contracts,preload,main}`)
- Target: `/Users/la/Programming/Tovu/apps/desktop`
- Scope of this manifest: the whole Runner source tree. **Phase 1 lands only the
  renderer + contracts + preload + build scaffold**; `src/main/` is enumerated here so
  phase 2 has a decided list rather than a fresh survey.

## Standing constraints this manifest is written against

1. `apps/desktop/` stays self-contained and deletable. Nothing outside it may import it.
   `development/scripts/dev.mjs` is untouched.
2. The existing `.cjs` main process (`main.cjs`, `src/*.cjs`, `src/speech/*.cjs`) keeps
   working unchanged in phase 1. It is NOT rewritten to ESM.
3. The speech preload (`src/speech/preload-speech.cjs`) and `registerSpeechIpc` wiring —
   fixed in `4b89cd09` — must survive. Electron allows one `preload` per window, so the
   two bridges are merged per window ROLE rather than one being dropped.
4. No stub may return fake success. Every not-yet-ported IPC verb throws a
   `RUNNER_MAIN_NOT_PORTED` marker.

## Rulings that shaped the port

### R1 — Renderer needs exactly TWO `@jini-ai` packages, not seven

Runner declares 7 `@jini-ai/*` `file:` deps. Measured against actual renderer imports
(`command grep -ahoE "from '[^']+'" src/renderer/* src/contracts/*`), the renderer and
contracts reach only:

| package | how used | verdict |
| --- | --- | --- |
| `@jini-ai/chat` | VALUE imports: `buildTranscript`, `isTerminalRunStatus` (`/core`); `ChatFab`, `ConversationList` (`/react`); `ChatPane` (`/react/chat-pane`) | **runtime dependency** |
| `@jini-ai/protocol` | TYPE-ONLY: `RunAgentPayload`, `RunProtocolEvent` | **devDependency** (types only; `@jini-ai/chat` pulls the runtime copy) |
| `@jini-ai/agent-runtime`, `/core`, `/daemon`, `/desktop-host`, `/sqlite` | main-process only | **stay behind — phase 2** |

Declared as published semver ranges (`^0.3.4` / `^0.3.1`), matching `apps/admin`'s own
convention, NOT Runner's `file:../Jini/packages/*`. Reason: `@jini-ai/chat`'s own
dependencies use `workspace:*`, which npm cannot resolve through a `file:` link
(the documented "npm ships literal `workspace:*`" trap). `apps/admin` already proves the
registry form resolves and then gets locally symlinked to the Jini checkout.

### R2 — `better-sqlite3` / `electron-rebuild` stay out of phase 1

Both are main-process concerns (`project-registry.ts`, `fleet-conversation-store.ts`).
Adding them now would put a native-module rebuild in the critical path of a UI-only phase.

### R3 — The fleet renderer is an OPT-IN boot mode in phase 1, not the default

The dispatch asked for `main.cjs` to load the renderer "instead of `loadURL`-ing straight
at a site admin". Taken literally in phase 1 that would replace a **verified-working**
multi-site shell (two sites booting concurrently at schema v57, orphan reconcile proven)
with a UI whose every IPC verb is a `RUNNER_MAIN_NOT_PORTED` throw. That is a silent
behaviour regression of working software, which this repo's #1 constraint forbids.

Ruling: the renderer is wired in as a **third boot mode**, `TOVU_DESKTOP_UI=runner`.
Default (unset) keeps today's exact behaviour byte-for-byte. Phase 2, once `src/main/`
lands, flips the default. This is reversible in one line and is flagged in the handoff as
a decision that could reasonably have gone the other way.

### R4 — Two window roles, two preloads; the speech preload file is not touched

| window role | loads | `sandbox` | preload | bridges |
| --- | --- | --- | --- | --- |
| site admin (existing) | `http://127.0.0.1:<port>/admin/` | `true` | `src/speech/preload-speech.cjs` — **unchanged** | `window.tovuVoice` |
| runner fleet (new) | `dist/renderer/index.html` | `false` (Electron 43 native-ESM preload requirement) | `dist/preload/preload.mjs` | `window.tovuRunner` + `window.tovuVoice` |

The fleet preload re-exposes `tovuVoice` with the same two inlined channel literals the
sandboxed one uses, so the composer mic keeps working inside the ported UI. A drift guard
test pins those literals to `speech-ipc.cjs`'s exports, mirroring
`preload-speech.test.cjs`.

`will-attach-webview` hardening (`delete webPreferences.preload`, `nodeIntegration=false`,
`contextIsolation=true`) is ported verbatim onto the fleet window, alongside
`webviewTag: true`.

## `src/renderer/` — ALL come over

| file | lines | verdict | notes |
| --- | --- | --- | --- |
| `App.tsx` | 1153 | as-is | prose says "Runner" throughout; that is the product name, kept |
| `App.hooks.ts` | 1209 | as-is | all derived logic already lives here, per this repo's `.tsx` rule |
| `ProjectGrid.tsx` | 229 | as-is | |
| `CreateWebsiteOnboarding.tsx` | 256 | as-is | |
| `icons.tsx` | 150 | as-is | |
| `theme.ts` | 50 | as-is | `localStorage` key `tovu-runner.theme` kept — a rename would silently drop an existing operator's theme |
| `app.css` | 1437 | as-is | `@import` of Google Fonts + `url('../remixicon.woff2')` both resolve unchanged under the same `public/` layout |
| `runner-api.ts` | 73 | as-is | declares `window.tovuRunner` |
| `fleet-chat-transport.ts` | 422 | as-is | the `RunProtocolEvent` -> `AgentEvent` reducer |
| `folder-drop.ts` | 64 | as-is | |
| `project-status.ts` | 16 | as-is | |
| `persistable-messages.ts` | 19 | as-is | |
| `chat-attachments.ts` | 59 | as-is | |
| `main.tsx` | 13 | as-is | |
| `index.html` | 28 | as-is | keeps the pinned `kuinetic@0.1.4` CDN pair |
| `electron-webview.d.ts` | 75 | as-is | |
| `public/brand/gold-runner-{1..5,icon}.png` | — | as-is | binary copy |
| `public/remixicon.woff2` | — | as-is | binary copy |

## `src/contracts/` — ALL come over as-is

`chat-attachments.ts`, `fleet-chat.ts`, `fleet-conversations.ts`, `project.ts`,
`runtime-inventory.ts`, `sections.ts`, `site-assistant-tools.ts`, `working-directory.ts`.

Shared by renderer and (phase 2) main. `site-assistant-tools.ts` has no phase-1 consumer
but is part of the contract surface and is cheaper to bring whole than to split.

## `src/preload/` — comes over ADAPTED

| file | verdict |
| --- | --- |
| `preload.mts` | **adapted** — ported verbatim, then extended with the `tovuVoice` block per R4 |

## `src/main/` — ALL STAY BEHIND in phase 1

Enumerated with the phase-2 verdict already decided.

| file | lines | phase-2 verdict | why |
| --- | --- | --- | --- |
| `main.ts` | 603 | **adapted, not as-is** | Runner assembles on `@jini-ai/desktop-host/electron`; `apps/desktop` has its own `.cjs` main with site-dir MRU, orphan registry, keyed serializer and speech IPC that Runner does not have. The two must be merged, not swapped. |
| `project-registry.ts` | 310 | adapted | `@jini-ai/sqlite` + the documented single-`openDatabase`-per-process hazard. Overlaps `site-registry.cjs`'s job. |
| `project-provisioner.ts` | 884 | adapted | overlaps `tovu-server.cjs`'s `startTovuServer`; the existing one already works and already handles the `dist/` schema-skew via `TOVU_DESKTOP_CLI_MODE=source`. |
| `tovu-cli.ts` | 370 | adapted | Runner shells out to a *built* Tovu CLI binary in a sibling checkout. `apps/desktop` lives INSIDE Tovu and already runs the CLI from source under `tsx`. |
| `runner-daemon.ts` | 372 | as-is | co-located Jini daemon; pulls `@jini-ai/{agent-runtime,core,daemon}` |
| `fleet-chat-ipc.ts` | 204 | as-is | |
| `fleet-conversation-store.ts` | 224 | as-is | needs `@jini-ai/sqlite` + `better-sqlite3` |
| `fleet-conversation-store.test.ts` | 139 | as-is | |
| `runner-tools.ts` | 487 | as-is | |
| `runner-mcp-bridge.ts` | 428 | as-is | |
| `runner-mcp-server.ts` | 196 | as-is | |
| `runner-agent-prompt.ts` | 44 | as-is | |
| `agent-inventory.ts` | 47 | as-is | |
| `secure-credentials.ts` | 67 | as-is | |
| `site-assistant-mcp.ts` | 198 | as-is | |
| `site-assistant-project-scope.test.ts` | 151 | as-is | |
| `working-directory-store.ts` | 48 | as-is | |
| `tovu-openapi-mcp.ts` | 339 | **STAYS BEHIND permanently** | Runner's own header says nothing wires it up and no call site imports it. It reads `Tovu/openapi/*.yaml` from a sibling checkout — inside Tovu that path assumption is wrong anyway. Do not port dead code across a repo boundary. |

## Build files

| file | verdict |
| --- | --- |
| `vite.config.ts` | adapted — same shape; `fs.allow` drops the `../Jini` entry (this checkout reaches Jini through `node_modules` symlinks, not a sibling path) |
| `tsconfig.json` | adapted — Runner's compiles main+preload+contracts. `apps/desktop`'s main is hand-written `.cjs`, so the equivalent here is `tsconfig.preload.json`, covering preload+contracts only |
| `tsconfig.renderer.json` | as-is |
| `.dependency-cruiser.cjs`, `electron-builder.yml`, `eslint.config.mjs`, `biome.jsonc`, `development/scripts/*` | **stay behind** — Tovu's root already owns lint/complexity/boundary gates, and a second set inside `apps/desktop` would be a fork of them |
| `test/**` | **phase 2** — Runner's renderer tests import from `dist/`; they need the build to exist first |

## Not yet resolved / carried into phase 2

- `apps/desktop/src/site-registry.cjs` and Runner's `project-registry.ts` are two answers to
  the same question (which sites are running). Phase 2 must pick one, not run both.
- `src/tovu-server.cjs` vs `project-provisioner.ts`, same overlap.
- Root `npm run complexity` lints `apps/desktop/src/**` at the repo-wide `warn`/15 tier
  (the `error`/9 block is scoped to `apps/admin/src/**`). The ported files are measured
  against 9 anyway and any violation is reported rather than silently accepted.
