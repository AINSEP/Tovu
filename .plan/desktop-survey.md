Software Architect persona loaded (`AI-Dev-Shop/agents/software-architect/skills.md` v2.3.2). Read-only survey. Tovu `main` = `fad66fb87`, Jini `origin/main` = `f6fa96ae3`. Committed code only, read through git objects.

# Desktop app extraction survey

**BOTTOM LINE:** About a third of the generic desktop layer has already moved to Jini. `@jini-ai/desktop-host` (4,774 lines) has navigation policy, updates, find/zoom/spellcheck, window bounds, speech, shutdown and node-toolchain, and Tovu imports these through 818 lines of thin shims. What is left in `apps/desktop` is mostly **Tovu's multi-site product**: the `tovu serve` child, the site registry, onboarding, owner keys and the Tovu chat tools. That product should **STAY**. The generic pieces still worth moving are about **8–11k of 36k lines**: child supervision and orphan cleanup, the project-folder registry, the tabbed webview workspace (tabs, find, zoom, sleep/wake), chat over IPC, a typed IPC kit that checks the sender, and the update lifecycle. Each goes into an **existing** home: `desktop-host` subpaths, `sidecar`, `platform/fs`, `ui` and `chat`. **No new `desktop-*` package is justified.** A second desktop app such as Notes needs about **600–1,100 lines in total**, and most of the kit already exists. The missing parts are a typed IPC kit, a renderer-safe bridge entry, a packaging recipe and an example that proves it.

**Counting basis:** these are `git show main:` line counts, including comments and blanks. Tests, `.d.ts` files and e2e files are excluded. "MOVE" means a feasible destination. It does not mean compatibility has been demonstrated.

## Measured scope

| Pool | Lines |
|---|---|
| `apps/desktop/src` non-test TS/TSX/MTS | **36,123** (254 files) |
| `scripts/` + `bin/` | 2,808 |
| CSS (`app.css` 2,291 + `SharedKeys.css` 23) | 2,314 |
| `.cts` speech preload | 74 |
| `electron-builder.yml` | ~270 (mostly rationale comments) |
| `.github/workflows/desktop-release.yml` + `desktop.yml` | 482 + 95 |
| **Already in Jini:** `desktop-host` src | 4,774 (electron, tauri-partial, speech, updates, usability, shutdown, node-toolchain) |
| **Already in Jini:** `devops/packaging/electron` | 1,001 |
| **Already in Jini:** `ui/site-card` | 293; `ui/tab-strip` and `ui/browser-chrome` also exist, but **desktop does not use them** |
| Tovu shims over desktop-host (zoom/find/spellcheck menus, bounds, nav policy, updates, presence, toolchain, speech) | 818 |

Area buckets, rule-assigned so they do not overlap (src + scripts = 38,977):

| Area | Lines | Files |
|---|---|---|
| Project/site registry + folder identity (includes `project-ipc.ts` 1,943) | 6,591 | 34 |
| Renderer shell (tabs, grid, settings, find, zoom, onboarding) | 6,207 | 44 |
| Multi-site supervision (spawn, registry, sleep/wake, previews, resources) | 5,873 | 36 |
| Dev gates, smokes, harnesses, CLI bin | 5,703 | 36 |
| Agent/chat runtime (desktop agent, MCP, chat IPC, conversations) | 4,104 | 28 |
| App lifecycle, windows, menus | 4,010 | 26 |
| Packaging (stage payload, closure, asar, manifest merge) | 1,895 | 11 |
| Auth + owner keys + plugin tokens | 1,499 | 8 |
| Import / file handling | 901 | 10 |
| Updates | 853 | 11 |
| Telemetry | 592 | 7 |
| Preload + leftover contracts (all `contracts/` = 1,165) | 565 | 4 |
| Speech (shims) | 184 (+74 `.cts`) | 3 |

## Per-area verdicts

