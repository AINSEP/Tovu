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

/** Credential lookup that answers only for `credentialed` ids and records the order it was asked in. */
function credentials(credentialed: string[]): { asked: string[]; resolveCredential: (required: { id: string }) => Promise<string | undefined> } {
  const asked: string[] = [];
  return { asked, resolveCredential: async ({ id }) => { asked.push(id); return credentialed.includes(id) ? `cred-${id}` : undefined; } };
}

test("no provider with an artifact capability selects nothing and asks for no credential", async () => {
  const lookup = credentials(["local"]);
  assert.equal(await selectArtifactStoreProvider({ loaded: loaded([["local", plain]]), preferredId: "", resolveCredential: lookup.resolveCredential }), undefined);
  assert.deepEqual(lookup.asked, []);
});

test("the first capable provider is chosen when the site's media choice does not qualify", async () => {
  const a = capable("a");
  const lookup = credentials(["store_a", "store_b"]);
  const chosen = await selectArtifactStoreProvider({ loaded: loaded([["local", plain], ["store_a", a], ["store_b", capable("b")]]), preferredId: "local", resolveCredential: lookup.resolveCredential });
  assert.deepEqual({ id: chosen?.id, same: chosen?.provider === a, credential: chosen?.credential }, { id: "store_a", same: true, credential: "cred-store_a" });
  assert.deepEqual(lookup.asked, ["store_a"]);
});

test("the site's media choice wins when it can deliver artifacts and has a credential", async () => {
  const b = capable("b");
  const chosen = await selectArtifactStoreProvider({ loaded: loaded([["store_a", capable("a")], ["store_b", b]]), preferredId: "store_b", resolveCredential: credentials(["store_a", "store_b"]).resolveCredential });
  assert.deepEqual({ id: chosen?.id, same: chosen?.provider === b }, { id: "store_b", same: true });
});

test("a capable provider without a credential is skipped for the next one that has one, preferred first", async () => {
  const lookup = credentials(["store_c"]);
  const chosen = await selectArtifactStoreProvider({ loaded: loaded([["store_a", capable("a")], ["store_b", capable("b")], ["store_c", capable("c")]]), preferredId: "store_b", resolveCredential: lookup.resolveCredential });
  assert.equal(chosen?.id, "store_c");
  assert.deepEqual(lookup.asked, ["store_b", "store_a", "store_c"]);
  assert.equal(await selectArtifactStoreProvider({ loaded: loaded([["store_a", capable("a")]]), preferredId: "", resolveCredential: credentials([]).resolveCredential }), undefined);
});
