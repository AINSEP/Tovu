import { sqlPaymentsLedger } from '@jini-ai/commerce/payments/ledger/sql';
import { readCommerceDrain as readDrain, type CommerceConfiguration } from '@jini-ai/commerce/repo';
import type { KyselyKernel } from '@jini-ai/db/kernel';
export { commerceConfigurationKey, selectCommerceDrain } from '@jini-ai/commerce/repo';
/** Borrow the host kernel; the ledger owns every payment query. */
export function readCommerceDrain(required: { kernel: KyselyKernel<unknown>; workspaceId: string }, optional: { configured?: CommerceConfiguration | null } = {}) {
  return readDrain({ ledger: sqlPaymentsLedger(required), workspaceId: required.workspaceId }, optional);
}
