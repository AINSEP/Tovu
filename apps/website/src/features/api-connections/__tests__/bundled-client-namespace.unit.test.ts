/** @file `createBundledClientNamespaceReader`: bundled manifests only, and a bad declaration never throws. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { readAgentPluginMetadata } from "@jini-ai/agent-plugins/manifest";
import { createBundledClientNamespaceReader } from "@jini-ai/integrations/api-connections/bundled-client-namespace";

/** The host's real manifest projection, as `agent-plugin-connections.ts` supplies it. */
const readClientNamespace = ({ value }: { readonly value: unknown }) => readAgentPluginMetadata({ value }).metadata.clientNamespace;
const manifest = (namespace: unknown) => ({ name: "vendor-x", extensions: { jini: { clientNamespace: namespace } } });
const reader = (manifests: Record<string, unknown>) => createBundledClientNamespaceReader({
  pluginIds: new Set(Object.keys(manifests)), readManifest: ({ pluginId }) => manifests[pluginId] ?? null, readClientNamespace,
});

test("a bundled plugin's manifest declares its prefix", async () => {
  assert.equal(await reader({ "vendor-x": manifest("VENDORX_") })({ pluginId: "vendor-x" }), "VENDORX_");
});

test("a bundled plugin that declares none, or declares a malformed one, gets undefined", async () => {
  const read = reader({ "vendor-x": manifest("lower"), plain: { name: "plain" } });
  assert.equal(await read({ pluginId: "vendor-x" }), undefined);
  assert.equal(await read({ pluginId: "plain" }), undefined);
});

test("an id that is not bundled is never read", async () => {
  const read = createBundledClientNamespaceReader({ pluginIds: new Set(), readManifest: () => { throw new Error("must not read"); }, readClientNamespace });
  assert.equal(await read({ pluginId: "installed-x" }), undefined);
});

test("an installed id beside bundled ones never reaches the host manifest reader", async () => {
  // An installed plugin cannot select client-setting names, so its manifest must not even be read.
  const reads: string[] = [];
  const read = createBundledClientNamespaceReader({
    pluginIds: new Set(["vendor-x"]), readManifest: ({ pluginId }) => { reads.push(pluginId); return manifest("VENDORX_"); }, readClientNamespace,
  });
  assert.equal(await read({ pluginId: "installed-x" }), undefined);
  assert.deepEqual(reads, []);
});
