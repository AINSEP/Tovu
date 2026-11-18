# lu-s1 — lost updates, S1 (external MCP) + the session-revocation security bug

Branch `wave2/lu-s1` in both repos, from `origin/refactor/terra` (Tovu `232764af5`, Jini `65d73b0d5`).
Plan: `plan/lost-updates-design-2026-11-16` `designs/lost-updates/DESIGN.md` §4.4 and §6 row S1; LU-B1 = Rec (a step
may edit a file over 500 lines if it does not grow it), LU-D1..D10, D12..D14 confirmed.

## What was done

**S1 is mostly done; S3 was not started** (see "Left" for why and the exact next step).

The external-MCP row (`ExternalMcpServerRecord`) now has a `version`, and every writer is one of two kinds (rule M7):

- *edit* writes compare `version` and both credential pointers in the write and set `version + 1`
  (`updateIfVersion`; a create is `insert`);
- *runtime* writes (token refresh, OAuth status) name only the OAuth runtime columns, are fenced on the
  credential they read, and never touch `version` (`updateOAuthRuntime`).

| Writer (design §4.4) | Now |
|---|---|
| `saveExternalMcpServer` (form/tool) | `insert` / `updateIfVersion`; `expectedVersion` from the caller, else the version read in the request; a miss caused only by a token refresh re-reads and rebuilds once (M4) |
| `applyExternalMcpAccess` → `updateAccessIfCurrent` | same snapshot compare, plus `version + 1` (memory and SQL) |
| sign-in `persistTokens`, `setOAuthStatus` | `updateOAuthRuntime`; a token set for a credential that was replaced meanwhile is dropped and the call throws the host's re-authorization error with a cause |
| sign-in configuration, "forget the self-registered client" | `updateIfVersion` via `updateRowOnce`, re-read and re-apply once |
| plugin adoption (`federate-mcp.ts`), tool renames (`apply-tool-renames.ts`) | `updateAgentPluginMcpRow` (conditional write, one retry); adoption reports failure instead of stealing a row whose owner changed |
| vault recovery `unlinkMcp` (Tovu) | `version = version + 1` |
| Tovu SQL adapter, `PUT /mcp-servers/:id` (`expectedVersion`, 409 shared body, 400 malformed), list returns `version`, admin tab sends `expectedVersion` and shows the conflict copy | done |

New in Jini core: `applyInternalChange` (rule M4 — read, derive, conditional write, re-read and re-apply once, then
`RecordVersionConflictError`). `store.ts` is 1658 lines (was 1671), `sign-in.ts` 1044 (was 1044), `federate-mcp.ts` 595 (was 595),
`identity/repo.ts` 710 (was 710); `saveExternalMcpServer` went from 74 to 23 lines (`buildSavedRecord` is 46).

### Security bug: a session save could overwrite a revocation

`SqlSessionRepo.save` (principal sessions), `SqlMemberSessionRepo.save` (member sessions) and Jini's `InMemorySessionRepo.save`
replaced the whole row on conflict. A session record built before a logout / password reset / credential reset / principal
disable has no `revokedAt`, so saving it back restored the session. **No production caller saves an existing session today** (the
only writers mint a fresh id), so this is a hazard closed at the repository, not an exploited path. `revoked_at` is now
`COALESCE(stored, incoming)` (`keepStoredRevocation`): a save may add a revocation, never remove one. Red first on SQLite + PGlite
and the memory adapter. This sits in S3's file (`identity/repo.ts`) and S4's (`members/repo.ts`, member-session save only).

## Commits (all pushed to `origin/wave2/lu-s1`)

Jini:
- `397e4bf3` contract (`version`, `insert`/`updateIfVersion`/`updateOAuthRuntime`) + memory repo + tests
- `ae6b1c23` sign-in runtime writes (the refresh-vs-disable fix)
- `713790dc` store save → insert / updateIfVersion; view carries `version`
- `5d9ad00c` plugin adoption + renames; core `applyInternalChange`
- `de1428a3` in-memory session repo keeps a revocation
- `10f16be1` neutral-host double follows the port (also carries a one-line doc fix in `integrations/.../contracts.ts`)

Tovu (needs Jini at `10f16be1`; it builds against the local `Jini` checkout):
- `06a421d3` SQL adapter + access `version + 1` + SQL race tests
- `fad97c8a` tests follow the writers; new lost-update tests (save, refresh, adoption, renames)
- `80e97664` route + admin binding
- `af3edcfd` session saves never restore a revoked session
- `b35ec6c3` recovery `unlinkMcp` advances `version`
- `2ba226e2` parity golden carries the view's `version`

## Red first (each run before the fix; failing assertion in the commit messages)

- refresh vs admin disable: `true !== false` ("the refresh restored the enabled flag"); refresh after credential replaced: missing rejection
- store save: 6/6 failed (no version, stale form accepted, stale after revoke accepted, competing save lost, missing server accepted)
- plugin rename / adoption vs disable: both "restored the enabled flag"
- route: `200 !== 409`, `200 !== 400`; admin: no `expectedVersion` sent, generic message
- recovery: version 1, expected 3 (SQLite, PGlite); sessions: "a stale whole-row save un-revoked the session" (member, principal; SQLite + PGlite), memory adapter
- Mutations: removing the version compare (memory repo: 3 red; SQL guard + WHERE: T-stale, T-cas, access-revoked-then-stale-save red on both dialects); removing the access `version + 1` (2 red)
- Honest note: the memory-repo contract tests (Jini commit 1) and the SQL adapter tests (Tovu `06a421d3`) were written alongside additive new methods, so their "red" is the mutations above, not a run against old code.

## Gates (exact commands, results)

BASE-RED standing rule applied: run on the base and on the branch, compared line by line.

