### tovu:apps/website/src/features/media-import/tool-registrations.ts
- **Over:** `buildMediaImportRegistrations` 118 (file 260)
- **Phase:** after-move (MIXED; MOVE-AFTER write-service.ts …) · **Batch:** size-48
- **Tests:** `apps/website/src/features/media-import/__tests__/tool-registrations.test.ts`, `apps/website/src/features/media-import/__tests__/import-local-file.test.ts`, `apps/website/src/features/media-import/__tests__/replace-file.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.media-import-egress-refusal.integration.test.ts`
- **Responsibility map:** three handlers, one job each: `media_replace_file`, `media_import_local_file`, `media_import_from_url`.
- **Splits** (HANDLER FACTORIES, same file, above `buildMediaImportRegistrations`, in this order):
  1. `mediaReplaceFileHandler({ routeDeps }: MediaImportHandlerInput): ToolHandler` ← the `media_replace_file: async (ctx) => {…}` value.
  2. `mediaImportLocalFileHandler({ routeDeps }): ToolHandler` ← `media_import_local_file`'s value.
  3. `mediaImportFromUrlHandler({ routeDeps }): ToolHandler` ← `media_import_from_url`'s value.
  `handlers = { media_replace_file: mediaReplaceFileHandler({ routeDeps }), … }`.
- **Importers to update:** none.
- **After:** `buildMediaImportRegistrations` ~15; factories ~35 / ~40 / ~38; file ~270.
