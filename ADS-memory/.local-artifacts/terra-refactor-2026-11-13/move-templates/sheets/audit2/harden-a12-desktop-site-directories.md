# HARDEN-A12: desktop site-directory files -> `@jini-ai/platform/fs` (templates T-HARDEN + T-MOVE)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`); every cited line read that day. Row `audit2:A12` names six files for "platform/fs HARDEN". **Reading them, only two pieces are generic.** The other four are Tovu product code (site-folder layout, tracked-sites registry, `tovu init`) and **stay**, each with the reason below. The sheet is therefore small: one Jini addition + one Tovu binding, plus an optional second micro-move. Row estimate 77k; this sheet ≈ 35k executor tokens (S1 12k, S2 15k, S3 8k).

Tier: Sonnet for all slices; no Opus review (pure functions, parity tests, no security path). Packaged-desktop proof owed (the row's `packaged-desktop-proof`) because `main.ts`'s userData resolution feeds the packaged paths: see S2 look.

## Verdicts (what the audit missed by label)
| Tovu file (lines, blob) | verdict | reason (code read) |
|---|---|---|
| `desktop-user-data-dir.ts` (89) `2b89bcd2…` | **SPLIT: mechanism -> Jini, binding stays** | the platform `appData` root table (`darwin` Library/Application Support, `win32` APPDATA else AppData/Roaming, `linux` XDG_CONFIG_HOME else ~/.config) is Electron's convention, generic. Jini has **no equivalent**: `platform/fs/user-data-directories.ts` `resolveUserDataDirectories` uses a *different* convention (Linux `XDG_DATA_HOME`/`~/.local/share`, Windows `<APPDATA>/<appName>` with name) and takes the Electron dir as an injected `appDataDir` (`app-data-profile.test.ts` proves that contract). So the Electron-mirror rule is genuinely missing from Jini: **HARDEN** (add), then repoint. The env NAME `TOVU_DESKTOP_USER_DATA_DIR`, `DESKTOP_APP_NAME = "tovu-desktop"` and the "tovu-desktop: no known userData location" error wording are product and stay |
| `site-name-policy.ts` (32) `c2b7ad56…` | **PARTIAL: `uniqueSiteName` mechanism -> core/text; error copy stays** | `uniqueSiteName` is a generic "make a name distinct among names, suffix ` N`, within a max length" (needs the length as a port; today `SITE_NAME_MAX_LENGTH` from `./contracts/site-name.ts`). `duplicateSiteNameError` carries product copy ("A website named …") and stays |
| `site-folders.ts` (164) `511299cc…` | **STAYS** | it is the Tovu desktop's settings port (`SiteFoldersPort`, `SiteFolders` contract, `assertSpecificSiteRoot` product policy, a legacy-import migration `desktop-roots-config-v1`). Its shared path already delegates to Jini's `workspace` (`workspace.updateRoots`, `registry.merge`). Its `distinctRoots` looks like Jini's `canonicalNodeDirectory` (`directory-workspace.ts:227`) but **is not equivalent**: Tovu falls back to `path.resolve(root)` on *any* realpath error, Jini only on ENOENT and then canonicalises the nearest existing ancestor (a different string for a saved path below a symlink such as macOS `/var`). Replacing would change saved-root identity: **not done here**; recorded as a candidate behaviour decision for the owner |
| `site-dir-store.ts` (640) `a7a5eb52…` | **STAYS** | MRU list, `classifySiteDir` (the `config.json` + `.site-meta.json` markers are Tovu's site layout, with a 2026-09-05 server-parity comment), `initSiteDir` (spawns `tovu init` via `./tovu-server.ts`), `resolveSiteDir`. Product through and through; the legacy MRU branch dies when the shared-registry migration is retired (Tovu lane, not Jini) |
| `site-directory-identity.ts` (113) `fbc0aac4…` | **STAYS** | imports `@jini-ai/db/kernel/sqlite` (`copySqliteInto`): `platform` may not import `db` (COMMON rule 5), and the file hard-codes the site layout (`content.db`, `chat.db`, `data.nosync`, `.site-meta.json`, `siteKeyId`). Nothing generic survives the port boundary except ~6 lines of symlink-detach-with-rollback, too small to be a package export |
| `site-relocation.ts` (277) `7701f31c…` | **STAYS** | rewrites Tovu `desktop-projects.json` rows (`tracked-sites.ts`) after a folder move; the generic move (`verified-directory-move.ts`) and registry `relocate` already live in Jini and are used |

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/desktop/src/desktop-user-data-dir.ts | blob 2b89bcd26c1b2b1c72c43a77e7056fdbfd455ff1   (reduce to binding)
  - apps/desktop/src/desktop-user-data-dir.test.ts | blob 5927d5c9e2a3bb15f9274d8347636b26362ff451   (split: pure cases move, product cases stay)
  - apps/desktop/src/site-name-policy.ts | blob c2b7ad564b4eb306b5bf619091e256a4268adb76   (OPTIONAL slice S3)
  - apps/desktop/src/site-name-policy.test.ts | blob 4ef3b8375c1ac8f92b4e227ccbfc38f8e8d5197c
tovu_edited (stay):
  - apps/desktop/bin/tovu-desktop.ts | blob df1c8a95e3cade9f92720dd8de1d5a8e8f97bda6   (:33 import, :105 call: unchanged names)
  - apps/desktop/src/packaged-paths.ts | blob 5025c7b1906d400c109004cfc5aa59a58aef0271   (:3 DESKTOP_APP_NAME import: unchanged)
  - apps/desktop/src/packaged-paths.test.ts   (:9, unchanged)
  - apps/desktop/src/shared-sites.ts | blob 49ca42067f1b84508f4e66c593f4fb6758f1e8ac   (`desktopAppDataDir` :40-50 reads the SAME env name: NOT touched; see "third copy" below)
  - apps/desktop/src/contracts/site-name.ts | blob 338d8723dcb2e5b9ffccaa3e2afa2df5349377d7
jini_guards:
  - packages/platform/src/fs/index.ts | blob 79e1ab71cc12e9a3e68f5208d3bced92a376bcbd
  - packages/platform/package.json | blob e3ae8495fd9724a47a1438a5be6ca2d75424f9e8   (not edited: "./fs" already `node`)
  - packages/platform/src/fs/user-data-directories.ts | blob 2b0c36f90db646eed7551d788780428dab517f3f   (not edited)
  - packages/core/src/text/index.ts | blob e9c8d69cdcf99ef0c7dea211a4c03eb735112f52   (S3 only; A10 also edits it: text guard)
  - packages/platform/src/fs/app-data-root.ts and packages/core/src/text/unique-name.ts must not exist
```
Importer census (rg 2026-11-16, `apps/desktop`): `desktop-user-data-dir` <- `bin/tovu-desktop.ts:33`, `packaged-paths.ts:3`, `packaged-paths.test.ts:9`, `desktop-user-data-dir.test.ts:17` only. `site-name-policy` <- `project-ipc.ts:37` (5 call sites: `:681,:746,:869,:939,:1230`) and its test. `rg -n "resolveDesktopUserDataDir|APP_DATA_ROOTS" apps packages` outside the file: only `bin/tovu-desktop.ts:105`.

**Third copy to record, not touch:** `shared-sites.ts:40-50` `desktopAppDataDir` also reads `TOVU_DESKTOP_USER_DATA_DIR` and resolves a relative value against `cwd`; it is the *override* half (cwd-relative), `resolveDesktopUserDataDir` is the *default-location* half (`path.resolve` against process cwd). The two disagree for a relative override only by which cwd they use; unifying is a Tovu behaviour decision (owner), out of scope.

## Contract (new, `packages/platform/src/fs/app-data-root.ts`, runtime tag already `node` through `./fs`)
```ts
/** Electron's per-user application-data root (`app.getPath('appData')`), without Electron. */
export function resolveElectronAppDataRoot(
  required: { platform: NodeJS.Platform; env: NodeJS.ProcessEnv; homeDir: string },
  optional: Record<string, never> = {},
): string | undefined;           // undefined = no known convention for this platform (caller decides how to refuse)

/** `<appDataRoot>/<appName>`: Electron's default `userData` for a packaged-name-less dev app. */
export function resolveElectronUserDataDir(
  required: { platform: NodeJS.Platform; env: NodeJS.ProcessEnv; homeDir: string; appName: string },
  optional: Record<string, never> = {},
): string | undefined;
```
No `process.env`/`os.homedir()` defaults inside Jini (COMMON rule 8: the host passes `env`, `homeDir`, `platform`; the Tovu binding supplies the process values). Rules, copied from the table at `desktop-user-data-dir.ts:54-58`: darwin `<home>/Library/Application Support`; win32 `env.APPDATA` trimmed non-empty else `<home>/AppData/Roaming`; linux `env.XDG_CONFIG_HOME` trimmed non-empty else `<home>/.config`; any other platform `undefined`. **Path flavour:** use `path.win32` for `win32` and `path.posix` otherwise (the Tovu original uses the host `path`, which only differs when a test fakes the platform; the Jini rule follows `user-data-directories.ts:23` that already does this: a documented, tested, harmless tightening). `appName` must be non-empty (throw `Error('appName must be a non-empty string.')`, a new guard; Tovu passes a literal).

```
id: HARDEN-A12-1 .. 3
feature: desktop userData resolution -> platform/fs (+ optional unique-name -> core/text)
jini_target: platform src/fs/app-data-root.ts (+ one export line in src/fs/index.ts) ; core src/text/unique-name.ts (S3, optional)
changeset: @jini-ai/platform: minor | "fs: resolveElectronAppDataRoot / resolveElectronUserDataDir"; @jini-ai/core: minor | "text: uniqueName" (S3)
```

## HARDEN-A12-1 — Jini (commit 1)
0. Branch rule; blobs; `ls packages/platform/src/fs/app-data-root.ts` fails; `rg -n "resolveElectron" packages` prints nothing.
1. Tests first (`packages/platform/src/fs/__tests__/app-data-root.test.ts`, vitest, style of `app-data-profile.test.ts`). Parity with the Tovu cases (`desktop-user-data-dir.test.ts:31-81`), all RED on the parent (module missing) and GREEN on the commit:
   - darwin: `{ platform:'darwin', env:{}, homeDir:'/Users/o', appName:'tovu-desktop' }` -> `/Users/o/Library/Application Support/tovu-desktop`;
   - linux: with `XDG_CONFIG_HOME='/x/cfg'` -> `/x/cfg/tovu-desktop`; with it unset -> `/home/o/.config/tovu-desktop`; with it `'  '` (blank) -> `/home/o/.config/tovu-desktop` (blank ignored, as Tovu's `?.trim() ||`);
   - win32: `APPDATA='C:\\A'` -> `C:\\A\\tovu-desktop`; unset -> `C:\\Users\\o\\AppData\\Roaming\\tovu-desktop` (win32 separators: NEW because the Jini rule uses `path.win32`);
   - unknown platform (`'aix'`) -> `undefined` (Tovu threw; the throw moves to the binding);
   - NEW: empty `appName` throws; `resolveElectronAppDataRoot` for each platform returns the root without the app name.
2. Code per Contract; why-comments from `desktop-user-data-dir.ts` header moved reworded neutral (the "mirrors Electron rather than deriving from it, and that is a real, named risk" paragraph goes onto the function doc; the three mitigations that name Tovu files/CLI (`bin/tovu-desktop.ts`, `packaged-paths.ts`) stay in Tovu next to the binding). `index.ts` gets `export * from "./app-data-root.js";`.
3. Checks: COMMON 2-9; `rg -n -i "tovu|apps/|TOVU_" packages/platform/src/fs/app-data-root.ts` prints nothing; no `process.`/`os.` in the file; functions ≤ 25 lines, complexity ≤ 6; eslint; changeset; commit `feat(platform/fs): Electron-convention userData resolver`.

## HARDEN-A12-2 — Tovu binding (commit 2)
1. `desktop-user-data-dir.ts` reduces to (keep the whole `@file` header's Tovu-specific half: the CLI risk, the three mitigations, the `TOVU_DESKTOP_USER_DATA_DIR` paragraph; drop only the platform-table prose that moved):
```ts
import os from "node:os";
import path from "node:path";
import { resolveElectronUserDataDir, resolveElectronAppDataRoot } from "@jini-ai/platform/fs";
const DESKTOP_APP_NAME = "tovu-desktop";
interface ResolveDesktopUserDataDirOptions { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; homedir?: string; }
function resolveDesktopUserDataDir(options: ResolveDesktopUserDataDirOptions = {}): string {
  const env = options.env ?? process.env;
  const override = env.TOVU_DESKTOP_USER_DATA_DIR?.trim();
  if (override) return path.resolve(override);
  const platform = options.platform ?? process.platform;
  const dir = resolveElectronUserDataDir({ platform, env, homeDir: options.homedir ?? os.homedir(), appName: DESKTOP_APP_NAME });
  if (dir === undefined) throw new Error(`tovu-desktop: no known userData location for platform '${platform}'. Set TOVU_DESKTOP_USER_DATA_DIR to the app's data directory.`);
  return dir;
}
export { DESKTOP_APP_NAME, resolveDesktopUserDataDir };
export type { ResolveDesktopUserDataDirOptions };
```
`APP_DATA_ROOTS` and `AppDataRoot` are deleted: first confirm by census that nothing else uses them (`rg -n "APP_DATA_ROOTS|AppDataRoot" apps packages` prints only the file itself and its test; the test's `APP_DATA_ROOTS` use is none: it asserts through `resolveDesktopUserDataDir`). The two-field `options` object is the existing public signature (`bin/tovu-desktop.ts:105` calls with no args); keep it.
   *Why this is not a forwarder:* the file still owns the product env override, the product app name and the product error wording; the platform table is gone.
2. `desktop-user-data-dir.test.ts` keeps all 8 cases (they assert through the binding: env override, blank override, win32 APPDATA/Roaming fallback, linux XDG, unknown platform throws with the Tovu wording, process defaults, DESKTOP_APP_NAME equals `package.json` name). **One expected-string change to check:** the win32 cases use the host `path`; on the Linux CI box `path.join` yields `/`-separated strings whereas the new Jini rule yields `\\` for `win32`: **update the two win32 expectations (`:70-79`) to the backslash form** and say so in the commit body (a Jini-side tightening, documented in the HARDEN-A12-1 doc). Nothing else changes.
3. Census: `rg -n "APP_DATA_ROOTS|AppDataRoot" apps packages` prints nothing; `rg -n "from \"@jini-ai/platform/fs\"" apps/desktop/src/desktop-user-data-dir.ts` prints exactly one line; the import resolves because `apps/desktop/package.json` already depends on `@jini-ai/platform` (check: `rg -n "@jini-ai/platform" apps/desktop/package.json`; **STOP if absent**: adding a dependency is the coordinator's).
4. eslint; commit `refactor(desktop): resolve the Electron userData default through @jini-ai/platform/fs`. Look owed (packaged-desktop proof, cloud/owner): `tovu-desktop add-site` CLI prints the same resolved directory as before on macOS and Windows hosts (it prints it every run, `bin/tovu-desktop.ts:93-105`); `main-user-data-wiring.test.ts` (`228d0fe9…`) stays green unchanged.

## HARDEN-A12-3 — OPTIONAL: `uniqueSiteName` -> `@jini-ai/core/text` `uniqueName` (commit 3 Jini + commit 4 Tovu)
Do only after the coordinator confirms the micro-move is wanted (it is 20 lines; the row's value is the repoint pattern, not size).
1. Jini `packages/core/src/text/unique-name.ts`: `uniqueName({ name, names, maxLength }, { separator = " " } = {})` — trims `name`; if no case-insensitive trimmed match returns it; else appends `separator + n` for the smallest `n ≥ 2` that is free, truncating the base to `maxLength - suffix.length` then `trimEnd()`. Tests (red first, from `site-name-policy.test.ts:6-13` verbatim with `maxLength: 200`): `' Bakery '` vs `['bakery',' BAKERY 2 ','Bakery 4']` -> `Bakery 3`; vs `['Bakery 2']` -> `Bakery`; `'Bakery'` vs `['Bakery','Bakery 3']` -> `Bakery 2`; `'Bakery 2'` vs `['Bakery 2']` -> `Bakery 2 2`; the 200-char case -> `x*198 + ' 3'`; NEW: `maxLength` smaller than the suffix does not loop forever (returns `base.slice(0, 0)`+suffix: pin the actual value by reading the loop: `base.slice(0, negative)` — **verify while writing; if it misbehaves for `maxLength <= suffix.length`, add the guard and a test, it is a latent bug in the Tovu original too**). `text/index.ts` gets one export line (text guard; A10 edits the same file).
2. Tovu `site-name-policy.ts`: delete `uniqueSiteName` and `withSuffix`; `normalized` stays for `duplicateSiteNameError`; `project-ipc.ts:37` imports `uniqueName` from `@jini-ai/core/text` and the 5 sites call `uniqueName({ name, names, maxLength: SITE_NAME_MAX_LENGTH })` (a `const`-free change; the constant already exists in `./contracts/site-name.ts`); `site-name-policy.test.ts` keeps the `duplicateSiteNameError` cases and the unique cases move to Jini (report before/after test count; none dropped). Commit messages: `feat(core/text): uniqueName` / `refactor(desktop): derive distinct site names through @jini-ai/core/text`.

## untangle overlap (execute after wave B merge)
- C5 (platform fs edits) is the row's own precondition. At integ/wave-b: `rg -n "C5" ` in `../untangle/LANES.md` lists which `platform/fs/*` files it edits; `fs/index.ts` is hot: S1 adds **one** export line, guard by text, never blob.
- A10 edits `core/text/index.ts` (S3 only: text guard).
- `shared-sites.ts` / `project-ipc.ts` are desktop arg-lane files (`../desktop-args/`): S3's `project-ipc.ts` call-site edits need the lane's `(required, optional = {})` pass applied first; re-read the 5 lines at apply time.
- A11/A23/A42 touch other desktop files (`site-preview-*`, `main/boot/*`, `site-supervisor`): disjoint.

## STOP specific to this sheet
- `apps/desktop/package.json` lacks `@jini-ai/platform` (or the Jini published pin lacks `/fs` `app-data-root`).
- A moved test needs an expectation change not listed above (the win32 separators are the only allowed one).
- Any attempt to move `site-dir-store`, `site-folders`, `site-relocation` or `site-directory-identity`: the verdict table says why they stay.
