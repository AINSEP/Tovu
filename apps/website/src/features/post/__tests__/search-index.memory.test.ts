import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryPostRepo } from "../repo.memory.js";
import { InMemoryPostSearchIndex } from "../search-index.memory.js";
import { sqlitePostSearch } from "../search-index.sqlite.js";
import type { PostRecord } from "../post.js";

function post(id: string, workspaceId = "ws"): PostRecord {
  return { id, workspaceId, title: "Findable", slug: id, status: "published", kind: "post", version: 1,
    bodyFormat: "doc", bodyHtml: null, bodyJson: { type: "doc", content: [] }, updatedAt: "2026-10-01T12:00:00.000Z" };
}
const query = { workspaceId: "ws", terms: ["findable"], limit: 10 };

test("a hard deletion removes old FTS entries on the very next search without hiding surviving neighbors", async () => {
  const repo = new InMemoryPostRepo([post("removed"), post("kept")]);
  const search = new InMemoryPostSearchIndex(repo);
  assert.deepEqual((await search.search(query)).map((h) => h.id).sort(), ["kept", "removed"]);
  await repo.hardDelete({ workspaceId: "ws", id: "removed" });
  assert.deepEqual((await search.search(query)).map((h) => h.id), ["kept"]);
  await repo.hardDelete({ workspaceId: "ws", id: "kept" });
  assert.deepEqual(await search.search(query), []);
});

test("one search index can alternate workspaces and handle concurrent calls without swapping their hits", { timeout: 10000 }, async (t) => {
  const repo = new InMemoryPostRepo([post("own"), post("foreign", "other")]);
  const search = new InMemoryPostSearchIndex(repo);
  for (const workspaceId of ["ws", "other", "ws"]) {
    assert.deepEqual((await search.search({ ...query, workspaceId })).map((h) => h.id), [workspaceId === "ws" ? "own" : "foreign"]);
  }
  const original = sqlitePostSearch.search.bind(sqlitePostSearch);
  let entered!: () => void;
  let release!: () => void;
  const firstEntered = new Promise<void>((resolve) => { entered = resolve; });
  const holdFirst = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  // F7.1: keep the first real query's transaction open while a second workspace requests search.
  t.mock.method(sqlitePostSearch, "search", async (kernel, request) => {
    const call = ++calls;
    const hits = await original(kernel, request);
    if (call === 1) { entered(); await holdFirst; }
    return hits;
  });
  const ownPending = search.search(query);
  await firstEntered;
  const foreignPending = search.search({ ...query, workspaceId: "other" });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1, "the second workspace must not query while the first mirror transaction is open");
  } finally {
    release();
    // Settle both callers even if the in-flight assertion fails (F7.1).
    await Promise.all([ownPending, foreignPending]);
  }
  const [own, foreign] = await Promise.all([ownPending, foreignPending]);
  assert.deepEqual(own.map((h) => h.id), ["own"]);
  assert.deepEqual(foreign.map((h) => h.id), ["foreign"]);
});

test("a repository read failure propagates instead of returning stale hits, and a retry reads fresh state", async (t) => {
  const repo = new InMemoryPostRepo([post("first")]);
  const search = new InMemoryPostSearchIndex(repo);
  assert.deepEqual((await search.search(query)).map((h) => h.id), ["first"]);
  const failure = new Error("post read failed");
  const stub = t.mock.method(repo, "list", async () => { throw failure; });
  await assert.rejects(search.search(query), (error) => error === failure);
  stub.mock.restore();
  await repo.hardDelete({ workspaceId: "ws", id: "first" });
  await repo.save(post("replacement"));
  assert.deepEqual((await search.search(query)).map((h) => h.id), ["replacement"]);
});

// F2.6/F6.2: run the real mirror and FTS query against an HTML page, whose doc placeholder is empty.
test("BUG: the memory index finds HTML page body prose instead of indexing only its empty doc placeholder", async () => {
  const repo = new InMemoryPostRepo([{ ...post("html-page"), kind: "page", title: "Studio", slug: "studio",
    bodyFormat: "html", bodyHtml: "<p>Needleword lives in the page body.</p>" }]);
  const search = new InMemoryPostSearchIndex(repo);
  assert.deepEqual((await search.search({ ...query, terms: ["studio"] })).map((hit) => hit.id), ["html-page"]);
  assert.deepEqual((await search.search({ ...query, terms: ["needleword"] })).map((hit) => hit.id), ["html-page"]);
});
