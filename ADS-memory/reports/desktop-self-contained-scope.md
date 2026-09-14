# Desktop self-contained packaging — scoping report

- **Author:** DevOps(Subagent)
- **Date:** 2026-09-11
- **Branch:** `restructure/apps-website-phased`
- **Scope:** investigation only. No production file was modified; no build, install, or packager was run.

**Evidence labels used throughout:** `[V]` verified by reading the file or running a read-only
command in this session; `[I]` inferred from verified facts plus a stated rule; `[G]` guess, flagged
for an experiment in §8.

---

## Verification of the dispatching agent's claims

Every claim in the dispatch was re-checked against the files. Result: **7 of 8 confirmed exactly,
1 confirmed with a material correction.**

| # | Claim | Verdict |
|---|---|---|
| 1 | `main.cjs:160` `REPO_ROOT = path.resolve(__dirname, "..", "..")` | **CONFIRMED** `[V]` — verbatim. |
| 2 | Consumed at `:174`, `:185`, `:502`, `:710`, `:870`, `:882`, `:1040` | **CONFIRMED** `[V]` — all seven, and that is the complete set (grep for `REPO_ROOT` in `main.cjs` returns exactly these plus the definition and one doc-comment mention at `:36`). |
| 3 | `tovu-server.cjs:112/147/190` CLI resolution via `tsx` | **CONFIRMED** `[V]` — `resolveCliEntry:112-123`, `resolveDevCliEntry:147-153`, `buildCliSpawnPlan:187-193`. |
| 4 | `tovu-server.cjs:328` resolves `<repoRoot>/apps/admin/dist` | **CONFIRMED** `[V]` — `buildServeEnv`, line 328, guarded by `fs.existsSync` at `:329`. |
| 5 | Child spawned as `process.execPath` + `ELECTRON_RUN_AS_NODE=1` | **CONFIRMED** `[V]` — `buildCliEnv:223` sets the env var; `startTovuServer:486-497` spawns `plan.command` (which is `process.execPath` in both modes, `:190`/`:192`) `detached: true`. |
| 6 | No `app.isPackaged`, no `process.resourcesPath` anywhere in `apps/desktop` | **CONFIRMED** `[V]` — `grep -rn "isPackaged\|resourcesPath\|getAppPath"` over `main.cjs` + all `src/**/*.cjs` returns zero hits. Pattern capability check: the same grep alternation *does* match `__dirname` and `process.cwd` hits in the same files, so the pattern is live, not silently broken. |
| 7 | Root `package.json` declares `better-sqlite3` ^13.0.0 and `sharp` ^0.35.3 | **CONFIRMED** `[V]` — `package.json:110` and `:119`. **Incomplete, though:** `argon2` ^0.44.0 (`:108`) is a third native module and `playwright` ^1.61.1 (`:117`) is a fourth runtime-native concern. See §3. |
| 8 | `main.cjs:135` calls `app.setPath("userData", …)` at module top level | **CONFIRMED with correction** `[V]` — the call is at `:135`, but it is **conditional**, inside `if (process.env.TOVU_DESKTOP_USER_DATA_DIR?.trim())` at `:134`. It is an E2E-only override (documented `:120-133`) and is a no-op in every real launch. It is therefore **not** a packaging problem. Do not carry this one forward as a work item. |

### Two code comments in the tree are FALSE at HEAD

Flagged because both are load-bearing for packaging decisions.

1. **`tovu-server.cjs:174-175`** asserts that `apps/desktop/` "whose own `node_modules` has no `tsx`
   of its own". **False.** `apps/desktop/package.json:28` declares `"tsx": "^4.19.3"` as a
   devDependency and it is installed. Verified by running `node -e "console.log(require.resolve('tsx'))"`
   `[V]`:
   - from `apps/desktop/src/` → `/Users/la/Programming/Tovu/apps/desktop/node_modules/tsx/dist/loader.mjs`
   - from the repo root → `/Users/la/Programming/Tovu/node_modules/tsx/dist/loader.mjs`

   So today's source-mode CLI runs under the **desktop's own** tsx, not the root's. The comment's
   *conclusion* (use an absolute resolved path, not a bare specifier) is still right; its stated
   reason is stale.

