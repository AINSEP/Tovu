import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import type { Express } from "express";

import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { getAuthedCredentialKind } from "#src/server/inbound/admin-http/dev-auth";
import { isLocalAdminRequest } from "#src/server/inbound/admin-http/local-admin-request";
import { createFsFolderPickerRoutes, type FsFolderPickerRouteDeps } from "@jini-ai/cms/admin-http/routes/fs-files/folder-picker";
import { FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION } from "@jini-ai/cms/fs-files/custom-root-permission";
import type { NativeFolderPicker } from "@jini-ai/cms/fs-files/native-folder-picker";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin chat composer's folder button: `GET`/`POST` on
 * `/api/admin/v1/workspaces/:workspaceId/fs-files/folder-picker`. `GET` says whether the button may
 * show; `POST` opens the OS folder dialog ON THE SERVER MACHINE and answers `{ path }` (`null` on
 * Cancel). A browser can never read a dropped folder's path; when the server is the owner's own
 * computer, it can ask the OS instead.
 *
 * The dialog appears on the server's screen, so this exists only when that screen is the caller's:
 * - `localHost` (`isLocalTovuHost`, the same host decision local credential copying uses): a
 *   local launch, never a deployed/hosted runtime. Otherwise 404, as if the route did not exist.
 * - the picker has a chooser on this OS. Otherwise 404 too.
 * - `isLocalAdminRequest`: loopback sockets, no forwarding headers, a loopback Host, same Origin.
 *   Otherwise 403 `local-host-only`.
 * - a session credential (an API key never pops a dialog) holding
 *   `FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION` — the permission that already gates pointing the chat's
 *   file tools at a folder, which the composer does with the picked path (owner/admin only).
 *
 * One dialog at a time per process: a second `POST` while one is open answers 409 `busy`.
 *
 * The route itself is Jini's `createFsFolderPickerRoutes`; this file is its host binding: it binds
 * `isLocalAdminRequest` and the credential kind to each request, injects the permission and copy,
 * and owns the foreign-workspace `{ error: "not found" }` 404 and the fixed `picker-failed` 500.
 */
export type AdminFsFilesFolderPickerDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & {
  readonly localHost: boolean;
  readonly folderPicker: NativeFolderPicker;
};

const PICKER_FAILURE = { operation: "routes/fs-files/folder-picker", code: "INTERNAL_ERROR", details: { reasonCode: "picker-failed" } } as const;

/** Placeholder for a request-bound dep at mount time; `requestDeps` replaces it on every request. */
const boundPerRequest = (): never => { throw new Error("bound per request by requestDeps"); };

/**
 * Register `GET`/`POST` `/api/admin/v1/workspaces/:workspaceId/fs-files/folder-picker`.
 * @complexity Per request: the local-request check, one authorization, then (POST) the dialog.
 */
export function registerAdminFsFilesFolderPickerRoutes({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: AdminFsFilesFolderPickerDeps }, _optional = {}): void {
  // The chooser's own failures, so only they get the fixed `picker-failed` 500.
  const pickerFailures = new Set<unknown>();
  const picker = deps.folderPicker;
  const mounted: FsFolderPickerRouteDeps & Pick<RouteDeps, "workspaceId" | "authorize"> = {
    workspaceId: deps.workspaceId,
    authorize: deps.authorize,
    localHost: deps.localHost,
    folderPicker: {
      get available() { return picker.available; },
      pick: async () => {
        try { return await picker.pick(); } catch (error) { pickerFailures.add(error); throw error; }
      },
    },
    managePermission: FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION,
    sessionRequiredMessage: "Sign in to the admin to choose a folder.",
    isLocalRequest: boundPerRequest,
    isSessionCredential: boundPerRequest,
  };
  const { get, post } = createFsFolderPickerRoutes();
  /** Every admission check, cheapest and least revealing first. Returns `false` once a response was written.
   *  @complexity O(h), h = request header names.
   *  (Now the spec's `refusal`, which returns the refusal instead; the mount writes it.) */
  for (const spec of [get, post]) {
    mountAdminJsonRoute({ errors, app, spec, deps: mounted }, {
      // Uncaught errors (an authorize crash, ...) reach `next(error)` as the hand-written route's did; only the
      // chooser's own failure, claimed by `failureFor` below, is answered here.
      forwardUncaughtErrors: true,
      // A missing session reaches the spec, whose local-request check still answers first.
      deferMissingPrincipal: true,
      workspaceRefusal: () => ({ status: 404, body: { error: "not found" } }),
      failureFor: (error) => {
        if (!pickerFailures.delete(error)) return undefined;
        // Never echo the chooser's stderr: it can carry local paths and account names.
        return PICKER_FAILURE;
      },
      requestDeps: ({ req, res, deps: base }) => ({
        ...base,
        isLocalRequest: () => isLocalAdminRequest({ req }),
        isSessionCredential: () => getAuthedCredentialKind(res) === "session",
      }),
    });
  }
}
