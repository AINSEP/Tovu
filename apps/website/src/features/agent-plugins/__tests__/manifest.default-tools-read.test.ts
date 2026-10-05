import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseAgentPluginMcpConfig, type McpServerConfig, type RemoteMcpServerConfig } from "../mcp-metadata.js";

/** Every fixture here declares a remote server; the `tovu*` metadata only exists on that variant. */
function remote(server: McpServerConfig | undefined): RemoteMcpServerConfig | undefined {
  if (server?.type === "stdio") throw new Error("expected a remote MCP server");
  return server;
}

function parseDefaults(tovuDefaultTools: unknown) {
  const result = parseAgentPluginMcpConfig({ value: {
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { remote: { type: "streamable-http", url: "https://mcp.example.com/mcp" } },
  } }, { pluginManifest: { $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "fixture",
    extensions: { tovu: { mcpServers: { remote: { tovuDefaultTools } } } } } });
  if (!result.ok) throw new Error(result.errors.join("; "));
  return remote(result.config.servers.remote);
}

test("read names survive parsing alongside independent write defaults", () => {
  assert.deepEqual(parseDefaults({ allow: ["inspect", "create"], write: ["create"], read: ["inspect"] })?.tovuDefaultTools,
    { allow: ["inspect", "create"], write: ["create"], read: ["inspect"] });
});

test("absent read defaults to an empty read list", () => {
  assert.deepEqual(parseDefaults({ allow: ["inspect"] })?.tovuDefaultTools?.read, []);
});

test("read outside an explicitly provided allow list excludes the entire server", () => {
  assert.equal(parseDefaults({ allow: ["inspect"], read: ["other"] }), undefined);
});

test("invalid read arrays and names exclude the entire server, including mixed valid/invalid lists", () => {
  for (const read of ["inspect", ["inspect", "bad name"], ["/inspect"], [""], [1], ["x".repeat(65)], Array.from({ length: 65 }, (_, i) => `t${i}`)]) {
    assert.equal(parseDefaults({ read }), undefined, JSON.stringify(read));
  }
});

test("read supports the same name grammar and exact 64-tool bound as allow", () => {
  const read = Array.from({ length: 64 }, (_, i) => `T${i}._-`);
  assert.deepEqual(parseDefaults({ allow: read, read })?.tovuDefaultTools?.read, read);
});

test("read-only declarations preserve the absence of sign-in defaults", () => {
  assert.deepEqual(parseDefaults({ read: ["inspect"] })?.tovuDefaultTools, { write: [], read: ["inspect"] });
  assert.equal(parseDefaults({ read: ["inspect"], write: ["create"] }), undefined);
});

test("bundled Higgsfield declares only the two evidenced read tools and no sign-in allow defaults", async () => {
  const raw = JSON.parse(await readFile(new URL("../../../../../../content/agent-plugins/higgsfield-media/mcp.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(raw.mcpServers.higgsfield).sort(), ["type", "url"]);
  const manifest = JSON.parse(await readFile(new URL("../../../../../../content/agent-plugins/higgsfield-media/plugin.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.extensions.tovu.mcpServers.higgsfield.tovuDefaultTools, { read: ["models_explore", "job_status"] });
  const parsed = parseAgentPluginMcpConfig({ value: raw }, { pluginManifest: manifest });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("invalid bundle");
  assert.equal(remote(parsed.config.servers.higgsfield)?.tovuAuthMode, "oauth");
});


test("legacy mcp.json fields cannot supply operator read trust", () => {
  const parsed = parseAgentPluginMcpConfig({ value: { $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { remote: { type: "streamable-http", url: "https://mcp.example.com/mcp", tovuDefaultTools: { allow: ["inspect"], read: ["inspect"] } } } } });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("invalid fixture");
  assert.deepEqual(remote(parsed.config.servers.remote)?.tovuDefaultTools?.read, []);
});

test("an invalid plugin manifest cannot supply read trust", () => {
  const parsed = parseAgentPluginMcpConfig({ value: { $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { remote: { type: "streamable-http", url: "https://mcp.example.com/mcp" } } } }, { pluginManifest: { name: "fixture", extensions: { tovu: { mcpServers: { remote: { tovuDefaultTools: { read: ["inspect"] } } } } } } });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("invalid fixture");
  assert.equal(remote(parsed.config.servers.remote)?.tovuDefaultTools, undefined);
});
