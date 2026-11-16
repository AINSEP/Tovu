# Code review: cloud branches of 2026-11-15/16 (report only, no source edited)

Scope: static review with git diff/show/log and rg. **No tests were run.** The container has Node 22 only, and the install and build cost was not worth it for a report-only run. Every "bug" below is read from code, and each one says how to confirm it.
Bases: `cloud/small-fixes`, `cloud/api-surface-check` and `moves/w1-batch1` are cut from `refactor/terra` (b7666092). `moves/r2-b` is cut from `integ/wave-b` (6cfcc471 = terra + one db follow-up).
The Tovu copies of all these branches sit on the Tovu plan base (fad66fb8 + ~295 commits), **not on Tovu `origin/main`**. Tovu `main` has moved on (it is on published Jini 0.7.2).

| # | Branch | Verdict |
|---|---|---|
| 1 | cloud/small-fixes-2026-11-15 | **MERGE-AFTER-FIX** (hold the mcpIsolation commit until fixed or proven) |
| 2 | cloud/api-surface-check-2026-11-15 | **MERGE-AFTER-FIX** (small) |
| 3 | moves/w1-batch1 | **MERGE-AFTER-FIX** (one real type error) |
| 4 | moves/r2-b | **MERGE-AFTER-FIX** (one Jini args-rule fix; slice 3 not done) |

---
## 1. cloud/small-fixes-2026-11-15 (Jini 10605caf, eff5c025, 1a1a4d43; Tovu 51133f44, 939ee65d, 52ac8c1b)

### Claude mcpIsolation (10605caf): what it claims, and what pins it
- It adds `mcpIsolation: { perRun: 'claude-strict-mcp-config@2026-11-16' }` to `packages/agent-runtime/src/defs/claude.ts:153`. The comment says "Every run passes `--strict-mcp-config`", so `planRun` returns RUN with `loadsOwn:false` and does not ask for MCP consent.
- **The stamp is not verified against the real Claude CLI.** The report says so itself. `@2026-11-16` is the date the code was written, not a CLI version.
- Tests: the new `plan-run.unit.test.ts` case only checks that the def carries a `perRun` stamp and what `planRun` returns. The existing defs and daemon tests check that argv contains `--strict-mcp-config`. **Nothing runs or pins the real CLI's flag or its effect**, so no test would catch the flag being renamed or ignored.
- **The claim "every run passes the flag" is false in the code** (`defs/shared.ts:66-72`):
  - With no `mcpJsonPath`, `--strict-mcp-config` is added only when `claudeUserMcpLocked` is true. That needs `nativeToolAccess===false`, or `userMcp===false`, or `filesystemRoot` set with `userMcp!==true`.
  - Case 1: `userMcp` undefined, no `filesystemRoot`, no `mcpJsonPath`. The launch has no strict flag, yet `planRun` (`native-tool-policy.ts:119-126`) treats `perRun` as isolated unless `userMcp===true`, so it says RUN with `loadsOwn:false`. Claude then auto-loads the user's own MCP servers with no consent.
  - Case 2: `cliParity` plus `permissionMode:'bypass'` with `userMcp` undefined, which makes `trustedMcpBypass` true. The flag is dropped even with an `mcpJsonPath`, and `planRun` still says `loadsOwn:false`.
  - The new test only passes `userMcp:false` and `userMcp:true`. It never passes undefined.
- Proof needed before the stamp can be trusted:
  1. Run the real `claude` (pin the version in the stamp, e.g. `claude-strict-mcp-config@<cli-version>`) in a dir with a user-scope MCP server and a project `.mcp.json`, passing `--strict-mcp-config --mcp-config x.json`. Assert the init event's `mcp_servers` lists only `x.json`. Keep that as a gated/live test, or at least a recorded transcript in the changeset.
  2. A unit test for `planRun` against `buildArgs` argv for the undefined-`userMcp` and bypass cases above.

### preferWorkspacePackages (eff5c025)
- `pnpm-workspace.yaml` change is correct and harmless, and the lockfile is untouched.
- **Changeset is wrong:** `.changeset/workspace-prefer-workspace-packages.md` attaches a patch to `@jini-ai/protocol`, but no package changed. With the `fixed: [@jini-ai/*]` group (the api-surface report says so) it forces a version bump and changelog line for every published package. The correct answer is none.