2. **`/Users/la/Programming/Tovu-Runner/electron-builder.yml:90-91`** asserts "the better-sqlite3 11
   inside the staged Tovu tree is a node-gyp build for system Node's ABI, and rebuilding THAT for
   Electron would break it." **False as of today.** The staged tree at
   `Tovu-Runner/staging/tovu-runtime/node_modules/better-sqlite3/package.json` reports **13.0.3**,
   carries a flat `prebuilds/` directory and **no `build/` directory at all** `[V]`. This is the
   single most consequential stale premise in the surrounding material — it is the sole justification
   for Runner's ~90-line `resolveNodeBinary()` system-Node probe, and it no longer holds. See §3.

---

## 1. Repo-coupling inventory

Every place `apps/desktop` reaches outside its own directory at runtime. Exhaustive for `main.cjs`
and `src/**/*.cjs` (non-test): derived from `grep -n "path.join\|path.resolve"` over `main.cjs` plus
`grep -rn "REPO_ROOT\|repoRoot\|__dirname\|process.cwd"` over `src/`, then each hit opened. `[V]`

### 1a. Self-relative (inside the app dir) — these survive packaging unchanged

| Site | Path | Packaged resolution |
|---|---|---|
| `main.cjs:142` | `<app>/src/speech/preload-speech.cjs` | fine inside asar |
| `main.cjs:146` | `<app>/dist/renderer/index.html` | fine inside asar (`loadFile` reads asar) `[I]` |
| `main.cjs:153` | `<app>/dist/preload/preload.mjs` | fine inside asar `[I]` |
| `main.cjs:158` | `<app>/src/renderer/public/brand/tovu-app-icon.png` | **needs a `files:` entry.** This is a Vite `publicDir` *source*; `vite.config.mts:18` sets `root: src/renderer`, so the build copies it to `dist/renderer/brand/`. A packager whose allowlist is `dist/**` + `package.json` (Runner's shape) would ship the copy but not the original, and `applyDockIcon()` would silently fall back (`main.cjs:904-911` swallows the error). |
| `speech/mac-on-device-transcriber.cjs:30` | `<app>/src/speech/tovu-speech-helper.swift` | ships fine |
| `speech/mac-on-device-transcriber.cjs:31` | `<app>/src/speech/.build/tovu-speech-helper` | **BREAKS — this is a runtime WRITE into the app bundle.** See 1c. |

### 1b. Repo-root reaches — every one of these must be repointed

| Site | Resolves to today | Must resolve to in a packaged app |
|---|---|---|
| `main.cjs:160` | `<checkout>/` | a payload root under `process.resourcesPath` (e.g. `Resources/tovu/`) |
| `main.cjs:174` `DEV_FALLBACK_SITE_DIR` | `<checkout>/sites/tovu-com` | **nothing.** Must become "absent" cleanly. Already handled defensively: `seedDevFallbackProject` (`project-registry.cjs:267-278`) returns `false` when the dir does not classify as a site, and `resolveSiteDir`'s `devFallbackDir` is documented at `main.cjs:879-881` as "absent in a packaged app". |
| `main.cjs:185` `PROJECT_SCAN_ROOTS` | `[<checkout>/sites]` | a user-writable root (e.g. `~/Documents/Tovu Sites`), or `[]`. `discoverSiteDirs` (`project-registry.cjs:308-321`) wraps `readdirSync` in try/catch and `continue`s, and its own doc at `:300-301` already says "`<repo>/sites` does not exist in a packaged app" — so a missing root is safe, just useless. |
| `main.cjs:502`, `:710`, `:870`, `:882`, `:1040` | pass `REPO_ROOT` down | pass the payload root |
| `tovu-server.cjs:113` | `<repoRoot>/package.json` → reads `bin.tovu` | `<payload>/package.json`. **Note:** `dist/runtime-manifest.json` already exists for exactly this purpose (`emit-dist-package-json.mjs:8-15`) and carries `cliEntry`. Prefer it; the manifest is the designed seam. |
| `tovu-server.cjs:118` | `<repoRoot>/dist/src/cli/main.js` | `<payload>/dist/src/cli/main.js` |
| `tovu-server.cjs:148` | `<repoRoot>/apps/website/src/cli/main.ts` | **must not exist.** Source mode has to be off in a packaged build. |
| `tovu-server.cjs:190` | `require.resolve("tsx")` | **must not be on the packaged path.** |
| `tovu-server.cjs:328` | `<repoRoot>/apps/admin/dist` → `TOVU_ADMIN_DIST` | `<payload>/apps/admin/dist` |
| `project-delete-guard.cjs:149-163` | `repoRoot` is the *containment* guard — nothing under it is erasable | Repointing `REPO_ROOT` silently **changes the delete-safety boundary.** A packaged `repoRoot` of `Resources/tovu/` would make a user's `~/Documents/site` erasable where a checkout's `sites/tovu-com` was not. This is a security-relevant coupling, not a cosmetic one. `[V]` |

### 1c. Bundle-writability breaks

- `speech/mac-on-device-transcriber.cjs:46-59` `ensureHelperCompiled()` runs
  `spawnSync("swiftc", ["-O", sourcePath, "-o", binaryPath])` where `binaryPath` is
  `<app>/src/speech/.build/tovu-speech-helper`, and calls `fs.mkdirSync` on its parent (`:49`). `[V]`
  In a packaged macOS app that directory is inside a code-signed, read-only bundle. Two failures at
  once: the `mkdirSync` fails, **and** a consumer machine has no `swiftc` (Xcode CLT is not a
  consumer install). The module degrades honestly (returns `{ok: false, error: "swiftc-not-found"}`)
  rather than crashing, so **speech silently becomes unavailable in every packaged build**. The fix
  is to precompile the helper and ship the signed binary, not to keep the lazy compile.

### 1d. Env-var surface (complete, non-test)

`grep -rhno "process\.env\.[A-Z_0-9]*"` over `main.cjs`, `src/*.cjs`, `src/speech/*.cjs` `[V]`:
`TOVU_DESKTOP_CLI_MODE`, `TOVU_DESKTOP_PORT`, `TOVU_DESKTOP_SELFTEST`, `TOVU_DESKTOP_SITE_DIR`,
`TOVU_DESKTOP_SITE_DIRS`, `TOVU_DESKTOP_UI`, `TOVU_DESKTOP_URL`, `TOVU_DESKTOP_USER_DATA_DIR`.

None is required for a consumer launch. Default boot is the fleet Projects screen —
`fleetUiRequested()` (`main.cjs:203-210`) returns `true` when none of `TOVU_DESKTOP_UI`,
`TOVU_DESKTOP_URL`, `TOVU_DESKTOP_SITE_DIR(S)` is set. `[V]` That is the right default for a
packaged app.

**One default is wrong for packaging:** `resolveCliMode()` (`main.cjs:247-249`) returns `"source"`
unless `TOVU_DESKTOP_CLI_MODE === "compiled"`. A packaged app must default to `"compiled"`.

### 1e. Coupling the desktop app does NOT have (good news)

- `apps/desktop` is **not** a root workspace (`package.json:8-10` lists only `packages/*`), has its
  own `package-lock.json`, and its `node_modules/@jini-ai/*` are **real directories, not symlinks**
  `[V]`. The desktop shell itself is cleanly installable from the registry. Only the *root* Tovu
  install is Jini-linked (§4).
- `apps/website`'s own asset resolution is **already packaging-correct**.
  `resolveProductRoot()` (`apps/website/src/platform/site-dir/product-root.ts:36-51`) walks up from
  `import.meta.dirname` looking for a directory with both `package.json` and `content/` — it is not
  cwd-relative and not a fixed `../` count. All five consumers
  (`init-site.ts:59`, `read-template.ts:39`, `deps.ts:296/334/350/368`, `fs-files/layout.ts:148`)
  inherit that. `[V]` This is the single largest thing that does *not* need work.

---

## 2. Runtime payload

### What must ship

| Component | Source | Size |
|---|---|---|
| Compiled server + CLI + copied `content/` | `<repo>/dist` (built by root `npm run build`) | **33 MB** `[V]` |
| Admin SPA | `<repo>/apps/admin/dist` | **7.4 MB** `[V]` |
| Site-chat SPA | `<repo>/apps/site-chat/dist` | **1.0 MB** `[V]` |
| Production `node_modules` closure | `npm ls --omit=dev --all` = **2,497 packages** `[V]` | ~150 MB measured locally, **384 MB** in a real materialized stage (below) |
| Electron runtime | `apps/desktop/node_modules/electron/dist` | **303 MB** (Electron 43.6.0) `[V]` |

DB migrations are **inside** `dist/`: the root build script copies
`apps/website/src/platform/db/drizzle/` (9.1 MB, 63 `.sql`) and
`drizzle-database-journal/` into `dist/src/platform/db/`. Stock themes (5.2 MB), templates (52 KB),
agent-plugins (236 KB) and public assets (120 KB) are copied from `content/` into `dist/content/`.
`content/brand` (7.8 MB) is **not** copied and has no `apps/website` runtime consumer. `[V]`
`content/seed-sites` does not exist in the tree at all — it is fabricated by the Dockerfile
(`Dockerfile:92-100`) for the self-hosted image only, and is **not** needed by the desktop app. `[V]`

### Size estimate — derived from a real, already-built precedent, not modelled

`Tovu-Runner` has already solved this exact problem and its artifacts are on disk. Measured with
`du -sh` this session `[V]`:

```
staging/tovu-runtime            425 MB   (the staged Tovu payload)
  ├─ node_modules               384 MB
  ├─ dist                        33 MB
  └─ apps (admin/dist)          7.4 MB
release/mac/Tovu Runner.app     772 MB   (staged payload + Electron + Chromium)
release/Tovu Runner-0.1.0.dmg   238 MB   (compressed download)
```

**Estimate for a packaged Tovu desktop app: ~750–850 MB installed, ~240–280 MB download.**

Derivation: Runner's `.app` is the same shape (Electron 43 shell + the identical staged Tovu runtime
payload). Tovu desktop adds its own renderer bundle (small) and would ship `apps/site-chat/dist`
(1 MB) which Runner omits. Two offsets in the other direction, each worth naming:

