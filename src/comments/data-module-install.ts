/**
 * @file Boot-time `declareDataModule()` invocation for Comments' 2-table manifest (ADR-023 §2,
 * SPEC-032/SPEC-033). Mirrors `newsletter/data-module-manifest.ts#installNewsletterDataModule`
 * exactly — idempotent (skip-if-existing-tables), throws on failure so the caller (composition
 * root, via the ADR-046 Phase 2 boot lifecycle) surfaces it as a startup failure rather than
 * silently continuing with missing tables.
 */
import type Database from "better-sqlite3";

import { declareDataModule } from "../features/plugins/data-module";
import { COMMENTS_DATA_MODULE } from "./types";

export async function installCommentsDataModule(
  required: { db: Database.Database; dbPath: string },
  _optional: Record<string, never> = {}
): Promise<void> {
  const { db, dbPath } = required;
  const result = await declareDataModule({ db, dbPath, decl: COMMENTS_DATA_MODULE });
  if (!result.ok) {
    throw new Error(`comments dataModule declaration failed: ${result.error?.code} — ${result.error?.message}`);
  }
}
