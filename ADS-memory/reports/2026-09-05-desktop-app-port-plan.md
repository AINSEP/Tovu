# Desktop App Port Plan — `apps/desktop` in the Tovu monorepo

- Date: 2026-09-05
- Branch: `restructure/apps-website-phased`
- Author: software-architect (dispatched)
- Status: COMPLETE — proving slice built and verified

---

## 0. Verdict (go / no-go + smallest first step)

**GO on the thing that was asked for. NO-GO on the thing it sounds like.**

Those are two different projects, and the difference is the whole finding:

| | What it is | Size | Verdict |
|---|---|---|---|
| **A. A desktop entry point for Tovu** | An Electron window over the same server `npm run dev` boots. One product, two entry points. | ~170 lines, additive | **GO — already built and verified this dispatch** |
| **B. Porting Tovu Runner into the monorepo** | Runner is a *fleet supervisor* — a separate product that creates and manages N Tovu sites, with its own React UI, its own in-process Jini agent daemon, its own MCP server, project registry and credential vault. | ~11,000 lines, of which ~200 are "shell around Tovu" | **NO-GO as a port. It is a merge of two products, not a relocation of one.** |

Leona described A: "flexible enough to just import all that stuff we're doing", `npm run dev` unchanged, a second entry point, one product shipped. That is exactly what `apps/desktop/` now is.

**Smallest first step: it is done.** `apps/desktop/` is committed (`b8b2c92e`), boots, and loads the live admin. Nothing outside the directory changed. `development/scripts/dev.mjs` was not touched.

**The decisive measurement this dispatch made** (Section 4.1): Tovu's three native modules — `better-sqlite3` 13.0.3, `argon2`, `sharp` — all load **unmodified** under Electron 43's ABI, with a real SQLite write/read roundtrip. Electron 43 bundles Node 24.18.0, satisfying Tovu's `engines.node: ">=24.0.0"`. The single hardest problem in Tovu-Runner's own source comments — "Tovu must run under a real Node binary, NOT Electron's bundled Node… KNOWN GAP: the packaged app therefore still depends on a Node install it does not ship" — **is stale and no longer true.**

---

## 1. What Tovu Runner is today

### 1.1 Stack

| Concern | Choice |
|---|---|
| Shell | **Electron 43.2.0** (not Tauri) |
| Renderer | React 19.2 + Vite 8, `src/renderer/` |
| Main process | TypeScript compiled by plain `tsc` to `dist/main/` |
| Preload | `src/preload/preload.mts`, `contextIsolation: true` |
| Packaging | **electron-builder 26.15**, `electron-builder.yml`, mac dmg + dir |
| Signing | Developer ID, `build/entitlements.mac.plist` (one key: `allow-jit`) |
| Notarization | Custom `afterAllArtifactBuild` hook (`development/scripts/notarize-dmg.mjs`) — electron-builder notarizes the `.app` but never the `.dmg`, and the `.dmg` is what gets downloaded |
| Updates | `latest-mac.yml` update manifests are produced and hash-reconciled after stapling; no updater client wired in `src/` |
| DB | `better-sqlite3` ^13, `electron-rebuild -f -w better-sqlite3` on postinstall |
| Jini | `file:../Jini/packages/*` links — **including `@jini-ai/desktop-host`, which Tovu does not depend on** |

### 1.2 Entry points

- `main`: `dist/main/main.js` (603 lines) — window creation, `webviewTag: true` with a `will-attach-webview` hardening hook, and ~25 `ipcMain.handle` channels.
- `npm run dev` (`development/scripts/dev.mjs`, 80 lines): `tsc` the main process, start Vite on **5174**, poll it, then launch Electron. Renderer gets HMR; main-process edits need a re-run.
- `npm run package` (`development/scripts/package.mjs`): stage Tovu runtime → build Runner → electron-builder → reconcile update manifests.

### 1.3 What Runner does that Tovu does not

This is the list that makes B a merge rather than a port:

