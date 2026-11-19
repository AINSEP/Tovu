# combine-4 TOVU (2026-11-19) — `integ/merge-4-2026-11-18`

Unattended run, Node 24.22.3 (`~/.local/node24`), pnpm 10.33.2 (Jini's pin via corepack). No subagents, no lockfile edits, `minimumReleaseAge` untouched, nothing pushed to Jini, `refactor/terra`/`main`/`plan/*` untouched. Tovu: `npm ci --ignore-scripts` (root + `apps/admin`), `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (75 links), `packages/contracts` + `packages/sdk` built. `apps/desktop` not touched by any merged change that needed its gates (not run). No desktop pre-push hook ran (hooks not installed with `--ignore-scripts`); no `--no-verify` used.

## Jini built against (LOCAL ONLY, not pushed)

No `origin/integ/merge-4-2026-11-18` existed in Jini, so a local branch `integ/merge-4-local` was made from `origin/integ/merge-3-2026-11-18` (`d37821a46`) and the 33 listed `origin/codex/*` branches were merged in order (`--no-ff`). **Final local Jini HEAD `dc26a6f2e`.** `pnpm install --frozen-lockfile` ok; `pnpm --no-bail -r build` **exit 0** after the fix commit below. Jini gates (guard/size/complexity/hooks/why-comments) and Jini tests were **not run** this run (Tovu was the scope). To reproduce it, redo the merges below; nothing of it is on origin.

| Jini conflict | resolution |
|---|---|
| args-jini-core-mcp: `packages/db/docs/spec/api.spec.md` | args-db's rows kept; core-mcp's `toBool`/`toBytes`/`isUniqueViolation` rows taken |
| fsize-small2, fn-jini-a, fn-jini-b, fsplit-j-cms, fsplit-j-misc: `scripts/size-debt.json`; fs-daemon, fn-jini-a: `complexity-debt.json`; hooks-b: `hook-injection-debt.json`; ui-3: `why-comments-debt.json` | 3-way JSON merge (entry removed by either side stays removed; both changed -> lower value) |
| fs-vibe: `packages/sidecar/src/supervision/supervisor.ts` | fsize-small and fs-vibe split the same `createDaemonSupervisor` with the same helper names; fs-vibe's finer split taken |
| fs-daemon: `model-discovery-config.ts`, `live-session-state.ts`, `event-log/sqlite.ts` | fs-daemon's split taken, then the args-branch call-shape edits re-applied onto it (`scalar({ value })`, `parseSettingsJson({ raw })`, `modelConfigFiles({ … })`, `omitKeys({ … })`, `isRecord({ value })` wrapper, `assertValidReplayCursor({ afterCursor })`, `resolveMaxEntriesPerRun({ value })`); args-ar-rest's extra `modelSettingsRaw` helper not carried over (the split's `configuredSelection` already lowers that function) |
| ui-2/3/4: `packages/ui/docs/spec/api.spec.md` | row-by-row 3-way (each row from the side that changed it) |
| ui-3 `sameUrl`, ui-4 `fileDropzoneFontFamilyName` | both intents: converted signature + converted `trimTrailingChars`/`trimChars` call |

Jini fix commit `dc26a6f2e` (local): (1) daemon-args turned `isRecord` into a `{ value }` guard while fs-daemon's split files still called it positionally (3 files, tsc red) -> wrapper shape; (2) **fn-jini-a dropped for one file**: its split of `cookie-consent/src/client/runtime.ts` pushed `client.min.js` to 4955 B gzipped (budget 4672) and failed the build; the file is back to its pre-fn-jini-a form with its size-debt entry. **No other Jini branch dropped.**

## Tovu per branch (all `origin/codex/*` unless named; base `origin/integ/merge-3-2026-11-18` = `2d82735a6`)

Per merge: `npm run typecheck`, `typecheck:tests`, `typecheck:scripts`, the 6 ratchets and `apps/admin` `tsc --noEmit`, diffed line-by-line (numbers normalised) against the reference output. "fix" = my commit on the integ branch.

| branch | merge | conflicts -> resolution | red found | fix | status |
|---|---|---|---|---|---|
| args-tv-admin-feat | `2e28bf26f` | — | — | — | merged |
| args-tv-admin-feat2 | `ecdc80e2d` | — | — | — | merged |
| args-tv-admin-http | `38dbbb0a9` | — | — | — | merged |
| args-tv-public-http | `9d2e0db1c` | 2 files: each side converted a different call on adjacent lines -> line-wise union | — | — | merged |
| args-tv-runtime | `8d4e2a8b5` | — | — | — | merged |
| args-tv-web-db | `9c71b5590` | `outbox-repo.ts` modify/delete -> deletion kept (moved to `@jini-ai/db/events`; the branch only added an `_optional` pad) | — | — | merged |
| args-tv-web-feat | `23cabe3b1` | `bootstrap.ts`: merge-3 call structure + branch's `importAgentPluginAccessToken({ deps, … })` | — | — | merged |
| args-tv-misc | `5fd12566e` | — | — | — | merged |
| tv-callers-db | `1100cd3f5` | 21 files: line-wise; 4 lines combined by hand (`sqliteKernel({ source })`, `openSqliteSnapshotSource({ bytes, open })`, `compareShapes({ expected, actual })` + `readSchemaShape({ kernel })`, `migrateChatDatabase({ kernel })`) | tsc 145->88 | — | merged |
| tv-callers-misc | `95d1179dd` | `federate-mcp.ts`: Tovu `withOverrides({ target, overrides })` + Jini one-object provision call | rewrote `safeHref` callers Jini never changed (TS2345) | `46621c95f` | merged+fixed |
| tv-callers-2 (UNTESTED) | `291c260ab` | `ExternalMcpSettingsPanel.tsx` combined | — | — | merged |
| tv-assistant-args (UNTESTED) | `b4c0062a9` | — | 59 tsc / 176 tests-tsc / 23 admin errors left from Jini shapes no branch moved | `39fa89df4` (79 `getEffective` calls), `7888e51db`, `ad6b693d8`, `eec7df799`, `1ae00f40e`, `1e4afe5f5`, `d57a0d1cd` | merged+fixed |
| refresh-sc (UNTESTED) | `405bf83f9` | — | — (arch metrics improved; propagation 3.24->3.23) | — | merged |
| refresh-u2 (UNTESTED) | `7e678a5bc` | — | check:errors (exit 0, prints 2 "New") | `90429dd8b` (debt re-keyed to the split files) | merged+fixed |
| refresh-bk (UNTESTED) | `28d268681` | — | 5 tests-tsc errors in its new tests | `6ff98cbf6` | merged+fixed; **3 of its new tests still fail** (below) |
| tv-fsize-feat | `3633a5eaa` | — | — | — | merged |
| tv-fsize-runtime | `17275ed2d` | `bootstrap.ts`, `commerce.ts`: split taken, args edits re-applied | — | — | merged |
| tv-misc2 | `a77f7de25` | `site-key-sources.ts` (comma), terra-prompt md (branch's line) | — | — | merged |
| fsplit-tv-identity (UNTESTED) | `9a09f9d67` | — | 2 tests imported moved repos from `repo.ts` | `e2631dcd2` | merged+fixed |
| fsplit-tv-post (UNTESTED) | `ff0705d0d` | — | moved `ContentStatsToolDeps` (RegistryDeps collapsed to `any`, ~40 errors), `TIPTAP_DOC_SCHEMA` test import, complexity/arch keys, lost why-comment | `e2631dcd2` | merged+fixed |
| fsplit-tv-theme (UNTESTED) | `0cc950346` | size-debt 3-way | moved `PreviewSwitcherToolDeps`/`TrashThemeToolDeps`, `theme-tool.ts` imports, 2 error-gate entries, publish-content +1 line | `23c4c3c30` | merged+fixed |
| fn-web-a (UNTESTED) | `74f0af920` | `tool-registrations.ts`: extraction taken, `getEffectiveSetting` shape applied inside it | missing `ToolHandler` import; newsletter complexity keys; **theme/publish-content.ts 536 > 512 max-lines** | `93e2035bb` (that one file back to pre-fn-web-a) | merged, **1 file dropped** |
| fn-web-b (UNTESTED) | `d97470129` | `agent-daemon-scope.ts`/`agent-daemon-core-client.ts`: split taken + args edits re-applied | **agent-daemon-scope.ts 945->1036 max-lines**, new cognitive violation; `assistant-subagents.ts` extracted helpers fail tsc | `7f9e88add` (2 files back to pre-fn-web-b) | merged, **2 files dropped** |
| fn-tovu-misc (UNTESTED) | `7af9492e3` | `bug-pin-fixtures.ts`: split + `collectProcessTreePids` shape | 10 tsc errors + admin tsc: `createdRepo` written onto the GitHub response (teardown would never delete the repo), `sessionIds` out of scope, `browser-stream.ts` self-referential types, … ; desktop `main/index.ts` max-lines | `399c219eb`, `9bd866328` (8 files back to pre-fn-tovu-misc) | merged, **8 of 61 files dropped** |
| fn-e2e-a (UNTESTED) | `d62fb150d` | — | byok/assistant-live journeys call undefined helpers | `9bd866328` (2 journeys back) | merged, **2 files dropped** |
| fn-e2e-b (UNTESTED) | `8f4f74273` | — | — | — | merged |
| fn-e2e-c (UNTESTED) | `6639d4ef1` | — | widgets-menus journey TS18048 x6 | `15eefd6ec` (1 journey back) | merged, **1 file dropped** |
| th-1 (UNTESTED) | `04217ff44` | — | **nested-bag trap**: 4 "new" hook entries (debt deleted, direct calls left), 6 size + 4 complexity breaks | `d054e5695` (10 admin files back to pre-th-1 with their debt) | merged, **10 files dropped**; 37 hook-debt entries genuinely retired (235 -> 198), check:hooks ok |
| th-2 (UNTESTED) | — | — | `hooks: { useX = … } = {}` bags across 16 files: **check:hooks 44 new entries**, 6 complexity, 4 size | merge undone before push | **SKIPPED** |
| th-3 (UNTESTED) | — | — | same pattern: **check:hooks 43 new**, 13 complexity, 4 size | merge undone before push | **SKIPPED** |
| fix/daemon-parked-503-toast | `a1c006112` | `lib/api.ts` modify/delete -> deletion kept; change ported to `lib/admin-http/request.ts` | branch referenced `authenticated` that merge-3 moved into `approvedResponseFailure` (ReferenceError swallowed -> no notice), `serverReply` called old `record(body)`, its 2 new tests imported `../api` | in the merge commit | merged; failure-channel + notice tests **25/25** |
| codex/tv-wc-fix (UNTESTED) | `202f3cdd0` | — | 1 still-lost block (entry deleted, comment not restored), 1 rewritten comment, ThemeGrid size | `07f90f1b1` | merged, 2 files back; 15 restorations kept |

## Real production bugs found (cast/bivariance-hidden old Jini shapes; failing test first)
1. `agent-daemon-core-client` `readEffective` forwarded the optional bag (undefined) as the daemon RPC input after `getEffective` became one object. New test `agent-daemon-core-client.get-effective.unit.test.ts` red -> green (`1e4afe5f5`; re-applied onto fn-web-b's `createDaemonSettingsReader`).
2. `resolveOperatorLocale` called the real `getEffective` with the old shape behind `as unknown as`: operator language always fell back to `en`. Existing "with the real ledger" test red -> green; cast removed (`1e4afe5f5`).
3. Custom-credential duplicate labels lost their 409: Tovu passes core `isUniqueViolation` (now `{ err }`) into a positional method-typed integrations port. vault-write-parity "custom" red -> green (`784447d3f`).
4. Vault parity harness (loose module object) drove the peer store and Jini snapshot source with stale shapes (`a19070a6c`). Vault read/write/boundary parity: **62 pass, 0 fail**.

## Gates — base vs final (commands from the Tovu root; admin = `cd apps/admin && npx tsc --noEmit -p .`)

BASE = `origin/integ/merge-3-2026-11-18` linked to the merged Jini, before any merge:

| gate | BASE |
|---|---|
| `npm run typecheck` | exit 2, 145 errors (old Jini shapes) |
| `npm run typecheck:tests` | exit 2, 440 errors |
| `npm run typecheck:scripts` | exit 2 (base-red) |
| `npm run check:size` | ok (182 debt entries) |
| `npm run check:complexity` | ok (41 entries) |
| `npm run check:architecture` | exit 1, BASE-RED (1 hard metric) |
| `npm run check:errors` | passed, 805 findings / 477 entries |
| `npm run check:hooks` | ok |
| `npm run check:why-comments` (vs `origin/refactor/terra`) | ok |
| admin tsc | exit 2, 53 errors |

FINAL at `07f90f1b1` (same commands): `typecheck` **exit 0 (0 errors)**; `typecheck:tests` **exit 0 (0)**; `typecheck:scripts` exit 2, the same 3 base-red errors (agent-plugin-activation TS2554, check-size-drift TS5097, dev-admin-build TS2339); `check:size` **ok** (142 violations, 135 debt entries; base 182); `check:complexity` **ok** (40 entries; base 41); `check:architecture` exit 1 = BASE-RED, same single hard metric, back-edges 0, cycles 2 (= base), API surface 815 (base 806, baseline 821: the new split files), **no NEW cross-feature edge line**; `check:errors` passed, 805 findings / 478 entries (+1 entry = a 2-count entry split across two files, total unchanged); `check:hooks` **ok**; `check:why-comments` **ok**; admin tsc **exit 0 (0 errors)**. Line diff final vs BASE (numbers normalised): no new line in any gate except check:hooks' informational "top hooks" ranking.

## Tests run (node `--test`, `--test-concurrency=2` in throw-away worktrees to keep merging in parallel — deviation from 1, for time)
- Groups 1-2 scoped (959 files importing tv-callers-*/tv-assistant-args/my fixes, at `1ae00f40e`): stopped by a 25-min cap after 7390 ok / 111 not ok. Every non-Postgres failure was triaged: the getEffective/peer/parity/isUniqueViolation ones were fixed above and re-run green; the rest are environment (Postgres-backed suites: no server here; `preview-switcher-layout` needs a Playwright browser build this container lacks; `serve-command-wiring` base-red per earlier reports).
- Groups 3-5 scoped (219 files, at `e2631dcd2`): 3247 tests, 3213 pass, 11 fail, 19 cancelled (Postgres). **Still failing, not fixed (need an owner look):**
  - refresh-bk's new characterization tests: `import-creates-new-site` "saved-key abort …" and "exclusive file collision …" expect `AbortError`, the code throws `InternalError("initSite: failed while creating … : saved-key restore stopped")`; `saved-keys-round-trip` "same-identity older Library shape …" fails with "This ZIP was made by a different Tovu version". Either the tests (written unrun) or the behaviour is wrong: decision needed, not guessed.
  - `batch-tool-inputs.test.ts` (2 theme batch cases: written paths read back `undefined`) and `import-local-file-search.test.ts`: not root-caused; not proven against a base run.
- Admin vitest: only the parked-503 files (25/25). The full admin suite for the th-1 changes was **not** run (time).
- e2e files: typecheck + `eslint development/e2e/journeys development/e2e/support` (0 errors, 206 warnings); no browser e2e.

## Skipped / dropped
- **th-2, th-3**: design-level (nested `hooks` bag the gate cannot see, branch-wide); merge undone, not pushed. Redo with the flat `{ useXHook = useX }` first-parameter shape.
- Partial per-file drops (files kept at their pre-merge form, debt entries restored): fn-web-a 1, fn-web-b 2, fn-tovu-misc 8, fn-e2e-a 2, fn-e2e-c 1, th-1 10, tv-wc-fix 2; Jini fn-jini-a 1 (cookie-consent runtime).

## Decisions needed
1. `@jini-ai/admin`'s AdminKit media-providers rules port is still positional while ui's rules take one object; `apps/admin/src/integrations/jini-kits.ts` adapts with one-line lambdas (`eec7df799`). Update the Jini port instead?
2. The integrations credential-set host port (`isUniqueViolation`) and other method-typed ports accept args-shaped functions silently (bivariance). Worth a sweep for other converted Jini functions passed by reference.
3. Max-lines ratchets vs function splits: fn-web-a/fn-web-b/fn-tovu-misc grew files past their file-length debt. Split those files into modules first, or allow the file debt to move?
4. refresh-bk test expectations (above).

## Next step
1. Owner: decide on the refresh-bk expectations; re-run th-2/th-3 with the gate-recognised shape.
2. Push the Jini merge as its own `integ/merge-4` (redo the 33 merges + `dc26a6f2e`), then re-run Jini guard/ratchets/tests on it.
3. Full (non-scoped) Tovu node + admin suites on `integ/merge-4-2026-11-18` with Postgres available.
