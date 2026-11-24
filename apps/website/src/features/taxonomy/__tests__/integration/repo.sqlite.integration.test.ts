import { SqlTaxonomyRepo, SqlTermRepo, SqlEntryTermRepo, SqlTaxonomyRevisionRepo } from "@jini-ai/cms/taxonomy/sql";
import { TAXONOMY_TABLES } from "#src/platform/db/content-tables";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ContentDb } from "#src/platform/db/sqlite/content-db";
import { schemaErasedKernel } from "../../../../platform/db/content-kernel.js";
import { kernelStampWatermark } from "@jini-ai/db/watermark/kernel";
import { WRITE_WATERMARK_TABLES } from "../../../../platform/db/write-watermark-tables.js";
import {
  createTaxonomy,
  createTerm,
  renameTerm,
  deleteTerm,
  deleteTaxonomy,
  assignTerms,
  createPostBackedContentLookup,
  InMemoryContentLookup,
} from "@jini-ai/cms/taxonomy";
import type { DeletableTermRepoPort } from "@jini-ai/cms/taxonomy";
import type { TermListPort, TermRepoPort } from "@jini-ai/cms/taxonomy";
import { openPreparedContentDb } from "../../../../platform/db/sqlite/__tests__/helpers/open-prepared-content-db.js";

/**
 * @file Real SQLite persistence for `features/taxonomy` (this dispatch). Mirrors
 * `features/content-types/__tests__/integration/repo.sqlite.integration.test.ts`'s pattern and
 * rationale. Every adapter here is constructed workspace-scoped (see `repo.sqlite.ts`'s own file
 * header for why: the certified `write-service.ts` ports never thread a `workspaceId` through
 * their method signatures).
 */

function alwaysAllow() {
  return async () => ({ allowed: true, reason: "ok" });
}

async function openTempContentDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "taxonomy-sqlite-"));
  const filePath = path.join(tmpDir, "content.db");
  const db = await openPreparedContentDb(filePath);
  return { db, filePath, tmpDir };
}

function buildDeps(db: ContentDb, workspaceId: string, idPrefix = "id") {
  let counter = 0;
  const taxonomies = new SqlTaxonomyRepo({ kernel: schemaErasedKernel({ store: db }), tables: TAXONOMY_TABLES, workspaceId }, {});
  return {
    authorize: alwaysAllow(),
    clock: { nowMs: () => Date.parse("2026-07-15T00:00:00.000Z") },
    idGen: { newId: () => `${idPrefix}-${++counter}` },
    taxonomies,
