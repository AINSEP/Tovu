# codex-test-fix-tovu-1 — test the five Codex API-args branches, fix red; prove the parked-503 fix

Run 2026-11-18, unattended. Node 24.22.3. Jini `origin/refactor/terra` = `6c9effae4`, `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build` (exit 0). Tovu `npm ci` (root + apps/admin), `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (74 links), contracts + sdk built. Base = Tovu `b5fbf2a5e` (= `origin/refactor/terra`). Each branch was compared against a fresh base run of the same commands.

## Base (b5fbf2a5e)

| gate | result |
|---|---|
| `npm run typecheck`, `npm run typecheck:tests`, `apps/admin: npx tsc --noEmit` | exit 0 / 0 / 0 |
| `npm run typecheck:scripts` | exit 2, 3 errors (agent-plugin-activation.ts TS2554, check-size-drift.ts TS5097, dev-admin-build.ts TS2339): base-red |
| check:size / complexity / errors / hooks / why-comments | ok (197 violations = debt, 42 entries, 810 findings, hooks ok, 0 lost) |
| check:architecture | exit 1, 3 hard metrics regressed: base-red |

## Part A — per branch

Website tests: `node --import tsx … --test --experimental-test-module-mocks --test-concurrency=1` on every test file that directly imports a changed file, plus the changed tests (resolver: relative and `#src/` imports). Each branch's failing files were then re-run on base, and the failing test names compared. Admin tests: `npx vitest related --run --maxWorkers=2 <changed admin files>`. Ratchet logs were diffed line by line against base. The only difference on every branch is the why-comments "N files checked" counter, with 0 comment blocks lost.

| branch (Codex commit) | typecheck new errors | new failing tests | new gate lines | added disables / hook-component sig changes | fix commits | status |
|---|---|---|---|---|---|---|
| codex/args-tv-admin-feat (`a2ca6c0b`) | 0 (root, tests, admin) | 0. Admin: 148 files, 3111 pass / 2 skipped | 0 | 0 / 0 | none | **GREEN** |
| codex/args-tv-admin-feat2 (`44746c42`) | 0 | 0. Admin: 227 files, 5008 pass / 2 skipped | 0 | 0 / 0 | none | **GREEN** |
| codex/args-tv-web-db (`02fe49ee`) | 0. typecheck:scripts is the same 3 errors as base | **2 real**: `checksums.test.ts` "every step's pinned checksum matches its sources" and `chat-package-adoption.test.ts` "C3 changes zero bytes…". **Fixed.** 1 intermittent (see below). Website: 524 files, 5745 tests, 125 fail; all others also fail on base | 0 | 0 / 0 | **`2a6ebaa5`** | **GREEN after fix** (1 intermittent to watch) |
| codex/args-tv-web-feat (`840ad780`) | 0 | 0. Website: 315 files, 3255 tests, 14 fail, all 14 also fail on base (postgres env, `[unrun]` credentials, catalog inputSchema, serve-command wiring, bundled-agent-plugin-selection) | 0 | 0 / 0 | none | **GREEN** |
| codex/args-tv-misc (`1b100419`) | 0 | 0. Website: 277 files, 3686 tests, 32 fail + 19 cancelled; all also fail on base. `site-plugin-directories.test.mjs` is base-red: base `deps.ts` imports `pluginsInstallDir` but does not re-export it. Admin: 598 files, 11470 pass, plus 1 unhandled `window is not defined` teardown error from `main-entry-signed-in.unit.test.tsx`. That file is unchanged and passes 3/3 alone on both base and branch, so it is a load flake | 0 | 0 / 0 | none | **GREEN** |

### The web-db regression and fix (`2a6ebaa5`)

Codex rewrote the factory signatures inside eight **shipped migration steps**: `0000_legacy_baseline`, `0001_post_search`, `0002_drop_empty_legacy_chat_tables`, `0003_coercion_json_as_json`, `chat/0000_chat_baseline`, `chat/0001_sqlite_chat_tables`, `project/0000_project_vault` and `project/0001_project_credential_kinds`. ADR-066 makes those step sources immutable: they are hashed against pinned checksums, so two tests went red. On base these tests were green; on the branch they were red with checksum mismatches (`d9fc63…` vs pinned `e4d853…`; chat `c637f9…` vs `69f893…`).

The fix restores the 8 step files byte-for-byte to `b5fbf2a5e`. It also puts back the positional signatures of the two `legacy-sqlite.ts` helpers that `0000` calls (`readFrozenChain(dir = LEGACY_DRIZZLE_DIR)` and `adoptLegacySqlite(kernel, note)`). Finally it reverts their call sites in `migrations/index.ts`, `fresh-content-db.ts` and 5 tests to the base form. No assertion was touched. After the fix the 9 affected files run 103/105 green. The 2 remaining failures:

- the `import-restore.unit.test.ts` subtest "import keeps starter radio…", which also fails on base;
- the intermittent below.

`npm run typecheck` and `typecheck:tests` exit 0.

**Intermittent, not root-caused (out of time):** `create-sqlite-route-deps-overrides.integration.test.ts`. All 8 tests pass, but the file is reported failed when the test "new overrides path: … EXACT SAME db handle is reused" leaves async work that throws "The database connection is not open" after the test ends. It failed in 2 of 4 runs on the branch and 0 of 3 runs on base. The test file itself is unchanged. I counted the `await` keywords on the non-test lines the web-db diff changes: 31 removed and 31 added, so no `await` was dropped. Next step: run it 10× on each tree and trace which store close or background task is still running at teardown.

### Diff review for behaviour changes (all 5)

