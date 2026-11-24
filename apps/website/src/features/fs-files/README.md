# fs-files

## Wiring

- The native "choose folder" dialog lives in `@jini-ai/cms/fs-files/native-folder-picker`.
  The host creates it once in `server/runtime/composition/http-app/mount-admin-system.ts`
  (`createNativeFolderPicker()`, no injected collaborators: `process.platform`/`process.env`
  and `execFile` are the defaults) and hands it to the admin route
  `server/inbound/admin-http/routes/fs-files/folder-picker.ts`, which owns the
  "own machine only" admission.
