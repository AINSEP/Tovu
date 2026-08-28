# Implementation Outline — Tovu as a self-updating desktop app

- Author: Software Architect (DevOps skills loaded)
- Date: 2026-08-26
- Supersedes the premise of, but does **not** replace, `implementation-outline.md` in this folder (kept as the npm analysis)
- Premise, per the owner: **a desktop app downloaded from tovu.dev that self-updates.** Not `npm i -g tovu`.

**Evidence rule:** every claim cites a file path and what was seen in it. Anything I did not personally verify is marked **UNVERIFIED**.

---

## §0 — The finding that reframes this entire document

**The desktop app already exists, is already Electron, and already solves the `file:` dependency problem. It is a separate repo: `/Users/la/Programming/Tovu-Runner`.**

This was not in the brief and I nearly missed it. Verified:

- `Tovu-Runner/electron-builder.yml` — `appId: ai.jini.tovu-runner`, `productName: Tovu Runner`, `directories.output: release`.
- `Tovu-Runner/package.json` — `electron ^43.2.0`, `electron-builder ^26.15.3`, `@electron/rebuild ^4.2.0`, and a `package` script: `npm run build && npm run stage:tovu && electron-builder --dir`.
- `Tovu-Runner/release/mac/` exists on disk, dated 2026-08-24 — **someone has already produced a mac build.**
- `@jini-ai/desktop-host@0.1.2` (published on npm) provides shell-agnostic ports with **both** `./electron` and `./tauri` assemblies, plus `paths.ts`, `sidecar.ts`, `single-instance.ts`, `protocol.ts`, `window-lifecycle.ts` — each with its own test file.

And this is governing architecture, not an experiment. `Tovu/START-HERE.md:6-11`:

> **Tovu = the website product** [...] It is **not** the desktop host (that's the sibling **`Tovu-Runner`** repo, which owns multi-site management, media/video generation, agent detection, and the operator chat). The dependency arrow only ever points **Runner → Tovu, never reverse** (ADR-011).

And `development/tovu-v2-design.md:214`:

> The desktop multi-site manager is **resolved, not deferred**: open-design's Electron app is the host and Tovu does not build its own — see ADR-011.

**So the correct framing of the owner's request is not "build a desktop app for Tovu." It is "finish and ship Tovu Runner, which is the desktop app, and give it an updater."** That is a much smaller ask than the brief implies — and it means most of §1's "what dies" is good news.

Two flags on the surrounding docs, so nobody is misled by them:
- `START-HERE.md:14-15` says *"Status: greenfield. Docs + the full ADR corpus are here; there is no code yet."* That is **badly stale** — Tovu has 50 migrations and a large codebase. The ADR corpus it points at is still governing; the status line is not.
- The product is branded **"Tovu Runner"** with appId `ai.jini.tovu-runner`. "Download Tovu from tovu.dev" and "download Tovu Runner" are the same artifact. That is a naming decision for the owner (§8 D-5), not an architecture conflict.

---

## §1 — What survives from the npm analysis, and what dies

The team lead's specific hypothesis was that BLOCKER-3 evaporates and D-2 stops being a prerequisite. **Confirmed, and with stronger evidence than expected.**

| Finding from the npm outline | Status here | Why |
|---|---|---|
| **BLOCKER-3** — `file:` deps make the artifact uninstallable elsewhere | **DEAD. Fully.** | `electron-builder.yml`'s `extraResources` ships `staging/tovu-runtime/dist` → `tovu/dist` and `staging/tovu-runtime/node_modules` → `tovu/node_modules`, assembled by `Tovu-Runner/development/scripts/stage-tovu-runtime.mjs`. **It bundles resolved `node_modules`, not a manifest.** No consumer ever resolves a `file:` specifier, because no consumer ever runs `npm install`. |
| **D-2** — publish the 8 missing `@jini-ai/*` packages | **NO LONGER A PREREQUISITE.** | Direct consequence of the above. The 8 unpublished packages get bundled as real files. Publishing them becomes optional hygiene, not a release gate. **This is the single biggest cost removed by the premise change.** |
| **RISK-4** — 288 MB npm publish leaking `ADS-memory/` + the `.claude/` worktree | **DEAD.** | Nothing is published to npm. `electron-builder.yml`'s `files:` allowlist is `dist/**` + `package.json` only. |
| **BLOCKER-1** — admin SPA not placed where the server looks | **SURVIVES, AND GETS WORSE.** | See §6. In a desktop app the SPA *is* the entire visible product; a 503 at `/admin` means a blank window. |
| **RISK-2** — themes destroyed on upgrade | **SURVIVES, AND GETS MUCH WORSE.** | See §4. A silent auto-update has no `npm` command for the user to hesitate over. |
| **RISK-1** — irreversible migration, no automatic restore point | **SURVIVES UNCHANGED.** | `openContentDb` (`Tovu/src/db/sqlite/content-db.ts:85`) migrates on every open regardless of who launched it. 50 migrations, zero down migrations. |
| **RISK-3** — plugins/exports follow `process.cwd()` | **SURVIVES, changes shape.** | Under Electron, `cwd` is whatever the OS hands the app — even less predictable than a shell. |
| §5's SemVer + manual release flow | **Mostly survives**, retargeted at Runner's `package.json` (currently `version: 0.0.0`, `private: true`) rather than Tovu's. |
| §2.3's build-chain fix (copy SPA into `dist/`) | **Survives and becomes more urgent.** | The staging script copies `Tovu/dist`; if the SPA is not in `dist/`, it never reaches the app bundle. |

**Net: the premise change removes the single hardest prerequisite (8 npm publishes with an unverified build) and removes an irreversible-disclosure risk. It adds code signing, which is worse. See §5.**

---

## §2 — Electron vs. Tauri

**Recommendation: Electron. This is already decided, already built, and re-litigating it would be a self-inflicted wound.**

`Tovu-Runner/package.json` depends on `electron ^43.2.0` and `electron-builder ^26.15.3`, has an `electron-rebuild -f -w better-sqlite3` postinstall, and has produced a build in `release/mac/`. The decision is made and executed.

But the brief asked me to judge both against the Node-runtime facts, so here is the judgement on the merits — because it turns out **the usual Electron-vs-Tauri argument does not apply to this architecture at all.**

### 2.1 The decisive fact: Runner does not run Tovu in-process

`Tovu-Runner/src/main/tovu-cli.ts:200`:
```ts
const child = spawn(resolveNodeBinary(), [cliEntryPath, ...args], { env });
```

Runner **shells out to Tovu's CLI as a child process**. `electron-builder.yml`'s own comment says so explicitly, and explains why the staged tree lands outside `app.asar`:

> Runner shells out to Tovu's CLI as a child process rather than importing it [...] It lands OUTSIDE app.asar because a child `node` process cannot read an asar archive, and because the tree carries native .node addons (better-sqlite3, sharp, argon2) that must be real files on disk to dlopen.

This resolves both facts the brief raised:

- **`spawn` is not a blocker here — it is the architecture.** The prior Docker `spawn` concern does not transfer. Electron's main process spawns a child freely.
- **`engines: node >= 24` is not satisfied by Electron's bundled Node**, and does not need to be. Electron 43's own Node version is irrelevant, because Tovu never runs inside Electron. (Electron 43's exact bundled Node version: **UNVERIFIED** — and immaterial for the same reason.)

So the standard argument for Tauri — "you don't need a Node runtime" — is **inverted here**: Tovu is a Node server, needs a real Node, and gets one either way. Tauri would ship a smaller shell and then still have to solve the identical Node-sidecar problem. `@jini-ai/desktop-host` even has a `tauri-sidecar.ts` acknowledging exactly that.

### 2.2 The Tauri arm is real but deliberately incomplete

`Jini/packages/desktop-host/src/tauri/` has 9 files. But `tauri/not-implemented.ts` says:

> Shared marker error for the Tauri adapter's explicitly-out-of-scope port methods (RenderService, ProtocolHandlerPort — see each file's header comment for why).

`RenderService` and `ProtocolHandlerPort` are unimplemented **by design**. Those are how the app renders content and handles custom URL schemes — not optional for this product. Choosing Tauri means finishing them plus adopting a Rust toolchain plus redoing signing.

### 2.3 Verdict

| | Electron | Tauri |
|---|---|---|
| Already built for this product | **Yes** — Electron 43, a build exists | Ports exist; 2 key ones throw `NotImplementedError` |
| Handles the Node-sidecar requirement | Yes, via `spawn` | Would also need a sidecar — no advantage |
| `better-sqlite3` / `sharp` / `argon2` native addons | Solved (`asarUnpack`, `electron-rebuild`) | Would need re-solving |
| Bundle size | Larger (Chromium) | Smaller shell, same Node payload — **the saving is small because the Tovu runtime tree dominates** |
| Toolchain | Node only | Adds Rust |

**Electron. Decisively. The only reason to revisit is bundle size, and the staged Tovu runtime tree — not Chromium — is the bulk of the download.** (Exact staged tree size: **UNVERIFIED**, I did not run `stage:tovu`.)

---

## §3 — The self-update mechanism

### 3.1 Current state: **there is none, and there is not even a downloadable artifact**

Two verified gaps, and the second is more basic than the first.

**No updater is wired.** Grepping `Tovu-Runner/src/` and `package.json` for `autoUpdate`, `electron-updater`, `checkForUpdates`, and `Squirrel` returns **nothing**. `electron-updater` is not a dependency.

**No distributable is produced.** `electron-builder.yml`:
```yaml
mac:
  target:
    - dir
```
and `package.json`'s script is `electron-builder --dir`. The `dir` target emits an **unpacked `.app` directory** — a local development artifact. It produces no `.dmg`, no `.zip`, no installer, and nothing that can be put behind a download link. That is consistent with `release/` containing only `builder-debug.yml` and a `mac/` folder.

So today Runner is a thing you can build and run locally. It is not a thing anyone can download.

### 3.2 Recommendation: `electron-updater` against GitHub Releases

**Mechanism: `electron-updater` (part of the electron-builder family already in use).** It is the path of least resistance — same toolchain, same config file, and `electron-builder` already generates the `latest-mac.yml` metadata that `electron-updater` consumes.

**Host: GitHub Releases, with tovu.dev as a redirect.** Rationale:
- `electron-builder` has first-class GitHub publishing (`publish: github`), so the release artifact and its update metadata are produced and uploaded by the same command that builds.
- It is free, versioned, and gives immutable artifact URLs.
- tovu.dev then only needs a "Download" button pointing at the latest release asset — a static link, not infrastructure.
- A static bucket (S3/R2, `publish: generic`) is the alternative and is equally supported. Prefer it only if the owner wants download analytics or dislikes exposing a GitHub repo. It costs a bucket, a CDN, and hand-managed metadata uploads.

### 3.3 What "download the updated version" actually does on disk (macOS)

This is what the owner is really asking, so concretely:

1. On launch (or on a timer), the app fetches `latest-mac.yml` from the update host and compares its `version` to the running app's.
2. If newer, it downloads the update **`.zip`** in the background to `~/Library/Application Support/Caches/ai.jini.tovu-runner-updater/` (path pattern from electron-updater's conventions — **UNVERIFIED** exact string).
3. It verifies the signature. On macOS this is **Squirrel.Mac**, which **refuses to apply an update whose code signature does not match the running app's**.
4. On quit-and-relaunch, Squirrel swaps the entire `Tovu Runner.app` bundle in `/Applications` for the new one.

**Step 4 is the one that matters for §4: the whole `.app` bundle is replaced.** Anything living inside it is gone. That includes `Contents/Resources/tovu/` — the staged Tovu runtime, which is where `dist/src/themes/` lives.

**Step 3 is the one that matters for §5: on macOS, auto-update requires code signing.** Not for Gatekeeper's sake — for the updater's own sake. An unsigned app cannot self-update on macOS at all. This makes signing a hard dependency of the requested feature, not a polish item.

Two consequences worth stating plainly:
- `mac.target` must change from `dir` to at least `["dmg", "zip"]`. **`zip` is the one electron-updater needs**; `dmg` is what humans expect to download. Ship both.
- `Tovu-Runner/package.json` is `version: 0.0.0`. The updater compares versions; `0.0.0` must become a real starting version before any of this means anything.

---

## §4 — RISK-2 under a desktop auto-update: **worse, and now silent**

### 4.1 Why it degrades

The npm version of this risk at least had a user typing `npm i -g tovu@latest` — a deliberate act, at a moment of attention. **A desktop auto-update happens in the background and applies on relaunch.** The user's themes are destroyed by an event they did not initiate and were not present for.

The mechanism is unchanged from the npm analysis, and everything it depends on is still true:

- `Tovu/src/server/deps.ts:173-175` — `builtInThemesDir()` = `TOVU_THEMES_DIR ?? resolve(import.meta.dirname, "../themes")`, resolving inside the shipped tree.
- `theme_write_file` writes there (`Tovu/src/features/theme/tool-registrations.ts:254`).
- `downloadMarketplaceTheme` puts **both** the editable copy and the pristine "reset to original" catalog copy there (`Tovu/src/features/theme/marketplace.ts:83,239`).
- `CreateSqliteRouteDepsOverrides` (`Tovu/src/server/deps.ts:291-303`) has four fields and **no `themesDir`**, so `serve` cannot relocate it.

In the desktop packaging, that path lands inside `Contents/Resources/tovu/dist/src/themes/` — **inside the bundle Squirrel replaces wholesale in §3.3 step 4.**

> **RISK-2-DESKTOP (HIGH, certain, silent): every auto-update destroys all installed and AI-edited themes, plus their own backups, with no user action and no warning.** The user restarts the app and their site's design is gone. This is the single worst failure mode in this document.

### 4.2 Where the data should live on macOS

The correct home is **`~/Library/Application Support/<app>/`** — outside the `.app` bundle, untouched by updates, and backed up by Time Machine. (The cache/logs split: `~/Library/Caches/` for discardable data, `~/Library/Logs/` for logs.)

**This is already built.** `Jini/packages/desktop-host/src/paths.ts` exports `resolvePathRoots()` returning exactly:
```ts
export interface DesktopHostPathRoots {
  namespaceRoot: string; dataRoot: string; cacheRoot: string;
  logsRoot: string; runtimeRoot: string; userDataRoot: string; sessionDataRoot: string;
}
```
with a caller-supplied `dataDirOverrideEnvVar`, absolute-path validation, `~`/`$HOME` expansion, and a namespace-agreement check. It has its own test file (`__tests__/paths.test.ts`). Runner already depends on `@jini-ai/desktop-host` (`file:../Jini/packages/desktop-host`).

### 4.3 Reconciling the three layouts

There are three directory models in play and they do not currently agree:

| Layer | What it defines | State |
|---|---|---|
| `desktop-host/paths.ts` | OS-correct roots (`dataRoot`, `cacheRoot`, …) | **Built and tested.** Used by Runner for its own state. **UNVERIFIED** whether Runner passes any of it down to Tovu. |
| `Tovu/src/site-dir/init-site.ts:39` | `<dir>/{uploads,themes,plugins,overrides}` | **Created by `tovu init`; only `uploads` is ever read.** `themes`, `plugins`, `overrides` are dead directories — verified by grep. |
| `Tovu/src/server/deps.ts` resolvers | `builtInThemesDir()` package-relative; plugins/export/publish `cwd`-relative | **The actual runtime behavior, and the source of the risk.** |

**The fix is to make these three agree, and the design work is already done in two of the three.** Concretely:

1. Runner computes a per-site install dir under `dataRoot` from `paths.ts`.
2. Runner passes it to `tovu serve <dir>` — **it already spawns exactly this CLI** (`src/main/tovu-cli.ts:200`).
3. Tovu gains a `themesDir` override on `CreateSqliteRouteDepsOverrides` and passes `path.join(target, "themes")` from `src/cli/commands/serve.ts` — finishing the wiring `init-site.ts:39` already anticipated.
4. Bundled themes stay read-only inside the app bundle (correct — they are software). Installed and edited themes go to the install dir (correct — they are data).

Step 4 is the important distinction and it maps cleanly onto the memory-recorded model that **Tovu themes are COPIED, not inherited** (ADR-020 §5). Because a user theme is a complete standalone copy, moving it out of the bundle needs no inheritance resolution — a copy in `<dataRoot>/.../themes/` is self-sufficient by construction.

**Zero-code interim mitigation**, same as the npm plan: Runner already builds the child env in `buildTovuChildEnv()` (`src/main/tovu-cli.ts:180-191`) and already deletes `PORT`/`TOVU_CONTENT_DB`/`TOVU_DB` there. **Setting `TOVU_THEMES_DIR` (and the four §1 RISK-3 vars) in that same function is a handful of lines in one place that already exists for exactly this purpose.** That is the cheapest possible fix and it should go in before any updater ships.

### 4.4 Content, uploads, DB, config

- **`content.db`, `uploads/`, `config.json`, `.site-meta.json`** all live in the install dir, which is outside the app bundle. **Safe from update replacement** — provided step 1–2 above put the install dir under `dataRoot` and not somewhere inside the bundle. **UNVERIFIED**: where Runner currently points Tovu's install dir.
- **RISK-1 is unchanged and arguably worse**: an auto-update can now ship a new migration that runs unattended on next launch, against a real site, with no down migration and no automatic restore point. The pre-migration restore-point primitive already exists and works (`infra/restore-point-*.db` files, produced via better-sqlite3's online-backup API through `ContentDb.$client`). Wire it into `bootSiteDir` when `compareSchemaVersion` returns `"migrate"`.
- **RISK-3 gets worse**: under Electron, `process.cwd()` is whatever the OS hands the app, not a shell the user chose. `pluginsInstallDir()` and the three export/publish resolvers (`Tovu/src/server/deps.ts:203-246`) all derive from it. Same env-var mitigation as §4.3.

---

## §5 — Code signing and notarization: the new #1 blocker by lead time

### 5.1 Current state: unsigned, no configuration

Grepping `Tovu-Runner/electron-builder.yml` and `package.json` for `notarize`, `identity`, `CSC_`, `APPLE_ID`, `hardenedRuntime`, and `entitlements` returns **nothing**. There is no signing configuration of any kind.

### 5.2 Why this is a hard blocker, not a polish item

Two independent reasons, and the second is the one usually missed:

1. **Gatekeeper.** macOS refuses to launch an unsigned, un-notarized app downloaded from the internet. The user sees *"Tovu Runner is damaged and can't be opened"* — which is a lie about the app's integrity, and is the worst possible first impression. The right-click-Open workaround has been progressively restricted and cannot be a product instruction.
2. **The updater itself requires it.** As established in §3.3, Squirrel.Mac refuses to apply an update whose signature does not match the running app. **An unsigned app physically cannot self-update on macOS.** So signing is not adjacent to the owner's request — it is a precondition of it.

### 5.3 Cost and lead time

*(These figures are from general knowledge, not verified against Apple/vendor pages today — **treat as estimates and confirm current pricing before committing to a date**.)*

| Item | Cost | Lead time | Notes |
|---|---|---|---|
| **Apple Developer Program** | ~$99/year | **~1–2 days individual; potentially weeks for an organization** | Org enrollment needs a D-U-N-S number, which is the long pole. **Individual enrollment is much faster — take it unless there is a legal reason not to.** |
| Developer ID Application certificate | included | minutes once enrolled | This is the cert type for apps distributed outside the App Store. |
| Notarization | included | minutes to ~1 hour per submission | Automated; `electron-builder` handles it via `notarize: true` + an app-specific password or API key. |
| **Windows OV code-signing cert** | ~$200–400/year | **days to weeks** (identity vetting) | Since 2023 the private key must live on hardware/HSM, which complicates CI signing. |
| Windows EV cert | ~$300–600/year | longer vetting | Buys immediate SmartScreen reputation; OV builds reputation over time. |

**The lead time is the point.** Every other blocker in this document can be compressed by working harder tonight. Apple enrollment cannot. **Start enrollment today, in parallel with everything else** — it is a form and a credit card, and it unblocks the critical path.

**Scope recommendation: macOS only for the first release.** The owner is on macOS (Darwin 22.6.0). Windows doubles the certificate cost, adds the hardware-token problem, and serves nobody yet.

---

## §6 — The other hard blocker: the app requires the user to already have Node 24+

*(Not in the requested outline. Adding it because it is a genuine contender for #1 and nothing else in this document covers it.)*

`Tovu-Runner/src/main/tovu-cli.ts:73` — `const TOVU_MIN_NODE_MAJOR = 24;` — and `resolveNodeBinary()` (`:161-178`) **throws** if it cannot find one. The error text (`:134-142`):

> `Tovu-Runner needs a system Node.js 24+ to run Tovu, and none was found. [...] Install Node 24 or newer (https://nodejs.org, or \`brew install node\`), or set TOVU_RUNNER_NODE to the full path of one you already have.`

The search is genuinely thorough — PATH, Homebrew, MacPorts, Volta, nvm, fnm, asdf, n, with a comment at `:106-107` showing someone already thought about Finder-launched apps inheriting a bare PATH. This is careful work.

**But it is careful work solving the wrong-shaped problem for a consumer download.** A person who downloads an app from tovu.dev does not have Node installed and will not `brew install node`. For them the app opens and immediately fails.

And it is not an oversight that can be flipped off. `tovu-cli.ts:146-148` explains why Electron's own bundled Node (`ELECTRON_RUN_AS_NODE`) cannot be used: **Tovu ships `better-sqlite3` compiled for system Node's ABI**, and Electron's ABI differs. `electron-builder.yml` says the same thing from the other side — Runner's own better-sqlite3 13 uses ABI-stable N-API prebuilds, while *"the better-sqlite3 11 inside the staged Tovu tree is a node-gyp build for system Node's ABI, and rebuilding THAT for Electron would break it."*

**So the fix is real work, not a config change.** Options, in preference order:

1. **Bundle a Node binary in the app** (`extraResources` a ~50 MB official Node build; point `resolveNodeBinary()` at it first). Native addons still target system-Node ABI, which is exactly what a bundled official Node provides — so this is the option that *keeps the current native-addon story intact*. **Recommended.**
2. **Upgrade the staged Tovu tree's `better-sqlite3` to a version with N-API prebuilds** (Runner already runs v13 that way) and then run Tovu under `ELECTRON_RUN_AS_NODE`. Cleaner and smaller long-term; touches Tovu's dependency and needs `sharp` and `argon2` re-checked the same way. Bigger blast radius.
3. **Ship a "requires Node 24+" note on the download page.** Honest, free, and acceptable *only* while the audience is the owner and people he tells directly. Not a product.

**For the first slice, option 3 is fine — the owner has Node 24. For anything resembling a public download, option 1.**

---

## §7 — Does the admin SPA still need to be in the build? **Yes, and it is now the difference between an app and a blank window.**

Unchanged from the npm analysis, and confirmed still true:

- `Tovu/src/server/app.ts:1167-1169` — `distDir: process.env.TOVU_ADMIN_DIST ?? path.resolve(import.meta.dirname, "../../apps/admin/dist")`.
- From the built `dist/src/server/app.js` that resolves to `dist/apps/admin/dist`, which **does not exist** — verified, along with `dist/apps/` itself.
- `Tovu`'s `npm run build` (`package.json:24`) copies `templates`, `themes`, `agent-plugins`, `db/drizzle`, `db/drizzle-database-journal`, `public` — and nothing from `apps/`.

**Why it is worse here:** `electron-builder.yml` stages `staging/tovu-runtime/dist` → `Contents/Resources/tovu/dist`. The staging script copies **Tovu's `dist/`**. If the SPA is not in `dist/`, it is not in the staged tree, and it is not in the app bundle. In the npm story a determined operator could set `TOVU_ADMIN_DIST` to a directory on their disk; in a signed, sealed `.app` there is nothing to point it at.

**Fix (same as the npm outline, now load-bearing twice over):** add to Tovu's build chain
```
npm run admin:build && mkdir -p dist/apps/admin/dist && cp -R apps/admin/dist/. dist/apps/admin/dist/
```
This keeps the single path expression in `app.ts:1169` correct in both the dev tree and the built tree — the same technique `emit-dist-package-json.mjs` uses for `#src/*`.

**UNVERIFIED:** whether `Tovu-Runner/development/scripts/stage-tovu-runtime.mjs` copies all of `dist/` or an allowlist. If it is an allowlist, it needs the new path added too. **Check this before assuming the one-line build fix is sufficient.**

**Also UNVERIFIED:** whether Runner renders Tovu's admin in a `BrowserWindow` pointed at the child server's port, or ships its own UI. `desktop-host` has `electron-render-service.ts` and `electron-protocol.ts`, so a custom protocol is plausible. This determines whether the 503 shows as a broken page or a blank window — it does not change the fix.

---

## §8 — Phasing

Goal: **one downloadable, launchable app plus one successful self-update.**

### Phase 0 — prove the update loop unsigned and local (1 day)

Signing has calendar lead time; do not let it block learning the mechanics. **Unsigned local build is the fastest honest path for the first pass — say so plainly and take it.**

1. **Start Apple Developer Program enrollment first thing.** It is a form and a credit card, and it is the long pole (§5.3). Everything below runs in parallel with it.
2. Set `TOVU_THEMES_DIR` + the four RISK-3 env vars in `buildTovuChildEnv()` (`Tovu-Runner/src/main/tovu-cli.ts:180-191`). **Do this before anything ships**, so no test install can eat themes.
3. Fix Tovu's build chain to place the admin SPA in `dist/apps/admin/dist` (§7); confirm the staging script carries it.
4. Give `Tovu-Runner/package.json` a real version (`0.1.0`, not `0.0.0`).
5. Change `mac.target` from `dir` to `["dmg", "zip"]`.
6. Add `electron-updater`; point it at a **local static file server** serving `latest-mac.yml` + the zip.
7. Build `0.1.0`, install to `/Applications`, create a site, add content, **edit a theme**, upload an image.
8. Build `0.1.1`, publish to the local server, relaunch, let it update.
9. **Verify: content intact? migration applied and `.site-meta.json` restamped? theme edit still there? upload still there?**

Step 9 is the deliverable. Note that on macOS an unsigned app **cannot** complete step 8 via Squirrel (§3.3) — so Phase 0 proves the packaging and the data-survival question, and defers the real update handshake to Phase 1. **State that limitation rather than papering over it**: if step 8 fails signature validation, that is the expected result, and steps 2/3/9 still delivered their value.

### Phase 1 — signed, notarized, downloadable (1–2 days once enrolled)

1. Developer ID Application cert; `electron-builder` `mac.hardenedRuntime`, `entitlements`, `notarize: true`.
2. `publish: github`; `electron-builder --publish always`.
3. tovu.dev download button → latest release asset.
4. Repeat the Phase 0 loop end to end. **This is the first run where the updater genuinely works.**

### Phase 2 — close the data-loss risks properly (1–2 days, 3-wide)

The env vars in Phase 0 are a tourniquet, not a fix — they live in Runner and Tovu remains wrong when launched any other way.

- **2a — RISK-2.** Add `themesDir` to `CreateSqliteRouteDepsOverrides` (`Tovu/src/server/deps.ts:291-303`); pass `path.join(target, "themes")` from `src/cli/commands/serve.ts`; theme discovery reads install-dir themes in addition to bundled read-only ones.
- **2b — RISK-1.** Wire the existing restore-point capture into `bootSiteDir` when `compareSchemaVersion` returns `"migrate"`. More urgent here than in the npm story: updates now arrive unattended.
- **2c — RISK-3.** Overrides for plugins/export/publish/source-control-export; have Runner derive the install dir from `desktop-host`'s `paths.ts` `dataRoot`.

Each needs a regression test that fails first — standing repo rule.

### Phase 3 — hardening

Bundled Node runtime (§6 option 1) · Windows · staged rollout / update channels · resolve the GitHub Actions billing block so releases can be gated · `LICENSE`.

**Recommended stop for this week: Phase 0 + Phase 2a, with Apple enrollment submitted on day one.** That yields a real app, proof of what survives an update, and removal of the risk that would destroy the owner's work — while the certificate clock runs in the background.

---

## §9 — Open decisions (5)

**D-1 — Electron or Tauri?**
*Recommend: **Electron**.* Already chosen, already built (`electron ^43.2.0`, a mac build exists), and Tauri's supposed advantage — no Node runtime — is void here because Tovu runs as a spawned Node child either way (§2.1). Tauri's `RenderService` and `ProtocolHandlerPort` are explicitly unimplemented.
*Cost of the alternative:* finishing two ports, a Rust toolchain, redoing native-addon and signing work, to save a fraction of a download whose bulk is the Tovu runtime tree, not Chromium.

**D-2 — Apple Developer Program: enroll now, or defer and ship unsigned?**
*Recommend: **enroll today**, as an individual rather than an organization.* It is the only blocker with irreducible external lead time, and on macOS **auto-update is impossible without it** (§3.3/§5.2) — so it gates the actual feature, not just Gatekeeper.
*Cost of the alternative:* ~$99 saved; users get *"Tovu Runner is damaged and can't be opened"*, and the self-update the owner asked for cannot function at all. Org enrollment instead of individual risks a multi-week D-U-N-S delay for no benefit at this stage.

**D-3 — Fix RISK-2 (themes) before or after the first downloadable build?**
*Recommend: **before — at minimum the env-var tourniquet in `buildTovuChildEnv()`, which is a few lines in a function that already exists for this purpose.***
*Cost of the alternative:* the first auto-update silently destroys every installed and AI-edited theme plus their backups. Since the entire point is testing update mechanics, shipping a known theme-eating update is the wrong bet — and unlike the npm story, there is no command for the user to hesitate over.

**D-4 — Bundle a Node runtime, or require system Node 24+?**
*Recommend: **require system Node for the first slice** (the owner has it), **bundle for anything public** (§6 option 1).*
*Cost of the alternative:* bundling now adds ~50 MB and a day of native-addon verification before the update loop has ever been proven. Requiring it forever means every non-developer download fails on first launch with a `brew install node` message.

**D-5 — Is the product "Tovu" or "Tovu Runner"?**
*Recommend: **market it as Tovu; keep `appId: ai.jini.tovu-runner` unchanged.*** Users download "Tovu"; the bundle identifier is invisible plumbing.
*Cost of the alternative:* renaming the appId after any signed release **breaks the update chain** — Squirrel matches on identity — and orphans installed copies. If the appId is ever going to change, it must change **before** the first signed release, not after.

---

## §10 — Verified vs. unverified

**Verified this session:** `Tovu-Runner` exists with `electron-builder.yml`, `electron ^43.2.0`, `electron-builder ^26.15.3`, `version: 0.0.0`, `private: true` · `mac.target: [dir]` and the `--dir` package script · `extraResources` staging of `dist` + `node_modules` · absence of any `electron-updater`/`autoUpdate`/`Squirrel` reference · absence of any `notarize`/`identity`/`CSC_`/`hardenedRuntime`/`entitlements` config · `release/mac/` present, dated 2026-08-24 · `tovu-cli.ts` `spawn(resolveNodeBinary(), …)`, `TOVU_MIN_NODE_MAJOR = 24`, the candidate-path search, the throw, and `buildTovuChildEnv()` · `@jini-ai/desktop-host@0.1.2` on npm with electron + tauri assemblies, `paths.ts` roots, `tauri/not-implemented.ts` · ADR-011 framing in `START-HERE.md:6-11` and `development/tovu-v2-design.md:214`.

**Carried from the npm outline (verified then, not re-checked now, per instruction):** Tovu's build chain and the missing `dist/apps/admin/dist` · `builtInThemesDir()` and the theme write/install paths · `CreateSqliteRouteDepsOverrides`'s four fields · 50 migrations with zero down migrations · the `cwd`-relative plugin/export/publish resolvers · the dead `<dir>/{themes,plugins,overrides}` subdirs.

**UNVERIFIED:** whether `stage-tovu-runtime.mjs` copies all of `dist/` or an allowlist (**check before trusting §7's one-line fix**) · where Runner currently points Tovu's install dir · whether Runner passes any `desktop-host` `paths.ts` root down to Tovu · how Runner renders the admin UI · Electron 43's bundled Node version (immaterial, see §2.1) · the staged runtime tree's size · all §5.3 cost and lead-time figures, which are from general knowledge and should be confirmed against current Apple/vendor pages · whether the 8 unpublished `@jini-ai` packages build (now moot for this path).
