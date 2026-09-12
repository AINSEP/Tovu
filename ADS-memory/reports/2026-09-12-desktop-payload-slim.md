# Desktop payload slimming

**Date:** 2026-09-12
**Area:** `apps/desktop` packaging (`electron-builder.yml`, `scripts/stage-payload.mjs`, `src/stage-payload-lib.js`)
**Status:** three changes committed and tested; the full staging-script run is still unverified (see Open blocker)

---

## Result

| Commit | Change | Measured before → after |
|---|---|---|
| `65906931` | Stop packing `@oven` (Bun runtimes) and `@rollup` natives into the shell bundle | `app.asar.unpacked` 135 MB → ~0 |
| `172d783a` | Strip declarations, third-party source maps and `coverage/` from the staged payload | payload 404 → 259 MB (145.2 MB freed) |
| `641bf728` | Keep native prebuilds for the target architecture only; drop `deps/` and `binding.gyp` | payload 259 → 234 MB (24.8 MB freed) |

Baseline, measured with `du -sm` on `release-probe2/mac/Tovu.app`:

| Part | Size |
|---|---|
| whole app | 849 MB |
| `Resources/tovu` | 407 MB |
| `Frameworks` | 239 MB |
| `app.asar.unpacked` | 135 MB |
| `app.asar` | 57,483,428 bytes |

**Projection: about 544 MB installed** (849 − 135 − 145.2 − 24.8). **This is arithmetic, not a packed build.** No packaging build was run, so neither the app nor the dmg size has been measured.

The payload numbers come from a copy of the real `staging/tovu-payload`, measured with `du -sm`.

---

## Commit details

### `65906931`: Bun and Rollup in the shell bundle
- **What it was:** `app.asar.unpacked/node_modules/@oven` held `bun-darwin-x64` and `bun-darwin-x64-baseline`, 67 MB each. `@rollup/rollup-darwin-x64` added 2 MB.
- **Where it comes from:** both are `optionalDependencies` of `@modelcontextprotocol/ext-apps@0.3.1`, which sits under `@mcp-ui/server` and is reached from `@jini-ai/chat`.
- **Why it isn't needed:** every Bun reference in that package is a `package.json` script (`postinstall`, `build`, `test`, `examples:*`). Its shipped `dist/` has none.
- **Why it shipped anyway:** `EXCLUDED_PACKAGES` already kept both out of the *payload*. The shell has its own separate `node_modules`, which that exclusion never covered.
- **The fix:** `files:` negations `!node_modules/@oven/**/*` and `!node_modules/@rollup/**/*`. They reach `node_modules` because `getNodeModuleFileMatcher` (`app-builder-lib/out/fileMatcher.js:177-220`) builds that matcher from the `!` patterns alone.

### `172d783a`: Payload strip
The strip removed 13,122 declarations, 4,542 source maps and 23 coverage reports. The rules live in `strippableReason`:
- **Declarations:** `.d.ts`, `.d.mts` and `.d.cts` go everywhere, first-party included.
- **Declaration maps:** each `.d.ts.map` goes with its declaration. This rule runs before the source-map keep-list.
- **Source maps:** `.map` files go unless the package is under `@jini-ai`.
- **Coverage:** only a package's own top-level `coverage/` directory is removed.

Scope and ordering:
- It runs on staging output only, never on the repo's `node_modules`. `/Users/la/Programming/Tovu/node_modules/drizzle-orm/index.d.ts` was confirmed still present.
- It runs before `assertClosureComplete`.

### `641bf728`: Architecture pruning
- **Removed:** 14 prebuilds and 3 build inputs.
- **Kept:** `better-sqlite3/prebuilds/darwin-x64.node` and `argon2/prebuilds/darwin-x64`.
- **Sizes:** better-sqlite3 went from 27 MB to 3 MB.
- **Scope:** `deps/` and `binding.gyp` are removed only from packages that have a `prebuilds/` directory.