### nodemailer re-pin (Tovu 939ee65d)
- `npm view nodemailer time --json` gives 10.3.1 published 2026-10-29T12:31Z, which is 18 days before 2026-11-16, so it clears the 14-day rule. 10.4.0 (11-07), 10.4.1 and 10.5.0 (11-10) and 10.6.0 (11-15) are too young. Exact pin `10.3.1` ✓.
- `package-lock.json` (`node_modules/nodemailer` 10.3.1, resolved and integrity present) ✓. `@types/nodemailer` removed ✓, since 10.x ships its own types.
- Churn: it also moves `"@tovu/contracts": "*"` from first to alphabetical position in `dependencies` (cosmetic).
- Not proven: `.npmrc` `min-release-age-exclude[]=@jini-ai/*` is not verified to be a real npm key (npm may ignore unknown keys silently), and the pnpm `@jini-ai/*` exclusion was never exercised (the report admits both).

### Must-fix
1. `packages/agent-runtime/src/defs/claude.ts:153` + `defs/shared.ts:66-72`: either drop `mcpIsolation` until proven, or make `buildClaudeMcpConfigArgs` pass `--strict-mcp-config` whenever `userMcp !== true` (and never drop it under cliParity+bypass unless `userMcp===true`). Add a test for the undefined and bypass cases, and the live check above.
2. `.changeset/workspace-prefer-workspace-packages.md`: delete it (no package changed), or make it an empty changeset.
3. `.npmrc` (Tovu 52ac8c1b): run `npm config list` with the key and check that it is honoured (or drop the exclude line).
4. Nit: revert the `@tovu/contracts` reorder in Tovu `package.json`.

Rules checks: no eslint-disable added, no re-export shells, no functions over 50 lines, no args-rule violations. The change has a red-first test per the report only (the test and fix are in one commit, so order is unverifiable from git).

---
## 2. cloud/api-surface-check-2026-11-15 (Jini 14e833c5, cb379fe6)

### Tool choice
- It hand-rolls about 235 lines on the TypeScript compiler API (`scripts/lib/api-surface.ts` + `scripts/check-api-surface.ts`) instead of using a maintained tool. The report compared api-extractor, attw and publint.
- My judgment: **acceptable, not ideal.** The compiler API is the right layer for TS. `@arethetypeswrong/cli` and `publint` are not diff tools. `@microsoft/api-extractor` is maintained but needs one config per entry point (39 packages, 547 exports entries) and gives a human-reviewed `.api.md`, not a "removed export needs a changeset" gate, so a hand layer would still be needed.
- It is also hash-based, so the baseline (19k lines of `kind:sha1`) is **not reviewable by a human**: a diff of `api-baseline/` shows hash churn, not what changed. api-extractor's `.api.md` would show it. Consider also emitting the plain signatures in the baseline.
- The gate is deliberately narrow: only removed exports or subpaths fail. Signature changes (the common real break) are report-only. Wildcard and asset subpaths are tracked by key only.

### Output / correctness risks
- `pickTarget` (`api-surface.ts:36`) only follows conditions `types|import|default|require`. An exports entry that uses `node`, `browser`, `development`, `source` and similar resolves to null and silently gets **no symbols**, so removals under it are invisible. Fix: fail or warn on an unknown condition.
- `coveredByChangeset` accepts any pending changeset that bumps that package, not one tied to the diff. The report notes this.
- The baseline is built from terra's `dist`. 4 packages (daemon, ui, desktop-host, user-management) fail tsc there but still emit, so their baselines are only as good as their emit.
- The baseline must be regenerated after wave B (see merge order). Wave B removes or moves exports, which would trip the gate in CI.

### Must-fix
1. `scripts/lib/api-surface.ts:178`: delete `export { dirname }` and drop `dirname` from the import at `:14`. It is dead and odd.
2. Args rule: `pickTarget` (:36), `resolveTypesFile` (:51), `extractSymbols` (:77), `buildPackageSurface` (:116), `diffSurface` (:135), `coveredByChangeset` (:170) take positional args. Change them to `(required, optional = {})` and update `scripts/__tests__/api-surface.test.ts`.
3. `pickTarget` (:36): handle or flag unknown export conditions, as above.

Rules checks: no eslint-disable, no re-export shells, all functions are under 50 lines, and the lockfile is untouched (no new dependency). The package.json scripts and the `ci.yml` step are fine. The unit tests cover the pure logic (8 tests) but not the CLI wiring.

