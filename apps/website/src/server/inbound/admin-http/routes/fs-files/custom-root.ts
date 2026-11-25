import type { Express } from "express";

import { FS_FILES_READ_PERMISSION } from "#src/features/fs-files/agent-tools";
import { FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION } from "@jini-ai/cms/fs-files/custom-root-permission";
import {
  CustomFsRootError,
  getCustomFsRootStatus,
  setCustomFsRoot,
  type CustomFsRootStoreOptional,
} from "@jini-ai/cms/fs-files/custom-root-store";
import { fsCustomRootDeleteRoute, fsCustomRootGetRoute, fsCustomRootPutRoute } from "@jini-ai/cms/admin-http/routes/fs-files/custom-root";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin chat composer's folder control: `GET`/`PUT`/`DELETE` on
 * `/api/admin/v1/workspaces/:workspaceId/fs-files/custom-root` — the operator-facing surface for the
 * `fs-files` domain's `custom` root (`features/fs-files/layout.ts`, `custom-root-store.ts`).
 *
 * The verbs are Jini specs (`@jini-ai/cms/admin-http/routes/fs-files/custom-root`) mounted behind the
 * admin ports, which answer the workspace 404, the session principal and the same 403
 * `authorizeOrRespond` wrote. This registrar is the host binding: a `Pick<RouteDeps, "workspaceId" |
 * "authorize" | "siteBinding">` deps slice (no settings ledger, no repo — the value is persisted by
 * `custom-root-store.ts`, keyed by `workspaceId`), the two permission strings, and the store bound to
 * the site directory. One file for every verb.
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
export type AdminFsFilesCustomRootDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "siteBinding"> & {
  /** Test seam — defaults to the booted `siteBinding.dir`. Set
   *  only by this route's own tests, to a temp directory, so they never read or write the real site's
   *  `.fs-custom-root.json`. */
  readonly storeOptional?: CustomFsRootStoreOptional;
};

/** `GET`/`DELETE` never caught anything: an unexpected failure left through `asyncRoute` and was
 *  answered by `captureRouteError` with exactly these options. Only `PUT` wrapped its store calls in
 *  its own `sendAdminFailure`, under its own operation and code. */
const UNCAUGHT_FAILURE = { operation: "admin-route.uncaught" } as const;
const PUT_FAILURE = { operation: "routes/fs-files/custom-root", code: "INTERNAL_ERROR" } as const;

export function registerAdminFsFilesCustomRootRoutes({ app, deps }: { app: Express; deps: AdminFsFilesCustomRootDeps }, _optional: Record<string, never> = {}): void {
  // Resolved per call, as the hand-written verbs did, so the store always follows the bound site directory.
  const storeOptional = (): CustomFsRootStoreOptional => deps.storeOptional ?? { siteDir: deps.siteBinding.dir };
  const readCustomRoot = ({ workspaceId }: { workspaceId: string }) => getCustomFsRootStatus({ workspaceId, optional: storeOptional() });
  const writeCustomRoot = ({ workspaceId, path }: { workspaceId: string; path: string | null }) => setCustomFsRoot({ workspaceId, path, optional: storeOptional() });
  const port = { workspaceId: deps.workspaceId, authorize: deps.authorize };
  const managePermission = FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION;
  mountAdminJsonRoute({ app, spec: fsCustomRootGetRoute, deps: { ...port, readPermission: FS_FILES_READ_PERMISSION, readCustomRoot } }, { forwardRejection: true, failure: UNCAUGHT_FAILURE });
  mountAdminJsonRoute({ app, spec: fsCustomRootPutRoute, deps: {
    ...port, managePermission, readCustomRoot, writeCustomRoot, isInvalidRootError: ({ err }) => err instanceof CustomFsRootError,
  } }, { forwardRejection: true, failure: PUT_FAILURE });
  mountAdminJsonRoute({ app, spec: fsCustomRootDeleteRoute, deps: { ...port, managePermission, writeCustomRoot } }, { forwardRejection: true, failure: UNCAUGHT_FAILURE });
}
