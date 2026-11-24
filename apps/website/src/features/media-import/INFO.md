# features/media-import

Host glue for importing an image or video into the media library from an https URL or a local file
(SSRF-guarded fetch, fs-files root resolution, tool handlers).

## Wiring

- `tool-registrations.ts` binds the catalog from `@jini-ai/cms/media/site-import/agent-tools`:
  `buildMediaImportAgentToolCatalog({ fsRootIds: FS_ROOT_IDS, fsFolderReadRecovery: FS_FOLDER_READ_RECOVERY })`,
  injecting fs-files' root ids (`features/fs-files/layout.ts`) and the owner-facing recovery text
  (`contracts/core/fs-folder-recovery.ts`), and exports the bound `mediaImportAgentToolCatalog` for host callers.
