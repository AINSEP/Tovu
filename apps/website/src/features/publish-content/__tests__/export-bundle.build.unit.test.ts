import assert from "node:assert/strict";
import test from "node:test";

import { CONTENT_HASH_VERSION } from "../content-hash.js";
import { buildExportBundle, packAuthorizedEntities } from "../export-bundle.js";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "../artifact-format.js";
import {
  listPublishContentContributors,
  registerPublishContentContributor,
  resetPublishContentContributorsForTests,
  type PackedEntity,
  type PublishContentDeps,
  type PublishContentHandler,
} from "../type-registry.js";

/**
 * @file `packAuthorizedEntities` and `buildExportBundle` through the REAL module registry (Stryker
 * lane L14 no-coverage range): registered contributors are built fresh per call, the per-type gate
 * applies, `blobManifest` is the de-duplicated union in first-seen order, and `skipped` only carries
 * authorized types' `listSkipped()`.
 */

function entity(entityType: string, id: string, requiredBlobs: string[]): PackedEntity {
  return { entityType, id, schemaVersion: 1, contentHash: `h-${id}`, hashVersion: 1, requiredBlobs, state: {} };
}

function handler(over: Partial<PublishContentHandler> & { entityType: string; permission: string }): PublishContentHandler {
  return {
    schemaVersion: 1,
    dependsOn: [],
    async *pack() {},
    async inspect() { return null; },
    async precheck() { return null; },
    async apply() { return { changeSetId: "cs" }; },
    ...over,
  };
}

const deps = {} as PublishContentDeps;

function withRegistry(t: { after(fn: () => void): void }, handlers: PublishContentHandler[]): { builds: number } {
  const saved = [...listPublishContentContributors()];
  t.after(() => {
    resetPublishContentContributorsForTests();
    for (const c of saved) registerPublishContentContributor(c);
  });
  resetPublishContentContributorsForTests();
  const counter = { builds: 0 };
  for (const h of handlers) {
    registerPublishContentContributor({ entityType: h.entityType, dependsOn: [], build: () => (counter.builds++, h) });
  }
  return counter;
}

const media = handler({
  entityType: "media", permission: "media.write",
  async *pack() { yield entity("media", "m1", ["b", "a"]); yield entity("media", "m2", ["a", "c"]); },
  async listSkipped() { return [{ entityType: "media", id: "m9", reason: "too-large" }] as never; },
});
const secret = handler({
  entityType: "secret", permission: "secret.write",
  async *pack() { yield entity("secret", "s1", ["z"]); },
  async listSkipped() { return [{ entityType: "secret", id: "s9", reason: "x" }] as never; },
});
const post = handler({ entityType: "post", permission: "content.write", async *pack() { yield entity("post", "p1", []); } });

const authorize = async ({ permission }: { permission: string }) => ({ allowed: permission !== "secret.write" });

test("packAuthorizedEntities streams only authorized registered types, reading the registry fresh each call", async (t) => {
  const counter = withRegistry(t, [media, secret]);
  const ids = async () => {
    const out: string[] = [];
    for await (const e of packAuthorizedEntities({ workspaceId: "ws", principalId: "p", authorize, publishContentDeps: deps })) out.push(e.id);
    return out;
  };
  assert.deepEqual(await ids(), ["m1", "m2"]);
  registerPublishContentContributor({ entityType: "post", dependsOn: [], build: () => post });
  assert.deepEqual(await ids(), ["m1", "m2", "p1"], "a contributor registered after the first call is visible to the next");
  assert.equal(counter.builds, 4, "each call rebuilds every registered contributor (2 + 2)");
});

test("buildExportBundle: versions, sourceLabel, entities, de-duplicated blobManifest and authorized-only skipped", async (t) => {
  withRegistry(t, [media, secret, post]);
  const bundle = await buildExportBundle({ workspaceId: "ws", principalId: "p", authorize, publishContentDeps: deps, sourceLabel: "Staging" });
  assert.deepEqual(bundle, {
    artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
    hashVersion: CONTENT_HASH_VERSION,
    sourceLabel: "Staging",
    entities: [entity("media", "m1", ["b", "a"]), entity("media", "m2", ["a", "c"]), entity("post", "p1", [])],
    blobManifest: ["b", "a", "c"],
    skipped: [{ entityType: "media", id: "m9", reason: "too-large" }],
  });
});

test("buildExportBundle with nothing authorized is an empty, still-versioned bundle", async (t) => {
  withRegistry(t, [media, secret]);
  const bundle = await buildExportBundle({ workspaceId: "ws", principalId: "p", authorize: async () => ({ allowed: false }), publishContentDeps: deps, sourceLabel: "" });
  assert.deepEqual(bundle.entities, []);
  assert.deepEqual(bundle.blobManifest, []);
  assert.deepEqual(bundle.skipped, []);
  assert.equal(bundle.sourceLabel, "");
});
