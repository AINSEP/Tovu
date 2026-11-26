# identity

## Wiring

- The `UserPurgePort` adapter is Jini's `KernelUserPurge` (`@jini-ai/user-management/identity/sql/kernel-user-purge`,
  moved from this folder in merge-25); the host builds it from the composed content kernel
  (`new KernelUserPurge({ kernel: schemaErasedKernel({ store: kernel }), eventValues })`) in
  `server/runtime/composition/site-deps/trash-adapters.ts`. There is no `Sqlite*` alias subclass.
- `repo.sqlite.ts` binds Tovu's `contentKernel` / `ContentDb` handle to each `Sql*` repo.
- `repo.sqlite.ts` also binds the role/principal assignment repos from `@jini-ai/user-management/server/sql` (kernel, `createIdentityTransactions`, table names).
- `repo.sqlite.ts` also binds the Jini SQL recovery-code, passkey and MFA stores (`@jini-ai/user-management/server/sql`) to the content kernel, `createIdentityTransactions` and Tovu's `owner_*` table names; the queries live in Jini.