- No React component or hook signature changed. A grep of every `export function|const` that starts with `use` or a capital letter found none.
- No added `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `as any` or `biome-ignore`.
- I swept for changed exported functions passed by reference (`.map(fn)`, `.filter(fn)`, `then(fn)`, defaults). The only hits are local, unchanged `toRow` helpers or default-parameter values that already existed. No callback breakage.
- The only behaviour change found is the migration-checksum one above.

## Merge of all 5 (throwaway local `tmp/merge-codex-tovu-1`, NOT pushed)

- `git merge --no-ff` in the order admin-feat, admin-feat2, web-db, web-feat, misc: **0 conflicts**.
- On the merged tree (before the fix), `npm run typecheck`, `typecheck:tests` and admin `tsc` all exit 0. All 6 ratchets are identical to base; why-comments checked 565 files, 0 blocks lost.
- The web-db fix (`2a6ebaa5`) then merged in cleanly. No other branch touches the files it changes. The merged+fix typecheck result is in the line below.
- I did not re-run tests on the merged tree (time). Each branch's tests passed on their own, and no file is touched by more than one of the merged commits' fixes.

Merged tree + web-db fix: `npm run typecheck` exit 0 (0 errors), `npm run typecheck:tests` exit 0 (0 errors).

## Part B — fix/daemon-parked-503-toast (on `ecd305d81`)

**Red:** on `ecd305d81` I copied in the two new test files from the branch.

```
cd apps/admin && npx vitest run --maxWorkers=2 src/lib/__tests__/admin-failure-channel.unknown-route.unit.test.ts src/lib/__tests__/admin-failure-channel.assistant-cold.unit.test.ts
 × publishes no page notice for a read answered 503 AGENT_DAEMON_PARKED, and still rejects to the caller   (expected { …(6) } to be null)
 × publishes no page notice for a read answered 503 AGENT_DAEMON_UNAVAILABLE, and still rejects to the caller
 × still publishes a plain-words notice when the daemon is known to have failed   (expected 'Load information (HTTP 503)' to be 'GET /api/agents (HTTP 503)')
 × still publishes a notice when a write is refused because the assistant is unavailable   ('Request (HTTP 503)' vs 'POST /api/agents/rescan (HTTP 503)')
 × names the method, full path and the server's own code and reason for a route missing from the vocabulary
 × redacts ids, query strings and secret-shaped server text from the details
 × leaves out server text that is not a small {error, code} reply, and for signed-out requests
 Test Files  2 failed (2)      Tests  7 failed | 1 passed (8)      EXIT=1
```

**Green:** on the branch tip `8031dd6c`.

```
cd apps/admin && npx vitest run --maxWorkers=2 src/lib/__tests__/admin-failure-channel.unknown-route.unit.test.ts src/lib/__tests__/admin-failure-channel.assistant-cold.unit.test.ts src/lib/__tests__/admin-failure-channel.unit.test.ts src/components/__tests__/AdminFailureNotice.unit.test.tsx
 FAIL  src/components/__tests__/AdminFailureNotice.unit.test.tsx  TypeError: createDictionaryTranslator is not a function (shared-components-i18n.ts:3449)
 Test Files  1 failed | 3 passed (4)      Tests  22 passed (22)
```

- The three `admin-failure-channel` files are **22/22 green**.
- `AdminFailureNotice.unit.test.tsx` cannot load. The same import error happens on `ecd305d81` without the fix (base run: `1 failed | 1 passed`, the same TypeError). This is Jini version skew: `ecd305d81` imports `createDictionaryTranslator` from `@jini-ai/ui/panel-kit`, and terra Jini `6c9effae4` no longer exports it there. It is not caused by the branch, which does not touch the component.
- The two commits do not cherry-pick onto terra (`apps/admin/src/lib/api.ts` was moved or deleted there), so I could not cross-check on terra.

**apps/admin typecheck on the tip:** `npx tsc --noEmit` exits 2 with 1150 errors. `ecd305d81` gives exactly the same 1150 errors (identical after removing line/column), so they come from the same Jini skew. 0 errors are in the changed files.

There was nothing red that the branch caused, so I made no fix commits and pushed nothing for Part B.

Review note, not fixed: `redactedRoute` keeps any segment matching `^[a-z][a-z-]{0,39}$`, so a lowercase slug such as `/posts/hello-world` stays in the clear. Its doc comment says "ids, slugs, tokens become `:id`". Either the regex or the comment needs to change; that is the owner's call.

## Pushed

| branch | SHA | note |
|---|---|---|
| `codex/args-tv-web-db` | `2a6ebaa5` | fast-forward on `02fe49ee`. `pull --rebase` was a no-op; the push went through with no hook block. |
| `verify/codex-test-fix-tovu-1` | this report | one file on `b5fbf2a5e` |

No other branch was changed or pushed.

## Decisions needed

1. **Migration steps vs API-args sweeps:** add shipped `platform/db/migrations/**/NNNN_*.ts` step files (and the helpers they call) to the sweep's exclude list, so Codex does not repeat this.
2. **Codex's padding pattern:** Codex adds `_optional: Record<string, never> = {}` to single-argument functions, and once a required `_required: Record<string, never>` (`readFrozenChain`, now reverted). Accept it as the convention or strip it.
3. **Intermittent overrides test** (web-db, 2/4 vs 0/3): it needs a 10× soak before web-db merges.
4. **Part B slug redaction:** choose between the regex and the doc comment (see above).
5. Part B's `AdminFailureNotice` test can only run against the Jini that matches `port/wip-1110`, not terra Jini.
