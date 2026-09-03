import assert from "node:assert/strict";
import test from "node:test";

import { createRevertRegistry, type EntityReverter } from "../appliers.js";

test("createRevertRegistry allows registering and resolving entity reverters", async () => {
  const registry = createRevertRegistry();

  assert.equal(registry.resolve("post", "update"), undefined);

  const mockReverter: EntityReverter = {
    currentVersion: async () => 1,
    applyInverse: async () => {},
  };

  registry.register("post", "update", mockReverter);

  assert.equal(registry.resolve("post", "update"), mockReverter);
  assert.equal(registry.resolve("post", "delete"), undefined);
  assert.equal(registry.resolve("widget", "update"), undefined);

  const updatedReverter: EntityReverter = {
    currentVersion: async () => 2,
    applyInverse: async () => {},
  };

  registry.register("post", "update", updatedReverter);
  assert.equal(registry.resolve("post", "update"), updatedReverter);
});
