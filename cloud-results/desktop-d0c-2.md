# desktop-d0c-2 report (wave3/desktop-d0c, 2026-11-18)

Status: **D0c1 and D0c2 DONE at proof level T; P owed (DX-OD10). D0c3 not run (BLOCKED, as ordered).** Both repos on `wave3/desktop-d0c`. Jini: no commit this run (Tovu built against the linked Jini checkout at `ccb901145`, the branch tip, unchanged).

## Done (Tovu `wave3/desktop-d0c`, each commit compiled and passed alone before the push)
| Step | SHA | What |
|---|---|---|
| D0c1.1 | `e17f1a7d` | scaffold `packages/host-shared` (`@tovu/host-shared`, npm workspace, `tsc` like `packages/contracts`, root dep `*`, desktop dep `file:`), both lockfiles, `build-server.mjs` builds it after contracts (+ its test), `dev-lite.mjs` watch root; `process-error-guards` moved with its two source-only tests and child fixture; characterization first |
| D0c1.2 | `8e4f68f1` | `product-events` moved; 3 importers |
| D0c1.3 | `dfc03c86` | `jini-routes` moved with its test; 5 importers; `_optional: Record<string, never>` -> `_optional = {}` |
| D0c2.1 | `26c8df0c` | `startup-secrets` moved; 19 importers; new characterization test file; stale path in `stage-website-shared.ts` header fixed |
| D0c2.2 | `09669849` | `daemon-connection` schemas (lines 1-25 verbatim) in host-shared; module state stays in the website; 4 importers |
Pushed fast-forward only, never `--no-verify`: D0c1 (tip `dfc03c86`) alone, six desktop gates 6/6 in the pre-push hook; then D0c2 + the report (tip `09ae8393`). The hook's FIRST attempt on that second push failed `tests` and `coverage` (one dot-reporter `X`, test not named; coverage then refuses a failed run). I ran both runners by hand on the same tree: `src/*` + `src/!(renderer|contracts)/**` 2302 tests, 2292 pass, 0 fail (exit 0); renderer + contracts 928 tests, 926 pass, 0 fail (exit 0); the retry passed 6/6. So one non-reproduced desktop test failure on this branch (the same pattern as the 'one non-reproduced coverage-gate failure' in `desktop-d0.md`); the test is unidentified.

Inventory at start: 9 modules / 11 lines, exactly the sheet's set (no STOP). After D0c1: 6 modules / 8 lines. After D0c2: 4 modules / 5 lines (`host-signals`, `observability-export`, `product-telemetry` x2, `site-paths`) = the D0c3 start set. `node apps/desktop/scripts/stage-website-shared.ts` (linked): `stage-website-shared: bundled 6 module(s)` after D0c1 (none of the moved ones); after D0c2 it bundles the 4 remaining.

## Characterization and mutation (V3, each run RED then restored)
- `installUnhandledRejectionGuard` independence (added to `process-error-reporting.unit.test.ts`, 6 -> 7 tests): green on the parent; disposer changed to `removeAllListeners` -> RED; restored.
- `jini-routes.unit.test.ts`: `expressCompatible: true` -> `false` -> RED ("a mounted list answers the spellings Express answered"); restored.
- `startup-secrets` (new `startup-secrets.unit.test.ts`, 3 tests): second call returns a new promise (`startup.then(() => {})`) -> RED. (A first mutation `Promise.resolve(startup)` stayed green because `Promise.resolve` of a native promise returns the same object: not a valid mutation, replaced.)
- `daemon-connection.unit.test.ts` (new, 4 tests): dropping `.strict()` on `ready` -> RED; dropping it on `siteIdleStopReply` -> RED.

## Gates (exact command, result)
Setup: Node 24.11.1 (`~/.local/node24`); Jini `pnpm install --frozen-lockfile`, `pnpm --no-bail -r build` exit 0; Tovu `npm ci` (root, `apps/desktop`); lockfiles regenerated with `npx npm@11.12.1 install --package-lock-only` (the bundled npm 11.6.2 rewrote ~190 unrelated lines: it drops `libc` fields and `@emnapi` entries, so it was NOT used; with 11.12.1 each lockfile gains only the host-shared entries); `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs`; contracts, sdk, host-shared built.
- Pre-push hook (D0c1 push): `PASS tree-quiet, tests, typecheck, coverage, complexity, js-backslide: 6 gates: 6 pass`.
- Final tree (after D0c2.2), `npx tsc -p tsconfig.json --noEmit` exit 0; `npm run typecheck:tests` exit 0; `npm --prefix apps/desktop run typecheck` exit 0; `npm run check:errors`: "Error gate passed: 814 findings in 482 file/rule entries" (10 entries "improved or gone" before and after: not mine; no `New:`/`Worse:` line); `npm run check:size` ok; `npm run check:complexity` ok (43 entries); `npm run check:hooks` ok.
- Files tested per commit (`node --test`, linked Jini): host-shared tests (process-error-guards, process-error-reporting, jini-routes, startup-secrets, daemon-connection), `fatal-boot-failure`, `serve-command-wiring`, `serve-import-cleanup`, `agent-daemon-installs-unhandled-rejection-guard`, `product-telemetry`, `tool-catalog-*`, `federation-runtime-wiring`, startup-secrets importers (`startup-secrets.unit`, `desktop-mcp-runtime.process-env`, `boot-credential-order.pins`, `daemon-startup-secrets`, `index-boot.characterization`), `assistant-daemon-connection`, `build-server-portable` (6/6); desktop `product-telemetry-boot`, `product-telemetry-ipc`, `desktop-agent*`, `tovu-server*` (123), `desktop-agent-service` (25).

