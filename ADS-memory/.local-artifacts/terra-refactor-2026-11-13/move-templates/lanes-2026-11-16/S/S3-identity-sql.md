# S3 (revision 2) — identity SQL adapters -> `@jini-ai/user-management/server/sql`

Security code. Template: T-SQLREPO rev 2. Facts: `S3-identity-sql.facts.md` (9 files, 1,144 lines, 19 test files).
Revision 2 fixes judge finding 8 (the MFA / passkey / recovery rows named behaviour the code does not have), adds the
file partition the 710-line source needs (finding 12 class), and withdraws the `SqlUserPurge` split.
Repos are public: this sheet names security checks by class and location only.

```
id: S3a-identity-repos (~220k, cut point after J1)   the nine Sql*Repo classes + createIdentityTransactions
    S3b-owner-factor-stores (~120k)                  createMfaStore, createPasskeyStore, createRecoveryCodeStore
jini_target: user-management NEW subpath ./server/sql (node)
prerequisites:
  - S0 DONE (P1 `identity:<ws>`, P5c frozen stored digests, P6).
  - xpkg C9c and R3b landed (they own `packages/user-management/**` in waves 1-2): proving commands below.
  - C3 storage contract: proving command below.
  - lost-updates: if its sheet is scheduled on `features/identity/repo.ts`, it runs first; re-take facts.
successor_of: S0.  Then U3a, U3b, U1a (same manifest, same Tovu hot files): serial, INDEX-SU §3.
```
Prerequisite commands (run in the Jini clone; each must print `ok`):
```bash
test -f packages/user-management/src/react/kit.tsx && echo ok          # C9c created the kit
# R3b's last commit removes @jini-ai/ui and @jini-ai/admin from the production fields of the manifest
node -e 'const j=require(process.argv[1]); const prod={...j.dependencies,...j.peerDependencies}; process.exit(prod["@jini-ai/ui"]||prod["@jini-ai/admin"]?1:0)' "$PWD/packages/user-management/package.json" && echo ok
rg -q "export interface StorageKernel" packages/core/src/contracts/storage/kernel.ts && echo ok   # C3
```
**`kysely` (replaces round-1 P-DEP).** `packages/user-management/package.json` does not declare it (checked on Jini
`af33fcdb`). S3a's J1 adds it as an optional peer exactly the way `packages/cms/package.json` does (peer + `peerDependenciesMeta`
optional + the `jini` opt-in message naming `@jini-ai/user-management/server/sql`) and commits `pnpm-lock.yaml` in the same commit.

## S3a
**partition.** The nine classes span `repo.ts:70-646` (577 lines): one Jini file would break the 500 limit.
| New file (`packages/user-management/src/server/sql/`) | From `features/identity/repo.ts` | ~Lines |
|---|---|---|
| `tables.ts` | Jini-local interfaces for `principals`, `identity_users`, `sessions`, `roles`, `policies`, `policy_permissions`, `role_policies`, `principal_roles`, `principal_policies`; `IdentitySqlTables`; `IdentitySqlRequired = { kernel; tables }` | 120 |
| `transactions.ts` | `createIdentityTransactions` (:46-56) with its comment; signature in the block below the table | 30 |
| `principals.ts` | `toPrincipalRecord` + `SqlPrincipalRepo` (:58-110), `toUserRecord` + `SqlUserRepo` (:111-181) | 140 |
| `sessions.ts` | `toSessionRecord` + `SqlSessionRepo` (:182-272) | 100 |
| `roles-policies.ts` | `SqlRoleRepo` (:273-336), `SqlPolicyRepo` (:337-409), `SqlPolicyPermissionRepo` (:410-473) with their mappers | 215 |
| `assignments.ts` | `SqlRolePolicyRepo` (:474-519), `SqlPrincipalRoleRepo` (:520-568), `SqlPrincipalPolicyRepo` (:569-630) with their mappers | 170 |
| `index.ts` | named exports | 15 |
`transactions.ts` signature (valid TypeScript; copy from here, not from the table):
```ts
import type { StorageKernel } from "@jini-ai/core/contracts/storage";
import type { IdentityTransactionPort } from "../../core/ports.js";   // declared at core/ports.ts:146

export type IdentityTransactionKernel = Pick<StorageKernel<unknown, unknown>, "transaction" | "lockKey">;

export function createIdentityTransactions(
  { kernel }: { kernel: IdentityTransactionKernel },
  _optional: Record<string, never> = {},
): IdentityTransactionPort { /* body of repo.ts:49-56, verbatim (the lock line moves byte-identical) */ }
```
Mappers stay beside their class as today (no separate rows file: fewer moved edges). Constructors become
`({ kernel, tables }, _optional = {})` (today positional `(kernel)`; the only callers are the subclasses in `repo.sqlite.ts`).
The file-header comment (`repo.ts:22-37`, why identity is durable, integer flags) moves to `tables.ts`, reworded neutral.
`SqlApiKeyRepo` + `toApiKeyRecord` (:631-710) **stay** in a reduced `features/identity/repo.ts` (U3a moves them).
**port_compat (step 0).** `sed -n 1,200p packages/user-management/src/core/ports.ts` vs each class: field names, `null` on
miss, list ordering, upsert conflict columns. `IdentityTransactionPort.run({ workspaceId, execute })`.
**lock_keys.** `` `identity:${workspaceId}` `` moves into `transactions.ts`, byte-identical (an N-1 and an N server on one
Postgres must contend on the same key). Pinned by S0-P1 through the Tovu binding and by a Jini `lock-keys.test.ts`.
**tree after S3a's T1 (compiles alone).** `features/identity/repo.ts`: imports + `toApiKeyRecord` + `SqlApiKeyRepo` only.
`repo.sqlite.ts`: nine subclasses become `super({ kernel: schemaErasedKernel({ store }), tables: IDENTITY_TABLES }, {})`
(`IDENTITY_TABLES` const in this file; real names: `principals`, `identity_users`, `sessions`, `roles`, `policies`,
`policy_permissions`, `role_policies`, `principal_roles`, `principal_policies`); `SqliteApiKeyRepo` untouched.
`mfa.repo.ts:3`, `passkeys.repo.ts:3` and `wiring.ts:35` import `createIdentityTransactions` from
`@jini-ai/user-management/server/sql` (a `ContentKernel` satisfies the `Pick` without a cast). `wiring.ts:366` unchanged.

## S3b
**split.** `mfa.repo.ts` (56) -> `sql/mfa.ts`; `passkeys.repo.ts` (34) -> `sql/passkeys.ts`; `recovery-codes.repo.ts` (34)
-> `sql/recovery-codes.ts`; each `create*Store({ kernel, tables }, _optional = {})`, bodies verbatim, queries from
`db.withTables<...>()`. Tables: `{ mfaFactors: "owner_mfa_factors", mfaPending: "owner_mfa_pending", passkeys: "owner_passkeys", recoveryCodes: "owner_recovery_codes" }`.
`createMfaStore` is one ~45-line function of six closures: measure; if over 50, each closure becomes a top-level
`({ ctx, input })` function in the same file, order of statements unchanged.
The three Tovu files are deleted; `wiring.ts:1,2,4` repoint; `wiring.ts:377` passes `tables`.
The existing `deleteFrom` calls on pending proofs, factors, passkeys and recovery digests are credential removal that
exists today; they move verbatim and nothing new is added (T-SQLREPO §6 delete gate).
**`SqlUserPurge` (`user-purge.ts`, 92) and `user-purge.sqlite.ts` (8): STAY in Tovu, unsplit.** The purge is ONE
transaction over nine tables of five owners (role and policy assignments, sessions, API keys, per-user settings, the
secrets vault, users, principals, then the outbox event). It is host orchestration; moving a slice would only risk the
statement order. `user-purge-types.ts` and `repo.memory.ts` belong to audit row A26 (INDEX-SU §7, R3-4).

## Security chain (finding 8): today's real behaviour, its owner after the move, the test that fails without it
All tests are T0, on unmoved code, real kernel; "recording kernel" = a wrapper recording `transaction` depth, `lockKey`
arguments and statements in order.
| # | What the code does today (location) | Owner after S3 | Characterization | Mutation -> RED |
|---|---|---|---|---|
| 1 | Every identity read is `(workspace_id, …)`-scoped (all nine classes) | `sql/*.ts` | two workspaces seeded with the same ids, usernames and token digests: every `find*` / `list*` returns only its own rows | delete one workspace predicate (one mutation per method) |
| 2 | Session lookup matches the exact stored digest (`repo.ts` `findByTokenHash`); `revoke` sets `revoked_at` under the identity transaction | `sql/sessions.ts` | S0-P5c fixture found; one-character-different digest not found; after `revoke`, the row carries the instant; recording kernel shows lock before the UPDATE | drop the digest predicate; make `revoke` skip the write |
| 3 | `SqlSessionRepo.save` is a whole-row upsert on `id` (`repo.ts` `save`) | `sql/sessions.ts` | pin EXACTLY what a second `save` does to every column, `revoked_at` included, whatever that is; do not change it in a move. The concern (class "stale write on a revocation field", this method) is already logged in `development/open-bugs.md` (entry of 2026-11-16 ~8:05 PM PT, lost-updates class); its fix belongs to the lost-updates design, not to this sheet. This characterization test stays and is the regression baseline that fix will change on purpose | change the conflict update set |
| 4 | The guard: `transaction` -> `lockKey("identity:<ws>")` -> `execute`; nested calls join the open transaction; a throw rolls everything back (`repo.ts:46-56`) | `sql/transactions.ts` | recording kernel order; nested `run` inside `run` shows one outermost transaction and the lock before the first statement; a body that writes then throws leaves no row | remove `lockKey`; call `execute()` without `kernel.transaction` |
| 5 | Each MFA store method opens its OWN guard (`mfa.repo.ts:22-32`): `factor` and `saveFactor` are NOT atomic together. Anti-replay comes from the CALLER wrapping the whole proof in one outer guard | caller: `@jini-ai/user-management/server` MFA service (unchanged); store: `sql/mfa.ts` | the existing `__tests__/mfa.repo.dialects.test.ts:59-67` case (two concurrent complete-proof bodies, each in ONE outer `transactions.run`: results `[false, true]`, `lastStep` advanced once, pending gone) stays and runs on every dialect of the matrix; plus the recording-kernel form: inside an outer guard, `factor` + `saveFactor` + `clearPending` add no second outermost transaction | mutation 4's; and make the store call `kernel.run` through a second kernel (not joining) -> the test's rollback half fails |
| 6 | `clear` deletes that principal's pending proofs, **passkeys** and factor, in that order, in one guard (`mfa.repo.ts:48-53`). The MFA store never reads passkeys | `sql/mfa.ts` | two principals each with factor, pending and a passkey: after `clear(A)`, A has none of the three, B has all three; `clear` then throw inside an outer guard restores all (existing test, kept) | remove the passkey delete; drop a principal predicate |
| 7 | Pending proof: found only by `(workspace_id, token digest)`; `expiresAt` and `attempts` are numbers; `sealedSecret` key is ABSENT when the column is NULL; `savePending` upserts on `(workspace, principal, purpose)`; a second principal cannot hold the same digest | `sql/mfa.ts` | each as stated (`"sealedSecret" in result === false`); the existing rejection case stays | drop a predicate; return `sealedSecret: undefined`; change the conflict target |
| 8 | Passkeys: `list` is principal-scoped, ordered by credential id, at most 6; `save` on an existing `(workspace, credential id)` updates ONLY the counter and ONLY when principal, stored public key and relying-party id all match, else throws the ownership-conflict error (`passkeys.repo.ts:17-25`) | `sql/passkeys.ts` | same credential id presented by another principal / with another public key / with another relying-party id: each throws, stored row unchanged; matching save changes only `counter` | drop each of the three conflict predicates in turn (three mutations, three tests) |
| 9 | Recovery digests: the store opens NO transaction and takes NO lock (caller-owned, `recovery-codes.repo.ts`); `replace` refuses more than ten BEFORE any write; `replace` = scoped clear + insert; `contains` matches `(workspace, principal, digest)` exactly. Single use is the Jini service's rule, not the store's | caller: `server/recovery-codes.ts` (unchanged); store: `sql/recovery-codes.ts` | eleven digests: `RangeError` with today's message and the old set intact; inside an outer guard `replace` then throw: old set restored; `contains` false for another principal's digest; recording kernel: no `lockKey` from the store itself | move the limit check after `clear`; drop the principal predicate; add a lock (the "no own transaction" row fails) |
| 10 | Sealed factor secrets pass through opaque | unchanged (sealing is above the store) | the fixture plaintext never appears in any written row | n/a (assert on rows) |
The verification steps (password, time-based code, passkey assertion, recovery-code check) already live in
`@jini-ai/user-management/server` and do not move. No route, middleware, cookie, CSRF or origin file is edited:
`git diff --stat $BASE..HEAD -- apps/website/src/server` lists only `wiring`-driven specifier changes, else STOP.

## tests_split / commits / stops
All 19 Tovu test files stay (they run Tovu migrations) and are repointed. New Jini tests: `lock-keys.test.ts`, mapper
round-trips, and the passkey/recovery rows above against a fake `StorageKernel` where they need no real SQL.
S3a: T0 -> J1 (peer + lockfile + export + files + changeset) -> T1. S3b: T0 (rows 5-9) -> J1 -> T1. Gates: T-SQLREPO §5.
- STOP: `repo.ts` holds a declaration not in the partition table (`rg -n "^(export )?(class|function|const) " apps/website/src/features/identity/repo.ts` vs the table).
- STOP: a mutation in rows 1-9 leaves its test green (the row is NOT CHARACTERIZED: do not move that store).
- STOP: `wiring.ts` OLD line does not occur exactly once (`rg -c -F "<old line>" apps/website/src/features/identity/wiring.ts`).
Not verified while planning: port members one by one (step 0); whether the server ports have a Jini conformance suite
(`ls packages/user-management/src/admin/conformance` is the admin one; if none exists for the server ports, report it, do not invent one).
