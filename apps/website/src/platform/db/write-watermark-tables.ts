/**
 * @file Tovu owns the persisted name of the site write watermark (SPEC-016 C-004, `schema.sqlite.ts`'s
 * `databaseWriteWatermark`; singleton row created by `prepareContentStore`). The one Kysely body lives in
 * Jini `@jini-ai/db/watermark/kernel`; every Tovu caller passes this name with the schema-erased kernel.
 */
export const WRITE_WATERMARK_TABLES = { watermark: "database_write_watermark" } as const;