---
## 3. moves/w1-batch1 (Jini cc16cee1, 0c6b6f9b, f0cf14bb; Tovu 54421a74, e42acbec, 4e69539c, f931ce45)

### Postgres slice (Tovu-only 54421a74): complete and correct on its own
- Folds `evaluatePostgresRestoreCapability` and `PostgresRestoreToolingConfig` into `db-ops-adapter.ts` and deletes `db-ops.ts`.
- `rg` shows no importer of `postgres/db-ops` is left. The integration test and the doc comment are repointed. It leaves no re-export shell.
- If another local commit does the same fold, landing both will conflict on the same two files. Keep one and drop the other.
- Nit: `evaluatePostgresRestoreCapability(config)` takes one positional arg (moved unchanged).

### MV-commands-1 (plugin integrity), DL-web-1: fine
- `runPluginIntegrityCommand(required, optional = {})` follows the args rule. The imports it needs (`computePluginIntegrity`, `PLUGIN_MANIFEST_FILENAMES`) exist.
- The Tovu `integrity.ts` is deleted and its 3 callers repointed. The `html-document` shim is deleted with no importers left. The Jini pin test for `htmlToText` is added.
- No Jini test for `runPluginIntegrityCommand` (the report says none was added). It only has Tovu-side coverage through `plugin-command.unit.test.ts`.

### MV-kernel-1 (stopped-database): real type error
- `packages/db/src/sqlite/stopped.ts:14`: `StoppedSqliteOpener` returns `Pick<SqliteClient,'exec'|'pragma'|'close'>`, but `:69` passes that `db` to `verifySqliteIntegrity({ db })`, which wants `SqliteDb` (`inspect.ts` `VerifyDbOptions.db`).
- That is TS2740 at 69:39, which the report flags and leaves unfixed. Vitest does not typecheck, so the tests pass. `pnpm -r build` and typecheck on `@jini-ai/db` will fail and Tovu's `openNativeSqlite` binding is untyped against it.
- `:71` throws "Build @jini-ai/db before running the stopped-site database mover." from inside `@jini-ai/db` itself. That message is stale Tovu wording and is wrong in a package.
- Only `checkpointStoppedSqliteWal` has a Jini test (4 tests, relocated). `assertSqliteStopped` and `inspectStoppedSqlite`, which hold the admission and rollback logic, have **no Jini tests**. The Tovu tests that covered them still call them through the thin binding, but the package's own behavior is unpinned.
- Tovu 4e69539c: `stopped-database.ts` is a clean binding, no shell.

### Cross-repo
- All four Tovu commits import Jini exports that exist only on this branch (`assertSqliteStopped`, `inspectStoppedSqlite`, `runPluginIntegrityCommand`, platform pin). Tovu's range is `^0.7.0`, and the changesets are `minor`, so the next version is 0.8.0 and `^0.7.0` will not match it. The Tovu side cannot land until Jini is released and Tovu bumps its range.

### Must-fix
1. `packages/db/src/sqlite/stopped.ts:14`: make the opener return a type that satisfies `VerifyDbOptions['db']` (`SqliteDb`) plus `exec/pragma/close`. Then run `tsc --noEmit` in `packages/db`.
2. `packages/db/src/sqlite/stopped.ts:71`: replace the "Build @jini-ai/db…" message with a neutral one (for example "SQLite row counts were not returned by the inspector").
3. Add Jini tests for `assertSqliteStopped` (busy lock, leftover WAL checkpoint, journal refusal), `inspectStoppedSqlite` (sidecar cleanup) and `runPluginIntegrityCommand` (`write` path and atomic rename).
4. Release Jini and bump Tovu `@jini-ai/db` / `@jini-ai/plugins` before the Tovu commits merge.

Rules checks: no eslint-disable, no re-export shells, functions are small, and changesets are right (`db` minor, `plugins` minor, platform test-only so none).

---
## 4. moves/r2-b (Jini 607dd51c, d0e5aabb; Tovu 1192ea25 + 49535903, 31ae4776)

