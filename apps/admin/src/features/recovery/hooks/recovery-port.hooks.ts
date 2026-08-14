import type { AdminRecoveryDeepLinkResult, AdminRecoveryStatus, AdminRestorePoint, DatabaseContextEnvelope } from "../../../lib/api";

/**
 * @file What `use-recovery.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `apps/admin/INFO.md`'s Hooks section.
 */
export interface RecoveryPort {
  getRecoveryStatus(): Promise<AdminRecoveryStatus>;
  listRecoveryRestorePoints(): Promise<{ items: AdminRestorePoint[] }>;
  resolveRecoveryDeepLink(envelope: DatabaseContextEnvelope): Promise<AdminRecoveryDeepLinkResult>;
}
