## Wiring

- `types.ts` extends the Jini vault records (`VendorCredentialSetRecord`, `VendorCredentialSetRepoPort` from
  `@jini-ai/core/contracts/vault`) with the host's `tokenHint`; it re-exports nothing. Callers import
  `VendorCredentialSetSummary` from `@jini-ai/core/contracts/vault` directly.
- `index.ts` stays the feature's public surface for the host-owned modules (`types.ts`, `repo.memory.ts`,
  `vault-adapter.ts`, `project-scope.ts`) and no longer lists the summary type.
