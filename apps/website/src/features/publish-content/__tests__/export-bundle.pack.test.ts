import assert from "node:assert/strict";
import test from "node:test";

import { packHandlerEntities } from "../export-bundle.js";
import type { PackedEntity, PublishContentHandler } from "../type-registry.js";

/** @file The per-type authorization gate and packed-metadata check of `packAuthorizedEntities`,
 *  driven through its handler-list seam with hand-written handlers. */

function entity(entityType: string, id: string, schemaVersion = 1): PackedEntity {
  return { entityType, id, schemaVersion, contentHash: `hash-${id}`, hashVersion: 1, requiredBlobs: [], state: {} };
}

function fakeHandler(over: Partial<PublishContentHandler> & { entityType: string; permission: string }): PublishContentHandler {
  return {
    schemaVersion: 1,
    dependsOn: [],
    async *pack() {},
    async inspect() { return null; },
    async precheck() { return null; },
    async apply() { return { changeSetId: "cs1" }; },
    ...over,
  };
}

async function collect(handlers: PublishContentHandler[], allowed: ReadonlySet<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const packed of packHandlerEntities({ handlers, authorize: async ({ permission }) => ({ allowed: allowed.has(permission) }), workspaceId: "ws1", principalId: "p1" })) {
    out.push(`${packed.entityType}:${packed.id}`);
  }
  return out;
}

test("a type the principal may not write is left out of the bundle, without failing the export", async () => {
  let unauthorizedPacked = false;
  const handlers = [
    fakeHandler({ entityType: "post", permission: "content.write", async *pack() { yield entity("post", "p1"); } }),
    fakeHandler({ entityType: "theme-files", permission: "theme.set", async *pack() { unauthorizedPacked = true; yield entity("theme-files", "t1"); } }),
  ];
  assert.deepEqual(await collect(handlers, new Set(["content.write"])), ["post:p1"]);
  assert.equal(unauthorizedPacked, false, "an unauthorized type is never even packed");
});

test("a handler that packs another type's entity, or a different schema version, fails the export loudly", async () => {
  const wrongType = [fakeHandler({ entityType: "post", permission: "content.write", async *pack() { yield entity("page", "x"); } })];
  await assert.rejects(collect(wrongType, new Set(["content.write"])), /handler 'post' packed incompatible entity metadata \(entityType 'page', schema version 1; expected 'post' version 1\)/);
  const wrongVersion = [fakeHandler({ entityType: "post", permission: "content.write", async *pack() { yield entity("post", "x", 2); } })];
  await assert.rejects(collect(wrongVersion, new Set(["content.write"])), /schema version 2; expected 'post' version 1/);
});
