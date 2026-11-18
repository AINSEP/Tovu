import assert from "node:assert/strict";
import { test } from "node:test";

import { recordingKernel } from "#src/__tests__/lane-su-pins/support/recording-kernel";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { Taxonomy, Term } from "../index.js";
import {
  SqliteEntryTermRepo,
  SqliteTaxonomyRepo,
  SqliteTaxonomyRevisionRepo,
  SqliteTermRepo,
} from "../repo.sqlite.js";

/**
 * @file S1a T0: the four taxonomy repos' behaviour on the unmoved code, before their query bodies move to
 * Jini `@jini-ai/cms/taxonomy/sql`. Real SQLite kernel (the recorder from the lane-su pins), driven through the
 * `Sqlite*Repo` names that survive the move. Each test names the one-line mutation of `repo.ts` that turns it
 * red; the run's report holds the red output of each.
 */

const WS = "ws-1";
const OTHER = "ws-2";
const T0 = "2026-09-28T00:00:00.000Z";

function taxonomy(id: string, overrides: Partial<Taxonomy> = {}): Taxonomy {
  return { id, name: `Tax ${id}`, hierarchical: false, status: "active", updatedAt: T0, version: 1, ...overrides };
}

function term(id: string, taxonomyId: string, overrides: Partial<Term> = {}): Term {
  return { id, taxonomyId, parentId: null, name: `Term ${id}`, status: "active", updatedAt: T0, version: 1, ...overrides };
}

interface Repos {
  kernel: ContentKernel;
  taxonomies: SqliteTaxonomyRepo;
  terms: SqliteTermRepo;
  entryTerms: SqliteEntryTermRepo;
  revisions: SqliteTaxonomyRevisionRepo;
}

function reposOn(kernel: ContentKernel, workspaceId: string): Repos {
  const deps = { db: kernel, workspaceId };
  return {
    kernel,
    taxonomies: new SqliteTaxonomyRepo(deps),
    terms: new SqliteTermRepo(deps),
    entryTerms: new SqliteEntryTermRepo(deps),
    revisions: new SqliteTaxonomyRevisionRepo(deps),
  };
}

/** The fixture of the trash matrix: one live taxonomy (a live term and one with its own trash marker),
 *  one trashed taxonomy with a still-active term, every term assigned to the same post. */
async function seedTrashMatrix(repos: Repos): Promise<void> {
  await repos.taxonomies.insert(taxonomy("tx-live"));
  await repos.taxonomies.insert(taxonomy("tx-dead"));
  await repos.terms.insert(term("t-live", "tx-live"));
  await repos.terms.insert(term("t-own-trash", "tx-live", { parentId: "t-live" }));
  await repos.terms.insert(term("t-under", "tx-dead"));
  await repos.terms.update(term("t-own-trash", "tx-live", { parentId: "t-live", status: "trash" }));
  // A taxonomy is trashed by a status write on a live row (the Trash adapter's marker), nothing cascades.
  await repos.taxonomies.update(taxonomy("tx-dead", { status: "trash" }));
  for (const termId of ["t-live", "t-own-trash", "t-under"]) {
    await repos.entryTerms.upsert({ contentType: "post", contentId: "p1", termId, addedAt: T0 });
  }
}

/** Run one read for every id; `null`/`[]` in the expectation means the row is hidden. */
async function visible<T>(ids: readonly string[], read: (id: string) => Promise<T | null>): Promise<string[]> {
  const shown: string[] = [];
  for (const id of ids) if ((await read(id)) !== null) shown.push(id);
  return shown;
}