- `playwright` is a **production** dependency (`package.json:117`, 12 MB driver in the local tree).
  The browser binary is a separate ~150 MB download the Dockerfile handles with its own layer
  (`Dockerfile:152-159`) and which a desktop build should simply **not** ship — the one tool that
  needs it (`site_collect_page_evidence`) already degrades to `{available: false, reason}`. `[V]`
- Runner's config already strips 132 MB of Bun runtimes and the `@rollup/*` natives that leak in
  through the Jini pnpm store (`electron-builder.yml:17-34`). Any Tovu build that stages through a
  linked Jini checkout inherits the same leak. `[V]`

The 150 MB local `npm ls --omit=dev` sum vs. the 384 MB materialized stage is **not** a
contradiction: locally the 13 `@jini-ai/*` entries are symlinks and `du` reports ~0 for them, and
their transitive deps live in Jini's own pnpm store and are never walked. The real Jini `dist/`
payload is ~58 MB across those 13 packages `[V]`, plus their transitives. **Trust the 384 MB
measured number, not the 150 MB local sum.**

---

## 3. Native modules

### Traced, not assumed

The desktop app never imports these. It spawns `tovu serve` as a child (`tovu-server.cjs:486`), and
that child is the compiled `apps/website` server, whose production closure contains them. Traced:
root `package.json` `dependencies` → `npm ls --omit=dev --all` (2,497 packages) → present. `[V]`

