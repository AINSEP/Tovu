import assert from "node:assert/strict";
import test from "node:test";

import type Database from "better-sqlite3";

import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { applyReport, makeSite, packAll, plan, registerOnly, roundTrip, sqliteContentSite, WORKSPACE_ID } from "#src/features/publish-content/__tests__/round-trip-harness";
import { InMemoryContentLookup } from "#src/features/taxonomy/index";
import { contributeTaxonomyPublish, contributeTermPublish } from "#src/features/taxonomy/publish-content";
import { SqliteEntryTermRepo, SqliteTaxonomyRepo, SqliteTaxonomyRevisionRepo, SqliteTermRepo } from "#src/features/taxonomy/repo.sqlite";
import type { TaxonomyPublishPorts } from "#src/features/publish-content/type-registry";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import type { EntryRecord } from "../../index.js";
import { contributeCollectionEntryPublish } from "../../publish-content.js";
import { SqliteEntryRepo } from "../../repo.sqlite.js";

const at = "2026-09-01T00:00:00.000Z";
const soupBody = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Simmer the tomatoes for twenty minutes." }] }] };

function entry(overrides: Partial<EntryRecord> & { id: string; slug: string }): EntryRecord {
  return {
    workspaceId: WORKSPACE_ID,
    type: "recipe",
    status: "published",
    title: overrides.slug,
    bodyJson: { type: "doc", content: [] },
    fieldsJson: { ext: { site: { servings: 2 } } },
    publishedAt: at,
    createdAt: at,
    updatedAt: at,
    version: 3,
    ...overrides,
  };
}

async function instance() {
  const db = openContentDb(":memory:");
  const entries = new SqliteEntryRepo(db);
  const contentTypes = new InMemoryContentTypeRepo();
  await contentTypes.save({
    workspaceId: WORKSPACE_ID,
    key: "recipe",
    label: "Recipes",
    fields: [{ name: "servings", kind: "integer", required: false, queryable: false }],
    status: "active",
    version: 1,
    tombstonedAt: null,
  });
  const trash = (id: string) =>
    (db as unknown as { $client: Database.Database }).$client.prepare("UPDATE entries SET deleted_at = ? WHERE id = ?").run(at, id);
  // No entry here carries terms; the bag is the real SQLite one so `termIds` reads stay real.
  const terms: TaxonomyPublishPorts = {
    taxonomies: new SqliteTaxonomyRepo({ db, workspaceId: WORKSPACE_ID }),
    terms: new SqliteTermRepo({ db, workspaceId: WORKSPACE_ID }),
    entryTerms: new SqliteEntryTermRepo({ db, workspaceId: WORKSPACE_ID }),
    revisions: new SqliteTaxonomyRevisionRepo({ db, workspaceId: WORKSPACE_ID }),
    stampWatermark: () => {},
    contentLookup: new InMemoryContentLookup({}),
    contentTypeTaxonomyPolicy: { taxonomiesFor: async () => null },
  };
  return { entries, contentTypes, terms, trash };
}

async function sites() {
  registerOnly([contributeCollectionEntryPublish()]);
  const src = await instance();
  const dst = await instance();
  await src.entries.save(entry({ id: "e-soup", slug: "soup", bodyJson: soupBody }));
  await src.entries.save(entry({ id: "e-cake", slug: "cake", status: "draft", publishedAt: null, bodyJson: null }));
  await src.entries.save(entry({ id: "e-gone", slug: "gone" }));
  src.trash("e-gone");
  await src.entries.save(entry({ id: "w-1", slug: "hero", type: "widget", fieldsJson: { ext: { site: {} } } }));
  const site = (i: typeof src, name: string) => makeSite({ "collection-entry": { entries: i.entries, contentTypes: i.contentTypes, terms: i.terms } }, name);
  return { src, dst, source: site(src, "src"), dest: site(dst, "dst") };
}

// REGRESSION: fails if publish-content.ts reverts `authorize: adaptLegacyAuthorize({ authorize: gateway.authorize })` to `authorize: gateway.authorize`.
test("collection-entry publishing: scoped grants survive the entry import re-check", async () => {
  const { src, dst, source, dest } = await sites();
  const scopedDest: typeof dest = {
    ...dest,
    authorize: async (params) =>
      params.entityType === "collection-entry" || params.entityType === "entry"
        ? { allowed: true, reason: "matched" }
        : { allowed: false, reason: "resource_scope_mismatch" },
  };
  await roundTrip(source, scopedDest);
  assert.equal((await dst.entries.findById({ workspaceId: WORKSPACE_ID, id: "e-soup" }))?.status, "published");

  await src.entries.save(entry({ id: "e-soup", slug: "soup", title: "Tomato soup", version: 4 }));
  const entities = await packAll(source);
  await applyReport(await plan(entities, scopedDest, ["collection-entry:e-soup"]), entities, scopedDest);
  assert.equal((await dst.entries.findById({ workspaceId: WORKSPACE_ID, id: "e-soup" }))?.title, "Tomato soup");
});

