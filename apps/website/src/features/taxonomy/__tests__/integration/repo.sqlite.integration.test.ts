import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteEntryTermRepo, SqliteTaxonomyRepo, SqliteTaxonomyRevisionRepo, SqliteTermRepo, sqliteStampWatermark } from "../../repo.sqlite.js";
import {
  createTaxonomy,
  createTerm,
  renameTerm,
  deleteTerm,
  deleteTaxonomy,
  assignTerms,
  createPostBackedContentLookup,
  InMemoryContentLookup,
} from "../../index.js";

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
  const taxonomies = new SqliteTaxonomyRepo({ db, workspaceId });
  return {
    authorize: alwaysAllow(),
    clock: { nowIso: () => "2026-07-15T00:00:00.000Z" },
    idGen: { newId: () => `${idPrefix}-${++counter}` },
    taxonomies,
    terms: new SqliteTermRepo({ db, workspaceId }),
    entryTerms: new SqliteEntryTermRepo({ db, workspaceId }),
    revisions: new SqliteTaxonomyRevisionRepo({ db, workspaceId }),
    stampWatermark: sqliteStampWatermark(db),
    outbox: { enqueue: async () => {} },
    // `deleteTerm`/`deleteTaxonomy` (coordinator review addition) and `assignTerms` are the only
    // functions in this file's test set that dereference these two — `createTaxonomy`/`createTerm`/
    // `renameTerm` above never read them, which is why `buildDeps` got away without them until now.
    workspaceId,
    contentLookup: new InMemoryContentLookup(),
    // `SqliteTaxonomyRepo.transaction` — real `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` against the
    // same connection every other adapter above shares (all constructed with this same `db`).
    transaction: <T>(fn: () => Promise<T>) => taxonomies.transaction(fn),
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

// ---------------------------------------------------------------------------
// deleteTerm / deleteTaxonomy against REAL SQLite — coordinator review addition. The pure-domain
// tests in `write-service.test.ts` (Jini) prove the guard reads happen inside the transaction
// boundary using plain-JS doubles; these prove the two things only a real database connection can
// prove: (1) the workspace filter in the guard queries themselves, not just the eventual delete,
// and (2) that a mid-cascade failure is ACTUALLY undone by a real ROLLBACK, not merely "the
// function threw".
// ---------------------------------------------------------------------------

test("guard queries are workspace-scoped: countByTerm/countChildren/delete on a wrong-workspace-scoped adapter cannot see or touch another workspace's rows", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const ws1Deps = buildDeps(db, "ws-1");
    const ws2Deps = buildDeps(db, "ws-2", "ws2");

    // ws-1: an unrelated, unassigned taxonomy/term — present only so ws-1 has SOME data of its
    // own (rules out "the query returns 0 because the table is empty" as a false-positive cause).
    const ws1Tax = await createTaxonomy({ deps: ws1Deps, principalId: "user-1", name: "Category", hierarchical: true });
    await createTerm({ deps: ws1Deps, principalId: "user-1", taxonomyId: ws1Tax.id, name: "ws1-term" });

    // ws-2: a taxonomy/term that DOES have a real assignment and a real child — the exact "still
    // in use elsewhere" state the guard must correctly see when queried from ws-2's OWN adapter,
    // and correctly NOT see when queried from ws-1's.
    const ws2Tax = await createTaxonomy({ deps: ws2Deps, principalId: "user-2", name: "Category", hierarchical: true });
    const ws2Term = await createTerm({ deps: ws2Deps, principalId: "user-2", taxonomyId: ws2Tax.id, name: "ws2-term" });
    const ws2Child = await createTerm({ deps: ws2Deps, principalId: "user-2", taxonomyId: ws2Tax.id, name: "ws2-child", parentId: ws2Term.id });
    (ws2Deps.contentLookup as InMemoryContentLookup).set("post", "post-ws2", { workspaceId: "ws-2", kind: "post" });
    await assignTerms({ deps: ws2Deps, principalId: "user-2", contentType: "post", contentId: "post-ws2", termIds: [ws2Term.id] });

    // The mutation this proves: if `SqliteEntryTermRepo.countByTerm`/`SqliteTermRepo.countChildren`
    // ever dropped their `eq(workspaceId, this.deps.workspaceId)` clause (leaving only the
    // `termId`/`parentId` match), THESE assertions would flip from 0 to 1/2 — ws-2's real rows
    // would leak into a ws-1-scoped guard read.
    assert.equal(
      await ws1Deps.entryTerms.countByTerm({ termId: ws2Term.id }),
      0,
      "a ws-1-scoped adapter must not see ws-2's real assignment"
    );
    assert.equal(
      await ws1Deps.terms.countChildren({ parentId: ws2Term.id }),
      0,
      "a ws-1-scoped adapter must not see ws-2's real child term"
    );
    // Sanity check the flip side: ws-2's OWN adapter DOES see them (rules out "the guard is
    // simply broken and always returns 0").
    assert.equal(await ws2Deps.entryTerms.countByTerm({ termId: ws2Term.id }), 1);
    assert.equal(await ws2Deps.terms.countChildren({ parentId: ws2Term.id }), 1);

    // The delete calls themselves, not just the counts: a ws-1-scoped `delete()` targeting ws-2's
    // real row ids must be a no-op (the `WHERE workspaceId = ... AND id = ...` matches nothing),
    // never a cross-tenant deletion.
    await ws1Deps.terms.delete(ws2Term.id);
    await ws1Deps.terms.delete(ws2Child.id);
    await ws1Deps.taxonomies.delete(ws2Tax.id);
    assert.ok(await ws2Deps.terms.findById(ws2Term.id), "ws-2's term must survive a ws-1-scoped delete call");
    assert.ok(await ws2Deps.terms.findById(ws2Child.id), "ws-2's child term must survive a ws-1-scoped delete call");
    assert.ok(await ws2Deps.taxonomies.findById(ws2Tax.id), "ws-2's taxonomy must survive a ws-1-scoped delete call");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("deleteTerm/deleteTaxonomy against real SQLite: the guarded refusal paths hold end to end (assignment + children), backed by a real transaction", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const deps = buildDeps(db, "ws-1");
    const taxonomy = await createTaxonomy({ deps, principalId: "user-1", name: "Category", hierarchical: true });
    const parent = await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "Parent" });
    await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "Child", parentId: parent.id });
    const leaf = await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "Leaf" });
    (deps.contentLookup as InMemoryContentLookup).set("post", "post-1", { workspaceId: "ws-1", kind: "post" });
    await assignTerms({ deps, principalId: "user-1", contentType: "post", contentId: "post-1", termIds: [leaf.id] });

    await assert.rejects(deleteTerm({ deps, principalId: "user-1", termId: parent.id }), /child term/);
    await assert.rejects(deleteTerm({ deps, principalId: "user-1", termId: leaf.id }), /assigned to/);
    await assert.rejects(deleteTaxonomy({ deps, principalId: "user-1", taxonomyId: taxonomy.id }), /content assignment/);

    // Nothing was actually removed by any of the three refused calls.
    assert.ok(await deps.terms.findById(parent.id));
    assert.ok(await deps.terms.findById(leaf.id));
    assert.ok(await deps.taxonomies.findById(taxonomy.id));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// T6 (trash parallel plan §2, owner decision 5) — read filtering. `trashTerm`/`trashTaxonomy`
