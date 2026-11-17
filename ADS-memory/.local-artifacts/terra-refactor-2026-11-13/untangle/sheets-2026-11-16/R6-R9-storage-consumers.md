# R6 + R9 sheet: commerce, cms and cms-forms (5 sites, one Sonnet run, ~80k)

Read `COMMON.md` first. Sites: `sites/R6.sites.tsv` (2), `sites/R9.sites.tsv` (3). Needs: C3 (landed: `@jini-ai/core/contracts/storage`, `…/events`), C4 (landed). The two lanes are in one sheet because all five sites are leftovers of C3/C4; they touch three different packages and can also be split by package.

```
id: R6R9-storage-consumers
jini_files:
  - packages/commerce/src/payments/ledger/migrations/index.ts:1,3     | edit
  - packages/cms/src/forms/sql/submission-ip-retention-repo.ts:2      | edit
  - packages/cms/src/comments/ingress.ts:29                           | edit
  - packages/cms/forms/src/ports.ts:69                                | edit
  - packages/http-kit/src/rate-limit.ts:37                            | edit (type moves out)
  - packages/core/src/contracts/server/rate-limit.ts                  | NEW
tovu_file: apps/website/src/server/runtime/composition/jini-storage-consumers.ts (NEW)
```

## 1. commerce → db (`runMigrations`, `MigrationOptions`, `MigrationReport`, `KyselyKernel`)
Verified: the file already exports the data, `COMMERCE_PAYMENTS_MIGRATIONS: readonly MigrationStep<KyselyKernel<unknown>>[]` (`:34`), and a runner `migrateCommercePayments` (`:47`) that calls db's `runMigrations` (`db/src/migrate/runner.ts:217`). The runner is what leaves; the list is retyped.
- **Target (registration, DESIGN §2.2; C3's worked binding `migrateCommercePayments`):** commerce exports data, `export const COMMERCE_PAYMENTS_MIGRATIONS: readonly MigrationStep[]` typed from `@jini-ai/core/contracts/storage` (`migration.ts`; check the exported step type name with `rg -n "^export" packages/core/src/contracts/storage/migration.ts`). The host calls db's `runMigrations({ kernel, steps: COMMERCE_PAYMENTS_MIGRATIONS }, options)`.
- The existing exported runner function is **deleted** (no shell). Inventory its callers first: `rg -n "<its name>" packages apps examples` in both repos. Tests that call it inside commerce take a fake kernel only if they do not run SQL; tests that run real SQL keep `@jini-ai/db` as a **devDependency** through `@jini-ai/db/testing` (Q5; owner question Q-G1 in GAPS covers the same case for chat: until answered, move the SQL suite to `packages/integration-tests` is the fallback, and the report must say which was done).
- `KyselyKernel` (type): if a commerce signature still needs a kernel type after the runner is gone, use `StorageKernel` from core. No Kysely type may appear in commerce's public surface (owner rule: no library types).
- **Order trap (lesson 4):** if any step in the list depends on a table that another package's migrations create, the host must run them in that order. Record the order the old runner used (its options/report) and put it in the Tovu file's comment.
- Test first: a characterization test that lists the step ids and their order (`expect(ids).toEqual([...])`, written against the old runner's step source) so a dropped or reordered step fails.

## 2. cms → db (`listColumns`, `KyselyKernel`) in `forms/sql/submission-ip-retention-repo.ts:2`
- Verified: `listColumns` is **not** in core at the merged state (`rg -n "function listColumns" packages/core/src` prints nothing), so there is no repoint. Retype `KyselyKernel` as core's `StorageKernel`, and the repo's factory takes `columns: ColumnCatalogPort` as a required dependency and the host binds db's function.
- Test first: the repo's existing tests must pass with the injected/ repointed helper; add one case where the column is absent, asserting the repo's current behaviour for the legacy-schema branch (read the code: it calls `listColumns` to decide a branch). That case must fail if the branch is inverted.

## 3. cms → http-kit (`RateLimiter` type) in `comments/ingress.ts:29`
- `RateLimiter` is a pure interface (`http-kit/src/rate-limit.ts:37`, imports only `Clock`). Move the **interface and the types it references** to `packages/core/src/contracts/server/rate-limit.ts`, export from `core/src/contracts/server.ts`. The limiter **implementation** stays in http-kit and imports the type from core. Delete the interface from http-kit and repoint every importer in one commit: `rg -n "RateLimiter\b" packages apps examples` (both repos; Tovu importers are the paired commit).
- This touches `http-kit/src/rate-limit.ts`, which R7-Z also edits later (it deletes http-kit's Express pieces): land this before R7-Z.
- Security (class: request rate limiting): the type move changes no behaviour; assert it with the existing http-kit rate-limit tests, unchanged.

## 4. cms-forms → cms (`typeof import("@jini-ai/cms/core").executeCommand`) in `cms/forms/src/ports.ts:69`
- Replace with `ExecuteCommandFn` from `@jini-ai/core/contracts/events` (C3 landed it: verify `rg -n "ExecuteCommandFn" packages/core/src/contracts/events`). Check the two are assignable both ways by adding a type-level test in cms (`cms/src/core/__tests__/execute-command.typecheck.ts`: `const _: ExecuteCommandFn = executeCommand;`). If the real function is not assignable, **STOP**: the core type is wrong and C3 needs a follow-up.
- Then delete `@jini-ai/cms` from `packages/cms/forms/package.json` dependencies/peers if no production import is left, and retire the `cms-forms→cms` same-layer edge helper in `scripts/check-package-layers.ts` (coordinator line).

## Tovu wiring
```ts
// apps/website/src/server/runtime/composition/jini-storage-consumers.ts
import { runMigrations } from '@jini-ai/db/migrate';
import { COMMERCE_PAYMENTS_MIGRATIONS } from '@jini-ai/commerce/payments/ledger';   // use the real entry name
/** Order: <record the order the deleted runner used>. */
export const migrateCommercePayments = (required: { kernel: StorageKernel }, optional = {}) => runMigrations({ kernel: required.kernel, steps: COMMERCE_PAYMENTS_MIGRATIONS }, optional);
```
Check `runMigrations`'s real parameter shape (`packages/db/src/migrate/index.ts`) before writing this line: object versus positional, and where `options` sits. Coordinator: the one call site that ran the old commerce runner (`rg` result from §1) switches to `migrateCommercePayments`.

## Steps (each green alone)
1. §3 pair (core type + http-kit + cms + Tovu importers). 2. §4. 3. §2. 4. §1 pair. 5. Manifests: drop `@jini-ai/db` and `@jini-ai/http-kit` from cms, `@jini-ai/db` from commerce (production fields only).

## STOP
- A commerce or cms SQL test needs a real kernel and Q-G1 is unanswered and the suite cannot move cleanly.
- `ExecuteCommandFn` is not assignable to/from the real function.
