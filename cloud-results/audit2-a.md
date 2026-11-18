# audit2-a (wave3/audit2-a) — Tovu report

Base: Tovu `ada11733f` / Jini `4c1892368` (origin/refactor/terra). Branch `wave3/audit2-a` in both repos. Node 24.11.0 (nodejs.org tarball), Jini `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build` (exit 0), Tovu `npm ci` (exit 0), `link-jini.mjs`, contracts + sdk built.

## Status by sheet

| id | status |
|---|---|
| A11 | STOPPED, no sheet exists (see drift) |
| A60 | PARTIAL: Jini S1 + website S3 done; desktop S2 STOPPED (needs a new dependency) |
| A01 | STOPPED, no sheet; remaining row items are not drop-in |
| A10 | STOPPED, sheet drifted (Jini core already has a different `formatByteSize` contract) |
| A14 | STOPPED, no sheet exists |
| A58 | STOPPED, sheet drifted (Jini registrar already landed with another contract) |

## A60 — done

- Jini `fa1d2026f` `feat(agent-plugins/connect): bounded token-map and token-sign-in entry validation`: `packages/agent-plugins/src/connect/token-map.ts` (`parsePluginTokenMap`, `decodeTokenSignInEntries`, exported through the existing `./connect` entry), 13 tests, changeset.
  - Red first: the test file failed to load (`../token-map.js` missing) before the module existed.
  - Mutations, each caught: dropping `Object.create(null)` (prototype test), dropping the length check (4097 case), dropping the `^` anchor on `https` (anchored-start test).
- Tovu: `apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts` `parseNewSiteAgentPluginTokens` is a binding over `parsePluginTokenMap` (the website already imports `@jini-ai/agent-plugins/connect`). Signature and error constant unchanged; the unit tests are unchanged.

## A60 — what the sheet got wrong (for whoever revises it)
1. `constructor` is NOT refused by the id pattern (`/^[a-z0-9][a-z0-9-]{0,63}$/` admits it). Only `__proto__` is refused (underscore). The null-prototype result is what makes `constructor` harmless; the Jini test pins that instead of the sheet's claim.
2. Jini `packages/agent-plugins/package.json` blob differs from the sheet (`58a06930` vs `e32f6ca9`): an unrelated `admin-surfaces/node` commit. The `./connect` entry is intact, so this is benign.

## A60 desktop S2 — STOPPED (sheet STOP rule: new dependency)
`apps/desktop/package.json` does not declare `@jini-ai/agent-plugins`. Importing it from `apps/desktop/src/agent-plugin-tokens.ts` fails the existing test `runtime source imports declare their packages instead of relying on hoisting` (`src/jini-mcp-peers.test.ts:120`, offender `apps/desktop/src/agent-plugin-tokens.ts: @jini-ai/agent-plugins`). Fixing it needs a new dependency line and a lockfile change, which the run rules forbid. I applied the edit, saw the failure, and reverted it. Nothing about the desktop is left changed. Next step: owner or a run with lockfile permission adds `@jini-ai/agent-plugins` to `apps/desktop/package.json` (and the desktop packaging peer selection), then applies sheet S2 verbatim (the edit is small: `cleanCreateTokens` body, `parsePluginList` body, `TokenSignInPlugin` type import in `project-ipc.ts:54`). The desktop token tests (23) passed with the edit in place.

## Drift lists (STOPPED sheets)

### A11 (desktop site preview -> desktop-host/preview)
No sheet exists on any of `plan/audit2-sheets-a`, `-a2`, `-a3`, `-b`, `-b2` (checked file lists). Only the TSV row exists, and it says `needs Opus` and `packaged-desktop-proof`. This environment has no `electron`/`electron-updater`/`@electron/asar` installed (desktop `tsc` and 11+ desktop tests fail at base for that reason), so no packaged proof can run. Needs a sheet first.

### A14 (desktop/scripts packaging checks)
No sheet exists (same check). Row requires a "same inputs give same gate output" release-gate proof that this environment cannot run (no Electron).

### A01 (Tovu wrappers -> existing Jini exports)
No sheet exists. Earlier run already landed `7756ba36` (use-focus-trap wrapper, sqlite-source forwarder, service-ports type re-exports, site confirm over `useConfirmRequest`) and `68d52de7`/`c15b046d` for icons/byte labels. Remaining row items checked on terra, none is a drop-in:
- `StaticSiteTab.hooks.ts` `useCopyLine` vs `@jini-ai/ui` `useCopyToClipboard`: Tovu's version silently swallows clipboard errors and uses `navigator.clipboard` only, Jini's takes a `ViewerClipboardPort`, falls back to `execCommand`, returns a boolean. Behaviour changes, needs a decision.
- `apps/desktop/.../Spinner.tsx` vs `@jini-ai/ui` `Spinner({ size, label })`: different markup and class (`span.spinner[aria-hidden]` vs a sized, labelled element); also `apps/desktop` does not declare `@jini-ai/ui` (same dependency STOP as A60).
- `ConfirmActionDialog`: row itself says not drop-in (`dialogRef/titleId/extra/handles` vs `open/title/body/confirmLabel`), waits on C2 pass B0.
- `widget-picker-port.hooks.ts`: its own doc comment records why it must not reuse `AdminWidgetsPort` (components below features); the Tovu `AdminWidget` types also differ.
- `translation-entry.ts`: exists only to dodge `sonarjs/no-hardcoded-passwords`; "inlined" would re-trigger the rule. `viewer-time-zone.ts` is 4 lines and the row says it keeps its `'UTC'` fallback.
- `use-edit-media-modal.hooks.ts` -> `useNativeDialog`, `UserInterfaceSettingsPanel.tsx` -> ui-kit `Switch`, `use-import-website`/`use-workspace-chat-pane` copy + folder-drop slices: markup/behaviour parity needs the visual proof the row does not give.
Next step: a sheet per item with the parity decision (copy semantics, Spinner markup) made by the owner.

