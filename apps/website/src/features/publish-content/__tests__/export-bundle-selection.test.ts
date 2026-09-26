import assert from "node:assert/strict";
import test from "node:test";

import { CONTENT_HASH_VERSION } from "../content-hash.js";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "../artifact-format.js";
import { selectBundleEntities, type PublishContentExportEnvelope } from "../export-bundle.js";
import { entityKey } from "../planner.js";
import type { PackedEntity } from "../type-registry.js";

/**
 * @file `selectBundleEntities` — the point at which an operator unchecking a row in the Publish
 * Content dialog stops being a UI state and becomes a fact about what the destination is given
 * (owner-directed, 2026-09-19).
 *
 * The property under test is the reason the selection is applied HERE rather than at apply time: a
 * deselected entity must be absent from the bundle, not merely skipped by something downstream. The
 * blob-manifest assertions matter for the same reason — the bytes of a deselected image must not be
 * uploaded to the live site either.
 */

function entity(over: { entityType: string; id: string; requiredBlobs?: readonly string[] }): PackedEntity {
  return {
    entityType: over.entityType,
    id: over.id,
    schemaVersion: 1,
    contentHash: `hash-${over.id}`,
    hashVersion: CONTENT_HASH_VERSION,
    requiredBlobs: over.requiredBlobs ?? [],
    state: { slug: over.id },
  };
}

const ENVELOPE: PublishContentExportEnvelope = {
  artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
  hashVersion: CONTENT_HASH_VERSION,
  sourceLabel: "Tovu",
  entities: [
    entity({ entityType: "media", id: "m1", requiredBlobs: ["sha-a"] }),
    entity({ entityType: "media", id: "m2", requiredBlobs: ["sha-b"] }),
    entity({ entityType: "post", id: "p1" }),
  ],
  blobManifest: ["sha-a", "sha-b"],
  skipped: [],
};

test("keeps exactly the selected entities and drops every other one", () => {
  const narrowed = selectBundleEntities(ENVELOPE, new Set([entityKey("media", "m1"), entityKey("post", "p1")]));

  assert.deepEqual(
    narrowed.entities.map((e) => entityKey(e.entityType, e.id)),
    ["media:m1", "post:p1"]
  );
  assert.equal(narrowed.entities.length, 2, "the deselected entity is absent, not marked");
});

test("recomputes the blob manifest so a deselected asset's bytes are never uploaded", () => {
  const narrowed = selectBundleEntities(ENVELOPE, new Set([entityKey("media", "m1")]));

  assert.deepEqual(narrowed.blobManifest, ["sha-a"]);
  assert.ok(!narrowed.blobManifest.includes("sha-b"), "the deselected media's bytes must not travel");
});

test("an empty selection produces an empty bundle, not the whole corpus", () => {
  // "The operator unchecked everything" and "the operator expressed no preference" are different
  // answers; only the CALLER can tell them apart, so this function never treats one as the other.
  const narrowed = selectBundleEntities(ENVELOPE, new Set());

  assert.deepEqual(narrowed.entities, []);
  assert.deepEqual(narrowed.blobManifest, []);
});

test("a key naming nothing in the bundle adds nothing to it", () => {
  const narrowed = selectBundleEntities(ENVELOPE, new Set(["post:p1", "post:does-not-exist"]));

  assert.deepEqual(
    narrowed.entities.map((e) => e.id),
    ["p1"]
  );
});

test("never narrows `skipped` — a skipped unit was never selectable in the first place", () => {
  const withSkipped: PublishContentExportEnvelope = {
    ...ENVELOPE,
    skipped: [{ entityType: "theme-files", id: "static/x", label: "static/x", reason: "blocked" }],
  };
  const narrowed = selectBundleEntities(withSkipped, new Set(["post:p1"]));
  assert.deepEqual(narrowed.skipped, withSkipped.skipped);
});

test("carries the envelope's own versions and label through untouched", () => {
  const narrowed = selectBundleEntities(ENVELOPE, new Set(["post:p1"]));

  assert.equal(narrowed.artifactFormatVersion, ENVELOPE.artifactFormatVersion);
  assert.equal(narrowed.hashVersion, ENVELOPE.hashVersion);
  assert.equal(narrowed.sourceLabel, ENVELOPE.sourceLabel);
  assert.notEqual(narrowed.entities, ENVELOPE.entities, "the original envelope is never mutated");
  assert.equal(ENVELOPE.entities.length, 3);
});
