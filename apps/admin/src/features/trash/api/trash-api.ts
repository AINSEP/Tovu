import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { authenticatedAdminRequest } from "../../../lib/admin-http/request";
import { querySuffix } from "../../../lib/query-suffix";
import type { AdminTrashPage, AdminTrashPurgeReport, AdminTrashRestoreReport } from "./trash-api.types";

/** The admin API calls of the trash feature. */
export const trashApi = {
  // -------------------------------------------------------------------------
  // Trash — the cross-domain recycle bin (design:
  // `ADS-memory/reports/2026-09-20-trash-delete-architecture.md`). Keyset paging like
  // `listCommentsQueue` above. Restore names items by `{entityType, entityId}` and purge by trash
  // ROW id — that asymmetry is the server's, and it is deliberate: the purge endpoint resolves each
  // row's kind itself rather than trusting one the client sent, so it cannot be told that a post is
  // a comment.
  // -------------------------------------------------------------------------
  listTrash: (options: { cursor?: string; limit?: number; entityTypes?: string[] } = {}) => {
    const params = new URLSearchParams();
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.limit) params.set("limit", String(options.limit));
    if (options.entityTypes?.length) params.set("entityTypes", options.entityTypes.join(","));
    const qs = params.toString();
    return authenticatedAdminRequest<AdminTrashPage>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/trash${querySuffix({ query: qs })}` });
  },
  restoreTrashItems: ({ items }: { items: { entityType: string; entityId: string }[] }) =>
    authenticatedAdminRequest<AdminTrashRestoreReport>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/trash/restore`, body: { items } }),
  purgeTrashItems: ({ ids }: { ids: string[] }) =>
    authenticatedAdminRequest<AdminTrashPurgeReport>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/trash/purge`, body: { ids } }),
  /** The generic single-item trash endpoint (`POST /trash/items`, `W/features/trash/`): the way
   *  every OTHER admin feature's delete button (forms, widgets, menus, terms, taxonomies) moves one
   *  row to the Trash, instead of each domain keeping its own bespoke delete call. */
  trash: ({ type, id }: { type: string; id: string }) =>
    authenticatedAdminRequest<{ ok: true; version: number | null }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/trash/items`, body: { type, id } }),
};