- Jini: `pnpm guard` ok; `pnpm -r --if-present run typecheck` exit 0; vitest (`--maxWorkers` default per package, run in each package dir): core 198 files / 2940 tests, mcp 100 / 1784, integrations 99 / 2053, agent-plugins 147 / 2165 (2 skipped), user-management 104 / 1235, examples/neutral-host 15 / 66 — all pass.
- Tovu: `tsc -p tsconfig.json --noEmit` and `tsc -p tsconfig.tests.json --noEmit`: clean. `apps/admin`: `tsc --noEmit` clean; vitest `src/features/settings src/features/security src/features/integrations src/lib --maxWorkers=2`: 197 files / 3293 tests pass.
- `npm run check:size`, `check:complexity`, `check:architecture` (red on the base): **no new or worsened line** vs the base output (one `toItem` complexity line only moved by a line number). `check:errors`, `check:hooks`: no new entries / ok.
- Tovu node tests (`/tmp/tt.sh` = `node --import tsx … --test --test-concurrency=2`, the repo's own runner; vitest is only used in `apps/admin` and Jini): the external-MCP / agent-plugin / session / members / identity set. Final set (278 files matching external-mcp / agent-plugin / session(s) / members / identity / hosted-mcp, Postgres files excluded; `/tmp/tt.sh` with the files listed): **4748 tests, 4739 pass, 9 fail, 0 cancelled**. All 9 are on the base-red list (Postgres-only or the boundary / discovery / statement-count tests above) **except one**: `serve-command.integration.test.ts` "an identity re-seed failure from a non-built-in owner role conflict must be logged while the serve process continues serving" (the injected seed failure did not occur in this container; it spawns a serve process). It is unrelated to what changed here (session saves and external-MCP writes; no role or seed code was touched). A re-run on this branch failed the same way (39 s); a base re-run in a second worktree produced no result (the worktree shares this container's `node_modules`, linked to the branch's Jini build, so it is not a clean base). Treat it as an unverified environment/timing failure to re-check in CI, not as proven pre-existing.
- Not run: any `*.postgres.test.ts` (no Postgres here: `access-choice.postgres`, `external-mcp-frozen-db.postgres`, `vault-read-parity.postgres`; they got `version: 1` fixture edits only) and the full 4000-file Tovu suite.
- Base red seen and unchanged: Postgres-only files, `vault read/write/cascade parity` rows that need Postgres, `no production file … value-imports from src/assistant/` boundary test, `AGENT_PLUGIN_SET_ENABLED: post-activation discovery failure …` (2), `external_mcp` statement-count tests.
- Pre-push hook: did not block; no `--no-verify` used.

## Existing tests changed, and why

Because production now writes through the conditional methods: failure injection moved from `upsert` to `insert` (a create) / `updateIfVersion` (edit, adoption, rename); repo fakes forward the three new methods; seeds of an existing row use `updateIfVersion`; adoption and form saves advance `version` (frozen-db changed-columns list, set-enabled adoption row, `federate-mcp` adoption test); the frozen-db test sees one `updateOAuthRuntime` and one fewer kernel run for a refresh; the access-only contract test expects `version + 1`; type pins list `version` / `expectedVersion`; the import-access-token test that simulated a stale "no row" read now sees a refused insert plus one conditional update instead of two blind upserts; `repo.contract.test` no longer pins "a later save clears `revokedAt`" (that was the bug); the vault parity golden carries the view's `version`.

## Left (S1) and why

1. **`upsert` is still on `ExternalMcpServerRepoPort`.** No production code calls it any more (verified by grep in both repos), but ~200 Tovu test seeds use it and some rewrite an existing row. Removing it is the S10 "blind branches deleted" step: seed with `insert`, edit with `updateIfVersion`. Until then it is the one remaining whole-row writer.
2. **`external_mcp_save` tool basis.** It keeps its access-snapshot basis (`expected`, taken when the form was raised); `label` is not in that snapshot. The in-request version is used. Adding `version` to the raised form is the follow-up. The tool's `versionConflictRule` was not added.
3. **`expectedVersion` stays optional on the wire** (until S10 → 428), as the design says; the admin tab always sends it.
4. Late-token drop: the thrown re-authorization error carries the server and workspace ids in its cause, **not the two secret ids** (the sign-in has no port to read an envelope's vault id). A structured log line was not added (no logger on `SignInDeps`).
5. Conflict UI: the External MCP tab shows the existing plain-words `VERSION_CONFLICT_MESSAGE`; the S0b `save-conflict` feature (changed-field list, load theirs) does not exist yet.
6. **S0/S0b were not done** (the no-op rule and the shared conflict notice). S1 does not depend on them.

## S3 (users, roles, policies) — not started

Budget: about 2h wall clock, mostly spent on S1's four Jini packages plus Tovu. S3 needs `version` on three record types in
`@jini-ai/user-management`, a split of `save` into insert and conditional update for three repos in two repos, moving
`updateRole`/`updatePolicy` inside the identity transaction, `recordLogin`, the routes, admin forms and four tools. Next step:
Jini `packages/user-management/src/core/types.ts` — add `version: number` to `UserRecord`, `RoleRecord`, `PolicyRecord`, then
`UserRepoPort/RoleRepoPort/PolicyRepoPort` `insert` + `updateIfVersion` (memory first, T-stale / T-cas tests as in
`store.memory.optimistic.test.ts`), then Tovu `identity/repo.ts` (migration 0042 already added the columns).

## Overlaps with parallel runs

Tovu `members/repo.ts` (S4: member-session `save` only), `identity/repo.ts` (S3), `vault-credential-recovery.ts`,
`external-mcp/*`, `agent-plugins/*` (wave1 runs), the vault parity golden. No other file overlap noticed; no rebase was needed
(`git pull --rebase` was a no-op each time).
