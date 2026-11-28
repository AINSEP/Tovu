import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryContentTypeRepo, NoopContentTypeIndexProvisioner, type ContentTypeRecord } from "@jini-ai/cms/content-types";
import { listPublishContentContributors, resetPublishContentContributorsForTests } from "#src/features/publish-content/type-registry";
import { makeSite, WORKSPACE_ID } from "#src/features/publish-content/__tests__/round-trip-harness";
import { installFirstPartyPublishContentTypes } from "../publish-content-manifest.js";

/** @file The host's installed content-type contributor: its own seeded-key rule, not a test copy of it. */

const row = (key: string): ContentTypeRecord => ({ workspaceId: WORKSPACE_ID, key, label: key, fields: [], status: "active", version: 3, tombstonedAt: null });
const entity = (key: string) => ({ entityType: "content-type", id: key, schemaVersion: 1, contentHash: "x", hashVersion: 1, requiredBlobs: [],
  state: { key, label: key, fields: [], status: "deprecated" } });

async function installedContentTypeHandler() {
  resetPublishContentContributorsForTests();
  installFirstPartyPublishContentTypes();
  const contributor = listPublishContentContributors().find(item => item.entityType === "content-type");
  assert.ok(contributor, "the manifest installs a content-type contributor");
  const repo = new InMemoryContentTypeRepo();
  for (const key of ["widget", "widget_area", "recipe"]) await repo.save(row(key));
  const site = makeSite({ "content-type": { repo, indexProvisioner: new NoopContentTypeIndexProvisioner() } }, "dst");
  return { repo, handler: contributor.build({ ...site, mutationActor: { id: "operator-1", kind: "user" } }) };
}

test("the installed content-type contributor refuses both seeded widget keys at precheck and apply, and changes nothing", async () => {
  const { repo, handler } = await installedContentTypeHandler();
  for (const key of ["widget", "widget_area"]) {
    const reason = `content-type '${key}' is seeded on every instance and is never published`;
    assert.equal(await handler.precheck({ entity: entity(key) }), reason);
    await assert.rejects(handler.apply({ entity: entity(key), expectedVersion: 3, principalId: "operator-1", idempotencyKey: `idem-${key}` }), { message: reason });
    assert.equal((await repo.findByKey({ workspaceId: WORKSPACE_ID, key }))?.status, "active");
  }
});

test("the installed content-type contributor lets an ordinary key through precheck", async () => {
  const { handler } = await installedContentTypeHandler();
  assert.equal(await handler.precheck({ entity: entity("recipe") }), null);
});
