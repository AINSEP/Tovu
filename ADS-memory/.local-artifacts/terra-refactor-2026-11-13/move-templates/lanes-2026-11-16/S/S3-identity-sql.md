> **REVISION 2 HOLD (2026-11-17): do NOT dispatch this sheet as written.** The Codex judge's finding(s) below were checked against the code and accepted; the redesign is not written yet (INDEX §7 and "Revision 2 - judge response"). Until this banner is removed the sheet is input for the next planning run, not an executor brief.
> Finding 8: row 61 describes an MFA-store passkey read (the only `owner_passkeys` operation in `mfa.repo.ts:48-53` is the delete in `clear`); row 59 treats `factor` + `saveFactor` as one locked sequence (each opens its own transaction; the anti-replay unit is the caller's outer identity transaction, pinned by `mfa.repo.dialects.test.ts:59-67`).

# S3 — identity SQL adapters (principals, users, sessions, roles, policies, MFA, passkeys, recovery codes) -> `@jini-ai/user-management/server/sql`

Security code. Template: T-SQLREPO. Facts: `S3-identity-sql.facts.md` (9 files, 1,144 lines, 19 test files).
Serialized with U3 (both edit `features/identity/repo.ts`, `repo.sqlite.ts`, `wiring.ts`): S3 first, then U3.

```
id: S3-identity-sql      (two runs: S3a = repo.ts minus SqlApiKeyRepo; S3b = the three owner-factor stores + user purge)
feature: website/features/identity (SQL adapters only)
jini_target: user-management NEW subpath ./server/sql (runtime node)
  NEW packages/user-management/src/server/sql/{tables.ts,repo.rows.ts,repo.ts,transactions.ts,mfa.ts,passkeys.ts,recovery-codes.ts,index.ts}
prerequisites:
  - S0 green + mutations red (P1 identity key, P5 token hashes, P6 shapes).
  - P-DEP: `kysely` declared by @jini-ai/user-management (INDEX prerequisite). Check: `node -e 'const j=require("./packages/user-management/package.json");if(!((j.peerDependencies||{}).kysely))process.exit(1)'` in the Jini clone. Exit 1 = SKIPPED "kysely not declared" (never lazy-import, never add it yourself).
  - Untangle R3 (user-management): either landed, or `rg -n "packages/user-management/(package.json|src/server/index.ts)" <untangle>/sheets/*.repoint.tsv` prints nothing. Else run after R3.
  - C3 landed: `rg -n "export interface StorageKernel" packages/core/src/contracts/storage/kernel.ts` prints a line (verified present on Jini origin/refactor/terra 02edbb68).
```

## port_compat (step 0; a mismatch in any member = SKIPPED)
| Jini port (print with) | Tovu implementer | What to compare |
|---|---|---|
| `PrincipalRepoPort`, `UserRepoPort`, `SessionRepoPort`, `RoleRepoPort`, `PolicyRepoPort`, `PolicyPermissionRepoPort`, `RolePolicyRepoPort`, `PrincipalRoleRepoPort`, `PrincipalPolicyRepoPort` — `sed -n 1,200p packages/user-management/src/core/ports.ts` | the nine `Sql*Repo` classes in `features/identity/repo.ts` (lines 70-646) | every method: `required` object field names, `null` on miss, list ordering (`ORDER BY`), `save` = upsert on which conflict columns, `revoke` idempotence |
| `IdentityTransactionPort` (same file, line 146) | `createIdentityTransactions` (repo.ts:46) | `run({ workspaceId, execute })`; nested call joins the open transaction; lock acquired INSIDE the transaction, BEFORE `execute` |
| `MfaStore` (`server/mfa/ports.ts:12`), `PasskeyStore` (`server/mfa/passkey-ports.ts:9`), `RecoveryCodeStore` (`server/recovery-codes.ts:11`) | `createMfaStore`, `createPasskeyStore`, `createRecoveryCodeStore` | each member; number coercions (`Number(row.last_step)`, `expires_at`, `attempts`); `sealedSecret` omitted (not `undefined`, not `null`) when the column is NULL; the in-memory twin `packages/user-management/src/server/repo.memory.ts` is the behavioural reference: run the SAME contract cases against both |

## split
| Declaration | Label | Where |
|---|---|---|
| `createIdentityTransactions` | MOVE | `sql/transactions.ts` `createIdentityTransactions({ kernel }, _optional = {})` |
| `toPrincipalRecord` … `toPrincipalPolicyRecord` (9 mappers) | MOVE | `sql/repo.rows.ts` |
| `SqlPrincipalRepo`, `SqlUserRepo`, `SqlSessionRepo`, `SqlRoleRepo`, `SqlPolicyRepo`, `SqlPolicyPermissionRepo`, `SqlRolePolicyRepo`, `SqlPrincipalRoleRepo`, `SqlPrincipalPolicyRepo` | MOVE | `sql/repo.ts`; constructor becomes `({ kernel, tables }, _optional = {})` (today positional `(kernel)`: shape change, callers = the 9 subclasses in `repo.sqlite.ts` only) |
| `SqlApiKeyRepo` + its mapper (repo.ts:647-710), table `api_keys` | STAY in this sheet | U3 moves it. S3a leaves it in a reduced `features/identity/repo.ts` importing the Jini pieces it needs. Do not move it "while here": API keys are independently removable (plan-v6 U3). |
| `createMfaStore` / `createPasskeyStore` / `createRecoveryCodeStore` | MOVE (S3b) | `sql/mfa.ts`, `sql/passkeys.ts`, `sql/recovery-codes.ts` |
| `SqlUserPurge` (`user-purge.ts`) | SPLIT (S3b) | the delete of `principals` + `identity_users` rows MOVES as `purgeIdentityRows({ kernel, tables, workspaceId, principalId })`; the `secrets_vault` delete and the `outbox_events` insert STAY in Tovu (other owners' tables: vault = `@jini-ai/db/secrets-vault`, outbox = S6). Tovu's `SqlUserPurge` keeps the ONE transaction that calls all three, in today's order. |
| `user-purge.sqlite.ts` (8 lines) | DELETE | repoint its one prod importer (`server/runtime/composition/deps.ts`) to `user-purge.ts` (CLASSIFY: DELETE) |
| `user-purge-types.ts`, `repo.memory.ts` | not this sheet | audit row A26 owns them (no sheet written yet; see INDEX "holes") |
| `repo.sqlite.ts` (10 subclasses) | STAY-WIRING | binding file; text under `wiring` |

## table_types / tables_binding
Jini declares interfaces for: `principals`, `identity_users`, `sessions`, `roles`, `policies`, `policy_permissions`,
`role_policies`, `principal_roles`, `principal_policies` (S3a) and `owner_mfa_factors`, `owner_mfa_pending`, `owner_passkeys`,
`owner_recovery_codes` (S3b). Copy each column set from `platform/db/content-database.generated.ts`; S0-P6 holds the same
unions. Tovu passes `tables: { principals: "principals", users: "identity_users", sessions: "sessions", roles: "roles",
policies: "policies", policyPermissions: "policy_permissions", rolePolicies: "role_policies", principalRoles: "principal_roles",
principalPolicies: "principal_policies" }` and, for S3b, `{ mfaFactors: "owner_mfa_factors", mfaPending: "owner_mfa_pending",
passkeys: "owner_passkeys", recoveryCodes: "owner_recovery_codes" }`. No default names in Jini.

## lock_keys
`identity:<workspaceId>` — owned by the identity domain; moves as a non-exported builder in `sql/transactions.ts`,
string byte-identical. Pinned by S0-P1 (Tovu, through the binding) and by the new Jini `lock-keys.test.ts`.
An N-1 server and an N server running against one Postgres must contend on the same key: the string is a compatibility
surface, not an implementation detail.

## Security chain (each step: owner after the move, and the test that fails if it is removed)
| Step | Owner after S3 | Characterization (written in T0, on unmoved code) | Mutation -> RED |
|---|---|---|---|
| Every identity read is workspace-scoped (`WHERE workspace_id = ?`) | Jini `sql/repo.ts` | two workspaces seeded with the same ids/usernames/token hashes; each `find*`/`list*` of every repo returns only its own workspace's rows | delete one `.where("workspace_id", …)` |
| Session lookup by token hash returns the row only for the exact hash; `revoke` sets `revoked_at` and a revoked session stays revoked after a later `save` of a stale copy (verify what today's code does first and pin THAT; if a stale `save` can clear `revoked_at`, report it as a finding, do not fix here) | Jini `sql/repo.ts` `SqlSessionRepo` | as described | drop the hash predicate; make `revoke` a no-op |
| Guarded mutations serialize: lock then execute, in one transaction | Jini `sql/transactions.ts` | recording kernel: order is `transaction` -> `lockKey("identity:<ws>")` -> body; body failure rolls back | move `lockKey` after `execute`; remove it |
| MFA factor read/write goes through the identity transaction (anti-replay: `last_step` is read and advanced under the lock) | Jini `sql/mfa.ts` | concurrent `factor` + `saveFactor` for one principal cannot interleave (recording kernel order); `last_step` round-trips as a number | call `kernel.run` without `transactions.run` |
| MFA pending token: found only by `(workspace_id, token_hash)`; `attempts` and `expires_at` round-trip; `clearPending` deletes only that principal's rows | Jini `sql/mfa.ts` | as described, two principals | drop a predicate |
| MFA store reads `owner_passkeys` (facts: `mfa.repo.ts` touches three tables) | Jini `sql/mfa.ts`, table name from the binding | read the method first; pin exactly what it returns for: no factor + no passkey, passkey only, factor only | return a constant |
| Recovery codes: single use | Jini `sql/recovery-codes.ts` + the Jini service that calls it | consuming a code twice: second attempt reports not-found/used exactly as today | remove the used/delete write |
| Sealed MFA secret is stored and returned opaque | unchanged (sealing stays where it is: the service above the store) | the store never receives or returns a plaintext secret: fixture secret string never appears in any row written | n/a (assert on rows) |

The verification steps themselves (password check, TOTP verify, passkey assertion, recovery-code verify) already live in
`@jini-ai/user-management/server` and do not move here; this sheet moves only their storage. The HTTP layer
(`server/inbound/admin-http/**`) and every auth predicate in the middleware chain are NOT touched: no route file is in this
sheet's edit list. If the census shows a route importing a moved symbol directly (it should import through `wiring.ts`),
repoint the import only.

## tests_split
All 19 test files in the facts file STAY in Tovu (they run Tovu migrations / the dialect matrix) and are repointed. New Jini
tests: `sql/__tests__/lock-keys.test.ts`, `sql/__tests__/mappers.test.ts` (row <-> record round-trips, pure).
The existing Jini contract suite for the memory repos, if one is exported under a `/conformance` or `/testing` subpath
(`ls packages/user-management/src/admin/conformance`; check for a server one), is ALSO run from a Tovu test against the SQL
adapters; if none exists for the server ports, do not invent one here (report it).

## wiring (Tovu, commit T1)
`features/identity/repo.sqlite.ts`: each `Sqlite*Repo` keeps its name and constructor `(store)` and becomes
`super({ kernel: contentKernel({ store }), tables: IDENTITY_TABLES })` importing the class from
`@jini-ai/user-management/server/sql`; `IDENTITY_TABLES` is a `const` in this file. `SqliteApiKeyRepo` is unchanged in S3.
`features/identity/wiring.ts`: lines 1, 2, 4, 35 (imports of the three stores and `createIdentityTransactions`) repoint to
the Jini subpath; calls at :366 and :377 gain `tables`. Text-guard each OLD line (occurs exactly once) — `wiring.ts` is a hot
file (CLASSIFY: MIXED, 378 lines; audit row A26 and U3 also edit it).
`features/identity/mfa.repo.ts`, `passkeys.repo.ts`, `recovery-codes.repo.ts`: deleted in S3b.

## commits
S3a: T0 (tests) -> J1 (tables, rows, repo, transactions, index, package.json export, changeset) -> T1 (repo.ts reduced to
`SqlApiKeyRepo`, repo.sqlite.ts, wiring.ts imports, baselines). S3b: J1 (mfa, passkeys, recovery-codes, purge helper;
`minor` changeset) -> T1 (three files deleted, user-purge.ts reduced, user-purge.sqlite.ts deleted, deps.ts repoint).
Each commit compiles alone: J1 only adds; T1 deletes a Tovu symbol in the same commit that repoints its last importer.

## stops
- `repo.ts` holds a declaration not in `split` (file changed) — SKIP.
- The lost-updates design (`plan/lost-updates-design-2026-11-16`, its CODEX-JUDGE names `identity/repo.ts`) has landed a
  revision/version column or CAS on any identity table since this sheet was written: re-read; LESSONS 16 says every writer of
  a protected record takes part in revision advancement. Do not move a writer the design is about to change; SKIP and report.
- Any need to touch a route, middleware, cookie, CSRF or origin check.
- `user-purge.ts` split would change statement order inside the transaction.

## estimate
S3a ~210k tokens (710-line file, 9 classes, 10 bindings, 12 repointed tests). S3b ~150k. Cut point for S3a: after J1.

## Not verified while planning
Method-by-method port comparison (step 0 does it). Whether `SqlSessionRepo.save` can clear `revoked_at`. What
`createMfaStore` reads from `owner_passkeys`. Whether R3's repoint TSV touches `server/index.ts`. Per-method size/complexity
of the nine classes inside the new file (measure in J1; each class is 50-75 lines of several short methods by the line map).