### Verification
All of these ran on the stripped and pruned copy, from a working directory outside the repo. No `node_modules` exists at `/Users/la`, `/Users` or `/`.
- `assertClosureComplete`: PASS
- `tovu init`: exit 0
- `tovu export`: exit 0, 25 files
- Direct imports: 18 of 18, including OpenTelemetry `api`, `sdk-metrics` and `semantic-conventions`
- `better-sqlite3`: `sqlite_version` 3.53.4
- `argon2`: hash and verify returned true
- `check-complexity`: 0 new violations; `complexity-debt.json` unchanged

### Tests
- `src/stage-payload-lib.test.js`: 25 → 51 tests
- `src/electron-builder-files.test.js`: 3 → 6 tests. It mirrors the separate `node_modules` matcher and was shown to fail without the fix.
- Total: 57/57 pass.

---

## `TOVU_TARGET_ARCH`

electron-builder chooses the architecture at pack time from its CLI flags, and `electron-builder.yml` declares no `arch`. Staging runs before it, so `resolveTargets` works like this:
- **Default:** the host. With no flag, electron-builder packs for the host: `release-probe2`'s `Contents/MacOS/Tovu` is `x86_64` on this `x86_64` machine.
- **Cross-arch:** `TOVU_TARGET_ARCH=arm64`, plus `TOVU_TARGET_PLATFORM` if needed.
- **Universal:** `TOVU_TARGET_ARCH=universal` keeps both macOS architectures. Required for `electron-builder --universal`.
- **Linux:** a `linux` target also keeps `linuxmusl`.
- **No match:** if a `prebuilds/` directory has nothing for the target, staging stops with the package named. It does not ship an app whose `better-sqlite3` falls through to a missing `build/Release` binding (`lib/binding.js:44`).
- **Unrecognized names:** kept, never read as a mismatch.

**Any cross-arch or universal pack must set this variable.** Otherwise the payload carries only host binaries.

## The multi-arch prebuild trap

Prebuildify writes a multi-architecture binary as a single tag, `darwin-x64+arm64`. `node-gyp-build`'s `parseTuple` splits the architecture on `+`.

The first draft of `prebuildTarget` read that architecture as the literal string `"x64+arm64"`. That string matches no target, so the pruner would have **deleted the one binary serving every target**. This was caught before commit by reading `parseTuple`. Architectures are now a list, and there is a test for this case.

---

## Corrections to the brief

1. **File-size sum vs disk blocks.**
   - "263 MB payload `node_modules`" was the sum of file sizes. On disk it is 372 MB.
   - Declarations are 40.0 MB by file size but 72.0 MB on disk, because each small file takes at least one 4 KB block.
   - Installed size is what's on disk, so the strip freed 145 MB, not the estimated 97 MB.
2. **Bun is the real `app.asar.unpacked` weight.** The brief left its 134 MB unexplained. 133 MB of it is two Bun runtimes. This was the largest single saving.
3. **lucide-react's real importers are 3 `@jini-ai/ui` files using 4 icons.**
   - The "4 import sites" are vendored shadcn skill docs and an example, not compiled code.
   - The only runtime importers are `@jini-ai/ui/dist/features/interactive-ui/providers/shadcn/{select,checkbox,radio-group}.js`.
   - The icons are `Check`, `ChevronDown`, `ChevronUp` and `Circle`.
   - No first-party Tovu app code imports it.
4. **Jini's source maps need Jini's `src/`.**
   - Jini's `.js.map` files carry no `sourcesContent`: 400 of 400 sampled had none.
   - They resolve frames only through the `../src/*.ts` paths in their `sources`.
   - Stripping `src/` would leave 31 MB of maps that name no lines, so `src/` was kept.

---

## lucide-react (41.3 MB): recommendation, not implemented

### Evidence that the Tovu server never loads it
- **What the server imports from `@jini-ai/ui`:** only two subpaths, `@jini-ai/ui/mcp-ui/surfaces` (20 files) and `@jini-ai/ui/interactive-ui/manifests` (1 file).
- **Why manifests don't pull it in:** `interactive-ui/manifests.js` imports only `*.manifest.js` files. The lucide importers (`select.js`, `checkbox.js`, `radio-group.js`) are reached only through `interactive-ui/index.js`, which the server does not import.
- **Static walk:** tracing static and literal dynamic imports from `dist/src/cli/main.js` reaches 2,623 modules. None is under `lucide-react`.
  - 48 distinct specifiers did not resolve, and none mentions `lucide`, `shadcn`, `interactive-ui` or `providers`.
  - Computed `import()` calls appear only in `__tests__` files.
