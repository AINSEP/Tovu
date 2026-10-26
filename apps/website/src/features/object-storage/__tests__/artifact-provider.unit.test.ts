import assert from "node:assert/strict";
import test from "node:test";

import { createObjectStoreRegistry } from "@jini-ai/core/object-store";
import { providerOk } from "@jini-ai/core/provider-registry";

import { artifactStoreBinding, selectArtifactStoreProvider } from "../artifact-provider.js";
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

test("revoke resolves only the share's saved provider, even when another store now comes first", async () => {
  // A Blob share made before S3 was connected: S3 is now the media choice and first, yet revoke must
  // still reach Blob, and must never fall through to another store when Blob is gone.
  const blob = capable("blob");
  const lookup = credentials(["s3_compatible", "vercel"]);
  const entries: Array<[string, TovuObjectStoreProvider]> = [["s3_compatible", capable("s3")], ["vercel", blob]];
  const chosen = await selectArtifactStoreProvider({ loaded: loaded(entries), preferredId: "s3_compatible", resolveCredential: lookup.resolveCredential }, { savedProvider: "vercel" });
  assert.deepEqual({ id: chosen?.id, same: chosen?.provider === blob }, { id: "vercel", same: true });
  assert.deepEqual(lookup.asked, ["vercel"]);
  const hyphenated = await selectArtifactStoreProvider({ loaded: loaded(entries), preferredId: "", resolveCredential: credentials(["s3_compatible"]).resolveCredential }, { savedProvider: "s3-compatible" });
  assert.equal(hyphenated?.id, "s3_compatible", "the saved provider is the hyphenated connection id");
  const gone = credentials(["s3_compatible"]);
  assert.equal(await selectArtifactStoreProvider({ loaded: loaded(entries), preferredId: "s3_compatible", resolveCredential: gone.resolveCredential }, { savedProvider: "vercel" }), undefined);
  assert.deepEqual(gone.asked, ["vercel"]);
});

test("a store that names its own binding keeps it; otherwise the non-secret storage coordinates bind", () => {
  const credential = { bucket: "b", region: "r", publicUrl: "https://cdn.example" };
  assert.equal(artifactStoreBinding({ store: { binding: "https://store.example" }, credential }), "https://store.example");
  assert.equal(artifactStoreBinding({ store: {}, credential }), JSON.stringify(["b", "r", "", "https://cdn.example"]));
  assert.equal(artifactStoreBinding({ store: {}, credential: { ...credential, endpoint: "https://s3.example" } }), JSON.stringify(["b", "r", "https://s3.example", "https://cdn.example"]));
});