### The ABI story has changed, and it changes the whole plan

| Module | Version | Loader | ABI |
|---|---|---|---|
| `better-sqlite3` | **13.0.3** | `lib/binding.js:41-50` → flat `prebuilds/<platform>-<arch>.node` | **Node-API.** `nm -gU prebuilds/darwin-arm64.node` exports `_node_api_module_get_api_version_v1` `[V]`. `package.json` has `"gypfile": false` and there is **no `build/` directory** `[V]`. |
| `argon2` | 0.44.0 | `argon2.cjs:4` → `node-gyp-build` → `prebuilds/<platform>-<arch>/*.node` | prebuildify layout, N-API `[I]` — same family, not symbol-checked this session. |
| `sharp` | 0.35.3 | `dist/sharp.cjs:40-83` → `require("@img/sharp-<platform>-<arch>/sharp.node")` | N-API via per-platform optional deps `[V]` |
| `playwright` | 1.61.1 | driver only; browser is a separate download | not an ABI concern; **exclude** `[V]` |

**Consequence:** `npmRebuild: false` / no `@electron/rebuild` step is correct. Node-API binaries load
unmodified under Electron. The `tovu-server.cjs:241-250` comment asserting this was verified
structurally this session and **holds**; the contradicting `Tovu-Runner/electron-builder.yml:86-92`
comment does **not**. The entire "hunt for a system Node" design is obsolete.

### asar

