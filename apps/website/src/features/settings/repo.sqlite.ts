import { type ContentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlSettingsRepo } from "@jini-ai/db/settings";

/** Tovu owns these persisted names; the settings repository, its ledger and Trash/backup coverage use the same wiring. */
export const SETTINGS_TABLES = {
  definitions: "setting_definitions",
  valuesGlobal: "setting_values_global",
  valuesWorkspace: "setting_values_workspace",
  valuesUser: "setting_values_user",
  revisions: "setting_revisions",
} as const;

/**
 * @file The settings repo on a site's SQLite `content.db`. The one Kysely query body lives in Jini
 * `@jini-ai/db/settings`; this named class keeps the call sites that construct it from the content db handle.
 */
export class SqliteSettingsRepo extends SqlSettingsRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: SETTINGS_TABLES }, {});
  }
}
