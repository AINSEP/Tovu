# S3-identity-sql — machine-verified facts (generated; do not hand-edit)

Source: Tovu tree at `LANE_ROOT` (ref `integ/merge-final-2026-11-16`) @ `232764af5`. Regenerate: `LANE_ROOT=<tovu clone> python3 scripts/inv.py && LANE_ROOT=<tovu clone> python3 scripts/rep.py && LANE_ROOT=<tovu clone> python3 scripts/facts.py [<out dir>]`. Blobs are `git hash-object` of that tree; a sheet executor re-checks every blob (COMMON STOP-on-mismatch).

Files: 9, 1144 lines (tests not counted).

## Files
| path (under apps/website/src) | lines | blob | CLASSIFY label | audit row | existing sheet/design mention | prod importers | test importers |
|---|---|---|---|---|---|---|---|
| features/identity/repo.ts | 710 | 97dc521ab288b03ccd5340d57cca396e35821d8e | - | - | lost-updates-design-2026-11-16:CODEX-JUDGE.md | 4 | 6 |
| features/identity/repo.sqlite.ts | 84 | aed9e2a99a52dda165cd60deda471d2d6f95964c | - | - | - | 1 | 2 |
| features/identity/repo.memory.ts | 42 | 6a44dff5c16311b33d83a53b7b6d10f01615b10a | - | audit2:A26 | - | 1 | 4 |
| features/identity/mfa.repo.ts | 56 | a48105ba20bd61436708a80fbd97ded42bf1c7b5 | MOVE-AFTER | - | - | 1 | 2 |
| features/identity/passkeys.repo.ts | 34 | 1c2fda183f0ac6fecb377f67f407fc6aa27b3c4e | MOVE-AFTER | - | - | 1 | 1 |
| features/identity/recovery-codes.repo.ts | 34 | a2e4e599e0ed557c809e6cf9b18b2688fcd4afbd | MOVE-AFTER | - | - | 1 | 1 |
| features/identity/user-purge.ts | 92 | 9cb2ee3461d2fe260ac6cca54c5f2833328780ed | - | - | - | 1 | 3 |
| features/identity/user-purge.sqlite.ts | 8 | 0b48f17232e4a0951e4e02b0ec53ed4565c3811d | DELETE | - | - | 1 | 6 |
| features/identity/user-purge-types.ts | 84 | a1b9d02368f1884efdda5d71e925190be3896ed6 | - | audit2:A26 | - | 5 | 2 |

## Per file: exports, tables, lock keys, imports that leave the folder, importers

### features/identity/repo.ts (710 lines)
- exports (11): createIdentityTransactions, SqlPrincipalRepo, SqlUserRepo, SqlSessionRepo, SqlRoleRepo, SqlPolicyRepo, SqlPolicyPermissionRepo, SqlRolePolicyRepo, SqlPrincipalRoleRepo, SqlPrincipalPolicyRepo, SqlApiKeyRepo
- tables touched: api_keys, identity_users, policies, policy_permissions, principal_policies, principal_roles, principals, role_policies, roles, sessions
- lock keys: 52: await kernel.lockKey(`identity:${workspaceId}`);
- flags: -
- npm/@jini-ai imports: @jini-ai/user-management, kysely
- same-folder imports: features/identity/api-key-types.ts
- imports leaving the folder: platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (4): features/identity/mfa.repo.ts, features/identity/passkeys.repo.ts, features/identity/repo.sqlite.ts, features/identity/wiring.ts
- test importers (6): features/identity/__tests__/mfa.repo.dialects.test.ts, features/identity/__tests__/passkeys.repo.dialects.test.ts, features/identity/__tests__/recovery-codes.repo.dialects.test.ts, features/identity/__tests__/repo.contract.test.ts, features/identity/__tests__/repo.sqlite-kernel.test.ts, features/member-login/__tests__/link-service.dialects.test.ts