test("collection-entry round trip: ids, status and publishedAt kept; widgets and trashed rows never pack; then unchanged", async () => {
  const { dst, source, dest } = await sites();
  const { first, second, entities, destinationPack } = await roundTrip(source, dest);

  assert.deepEqual(first.rows.map((r) => [r.entityId, r.outcome]).sort(), [["e-cake", "created"], ["e-soup", "created"]]);
  assert.deepEqual(second.rows.map((r) => r.outcome), ["unchanged", "unchanged"]);
  assert.deepEqual(destinationPack.map((e) => e.contentHash).sort(), entities.map((e) => e.contentHash).sort());
  const soup = await dst.entries.findById({ workspaceId: WORKSPACE_ID, id: "e-soup" });
  assert.equal(soup?.status, "published");
  assert.equal(soup?.publishedAt, at);
  assert.deepEqual(entities.find((e) => e.id === "e-soup")?.state.bodyJson, soupBody);
  assert.deepEqual(soup?.bodyJson, soupBody);
  assert.equal((await dst.entries.findById({ workspaceId: WORKSPACE_ID, id: "e-cake" }))?.status, "draft");
});

test("collection-entry: an edit on the source updates the destination row in place (forced)", async () => {
  const { src, dst, source, dest } = await sites();
  await roundTrip(source, dest);
  await src.entries.save(entry({ id: "e-soup", slug: "soup", title: "Tomato soup", version: 4 }));

  const entities = await packAll(source);
  const report = await plan(entities, dest, ["collection-entry:e-soup"]);
  await applyReport(report, entities, dest);

  const soup = await dst.entries.findById({ workspaceId: WORKSPACE_ID, id: "e-soup" });
  assert.equal(soup?.title, "Tomato soup");
  assert.equal(soup?.version, 2);
  assert.deepEqual((await plan(await packAll(source), dest)).rows.map((r) => r.outcome), ["unchanged", "unchanged"]);
});

test("collection-entry: a trashed destination row with the same id is refused at precheck, not planned as created", async () => {
  const { dst, source, dest } = await sites();
  await dst.entries.save(entry({ id: "e-soup", slug: "soup" }));
  dst.trash("e-soup");

  const report = await plan(await packAll(source), dest);
  const soup = report.rows.find((r) => r.entityId === "e-soup");
  assert.equal(soup?.outcome, "blocked");
  assert.match(soup?.reason ?? "", /trash/i);
});

test("collection-entry: the same (type, slug) under another id is refused and names the holder", async () => {
  const { dst, source, dest } = await sites();
  await dst.entries.save(entry({ id: "e-other", slug: "soup" }));

  const soup = (await plan(await packAll(source), dest)).rows.find((r) => r.entityId === "e-soup");
  assert.equal(soup?.outcome, "blocked");
  assert.match(soup?.reason ?? "", /e-other/);
});

test("collection-entry: a trashed destination row holding the same (type, slug) under another id is refused at precheck", async () => {
  const { dst, source, dest } = await sites();
  await dst.entries.save(entry({ id: "e-old-soup", slug: "soup" }));
  dst.trash("e-old-soup");

  const soup = (await plan(await packAll(source), dest)).rows.find((r) => r.entityId === "e-soup");
  assert.equal(soup?.outcome, "blocked");
  assert.match(soup?.reason ?? "", /^collection-entry 'e-old-soup' is in the trash at this destination and still holds slug 'soup'/);
});

test("collection-entry: the same id created at the destination after the plan is a conflict", async () => {
  const { dst, source, dest } = await sites();
  const entities = await packAll(source);
  const report = await plan(entities, dest);
  await dst.entries.save(entry({ id: "e-cake", slug: "cake" }));
  await dst.entries.save(entry({ id: "e-soup", slug: "soup" }));
  await assert.rejects(applyReport(report, entities, dest), (err: Error & { rowOutcome?: string }) => err.rowOutcome === "conflict");
});

