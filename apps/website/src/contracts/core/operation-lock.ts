import { createOperationLock } from "@jini-ai/db/recovery/operation-lock";
export type { OperationLockHandle, OperationLockError, AcquireOperationLockResult } from "@jini-ai/db/recovery/operation-lock";

// One host-lifetime instance backs BOTH migration and restore, plus the display-only peek.
// A second per-domain instance would violate GOV-ADR-002's cross-domain exclusion boundary.
export const { acquireOperationLock, releaseOperationLock, isOperationInFlight } = createOperationLock({}, {});