### features/identity/repo.sqlite.ts (84 lines)
- exports (10): SqlitePrincipalRepo, SqliteUserRepo, SqliteSessionRepo, SqliteRoleRepo, SqlitePolicyRepo, SqlitePolicyPermissionRepo, SqliteRolePolicyRepo, SqlitePrincipalRoleRepo, SqlitePrincipalPolicyRepo, SqliteApiKeyRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/identity/repo.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/sqlite/content-db.ts
- prod importers (1): features/identity/wiring.ts
- test importers (2): features/identity/__tests__/repo.sqlite-kernel.test.ts, features/identity/__tests__/repo.sqlite.test.ts

### features/identity/repo.memory.ts (42 lines)
- exports (1): InMemoryApiKeyRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/identity/api-key-types.ts
- imports leaving the folder: -
- prod importers (1): features/identity/wiring.ts
- test importers (4): features/identity/__tests__/api-key-service.test.ts, features/identity/__tests__/repo.contract.test.ts, features/identity/__tests__/wiring.test.ts, server/inbound/admin-http/routes/api-keys/__tests__/handler-failures.test.ts

### features/identity/mfa.repo.ts (56 lines)
- exports (1): createMfaStore
- tables touched: owner_mfa_factors, owner_mfa_pending, owner_passkeys
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/user-management/server
- same-folder imports: features/identity/repo.ts
- imports leaving the folder: platform/db/content-kernel.ts
- prod importers (1): features/identity/wiring.ts
- test importers (2): features/identity/__tests__/mfa.repo.dialects.test.ts, features/identity/__tests__/passkeys.repo.dialects.test.ts

### features/identity/passkeys.repo.ts (34 lines)
- exports (1): createPasskeyStore
- tables touched: owner_passkeys
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/user-management/server
- same-folder imports: features/identity/repo.ts
- imports leaving the folder: platform/db/content-kernel.ts
- prod importers (1): features/identity/wiring.ts
- test importers (1): features/identity/__tests__/passkeys.repo.dialects.test.ts

### features/identity/recovery-codes.repo.ts (34 lines)
- exports (1): createRecoveryCodeStore
- tables touched: owner_recovery_codes
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/user-management/server
- same-folder imports: -
- imports leaving the folder: platform/db/content-kernel.ts
- prod importers (1): features/identity/wiring.ts
- test importers (1): features/identity/__tests__/recovery-codes.repo.dialects.test.ts

### features/identity/user-purge.ts (92 lines)
- exports (1): SqlUserPurge
- tables touched: identity_users, outbox_events, principals, secrets_vault
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/contracts/events, @jini-ai/core/primitives
- same-folder imports: features/identity/user-purge-types.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/repos/outbox-repo.ts
- prod importers (1): features/identity/user-purge.sqlite.ts
- test importers (3): features/identity/__tests__/user-purge.test.ts, features/trash/__tests__/user-adapter.dialects.test.ts, server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts

### features/identity/user-purge.sqlite.ts (8 lines)
- exports (1): SqliteUserPurge
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/identity/user-purge.ts
- imports leaving the folder: -
- prod importers (1): server/runtime/composition/deps.ts
- test importers (6): features/identity/__tests__/delete-user-service.test.ts, features/trash/__tests__/user-adapter.test.ts, platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts, server/inbound/admin-http/routes/users/__tests__/delete.test.ts, server/runtime/composition/__tests__/account-purge-protections.test.ts, server/runtime/composition/__tests__/trash-user-tool-port.test.ts

### features/identity/user-purge-types.ts (84 lines)
- exports (5): PurgeCounts, UserPurgeReason, UserPurgePort, UserDeleteUnsupportedError, InMemoryUserPurge
- tables touched: -
- lock keys: -
- flags: tovu-text
- npm/@jini-ai imports: @jini-ai/core/contracts/events, @jini-ai/core/primitives
- same-folder imports: -
- imports leaving the folder: -
- prod importers (5): features/identity/delete-user-service.ts, features/identity/user-purge.ts, features/trash/adapters/user.ts, server/inbound/admin-http/routes/users/delete.ts, server/runtime/composition/trash-user-tool-port.ts
- test importers (2): features/identity/__tests__/delete-user-service.test.ts, features/identity/__tests__/user-purge.test.ts

