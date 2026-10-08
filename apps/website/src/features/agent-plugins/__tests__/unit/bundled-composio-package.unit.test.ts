import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { classifyAgentPluginMcpServerTrust } from "../../capability-projection.js";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { parseAgentPluginMcpConfig } from "../../mcp-metadata.js";
import { packAgentPluginDirectory } from "../../lifecycle.js";

/**
 * @file The `composio` bundled Agent Plugin's package is VALID, INSTALLABLE, and says the specific
 * things it was built to say.
 *
 * Composio used to be ~80 files of core code (a project-key store, a Tovu-run per-app OAuth broker,
 * two sealed tables, admin screens). It is now this package alone: Composio's hosted MCP server,
 * Composio Connect, signs the user in by standard MCP OAuth and runs every per-app sign-in itself
 * (`ADS-memory/reports/2026-09-27-composio-agent-plugin-plan.md`). The assertions lock the facts that
 * plan verified against the live server on 2026-09-27, plus the grants the skill must NOT recommend.
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/composio");
const SKILL_PATH = path.join(PACKAGE_ROOT, "skills", "composio", "SKILL.md");

async function readPackageJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(PACKAGE_ROOT, relativePath), "utf8"));
}

test("plugin.json parses with no warnings and carries the words a user would search with", async () => {
  const parsed = parseAgentPluginManifest({ value: await readPackageJson("plugin.json") });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.manifest.name, "composio");
  assert.deepEqual(parsed.warnings, []);
  const keywords = new Set(parsed.manifest.keywords ?? []);
  for (const expected of ["composio", "gmail", "slack", "notion", "connect", "apps"]) {
    assert.ok(keywords.has(expected), `plugin.json keywords must include '${expected}'`);
  }
});

test("mcp.json declares Composio Connect over OAuth, auto-admitted (no secret, no local execution)", async () => {
  const parsed = parseAgentPluginMcpConfig({ value: await readPackageJson("mcp.json") });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.config.serverIds, ["composio"]);
  const server = parsed.config.servers.composio;
  assert.deepEqual(server, { type: "streamable-http", url: "https://connect.composio.dev/mcp", tovuAuthMode: "oauth" });
  if (server) assert.equal(classifyAgentPluginMcpServerTrust(server), "auto-admit");
});

test("the package packs through the real installer's packer, and carries no credential material", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);
  assert.deepEqual([...packed.files].sort(), ["mcp.json", "plugin.json", "skills/composio/SKILL.md"]);
  assert.match(packed.sha256, /^[a-f0-9]{64}$/);

  for (const file of packed.files) {
    const text = await readFile(path.join(PACKAGE_ROOT, file), "utf8");
    assert.doesNotMatch(text, /\b(ak|uak|ck)_[A-Za-z0-9]{12,}/, `${file} must not carry a Composio key`);
    assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9._-]{20,}/, `${file} must not carry a token`);
  }
});

test("SKILL.md names the meta-tools the flow uses and the connection's real tool prefix", async () => {
  const skill = await readFile(SKILL_PATH, "utf8");
  for (const tool of [
    "COMPOSIO_SEARCH_TOOLS",
    "COMPOSIO_GET_TOOL_SCHEMAS",
    "COMPOSIO_MANAGE_CONNECTIONS",
    "COMPOSIO_WAIT_FOR_CONNECTIONS",
    "COMPOSIO_MULTI_EXECUTE_TOOL",
  ]) {
    assert.ok(skill.includes(tool), `SKILL.md must name ${tool}`);
  }
  assert.match(skill, /mcp__composio__/);
  assert.match(skill, /external_mcp_oauth_connect/);
});

test("SKILL.md never recommends granting Composio's remote code-execution tools", async () => {
  const skill = await readFile(SKILL_PATH, "utf8");
  const grants = skill.slice(skill.indexOf("## Grants"), skill.indexOf("## Grants") >= 0 ? undefined : 0);
  assert.ok(grants.length > 0, "SKILL.md must have a '## Grants' section");
  const recommended = grants.slice(0, grants.search(/do not grant/i));
  assert.doesNotMatch(recommended, /COMPOSIO_REMOTE_WORKBENCH|COMPOSIO_REMOTE_BASH_TOOL/);
  assert.match(grants, /do not grant[\s\S]*COMPOSIO_REMOTE_WORKBENCH[\s\S]*COMPOSIO_REMOTE_BASH_TOOL/i);
});

test("SKILL.md says the sign-in is a browser OAuth flow, never an API key pasted into chat", async () => {
  const skill = await readFile(SKILL_PATH, "utf8");
  assert.match(skill, /never ask .*(API key|key)/i);
  assert.match(skill, /sign in/i);
});
