import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { packAgentPluginDirectory } from "../../../../apps/website/src/features/agent-plugins/lifecycle.ts";
import { parseAgentPluginMcpConfig } from "../../../../apps/website/src/features/agent-plugins/mcp-metadata.ts";
import { DEPLOY_TARGETS_FILENAME } from "../../../../apps/website/src/features/deployments/deploy-targets/registry.ts";

/**
 * @file Moved from core (`apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-package.unit.test.ts`)
 * into the Fly plugin: vendor tests live with the vendor. The Fly package (the `deploy` plugin's
 * server successor since the 2026-10-12 split) is valid, declares no MCP servers, names every hosting
 * plugin from its skill, and packs without a publish target of its own. Same assertions as before.
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

/** The hosting plugins split out of `deploy` (2026-10-12); the Fly skill must point at each. */
const HOST_PLUGIN_IDS = ["github-pages", "vercel", "netlify", "cloudflare", "cloudflare", "s3-compatible"];

async function readPackageJson(relativePath) {
  return JSON.parse(await readFile(path.join(PACKAGE_ROOT, relativePath), "utf8"));
}

test("plugin.json parses under the Agent Plugins v1.0.0 validator with no warnings", async () => {
  const parsed = parseAgentPluginManifest({ value: await readPackageJson("plugin.json") });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "fly");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
});

test("mcp.json declares ZERO servers — hosts run in-process through the deploy-target registry", async () => {
  const parsed = parseAgentPluginMcpConfig({ value: await readPackageJson("mcp.json") });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok ? parsed.config.serverIds : ["unreachable"], []);
});

test("the eponymous skill exists, names the server host it deploys to, and points at every hosting plugin", async () => {
  const skill = await readFile(path.join(PACKAGE_ROOT, "skills", "fly", "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: fly\n/);
  assert.match(skill, /fly\.io/);
  for (const pluginId of HOST_PLUGIN_IDS) assert.ok(skill.includes(`\`${pluginId}\``), pluginId);
});

test("the package packs through the real packer, and ships no publish target of its own any more", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);
  for (const file of ["plugin.json", "mcp.json", "skills/fly/SKILL.md"]) {
    assert.ok(packed.files.includes(file), `${file} must survive packing`);
  }
  // Every host is its own plugin (2026-10-12); a leftover entry here would drop that host for everyone.
  assert.equal(packed.files.includes(DEPLOY_TARGETS_FILENAME), false);
  assert.deepEqual(packed.files.filter((file) => file.startsWith("targets/")), []);
});