## Test files that import a file of this sheet (blob-guard each before editing)
| test | lines | blob |
|---|---|---|
| features/identity/__tests__/mfa.repo.dialects.test.ts | 74 | 614fa69cc829cab165ee35d78cc4c116f7f88c5c |
| features/identity/__tests__/passkeys.repo.dialects.test.ts | 54 | ae4dd52999cc41f23fc140c57bd24bdf1a8e4c83 |
| features/identity/__tests__/recovery-codes.repo.dialects.test.ts | 47 | 9af1db8f7ecaabf6d75cf2ce54a55a1085df808e |
| features/identity/__tests__/repo.contract.test.ts | 495 | a16261639ecf494fd21134b23af1a7f20e33b855 |
| features/identity/__tests__/repo.sqlite-kernel.test.ts | 61 | ffb61c9059730ff4a1fbd24b9c7df5d1f58ef965 |
| features/member-login/__tests__/link-service.dialects.test.ts | 55 | 6b9a5b54d58d5fcb933b28ba13d6d6e21c2ad872 |
| features/identity/__tests__/repo.sqlite.test.ts | 33 | 5b0a056c176ac738d18934be5c54a86571a4d2fb |
| features/identity/__tests__/api-key-service.test.ts | 412 | e98186e8199d366989561773af553c6de9450bf2 |
| features/identity/__tests__/wiring.test.ts | 636 | 3f0f3623619020b49032109193765a8cf282defe |
| server/inbound/admin-http/routes/api-keys/__tests__/handler-failures.test.ts | 143 | 880c66fd104b782779fdc0a23ccff038a8f02755 |
| features/identity/__tests__/user-purge.test.ts | 226 | 87120e92a1482de7e7a99d4544754f4fbf33579d |
| features/trash/__tests__/user-adapter.dialects.test.ts | 159 | 1e0a44cf78630b894463e2ee8ed54d352bbaa4b7 |
| server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts | 262 | 17653b0d2fb31b7dce2eff9f68b83e80a40ddaad |
| features/identity/__tests__/delete-user-service.test.ts | 641 | 9837eaa9de771bd4327307d151e13e5e91819657 |
| features/trash/__tests__/user-adapter.test.ts | 439 | ff290189d5ea5e12890242da7a4a48bb100f3c7c |
| platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts | 164 | 8f569ac0dc98f915d9928cf0356c605308067c2b |
| server/inbound/admin-http/routes/users/__tests__/delete.test.ts | 361 | 3ab5068096405a66d4198f16fedbc00ddcb25764 |
| server/runtime/composition/__tests__/account-purge-protections.test.ts | 209 | 5881d5bbc50d1dfeb23d2b2a5b042685d971a889 |
| server/runtime/composition/__tests__/trash-user-tool-port.test.ts | 199 | f4bde8114ef43fc0b3c694e48ae3630fffca05e4 |

## vi.mock / vi.doMock / importActual sites that name a file of this sheet (lesson 2: mock factories are consumers)
- none found by pattern (re-check with the census at execution)

## Path-keyed baselines / configs that name a file of this sheet (lesson 10: debt does not follow moved code silently)
- development/scripts/check-architecture.baseline.json: `src/features/identity/user-purge-types.ts` at lines 425 (1 hits)
- development/scripts/size-debt.json: `src/features/identity/repo.ts` at lines 866 (1 hits)

## Census command (run from the Tovu clone root; every hit must be listed above)
```
rg -n --no-heading -e 'mfa\.repo|passkeys\.repo|recovery\-codes\.repo|repo|repo\.memory|repo\.sqlite|user\-purge|user\-purge\-types|user\-purge\.sqlite' apps development scripts --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx' -g '*.json' -g '*.mjs' -g '*.cjs' | rg 'identity'
```