Native `.node` files cannot be `dlopen`'d from inside an asar archive. `asarUnpack: ["**/*.node"]`
is required — Runner does exactly this (`electron-builder.yml:83-84`) `[V]`. Note that Runner goes
further and puts the **whole** staged Tovu tree outside asar via `extraResources`
(`electron-builder.yml:52-80`), on the stated grounds that "a child `node` process cannot read an
asar archive." That reasoning is **partly stale for us**: our child is Electron-run-as-node, which
*does* carry Electron's asar patching `[G — needs the §8 experiment]`. But `extraResources` is still
the right call for a different reason: 384 MB of node_modules in an asar buys nothing and makes
`asarUnpack` patterns the only thing between you and a broken `dlopen`.

### Per-platform matrix — this is where the cost lives

The current local install is **x64-only**: `node -p process.arch` reports `x64` `[V]`, and
`node_modules/@img` contains **only** `sharp-darwin-x64` and `sharp-libvips-darwin-x64` — no arm64
`[V]`. The already-staged Runner tree has the same x64-only `@img` `[V]`.

So today's tree **cannot** produce an Apple Silicon build. `better-sqlite3` and `argon2` ship all
architectures in one package and are fine; **`sharp` is the one that forces a per-platform install**,
because its binaries arrive as `optionalDependencies` resolved against the *installing* machine's
platform and arch.

Matrix implication: each target (mac-arm64, mac-x64, win-x64, linux-x64) needs its own
`npm install` of the production closure — either on a matching runner or with
`--os/--cpu/--libc` overrides — before staging. `[I]` That is a CI-shape decision, not a packager
decision, and it is identical for electron-builder and Forge.

---

## 4. The `tsx` / TypeScript question — **this is the largest hidden cost**

### A packaged app must run compiled JS. Three independent reasons.

1. `resolveDevCliEntry` (`tovu-server.cjs:147-153`) points at `apps/website/src/cli/main.ts`, which
   a packaged app does not ship. `[V]`
2. `buildCliSpawnPlan` source mode (`:190`) injects `require.resolve("tsx")`. `[V]`
3. **The one the dispatch did not know about.** The agent daemon is a *grandchild*, and in source
   mode it is spawned through the shell, not through `process.execPath`:

   ```
   apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts:456-462
     const isCompiled = daemonPath.endsWith(".js");
     const child = isCompiled
       ? spawn(process.execPath, args, {...})
       : spawn("npx", ["tsx", ...args], {...});
   ```
   `[V]` — and `resolveDaemonScriptPath():349-355` picks `.ts` vs `.js` from
   `import.meta.filename`, so **source mode ⇒ literal `npx`**, resolved off `PATH`.

   `main.cjs:247-249` makes `"source"` the **default** CLI mode. So the desktop app as it stands
   today requires a system Node **with `npx` on PATH** for the assistant to come up at all. This
   directly contradicts `tovu-server.cjs:246-248`'s claim that the shell "drop[s] the probe entirely
   and stop[s] depending on a Node install it does not ship" — true for the `tovu serve` child,
   **false for the daemon grandchild**. Compiled mode fixes it (`:461` uses `process.execPath`, which
   inherits `ELECTRON_RUN_AS_NODE=1` through `{...process.env}` at `:457`).

### Does a compiled build exist, and does it produce cleanly?

**It exists and it is badly stale. It also cannot currently be rebuilt.** `[V]`

- `dist/` is dated **2026-08-28**; `dist/runtime-manifest.json` names sha `24e558d9`.
- `dist/src/platform/db/drizzle/` has **51** `.sql` migrations; source has **63**. Twelve behind.
  That is the `SITE_NEWER_THAN_RUNTIME` failure `tovu-server.cjs:126-141` documents as the reason
  source mode was introduced in the first place.
- Root `npm run build` starts with `node development/scripts/check-no-linked-jini.mjs`
  (`package.json:26`), which `process.exit(1)`s when any `@jini-ai/*` in `node_modules` is a symlink
  (`check-no-linked-jini.mjs:57-67`). **All 13 are symlinks** into
  `/Users/la/Programming/Jini/packages/*` `[V]`. So the build is **blocked today** until
  `npm run unlink:jini` runs.
- `npm run build` compiles the **server only**. `apps/admin` has a separate install+build
  (`package.json:70-73`). A checkout that "builds cleanly" can still have no admin shell — Runner's
  staging script hard-fails on exactly this (`stage-tovu-runtime.mjs:320-326`). `[V]`

