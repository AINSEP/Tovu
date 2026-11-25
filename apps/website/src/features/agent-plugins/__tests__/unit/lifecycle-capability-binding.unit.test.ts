import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  mcpServerTrustClassifier,
  PackagePathViolation,
  readInstalledMcpServerIds,
  readInstalledMcpServers,
  readInstalledSkillMarkdown,
} from "../../lifecycle.js";

/**
 * @file Host binding of Jini's capability projection (`@jini-ai/agent-plugins/lifecycle`
 * `capability-projection.ts`, pinned there by `capability-projection-host-contract.unit.test.ts`).
 * These cases cover only what this binding adds: the explicit-root exports callers import, the
 * positional trust classifier injected into federation, and this host's `[agent-plugins]` log prefix
 * for installed-metadata warnings.
 */

test("explicit-root readInstalledSkillMarkdown reads contained files and refuses an outside symlink", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-capability-binding-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "package");
  await mkdir(path.join(root, "skills"), { recursive: true });
  await writeFile(path.join(root, "skills", "A.md"), "# A");
  await writeFile(path.join(dir, "outside.md"), "outside secret");
  await symlink(path.join(dir, "outside.md"), path.join(root, "skills", "SKILL.md"));
  assert.equal(await readInstalledSkillMarkdown({ packageRoot: root, skillPath: "skills/A.md" }), "# A");
  await assert.rejects(readInstalledSkillMarkdown({ packageRoot: root, skillPath: "skills/SKILL.md" }), PackagePathViolation);
  await assert.rejects(() => readInstalledSkillMarkdown({ packageRoot: root, skillPath: "../../../etc/passwd" }), PackagePathViolation);
});

test("the injected positional classifier: stdio requires confirmation, remote transports auto-admit", () => {
  assert.equal(mcpServerTrustClassifier({ type: "stdio" }), "requires-confirmation");
  assert.equal(mcpServerTrustClassifier({ type: "streamable-http" }), "auto-admit");
  assert.equal(mcpServerTrustClassifier({ type: "sse" }), "auto-admit");
});

test("explicit-root MCP readers fail open to nothing when mcp.json is missing", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-capability-binding-mcp-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await readInstalledMcpServerIds({ packageRoot: root }), []);
  assert.deepEqual(await readInstalledMcpServers({ packageRoot: root }), {});
});

test("Tovu’s installed MCP owner reads legacy aliases without changing canonical output", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "portable-mcp-warning-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "plugin.json"), JSON.stringify({
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "example", version: "1.0.0", extensions: { jini: { id: "publisher/example" } },
  }));
  await writeFile(path.join(root, "mcp.json"), JSON.stringify({
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { remote: { type: "streamable-http", url: "https://example.test/mcp", tovuAuthMode: "oauth" } },
  }));
  const warnings = t.mock.method(console, "warn", () => {});
  const servers = await readInstalledMcpServers({ packageRoot: root });
  assert.deepEqual(servers.remote, { type: "streamable-http", url: "https://example.test/mcp", authMode: "oauth" });
  const lines = warnings.mock.calls.map(call => String(call.arguments[0]));
  assert.ok(lines.length > 0);
  assert.ok(lines.every(line => line.startsWith("[agent-plugins] ")), lines.join("\n"));
  assert.ok(lines.includes('[agent-plugins] Legacy extensions.tovu agent-plugin metadata is deprecated; compatibility is retained through at least 2027-05-06. Portable packages use extensions.jini and unprefixed MCP metadata.'));
});
