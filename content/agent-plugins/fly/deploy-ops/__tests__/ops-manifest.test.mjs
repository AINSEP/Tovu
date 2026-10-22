import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadDeployOpsRegistryFromSource, requirePlatform } from "../../../../../apps/website/src/features/deployments/deploy-ops/registry.ts";

// Moved from core deploy-ops/__tests__/registry.test.ts ("real bundled ops manifest loads both contained
// modules"): this package's own platform id and declared hosts, loaded through the generic registry.
test("the fly package's ops manifest loads its contained module with its declared hosts", async () => {
  const registry = await loadDeployOpsRegistryFromSource({ pluginId: "fly", packageRoot: fileURLToPath(new URL("../../", import.meta.url)) });
  assert.deepEqual(registry.list().map(p => ({ id: p.descriptor.id, hosts: p.descriptor.hosts })), [{ id: "fly", hosts: ["api.machines.dev", "api.fly.io"] }]);
  assert.deepEqual(registry.refusals, []);
  assert.throws(() => requirePlatform(registry, "missing"), { message: "Unknown deployment ops platform 'missing'. Choose: fly." });
});
