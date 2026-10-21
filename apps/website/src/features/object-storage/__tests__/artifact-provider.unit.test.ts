import assert from "node:assert/strict";
import test from "node:test";

import { createObjectStoreRegistry } from "@jini-ai/core/object-store";
import { providerOk } from "@jini-ai/core/provider-registry";

import { selectArtifactStoreProvider } from "../artifact-provider.js";
import type { LoadedObjectStoreRegistry, TovuObjectStoreProvider } from "../registry.js";

const store = { put: async () => ({ written: true }), get: async () => null, head: async () => null, delete: async () => {} };
const plain: TovuObjectStoreProvider = { create: () => providerOk({ value: store }) };
const capable = (tag: string) => ({ ...plain, tag, createArtifactStore: () => ({ upload: async () => ({ url: tag }), delete: async () => {}, verify: async () => true }) });

function loaded(entries: Array<[id: string, provider: TovuObjectStoreProvider]>): LoadedObjectStoreRegistry {
  const registry = createObjectStoreRegistry<never>({}, { seed: entries.map(([id, provider]) => ({ id, provider })) });
  return { registry: registry as unknown as LoadedObjectStoreRegistry["registry"], refusals: [] };
}

test("no provider with an artifact capability selects nothing", () => {
  assert.equal(selectArtifactStoreProvider({ loaded: loaded([["local", plain]]), preferredId: "" }), undefined);
});

test("the first capable provider is chosen when the site's media choice does not qualify", () => {
  const a = capable("a");
  const chosen = selectArtifactStoreProvider({ loaded: loaded([["local", plain], ["s3_compatible", a], ["r2_native", capable("b")]]), preferredId: "local" });
  assert.equal(chosen?.id, "s3_compatible");
  assert.equal(chosen?.provider, a);
});

test("the site's media choice wins when it can deliver artifacts", () => {
  const b = capable("b");
  const chosen = selectArtifactStoreProvider({ loaded: loaded([["s3_compatible", capable("a")], ["r2_native", b]]), preferredId: "r2_native" });
  assert.deepEqual({ id: chosen?.id, same: chosen?.provider === b }, { id: "r2_native", same: true });
});
