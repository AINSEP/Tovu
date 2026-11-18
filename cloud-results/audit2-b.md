# audit2-b (wave3/audit2-a) — Tovu report

Base: `origin/wave3/audit2-a` `d8aa3fdb` (Tovu) / `6c6557ab` (Jini), same branch, fast-forward only. Node 24.22.3 (nodejs.org tarball). Jini: `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build` (exit 0). Tovu: `npm ci` (root + `apps/desktop`), `link-jini.mjs`, contracts + sdk built. Base was green: desktop `npm run typecheck` exit 0 (electron IS installed this time), `jini-mcp-peers` 8/8, token tests 23/23.

## Done
| sheet | status | commits |
|---|---|---|
| A60 S2 (desktop token map) | DONE | Tovu `fa514275` (+ why-comment follow-up `ab60b2f4`) |
| A58 (desktop version + update bridge) | DONE (S1r Jini + S2r Tovu) | Jini `f80980fa`; Tovu `af2ebb2c` |
| A10 V4-V8, A01, A11, A14 | NOT RUN (blocked / owner questions, per the run brief) | — |

(Final SHAs are re-stated in the closing message; the report commit itself follows these.)

## A60 S2 — `fa514275`
- RED first: with the source edit applied and no declaration, `src/jini-mcp-peers.test.ts` failed `runtime source imports declare their packages instead of relying on hoisting` (offender `apps/desktop/src/agent-plugin-tokens.ts: @jini-ai/agent-plugins`). After the dependency: 8/8.
- Dependency: `apps/desktop/package.json` gets `"@jini-ai/agent-plugins": "^0.7.0"` beside agent-runtime. First attempt `npm install --prefix apps/desktop --save ...` re-sorted the whole dependency block and wrote `^0.7.2`; I reverted that, hand-added the one manifest line, and let `npm install --prefix apps/desktop` regenerate the lock from it (never hand-edited). Final diff: `package.json` 1 insertion; `package-lock.json` 34 insertions, 1 deletion = the new package entry (0.7.2, optional peers only) plus one `semver` `"dev": true` -> `"devOptional": true` flag (same version; npm bookkeeping because agent-plugins lists semver as an optional peer). No other resolved version changed.
- Source: `cleanCreateTokens` -> `parsePluginTokenMap` + spread (restores an ordinary prototype); `parsePluginList` -> `decodeTokenSignInEntries`; `TokenSignInPlugin` type from `@jini-ai/agent-plugins/connect` (also in `project-ipc.ts`); `TOKEN_LIMITS` keeps the three constants Tovu-owned. Both desktop token test files untouched (23/23, no assertion removed).
- **P owed / known break against the registry copy:** published `@jini-ai/agent-plugins@0.7.2` does NOT contain `parsePluginTokenMap` (checked: `npm pack` + grep of `dist`). Tovu's desktop typecheck/build against the lockfile copy fails until a Jini snapshot containing fa1d2026 is published and the range/lock moved (DX-OD10). Everything here is verified on the linked Jini only.

