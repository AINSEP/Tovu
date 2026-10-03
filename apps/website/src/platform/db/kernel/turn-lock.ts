/** @file Tovu compatibility facade over the shared Jini database package. */
// Shared-connection transaction contamination and FIFO fairness rationale: Jini/packages/db/src/kernel/turn-lock.ts.
export { TurnLock } from "@jini-ai/db/kernel";
