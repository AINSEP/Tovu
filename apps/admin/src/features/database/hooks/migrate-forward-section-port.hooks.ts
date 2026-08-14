import type { GatedConfirmResult, GatedPlanResult, MigrateForwardExecuteResult } from "../../../lib/api";

/**
 * @file What `use-migrate-forward-section.hooks.ts` needs from the outside world, as an interface
 * rather than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair
 * documented in `apps/admin/INFO.md`'s Hooks section.
 */
export interface MigrateForwardSectionPort {
  planMigrateForward(): Promise<GatedPlanResult>;
  confirmMigrateForward(input: { planId: string; planHash: string }): Promise<GatedConfirmResult>;
  executeMigrateForward(confirmationToken: string): Promise<MigrateForwardExecuteResult>;
}
