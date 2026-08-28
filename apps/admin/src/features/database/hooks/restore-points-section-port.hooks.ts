import type { AdminRestorePoint, AdminRestorePointSummary } from "@/lib/api";

/**
 * @file What `use-restore-points-section.hooks.ts` needs from the outside world, as an interface
 * rather than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair
 * documented in `apps/admin/INFO.md`'s Hooks section.
 */
export interface RestorePointsSectionPort {
  listDatabaseRestorePoints(): Promise<{ items: AdminRestorePoint[] }>;
  createDatabaseRestorePoint(options?: {
    trigger?: string;
    costAck?: boolean;
  }): Promise<{ restorePoint: AdminRestorePointSummary }>;
}
