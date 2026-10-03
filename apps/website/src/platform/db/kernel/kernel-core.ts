/** @file Tovu compatibility facade over the shared Jini database package. */
// Transaction/deadlock rationale is preserved in Jini/packages/db/src/kernel/kernel-core.ts.
export { buildKernel, type KernelDriver } from "@jini-ai/db/kernel";
