# SPLIT-A58: desktop app-version resolver + update-check controller -> `@jini-ai/desktop-host/app-version` (templates T-SPLIT, T-MOVE)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A58`. No blockers: no kit, no untangle lane touches these files (verified: `rg -n "app-version|use-app-version|use-update-check" apps packages --glob '!**/node_modules/**'` lists only the files below).

Tier: S1 Sonnet + review, S2 Sonnet. est. executor tokens ≈ 35k (S1 22k, S2 13k). No Chrome look (no visual change); owed: one `pnpm --filter @tovu/desktop test` batch run.

## Findings that change the audit row
1. **`desktop-host` has no React and no peer deps** (`packages/desktop-host/package.json`: `dependencies: { @jini-ai/core }`, `peerDependencies: {}`). The audit says "`useAppVersion`/`useUpdateCheck` -> desktop-host". Adding `react` would be a new third-party dependency = COMMON rule 9 STOP. Decision: Jini takes the **framework-free controllers** (`createAppVersionLoader`, `createUpdateCheck`: `subscribe`/`getSnapshot` stores) and the Tovu hooks become ~15-line `useSyncExternalStore` bindings that stay in Tovu (a binding, not a forwarder: it owns the React edge).
2. **`resolveOnPath` + `execFile` cannot move**: `resolveOnPath` is `@jini-ai/agent-runtime` (rule 5: no cross-package import) and `execFile` is `node:child_process` (a `universal` entry must not touch it). So `describeDesktopTag` (the real git port) STAYS in Tovu; Jini takes `describeTag` as a REQUIRED port.
3. **`desktop-v` convention is Tovu's**: the tag prefix becomes a required arg `tagPrefix`; the IPC channel ids (`runner:app:version`, `runner:app:check-for-updates`) stay in `apps/desktop/src/contracts/app-version.ts` (wire contract with the preload, `preload.mts:30,100,109`).
4. `update-check-now.ts` (the main-side `checkNow`, 175+ lines) is NOT in the row and stays Tovu; only its channel import is untouched.
5. `console.error('[tovu-desktop] …')` in `use-update-check.hooks.ts:34` is a product-prefixed console call: rule 7 -> injected `report` port; Tovu binds it to the same `console.error` text (test pins the text, below).

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/desktop/src/app-version-ipc.ts | blob 83f342f717925cc3db9c97425f6ccff7b13de0ab | keep-reduced (describeDesktopTag + registerAppVersionIpc binding)
  - apps/desktop/src/renderer/use-app-version.hooks.ts | blob d47aad987dabf5336a36e84fabac76de50b2391b | keep-reduced
  - apps/desktop/src/renderer/use-update-check.hooks.ts | blob bbdbacad94463e9c7e36681d5eda7287e3fb4b76 | keep-reduced
  - apps/desktop/src/contracts/app-version.ts | blob ebc69701a56c30aa6e61276ca19843dd049e5bb5 | keep (channel ids)
tovu_tests:
  - apps/desktop/src/app-version-ipc.test.ts | blob c418fd7a61d7c96997964f6672c44e105b8a614c | split: the 3 behaviour tests move to Jini, the 3 source-wiring tests stay
  - apps/desktop/src/renderer/use-app-version.hooks.bridge.render.test.ts | blob 3469b18086c0eb783d12cbf7f9417c1a52144b61 | stays (hook contract unchanged)
tovu_importers_unchanged: preload/preload.mts, renderer/runner-api.ts, renderer/app/{TopNav,SettingsControl}.tsx, main/index.ts:141,1031, main/boot/boot-sequence.ts:134,165
jini_guards:
  - packages/desktop-host/package.json | blob a07bcef802cc94349fc1781002a45cf63bf6f876
  - packages/desktop-host/src/index.ts | blob f6afc28b6c613e9c633afb39519317dc9dade30e
  - packages/desktop-host/src/app-version/ must not exist; `rg -n "createAppVersionLoader|resolveDevAppVersion|registerAppVersionBridge" packages --glob '!**/dist/**'` prints nothing