test("taxonomy reads: every live read hides a trashed taxonomy, findAnyById still shows it", async () => {
  const repos = reposOn(recordingKernel().kernel, WS);
  await seedTrashMatrix(repos);
  const ids = ["tx-live", "tx-dead"];
  assert.deepEqual(await visible(ids, (id) => repos.taxonomies.findById({ id })), ["tx-live"]);
  assert.deepEqual(await visible(ids, (id) => repos.taxonomies.findByIdFull({ id })), ["tx-live"]);
  assert.deepEqual(await visible(ids, (id) => repos.taxonomies.findForTrash({ id })), ["tx-live"]);
  assert.deepEqual(await visible(ids, (id) => repos.taxonomies.findAnyById({ id })), ["tx-live", "tx-dead"]);
  assert.deepEqual((await repos.taxonomies.list()).map((row) => row.id), ["tx-live"]);
});

test("term reads: a term is hidden by its own marker AND by its taxonomy's; the trash-blind reads show all", async () => {
  const repos = reposOn(recordingKernel().kernel, WS);
  await seedTrashMatrix(repos);
  const ids = ["t-live", "t-own-trash", "t-under"];
  assert.deepEqual(await visible(ids, (id) => repos.terms.findById({ id })), ["t-live"]);
  assert.deepEqual(await visible(ids, (id) => repos.terms.findByIdFull({ id })), ["t-live"]);
  assert.deepEqual(await visible(ids, (id) => repos.terms.findForTrash({ id })), ["t-live"]);
  assert.deepEqual(await visible(ids, (id) => repos.terms.findAnyById({ id })), ids);
  assert.deepEqual(await visible(ids, (id) => repos.terms.findForPurgeAudit({ id })), ids);
  assert.deepEqual((await repos.terms.listByTaxonomy({ taxonomyId: "tx-live" })).map((row) => row.id), ["t-live"]);
  assert.deepEqual(await repos.terms.listByTaxonomy({ taxonomyId: "tx-dead" }), []);
});

test("term trash-blind reads: purge-audit ids, parent lookup and child count ignore every trash marker", async () => {
  const repos = reposOn(recordingKernel().kernel, WS);
  await seedTrashMatrix(repos);
  assert.deepEqual((await repos.terms.listIdsForPurgeAudit({ taxonomyId: "tx-live" })).sort(), ["t-live", "t-own-trash"]);
  assert.deepEqual(await repos.terms.listIdsForPurgeAudit({ taxonomyId: "tx-dead" }), ["t-under"]);
  assert.equal(await repos.terms.getParentId({ termId: "t-own-trash" }), "t-live");
  assert.equal(await repos.terms.countChildren({ parentId: "t-live" }), 1);
});

test("assignment reads: listForContent hides a trashed term and a term of a trashed taxonomy; counts do not", async () => {
  const repos = reposOn(recordingKernel().kernel, WS);
  await seedTrashMatrix(repos);
  const listed = await repos.entryTerms.listForContent({ contentType: "post", contentId: "p1" });
  assert.deepEqual(listed, [{ termId: "t-live", termName: "Term t-live", taxonomyName: "Tax tx-live" }]);
  assert.equal(await repos.entryTerms.countByTerm({ termId: "t-own-trash" }), 1);
  assert.equal(await repos.entryTerms.countByTerm({ termId: "t-under" }), 1);
  assert.equal(await repos.entryTerms.countOverlap({ fromTermId: "t-under", intoTermId: "t-own-trash" }), 1);
});

test("hiding is not a cascade: trashing a taxonomy leaves each member term's own status untouched", async () => {
  const repos = reposOn(recordingKernel().kernel, WS);
  await seedTrashMatrix(repos);
  assert.equal((await repos.terms.findAnyById({ id: "t-under" }))?.status, "active");
  assert.equal((await repos.terms.findAnyById({ id: "t-live" }))?.status, "active");
  assert.equal(await repos.terms.findById({ id: "t-under" }), null);
});

