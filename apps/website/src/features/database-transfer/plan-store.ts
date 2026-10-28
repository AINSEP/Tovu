/** Compatibility adapter; single-use/TTL/memory rationale now lives in @jini-ai/db/tools. */
import { DatabaseTransferPlanStore } from "@jini-ai/db/tools";
export type { DatabaseTransferPlanContent, DatabaseTransferPlan, TakeDatabaseTransferPlanResult } from "@jini-ai/db/tools";
export { DatabaseTransferPlanStore };
export const databaseTransferPlanStore = new DatabaseTransferPlanStore();
