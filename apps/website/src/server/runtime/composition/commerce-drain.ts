import { sqlPaymentsLedger } from '@jini-ai/commerce/payments/ledger/sql';
import { readCommerceDrain as readDrain } from '@jini-ai/commerce/repo';
import type { StorageKernel } from '@jini-ai/db/kernel';
export { commerceConfigurationKey, selectCommerceDrain } from '@jini-ai/commerce/repo';
/** Borrow the host kernel; the ledger owns every payment query. */
export function readCommerceDrain(required: { kernel: StorageKernel<unknown>; workspaceId: string }, optional = {}) {
  return readDrain({ ledger: sqlPaymentsLedger(required), workspaceId: required.workspaceId }, optional);
}