```

## Importer census (Tovu, `rg -n "app-version-ipc|contracts/app-version|use-app-version|use-update-check|registerAppVersionIpc|devAppVersion|describeDesktopTag" apps packages --glob '!**/node_modules/**'`)
Hooks consumers: `TopNav.tsx:6,40` (`useAppVersion({})`), `SettingsControl.tsx:6,35` (`useUpdateCheck({ onDone })`), `imported-hooks.hooks.test.ts:13`. IPC: `main/index.ts:141,1031` (`registerAppVersionIpc({ ipcMain, app }, { repoRoot: REPO_ROOT })`), `boot-sequence.ts` only passes a thunk. Contract: `preload.mts:30`, `runner-api.ts:32`, `update-check-now.ts:8`, tests. Allowed hit list is exactly these; any other = STOP.

## Ports and signatures (Jini, `packages/desktop-host/src/app-version/`)
```ts
// rules.ts (pure)
export type DescribeTag = (required: { cwd: string }, optional?: Record<string, never>) => Promise<string>;
export function resolveDevAppVersion(
  required: { repoRoot: string; packageVersion: string; tagPrefix: string; describeTag: DescribeTag },
  optional: { devSuffix?: string } = {},
): Promise<string>;                      // never rejects; tag "<prefix>1.2.3\n" -> "1.2.3-dev"; empty/throw -> "<pkg>-dev"
// register.ts
export interface AppVersionIpcMain { handle(channel: string, listener: () => string | Promise<string>): void }
export function registerAppVersionBridge(
  required: { ipcMain: AppVersionIpcMain; app: { getVersion(): string; isPackaged: boolean }; channel: string;
              repoRoot: string; tagPrefix: string; describeTag: DescribeTag },
  optional: Record<string, never> = {},
): void;
// loader.ts (framework-free, useSyncExternalStore-shaped)
export interface AppVersionBridge { getAppVersion?: () => Promise<string> }
export interface AppVersionState { version: string | null; error: string | null }
export function createAppVersionLoader(
  required: { bridge: AppVersionBridge | undefined },
  optional: Record<string, never> = {},
): { subscribe(listener: () => void): () => void; getSnapshot(): AppVersionState; start(): () => void };
// update-check.ts
export interface UpdateCheckBridge { checkForUpdates?: () => Promise<void> }
export interface UpdateCheckState { available: boolean; checking: boolean }
export function createUpdateCheck(
  required: { bridge: UpdateCheckBridge | undefined; onDone: () => void; report: (required: { message: string }, optional?: Record<string, never>) => void },
  optional: Record<string, never> = {},
): { subscribe(l: () => void): () => void; getSnapshot(): UpdateCheckState; checkForUpdates(): Promise<void> };
```
The old positional `describeTag({ cwd })` already matched `(required, optional?)`. `registerAppVersionIpc`'s second-arg `{ repoRoot = process.cwd() }` default dies: `process.cwd()` is Node state, the host passes `repoRoot` (rule 8 spirit). Entry: `./app-version` tag `universal` (no `node:` import).

```
id: SPLIT-A58-1 .. SPLIT-A58-2
feature: desktop version + update bridge
jini_target: desktop-host src/app-version/{rules.ts,register.ts,loader.ts,update-check.ts,index.ts}; package.json exports + jini.entries "./app-version": "universal"; README line
changeset: @jini-ai/desktop-host: minor | "app-version: dev-version resolver, IPC registrar, and version/update-check controllers"
```

## SPLIT-A58-1 — Jini (commit 1, Opus review of ports)
0. Branch rule; blobs; guard `rg` prints nothing.
1. **Tests first** (new, vitest, `src/app-version/__tests__/`): `rules.test.ts` = the three behaviour tests of `app-version-ipc.test.ts:27-65` rewritten (cases: tag `desktop-v0.1.24\n` -> `0.1.24-dev`; throw -> `0.1.22-dev`; `''` -> `0.1.22-dev`; NEW: tag equal to the bare prefix -> package fallback; NEW: a tag without the prefix -> fallback; custom `devSuffix`). `register.test.ts` = packaged (reads `getVersion` on each call, no `describeTag` call, handler registered once on `channel`) and dev (`describeTag` called once with `cwd: repoRoot`, two requests, one git read). `loader.test.ts` = from `use-app-version.hooks.bridge.render.test.ts` + `imported-hooks.hooks.test.ts` cases: one read per `start()`, reply after the returned dispose is dropped, missing method -> `{version:null,error:null}` and no read, rejection keeps `error.message`, non-Error rejection -> `String(e)`. `update-check.test.ts`: `available` false without method, one check at a time (second call while `checking` is a no-op), `onDone` runs after success AND after rejection, rejection calls `report({ message })` once, `checking` back to false.
2. Code (pure moves except the stores, source = the two Tovu hooks' bodies minus React): `useState`+`useEffect` become a closure-held state object plus `listeners` set; `live` flag becomes the `start()` disposer. Every function ≤ 50 lines, complexity ≤ 10, `(required, optional = {})`. No `process`, no `console`, no `node:`.
3. `index.ts` barrel; package.json export entry (mirror `./electron/updates` block) + `jini.entries`; README; changeset. Do NOT add it to `src/index.ts` (root entry stays desktop-only).
4. Checks COMMON 2-9: `rg -n -i "tovu|runner:app|desktop-v" packages/desktop-host/src/app-version` prints nothing except the test fixtures' `tagPrefix: 'desktop-v'` (a literal test input: rename to `'rel-v'` so the rg is clean). Commit `feat(desktop-host/app-version): dev-version resolver, IPC registrar, controllers`.

## SPLIT-A58-2 — Tovu (commit 2, Sonnet; after S1)
1. `app-version-ipc.ts` (edit): delete `DescribeDesktopTag` alias -> `import type { DescribeTag } from '@jini-ai/desktop-host/app-version'`; keep `describeDesktopTag` (real git, `resolveOnPath`, `execFile`) typed as `DescribeTag`; delete `devAppVersion` and the body of `registerAppVersionIpc`, which becomes `registerAppVersionBridge({ ipcMain, app, channel: RUNNER_APP_VERSION_CHANNEL, repoRoot, tagPrefix: 'desktop-v', describeTag }, {})` with `{ describeTag = describeDesktopTag, repoRoot = process.cwd() }` kept as Tovu's optional args (the signature `registerAppVersionIpc({ipcMain, app}, {repoRoot})` is unchanged so `main/index.ts:1031` and the AST pin on its text stay valid). The product comment (owner 2026-10-26, dev shows nearest tag) MOVES to the Jini `resolveDevAppVersion` doc reworded neutral ("a dev launch from any branch otherwise shows the last bumped package version"); the `desktop-v` naming stays here.
2. `use-app-version.hooks.ts` (edit): `useMemo(() => createAppVersionLoader({ bridge }, {}), [bridge])` + `useEffect(() => loader.start(), [loader])` + `useSyncExternalStore(loader.subscribe, loader.getSnapshot)`; keep the exported `AppVersionState` as `export type { AppVersionState } from` is a re-export = forbidden: import the type and re-declare nothing; consumers (`TopNav.tsx`) use inference, check `rg -n "AppVersionState" apps` and import the type from Jini where named.
3. `use-update-check.hooks.ts` (edit): same pattern with `createUpdateCheck({ bridge, onDone, report: ({ message }) => console.error(`[tovu-desktop] check for updates: ${message}`) }, {})`; `onDone` is held in a ref so an inline arrow from `SettingsControl` does not rebuild the controller each render (test: `imported-hooks.hooks.test.ts` renders with a fresh arrow every time).
4. `app-version-ipc.test.ts` (edit): delete the three tests now in Jini (lines 27-65), keep the preload/main wiring tests (lines 67-93) unchanged, keep the packaged-handler check as ONE smoke assertion that `registerAppVersionIpc` registers `RUNNER_APP_VERSION_CHANNEL` only. Record test counts before/after (honest-testing: moved, not dropped).
5. Census: `rg -n "devAppVersion|DescribeDesktopTag" apps` prints nothing; eslint on the 3 touched `.ts` files + the test; commit `refactor(desktop): app version and update check on @jini-ai/desktop-host/app-version`.

## untangle overlap
None. A41 (workspace chat transport) and A42 touch other `apps/desktop/src` files; `boot-sequence.ts` is read-only here. `main/index.ts` is edited by untangle R11 (sidecar, wave D): the line `registerAppVersionIpc({ ipcMain, app }, { repoRoot: REPO_ROOT })` is left byte-identical on purpose.

## STOP specific to this sheet
- The Tovu hook tests need a changed assertion (a hook-contract change is out of scope).
- `desktop-host` gains a `react` import (rule 9).
- A census hit outside the lists above.
