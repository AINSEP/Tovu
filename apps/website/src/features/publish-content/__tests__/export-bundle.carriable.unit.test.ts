import assert from "node:assert/strict";
import test from "node:test";

import { includeReferencedEntities, type PublishContentExportEnvelope, type ReferenceHandlers } from "../export-bundle.js";
import { entityKey } from "../planner.js";
import type { PackedEntity } from "../type-registry.js";

/**
 * @file `includeReferencedEntities`' address index (Stryker lane L14 survivors at export-bundle.ts
 * L240-241, L275): only a NON-EMPTY STRING slug is an address, an id wins over a colliding slug, the
 * first slug wins over a later duplicate, and a handler without `references()` contributes nothing.
 */

function packed(entityType: string, id: string, state: Record<string, unknown> = {}): PackedEntity {
  return { entityType, id, schemaVersion: 1, contentHash: `h-${id}`, hashVersion: 1, requiredBlobs: [], state };
}

function envelope(entities: PackedEntity[]): PublishContentExportEnvelope {
  return { artifactFormatVersion: 1, hashVersion: 1, sourceLabel: "src", entities, blobManifest: [], skipped: [] } as unknown as PublishContentExportEnvelope;
}

/** A page whose `refs` state lists the media keys it uses. */
const HANDLERS: ReferenceHandlers = new Map([
  ["page", { references: (e: PackedEntity) => (e.state.refs as string[]).map((key) => ({ entityType: "media", key })) }],
  ["widget", {}],
]);

function carried(refs: string[], media: PackedEntity[]): string[] {
  const page = packed("page", "pg", { refs });
  return includeReferencedEntities(envelope([page]), envelope([page, ...media]), HANDLERS)
    .envelope.entities.filter((e) => e.entityType === "media").map((e) => e.id);
}

test("a non-string or empty slug is never an address", () => {
  assert.deepEqual(carried(["5"], [packed("media", "m1", { slug: 5 })]), []);
  assert.deepEqual(carried(["true"], [packed("media", "m1", { slug: true })]), []);
  assert.deepEqual(carried([""], [packed("media", "m1", { slug: "" })]), []);
  assert.deepEqual(carried(["logo"], [packed("media", "m1", { slug: "logo" })]), ["m1"]);
});

test("an id wins over another entity's colliding slug, and the first slug wins over a later duplicate", () => {
  const byId = packed("media", "logo");
  const slugged = packed("media", "m2", { slug: "logo" });
  assert.deepEqual(carried(["logo"], [slugged, byId]), ["logo"]);
  assert.deepEqual(carried(["dup"], [packed("media", "first", { slug: "dup" }), packed("media", "second", { slug: "dup" })]), ["first"]);
});

test("a type whose handler declares no references() carries nothing (and does not throw)", () => {
  const widget = packed("widget", "w1", { refs: ["m1"] });
  const out = includeReferencedEntities(envelope([widget]), envelope([widget, packed("media", "m1")]), HANDLERS);
  assert.deepEqual(out.envelope.entities.map((e) => e.id), ["w1"]);
  assert.equal(out.includedFor.size, 0);
});
