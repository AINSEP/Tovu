/**
 * @file Public surface for the `vendor-credentials` feature (ADR-009 §1): the `vendor_credential_sets`
 * table's record/repo types, its AAD and the in-memory repo. The table is read and written through
 * `deployments/publish-credentials/store.ts` (deploy hosts, validated against the deploy plugin's
 * descriptors); legacy publish rows are copied in at boot (`vendor-table-backfill.ts`).
 */
export type { VendorCredentialSetRecord, VendorCredentialSetRepoPort, VendorCredentialSetSummary } from "@jini-ai/platform/secrets/credential-sets";

export { buildVendorCredentialAad } from "./aad.js";

export { InMemoryVendorCredentialSetRepo } from "./repo.memory.js";
