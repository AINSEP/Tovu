import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  projectInstalledAgentPluginCapabilities,
  readInstalledMcpServerIds,
  readInstalledSkillMarkdown,
} from "../../capability-projection.js";
import type { InstalledAgentPlugin } from "../../install.js";
import { PackagePathViolation } from "../../package-paths.js";

/**
 * @file `projectInstalledAgentPluginCapabilities()` — turns one `InstalledAgentPlugin` (from
 * `install.ts`) into the candidate `AgentPluginCapabilityDescriptor[]` this feature's adapter
 * produces.
 *
 * This is explicitly the ADAPTER side of the interface boundary, not the composer projection itself
 * (that is a separate agent's deliverable, per the dispatch brief — "Do not build the projection...
 * If you need the contract before it exists, define what you need"). `AgentPluginCapabilityDescriptor`
 * here is a CANDIDATE shape this module owns and tests against; whoever builds the real capability
 * projection may reshape it, but the underlying rule it encodes is fixed by the FINAL debate decision
 * and is not up for renegotiation: Skills carry a real, executable context-injection binding; MCP
 * servers NEVER do, in v1, regardless of any future admission state — `execute` is always
 * `{ kind: "unavailable", reason }`, with the reason surfaced to the UI rather than swallowed.
 */

function installedFixture(overrides: Partial<InstalledAgentPlugin> = {}): InstalledAgentPlugin {
  return {
    pluginId: "ui-ux-design",
    version: "1.1.0",
    archiveDigest: "a".repeat(64),
    packageRoot: "/unused-in-these-tests",
    files: ["plugin.json", "skills/ui-ux-design/SKILL.md"],
    skills: [{ name: "ui-ux-design", skillPath: "skills/ui-ux-design/SKILL.md" }],
    ...overrides,
  };
}

test("a skill projects to one descriptor with a real preview and a real execute binding", async () => {
  const descriptors = await projectInstalledAgentPluginCapabilities({
    installed: installedFixture(),
    readSkillMarkdown: async (skillPath) => `# Fixture\n\nfrom ${skillPath}`,
    mcpServerIds: [],
  });

  assert.equal(descriptors.length, 1);
  const [descriptor] = descriptors;
  assert.equal(descriptor?.kind, "agent-plugin-skill");
  assert.equal(descriptor?.pluginId, "ui-ux-design");
  assert.equal(descriptor?.id, "agent-plugin:ui-ux-design:skill:ui-ux-design");
  assert.equal(descriptor?.revision, "a".repeat(64));
  assert.equal(descriptor?.preview.kind, "markdown");
  if (descriptor?.preview.kind === "markdown") {
    assert.equal(descriptor.preview.content, "# Fixture\n\nfrom skills/ui-ux-design/SKILL.md");
  }
  assert.equal(descriptor?.execute.kind, "context-injection");
  if (descriptor?.execute.kind === "context-injection") {
    assert.equal(descriptor.execute.markdown, "# Fixture\n\nfrom skills/ui-ux-design/SKILL.md");
  }
});

test("an MCP server projects to a descriptor that is ALWAYS execute:unavailable, never a runnable binding", async () => {
  const descriptors = await projectInstalledAgentPluginCapabilities({
    installed: installedFixture({ skills: [] }),
    readSkillMarkdown: async () => "",
    mcpServerIds: ["main"],
  });

  assert.equal(descriptors.length, 1);
  const [descriptor] = descriptors;
  assert.equal(descriptor?.kind, "agent-plugin-mcp-server");
  assert.equal(descriptor?.execute.kind, "unavailable");
  if (descriptor?.execute.kind === "unavailable") {
    assert.ok(descriptor.execute.reason.length > 0, "the reason must be surfaced, not empty");
  }
});

