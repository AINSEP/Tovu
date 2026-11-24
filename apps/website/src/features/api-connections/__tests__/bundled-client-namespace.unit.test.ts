/** @file `createBundledClientNamespaceReader`: bundled manifests only, and a bad declaration never throws. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { createBundledClientNamespaceReader } from "../bundled-client-namespace.js";

const manifest = (namespace: unknown) => ({ name: "vendor-x", extensions: { jini: { clientNamespace: namespace } } });
const reader = (manifests: Record<string, unknown>) => createBundledClientNamespaceReader({
  pluginIds: new Set(Object.keys(manifests)), readManifest: ({ pluginId }) => manifests[pluginId] ?? null,
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
  const read = createBundledClientNamespaceReader({ pluginIds: new Set(), readManifest: () => { throw new Error("must not read"); } });
  assert.equal(await read({ pluginId: "installed-x" }), undefined);
});
