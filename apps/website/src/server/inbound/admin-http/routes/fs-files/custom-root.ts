import type { Express, Request, Response } from "express";

import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { FS_FILES_READ_PERMISSION } from "#src/features/fs-files/agent-tools";
import { FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION } from "#src/features/fs-files/custom-root-permission";
import {
  CustomFsRootError,
  getCustomFsRootStatus,
  setCustomFsRoot,
  type CustomFsRootStoreOptional,
} from "#src/features/fs-files/custom-root-store";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin chat composer's folder control: `GET`/`PUT`/`DELETE` on
 * `/api/admin/v1/workspaces/:workspaceId/fs-files/custom-root` — the operator-facing surface for the
 * `fs-files` domain's `custom` root (`features/fs-files/layout.ts`, `custom-root-store.ts`).
 *
 * Shape copied from `routes/system/site-token.ts`: a `Pick<RouteDeps, "workspaceId" | "authorize">`
 * deps slice (no settings ledger, no repo — the value is persisted by `custom-root-store.ts`, keyed
 * by `workspaceId`), the same `rejectUnlessAuthorized` two-step, one file for every verb.
 *
 * `storeOptional` (2026-09-10, restart-persistence follow-up) is the one addition beyond that copied
 * shape: a test-only seam so this route's own tests can point `custom-root-store.ts` at a temp site
 * directory instead of the real one — see that field's own doc. Every real caller leaves it unset and
 * gets the real site directory, exactly as before this field existed.
 *
 * Two permissions, split by verb (owner ruling, 2026-09-15):
 *
 * - `GET` — `FS_FILES_READ_PERMISSION` (`content.read`), the SAME permission that gates
 *   `fs_list_files`/`fs_read_file` themselves. Reading which folder is currently configured tells a
 *   caller nothing it could not already read through those tools.
 * - `PUT`/`DELETE` — {@link FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION}, which only `owner` (via its `*`
 *   wildcard) and the built-in `admin` role hold. Choosing the folder is not the same capability as
 *   reading through it: `layout.ts` accepts `/` and a home directory as values, so one `PUT`
 *   re-points the assistant's whole filesystem surface. See that permission's own file for why it is
 *   a new string with a built-in-role grant rather than `workspace.manage`, which NO policy in the
 *   workspace this repo ships actually holds.
 *
 * `PUT`/`DELETE` never read anything under the folder they accept — {@link setCustomFsRoot}'s own doc
 * is explicit that only the path and a single `stat` are involved. The route inherits that property
 * rather than re-deriving it.
 */
export type AdminFsFilesCustomRootDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & {
  /** Test seam — defaults to the real site directory (`custom-root-store.ts`'s own default). Set
   *  only by this route's own tests, to a temp directory, so they never read or write the real site's
   *  `.fs-custom-root.json`. */
  readonly storeOptional?: CustomFsRootStoreOptional;
};

const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/fs-files/custom-root";

/** Shared workspace-path-param + permission check every verb below performs first — same shape
 *  `site-token.ts`'s own `rejectUnlessAuthorized`. Takes the permission as a parameter because the
 *  verbs no longer share one (see this file's header). Returns `true` (response already written) iff
 *  the caller should stop. */
async function rejectUnlessAuthorized(
  req: Request,
  res: Response,
  deps: AdminFsFilesCustomRootDeps,
  permission: string,
): Promise<boolean> {
  if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
    res.status(404).json({ error: "workspace was not found" });
    return true;
  }
  const principal = getAuthedPrincipal(res);
  return !(await authorizeOrRespond(res, deps.authorize, {
    principalId: principal.id,
    permission,
    workspaceId: deps.workspaceId,
  }));
}

export function registerAdminFsFilesCustomRootRoutes(app: Express, deps: AdminFsFilesCustomRootDeps): void {
  app.get(BASE_PATH, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps, FS_FILES_READ_PERMISSION)) return;
    const status = getCustomFsRootStatus(deps.workspaceId, deps.storeOptional);
    // `vanished`/`vanishedPath` are only present (never `false`/absent-by-omission) when a
    // previously-set folder no longer stats as a directory — additive beyond the original
    // `{ path }` shape, so an existing caller reading only `path` sees no change.
    res.status(200).json(status.vanished ? { path: null, vanished: true, vanishedPath: status.vanishedPath } : { path: status.path ?? null });
  });

  app.put(BASE_PATH, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps, FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION)) return;

    const path = req.body?.path;
    if (typeof path !== "string" || path.length === 0) {
      res.status(400).json({ error: "'path' is required and must be a non-empty string", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      setCustomFsRoot(deps.workspaceId, path, deps.storeOptional);
      res.status(200).json({ path: getCustomFsRootStatus(deps.workspaceId, deps.storeOptional).path });
    } catch (err) {
      if (err instanceof CustomFsRootError) {
        res.status(400).json({ error: err.message, code: "INVALID_PATH" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });

  app.delete(BASE_PATH, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps, FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION)) return;
    setCustomFsRoot(deps.workspaceId, null, deps.storeOptional);
    res.status(200).json({ path: null });
  });
}
