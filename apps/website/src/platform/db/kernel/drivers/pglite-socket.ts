/** @file Tovu compatibility facade over the shared Jini database package. */
import pg from "pg";
import { openPgliteSocketKernel as jiniOpenPgliteSocketKernel } from "@jini-ai/db/kernel/postgres";
import type { StorageKernel } from "@jini-ai/db/kernel";

/** Preserve the socket opener shape while injecting Tovu's pg module. */
// Shared-session restrictions and connection-lifetime rationale: Jini/packages/db/src/kernel/postgres/pglite-socket.ts.
export function openPgliteSocketKernel<DB>(required: { socketPath: string }): StorageKernel<DB> {
  return jiniOpenPgliteSocketKernel<DB>({ pg, socketPath: required.socketPath });
}
