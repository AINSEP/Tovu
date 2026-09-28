import crypto from "node:crypto";

import { sql } from "kysely";

import { listTables, tableExists } from "../kernel/dialect.js";
import type { StorageKernel } from "../kernel/port.js";
import { databaseFile } from "../kernel/schema-shape.js";
import { POSTGRES_BASELINE } from "./0000_legacy_baseline.postgres.js";
import { adoptLegacySqlite, readFrozenChain } from "./legacy-sqlite.js";
import { LEDGER_TABLE } from "./runner.js";
import { type MigrationContext, type MigrationStep, LegacyHistoryError } from "./step.js";

/**
 * @file Step `0000_legacy_baseline` (ADR-066 §5–6): everything the schema was at the freeze.
 *
 * - SQLite: adopt in place. A database with drizzle history is backed up first (`prepare`, outside
 *   the transaction), then `legacy-sqlite.ts` reconciles its history by hash, applies a missing tail
 *   and verifies the schema before the runner records this step. A brand-new file gets the whole
 *   chain. Nothing is copied or rewritten.
 * - Postgres/PGlite: the frozen baseline statements on an empty schema. A schema that already has
 *   tables but no ledger (the dev-only `TOVU_CONTENT_STORE=pglite` prototype dirs) is refused:
 *   recreate it.
 */

export const LEGACY_BASELINE_ID = "0000_legacy_baseline";

/** What the step applies: the frozen chain's hashes and the Postgres statements. */
export function legacyBaselineChecksum(): string {
  const sqlite = readFrozenChain().map((entry) => [entry.tag, entry.hash]);
  return crypto.createHash("sha256").update(JSON.stringify({ sqlite, postgres: POSTGRES_BASELINE })).digest("hex");
}

function backupTarget(file: string, context: MigrationContext): string {
  return context.backupPath ?? `${file}.pre-migrations-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
}

async function prepare(kernel: StorageKernel<unknown>, context: MigrationContext): Promise<void> {
  if (kernel.dialect !== "sqlite" || !(await tableExists(kernel, "__drizzle_migrations"))) return;
  const file = await databaseFile(kernel);
  if (file === null) return;
  const target = backupTarget(file, context);
  await kernel.backupTo(target);
  context.note(`backed up ${file} to ${target} before adopting it`);
}

async function up(kernel: StorageKernel<unknown>, context: MigrationContext): Promise<void> {
  if (kernel.dialect === "sqlite") return adoptLegacySqlite(kernel, context.note);
  const existing = (await listTables(kernel)).filter((name) => name !== LEDGER_TABLE);
  if (existing.length > 0) {
    throw new LegacyHistoryError(
      `this Postgres schema already has tables (${existing.slice(0, 5).join(", ")}…) but no migration ledger; ` +
        "it was made by the pre-migrator PGlite prototype — recreate the data dir"
    );
  }
  for (const statement of POSTGRES_BASELINE) await kernel.execute(sql.raw(statement));
}

export const legacyBaseline = (checksum: string): MigrationStep => ({ id: LEGACY_BASELINE_ID, checksum, prepare, up });
