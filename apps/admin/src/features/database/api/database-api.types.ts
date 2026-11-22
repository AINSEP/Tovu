/** Database — Timeline (ADR-041 §1). Mirrors `@jini-ai/db/tools`' `LedgerRow`. */
export interface AdminLedgerRow {
  id: string;
  kind: string;
  createdAt: string;
  restorePointId: string | null;
  outcome: string;
}

export type RestorePointCostClass = "cheap" | "expensive" | "unavailable";

export interface AdminRestorePointSummary {
  id: string;
  costClass: RestorePointCostClass;
  kind: string;
}

/** Database — schema drift (ADR-041 §3). Mirrors `src/platform/db/drift.ts`'s `DriftStatus`, plus the
 *  `"unknown"` the server adds whenever either side of the comparison is unavailable. Kept as the
 *  full five-value union rather than a boolean precisely so `"unknown"` cannot be silently folded
 *  into either "fine" or "broken" — see `features/database/rules.ts`'s `resolveSchemaStateWarning`. */
export type AdminSchemaDriftStatus = "in-sync" | "ahead" | "behind" | "diverged" | "unknown";

/** One side of the drift comparison. Mirrors `src/platform/db/drift.ts`'s `SchemaSnapshot`. */
export interface AdminSchemaSnapshot {
  version: number;
  tag: string;
}

/** Mirrors `features/database/adapter.sqlite.ts`'s `SchemaStateSummary`. Either snapshot may be
 *  `null` independently, which is exactly when `status` is `"unknown"`. */
export interface AdminSchemaState {
  status: AdminSchemaDriftStatus;
  siteMeta: AdminSchemaSnapshot | null;
  runtime: AdminSchemaSnapshot | null;
}

export interface MigrateForwardExecuteResult {
  migrated: true;
}
