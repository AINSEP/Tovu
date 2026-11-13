### jini:packages/integrations/src/media-providers/dispatch/async-operation-store.ts
- **Over:** `createInMemoryAsyncOperationStore` 106
- **Phase:** now · **Batch:** size-29
- **Tests:** `src/media-providers/dispatch/__tests__/async-operation-store.test.ts`, `…/async-operation-store.contract.test.ts`, `…/operation-runtime.test.ts` (`pnpm --filter @jini-ai/integrations exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | types, constants, `assertNoCredentialMaterial`, `hydrateAsyncOperationRecord`, `assertTransition`, `mergeAsyncOperationPatch` … | shared store rules (unchanged) |
| B | prop `create` | in-memory insert |
| C | prop `reconcileOnBoot` | in-memory boot reconciliation |
| D | `rows` + remaining props | in-memory store (stays) |

- **Splits** (same file, above `createInMemoryAsyncOperationStore`):
  1. HELPER `createInMemoryRow({ rows, input }: CreateInMemoryRowInput): AsyncOperationRecord` ← body of prop `create` (keep `async`/return type exactly as the prop has them; if the prop is `async`, the helper is too and returns `Promise<AsyncOperationRecord>`).
  2. HELPER `reconcileInMemoryRows({ rows, options }: ReconcileInMemoryRowsInput): AsyncOperationReconcileResult` ← body of prop `reconcileOnBoot` (same async rule).
  3. Props become `create: (input) => createInMemoryRow({ rows, input })` style one-liners (keep the method doc comments on the props).
- **Importers to update:** none.
- **After:** file ~320; `createInMemoryAsyncOperationStore` ~55; helpers ~30 each.
- **Risks / notes:** `rows` is the only closure local. Keep `this`-free (props do not use `this`).