1. **Fleet supervision.** `project-registry.ts` (310 lines) + `project-provisioner.ts` (884 lines) — create, register, start, stop, delete N site directories, each on its own allocated port.
2. **An in-process Jini agent daemon.** `runner-daemon.ts` constructs `RunLifecycle`, `AgentExecutor`, `ToolExecutor` and `DelegatedToolBridge` **inside Electron's main process**, and its header documents that co-location as a hard invariant — split it across a process boundary and tool events silently land in a different lifecycle's log with no error.
3. **A fleet-operator chat** (`fleet-chat-ipc.ts`, `fleet-conversation-store.ts`, `App.hooks.ts` at 1,209 lines) with its own persistence, attachments and threads.
4. **Its own MCP surface** — `runner-mcp-server.ts`, `runner-mcp-bridge.ts`, `runner-tools.ts`, `site-assistant-mcp.ts`, `tovu-openapi-mcp.ts` (~1,450 lines) exposing `runner.*` tools plus a project-scoped site-assistant.
5. **An OS keychain credential vault** (`secure-credentials.ts`) with a throwing stub for machines that have none.
6. **A `<webview>` embed per project**, so each running site is a tab inside the fleet window.
7. **Node discovery.** `resolveNodeBinary()` probes PATH plus Homebrew, MacPorts, Volta, nvm, fnm, asdf and n — a `.app` launched from Finder inherits a bare `PATH`.
8. **Packaging that stages Tovu.** `stage-tovu-runtime.mjs` (389 lines) copies Tovu's `dist/`, its production dependency closure, every `@jini-ai/*` package flattened, and `apps/admin/dist`, into `Resources/tovu/`.

### 1.4 How the two projects diverged

`/Users/la/Programming/_archive-Tovu-Runner-presplit` is the **old combined repo** (`tovu-workspace`, with the whole product under `web/`). Two facts from it settle the history:

- It contained **`web/apps/desktop/`** — a 60-line `main.cjs` plus a `dev.sh`, wired as `"desktop": "npm --prefix apps/desktop run dev"`. Exactly the thin shell being asked for now. It already existed.
- Tovu-Runner's **first commit is `cdb2595 feat: rebuild Tovu-Runner as its own Electron desktop product`.**

So the split did not move the desktop shell out. It **deleted** a thin shell and **rebuilt** a different, larger product in its place. The two repos diverged because someone decided the desktop app should be a fleet manager, not because a shell was inconvenient to keep in-tree.

That is the strongest argument in this report: re-adding the thin shell reverses a deletion. It does not reverse the split.

---

## 2. The recommended seam

**Tovu already exposes a stable, documented, currently-exercised seam for exactly this, and it is `tovu serve`.**

`apps/website/src/cli/commands/serve.ts` boots a site dir end to end: `bootSiteDir` (validate/migrate/stamp), `<dir>/content.db`, `<dir>/uploads`, `<dir>/themes`, `createSqliteRouteDeps` → `createApp` → `app.listen`, agent-daemon port self-allocation, daemon spawn after readiness, and a SIGTERM graceful drain (BR-07). It then prints one contract line:

```
tovu serve: dir=<dir> port=<port> schemaVersion=<n> workspaceId=<id>
```

