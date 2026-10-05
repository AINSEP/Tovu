import assert from "node:assert/strict";
import test from "node:test";

import { applyReport, makeSite, packAll, plan, registerOnly, roundTrip, WORKSPACE_ID } from "#src/features/publish-content/__tests__/round-trip-harness";
import { InMemoryContentTypeRepo, NoopContentTypeIndexProvisioner, type ContentTypeRecord } from "../index.js";
import { contributeContentTypePublish } from "../publish-content.js";

function contentType(overrides: Partial<ContentTypeRecord> = {}): ContentTypeRecord {
  return {
    workspaceId: WORKSPACE_ID,
    key: "recipe",
    label: "Recipes",
    fields: [{ name: "servings", kind: "integer", required: false, queryable: true }],
    status: "active",
    version: 3,
    tombstonedAt: null,
    ...overrides,
  };
}

async function sites(sourceRows: ContentTypeRecord[]) {
  registerOnly([contributeContentTypePublish()]);
  const sourceRepo = new InMemoryContentTypeRepo();
  for (const row of sourceRows) await sourceRepo.save(row);
  const destRepo = new InMemoryContentTypeRepo();
  const indexProvisioner = new NoopContentTypeIndexProvisioner();
  return {
    source: makeSite({ "content-type": { repo: sourceRepo, indexProvisioner } }, "src"),
    dest: makeSite({ "content-type": { repo: destRepo, indexProvisioner } }, "dst"),
    sourceRepo,
    destRepo,
  };
}

// REGRESSION: fails if publish-content.ts reverts `authorize: adaptLegacyAuthorize({ authorize: gateway.authorize })` to `authorize: gateway.authorize`.
test("content-type publishing: scoped grants survive create, field update and lifecycle re-checks", async () => {
  const { source, dest, sourceRepo, destRepo } = await sites([contentType()]);
  const scopedDest: typeof dest = {
    ...dest,
    authorize: async (params) =>
      params.entityType === "content-type" ? { allowed: true, reason: "matched" } : { allowed: false, reason: "resource_scope_mismatch" },
  };
  await roundTrip(source, scopedDest);
  assert.equal((await destRepo.findByKey({ workspaceId: WORKSPACE_ID, key: "recipe" }))?.status, "active");

  const fields = [...contentType().fields, { name: "cuisine", kind: "text", required: false, queryable: false } as const];
  await sourceRepo.save(contentType({ label: "Dishes", fields, status: "deprecated", version: 4 }));
  let entities = await packAll(source);
  await applyReport(await plan(entities, scopedDest, ["content-type:recipe"]), entities, scopedDest);
  const landed = await destRepo.findByKey({ workspaceId: WORKSPACE_ID, key: "recipe" });
  assert.equal(landed?.label, "Dishes");
  assert.deepEqual(landed?.fields, fields);
  assert.equal(landed?.status, "deprecated");

  await sourceRepo.save(contentType({ label: "Dishes", fields, status: "active", version: 5 }));
  entities = await packAll(source);
  await applyReport(await plan(entities, scopedDest, ["content-type:recipe"]), entities, scopedDest);
  assert.equal((await destRepo.findByKey({ workspaceId: WORKSPACE_ID, key: "recipe" }))?.status, "active");
});

test("content-type round trip: created, then unchanged; seeded widget keys and tombstones never pack", async () => {
  const { source, dest, destRepo } = await sites([
    contentType(),
    contentType({ key: "event", label: "Events", status: "deprecated" }),
    contentType({ key: "widget", label: "Widget" }),
    contentType({ key: "widget_area", label: "Widget area" }),
    contentType({ key: "gone", status: "tombstone", tombstonedAt: "2026-09-01T00:00:00.000Z" }),
  ]);
  const { first, second, entities, destinationPack } = await roundTrip(source, dest);

  assert.deepEqual(first.rows.map((r) => [r.entityId, r.outcome]), [["recipe", "created"], ["event", "created"]]);
  assert.deepEqual(second.rows.map((r) => r.outcome), ["unchanged", "unchanged"]);
  assert.deepEqual(destinationPack.map((e) => e.contentHash), entities.map((e) => e.contentHash));
  assert.equal((await destRepo.findByKey({ workspaceId: WORKSPACE_ID, key: "event" }))?.status, "deprecated");
});

test("content-type: a changed label and fields update in place (forced past the no-baseline conflict)", async () => {
  const { source, dest, sourceRepo, destRepo } = await sites([contentType()]);
  await roundTrip(source, dest);
  const fields = [...contentType().fields, { name: "cuisine", kind: "text", required: false, queryable: false } as const];
  await sourceRepo.save(contentType({ label: "Dishes", fields, status: "deprecated", version: 4 }));

  const entities = await packAll(source);
  const report = await plan(entities, dest, ["content-type:recipe"]);
  await applyReport(report, entities, dest);

  const landed = await destRepo.findByKey({ workspaceId: WORKSPACE_ID, key: "recipe" });
  assert.equal(landed?.label, "Dishes");
  assert.equal(landed?.fields.length, 2);
  assert.equal(landed?.status, "deprecated");
  assert.deepEqual((await plan(await packAll(source), dest)).rows.map((r) => r.outcome), ["unchanged"]);
});

test("content-type: a tombstoned destination type refuses; a key registered after the plan is a conflict", async () => {
  const { source, dest, destRepo } = await sites([contentType()]);
  await destRepo.save(contentType({ status: "tombstone", tombstonedAt: "2026-09-02T00:00:00.000Z" }));
  const blocked = await plan(await packAll(source), dest);
  assert.equal(blocked.rows[0]?.outcome, "blocked");
  assert.match(blocked.rows[0]?.reason ?? "", /permanently removed/);

  const fresh = await sites([contentType()]);
  const entities = await packAll(fresh.source);
  const report = await plan(entities, fresh.dest);
  await fresh.destRepo.save(contentType({ label: "Someone else's" }));
  await assert.rejects(applyReport(report, entities, fresh.dest), (err: Error & { rowOutcome?: string }) => err.rowOutcome === "conflict");
});

// `widget`/`widget_area` are seeded per instance and never pack; an inbound entity naming one must
// not reach them either, or a grant limited to `content-type` could deprecate the widget schema.
test("content-type: an inbound entity for a seeded widget key is refused at precheck and apply, and changes nothing", async () => {
  const { dest, destRepo } = await sites([]);
  await destRepo.save(contentType({ key: "widget", label: "Widget", fields: [] }));
  const handler = contributeContentTypePublish().build(dest);
  const state = { key: "widget", label: "Widget", fields: [], status: "deprecated" };
  const entity = { entityType: "content-type", id: "widget", schemaVersion: 1, contentHash: "x", hashVersion: 1, requiredBlobs: [], state };
  const reason = "content-type 'widget' is seeded on every instance and is never published";

  assert.equal(await handler.precheck(entity), reason);
  await assert.rejects(handler.apply({ entity, expectedVersion: 3, principalId: "operator-1", idempotencyKey: "idem-widget" }), { message: reason });
  assert.equal((await destRepo.findByKey({ workspaceId: WORKSPACE_ID, key: "widget" }))?.status, "active");
});
