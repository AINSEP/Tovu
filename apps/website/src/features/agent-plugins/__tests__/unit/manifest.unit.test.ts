import assert from "node:assert/strict";
import test from "node:test";

import { parseAgentPluginManifest, parseAgentPluginMcpConfig } from "../../manifest.js";

/**
 * @file `parseAgentPluginManifest()` / `parseAgentPluginMcpConfig()` — the Agent Plugins v1.0.0
 * `plugin.json` / `mcp.json` grammar, verified against the live spec
 * (agent-plugins.org/specification, §5.5 for the name grammar; mcp.json's top-level shape is
 * `{ "$schema": ..., "mcpServers": { "<server-id>": {...} } }`) rather than inferred from example
 * manifests. Deliberately a SEPARATE, smaller validator from
 * `src/features/plugin-runtime/manifest.ts`'s `validateManifest()` — that one is `.tovu-plugin`'s
 * own format (`integrity`, `sdkRange`, `tier`, a 3-token capability vocabulary); this one is the
 * open standard's, and the two manifests share no required field at all.
 */

const SCHEMA_1_0_0 = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA_1_0_0 = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

test("a minimal valid manifest (only $schema + name) parses with no errors", () => {
  const result = parseAgentPluginManifest({ $schema: SCHEMA_1_0_0, name: "ui-ux-design" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.manifest.name, "ui-ux-design");
});

test("optional metadata fields pass through when present", () => {
  const result = parseAgentPluginManifest({
    $schema: SCHEMA_1_0_0,
    name: "ui-ux-design",
    version: "1.1.0",
    description: "AI Dev Shop UI/UX guidance.",
    author: "AI Dev Shop",
    license: "MIT",
    keywords: ["design", "ui"],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.manifest.version, "1.1.0");
    assert.equal(result.manifest.description, "AI Dev Shop UI/UX guidance.");
  }
});

test("an unrecognized top-level field is a non-fatal warning, not a rejection (spec: unknown fields warn, don't block)", () => {
  const result = parseAgentPluginManifest({ $schema: SCHEMA_1_0_0, name: "ui-ux-design", futureField: 1 });
  assert.equal(result.ok, true);
  if (result.ok) assert.ok(result.warnings.some((w) => w.includes("futureField")));
});

test("a non-object manifest is rejected", () => {
  const result = parseAgentPluginManifest("not-an-object");
  assert.equal(result.ok, false);
});

test("a missing $schema is rejected", () => {
  const result = parseAgentPluginManifest({ name: "ui-ux-design" });
  assert.equal(result.ok, false);
});

test("a $schema pointing at an unrecognized version is rejected (loader pins v1.0.0, per spec churn risk)", () => {
  const result = parseAgentPluginManifest({ $schema: "https://agent-plugins.org/schemas/2.0.0/plugin.schema.json", name: "x" });
  assert.equal(result.ok, false);
});

test("a missing name is rejected", () => {
  const result = parseAgentPluginManifest({ $schema: SCHEMA_1_0_0 });
  assert.equal(result.ok, false);
});

for (const invalidName of ["My-Plugin", "-start", "end-", "has--double", "has..double", ".leading", "trailing.", "", "a".repeat(65)]) {
  test(`rejects the name grammar violation '${invalidName.slice(0, 20)}'`, () => {
    const result = parseAgentPluginManifest({ $schema: SCHEMA_1_0_0, name: invalidName });
    assert.equal(result.ok, false, `expected '${invalidName}' to be rejected`);
  });
}

for (const validName of ["my-plugin", "acme.tools", "lint3r", "a", "a".repeat(64)]) {
  test(`accepts the spec's own valid-name example '${validName.slice(0, 20)}'`, () => {
    const result = parseAgentPluginManifest({ $schema: SCHEMA_1_0_0, name: validName });
    assert.equal(result.ok, true, `expected '${validName}' to be accepted`);
  });
}

test("mcp.json: parses server ids from the mcpServers object", () => {
  const result = parseAgentPluginMcpConfig({
    $schema: MCP_SCHEMA_1_0_0,
    mcpServers: {
      main: { type: "stdio", command: "./server/index.js" },
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.config.serverIds, ["main"]);
});

test("mcp.json: a missing mcpServers object is rejected", () => {
  const result = parseAgentPluginMcpConfig({ $schema: MCP_SCHEMA_1_0_0 });
  assert.equal(result.ok, false);
});

test("mcp.json: a non-object manifest is rejected", () => {
  const result = parseAgentPluginMcpConfig(["not", "an", "object"]);
  assert.equal(result.ok, false);
});

test("mcp.json: the $schema VERSION segment must match plugin.json's (spec: a mismatch invalidates the MCP config)", () => {
  const result = parseAgentPluginMcpConfig(
    { $schema: "https://agent-plugins.org/schemas/2.0.0/mcp.schema.json", mcpServers: {} },
  );
  assert.equal(result.ok, false);
});