test("an MCP descriptor stays execute:unavailable even when an admitted-looking flag is passed in (no promotion path exists)", async () => {
  const descriptors = await projectInstalledAgentPluginCapabilities({
    installed: installedFixture({ skills: [] }),
    readSkillMarkdown: async () => "",
    mcpServerIds: ["main"],
    // There is deliberately no parameter that can flip an MCP descriptor's execute.kind to anything
    // other than "unavailable" — this call passes every field a caller might plausibly think grants
    // one, to prove none of them exist / do anything.
    ...({ admitted: true, allowedToolNames: ["delete_everything"] } as Record<string, unknown>),
  });

  const [descriptor] = descriptors;
  assert.equal(descriptor?.execute.kind, "unavailable");
});

test("a plugin with both a skill and an MCP server projects both, independently labeled", async () => {
  const descriptors = await projectInstalledAgentPluginCapabilities({
    installed: installedFixture(),
    readSkillMarkdown: async () => "# Guidance",
    mcpServerIds: ["main"],
  });

  const kinds = descriptors.map((d) => d.kind).sort();
  assert.deepEqual(kinds, ["agent-plugin-mcp-server", "agent-plugin-skill"]);
});

test("a plugin with neither skills nor MCP servers projects zero descriptors", async () => {
  const descriptors = await projectInstalledAgentPluginCapabilities({
    installed: installedFixture({ skills: [] }),
    readSkillMarkdown: async () => "",
    mcpServerIds: [],
  });
  assert.deepEqual(descriptors, []);
});

test("readInstalledSkillMarkdown reads a real file through the containment check", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-capability-projection-test-"));
  try {
    await mkdir(path.join(root, "skills", "ui-ux-design"), { recursive: true });
    await writeFile(path.join(root, "skills", "ui-ux-design", "SKILL.md"), "# Real content");

    const content = await readInstalledSkillMarkdown(root, "skills/ui-ux-design/SKILL.md");
    assert.equal(content, "# Real content");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readInstalledSkillMarkdown rejects a path escaping the package root", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-capability-projection-test-"));
  try {
    await assert.rejects(() => readInstalledSkillMarkdown(root, "../../../etc/passwd"), PackagePathViolation);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("descriptor ids are stable and collision-free across two differently-named skills", async () => {
  const descriptors = await projectInstalledAgentPluginCapabilities({
    installed: installedFixture({
      skills: [
        { name: "a", skillPath: "skills/a/SKILL.md" },
        { name: "b", skillPath: "skills/b/SKILL.md" },
      ],
    }),
    readSkillMarkdown: async (skillPath) => skillPath,
    mcpServerIds: [],
  });
  const ids = descriptors.map((d) => d.id);
  assert.deepEqual(new Set(ids).size, ids.length);
});

test("readInstalledMcpServerIds reads a real mcp.json and returns its server ids", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-capability-projection-mcp-test-"));
  try {
    await writeFile(
      path.join(root, "mcp.json"),
      JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: { "fly-cli": { command: "fly-mcp" }, "another-server": { command: "x" } },
      }),
    );

    const serverIds = await readInstalledMcpServerIds(root);
    assert.deepEqual([...serverIds].sort(), ["another-server", "fly-cli"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readInstalledMcpServerIds returns an empty array when mcp.json does not exist — optional per spec, not an error", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-capability-projection-mcp-test-"));
  try {
    assert.deepEqual(await readInstalledMcpServerIds(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readInstalledMcpServerIds returns an empty array for malformed JSON — fail-open, matches search's own discovery-tool posture", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-capability-projection-mcp-test-"));
  try {
    await writeFile(path.join(root, "mcp.json"), "{ not valid json");
    assert.deepEqual(await readInstalledMcpServerIds(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readInstalledMcpServerIds returns an empty array for a wrong-schema mcp.json rather than throwing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-capability-projection-mcp-test-"));
  try {
    await writeFile(path.join(root, "mcp.json"), JSON.stringify({ $schema: "wrong", mcpServers: {} }));
    assert.deepEqual(await readInstalledMcpServerIds(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
