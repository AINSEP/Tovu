/**
 * @file `createPublishContentSeedHash`'s fail-safe contract (D1, `seed-hash.ts` header): every
 * miss answers `null`, the seed deps are loaded at most once, and a throw anywhere — opening the
 * seed or inspecting a row — reads as "no seed baseline" rather than escaping into the planner.
 * The real-SQLite seed round trip lives in `server/runtime/composition/__tests__/
 * publish-content-seed-hash.test.ts`; this file drives the lookup through hand-written contributors.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPublishContentSeedHash, NO_PUBLISH_CONTENT_SEED_HASH } from "../seed-hash.js";
import {
  registerPublishContentContributor,
  resetPublishContentContributorsForTests,
  type PublishContentDeps,
  type PublishContentHandler,
} from "../type-registry.js";

function registerInspect(entityType: string, inspect: PublishContentHandler["inspect"]): void {
  registerPublishContentContributor({
    entityType,
    dependsOn: [],
    build: () => ({
      entityType,
      schemaVersion: 1,
      permission: "content.write",
      dependsOn: [],
      pack: async function* () {},
      inspect,
      precheck: async () => null,
      apply: async () => ({ changeSetId: "unused" }),
    }),
  });
}

const seedDeps = { workspaceId: "ws-seed" } as PublishContentDeps;

test.beforeEach(() => {
  resetPublishContentContributorsForTests();
});

test("NO_PUBLISH_CONTENT_SEED_HASH answers null for any row", async () => {
  assert.equal(await NO_PUBLISH_CONTENT_SEED_HASH({ entityType: "page", entityId: "p-1" }), null);
});

test("a found seed row answers its inspect() hash; an absent row answers null", async () => {
  registerInspect("page", async (id) => (id === "p-1" ? { hash: "seed-hash-p1" } as never : null));
  const lookup = createPublishContentSeedHash({ loadSeedDeps: () => seedDeps });

  assert.equal(await lookup({ entityType: "page", entityId: "p-1" }), "seed-hash-p1");
  assert.equal(await lookup({ entityType: "page", entityId: "p-missing" }), null);
});

test("loadSeedDeps runs once even across misses, and a throwing loader reads as no seed", async () => {
  registerInspect("page", async () => ({ hash: "never" }) as never);
  let loads = 0;
  const lookup = createPublishContentSeedHash({ loadSeedDeps: () => { loads += 1; throw new Error("seed copy failed"); } });

  assert.equal(await lookup({ entityType: "page", entityId: "p-1" }), null);
  assert.equal(await lookup({ entityType: "page", entityId: "p-2" }), null);
  assert.equal(loads, 1, "a failed open is remembered, never retried per lookup");
});

test("an inspect() that throws against the seed answers null instead of rejecting", async () => {
  registerInspect("page", async () => { throw new Error("seed table missing"); });
  const lookup = createPublishContentSeedHash({ loadSeedDeps: () => seedDeps });

  assert.equal(await lookup({ entityType: "page", entityId: "p-1" }), null);
});

test("a type the registry no longer knows answers null without inspecting anything", async () => {
  let inspected = 0;
  registerInspect("page", async () => { inspected += 1; return { hash: "page-hash" } as never; });
  const lookup = createPublishContentSeedHash({ loadSeedDeps: () => seedDeps });

  assert.equal(await lookup({ entityType: "retired-type", entityId: "r-1" }), null);
  assert.equal(inspected, 0);
});
