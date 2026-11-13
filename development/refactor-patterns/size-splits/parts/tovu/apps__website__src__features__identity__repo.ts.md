### tovu:apps/website/src/features/identity/repo.ts
- **Over:** file 616 lines (no function over 100)
- **Phase:** after-move (MOVE-AFTER content schema type; MOVE-AFTER …) · **Batch:** size-48
- **Tests:** `apps/website/src/features/identity/__tests__/repo.contract.test.ts`, `apps/website/src/features/identity/__tests__/repo.sqlite.test.ts`, `apps/website/src/features/identity/__tests__/repo.sqlite-kernel.test.ts`, `apps/website/src/features/identity/__tests__/mfa.repo.dialects.test.ts`, `apps/website/src/features/identity/__tests__/passkeys.repo.dialects.test.ts`
- **Responsibility map:** A accounts (`createIdentityTransactions`, `toPrincipalRecord`/`SqlPrincipalRepo`, `toUserRecord`/`SqlUserRepo`, `toSessionRecord`/`SqlSessionRepo`, `toApiKeyRecord`/`SqlApiKeyRepo`) · B RBAC (`toRoleRecord`/`SqlRoleRepo`, `toPolicyRecord`/`SqlPolicyRepo`, `toPolicyPermissionRecord`/`SqlPolicyPermissionRepo`, `toRolePolicyRecord`/`SqlRolePolicyRepo`, `toPrincipalRoleRecord`/`SqlPrincipalRoleRepo`, `toPrincipalPolicyRecord`/`SqlPrincipalPolicyRepo`).
- **Splits:**
  1. NEW `repo-transactions.ts` — Moves `createIdentityTransactions` (+ the `@file` paragraph on the one-Kysely-body adapters, copied). Exports it.
  2. NEW `repo-rbac.ts` — Moves unit B (mappers stay next to their class). Imports `createIdentityTransactions` from step 1. Exports the six classes.
  `repo.ts` keeps unit A, importing `createIdentityTransactions` from step 1.
- **Importers to update:** `createIdentityTransactions` → `features/identity/mfa.repo.ts`, `features/identity/passkeys.repo.ts`, `features/identity/wiring.ts`, tests `__tests__/passkeys.repo.dialects.test.ts`, `__tests__/recovery-codes.repo.dialects.test.ts`, `__tests__/repo.sqlite-kernel.test.ts`, `__tests__/mfa.repo.dialects.test.ts`; RBAC classes → `features/identity/repo.sqlite.ts`, `features/identity/__tests__/repo.contract.test.ts`. Also rg `from ".*identity/repo(\.js)?"` for any other path (e.g. composition) and repoint per name.
- **After:** `repo.ts` ~290; `repo-rbac.ts` ~320; `repo-transactions.ts` ~15.
- **Risks / notes:** no `mock.module` of `identity/repo` found. MOVE-AFTER: if the schema/repo moves to Jini first, this split is moot.
- **Owner exception candidate:** alternatively — ten sibling repo classes of one adapter family; acceptable either way (split above is by table family, so it is a real responsibility split).