test("a stale update of a trashed row changes nothing: no resurrection, no edit", async () => {
  const repos = reposOn(recordingKernel().kernel, WS);
  await seedTrashMatrix(repos);
  await repos.taxonomies.update(taxonomy("tx-dead", { name: "revived", status: "active", version: 9 }));
  assert.deepEqual(await repos.taxonomies.findAnyById({ id: "tx-dead" }), taxonomy("tx-dead", { status: "trash" }));
  await repos.terms.update(term("t-own-trash", "tx-live", { name: "revived", status: "active", version: 9 }));
  await repos.terms.update(term("t-under", "tx-dead", { name: "edited", version: 9 }));
  assert.equal((await repos.terms.findAnyById({ id: "t-own-trash" }))?.status, "trash");
  assert.equal((await repos.terms.findAnyById({ id: "t-own-trash" }))?.name, "Term t-own-trash");
  assert.equal((await repos.terms.findAnyById({ id: "t-under" }))?.name, "Term t-under");
});

/** The recording kernel's lock keys plus every statement, in call order: `lock:<key>` and `run`. */
function tracedKernel(): { kernel: ContentKernel; events: string[] } {
  const { kernel: base } = recordingKernel();
  const events: string[] = [];
  const kernel: ContentKernel = {
    ...base,
    run: (fn) => {
      events.push("run");
      return base.run(fn);
    },
    lockKey: async (key) => {
      events.push(`lock:${key}`);
      await base.lockKey(key);
    },
  };
  return { kernel, events };
}

test("the taxonomy transaction takes the per-workspace lock before its first statement", async () => {
  const { kernel, events } = tracedKernel();
  const repos = reposOn(kernel, WS);
  await repos.taxonomies.transaction({ fn: async () => { await repos.taxonomies.list(); } });
  assert.deepEqual(events, [`lock:taxonomy:${WS}`, "run"]);
});

test("repointTerm takes the per-workspace lock before it reads the assignments it moves", async () => {
  const { kernel, events } = tracedKernel();
  const repos = reposOn(kernel, WS);
  await repos.entryTerms.repointTerm({ fromTermId: "a", intoTermId: "b" });
  assert.equal(events[0], `lock:taxonomy:${WS}`);
  assert.deepEqual(events.slice(1), ["run", "run"], "the read of the moved rows, then the delete of the emptied source");
});

test("every class reads only its own workspace: another workspace's ids, lists and assignments never show", async () => {
  const kernel = recordingKernel().kernel;
  const mine = reposOn(kernel, WS);
  const theirs = reposOn(kernel, OTHER);
  await mine.taxonomies.insert(taxonomy("tx"));
  await mine.terms.insert(term("t", "tx"));
  await mine.entryTerms.upsert({ contentType: "post", contentId: "p1", termId: "t", addedAt: T0 });
  await theirs.taxonomies.insert(taxonomy("tx-o"));
  await theirs.terms.insert(term("t-o", "tx-o"));
  await theirs.entryTerms.upsert({ contentType: "post", contentId: "p1", termId: "t-o", addedAt: T0 });
  await theirs.revisions.insert({ taxonomyId: "tx-o", op: "create", previousState: null, actorId: "a", recordedAt: T0 });
  assert.equal(await mine.taxonomies.findAnyById({ id: "tx-o" }), null);
  assert.deepEqual((await mine.taxonomies.list()).map((row) => row.id), ["tx"]);
  assert.equal(await mine.terms.findAnyById({ id: "t-o" }), null);
  assert.equal(await mine.terms.findById({ id: "t-o" }), null);
  assert.deepEqual(await mine.terms.listByTaxonomy({ taxonomyId: "tx-o" }), []);
  assert.deepEqual(await mine.terms.listIdsForPurgeAudit({ taxonomyId: "tx-o" }), []);
  assert.equal(await mine.entryTerms.countByTerm({ termId: "t-o" }), 0);
  assert.deepEqual((await mine.entryTerms.listForContent({ contentType: "post", contentId: "p1" })).map((row) => row.termId), ["t"]);
  assert.deepEqual(await mine.revisions.listForTests({ taxonomyId: "tx-o" }), []);
  assert.equal((await theirs.revisions.listForTests({ taxonomyId: "tx-o" })).length, 1);
});
