# fs-files (admin)

The admin side of SPEC-053: the chat composer's folder drop (`hooks/use-folder-drop.hooks.ts`), the
desktop folder-drop bridge (`folder-drop-port.ts`, `window.tovuFiles`), the composer's folder button,
and the `fs-files` admin API client (`api/fs-files-api.ts`).

## Wiring

- `useNativeFolderPicker` lives in `@jini-ai/admin/screens/fs-files/hooks/use-native-folder-picker.hooks`.
  `components/AssistantDock/AssistantDock.state.hooks.ts` calls it and injects, as fields on its
  existing `input` object:
  - `probe` = `fsFilesApi.getFolderPicker` and `pick` = `fsFilesApi.pickFolder` (this folder's
    `api/fs-files-api.ts`, which stays in Tovu because it uses Tovu's `lib/admin-http`);
  - `isDialogAlreadyOpen` = `isFolderPickerBusyError` (same file: an `ApiError` with status 409 means
    a dialog is already open in another tab, so the button stays usable and nothing is reported).
  - `onPicked`/`onFailed` = `useFolderDrop`'s `insertFolderPath`/`showPathHint`, as before.
  The hook renders nothing, so it carries no CSS classes and needs no stylesheet.
- Still in Tovu (not yet movable): `folder-drop-port.ts`, `hooks/use-folder-drop.hooks.ts`,
  `api/fs-files-api.ts` — they need `@jini-ai/ui`'s `FolderPathDropPort`/`folderPathsFromDataTransfer`
  (not in the admin kit yet) and Tovu's `lib/admin-http` (`WORKSPACE_ID`, `authenticatedAdminRequest`,
  `ApiError`).
