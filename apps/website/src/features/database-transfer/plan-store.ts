/** Compatibility adapter; single-use/TTL/memory rationale now lives in @jini-ai/db/tools. */
import { DatabaseTransferPlanStore as PlanStore } from "@jini-ai/db/tools";
export type { DatabaseTransferPlanContent, DatabaseTransferPlan, TakeDatabaseTransferPlanResult } from "@jini-ai/db/tools";
export class DatabaseTransferPlanStore extends PlanStore {
  constructor(optional: { now?: () => number } = {}) { super({}, optional); }
}
export const databaseTransferPlanStore = new DatabaseTransferPlanStore();
