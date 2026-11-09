import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED, packAgentPluginDirectory } from "../../lifecycle.js";
import { loadDeployOpsRegistryFromSource } from "#src/features/deployments/deploy-ops/registry";
import { agentPluginSourceDir } from "../../../../../../../development/test-support/agent-plugin-source.mjs";

/** Phase B owner override (2026-10-12): GitHub Actions deploys live in the one `github` plugin (no
 * separate `github-actions` plugin, so no second GitHub switch to confuse), and its skill routes the
 * agent between source control/backup and deploying. Installed digest/activation gating is tested by
 * deployments/deploy-ops/__tests__/installed-deploy-verb.test.ts. */
const CONTENT_ROOT = path.resolve("content/agent-plugins");
// github ships as `@jini-ai/agent-plugins/github` (D-W5); its skill names "the host's server", not Tovu.
const PACKAGE_ROOT = agentPluginSourceDir({ pluginId: "github" });

test("the github plugin contributes the github-actions ops platform and declares it", async () => {
  const manifest = JSON.parse(await readFile(path.join(PACKAGE_ROOT, "plugin.json"), "utf8"));
  assert.deepEqual(manifest.extensions.jini.provides, ["source-control", "site-backup", "deploy-ops:github-actions"]);
  const registry = await loadDeployOpsRegistryFromSource({ pluginId: "github", packageRoot: PACKAGE_ROOT });
  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(registry.list().map(item => item.descriptor.id), ["github-actions"]);
  assert.equal(typeof registry.get("github-actions")?.module.deploy, "function");
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);
  for (const file of ["tovu-deploy-ops.json", "deploy-ops/github-actions.mjs"]) assert.ok(packed.files.includes(file), file);
});

test("there is no separate github-actions plugin, seed id", () => {
  assert.equal(existsSync(path.join(CONTENT_ROOT, "github-actions")), false);
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has("github-actions"), false);
});

test("the github skill routes source control/backup apart from deploying with GitHub Actions", async () => {
  const skill = await readFile(path.join(PACKAGE_ROOT, "skills", "github", "SKILL.md"), "utf8");
  const routing = skill.slice(skill.indexOf("## Which job is this?"), skill.indexOf("## What you are allowed to use"));
  assert.match(routing, /Source control and backup/);
  assert.match(routing, /Deploying the host's server with GitHub Actions/);
  assert.match(routing, /`start a deployment`/);
  assert.match(routing, /platform\s+`github-actions`/);
  assert.match(routing, /`wait for deployment completion`/);
  assert.match(skill, /\| Deploy the host's server through its deploy workflow \| `start a deployment` with platform `github-actions`/);
});