**Cost framing:** the compiled path is not new work — the build script, `runtime-manifest.json`, the
`dist/package.json` `#src/*` re-scoping (`emit-dist-package-json.mjs`), and a working staging script
all already exist. The cost is **operational**: a release now requires an unlinked, registry-resolved
Jini install, and every desktop release is gated on Jini having published the matching versions.
That is a release-process constraint, and it is the real hidden cost — larger than any code change
in this report.

---

## 5. Multi-instance / supervisor assumptions

Reviewed `site-supervisor.cjs`, `site-registry.cjs`, `project-registry.cjs`, `project-ipc.cjs`,
`site-dir-store.cjs`, `project-delete-guard.cjs`.

**Already correct for a packaged app:**
- All three registries live in `app.getPath("userData")`, not in the repo:
  `site-dir-store.cjs:49-51` (MRU), `site-registry.cjs:56-58` (crash-safety rows),
  `project-registry.cjs:44-46` (tracked projects). `[V]`
- Site processes are per-site with self-allocated ports (`main.cjs:887-889`), so multi-instance is
  already the design. `[V]`
- Zero-sites first run does not crash: `discoverSiteDirs` swallows a missing scan root
  (`project-registry.cjs:310-316`), `seedDevFallbackProject` declines a non-site
  (`:267-278`), and `classifySiteDirSafely` is used on both boot paths precisely so an unreadable
  candidate cannot quit the app before a window exists (`main.cjs:1023-1028`). `[V]`

**Breaks or degrades:**
1. **Empty Projects screen on first launch.** With `PROJECT_SCAN_ROOTS` pointing at a non-existent
   `<payload>/sites` and no dev fallback, a fresh install shows only the "Add project" card. Working
   as coded, but it is the entire first-run experience. Needs a real default site root under
   `~/Documents` (or `app.getPath("documents")`) and probably a first-run "create your first site".
2. **The delete guard's containment boundary moves with `REPO_ROOT`** —
   `project-delete-guard.cjs:161-163`: `mayEraseProjectDirectory` returns
   `!isInsideDirectory(row.siteDir, options.repoRoot)`. Repointing `REPO_ROOT` at the read-only
   payload means user sites under `~/Documents` become erasable. Whether that is right or wrong is a
   product decision, but it **must be made deliberately**, because it changes today's behavior
   silently. `[V]`
3. **Bundle writability** — the speech helper's `.build/` (§1c). The only write-into-the-bundle path
   found.
4. **`TOVU_SITE_CHAT_DIST` is never set.** `buildServeEnv` sets `TOVU_ADMIN_DIST` (`:328-331`) and
   nothing else; `app.ts:1340`'s fallback overshoots from `dist/` exactly as `:1316`'s does for the
   admin (the Dockerfile sets **both**, `Dockerfile:170-171`). So site-chat 503s in any
   compiled-mode desktop run — today's `TOVU_DESKTOP_CLI_MODE=compiled` included. `[V]`
5. **Sandbox/permission prompts.** Sites in `~/Documents` trigger macOS TCC consent on first read.
   A user who declines gets `EPERM` through `classifySiteDirSafely` → "unreadable", which the error
   text (`main.cjs:275`) reports as "check its permissions" — honest but not actionable. `[I]`

---

## 6. Work items, ordered and sized

Sized from call sites and blast radius.