| Area; lines | Generic for ANY Jini desktop app | Tovu-specific | Jini home + host contract | Verdict / evidence |
|---|---|---|---|---|
| **App lifecycle / windows / menus**; 4,010 | Last-window quit ask with N children (173). Move-to-Applications prompt (241). History menu (151). Boot ordering skeleton. userData/packaged roots (213). Find/zoom/spellcheck/bounds/nav policy are already in Jini. | `main/index.ts` 1,149 composition root. Own-server vs sites-home boot modes. `startup-env`. `desktop-i18n` copy. | `desktop-host/electron` (new small subpaths `./electron/app-shell` for quit ask, move-to-apps and history menu). Host passes copy, dialog, child count and quit. | **MOVE PART, about 700–900 lines.** Composition stays. [`main/index.ts:108`](apps/desktop/src/main/index.ts) imports electron. Line 114 imports `website/src/server/runtime/boot/startup-secrets.ts` straight from the website app. |
| **Auto-update / notarization / signing**; 853 + yml + workflow | `desktop-updater` lifecycle (193), `update-check-now` (176), `update-manifest-merge` + `merge-latest-mac` (137). Arch-safe artifact naming. dmg `sign: true`. Notarize-unset rule. | GitHub `AINSEP/Tovu` feed ([`electron-builder.yml:145-147`](apps/desktop/electron-builder.yml)). `appId com.tovu.desktop`. MS Store identity. Settings-menu copy. | Lifecycle goes to `desktop-host/electron/updates` (the controller, policy and presence already live there). Manifest merge goes to `devops/packaging/electron`. The builder yml becomes a **documented template**, not code. Host supplies the feed, appId, entitlements and secrets. | **MOVE PART, about 450–550 lines.** electron-updater is loaded with a lazy `import()` at `main/index.ts:467`. It is declared, but this goes against the "no lazy imports" rule: inject it as a port instead. |
| **Multi-site supervision**; 5,873 | Spawn a CLI child, read a ready line, graceful stop with SIGKILL backstop. `site-supervisor` (176) observes exit. `site-transitions` (80) for starting/stopping. `keyed-serializer` (57). **Per-instance pid registry + orphan reconcile with argv identity proof** (`site-process-registry` 637). Max live views + idle sleep policy (1,077). Process resource view (609). Preview capture + store (588). | `tovu serve` boot line ([`tovu-server.ts:37`](apps/desktop/src/tovu-server.ts)). Boot token, serve env, admin-dev-proxy (157). External-site stop. Theme preview feed (`site-theme-preview.ts:2` already says NEEDS-JINI). | Child supervision and registry go to `@jini-ai/sidecar` (`./supervisor/node`, plus a `./child-registry`). Host passes the spawn spec, ready-line parser, identity matcher and registry dir. Sleep/wake policy goes to pure `desktop-host/live-views`. Resources go to `desktop-host` (data) + `ui` (panel). Previews use the existing `RenderService` / url-capture. | **MOVE PART, about 2.5–3.2k lines.** There are **three launchers today**: desktop-host `createNodeSidecarLauncher`, sidecar `createDaemonSupervisor`, and Tovu `tovu-server` + `site-supervisor`. Tovu uses only the respawn policy. Merge into one. |
| **Project registry + folder identity**; 6,591 | Jini `platform/fs` already owns the directory workspace, registry, running file and durable JSON ([`shared-sites.ts:17`](apps/desktop/src/shared-sites.ts) only passes names). Still generic in Tovu: moved-folder relocation (276), delete safety guard (190), MRU picker (part of `site-dir-store` 638), pointer adoption (206), identity-marker copy split (112), folder roots (161). Renderer list/rename/locate/delete hooks (~1,100). | `config.json` name, `tovu init`, `.tovu` marker names, nested-sites migration, `desktop-projects.json` legacy. Create/import/token handlers. | Generic rules go to `platform/fs` (relocation, delete guard, MRU). Host passes the marker policy, classifier and file names. The list/rename/locate UI goes to `ui/site-card` (rename it to a project-list subpath later). | **MOVE PART, about 1.8–2.6k lines.** First split [`project-ipc.ts`](apps/desktop/src/project-ipc.ts) (1,943 lines, 20 handlers) into generic folder verbs and Tovu create/import/token verbs. |
| **IPC contracts + preload bridge**; contracts 1,165, preload 221 + 74 | Typed channel table + `subscribe` that drops `event.sender` (preload:75). Frozen bridge objects. Contract/handler drift test. **Per-handler sender-frame check** (today only presence/keepRunning and speech check it). | Channel names (`runner:*`, `tovu:*`). `window.tovuRunner` / `tovuOwnerStore` / `tovuTelemetry`. | New subpath `desktop-host/ipc`: `defineChannels`, `exposeBridge({ipcRenderer, contextBridge})`, `handleTrusted({ipcMain, isTrustedSender})`. Electron is injected, in line with the package's no-electron-dep rule. Host owns the channel table. | **MOVE PART, about 250 new + about 300 moved.** Most handlers trust "only the shell page has the preload" ([`project-ipc.ts:1769-1833`](apps/desktop/src/project-ipc.ts) take `_event`). A generic kit must enforce the sender check by default. |
| **Renderer shell**; 6,207 TS/TSX + 2,291 CSS | Tabs (370; Jini `ui/tab-strip` exists but is unused). Find-in-page over webview/top page (816). Webview workspace: reload/back/forward, load failure, expanded mode, zoom (1,288). Dropdown (155). Theme pref (50). Settings popover (191; Jini `ui/about` has an update toggle). Site grid/list (1,539; uses `ui/site-card`). | Create-website onboarding (733). Top-nav sections. Import page copy. Tovu brand, fonts, icons. `tovu-runner.theme` key. | Go to `ui` subpaths (`./webview-workspace`, `./find-bar`; adopt `./tab-strip`). Host passes a `WorkspaceBridge` port (find, zoom, history, open) built on `desktop-host/ipc`. CSS goes to `jini-` classes; the host keeps its tokens. | **MOVE PART, about 3–3.8k lines.** One seam already exists: [`runner-api.ts:170`](apps/desktop/src/renderer/runner-api.ts) is the only `window.tovuRunner` reader. Owner rule: UI moves are Opus + Chrome looks. |
| **Agent / CLI runtime**; 4,104 | Chat over IPC: renderer transport (446+80), main handler (215), conversation list/store (719). Cold supervisor for one agent daemon per instance (300). Loopback MCP HTTP adapter (84; Jini `mcp` already hosts it). | `sites-mcp-tools` (392). Tovu CLI permissions and host signals, which are imported straight from `website/src/assistant` and `website/src/contracts` ([`desktop-agent.ts:41-45`](apps/desktop/src/desktop-agent.ts)). Express app (`desktop-agent.ts:32,362`). | The bridge transport goes to `chat/core` (takes `{invoke, subscribe}`, no electron). The serving side goes to `daemon` (`./bridge`). The store port goes to `chat`. The daemon supervisor goes to `sidecar`. Host passes tools, policy and paths. | **MOVE PART, about 1.5–1.9k lines.** Blocker: Jini `daemon/http` is typed to Express ([`delegated-tools.ts:387`](../../../../tovu-integration-clones/ui-jini/packages/daemon/src/http/delegated-tools.ts) `app: Express`). That breaks the no-specific-server rule and has to be fixed before the desktop agent can drop Express. |
| **Voice / speech**; 184 + 74 | Already in `desktop-host/speech` + `speech/macos` (Swift helper). | Channel namespace `tovu:speech`, positional API shim. | Done. Host passes the namespace. | **STAY** (shim only). |
| **File handling / import**; 901 | Folder/file drop (`folder-drop` 99, `import-drop` 76; Jini `ui` has `useFileDropTarget`). Chat attachment save. | `.tovu.zip` / share-link import through `tovu import-local` (172 + UI). | Drop pieces go to `ui/browser`. Attachments go to `chat`. | **MOVE PART, about 150–250 lines.** |
| **Auth / keys**; 1,499 | "Shell signs into the child it spawned": single-use boot token redeemed for a session in a per-site partition (part of `desktop-auth` 457). | Owner store / shared keys (about 600). Agent-plugin token sign-in. Tovu sessions API. | Boot-token handshake + partition helper go to `desktop-host/electron` (about 150). Host passes the redeem URL and cookie name. | **MOVE PART, about 150 lines; rest STAY.** |
| **Packaging**; 1,895 + yml | Already in `devops/packaging/electron`: staged closure, asar, optional peers. Still in Tovu: `verify-package-cli` (184), `pty-helpers` (50), `shell-staleness` (77), manifest merge. | Tovu payload staging (`stage-payload-lib` 707, `-run` 459): website/admin/site-chat dists, bundled npm, `website-shared` relative imports. | `devops/packaging/electron` + a README recipe. Host lists its payload and natives. | **MOVE PART, about 300–400 lines.** |
| **Telemetry**; 592 | Already in `diagnostics/observability`. | Wiring imports `website/src/server/runtime/composition/product-*`. | Host only. | **STAY.** |
| **Dev tooling / gates**; 5,703 | Coverage/complexity checks already exist in `devops/checks`. | Smokes, packaged-chat gate, site-power verify, harnesses. 11 files import `website/src/platform/server-logs/redact-local-text.ts`. | Host. Point the redaction at `@jini-ai/core` `redactSecrets` instead. | **STAY.** |

