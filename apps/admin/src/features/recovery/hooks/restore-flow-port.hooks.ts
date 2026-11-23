import type { GatedConfirmResult, GatedPlanResult } from "@jini-ai/core/contracts/site/gated-results";
import type { AdminDisclosureResult, RestoreExecuteResult } from "@/features/recovery/api/recovery-api.types";

/**
 * @file What `use-restore-flow.hooks.ts` needs from the outside world, as an interface rather than
 * a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `apps/admin/INFO.md`'s Hooks section.
 */
export interface RestoreFlowPort {
  computeRecoveryDisclosure(input: { restorePointId: string }): Promise<AdminDisclosureResult>;
  planRestore(input: { restorePointId: string }): Promise<GatedPlanResult>;
  confirmRestore(input: { planId: string; planHash: string; disclosureAcknowledged: boolean }): Promise<GatedConfirmResult>;
  executeRestore(input: { confirmationToken: string; restorePointId: string }): Promise<RestoreExecuteResult>;
}
