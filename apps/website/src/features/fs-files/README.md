# fs-files

## Wiring

- The native "choose folder" dialog lives in `@jini-ai/cms/fs-files/native-folder-picker`.
  The host creates it once in `server/runtime/composition/http-app/mount-admin-system.ts`
  (`createNativeFolderPicker({ env: process.env })`: the host injects its environment map;
  `process.platform` and `execFile` are the package defaults) and hands it to the admin route
  `server/inbound/admin-http/routes/fs-files/folder-picker.ts`, which owns the
  "own machine only" admission.

## Wiring (document archive)

- `__tests__/copy-library.test.ts` binds `@jini-ai/cms/media/site/document-archive` with the `yauzl` SDK and
  agent-plugins' `createYauzlAgentPluginArchiveReader` (`documentArchiveDeps`).

## Wiring (write-files)

- Batched picked-folder writes live in `@jini-ai/cms/fs-files/write-files`. This folder's
  `fs-files.ts` `resolveFsFilePath` (Tovu's denylist + containment over Jini's guarded reader) is passed
  as the REQUIRED `resolveFsFilePath` field to `prepareFileWrites`/`writePreparedFiles` in
  `tool-registrations.ts` (and by `asset-transfer/` for its site/picked writes and source lstat walk).
