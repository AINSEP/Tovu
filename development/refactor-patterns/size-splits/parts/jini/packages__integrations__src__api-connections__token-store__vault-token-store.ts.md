### jini:packages/integrations/src/api-connections/token-store/vault-token-store.ts
- **Over:** `createVaultOAuthTokenStore` 147
- **Phase:** now · **Batch:** size-29
- **Tests:** `src/api-connections/token-store/__tests__/vault-token-store.unit.test.ts`, `…/vault-token-store.security.test.ts`, `…/vault-token-store.slice.test.ts`, `src/api-connections/__tests__/credential-status.integration.test.ts` (`pnpm --filter @jini-ai/integrations exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | consts, `OAuthTokenVaultPort`, `VaultOAuthTokenStoreDeps`, private record interfaces | contracts (unchanged) |
| B | `identity`, `open`, `writeRecord`, `openInstallTarget`, `deleteOnce` | raw vault row access for one owner |
| C | `loads`, `observeLoad`, `takeRecentLoads` | recent-load observation window |
| D | `fencedWrite`, `claimLease` | lease-fenced writes |
| E | `held`, `installOnce`, `return {` | the store surface (stays) |

- **Splits** (same file, module level above `createVaultOAuthTokenStore`, in this order):
  1. HELPER `createVaultRecordAccess({ vault, vaultScope, owner, isConflict }: CreateVaultRecordAccessInput): VaultRecordAccess` ← `const identity = (key: string): VaultIdentity =>`, `const open = async (key: string)`, `const writeRecord = async (key: string, required:`, `const openInstallTarget = async (key: string)` (with its "Lease fields are kept" comment), `const deleteOnce = async (key: string)` (with its "Needs only the revision" comment). Returns those five. `VaultRecordAccess` = `ReturnType<typeof createVaultRecordAccess>`.
  2. HELPER `createLoadObservations({ clock }: CreateLoadObservationsInput): LoadObservations` ← `const loads = new Map<string, LoadObservation[]>();` (with its comment), `const observeLoad`, `const takeRecentLoads`. Returns `{ loads, observeLoad, takeRecentLoads }`.
  3. HELPER `createLeaseWriters({ held, readGeneration, open, owner, writeRecord, isConflict, clock, vault, identity }: CreateLeaseWritersInput): LeaseWriters` ← `const fencedWrite = async (key: string, required:` (with its "Every token write re-proves…" comment) and `const claimLease = async (key: string, required:`. Returns `{ fencedWrite, claimLease }`.
  4. `createVaultOAuthTokenStore` keeps: the deps destructure, `isConflict`, the workspace check (must stay before any helper call), `const held = new Map` (with its comment), then `const { identity, open, writeRecord, openInstallTarget, deleteOnce } = createVaultRecordAccess(...)`, `const { loads, observeLoad, takeRecentLoads } = createLoadObservations({ clock })`, `const { fencedWrite, claimLease } = createLeaseWriters(...)`, `installOnce`, and the `return {` unchanged.
- **Importers to update:** none outside the file.
- **After:** file ~190; `createVaultOAuthTokenStore` ~88; helpers ≤ 32 each.
- **Risks / notes:** `held` and `loads` Maps must be created once per store (each helper is called once). The workspace-mismatch throw stays the first statement after destructuring.
