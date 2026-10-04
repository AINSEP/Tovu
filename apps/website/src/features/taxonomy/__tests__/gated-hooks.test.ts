import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryEntryTermRepo, InMemoryTermRepo } from "../index.js";
import { buildMergeTermHooks } from "../gated-hooks.js";

const AT = "2026-09-29T12:00:00Z";

// BUG (F4.6/F6.3): merging must advance the source's concurrency version, not reset it to 1.
test("merge recomputes overlap and persists deprecation, an advanced version and a complete audit record", async () => {
  const terms = new InMemoryTermRepo();
  const assignments = new InMemoryEntryTermRepo();
  await terms.insert({ id: "from", taxonomyId: "taxonomy-8", parentId: "parent", name: "Old", status: "active", updatedAt: "before", version: 6 });
  await terms.insert({ id: "into", taxonomyId: "taxonomy-8", parentId: null, name: "New", status: "active", updatedAt: "before", version: 4 });
  await assignments.upsert({ contentType: "post", contentId: "p-1", termId: "from", addedAt: AT });
  await assignments.upsert({ contentType: "post", contentId: "p-1", termId: "unrelated", addedAt: AT });
  const revisions: unknown[] = [];
  const hooks = buildMergeTermHooks({ workspaceId: "ws-merge", fromTermId: "from", intoTermId: "into", actorId: "actor-7", clock: { nowMs: () => Date.parse(AT) }, termRepo: terms, entryTermRepo: assignments, taxonomyRevisionRepo: { insert: async (row) => { revisions.push(row); return row; } } });
  const first = await hooks.computePlan();
  assert.deepEqual(first.details, { fromTermId: "from", intoTermId: "into", overlapLossDisclosed: false, overlappingContentCount: 0 });
  await assignments.upsert({ contentType: "post", contentId: "p-1", termId: "into", addedAt: AT });
  const second = await hooks.computePlan();
  assert.deepEqual(second.details, { fromTermId: "from", intoTermId: "into", overlapLossDisclosed: true, overlappingContentCount: 1 });
  assert.notEqual(second.planHash, first.planHash);
  assert.deepEqual(await hooks.executeMutation(), { mergedCount: 1 });
  assert.equal(await assignments.countByTerm({ termId: "from" }), 0);
  assert.equal(await assignments.countByTerm({ termId: "into" }), 1);
  assert.equal(await assignments.countByTerm({ termId: "unrelated" }), 1);
  assert.deepEqual(await terms.findByIdFull("into"), { id: "into", taxonomyId: "taxonomy-8", parentId: null, name: "New", status: "active", updatedAt: "before", version: 4 });
  // F2.5: the revision port is the contract; assert the complete delivered record.
  assert.deepEqual(revisions, [{ taxonomyId: "taxonomy-8", op: "deprecate", previousState: { mergedInto: "into", fromTermId: "from", repointedCount: 1 }, actorId: "actor-7", recordedAt: AT }]);
  assert.deepEqual(await terms.findByIdFull("from"), { id: "from", taxonomyId: "taxonomy-8", parentId: null, name: "Old", status: "deprecated", updatedAt: AT, version: 7 });
});

test("a repoint failure propagates before term updates or audit writes", async () => {
  const seen: string[] = [];
  const hooks = buildMergeTermHooks({ workspaceId: "ws", fromTermId: "from", intoTermId: "into", actorId: "actor", clock: { nowMs: () => Date.parse(AT) },
    entryTermRepo: { countOverlap: async () => 0, repointTerm: async (p) => { assert.deepEqual(p, { fromTermId: "from", intoTermId: "into" }); seen.push("repoint"); throw new Error("storage failed"); } },
    termRepo: { findById: async () => { seen.push("term-read"); return null; } } as InMemoryTermRepo,
    taxonomyRevisionRepo: { insert: async (row) => { seen.push("revision"); return row; } },
  });
  await assert.rejects(hooks.executeMutation(), { message: "storage failed" });
  assert.deepEqual(seen, ["repoint"]);
});

test("an absent source term still returns the repointed count without inventing a revision", async () => {
  const terms = new InMemoryTermRepo();
  const assignments = new InMemoryEntryTermRepo();
  await assignments.upsert({ contentType: "page", contentId: "p", termId: "from", addedAt: AT });
  const revisions: unknown[] = [];
  const hooks = buildMergeTermHooks({ workspaceId: "ws", fromTermId: "from", intoTermId: "into", actorId: "actor", clock: { nowMs: () => Date.parse(AT) }, termRepo: terms, entryTermRepo: assignments, taxonomyRevisionRepo: { insert: async (row) => { revisions.push(row); return row; } } });
  assert.deepEqual(await hooks.executeMutation(), { mergedCount: 1 });
  assert.equal(await assignments.countByTerm({ termId: "from" }), 0);
  assert.equal(await assignments.countByTerm({ termId: "into" }), 1);
  assert.deepEqual(await terms.listByTaxonomy({ taxonomyId: "tx" }), []);
  assert.deepEqual(revisions, []);
});
