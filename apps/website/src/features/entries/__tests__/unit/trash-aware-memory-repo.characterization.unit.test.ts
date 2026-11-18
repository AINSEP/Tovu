import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { getMediaAccessEvidenceCache } from "../../../media/access-evidence.js";
import type { EntryRecord } from "../../index.js";
import { EntrySlugConflictError, VersionConflictError } from "../../index.js";
import { trashAwareEntryRepo } from "#src/features/entries/__tests__/support/trash-aware-entry-repo";

/**
 * @file S2c: the memory twin's write-completion contract and its shared read/trash/slug rows. Written on the unmoved code (S2c T0), kept
 * after the class moved to Jini `@jini-ai/cms/entries` as the binding test: the repo is built the way composition builds it, so each
 * test proves the host's `onWriteSettled` binding reaches the REAL access-evidence cache. Four sites empty the caches linked to THIS repository
 * (the cache is `getMediaAccessEvidenceCache`, seeded with one never-resolved entry), and three of them are deliberately NOT
 * in a `finally`: a refused `save`, and a `hardDelete` of a missing id, leave the cache alone (the SQL repo differs: its `save`
 * invalidates on failure too). Each test names the one-line mutation of Jini's `repo.trash-aware.memory.ts` that turns it red.
 */

const WS = "ws-1";
const NOW = "2026-09-23T00:00:00.000Z";

function entry(id: string, overrides: Partial<EntryRecord> = {}): EntryRecord {
  return { id, workspaceId: WS, type: "recipe", slug: `slug-${id}`, status: "draft", title: id, bodyJson: null, fieldsJson: { ext: { site: {} } }, publishedAt: null, createdAt: NOW, updatedAt: NOW, version: 1, ...overrides };
}

/** A repo whose linked access-evidence cache holds one pending entry: the cache is non-empty until the repo says so. */
function repoWithSeededCache() {
  const repo = trashAwareEntryRepo();
  const cache = getMediaAccessEvidenceCache({ postRepo: {}, entryRepo: repo });
  const seed = () => cache.set("evidence", { expiresAt: Date.now() + 60_000, value: new Promise(() => undefined) });
  seed();
  return { repo, cache, seed };
}

test("a successful save empties the repository's linked access-evidence cache", async () => {
  const { repo, cache } = repoWithSeededCache();
  await repo.save(entry("e1"));
  assert.equal(cache.size, 0);
});

test("a REFUSED save (trashed slug holder, version conflict, taken id) leaves the cache as it was: that site is not in a finally", async () => {
  const { repo, cache, seed } = repoWithSeededCache();
  await repo.save(entry("held"));
  await repo.saveAny({ ...entry("held"), deletedAt: NOW });
  seed();
  await assert.rejects(repo.save(entry("other", { slug: "slug-held" })), EntrySlugConflictError);
  assert.equal(cache.size, 1, "slug conflict");
  await repo.save(entry("e2"));
  seed();
  await assert.rejects(repo.save(entry("e2", { version: 2 }), { expectedVersion: 7 }), VersionConflictError);
  assert.equal(cache.size, 1, "version conflict");
  await assert.rejects(repo.save(entry("e2", { slug: "slug-other" }), { expectedVersion: null }), VersionConflictError);
  assert.equal(cache.size, 1, "create over a taken id");
});

test("a transaction empties the cache when it resolves and when it rejects", async () => {
  const { repo, cache, seed } = repoWithSeededCache();
  assert.equal(await repo.transaction({ fn: async () => "ok" }), "ok");
  assert.equal(cache.size, 0, "resolved");
  seed();
  await assert.rejects(repo.transaction({ fn: async () => { throw new Error("boom"); } }), /boom/);
  assert.equal(cache.size, 0, "rejected");
});

test("saveAny empties the cache, for a live row and for a trashed one", async () => {
  const { repo, cache, seed } = repoWithSeededCache();
  await repo.saveAny({ ...entry("a"), deletedAt: null });
  assert.equal(cache.size, 0, "live");
  seed();
  await repo.saveAny({ ...entry("a"), deletedAt: NOW });
  assert.equal(cache.size, 0, "trashed");
});

test("hardDelete empties the cache only when it removed a row; a missing id leaves it", async () => {
  const { repo, cache, seed } = repoWithSeededCache();
  await repo.saveAny({ ...entry("a"), deletedAt: NOW });
  seed();
  await repo.hardDelete({ workspaceId: WS, id: "missing" });
  assert.equal(cache.size, 1, "missing id");
  await repo.hardDelete({ workspaceId: WS, id: "a" });
  assert.equal(cache.size, 0, "removed");
  assert.equal(await repo.findAnyById({ workspaceId: WS, id: "a" }), null);
});

