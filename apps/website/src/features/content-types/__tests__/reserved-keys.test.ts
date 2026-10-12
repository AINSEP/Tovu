/** @file Owner request 2026-10-11: collection keys cannot own reserved public routes. */
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import {
  registerContentType, buildContentTypesRegistrations, InMemoryContentTypeRepo,
  NoopContentTypeIndexProvisioner, ReservedContentTypeKeyError,
} from "../index.js";

const workspaceId = "reserved-content-types";
const clock = { nowMs: () => Date.parse("2026-10-11T00:00:00Z") };

for (const key of ["admin", "api"]) {
  test(`content-type ${key} is refused by direct and assistant writes without persistence`, async () => {
    const repo = new InMemoryContentTypeRepo();
    const indexProvisioner = new NoopContentTypeIndexProvisioner();
    const authorize = async () => ({ allowed: true, reason: "matched" });
    const outbox = new InMemoryOutbox();
    const ids = { newId: () => "reserved-type" };
    const input = { workspaceId, actorId: "owner", key, label: "Reserved", fields: [] };
    const result = await registerContentType({ deps: { repo, clock, ids, authorize, indexProvisioner, outbox }, input });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("reserved key was accepted");
    assert.ok(result.error instanceof ReservedContentTypeKeyError);
    assert.equal(result.error.message, `key '${key}' is reserved for a host route`);

    const tool = buildContentTypesRegistrations({ workspaceId, clock, idGen: ids, authorize, outbox, contentTypeRepo: repo, contentTypeIndexProvisioner: indexProvisioner })
      .find(tool => tool.descriptor.id === "collections_content_type_define");
    assert.ok(tool);
    await assert.rejects(tool.handler({ executionId: "reserved", principal: { id: "owner" }, run: { id: "run" }, input: { key, label: "Reserved", fields: [] }, signal: new AbortController().signal }), error => {
      assert.ok(error instanceof ReservedContentTypeKeyError);
      assert.equal(error.message, `key '${key}' is reserved for a host route`);
      return true;
    });
    assert.equal(await repo.findByKey({ workspaceId, key }), null);
    assert.deepEqual(repo.listRevisions(), []);
  });
}

test("a content-type key sharing only the reserved prefix remains available", async () => {
  const repo = new InMemoryContentTypeRepo();
  const result = await registerContentType({
    deps: { repo, clock, ids: { newId: () => "type" }, authorize: async () => ({ allowed: true, reason: "matched" }), indexProvisioner: new NoopContentTypeIndexProvisioner(), outbox: new InMemoryOutbox() },
    input: { workspaceId, actorId: "owner", key: "apiary", label: "Apiary", fields: [] },
  });
  assert.equal(result.ok, true);
  assert.equal((await repo.findByKey({ workspaceId, key: "apiary" }))?.key, "apiary");
});