### Report's Opus-review points (J-a), all checked
- RED first: yes by the report (the new test fails on the parent with `null`, then passes). `src/federation/hosted` 8/8 and hosted+admissions 15/15 are claimed.
- `category` is optional, so existing `toEqual`s on non-reauth failures are untouched. Confirmed in `core/contracts/hosted-mcp/config.ts` (`category?`).
- The Tovu oauth test gets `category` on the one reauth entry (assertion tightened, not removed). Confirmed.
- Behavior parity: the old Tovu probe matched `reason.includes("authorization expired or was revoked")` for 409. The new probe branches on `category==="reauth_required"` that the store sets in exactly the same two places (`oauthStatusFailure` needs_reauth and the owned-token reauth-code catch). Tovu's store delegates to the Jini store, so it carries the category. The 409/502/400/401/504 mapping and codes are reproduced one to one in Tovu's `external-mcp-probe.ts`.
- The two pre-existing failures (`mcp-federation.registrations.test.ts`) and the OTel-fixture crash in Tovu are claimed as baseline, but the OTel one was **not verified on the parent**.

### Slice 2 stay-error-mapping
INFO.md-only. `respond.ts` does import `statusForError` from `@jini-ai/core/contracts/server`, so the precondition holds.

### Slice 3 split-events EV-1..EV-5: NOT DONE
The sheet `sheets/decided/split-events.md` does not exist, so nothing was done and there are no review points. This branch is only slices 1 and 2.

### Issues
- **Tovu is not bisectable:** 1192ea25 alone does not compile (it deletes `server/runtime/services` while the new `external-mcp-admissions.ts` and two moved tests are only in 49535903). The report says so. Merge both together (squash or merge, never cherry-pick the first alone).
- Behavior note (carried over from the old code, not new): `probeExternalMcpServer` calls `readEnabledConfigs` for the whole workspace to probe one server, so a probe can refresh and persist OAuth grants of unrelated servers. It is documented as O(n) and "not read-only", but a per-server resolve would be safer. Not a blocker.
- Cross-repo: same release dependency as branch 3. Tovu imports `probeExternalMcpServer` and `readFederationAdmissions` from `@jini-ai/mcp` and `ExternalMcpConfigFailure` from `@jini-ai/core`, so they need the wave B Jini release.

### Must-fix
1. `packages/mcp/src/federation/hosted/probe.ts:123`: `runProbe(connect, target)` has two positional args. Make it `({ connect, target }, _optional = {})`.
2. `packages/mcp/src/federation/hosted/store.ts:546`: `externalMcpFailure(record, reason, category?)` adds an optional positional parameter. Move to `({ record, reason }, { category } = {})` (all callers are in this file).
3. Record slice 3 as outstanding (write `sheets/decided/split-events.md`, then EV-1..EV-5). Do not count this branch as having delivered it.

Rules checks: no eslint-disable. The changesets are right (`core` minor + `mcp` minor, `mcp` minor). There are no re-export shells, and the old Tovu path is deleted with callers repointed (rg shows no remaining `runtime/services/external-mcp-*` importers). The new Jini functions are small. The only long function is `saveExternalMcpServer` (66 lines), which was already there.

---
## Recommended merge order into refactor/terra, after wave B

Jini first, then publish, then Tovu.
1. **Wave B (integ/wave-b)**, as planned.
2. **small-fixes** (after fixes 1-2). It touches only `pnpm-workspace.yaml`, `CONTRIBUTING.md`, the claude def and its test, and changesets. Conflict risk is low. The pnpm-workspace.yaml hunk is adjacent to the existing `linkWorkspacePackages` block.
3. **moves/r2-b**. It is based on wave B and adds to `mcp/federation/index.ts` and `hosted/index.ts` and to the core `contracts/hosted-mcp/config.ts` and `hosted/store.ts`. Merge before w1-batch1 because it touches more shared barrels. Conflict risk is medium if wave B touched the same hosted files.
4. **moves/w1-batch1** (after fixes). Low conflict: new files plus one export line each in `db/sqlite/index.ts` and `plugins/host/node/index.ts`. Wave B's db follow-up touched `db/kernel/transaction.ts` and the core barrel, not these.
5. **api-surface-check last.** Its baselines are cut from terra, so run `pnpm -r build && pnpm api:update` on the merged tree and commit `api-baseline/`. Otherwise wave B's removed exports will fail the gate in CI. Conflict risk is high on `api-baseline/*.json` if any other branch regenerates them, and medium on `package.json` scripts and `ci.yml`. Land it alone.
6. **Release Jini** (a minor: db/plugins/mcp/core), then bump `^0.7.0` ranges in Tovu. Then merge the Tovu halves in the same order: small-fixes (nodemailer, .npmrc), r2-b (both commits together), w1-batch1. The Tovu postgres slice is independent and can go any time.
