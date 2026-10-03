import assert from "node:assert/strict";
import test from "node:test";
import { makeSite, sqliteContentSite, WORKSPACE_ID } from "#src/features/publish-content/__tests__/round-trip-harness";
import { prepareTermSync, readTermIds, withTermIds } from "../publish-term-ids.js";
import type Database from "better-sqlite3";

function fixture(t: import("node:test").TestContext) {
  const site = sqliteContentSite();
  const client = (site.db as unknown as { $client: Database.Database }).$client;
  t.after(() => client.close());
  const deps = makeSite(site.ports, "term-sync");
  return { site, deps, ports: site.ports.term!, client };
}

const AT = "2026-09-29T00:00:00Z";
const target = { entityType: "post", entityId: "post-8", principalId: "publisher", contentType: "post" };

test("apply replaces the assignment set and revert restores the exact pre-image using real repositories", async (t) => {
  const h = fixture(t);
  h.client.prepare("INSERT INTO posts (id, workspace_id, title, slug, body_json, status, updated_at, version) VALUES ('post-8', ?, 'Eight', 'eight', '{}', 'published', ?, 1)").run(WORKSPACE_ID, AT);
  await h.site.taxonomies.insert({ id: "tx", name: "Tags", hierarchical: false, status: "active", updatedAt: AT, version: 1 });
  for (const id of ["old", "keep", "new"]) await h.site.terms.insert({ id, taxonomyId: "tx", parentId: null, name: id, status: "active", updatedAt: AT, version: 1 });
  for (const termId of ["old", "keep"]) await h.site.entryTerms.upsert({ contentType: "post", contentId: "post-8", termId, addedAt: AT });
  assert.deepEqual(await readTermIds(h.ports, "post", "post-8"), ["keep", "old"]);
  const sync = await prepareTermSync({ ...target, ports: h.ports, deps: h.deps, wanted: ["new", "keep"] });
  assert.deepEqual(await readTermIds(h.ports, "post", "post-8"), ["keep", "old"], "preparation writes nothing");
  await sync.apply();
  assert.deepEqual(await readTermIds(h.ports, "post", "post-8"), ["keep", "new"]);
  await sync.revert();
  assert.deepEqual(await readTermIds(h.ports, "post", "post-8"), ["keep", "old"]);
});

test("missing and trashed added terms are blocked before any assignment is written", async (t) => {
  const h = fixture(t);
  await h.site.taxonomies.insert({ id: "tx", name: "Tags", hierarchical: false, status: "active", updatedAt: AT, version: 1 });
  await h.site.terms.insert({ id: "dead", taxonomyId: "tx", parentId: null, name: "Dead", status: "trash", updatedAt: AT, version: 1 });
  for (const [id, state] of [["missing", "missing"], ["dead", "in the trash"]]) {
    await assert.rejects(prepareTermSync({ ...target, ports: h.ports, deps: h.deps, wanted: [id] }), {
      name: "PublishContentApplyRowError", rowOutcome: "blocked",
      message: `post 'post-8' is tagged with term '${id}', which is ${state} at this destination — publish or restore that term first`,
    });
    assert.deepEqual(await h.site.entryTerms.listForContent({ contentType: "post", contentId: "post-8" }), []);
  }
});

test("a denied taxonomy permission is blocked and missing authorize/outbox wiring fails explicitly", async (t) => {
  const h = fixture(t);
  const seen: unknown[] = [];
  await assert.rejects(prepareTermSync({ ...target, ports: h.ports, wanted: ["new"], deps: { ...h.deps, authorize: async (p) => { seen.push(p); return { allowed: false, reason: "no-grant" }; } } }), {
    name: "PublishContentApplyRowError", rowOutcome: "blocked", message: "post 'post-8' has category or tag changes, and you need 'admin.taxonomy.manage' to publish them (no-grant)",
  });
  assert.deepEqual(seen, [{ principalId: "publisher", permission: "admin.taxonomy.manage", workspaceId: WORKSPACE_ID }]);
  for (const deps of [{ ...h.deps, authorize: undefined }, { ...h.deps, outbox: undefined }]) {
    await assert.rejects(prepareTermSync({ ...target, ports: h.ports, deps, wanted: ["new"] }), { message: "publish-content: post.apply() requires PublishContentDeps.authorize/outbox to sync term assignments." });
  }
  assert.deepEqual(await h.site.entryTerms.listForContent({ contentType: "post", contentId: "post-8" }), []);
});

test("unwired empty syncs are harmless, unwired nonempty syncs fail, and state copies do not alias term arrays", async () => {
  const deps = makeSite({});
  const noop = await prepareTermSync({ ...target, ports: undefined, deps, wanted: [] });
  await noop.apply(); await noop.revert();
  await assert.rejects(prepareTermSync({ ...target, ports: undefined, deps, wanted: ["t"] }), { message: "publish-content: post 'post-8' carries term assignments, but this deps bag wires no taxonomy ports — wire ports.term." });
  assert.equal(await readTermIds(undefined, "post", "post-8"), undefined);
  const state = Object.freeze({ title: "Eight" });
  const ids = ["term-b", "term-a"];
  const result = withTermIds(state, ids);
  ids.push("term-c");
  assert.deepEqual(result, { title: "Eight", termIds: ["term-b", "term-a"] });
  assert.equal(withTermIds(state, undefined), state);
});

test("an unchanged wired assignment set needs no write authorization or outbox", async (t) => {
  const h = fixture(t);
  await h.site.taxonomies.insert({ id: "tx", name: "Tags", hierarchical: false, status: "active", updatedAt: AT, version: 1 });
  await h.site.terms.insert({ id: "keep", taxonomyId: "tx", parentId: null, name: "Keep", status: "active", updatedAt: AT, version: 1 });
  await h.site.entryTerms.upsert({ contentType: "post", contentId: "post-8", termId: "keep", addedAt: AT });
  const sync = await prepareTermSync({ ...target, ports: h.ports, deps: { ...h.deps, authorize: undefined, outbox: undefined }, wanted: ["keep"] });
  await sync.apply();
  await sync.revert();
  assert.deepEqual(await readTermIds(h.ports, "post", "post-8"), ["keep"]);
  const empty = await prepareTermSync({ ...target, entityId: "untagged", ports: h.ports, deps: { ...h.deps, authorize: undefined, outbox: undefined }, wanted: null });
  await empty.apply();
  assert.equal(await readTermIds(h.ports, "post", "untagged"), undefined);
});
