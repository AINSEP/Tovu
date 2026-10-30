/**
 * @file Public surface for the `vendor-credentials` feature (ADR-009 §1): the `vendor_credential_sets`
 * vault adapter's record/repo types and the in-memory repo. The table is read and written through
 * `deployments/publish-credentials/store.ts` (deploy hosts, validated against the deploy plugin's
 * descriptors); legacy publish rows are folded once by migration 0012.
 */
export type { VendorCredentialSetRecord, VendorCredentialSetRepoPort, VendorCredentialSetSummary } from "./types.js";

export { InMemoryVendorCredentialSetRepo } from "./repo.memory.js";
export { credentialVault, credentialScope, credentialHint } from "./vault-adapter.js";
export { credentialDeletionRepo, credentialCreateTarget, credentialScopes } from "./project-scope.js";
export type { CredentialScope, ScopedCredentialDeps } from "./project-scope.js";
