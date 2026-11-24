# features/content-types

## Wiring

- Content-type behaviour is imported directly from `@jini-ai/cms/content-types` (the old `index.ts` barrel was removed).
- `write-service.ts` injects Tovu's `RESERVED_SEGMENTS` as `reservedKeys` / `reservedContentTypeKeys` into Jini's `registerContentType` / `buildContentTypesRegistrations`.
- `repo.sqlite.ts` binds Tovu's `content_types` / `content_type_revisions` tables and `schemaErasedKernel` to Jini's `SqlContentTypeRepo`.
- `tool-registrations.ts` binds `@jini-ai/core/tool-metadata/content-types` and the model-facing error rules; installed by `server/runtime/composition/tool-catalog-manifest.ts`.
- `publish-content.ts` contributes the `content-type` handler to Tovu's publish-content registry (`features/publish-content/*`).
