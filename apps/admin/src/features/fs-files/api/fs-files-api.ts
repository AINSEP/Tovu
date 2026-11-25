import { createFsFilesApi } from "@jini-ai/cms/react/fs-files/fs-files-api";
import { folderPathsFromDataTransfer } from "@jini-ai/ui";
import { getFolderDropPort, type FolderDropPort } from "@jini-ai/admin/screens/fs-files/folder-drop-port";
import type { CustomRootFailure } from "@jini-ai/admin/screens/fs-files/folder-drop.rules";
import type { UseFolderDropDeps } from "@jini-ai/admin/screens/fs-files/use-folder-drop.hooks";
import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { ApiError, authenticatedAdminRequest } from "../../../lib/admin-http/request";

/** The admin API calls of the fs-files feature. */
export const fsFilesApi = createFsFilesApi({ request: authenticatedAdminRequest, workspaceId: WORKSPACE_ID }, {});

/** Binds the composer folder button's hook (`useNativeFolderPicker`) to the calls above; a 409 means
 * another tab's dialog is already open, which is not a failure. */
export const nativeFolderPickerDeps = {
  probe: fsFilesApi.getFolderPicker,
  pick: fsFilesApi.pickFolder,
  isDialogAlreadyOpen: (error: unknown): boolean => error instanceof ApiError && error.status === 409,
};

/**
 * The real port lookup the folder-drop hook reads. Reads `window.tovuFiles`.
 *
 * **Evaluated at render, not at drop.** `handleDropCapture` reads the latest committed render's
 * port through a ref. Both reads see the same value, because `window.tovuFiles` does not change
 * during a page's life: `apps/desktop/src/speech/preload-speech.cts` calls
 * `contextBridge.exposeInMainWorld` synchronously at preload time, and Electron runs a window's
 * preload before any of the page's own scripts. So the bridge already exists (or is permanently
 * absent) when this bundle first renders. Going between `/admin` and the public site is a full
 * navigation, which reloads both the preload and this bundle.
 *
 * @complexity Time/space: O(1).
 */
function getTovuFolderDropPort(): FolderDropPort | null {
  return getFolderDropPort({ targetWindow: undefined, bridgeKey: "tovuFiles" });
}

/**
 * Reads a failed custom-root write for the folder-drop hook's error classification. The server
 * (`routes/fs-files/custom-root.ts`) answers every `CustomFsRootError` with `code: "INVALID_PATH"`
 * and its message in `body.error`; anything that is not an `ApiError` (network failure) is `null`.
 *
 * @complexity Time/space: O(1).
 */
function readCustomRootFailure(err: unknown): CustomRootFailure {
  if (!(err instanceof ApiError)) return null;
  return { code: err.code, message: typeof err.body?.error === "string" ? err.body.error : "" };
}

/** Binds the folder-drop hook (`useFolderDrop`) to the desktop bridge, the custom-root calls above,
 * and `@jini-ai/ui`'s drop-path recovery. */
export const folderDropDeps: UseFolderDropDeps = {
  getPort: getTovuFolderDropPort,
  getCustomRoot: fsFilesApi.getFsFilesCustomRoot,
  setCustomRoot: (path: string) => fsFilesApi.setFsFilesCustomRoot({ path }),
  folderPathsFromDataTransfer,
  readFailure: readCustomRootFailure,
};
