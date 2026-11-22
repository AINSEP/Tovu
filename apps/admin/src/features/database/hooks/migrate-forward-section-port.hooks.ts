import type { GatedConfirmResult, GatedPlanResult } from "@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types";
import type { MigrateForwardExecuteResult } from "@/features/database/api/database-api.types";

/**
 * @file What `use-migrate-forward-section.hooks.ts` needs from the outside world, as an interface
 * rather than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair
 * documented in `apps/admin/INFO.md`'s Hooks section.
 */
export interface MigrateForwardSectionPort {
  planMigrateForward(): Promise<GatedPlanResult>;
  confirmMigrateForward(input: { planId: string; planHash: string }, optional?: {}): Promise<GatedConfirmResult>;
  executeMigrateForward(required: { confirmationToken: string }, optional?: {}): Promise<MigrateForwardExecuteResult>;
}