test("only the writing repository's linked cache is emptied, never another repository's", async () => {
  const first = repoWithSeededCache();
  const second = repoWithSeededCache();
  await first.repo.save(entry("e1"));
  assert.equal(first.cache.size, 0, "the writer's own cache");
  assert.equal(second.cache.size, 1, "another repository's cache is untouched");
});

test("a read never empties the cache", async () => {
  const { repo, cache } = repoWithSeededCache();
  await repo.findById({ workspaceId: WS, id: "none" });
  await repo.listByWorkspace({ workspaceId: WS });
  assert.equal(cache.size, 1);
});

test("a trashed row is hidden by every read; findAny* shows it with its marker; a live row has a null marker", async () => {
  const repo = trashAwareEntryRepo();
  await repo.save(entry("live"));
  await repo.saveAny({ ...entry("gone"), deletedAt: NOW });
  assert.equal(await repo.findById({ workspaceId: WS, id: "gone" }), null);
  assert.equal(await repo.findBySlug({ workspaceId: WS, type: "recipe", slug: "slug-gone" }), null);
  assert.deepEqual((await repo.listByWorkspace({ workspaceId: WS })).map((row) => row.id), ["live"]);
  assert.deepEqual((await repo.listByWorkspaceExcludingTypes({ workspaceId: WS, excludeTypes: [] })).map((row) => row.id), ["live"]);
  assert.equal((await repo.findAnyById({ workspaceId: WS, id: "gone" }))?.deletedAt, NOW);
  assert.equal((await repo.findAnyBySlug({ workspaceId: WS, type: "recipe", slug: "slug-gone" }))?.deletedAt, NOW);
  assert.equal((await repo.findAnyById({ workspaceId: WS, id: "live" }))?.deletedAt, null);
});

test("every read and hardDelete is scoped to the workspace", async () => {
  const repo = trashAwareEntryRepo();
  await repo.save(entry("mine"));
  await repo.save(entry("theirs", { workspaceId: "ws-2" }));
  assert.deepEqual((await repo.listByWorkspace({ workspaceId: WS })).map((row) => row.id), ["mine"]);
  assert.equal(await repo.findById({ workspaceId: "ws-2", id: "mine" }), null);
  await repo.hardDelete({ workspaceId: "ws-2", id: "mine" });
  assert.equal((await repo.findById({ workspaceId: WS, id: "mine" }))?.id, "mine", "another workspace's hardDelete removed nothing");
  await repo.saveAny({ ...entry("trashed"), deletedAt: NOW });
  await repo.hardDelete({ workspaceId: "ws-2", id: "trashed" });
  assert.equal((await repo.findAnyById({ workspaceId: WS, id: "trashed" }))?.deletedAt, NOW, "another workspace's hardDelete kept the Trash marker");
});

test("a slug held by a trashed row refuses a create with the Trash's message; a save of the trashed row itself is a silent skip", async () => {
  const repo = trashAwareEntryRepo();
  await repo.saveAny({ ...entry("held"), deletedAt: NOW });
  await assert.rejects(repo.save(entry("other", { slug: "slug-held" })), (error: unknown) => {
    assert.ok(error instanceof EntrySlugConflictError);
    assert.equal(error.message, "an entry with slug 'slug-held' is in the Trash — restore it, or delete it permanently from the Trash, to reuse the slug");
    return true;
  });
  await repo.save(entry("held", { title: "changed" }));
  assert.equal((await repo.findAnyById({ workspaceId: WS, id: "held" }))?.title, "held", "a trashed row stays as it was");
});

test("listPublishedForDisplay honours offset 0, 1 and absent over three published rows", async () => {
  const repo = trashAwareEntryRepo();
  for (const id of ["a", "b", "c"]) await repo.save(entry(id, { status: "published", publishedAt: NOW }));
  const ids = async (offset?: number) =>
    (await repo.listPublishedForDisplay({ workspaceId: WS, query: { type: "recipe", where: [], sort: { by: "title", dir: "asc" }, limit: 10, ...(offset === undefined ? {} : { offset }) } })).map((row) => row.id);
  assert.deepEqual(await ids(), ["a", "b", "c"]);
  assert.deepEqual(await ids(0), ["a", "b", "c"]);
  assert.deepEqual(await ids(1), ["b", "c"]);
});
