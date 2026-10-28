import type { Express, Request, Response } from "express";

import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import { isLocalAdminRequest } from "#src/server/inbound/admin-http/local-admin-request";
import { FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION } from "#src/features/fs-files/custom-root-permission";
import type { NativeFolderPicker } from "#src/features/fs-files/native-folder-picker";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin chat composer's folder button: `GET`/`POST` on
 * `/api/admin/v1/workspaces/:workspaceId/fs-files/folder-picker`. `GET` says whether the button may
 * show; `POST` opens the OS folder dialog ON THE SERVER MACHINE and answers `{ path }` (`null` on
 * Cancel). A browser can never read a dropped folder's path; when the server is the owner's own
 * computer, it can ask the OS instead.
 *
 * The dialog appears on the server's screen, so this exists only when that screen is the caller's:
 * - `localHost` (`isLocalTovuHost`, the same host decision `local-credential-copy.ts` uses): a
 *   local launch, never a deployed/hosted runtime. Otherwise 404, as if the route did not exist.
 * - the picker has a chooser on this OS. Otherwise 404 too.
 * - `isLocalAdminRequest`: loopback sockets, no forwarding headers, a loopback Host, same Origin.
 *   Otherwise 403 `local-host-only`.
 * - a session credential (an API key never pops a dialog) holding
 *   `FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION` — the permission that already gates pointing the chat's
 *   file tools at a folder, which the composer does with the picked path (owner/admin only).
 *
 * One dialog at a time per process: a second `POST` while one is open answers 409 `busy`.
 */
export type AdminFsFilesFolderPickerDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & {
  readonly localHost: boolean;
  readonly folderPicker: NativeFolderPicker;
};

const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/fs-files/folder-picker";

/** Every admission check, cheapest and least revealing first. Returns `false` once a response was written.
 *  @complexity O(h), h = request header names. */
async function admitted({ req, res, deps }: { req: Request; res: Response; deps: AdminFsFilesFolderPickerDeps }): Promise<boolean> {
  res.setHeader("Cache-Control", "no-store");
  if (!deps.localHost || !deps.folderPicker.available || String(req.params.workspaceId ?? "") !== deps.workspaceId) {
    res.status(404).json({ error: "not found" }); return false;
  }
  if (!isLocalAdminRequest({ req })) { res.status(403).json({ reasonCode: "local-host-only" }); return false; }
  const permission = FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION;
  if (!rejectUnlessSessionCredential(res, { message: "Sign in to the admin to choose a folder.", permission })) return false;
  return authorizeOrRespond(res, deps.authorize, { principalId: getAuthedPrincipal(res).id, permission, workspaceId: deps.workspaceId });
}

export function registerAdminFsFilesFolderPickerRoutes({ app, deps }: { app: Express; deps: AdminFsFilesFolderPickerDeps }, _optional = {}): void {
  let picking = false;
  app.get(BASE_PATH, async (req, res) => {
    if (await admitted({ req, res, deps })) res.json({ available: true });
  });
  app.post(BASE_PATH, async (req, res) => {
    if (!await admitted({ req, res, deps })) return;
    if (picking) { res.status(409).json({ reasonCode: "busy" }); return; }
    picking = true;
    try {
      res.json({ path: await deps.folderPicker.pick() });
    } catch {
      // Never echo the chooser's stderr: it can carry local paths and account names.
      res.status(500).json({ reasonCode: "picker-failed" });
    } finally {
      picking = false;
    }
  });
}