| # | Work item | Size | Blocks / notes |
|---|---|---|---|
| 1 | **Unlink Jini and prove a clean registry-resolved `npm run build` + `admin:build`.** | **M** | Blocks *everything*. Not a code change — a release-process change. Gating risk: requires published `@jini-ai/*` versions matching HEAD. |
| 2 | **Introduce a payload-root resolver** (`app.isPackaged ? path.join(process.resourcesPath, "tovu") : REPO_ROOT`) and thread it through the 7 `REPO_ROOT` consumers. | **S–M** | 7 call sites, all in `main.cjs`; the downstream modules already take `repoRoot` as a parameter, so blast radius is one file. Prefer reading `dist/runtime-manifest.json`'s `cliEntry` over `bin.tovu` at `tovu-server.cjs:113`. |
| 3 | **Default `resolveCliMode()` to `"compiled"` when packaged.** | **S** | One function (`main.cjs:247-249`). Unblocks #4 and removes the `npx`/`tsx` dependency. Must land *with* #1, not before. |
| 4 | **Set `TOVU_SITE_CHAT_DIST` alongside `TOVU_ADMIN_DIST` in `buildServeEnv`.** | **S** | One block (`tovu-server.cjs:328-331`). Fixes a bug that exists *today* in compiled mode, independent of packaging. |
| 5 | **Port the staging script** from `Tovu-Runner/development/scripts/stage-tovu-runtime.mjs`. | **M** | ~390 lines of already-debugged logic, including `materializeSymlinks` (codesign rejects absolute symlinks in a bundle, `:201-232`) and `assertClosureComplete` (`:255-282`). Mostly adoption, not authoring. Must drop `playwright` and add `apps/site-chat/dist`. |
| 6 | **Real default site root + first-run flow** (`~/Documents/Tovu Sites`), replacing `PROJECT_SCAN_ROOTS` and `DEV_FALLBACK_SITE_DIR`. | **M** | Product decision, not just plumbing. Blocks a usable first launch. |
| 7 | **Decide the delete-guard containment boundary** for packaged mode. | **S** (code) / **M** (decision) | `project-delete-guard.cjs:161-163`. Security-relevant; needs an explicit ruling and a test. |
| 8 | **Precompile + sign the Swift speech helper**, drop the runtime `swiftc`. | **M** | `mac-on-device-transcriber.cjs:46-59`. macOS-only; feature degrades honestly if deferred, so this can ship in v2. |
| 9 | **Per-platform production installs** (sharp's `@img/*`). | **M** | CI shape. Blocks any non-x64-mac artifact. Identical work under either packager. |
| 10 | **Signing + notarization + entitlements.** | **M** | Runner's `build/entitlements.mac.plist` (`allow-jit` only) and its `dmg.sign: true` finding (`electron-builder.yml:125-132`) are directly reusable. Needs an Apple Developer ID. |
| 11 | **Auto-update.** | **M** | See §7. |
| 12 | **Ship `src/renderer/public/brand/` or repoint `APP_ICON_PATH`.** | **XS** | `main.cjs:158`. |

**Total: roughly 2 L-equivalents of work**, dominated by #1 (release process) and #5+#9 (staging and
platform matrix). The Electron-shell code changes themselves (#2, #3, #4, #12) are collectively
**S–M** — the shell was written with this in mind; `main.cjs:879-881`, `:1016-1017` and
`project-registry.cjs:300-301` all already say "absent in a packaged app" in their own docs.

---

## 7. Packager-discriminating requirements

**No recommendation made,** per directive. These are the requirements from above that actually
differ between the two.

| Requirement | electron-builder | Electron Forge | Discriminating? |
|---|---|---|---|
| Native rebuild | `npmRebuild: false`, one line | `@electron-forge/plugin-auto-unpack-natives` | **No.** Everything is Node-API (§3); neither tool needs to rebuild anything. This requirement is *dead*, and it was the loudest one in the prior material. |
| Ship a 384 MB tree outside asar | `extraResources: [{from, to, filter}]` | `packagerConfig.extraResource` — an **array of paths, no from/to remap and no filter** | **YES.** Forge's `extraResource` cannot rename `staging/tovu-runtime/dist` → `Resources/tovu/dist`, and has no per-entry ignore. Under Forge the staging script must lay the tree out at its final shape and the `@oven`/`@rollup` exclusions move into the staging script. `[I]` |
| asar + unpack natives | `asar: true` + `asarUnpack: ["**/*.node"]` | `packagerConfig.asar.unpack` or the auto-unpack-natives plugin | No. |
| macOS sign + notarize | `mac.notarize` unset ⇒ notarize only when credentials are present; `entitlements`/`entitlementsInherit` | `@electron/osx-sign` + `@electron/notarize` configured directly | No — same underlying libraries. |
| **DMG signing** | `dmg.sign: true` **must be literally `true`** or the image ships unsigned and Gatekeeper refuses it before examining contents (`electron-builder.yml:125-132` — this was a real, shipped bug) | Forge's default macOS maker is **ZIP**; DMG via `@electron-forge/maker-dmg`, which wraps `appdmg` and does **not** sign the image | **YES**, and it favors electron-builder — this specific trap is already solved there, with the fix recorded. |
| Auto-update on a **public** repo | `electron-updater` + `publish: github`; generates `latest-mac.yml` (already present in Runner's `release/`) | **`update.electronjs.org` is free for public repos** — `leonaburime-ucla/Tovu` qualifies. `update-electron-app` is ~3 lines, no server, no metadata files. | **YES — the sharpest discriminator.** Forge's free hosted updater is a genuine cost difference. Caveat: `update.electronjs.org` serves macOS/Windows only (no Linux) and **requires a code-signed app** — it is not a way to skip #10. `[I]` |
| Reuse of existing, debugged config | `Tovu-Runner/electron-builder.yml` is a working, signed, notarized, 134-line config with every trap already annotated | nothing to reuse | **YES**, favors electron-builder. |

**Net:** the two genuinely discriminating requirements point in **opposite** directions — Forge wins
on free auto-update for a public repo; electron-builder wins on `extraResources` remapping, DMG
signing, and ~134 lines of already-paid-for debugging. The decision should be made on which of those
two you would rather own.

---

## 8. Unknowns and risks

| # | Unknown | Cheapest experiment |
|---|---|---|
| U1 | Does `require()` of a module inside `app.asar` work in a child spawned with `ELECTRON_RUN_AS_NODE=1`? Runner assumed **no** (`electron-builder.yml:49-51`) and put everything in `extraResources`. If **yes**, the payload could be asar'd (smaller, faster install) with only natives unpacked. `[G]` | Package a throwaway Electron app with one JS file in asar; spawn `process.execPath` with `ELECTRON_RUN_AS_NODE=1` against a path inside `app.asar`; observe. ~30 min. |
| U2 | Does root `npm run build` actually succeed against a registry-resolved (unlinked) Jini? The tree has been linked since 2026-09-01 and `dist/` is from 2026-08-28 — **nothing has proven this build works in ~2 weeks.** This is the #1 schedule risk. | `npm run unlink:jini && npm run build && npm run admin:install && npm run admin:build` on a scratch clone. **Not run here** per the read-only directive. |
| U3 | Real production-closure size for an **arm64** install (the only measured numbers are x64). | `npm install --os=darwin --cpu=arm64 --omit=dev` into a scratch dir; `du -sh`. |
| U4 | Does `argon2`'s prebuild actually load under Electron 43? Inferred from the prebuildify layout, **not** symbol-verified (unlike `better-sqlite3`). | `nm -gU node_modules/argon2/prebuilds/darwin-x64/argon2.glibc.node \| grep node_api`, or just `require` it under `electron --run-as-node`. ~5 min. |
| U5 | Does `tovu serve` reach a working `/admin` end-to-end in **compiled** mode today? Item #4 (`TOVU_SITE_CHAT_DIST`) says site-chat does not; admin is believed to. Untested this session. | Launch with `TOVU_DESKTOP_CLI_MODE=compiled` and hit `/admin` and the chat surface. Blocked on U2 (stale `dist/` would fail `SITE_NEWER_THAN_RUNTIME` first). |
| U6 | Windows and Linux have **never** been exercised — Runner's config is `mac:`-only. Process-group kill (`tovu-server.cjs:374` `process.kill(-pid, "SIGKILL")`) has no Windows equivalent. | Deferred; scope v1 to macOS. |
| U7 | Whether shipping `playwright`'s driver without a browser produces a clean degrade rather than a boot error in the packaged server. | Unset `PLAYWRIGHT_BROWSERS_PATH`, boot compiled mode, call `site_collect_page_evidence`, confirm `{available:false}`. |

### Top risks, ranked

1. **U2 — the compiled build is unproven and currently blocked.** Everything else is downstream of
   it, and it is a release-*process* problem (Jini publishing cadence), not a code problem, so it
   cannot be fixed by working harder in this repo.
2. **Per-platform `sharp` (§3) + the x64-only tree.** No Apple Silicon artifact is producible from
   the current install. On a 2026 consumer Mac, arm64 is the *primary* target.
3. **Payload size.** ~772 MB installed / ~238 MB download, measured from a real artifact. That is a
   product/marketing problem as much as a technical one, and the two obvious diets (drop
   `playwright`'s driver, asar the payload if U1 allows) are worth maybe 40 MB combined.

### Explicitly de-risked by this investigation

- Native-module ABI is a **non-issue** (§3). The loudest concern in the prior material is dead.
- `apps/website`'s asset resolution is **already** packaging-correct (§1e).
- The desktop shell's own dependency tree is clean (registry installs, not symlinks) (§1e).
- A complete, debugged staging script already exists and is ~90% reusable (§6 item 5).
