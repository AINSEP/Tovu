import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file `PLUGIN_UNINSTALL`'s permission gate (`admin.plugins.enable`). `uninstall.integration.test.ts`
 * proves every outcome as the wildcard owner, so dropping the route's `authorizeOrRespond` call —
 * or gating it on the wrong permission — shipped green: any signed-in user could move a site plugin
 * shared by every workspace to the Trash. Same real on-disk fixture shape as that file.
 */

async function writeRealPluginFixture(installDir: string, id: string): Promise<void> {
  const versionDir = path.join(installDir, id, "1.0.0");
  await mkdir(path.join(versionDir, "server"), { recursive: true });
  const entryContents = "export default { definition: { setup() {} } };\n";
  await writeFile(path.join(versionDir, "server", "index.mjs"), entryContents, "utf8");
  await writeFile(
    path.join(versionDir, "tovu.plugin.json"),
    JSON.stringify({
      id,
      name: id,
      version: "1.0.0",
      sdkRange: "^0.1.0 || ^0.2.0",
      engine: 1,
      tier: "tier-3",
      capabilities: [],
      hooks: [],
      fields: [],
      integrity: { "server/index.mjs": `sha256-${createHash("sha256").update(entryContents, "utf8").digest("hex")}` },
    }),
    "utf8"
  );
}

async function existsOnDisk(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

test("PLUGIN_UNINSTALL authz: a signed-in principal without admin.plugins.enable is 403 and the plugin stays installed; the owner can still remove it", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-uninstall-authz-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installDir = path.join(root, "plugins");
  const pluginId = "authz-guarded-plugin";
  await writeRealPluginFixture(installDir, pluginId);

  const deps = createRouteDeps({ installDir });
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const bare = await loginAsBarePrincipal(deps, baseUrl);
  const pluginUrl = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/plugins/${pluginId}`;

  const denied = await fetch(pluginUrl, { method: "DELETE", headers: { cookie: bare } });
  const deniedRaw = await denied.text();
  assert.equal(denied.status, 403, deniedRaw);
  const body = JSON.parse(deniedRaw) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "admin.plugins.enable");
  assert.equal(await existsOnDisk(path.join(installDir, pluginId)), true, "a refused uninstall must not move the plugin's files");

  // Control: the same request from the owner succeeds, so the 403 above came from the gate and not
  // from a fixture the route could never have removed.
  const allowed = await fetch(pluginUrl, { method: "DELETE", headers: { cookie } });
  const allowedRaw = await allowed.text();
  assert.equal(allowed.status, 200, allowedRaw);
  assert.deepEqual(JSON.parse(allowedRaw), { pluginId, trashed: true });
});
