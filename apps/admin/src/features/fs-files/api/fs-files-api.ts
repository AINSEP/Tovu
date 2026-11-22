import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { authenticatedAdminRequest } from "../../../lib/admin-http/request";

/** The admin API calls of the fs-files feature. */
export const fsFilesApi = {
  // The folder-drop flow — the operator-set `fs-files`
  // `custom` root the assistant's `fs_list_files`/`fs_read_file` tools may reach outside this
  // repo/site (`apps/website`'s `features/fs-files/custom-root-store.ts`). `path: null` means no
  // folder has been set yet. `setFsFilesCustomRoot` can 400 with a message meant to be shown
  // verbatim (not an absolute path, does not exist, or is a file rather than a directory) — callers
  // read `ApiError.body.error` for that case rather than treating every rejection as unexpected.
  getFsFilesCustomRoot: () => authenticatedAdminRequest<{ path: string | null }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/fs-files/custom-root` }),
  setFsFilesCustomRoot: ({ path }: { path: string }, _optional: Record<string, never> = {}) =>
    authenticatedAdminRequest<{ path: string }>({ method: "PUT", path: `/workspaces/${WORKSPACE_ID}/fs-files/custom-root`, body: { path } }),
  clearFsFilesCustomRoot: () => authenticatedAdminRequest<{ path: null }>({ method: "DELETE", path: `/workspaces/${WORKSPACE_ID}/fs-files/custom-root` }),
  // The composer's folder button. `GET` succeeds only when the server runs on this same machine
  // (`apps/website`'s `routes/fs-files/folder-picker.ts`) — any rejection means "hide the button".
  // `POST` opens the OS folder dialog there and resolves `{ path: null }` on Cancel.
  getFolderPicker: () => authenticatedAdminRequest<{ available: true }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/fs-files/folder-picker` }),
  pickFolder: () => authenticatedAdminRequest<{ path: string | null }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/fs-files/folder-picker` }),
};
