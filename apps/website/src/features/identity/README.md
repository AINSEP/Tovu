# identity

## Wiring

- `user-purge.ts`'s `SqlUserPurge` is the `UserPurgePort` adapter; the host builds it from the
  composed content kernel (`new SqlUserPurge({ kernel, eventValues })`) in
  `server/runtime/composition/site-deps/trash-adapters.ts`. There is no `Sqlite*` alias subclass.
- `repo.sqlite.ts` binds Tovu's `contentKernel` / `ContentDb` handle to each `Sql*` repo.
