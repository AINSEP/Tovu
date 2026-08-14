import type { AdminDisclosureResult, GatedConfirmResult, GatedPlanResult, RestoreExecuteResult } from "../../../lib/api";

/**
 * @file What `use-restore-flow.hooks.ts` needs from the outside world, as an interface rather than
 * a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `apps/admin/INFO.md`'s Hooks section.
 */
export interface RestoreFlowPort {
  computeRecoveryDisclosure(restorePointId: string): Promise<AdminDisclosureResult>;
  planRestore(restorePointId: string): Promise<GatedPlanResult>;
  confirmRestore(input: { planId: string; planHash: string; disclosureAcknowledged: boolean }): Promise<GatedConfirmResult>;
  executeRestore(input: { confirmationToken: string; restorePointId: string }): Promise<RestoreExecuteResult>;
}