## "Second desktop app" minimum kit (Notes desktop wrapping `examples/notes-app`)

Jini already has `examples/reference-desktop` (357 lines: `main.ts` 150, `security.ts` 89, `electron-surfaces.ts` 102, `preload.cts` 16). It loads a URL. It does not supervise a child or package anything.

| Need | Exists? | Smallest add |
|---|---|---|
| Single-instance (optional), window lifecycle, shell/open-external, protocol | Yes: `desktop-host/electron` `createElectronDesktopHost` | none |
| Spawn `notes-app` `node src/main.ts --port 0`, wait until ready, stop on quit | Partly: `createNodeSidecarLauncher` (readiness probe), `desktop-host/shutdown` drain | A ready-line probe helper (about 40). The notes app prints its port. |
| Navigation + webview guest policy, zoom/find/spellcheck menus, window bounds | Yes | none |
| Typed, sender-checked preload bridge | **No** | `desktop-host/ipc` (about 250) |
| Renderer `getJiniHost` without pulling node modules | **No**: the root entry re-exports `sidecar.ts` (`node:child_process`), `logging.ts`, `windows-registry.ts` next to `bridge.ts` | Add a `./bridge` subpath (about 10) |
| Auto-update | Yes: `desktop-host/electron/updates` | Host passes the feed |
| Packaging `better-sqlite3` native + staged server | Yes: `devops/packaging/electron` | A recipe README + builder template (about 150) |
| Signing/notarization | Config only | Template entitlements (`allow-jit`, mic optional). Do **not** copy `disable-library-validation` by default. |
| Example app | — | `examples/notes-desktop` (about 300–500) |