## BASE-RED (recorded on the unmodified base; pass = no new line)
Same five failures before and after my commits, none touches a moved line:
1. `serve-command-wiring`: "runServeCommand's body passes the resolved host into app.listen(port, host)"
2. `serve-command-wiring`: "the BR-07 shutdown uses the shared bounded store close with the composition and boot work"
3. `process-error-guards.unit` (now in host-shared): "with the guard installed, the SAME unhandled rejection is logged ..." (also fails on the parent path)
4. `fatal-boot-failure`: "installUnhandledRejectionGuard's default logger writes the rejection to console.error" (the logger prints `'Error'` instead of the error under the linked Jini)
5. `composition-boot-order`: "index.ts main(): the content.db schema guard ..." (a source-anchor test: its anchor sits outside `main()` in `index.ts`; same line at `faa0b6b7`)
- `npm run check:boundaries`: 108 dependency violations (16 errors), identical count before and after (the only change is the module count 6367 -> 6363).
- `npm run check:why-comments` (after `git fetch origin refactor/terra`): 4 lost blocks, all in `platform/server-logs/{console-tee,redact-local-text}` (D0b's move to Jini, in the base); none from this run. The three moved files' comment sets are identical old vs new (`diff` empty; `daemon-connection` gains one duplicated file-header line, none lost).

## Deviations to judge (read these)
1. **`serve-command-wiring.unit.test.ts` mock seam.** Its `module(relative, stubs)` helper builds `new URL(relative, import.meta.url)`, which cannot take a package specifier. Allowed edit (b) changes "only the specifier string"; here the string alone cannot work, so the two calls (`process-error-guards`, `startup-secrets`) pass `import.meta.resolve("@tovu/host-shared/<name>")` instead of a relative path. Mocked names and every assertion are byte for byte. `serve-import-cleanup.unit.test.ts` needed only the specifier string. Both tests pass exactly as at base (same 2 base-red failures in the wiring test).
2. **Child-process scripts.** `startup-secrets.unit.test.ts` and `boot-credential-order.pins.unit.test.ts` import the module by `moduleUrl('../startup-secrets.ts')` inside a script string; those two string-built specifiers became `'@tovu/host-shared/startup-secrets'` (resolved from the repo-root cwd). The sheet's census did not list this form.
3. `build-server-portable.test.mjs`: the fake-`runNode` call list gained the host-shared build and `calls.length` went 3 -> 4 (direct consequence of the sheet's build-server step).
4. Three comment-only mentions of the old path remain in tests I did not touch (`store.unit.test.ts:185`, `agent-daemon-installs-unhandled-rejection-guard.unit.test.ts:12,18,35`): the sheet allows no other test edit. `index.ts:127` and `agent-daemon-server.ts:157,176` keep "process-error-guards.ts's own header" (the file name is unchanged).
5. `fatal-boot-failure.unit.test.ts` stays in the website (it reads `index.ts`); `startup-secrets.unit.test.ts` stays (imports 8 website modules): both repointed, not moved. The sheet's "tests that move" for startup-secrets was therefore the new characterization file only.

## Left / next step
- **P owed (DX-OD10)** for D0c1 + D0c2 (the packaged main loads all five modules): needs the Jini `0.7.1-next.N` snapshot with the D0b/D0d entries. Then COMMON section 6: (1) `npm --prefix apps/desktop run stage`, (2) package, (3) `node scripts/verify-staged-closure.ts --asar <archive>` and show each `@jini-ai/*` that host-shared imports resolves to ONE copy inside the archive (duplicate-instance check), (4) CI `build` job on macOS and Windows. Also confirm `@tovu/host-shared` is inside `app.asar` (not listed in `stage-payload-lib.ts`; the desktop gets it as a `file:` dependency like `@tovu/contracts`).
- D0c3 stays BLOCKED (design). D0e remains an outline.
- Judge: the two deviations in 1 and 2 above.

## Overlaps with other runs
Touched shared files: `apps/desktop/src/main/index.ts`, `tovu-server.ts`, `desktop-agent.ts` (one import line each), `desktop-agent-service.ts`, `main/updates/product-telemetry-boot.ts`, `product-telemetry-ipc.ts`, `scripts/stage-website-shared.ts` (header comment), `package.json`, `package-lock.json`, `apps/desktop/package.json`, `apps/desktop/package-lock.json`, `development/scripts/{build-server.mjs,dev-lite.mjs,error-gate-debt.json}`, `development/evals/tool-search-caller2-compliance-harness.ts`, and website importers listed by the censuses. Any parallel run editing the lockfiles must re-run `npm install` after rebase (not merge by hand).

## SHAs
Tovu `wave3/desktop-d0c`: `e17f1a7d`, `8e4f68f1`, `dfc03c86` (D0c1), `26c8df0c`, `09669849` (D0c2), `09ae8393` (report); this final report-SHA commit follows it. Jini `wave3/desktop-d0c`: unchanged at `ccb901145`, nothing pushed.
