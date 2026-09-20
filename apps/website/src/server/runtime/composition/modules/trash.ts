import { registerAdminTrashListRoute } from "#src/server/inbound/admin-http/routes/trash/list";
import { registerAdminTrashPurgeRoute } from "#src/server/inbound/admin-http/routes/trash/purge";
import { registerAdminTrashRestoreRoute } from "#src/server/inbound/admin-http/routes/trash/restore";
import type { TrashRouteDeps } from "#src/server/inbound/admin-http/routes/trash/deps";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `trash` server module — the local admin Trash screen's three routes (list, restore,
 * permanently delete). Design of record:
 * `ADS-memory/reports/2026-09-20-trash-delete-architecture.md`.
 *
 * All three paths sit under `/api/admin/v1/workspaces/:workspaceId/trash`, so registration order
 * against the rest of `app.ts` does not matter — no other module claims that prefix and none of
 * these is a catch-all. Order WITHIN the module is read-before-write purely for readability.
 *
 * This module is the only composition that hands `TrashPort` to an HTTP surface, which is what
 * makes `purgeSelected` reachable at all: permanent deletion is human-only, so its one caller is an
 * authenticated admin route behind the screen's confirm modal. No tool registration can reach it —
 * `features/trash/__tests__/tool-registrations.purge-ban.test.ts` proves that three ways.
 */
export function createTrashModule(deps: TrashRouteDeps): ServerModuleHandle {
  return {
    name: "trash",
    registerRoutes: (app) => {
      registerAdminTrashListRoute(app, deps);
      registerAdminTrashRestoreRoute(app, deps);
      registerAdminTrashPurgeRoute(app, deps);
    },
  };
}