**Total: about 600–1,100 lines.** Not needed: multi-site supervision, registry, tabs, chat or onboarding. The notes app only becomes a multi-document app if it later wants the tabbed workspace.

## Biggest tangles

| Evidence | Consequence; smallest rule-keeping fix |
|---|---|
| The desktop **imports website source by relative path**: 16 distinct modules, including `main/index.ts:1,114,135`, `desktop-agent.ts:41-45`, `project-ipc.ts` (daemon exit codes) and 11 scripts using `redact-local-text`. Packaging copies them into `Resources/website` (`stage-website-shared.ts`). | Any extraction drags website internals along. Move the shared constants and contracts into `@tovu/contracts` (already a dep) or Jini core, then import by package. **Do this first; it is cheap.** |
| Three overlapping child supervisors (desktop-host sidecar launcher, `sidecar` daemon supervisor, Tovu `tovu-server` + `site-supervisor` + `site-process-registry`). | Pick `sidecar/supervisor/node` as the one home. Add the ready-line + orphan registry. Make the desktop-host launcher a thin port over it, wired by the host because desktop-host may not import sidecar. |
| Jini `daemon/http` is typed to Express. The desktop agent builds an Express app (`desktop-agent.ts:362`). | Breaks the "no specific server" rule. Switch the route registration to the `Server` contract (`@jini-ai/core/contracts/server`) in daemon. That is a Jini-wide change, done before the agent moves. |
| `desktop-agent.ts:213-218` lazily resolves `@jini-ai/core` **from the daemon's location** to avoid two core copies. | A lazy import plus module-identity hack. Fix with one deduplicated core (peer dep in daemon) and delete the hack. |
| `desktop-host` root mixes renderer-safe and node-only code. Its `jini.entries` labels `.` as "desktop". | Renderer bundles would resolve `node:child_process`. Add a `./bridge` subpath. |
| The sites-home renderer runs `sandbox: false` + `webviewTag: true` because of the native-ESM preload ([`sites-home-window.ts:121-125`](apps/desktop/src/main/windows/sites-home-window.ts)). Most IPC handlers do not check the sender. | Moderate risk for a generic kit. Ship the kit preload as bundled CJS so `sandbox: true` works, and make `handleTrusted` the default. Tovu can adopt this later. |
| The main process runs `.ts` from `src/**` inside asar ([`package.json` `main: src/main/index.ts`]; electron-builder ships `src/**`). | Works under Electron 43 type stripping. A generic recipe should build `dist/`, because a second app cannot depend on Tovu's raw-ts shipping. |
| Entitlements include `disable-library-validation` + `allow-jit`. The publish feed and appId are hard-coded. | Fine for Tovu. The template must leave them as host inputs. |
| Declared deps with **0 import sites** in `apps/desktop`: `@mcp-ui/client`, `@cfworker/json-schema`. | Check whether staging needs them. If not, drop them. |
| Existing Jini: `@jini-ai/sidecar` depends on `@jini-ai/platform`, not only core. | This is already against the "core only" rule for the proposed supervision home. Either invert it to a port or accept `platform` as a capability adapter (option C). |