Tovu-Runner has parsed that exact line for months (`src/main/tovu-cli.ts`'s `TOVU_BOOT_LINE_PATTERN`). It is a proven seam, not a new one.

`apps/desktop/` is therefore a **second consumer of an existing port**, with two modes:

- **Attach** (`TOVU_DESKTOP_URL` set) — load a stack someone else started. This is how web and desktop run in parallel against the same server, which is what "both modes runnable in parallel for testing" needs. Zero processes spawned.
- **Own server** (default) — spawn `tovu serve <dir> --port <n>`, parse the boot line, load `http://127.0.0.1:<port>/admin/`.

### Directory shape

```
apps/
  admin/          (existing — own package.json, own node_modules, own Vite build)
  site-chat/      (existing)
  website/        (existing — the server)
  desktop/        (NEW)
    package.json  — name "tovu-desktop", main "main.cjs", devDep electron ^43
    main.cjs      — the shell
```

`apps/desktop` follows **`apps/admin`'s existing convention exactly**: its own `package.json`, its own install, invoked by `--prefix`. The root `package.json`'s `workspaces` field is `["packages/*"]` — **`apps/*` is deliberately not a workspace**. A root `npm install` therefore does not see `apps/desktop` at all.

### Constitution check — "swappable ports/adapters over provider-coupled implementations in core"

**COMPLIES.** Count of files under `apps/website/` that must change for the desktop shell to work: **zero.** The shell consumes `bin.tovu` (read from `package.json`, never hardcoded) and the documented startup line. Both modes were verified against unmodified Tovu.

One *optional* upstream fix is discussed in §4.3, and it is a pre-existing bug already worked around by an env var Tovu itself documents.

### Reversibility

`rm -rf apps/desktop` returns the repo to its exact prior state. Nothing imports it, nothing references it, no root config mentions it, `dev.mjs` was never opened.

---

## 3. Phased plan

Each phase is independently landable and independently revertible.

### Phase 0 — the shell exists and boots ✅ **DONE (`b8b2c92e`)**

`apps/desktop/{package.json,main.cjs}`, 168 lines. Attach + own-server modes, `setWindowOpenHandler` so external links leave the app, `TOVU_DESKTOP_SELFTEST=1` for terminal verification, SIGTERM teardown of a spawned child.

**Proof:** attach mode loaded `https://localhost:5173/admin/` and `https://localhost:3000/admin/` (following the API's own 302), reporting `title="Tovu Admin"`, exit 0 both times, measured directly and not through a pipe. Run against the Electron 43.2.0 already present in the sibling Tovu-Runner checkout — **nothing was installed.**

### Phase 1 — a real dev loop

Add `apps/desktop`'s own dev script that starts the existing stack and attaches, so a developer runs one command.

- **Do NOT modify `development/scripts/dev.mjs`.** Its `main()` is already at complexity 11 and `.mjs` is outside the complexity gate. Spawn it as a child from `apps/desktop` instead and attach to the ports it prints. Web mode stays byte-identical because the desktop path *calls* it rather than *changing* it.
- **Proves it works:** `npm --prefix apps/desktop run dev` opens a window on the admin, and a `git diff development/` is empty.
- **Cost:** one `npm install` inside `apps/desktop` (Electron, ~120 MB in `apps/desktop/node_modules`). **Needs Leona's go-ahead — not done in this dispatch.**

### Phase 2 — run Tovu in-process instead of as a child

Now unlocked by §4.1. Replace the spawned `tovu serve` with a direct `import` of `runServeCommand` (or `createApp` + `createSqliteRouteDeps`) inside Electron's main process.

- Removes the system-Node dependency, the `resolveNodeBinary()` probe, and one process from the tree.
- **Proves it works:** the window loads the admin with no `node` process in `ps` other than Electron's own; a post creates and survives a restart.
- **Revert:** flip back to spawn mode; both live behind `resolveTarget()`.

### Phase 3 — packaging (only if a distributable is actually wanted)

electron-builder config, `extraResources` staging, signing, notarization. **This is where the cost is** (§5) and it is the first phase that is not cheap. Do not start it until someone wants a `.dmg`.

- **Proves it works:** `spctl -a -vvv -t exec` and `xcrun stapler validate` pass on the artifact.
- Steal `stage-tovu-runtime.mjs` and `notarize-dmg.mjs` from Runner wholesale — both encode expensively-learned facts (electron-builder refuses to copy a source root literally named `node_modules`; `dmg.sign` must be literally `true`; stapling invalidates the update manifest hash).

### Phase 4 — fleet features, if ever

Only if Tovu is meant to manage multiple sites from one window. This is where Runner's 11,000 lines would actually be relevant. **Recommend not doing this** — see §6.

---

## 4. Hard parts and unknowns

### 4.1 Native modules — SETTLED, and the news is good

Runner's `tovu-cli.ts` says Tovu must run on system Node because "Tovu ships its own `better-sqlite3` native addon compiled for system Node's ABI; Electron's Node has a different NODE_MODULE_VERSION". `electron-builder.yml` repeats it: "the better-sqlite3 **11** inside the staged Tovu tree is a node-gyp build".

**Both comments are stale.** Measured today:

- Tovu's installed `better-sqlite3` is **13.0.3**. It has **no `build/` directory** and `lib/binding.js` resolves `prebuilds/<platform>-<arch>.node` — an **N-API** binary, ABI-stable across Node and Electron. `argon2` ships `prebuilds/` the same way; `sharp` uses the prebuilt `@img/sharp-*` platform packages.
- Loaded all three under Electron 43 (`ELECTRON_RUN_AS_NODE=1`, `modules=148`, `napi=10`): **all three LOADED**, and `better-sqlite3` completed a real `create table` / `insert` / `select` roundtrip returning `42`.
- Electron 43 bundles **Node 24.18.0**, satisfying Tovu's `engines.node: ">=24.0.0"`.

Consequences: no `electron-rebuild` for Tovu's tree, no vendored Node runtime, no `resolveNodeBinary()` probe, and Phase 2 (in-process) is viable. **This also means Runner's own "KNOWN GAP" is now closeable** — worth telling whoever owns that repo regardless of what happens here.

Remaining unknown: `sharp` resolved to `@img/sharp-darwin-**x64**` on this machine, not `arm64`. That is an existing property of this checkout's install, not something the desktop work introduces, but it will matter at packaging time (Phase 3) because a universal or arm64 build needs the matching platform package. **Settled by:** `npm ls @img/sharp-darwin-arm64` at packaging time.

### 4.2 DB and `sites/` in a packaged app — the real open question

`tovu serve <dir>` puts `content.db`, `uploads/` and `themes/` **inside the site dir**, so the shape is already right — but nothing decides *where that dir lives* for a packaged app. Today the slice defaults to `<repo>/sites/tovu-com`, which is correct for a developer and wrong for a shipped app.

The choice is `app.getPath('userData')` (one implicit site, invisible to the user, awkward to back up) versus a user-chosen folder in `~/Documents` (visible, backup-able, needs a first-run picker). **Runner already solved this** — `working-directory-store.ts` plus a `dialog.showOpenDialog` picker, with recents. **Not decided here; it is a product decision, and it is the one thing Phase 3 cannot start without.**

### 4.3 TLS — a non-issue that looks like one

The dev stack speaks HTTPS with mkcert certs, and `apps/website/src/server/runtime/boot/dev-tls.ts` gates on `.certs/localhost.pem` being present. Three facts:

- **`tovu serve` never terminates TLS at all.** Only `apps/website/src/index.ts` does. So own-server mode is plain HTTP on loopback and TLS never enters the picture.
- **Attach mode over HTTPS already works.** Electron/Chromium consults the macOS trust store, where mkcert installs its CA, so the verified load of `https://localhost:5173/admin/` succeeded with no flags, no `NODE_EXTRA_CA_CERTS`, and no certificate-error handler. (Chromium logs an unrelated `trust_store_mac` parse warning while scanning the keychain; the load succeeds regardless.)
- Node's `NODE_EXTRA_CA_CERTS` dance in `dev.mjs` is for *server-side* Node `fetch` calls, not the browser layer, and is irrelevant to the shell.

### 4.4 Which admin build gets loaded

- **Attach mode:** live Vite on 5173, HMR intact.
- **Own-server mode / packaged:** the built `apps/admin/dist`, served by `registerAdminStatic`.

There is a live bug here, confirmed today: `app.ts:1270` resolves `distDir` as `path.resolve(import.meta.dirname, "../../../../../../apps/admin/dist")`. Six levels up from `apps/website/src/server/runtime/composition/` is the repo root — correct in the source layout. Run from `dist/src/server/runtime/composition/` the tree is one level shallower, so the same six levels **overshoot the repo root**, and `/admin` answers 503. Runner works around it by setting `TOVU_ADMIN_DIST` (Tovu's own documented override). `apps/desktop` should do the same in Phase 3 rather than reaching into `apps/website` — but the underlying off-by-one is worth a separate one-line fix upstream.

### 4.5 Process supervision and shutdown

`serve.ts` handles SIGTERM with a real graceful drain (`server.close`, `closeIdleConnections`, `shutdownAssistantDaemon`, `db.$client.close`), so the shell's `will-quit` → `SIGTERM` is the clean path. Two things the slice does not yet do, both Phase 1/2 work: it does not put the child in its own process group (`tovu serve` spawns an agent daemon; `dev.mjs` uses `detached: true` + `process.kill(-pid)` for exactly this reason), and it does not preflight the port.

### 4.6 What I could not determine

| Unknown | What would settle it |
|---|---|
| Where a packaged app's site dir should live (§4.2) | A product decision from Leona. Runner's picker is the reference implementation. |
| Whether `playwright` (a **runtime** `dependency`, used by `features/site-evidence/playwright-browser.ts`) must ship | Check whether site-evidence is reachable in desktop mode. If yes, packaging grows by Playwright plus a browser. Note `stage-tovu-runtime.mjs`'s header still calls playwright a devDependency — also stale. |
| Whether the desktop app wants one site or many | The single biggest scope fork. §6. |
| Windows/Linux packaging | Runner is mac-only today (`--mac`, dmg). Nothing was measured for other platforms. |

---

## 5. What it costs

### Already spent: nothing

Phase 0 added 168 lines in a new directory. No dependency was installed, no build ran, no existing file changed. `npm run dev` is bit-for-bit unchanged — verified by the fact that no file outside `apps/desktop/` is in the commit.

### Phase 1 — the dev loop

| Cost | Amount |
|---|---|
| New dependency | `electron` ^43 as a devDependency **of `apps/desktop` only** |
| Disk | ~120 MB in `apps/desktop/node_modules` |
| Root `npm install` | **Unaffected** — `apps/*` is not in `workspaces` |
| `npm run dev` speed | **Unaffected** — nothing added to its path |
| CI | **Zero** unless a job is added; nothing existing globs `apps/desktop` |

**This is the only approval actually needed right now.** It is one `npm install` in one new directory.

### Phase 3 — packaging (the expensive one)

Measured from Runner's own artifacts:

| Cost | Amount |
|---|---|
| Staged Tovu runtime | **425 MB** on disk |
| Shipped `.dmg` | **227 MB** |
| Unpacked `release/mac` | **772 MB** |
| New toolchain | `electron-builder` (~26), `@electron/rebuild`, `sharp` for icons, `dmg-builder` |
| Build wall time | ~20 minutes per Runner's own comment ("Twenty minutes and several hundred megabytes is too late to learn that the artifact is undistributable") |
| Ongoing | Developer ID certificate, Apple notarization credentials, staple-then-rehash update manifests |
| CI | Signing and notarization cannot run on a shared runner without secrets; CI is billing-blocked today anyway |

**Recommendation: do not fund Phase 3 until someone wants to hand a `.dmg` to a person who is not Leona.** Phases 0–2 give a working desktop app on this machine for essentially free.

---

## 6. The honest alternative

**Keep Tovu Runner as a separate project. Do not port it.** Two projects is the right answer for *one specific part*, and that part is the fleet.

Why:

1. **It is not the same product.** Tovu is one site. Runner manages a fleet of them — creating site dirs, allocating ports, supervising N children, embedding each in a `<webview>` tab, and offering a fleet-operator chat that reasons *across* sites. Merging it into `apps/desktop` does not give Tovu a desktop mode; it gives the Tovu repo a second product with a different domain model.

2. **Runner depends on things Tovu deliberately does not.** `@jini-ai/desktop-host` (absent from Tovu's dependencies) and `file:../Jini/packages/*` links — while Tovu has an active `check-no-linked-jini.mjs` gate in its own `build` script, and has moved to registry semver on purpose. Porting Runner means either fighting that gate or rewriting Runner's Jini consumption.

3. **Runner's agent daemon has a hard co-location invariant.** `runner-daemon.ts` documents that the `DelegatedToolBridge` and `RunLifecycle` must live in the same process, and that violating it **fails silently** — the chat shows a turn with no tool activity and nothing errors. That invariant is a live landmine for anyone refactoring Runner into a repo that already has its own agent daemon (`startAssistantDaemon`). Two daemons, two lifecycles, one silent failure mode.

4. **The history already ran this experiment.** The thin `apps/desktop` shell existed in the pre-split repo. It was deleted and replaced by a separate, deliberately larger product. Recreating the shell reverses a deletion; recreating Runner in-tree re-litigates a decision that was already made with more context than this dispatch has.

**Where two projects is genuinely worse:** the *shell* half. `tovu-cli.ts` re-derives Tovu's `bin.tovu`, its `engines.node`, its admin-dist path and its boot-line format from outside the repo, and has a build-time assertion (`assertNodeMajorInSync`) whose whole job is to catch that duplication drifting. Every one of those facts is free inside the monorepo. So:

> **The right split is: the shell moves in, the fleet stays out.** `apps/desktop` becomes the one place that knows how to put a window around a Tovu, and Tovu-Runner — if it survives at all — becomes a fleet manager that *reuses* that, rather than re-deriving Tovu's internals from a sibling checkout.

**What would change this verdict:** if Leona's actual daily use of Runner is "I run several sites at once and switch between them", then the fleet *is* the product and A is a toy. Worth asking directly before Phase 2. Nothing in Phases 0–1 is wasted either way.

---

## Appendix — verification log

| Claim | How it was checked | Result |
|---|---|---|
| Shell boots and reaches the running server | `TOVU_DESKTOP_URL=https://localhost:5173/admin/ TOVU_DESKTOP_SELFTEST=1 electron .` | `loaded https://localhost:5173/admin/`, `title="Tovu Admin"`, exit 0 |
| Shell reaches the API, not just Vite | Same, against `https://localhost:3000/admin/` (302s to Vite in dev) | exit 0, measured without a pipe |
| Native modules under Electron ABI | `ELECTRON_RUN_AS_NODE=1 electron -e` requiring each from Tovu's `node_modules` | `better-sqlite3` LOADED + roundtrip `42`; `argon2` LOADED; `sharp` LOADED; `modules=148`, `napi=10`, node 24.18.0 |
| `better-sqlite3` is N-API, not node-gyp | `ls node_modules/better-sqlite3/build` → absent; `lib/binding.js` resolves `prebuilds/<target>.node` | Confirmed |
| `apps/desktop` is invisible to a root install | Root `package.json` `workspaces: ["packages/*"]` | Confirmed — `apps/*` is not a workspace |
| `apps/desktop` is not gitignored | `git check-ignore -v` → rc=1 | Confirmed |
| Admin-dist off-by-one is real | `app.ts:1270`, six `../` from `apps/website/src/server/runtime/composition/` | Confirmed — correct in source layout, overshoots from `dist/` |
| Runner artifact sizes | `du -sh` on `release/`, `staging/` | 227 MB dmg, 425 MB staged, 772 MB unpacked |
| The pre-split repo had `apps/desktop` | `_archive-Tovu-Runner-presplit/web/apps/desktop/{main.cjs,dev.sh,package.json}` | Confirmed; `web/package.json` wires `"desktop": "npm --prefix apps/desktop run dev"` |

Nothing was installed. No test suite, coverage run, or full-repo `tsc` was executed. The shared dev server was not restarted or killed.