### A10 (byte-size formatters)
Sheet facts that no longer match on terra:
- `jini_must_not_exist: packages/core/src/text/format-byte-size.ts` fails: it exists (`6f8dc8c2 feat(core): one byte-size display label in core/text; admin/media drops its copy`) with a **different, smaller contract**: `formatByteSize({ bytes }, { locale, megabyteLabel })`. The sheet's contract (`labels`, `kilobyteDigits`, `trimZeroDecimal`, `largestUnit`, `invalid`, `zero`) is absent, so the parity table (V2, V4-V8) cannot be satisfied without widening an already-exported API.
- V1 (`admin/media` `formatByteSize`) and V3 (`install-archive-size.ts`) are already gone from Tovu/Jini (done by the earlier run, via `megabyteLabel`).
- Still present: V2 `site-transfer-rules.ts` `formatTransferBytes`, V4 `site-backup/sources.ts` `formatByteSize`, V5a-c, V6, V7, V8 in Jini ui/admin.
Next step: revise the sheet to extend the landed `FormatByteSizeOptions` (or decide to leave V2/V4-V8), then run S2/S3.

### A58 (desktop version + update bridge)
Sheet facts that no longer match:
- Guard `rg "createAppVersionLoader|resolveDevAppVersion|registerAppVersionBridge" packages` must print nothing: it prints `packages/desktop-host/src/electron/app-version.ts` (+ test), landed by `405e8c9c feat(desktop-host): app-version IPC bridge with injected tag convention`, exported from `src/electron/index.ts`, NOT from a new `./app-version` universal entry.
- Its contract differs from the sheet: `resolveDevAppVersion({ repoRoot, packageVersion, versionFromTag, describeTag, devSuffix })` and `registerAppVersionBridge({ ipcMain, app, channel, repoRoot, versionFromTag, describeTag, devSuffix })` instead of `tagPrefix`.
- Still absent: `createAppVersionLoader` and `createUpdateCheck` controllers, and every Tovu repoint (the six Tovu blobs match the sheet: `app-version-ipc.ts` `83f342f7`, both hooks, contracts, both tests).
Next step: revise the sheet to the landed contract (Tovu passes `versionFromTag: (tag) => ...` for `desktop-v`, `devSuffix: "-dev"`; controllers go beside it) and then run S1b + S2.

## Gates (exact command -> result)
Jini (cwd `packages/agent-plugins` unless noted):
- `npx vitest run src/connect/__tests__/token-map.unit.test.ts` -> 13 passed (red first: failed to load; 3 mutations caught).
- `npx vitest run` (ALL 148 files of the touched package) -> 2178 passed, 2 skipped, 0 failed. (`--maxWorkers=2` conflicts with this package's vitest 2 config, so it ran with defaults.)
- `npx tsc -p tsconfig.json --noEmit` -> clean. `npm run build` -> ok.
- `npx eslint` on the two new files -> clean (the first version had complexity 12, split into `isAcceptableEntry`).
- `pnpm guard` (Jini root) -> "ok — zero violations".
Tovu (linked to local Jini, contracts + sdk built):
- `npm run typecheck` equivalent `npx tsc -p tsconfig.json --noEmit` -> clean.
- Website consumers: node:test over `new-site-agent-plugin-tokens.unit.test.ts`, `tw2-L224-characterization.unit.test.ts`, the two other files naming the parser, and every file in `apps/website/src/features/agent-plugins/__tests__/unit/` -> 1200 tests, 1196 pass, 4 skipped, 0 fail.
- `npm run check:size` -> exit 0. `npm run check:errors` -> exit 0.
- `npm run check:complexity` -> base exit 0 ("ok: 43 entries"). After the edit it demanded `Delete stale debt entry: ...parseNewSiteAgentPluginTokens#1 [complexity] 11` (the function dropped below the limit); that one entry was deleted by hand from `development/scripts/src-complexity-debt.json`, no `--update`. Now exit 0, "ok: 42 entries".
- `npm run check:architecture` -> exit 1 at base AND after, output identical to base (BASE-RED: propagation 3.18, API surface 853, hub count 363, one new cycle pair). No new line.
- Desktop (NOT part of the commit, the edit was reverted): 23 token tests passed with the edit; full desktop suite had 19 failures, 18 reproduce on the unmodified tree for environment reasons (no `electron`, `electron-updater`, `@electron/asar`, `@mcp-ui/client` installed; compiled preload not built; Playwright journey harness) and 1 was caused by the A60 desktop edit (the missing-dependency test above), which is why it was reverted. I re-ran the 11 that are cheap to re-run on the reverted tree and they fail identically; the compiled-preload, journey-harness and `window.tovu*` tests I did not re-run on the reverted tree (they need the preload build that cannot compile here).
- Desktop `tsc -p tsconfig.main.json --noEmit`: 81 error lines before and after (all missing `electron`).
- `npm test` in `apps/desktop` cannot run as written here (its `pretest` builds the preload, which needs `electron` types); I ran its two `node --test` commands directly.

## Overlaps with parallel runs
`apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts` (CLASSIFY rows 147 / A56) and `development/scripts/src-complexity-debt.json` (any lane that fixes a debt entry also edits it; a rebase conflict there resolves by keeping both deletions). Jini: `packages/agent-plugins/src/connect/index.ts` (one added export line).

## Pushed
See the final message for SHAs.
