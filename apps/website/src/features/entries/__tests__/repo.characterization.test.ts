import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { recordingKernel } from "#src/__tests__/lane-su-pins/support/recording-kernel";
import { getMediaAccessEvidenceCache } from "../../media/access-evidence.js";
import type { EntryRecord } from "../index.js";
import { EntrySlugConflictError, VersionConflictError } from "../index.js";
import { SqliteEntryRepo } from "../repo.sqlite.js";

/**
 * @file S2b T0: the entry repo's write-completion contract on the unmoved code, before its query body moves to Jini
 * `@jini-ai/cms/entries/sql`. After every `save` and every `transaction`, success OR failure, the media access-evidence
 * caches linked to THIS repository are emptied. The REAL cache is used (`getMediaAccessEvidenceCache`, linked to the
 * repo the way composition links it), seeded with one never-resolved pending entry. Each test names the one-line
 * mutation of `repo.ts` that turns it red; the run's report holds the red output of each.
 */

const WS = "ws-1";
const NOW = "2026-09-23T00:00:00.000Z";

function entry(id: string, overrides: Partial<EntryRecord> = {}): EntryRecord {
  return { id, workspaceId: WS, type: "recipe", slug: `slug-${id}`, status: "draft", title: id, bodyJson: null, fieldsJson: { ext: { site: {} } }, publishedAt: null, createdAt: NOW, updatedAt: NOW, version: 1, ...overrides };
}

/** A repo whose linked access-evidence cache holds one pending entry: the cache is non-empty until the repo says so. */
function repoWithSeededCache(kernel = recordingKernel().kernel) {
  const repo = new SqliteEntryRepo({ store: kernel });
  const cache = getMediaAccessEvidenceCache({ postRepo: {}, entryRepo: repo });
  const seed = () => cache.set("evidence", { expiresAt: Date.now() + 60_000, value: new Promise(() => undefined) });
  seed();
  return { repo, cache, seed, kernel };
}

test("a successful save empties the repository's linked access-evidence cache", async () => {
  const { repo, cache } = repoWithSeededCache();
  await repo.save(entry("e1"));
  assert.equal(cache.size, 0);
});

test("a FAILED save (trashed slug holder, version conflict, taken id) still empties the cache and the error propagates", async () => {
  const { repo, cache, seed, kernel } = repoWithSeededCache();
  await repo.save(entry("held"));
  await kernel.run((db) => db.updateTable("entries").set({ deleted_at: NOW }).where("id", "=", "held").execute());
  seed();
  await assert.rejects(repo.save(entry("other", { slug: "slug-held" })), EntrySlugConflictError);
  assert.equal(cache.size, 0, "slug conflict");
  await repo.save(entry("e2"));
  seed();
  await assert.rejects(repo.save(entry("e2", { version: 2 }), { expectedVersion: 7 }), VersionConflictError);
  assert.equal(cache.size, 0, "version conflict");
  seed();
  await assert.rejects(repo.save(entry("e2", { slug: "slug-other" }), { expectedVersion: null }), VersionConflictError);
  assert.equal(cache.size, 0, "create over a taken id");
});

test("a transaction empties the cache when it resolves and when it rejects; a nested call joins the outer one", async () => {
  const { repo, cache, seed } = repoWithSeededCache();
  assert.equal(await repo.transaction({ fn: async () => "ok" }), "ok");
  assert.equal(cache.size, 0, "resolved");
  seed();
  await assert.rejects(repo.transaction({ fn: async () => { throw new Error("boom"); } }), /boom/);
  assert.equal(cache.size, 0, "rejected");
  seed();
  await repo.transaction({ fn: async () => repo.transaction({ fn: async () => repo.save(entry("nested")) }) });
  assert.equal(cache.size, 0, "nested");
  assert.equal((await repo.findById({ workspaceId: WS, id: "nested" }))?.id, "nested");
});

test("only the writing repository's linked cache is emptied, never another repository's", async () => {
  const kernel = recordingKernel().kernel;
  const first = repoWithSeededCache(kernel);
  const second = repoWithSeededCache(kernel);
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