test("collection-entry termIds: packed sorted, synced exactly on the destination, then unchanged; none = omitted", async () => {
  registerOnly([contributeTaxonomyPublish(), contributeTermPublish(), contributeCollectionEntryPublish()]);
  const [src, dst] = [sqliteContentSite(), sqliteContentSite()];
  for (const site of [src, dst]) {
    await site.contentTypes.save({ workspaceId: WORKSPACE_ID, key: "recipe", label: "Recipes", fields: [{ name: "servings", kind: "integer", required: false, queryable: false }], status: "active", version: 1, tombstonedAt: null });
  }
  await src.taxonomies.insert({ id: "tx-diet", name: "Diet", hierarchical: false, status: "active", updatedAt: at, version: 1 });
  for (const id of ["t-veg", "t-quick", "t-hot"]) {
    await src.terms.insert({ id, taxonomyId: "tx-diet", parentId: null, name: id, status: "active", updatedAt: at, version: 1 });
  }
  await src.entries.save(entry({ id: "e-soup", slug: "soup" }));
  await src.entries.save(entry({ id: "e-plain", slug: "plain" }));
  const tag = (termId: string) => src.entryTerms.upsert({ contentType: "recipe", contentId: "e-soup", termId, addedAt: at });
  await tag("t-veg");
  await tag("t-quick");
  const assigned = async () => (await dst.entryTerms.listForContent({ contentType: "recipe", contentId: "e-soup" })).map((r) => r.termId).sort();
  const source = makeSite(src.ports, "src");
  const dest = makeSite(dst.ports, "dst");

  const { entities, second } = await roundTrip(source, dest);
  assert.deepEqual(entities.find((e) => e.id === "e-soup")?.state.termIds, ["t-quick", "t-veg"]);
  assert.equal("termIds" in (entities.find((e) => e.id === "e-plain")?.state ?? {}), false);
  assert.deepEqual(await assigned(), ["t-quick", "t-veg"]);
  assert.deepEqual(second.rows.map((r) => r.outcome).filter((o) => o !== "unchanged"), []);

  await src.entryTerms.remove({ contentType: "recipe", contentId: "e-soup", termId: "t-veg" });
  await tag("t-hot");
  const next = await packAll(source);
  await applyReport(await plan(next, dest, ["collection-entry:e-soup"]), next, dest);
  assert.deepEqual(await assigned(), ["t-hot", "t-quick"]);
  assert.deepEqual((await plan(await packAll(source), dest)).rows.map((r) => r.outcome).filter((o) => o !== "unchanged"), []);
});

// Widgets and widget areas are entries too, but they publish as `widget`/`widget-area` under their
// own permissions. A `collection-entry` entity naming one of their types must not write them: a
// publishing grant limited to `collection-entry` would otherwise edit widgets it never named.
async function widgetSmuggle() {
  registerOnly([contributeCollectionEntryPublish()]);
  const dst = await instance();
  await dst.contentTypes.save({ workspaceId: WORKSPACE_ID, key: "widget", label: "Widgets", fields: [], status: "active", version: 1, tombstonedAt: null });
  const dest = makeSite({ "collection-entry": { entries: dst.entries, contentTypes: dst.contentTypes, terms: dst.terms } }, "dst");
  const handler = contributeCollectionEntryPublish().build(dest);
  const state = { type: "widget", slug: "evil", title: "Evil", status: "published", bodyJson: null, fieldsJson: { ext: { site: {} } } };
  const entity = { entityType: "collection-entry", id: "w-evil", schemaVersion: 2, contentHash: "x", hashVersion: 1, requiredBlobs: [], state };
  return { dst, handler, entity };
}

test("collection-entry: an entity of a widget type is refused at precheck", async () => {
  const { handler, entity } = await widgetSmuggle();
  assert.equal(
    await handler.precheck(entity),
    "collection-entry 'w-evil' has type 'widget', which is a widget type and publishes on its own, not as a collection entry"
  );
});

test("collection-entry: an entity of a widget type is refused at apply and writes nothing", async () => {
  const { dst, handler, entity } = await widgetSmuggle();
  await assert.rejects(handler.apply({ entity, expectedVersion: undefined, principalId: "operator-1", idempotencyKey: "idem-widget" }), {
    message: "collection-entry 'w-evil' has type 'widget', which is a widget type and publishes on its own, not as a collection entry",
  });
  assert.equal(await dst.entries.findById({ workspaceId: WORKSPACE_ID, id: "w-evil" }), null);
});


test("collection-entry: a tombstoned owning type blocks planning and no entry is applied", async () => {
  const { dst, source, dest } = await sites();
  const owner = await dst.contentTypes.findByKey({ workspaceId: WORKSPACE_ID, key: "recipe" });
  assert.ok(owner);
  await dst.contentTypes.save({ ...owner, status: "tombstone", tombstonedAt: at, version: owner.version + 1 });
  const entities = await packAll(source);
  const report = await plan(entities, dest);
  assert.deepEqual(report.rows.map((r) => [r.entityId, r.outcome, r.reason]).sort(), [
    ["e-cake", "blocked", "content-type 'recipe' is permanently removed at this destination and cannot be republished over"],
    ["e-soup", "blocked", "content-type 'recipe' is permanently removed at this destination and cannot be republished over"],
  ]);
  await applyReport(report, entities, dest);
  assert.deepEqual(await dst.entries.listByWorkspaceExcludingTypes({ workspaceId: WORKSPACE_ID, excludeTypes: [] }), []);
});
