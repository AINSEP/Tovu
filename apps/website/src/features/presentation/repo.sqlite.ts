import { SqlPresentationSettingsRepo } from "@jini-ai/cms/presentation/sql";
import { type ContentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";

/** Tovu owns the persisted table name. */
export const PRESENTATION_TABLES = { presentationSettings: "presentation_settings" } as const;

/**
 * @file The presentation-settings repo on a site's SQLite `content.db`: {@link SqlPresentationSettingsRepo}
 * (the one Kysely query body, in Jini `@jini-ai/cms/presentation/sql`), kept as a named class so the
 * composition root that builds it from the content db handle stays as it is.
 */
export class SqlitePresentationSettingsRepo extends SqlPresentationSettingsRepo {
  /** @param store - The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: PRESENTATION_TABLES }, {});
  }
}
