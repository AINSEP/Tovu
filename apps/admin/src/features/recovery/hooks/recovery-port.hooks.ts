import type {
  AdminRecoveryDeepLinkResult,
  AdminRecoveryStatus,
  AdminRestorePoint,
  AdminRestorePointSummary,
  DatabaseContextEnvelope,
} from "@/lib/api";

/**
 * @file What `use-recovery.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `apps/admin/INFO.md`'s Hooks section.
 */
export interface RecoveryPort {
  getRecoveryStatus(): Promise<AdminRecoveryStatus>;
  listRecoveryRestorePoints(): Promise<{ items: AdminRestorePoint[] }>;
  /** Restore-point functionality consolidation (2026-09-10, `development/todos.md`) — Recovery now
   *  owns the create action Database's `RestorePointsSection` used to. */
  createRestorePoint(options?: { trigger?: string; costAck?: boolean }): Promise<{ restorePoint: AdminRestorePointSummary }>;
  resolveRecoveryDeepLink(envelope: DatabaseContextEnvelope): Promise<AdminRecoveryDeepLinkResult>;
}