// (`trash-term.ts`) don't exist until commit 2, so these tests flip `status` directly with raw
// SQL to prove the READ side of the contract in isolation: RED before `repo.sqlite.ts`'s
// `taxonomyIsLive`/`termIsLive` filters existed (every one of these rows was visible before this
// commit), GREEN after.
// ---------------------------------------------------------------------------

test("a trashed taxonomy drops out of findById and list, a live sibling does not", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const deps = buildDeps(db, "ws-1");
    const trashed = await createTaxonomy({ deps, principalId: "user-1", name: "Trashed", hierarchical: false });
    const live = await createTaxonomy({ deps, principalId: "user-1", name: "Live", hierarchical: false });
    db.$client.prepare("UPDATE taxonomies SET status = 'trash' WHERE id = ?").run(trashed.id);

    assert.equal(await deps.taxonomies.findById(trashed.id), null);
    assert.ok(await deps.taxonomies.findById(live.id));
    const names = (await deps.taxonomies.list()).map((t) => t.name);
    assert.deepEqual(names, ["Live"]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("a trashed term drops out of findById/listByTaxonomy/findForTrash, a live sibling does not", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const deps = buildDeps(db, "ws-1");
    const taxonomy = await createTaxonomy({ deps, principalId: "user-1", name: "Category", hierarchical: false });
    const trashed = await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "Trashed" });
    const live = await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "Live" });
    db.$client.prepare("UPDATE terms SET status = 'trash' WHERE id = ?").run(trashed.id);

    assert.equal(await deps.terms.findById(trashed.id), null);
    assert.ok(await deps.terms.findById(live.id));
    const names = (await deps.terms.listByTaxonomy({ taxonomyId: taxonomy.id })).map((t) => t.name);
    assert.deepEqual(names, ["Live"]);

    const taxonomyRepo = deps.taxonomies as SqliteTaxonomyRepo;
    const termRepo = deps.terms as SqliteTermRepo;
    assert.equal(await termRepo.findForTrash(trashed.id), null);
    const display = await termRepo.findForTrash(live.id);
    assert.deepEqual(display, { id: live.id, name: "Live", taxonomyId: taxonomy.id, taxonomyName: "Category", version: 1 });
    const taxDisplay = await taxonomyRepo.findForTrash(taxonomy.id);
    assert.deepEqual(taxDisplay, { id: taxonomy.id, name: "Category", version: 1 });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("hiddenWithParent: a LIVE term whose taxonomy is trashed reads as gone too, and comes back the instant the taxonomy does", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const deps = buildDeps(db, "ws-1");
    const taxonomy = await createTaxonomy({ deps, principalId: "user-1", name: "Category", hierarchical: false });
    const term = await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "Member" });
    assert.ok(await deps.terms.findById(term.id), "sanity: visible before the taxonomy is trashed");

    db.$client.prepare("UPDATE taxonomies SET status = 'trash' WHERE id = ?").run(taxonomy.id);
    assert.equal(await deps.terms.findById(term.id), null, "the term's OWN status is still 'active' — only its parent is trashed");
    assert.deepEqual(await deps.terms.listByTaxonomy({ taxonomyId: taxonomy.id }), []);

    db.$client.prepare("UPDATE taxonomies SET status = 'active' WHERE id = ?").run(taxonomy.id);
    assert.ok(await deps.terms.findById(term.id), "restoring the taxonomy makes the never-touched term visible again, no second write");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("listForContent excludes a trashed term's assignment and a live term's assignment under a trashed taxonomy, keeps the assignment row itself", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const deps = buildDeps(db, "ws-1");
    const taxonomy = await createTaxonomy({ deps, principalId: "user-1", name: "Tags", hierarchical: false });
    const termA = await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "A" });
    const termB = await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "B" });
    (deps.contentLookup as InMemoryContentLookup).set("post", "post-1", { workspaceId: "ws-1", kind: "post" });
    await assignTerms({ deps, principalId: "user-1", contentType: "post", contentId: "post-1", termIds: [termA.id, termB.id] });

    const entryTermRepo = deps.entryTerms as SqliteEntryTermRepo;
    assert.deepEqual(
      (await entryTermRepo.listForContent({ contentType: "post", contentId: "post-1" })).map((v) => v.termName).sort(),
      ["A", "B"],
      "sanity: both assigned before anything is trashed"
    );

    // Trash A directly (its own marker) -- the assignment row survives (decision 5), only the read
    // hides it.
    db.$client.prepare("UPDATE terms SET status = 'trash' WHERE id = ?").run(termA.id);
    let visible = await entryTermRepo.listForContent({ contentType: "post", contentId: "post-1" });
    assert.deepEqual(visible.map((v) => v.termName), ["B"]);
    assert.equal(await entryTermRepo.countByTerm({ termId: termA.id }), 1, "the entry_terms row for A was never deleted by a trash");

    // Restore A, then trash the whole taxonomy instead -- hiddenWithParent must hide BOTH.
    db.$client.prepare("UPDATE terms SET status = 'active' WHERE id = ?").run(termA.id);
    db.$client.prepare("UPDATE taxonomies SET status = 'trash' WHERE id = ?").run(taxonomy.id);
    visible = await entryTermRepo.listForContent({ contentType: "post", contentId: "post-1" });
    assert.deepEqual(visible, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("findForPurgeAudit/listIdsForPurgeAudit read regardless of trash status — the shape a purge follow-up needs after the row is already hidden", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const deps = buildDeps(db, "ws-1");
    const taxonomy = await createTaxonomy({ deps, principalId: "user-1", name: "Category", hierarchical: false });
    const termA = await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "A" });
    const termB = await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "B" });
    const termRepo = deps.terms as SqliteTermRepo;

    // Sanity: both reads work before anything is trashed.
    assert.deepEqual(await termRepo.findForPurgeAudit(termA.id), { id: termA.id, name: "A", taxonomyId: taxonomy.id });
    assert.deepEqual((await termRepo.listIdsForPurgeAudit(taxonomy.id)).sort(), [termA.id, termB.id].sort());

    // A purge only ever runs on an already-trashed row — `findForTrash` would already return null
    // here, which is exactly the case `findForPurgeAudit` exists to still serve.
    db.$client.prepare("UPDATE terms SET status = 'trash' WHERE id = ?").run(termA.id);
    assert.equal(await termRepo.findForTrash(termA.id), null, "sanity: the live-filtered read is blind to a trashed term");
    assert.deepEqual(await termRepo.findForPurgeAudit(termA.id), { id: termA.id, name: "A", taxonomyId: taxonomy.id });

    // `listIdsForPurgeAudit` must also see a member term whose PARENT taxonomy is trashed
    // (hiddenWithParent) — the taxonomy purge cascade deletes it too, regardless of its own marker.
    db.$client.prepare("UPDATE taxonomies SET status = 'trash' WHERE id = ?").run(taxonomy.id);
    assert.deepEqual(await termRepo.listByTaxonomy({ taxonomyId: taxonomy.id }), [], "sanity: the live-filtered read is now blind to both");
    assert.deepEqual((await termRepo.listIdsForPurgeAudit(taxonomy.id)).sort(), [termA.id, termB.id].sort());

    assert.equal(await termRepo.findForPurgeAudit("does-not-exist"), null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteTermRepo.update's setWhere guard: a write against an already-trashed term is a no-op, the row stays exactly as it was", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const deps = buildDeps(db, "ws-1");
    const taxonomy = await createTaxonomy({ deps, principalId: "user-1", name: "Category", hierarchical: false });
    const term = await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "Original" });
    db.$client.prepare("UPDATE terms SET status = 'trash' WHERE id = ?").run(term.id);

    // Bypasses `renameTerm`'s own (already trash-filtered) `findById` guard on purpose -- this
    // proves the repo's OWN `setWhere`, not the write-service's read-then-write, is what stops a
    // stale write from reviving or editing an already-trashed row.
    const termRepo = deps.terms as SqliteTermRepo;
    await termRepo.update({ id: term.id, taxonomyId: taxonomy.id, parentId: null, name: "Hijacked", status: "active", updatedAt: "later", version: 99 });

    const row = db.$client.prepare("SELECT name, status, version FROM terms WHERE id = ?").get(term.id) as {
      name: string;
      status: string;
      version: number;
    };
    assert.deepEqual(row, { name: "Original", status: "trash", version: 1 }, "the update's WHERE matched zero rows -- nothing changed");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("atomicity: a mid-cascade failure in deleteTaxonomy is genuinely undone by a real SQLite ROLLBACK, not just an aborted function call", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const deps = buildDeps(db, "ws-1");
    const taxonomy = await createTaxonomy({ deps, principalId: "user-1", name: "Category", hierarchical: true });
    const termA = await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "A" });
    const termB = await createTerm({ deps, principalId: "user-1", taxonomyId: taxonomy.id, name: "B" });

    // A thin proxy over the REAL `SqliteTermRepo` that delegates every method except `delete`,
    // which throws on its SECOND call — simulating the exact failure mode hazard #1 (atomicity)
    // named: a mid-cascade error after at least one real DELETE has already executed against the
    // live connection.
    let deleteCalls = 0;
    const failingTerms: typeof deps.terms = {
      ...deps.terms,
      findById: deps.terms.findById.bind(deps.terms),
      insert: deps.terms.insert.bind(deps.terms),
      update: deps.terms.update.bind(deps.terms),
      listByTaxonomy: deps.terms.listByTaxonomy.bind(deps.terms),
      countChildren: deps.terms.countChildren.bind(deps.terms),
      delete: async (id: string) => {
        deleteCalls += 1;
        if (deleteCalls === 2) {
          throw new Error("simulated disk failure mid-cascade");
        }
        return deps.terms.delete(id);
      },
    };

    await assert.rejects(
      deleteTaxonomy({ deps: { ...deps, terms: failingTerms }, principalId: "user-1", taxonomyId: taxonomy.id }),
      /simulated disk failure/
    );

    // The load-bearing assertion: query the SAME live connection directly (not a fresh
    // `openContentDb` — the point is proving THIS transaction rolled back, not merely that data
    // survives a restart). If `deleteTaxonomy` were not wrapped in one real transaction, term A's
    // `DELETE` (the first, successful call) would have already committed autocommit-per-statement
    // before term B's `DELETE` threw — term A would be gone and term B and the taxonomy would
    // remain, a partial cascade. A real `BEGIN IMMEDIATE` ... `ROLLBACK` undoes ALL of it.
    const survivingTermIds = db.$client
      .prepare("SELECT id FROM terms WHERE workspace_id = ? ORDER BY id ASC")
      .all("ws-1")
      .map((r) => (r as { id: string }).id);
    assert.deepEqual(survivingTermIds.sort(), [termA.id, termB.id].sort(), "both terms must survive the rolled-back transaction");

    const survivingTaxonomy = db.$client.prepare("SELECT id FROM taxonomies WHERE workspace_id = ? AND id = ?").get("ws-1", taxonomy.id);
    assert.ok(survivingTaxonomy, "the taxonomy row must survive the rolled-back transaction");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