## A58 — Jini `f80980fa`, Tovu `af2ebb2c`
Sheet guards held (blobs of the four Tovu files; `resolveDevAppVersion`/`registerAppVersionBridge` present in `electron/app-version.ts`; `createAppVersionLoader|createUpdateCheck|"./app-version"` absent in desktop-host; census hits all within the sheet's file list).
- Jini (A58-1r): `_optional: Record<string, never> = {}` -> `_optional = {}` on both landed functions; added the one missing characterization case (empty tag `""`, plus the bare-prefix wording) to `src/electron/__tests__/app-version.test.ts` (passes against the landed code). New `src/app-version/{store,loader,update-check,index}.ts` + tests (11), entry `./app-version` (universal) in `package.json` exports + `jini.entries`, README row, changeset `desktop-host-app-version-controllers.md` (minor). `store.ts` is an internal ~25-line cell shared by both controllers (not exported from the entry; the sheet lists only loader/update-check, this avoids duplicating the listener set).
  - RED first: both new test files failed to load (`../loader.js` / `../update-check.js` missing), then GREEN.
  - Mutations, each caught: drop the `live` guard (loader), drop the `checking` guard, drop `onDone` in `finally` (2 tests fail), drop the reset in `start()` (this one SURVIVED the first version of the restart test, so the test was rewritten to read the version first; now caught).
- Tovu (A58-2r): `registerAppVersionIpc` keeps its exact signature and is one `registerAppVersionBridge` call (`versionFromTag` = today's `desktop-v` rule, `devSuffix: '-dev'`, `channel: RUNNER_APP_VERSION_CHANNEL`); `devAppVersion` and `DescribeDesktopTag` deleted (type is the engine's `DescribeReleaseTag`); `describeDesktopTag` (real git) stays. `useAppVersion` = `useMemo(createAppVersionLoader)` + `useEffect(start)` + `useSyncExternalStore`. `useUpdateCheck` = same over `createUpdateCheck`, `onDone` held in a ref, `report` keeps the exact `[tovu-desktop] check for updates:` text.
  - Test counts: `app-version-ipc.test.ts` 5 before, 5 after. Deleted: nothing outright. The only test that called `devAppVersion` directly ("dev launch without git or a tag falls back...") was rewritten through the real registrar (`devVersionFor`): its throw / empty-tag cases are covered in Jini by `falls back to the package version for a non-release tag, a bare prefix, an empty tag or a failing port`; the Tovu test now also pins the `desktop-v` rule (bare prefix, `release-v0.1.24`) and the `-dev` suffix. The existing "dev launch: nearest desktop-v tag plus -dev" test already pins the binding. New: `use-update-check.hooks.bridge.render.test.ts` (3 tests: stale preload, latest `onDone` + survives re-render, logged text + menu closes).
  - Mutations, each caught: `devSuffix: ''` (2 tests fail), dropping the `desktop-v` startsWith (first version of the test survived with `v0.1.24`; case changed to `release-v0.1.24`, now caught), passing `onDone` directly instead of via the ref (hook test fails).
  - Hook tests `use-app-version.hooks.bridge.render.test.ts` and `imported-hooks.hooks.test.ts` UNCHANGED and green (4 + 8).
- Renderer production bundle resolves `@jini-ai/desktop-host/app-version` (`npx vite build` to a scratch dir: built, exit 0).
- **P owed:** the packaged desktop needs a published desktop-host snapshot that contains `./app-version` (and the `registerAppVersionBridge` landed in 405e8c9c); the lock still pins registry 0.7.x without it. Same DX-OD10 item as above.

## Gates (exact command -> result)
Jini (`packages/desktop-host` unless noted):
- `npx vitest run src/app-version` -> RED: 2 files failed to load; GREEN after code: 11 passed. `npx vitest run src/app-version src/electron/__tests__/app-version.test.ts` -> 15 passed.
- `npx vitest run` (whole package) -> 83 files passed, 1 skipped; 714 tests passed, 1 skipped, 0 failed.
- `npx tsc -p tsconfig.json --noEmit` -> clean. `pnpm --filter @jini-ai/desktop-host run build` -> ok (`dist/app-version/*` emitted). `npx eslint` on the new dir + the two touched files -> clean.
- `pnpm guard` (Jini root) -> "ok — self-test passed ... zero violations".
Tovu (linked to local Jini):
- `cd apps/desktop && npm run gates` -> all six PASS (tree-quiet, tests, typecheck, coverage, complexity, js-backslide) on a committed tree, run for A60 and again for A58. (On an uncommitted tree `tree-quiet` fails by design; that was the only fail.) The pre-push hook runs the same gates; the A60 push went through it.
- `npm run typecheck` in `apps/desktop` -> exit 0 at base, after A60, after A58 (0 `error TS`).
- `node --test` token tests 23/23; `jini-mcp-peers` 8/8 (RED before the dependency, see above); `app-version-ipc.test.ts` 5/5; hook render tests 12 + 4 + 3 green; `SettingsControl.render`, `App.render`, `SiteGrid.jsdom`, `LoadedSitesStepper.render` 73/73.
- `npx eslint` on the touched files -> clean except the pre-existing `sonarjs/code-eval` warning in `app-version-ipc.test.ts` (the `new Function` helper, unchanged). `project-ipc.ts` was already 900 lines at base (`max-lines`); this run added one import line to it; `check:size` is ok.
- `npm run check:size` ok (203 violations, 193 debt entries). `check:complexity` ok (42 entries). `check:errors` ok (816 findings, improved from 817). `check:hooks` ok (apps/desktop 35, unchanged). `check:why-comments` -> first run on the committed tree reported 6 lost blocks (the comments of removed local types/helpers); each put back beside the code that now uses it (`af2ebb2c` for A58 files, `ab60b2f4` for the A60 file; the pushed `fa514275` alone fails this check, fixed by the follow-up) -> final: `0 comment blocks lost`.
- `npm run check:architecture` -> exit 1 at base AND after, identical lines (propagation 3.06 -> 3.18, API surface 821 -> 853, hub count 335 -> 363, +1/-2 cycle pairs): BASE-RED, no new line.

## Left / next step
- Publish a Jini snapshot that contains `agent-plugins/connect` token-map (fa1d2026) and `desktop-host/app-version` (f80980fa), then move the `@jini-ai/agent-plugins` / `@jini-ai/desktop-host` ranges + `apps/desktop/package-lock.json` to it and re-run the packaged-desktop proof (DX-OD10).
- A10 V4-V8, A01, A11, A14: not run (blocked / owner questions).

## Overlaps with parallel runs
Tovu: `apps/desktop/package.json` + `package-lock.json` (any lane adding a desktop dependency: on a lock conflict re-run `npm install --prefix apps/desktop`, never merge the lock), `apps/desktop/src/app-version-ipc.ts`, `agent-plugin-tokens.ts`, `project-ipc.ts` (one import line), the two `renderer/use-*-hooks`. Jini: `packages/desktop-host/package.json` (exports + `jini.entries`), its README entry table.