**Memory/IO cost note:** the moves must keep today's bounds. That means a per-instance registry file with a single writer, a bounded number of live webviews (`site-view-preference`), a 4 s list poll kept visibility-gated (`visible-interval.ts`) and no extra handler reads per tick. These are acceptance budgets, not measurements.

## Rough order

One Opus cloud run ≈ 1.5–3k lines moved with tests and shims. That is about 1.5–3M tokens at about 400 tokens per moved line, the ratio implied by the server plan's 22.8M tokens for about 58k lines.

| # | Step | Size | Runs | What proves it |
|---|---|---|---|---|
| 0 | Cut website relative imports. Add the desktop-host `./bridge` subpath. Drop unused deps. | about 300 touched | 0.5 | Desktop typecheck; `stage-website-shared` is no longer needed; packaged smoke-native passes. |
| 1 | `desktop-host/ipc` (typed channels, trusted handler, preload expose) + quit-ask, move-to-apps and history menu + update lifecycle + manifest merge | about 1.2–1.5k | 1 | `reference-desktop` uses ipc. Tovu shims shrink. Desktop unit tests + packaged update check work. |
| 2 | **Notes desktop proof** (`examples/notes-desktop`) + packaging recipe/template | about 600–1,100 | 1 | `electron .` boots notes. `electron-builder --dir` launches with native sqlite. A restart smoke passes. |
| 3 | Merge child supervision into `sidecar` (ready line, transitions, keyed serializer, orphan registry) | about 1.5–2k | 1–1.5 | Tovu crash/orphan/multi-instance tests. Two app instances do not lose each other's rows. |
| 4 | Split `project-ipc`. Move relocation, delete guard and MRU to `platform/fs`. | about 1.8–2.6k | 1–1.5 | Registry tests incl. moved folder and Finder copy. Delete guard refuses a live foreign server. |
| 5 | Fix `daemon/http` to use the Server contract (Jini-wide), then chat-over-IPC + conversation store + agent supervisor | about 1.5–2k + daemon change | 1.5–2 | Real desktop chat on fake-test-site via Chrome/desktop. No Express in desktop. |
| 6 | Renderer workspace: adopt `ui/tab-strip`, move find/zoom/webview workspace/live views/resources panel | about 3–3.8k | 2 (Opus + Chrome) | Visual parity in the running desktop. The notes desktop can optionally mount tabs. |
| — | **Stays in Tovu:** `tovu-server` CLI seam, payload staging, `sites-mcp-tools`, owner store, onboarding/import, telemetry wiring, gates/smokes, `main/index.ts` composition | about 25k | — | — |

**Total:** about 8–11k lines move, in about 7–9 Opus cloud runs. Steps 0–2 (about 2–3k lines, about 2.5 runs) already give "reusable for other desktop apps". Steps 3–6 make Tovu itself thinner.

**Not checked:** builds, tests, packaged/runtime behavior, Tauri parity, Windows/MSIX paths, every function body, transitive dependency graph, `devops` internal imports. No files changed besides this report.
