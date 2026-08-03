import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "#src/db/sqlite/content-db";
import { SqliteEntryTermRepo, SqliteTaxonomyRepo, SqliteTaxonomyRevisionRepo, SqliteTermRepo, sqliteStampWatermark } from "../../repo.sqlite";
import { createTaxonomy, createTerm, renameTerm } from "../../write-service";

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

function openTempContentDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "taxonomy-sqlite-"));
  const filePath = path.join(tmpDir, "content.db");
  const db = openContentDb(filePath);
  return { db, filePath, tmpDir };
}

function buildDeps(db: ReturnType<typeof openContentDb>, workspaceId: string, idPrefix = "id") {
  let counter = 0;
  return {
    authorize: alwaysAllow(),
    clock: { nowIso: () => "2026-07-15T00:00:00.000Z" },
    idGen: { newId: () => `${idPrefix}-${++counter}` },
    taxonomies: new SqliteTaxonomyRepo({ db, workspaceId }),
    terms: new SqliteTermRepo({ db, workspaceId }),
    entryTerms: new SqliteEntryTermRepo({ db, workspaceId }),
    revisions: new SqliteTaxonomyRevisionRepo({ db, workspaceId }),
    stampWatermark: sqliteStampWatermark(db),
    outbox: { enqueue: async () => {} },
  };
}

test("create -> restart-simulated (fresh repo instance against the same file) -> data still there", async () => {
  const { db, filePath, tmpDir } = openTempContentDb();
  try {
    const deps = buildDeps(db, "ws-1");
    const taxonomy = await createTaxonomy({ deps, principalId: "user-1", name: "Category", hierarchical: true });
    await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "Recipes" });

    const dbAfterRestart = openContentDb(filePath);
    const taxonomyRepoAfterRestart = new SqliteTaxonomyRepo({ db: dbAfterRestart, workspaceId: "ws-1" });
    const termRepoAfterRestart = new SqliteTermRepo({ db: dbAfterRestart, workspaceId: "ws-1" });

    const foundTaxonomy = await taxonomyRepoAfterRestart.findById(taxonomy.id);
    assert.ok(foundTaxonomy);
    assert.equal(foundTaxonomy?.hierarchical, true);

    const terms = await termRepoAfterRestart.listByTaxonomy({ taxonomyId: taxonomy.id });
    assert.equal(terms.length, 1);
    assert.equal(terms[0].name, "Recipes");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("workspace-scoping boundary: a taxonomy created for ws-1 is invisible to ws-2's adapter instance", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const ws1Deps = buildDeps(db, "ws-1");
    const taxonomy = await createTaxonomy({ deps: ws1Deps, principalId: "user-1", name: "Category", hierarchical: true });

    const ws2TaxonomyRepo = new SqliteTaxonomyRepo({ db, workspaceId: "ws-2" });
    const crossWorkspace = await ws2TaxonomyRepo.findById(taxonomy.id);
    assert.equal(crossWorkspace, null, "a taxonomy created under ws-1 must not resolve through a ws-2-scoped adapter");

    const ws1List = await ws1Deps.taxonomies.list();
    const ws2List = await ws2TaxonomyRepo.list();
    assert.equal(ws1List.length, 1);
    assert.equal(ws2List.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("revision/audit trail actually persists: create + create-term + rename each append a real taxonomy_revisions row", async () => {
  const { db, filePath, tmpDir } = openTempContentDb();
  try {
    const deps = buildDeps(db, "ws-1");
    const taxonomy = await createTaxonomy({ deps, principalId: "user-1", name: "Category", hierarchical: true });
    const term = await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "Recipes" });
    await renameTerm({ deps, principalId: "user-1", termId: term.id, newName: "Cooking" });

    const dbAfterRestart = openContentDb(filePath);
    const rows = dbAfterRestart.$client.prepare("SELECT op, workspace_id, taxonomy_id FROM taxonomy_revisions ORDER BY seq ASC").all() as Array<{
      op: string;
      workspace_id: string;
      taxonomy_id: string;
    }>;
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => r.op),
      ["create", "create", "rename"]
    );
    assert.ok(rows.every((r) => r.workspace_id === "ws-1" && r.taxonomy_id === taxonomy.id));

    // database_write_watermark advanced by exactly 3 (one per stampWatermark() call above) — proves
    // `sqliteStampWatermark` genuinely reused the certified `stampWatermarkTx` increment, not a
    // silent no-op.
    const watermarkRow = dbAfterRestart.$client.prepare("SELECT value FROM database_write_watermark WHERE id = 1").get() as { value: number };
    assert.equal(watermarkRow.value, 3);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
