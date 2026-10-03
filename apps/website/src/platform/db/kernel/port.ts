/** @file Tovu compatibility facade over the shared Jini database package. */
// Kernel invariants: Jini packages/db/src/kernel/port.ts; Tovu's query-layer decision is ADR-066.
export { type StorageCapabilities, type StorageCapability, type StorageDialect, type StorageKernel, type StorageTransport, UnsupportedCapabilityError } from "@jini-ai/db/kernel";
