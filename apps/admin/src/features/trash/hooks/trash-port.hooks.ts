import type { AdminTrashPage, AdminTrashPurgeReport, AdminTrashRestoreReport } from "@/lib/api";

/**
 * @file What `use-trash.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface TrashPort {
  listTrash(options: { cursor?: string }): Promise<AdminTrashPage>;
  restoreTrashItems(input: { items: { entityType: string; entityId: string }[] }): Promise<AdminTrashRestoreReport>;
  purgeTrashItems(input: { ids: string[] }): Promise<AdminTrashPurgeReport>;
}
