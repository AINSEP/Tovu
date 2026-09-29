import { sql } from "kysely";

import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Step `0003_coercion_json_as_json`: `setting_definitions.coercion_json` holds the coercer tag
 * as a JSON string (`"identity"`). The settings repo used to write the bare tag (`identity`), which
 * SQLite's text column took but Postgres's jsonb column rejects — so a storage move could not load
 * such a row. This quotes every SQLite value that is not valid JSON; valid JSON and NULL stay as
 * they are.
 *
 * Postgres/PGlite: nothing. jsonb never held a bare tag (the insert failed).
 */

export const COERCION_JSON_AS_JSON_ID = "0003_coercion_json_as_json";

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  if (kernel.dialect !== "sqlite") return;
  await kernel.execute(
    sql`UPDATE setting_definitions SET coercion_json = json_quote(coercion_json) WHERE coercion_json IS NOT NULL AND json_valid(coercion_json) = 0`
  );
}

export const coercionJsonAsJson = (checksum: string): MigrationStep => ({ id: COERCION_JSON_AS_JSON_ID, checksum, up });