- **Runtime:** with `lucide-react` hidden in the copy, all 21 server files that import `@jini-ai/ui` loaded, and `init` and `export` still passed.

### Options
- **Per-icon imports:** edits `@jini-ai/ui`, but the full 41 MB package still installs. Not recommended.
- **Vendoring the 4 SVGs:** removes the dependency outright, which is the right end state. It is a Jini change, out of scope for this task.
- **Adding `lucide-react` to `EXCLUDED_PACKAGES`:** one line, reversible, and in scope. It saves 41.3 MB.

### Recommendation
1. **Now:** add `lucide-react` to `EXCLUDED_PACKAGES`, with the evidence above in its comment. `assertClosureComplete` already exempts excluded packages.
   - **Remaining risk:** a `tovu serve`-time path that `init` and `export` don't exercise, such as a lazily loaded interactive-ui renderer. Before shipping, verify with a `serve` smoke test that opens an assistant tool rendering interactive UI.
2. **Later, in Jini:** vendor the 4 icons into `@jini-ai/ui` and drop the dependency.

Neither step was done. The owner decides.

---

## `@jini-ai/ui` (39.0 MB on disk): contents

| Contents | Size | After the strip |
|---|---|---|
| `src/` | 8.9 MB | kept (source maps need it) |
| compiled code (`dist`, `.js`/`.css`) | 8.2 MB | kept |
| `dist` `.js.map` | 7.0 MB | kept (first-party) |
| `coverage/` | 5.7 MB | removed |
| `dist` `.d.ts` | 4.5 MB | removed |
| `dist` `.d.ts.map` | 4.2 MB | removed |
| root files | 0.6 MB | kept |

About 24.6 MB remains after the strip.

`coverage/` and compiled `dist/**/__tests__/` files are present because Jini packages are staged whole from local pnpm-linked checkouts, not from published tarballs. The package's own `files:` list would exclude both. The `__tests__` files are not stripped yet and are a follow-up candidate.

---

## Open blocker

**The full `node scripts/stage-payload.mjs` run exits 1.** Its staleness guard refuses `apps/admin/dist`, whose `index.html` is older than `apps/admin/src`. Another agent is editing that source. It failed twice: once before and once after the dev-stack restart.

What this means:
- The guard fires before `rmSync(outDir)`, so the staged tree was never modified. `staging/tovu-payload` is still the old 404 MB tree with all 8 better-sqlite3 prebuilds.
- **Nothing is staged with the new strip yet.**
- **The script-level wiring is unverified.** The lib functions were proven on a copy of the real tree. For `stage-payload.mjs` itself, only `node --check` and a check that every named import exists in the lib have passed.

To close it:
1. Rebuild admin with `cd apps/admin && npx vite build`, once that agent is done.
2. Re-run `node scripts/stage-payload.mjs`.
3. Confirm the two new `stage-payload:` output lines and a staged size of about 234 MB.

---

## Left alone
- **Licenses and READMEs (3.8 MB):** legal weight.
- **OpenTelemetry:** kept as instructed. Whether only specific instrumentation packages could ship instead was not investigated.
- **Jini `src/`:** required by Jini's source maps.
- **Electron `Frameworks`, `release-probe2/` and `release-verify/`.**
- **Renderer hooks, `coverage-floors.json` and `complexity-debt.json`:** other agents' files.

Possible follow-up, not measured: the shell's own `app.asar` likely carries `.d.ts` files from its `node_modules`. electron-builder's default exclusions, which include `d.ts`, are added only to the main matcher, not to the `node_modules` matcher.

## Related
- `ADS-memory/reports/2026-09-12-packaging-asar-corruption.md` (`75a3007f`): why no packaging build was run.
