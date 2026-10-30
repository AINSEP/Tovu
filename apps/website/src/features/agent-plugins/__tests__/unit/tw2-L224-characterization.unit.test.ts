import { containAgentPluginStatePath } from "#src/features/agent-plugins/lifecycle";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseAgentPluginMcpConfig } from "../../mcp-metadata.js";
import { migrateSiteAgentPluginLayouts } from "../../memory.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { parseNewSiteAgentPluginTokens, NEW_SITE_AGENT_PLUGIN_TOKENS_SHAPE_ERROR } from "../../new-site-agent-plugin-tokens.js";

const schema = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

test("MCP adapter retains stdio, optional remote fields, declared invalid ids and null-prototype server keys", () => {
  const metadata = {
    tovuAuthMode: "oauth", tovuDefaultTools: { allow: ["inspect"], write: [], read: [] },
    tovuTokenAuth: { helpUrl: "https://example.com/help", probeUrl: "https://example.com/probe" },
    tovuRenamedTools: { old: "inspect" },
  };
  const servers = Object.fromEntries([
    ["stdio", { type: "stdio", command: "tool", args: ["serve"] }],
    ["full", { type: "streamable-http", url: "https://example.com/mcp", headers: { Accept: "application/json" }, ...metadata }],
    ["__proto__", { type: "sse", url: "https://example.com/events" }],
    ["invalid", { type: "unknown" }],
  ]);
  const result = parseAgentPluginMcpConfig({ value: { $schema: schema, mcpServers: servers } });
  if (!result.ok) assert.fail(result.errors.join("; "));
  assert.equal(result.ok, true);
  assert.equal(Object.getPrototypeOf(result.config.servers), null);
  assert.deepEqual(result.config.serverIds, ["stdio", "full", "__proto__", "invalid"]);
  assert.deepEqual(result.config.servers.stdio, servers.stdio);
  assert.deepEqual(result.config.servers.full, servers.full);
  assert.deepEqual(result.config.servers.__proto__, servers.__proto__);
  assert.equal(Object.hasOwn(result.config.servers, "invalid"), false);
  assert.deepEqual(parseAgentPluginMcpConfig({ value: null }), { ok: false, errors: ["mcp.json must be a JSON object"] });
});

test("create-time token parser preserves absence, entry validation, raw limits, trimming and own-key semantics", () => {
  for (const value of [undefined, null]) assert.deepEqual(parseNewSiteAgentPluginTokens(value), { ok: true, tokens: {} });
  const invalid = { ok: false, error: NEW_SITE_AGENT_PLUGIN_TOKENS_SHAPE_ERROR };
  for (const value of [false, 4, "value", [], { "Bad Id": "value" }, { good: null }, { good: "x".repeat(4097) },
    { good: ` ${"x".repeat(4096)}` }, Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`p${i}`, ""]))]) {
    assert.deepEqual(parseNewSiteAgentPluginTokens(value), invalid);
  }
  const tokens = { ["p".repeat(64)]: "x".repeat(4096), blank: " \t\n", good: " value " };
  assert.deepEqual(parseNewSiteAgentPluginTokens(tokens), { ok: true, tokens: { ["p".repeat(64)]: "x".repeat(4096), good: "value" } });
  assert.equal(parseNewSiteAgentPluginTokens({ ["p".repeat(65)]: "value" }).ok, false);
  const eight = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`p${i}`, "value"]));
  assert.deepEqual(parseNewSiteAgentPluginTokens(eight), { ok: true, tokens: eight });
  assert.deepEqual(parseNewSiteAgentPluginTokens(Object.create({ inherited: "value" })), { ok: true, tokens: {} });
  assert.deepEqual(tokens.good, " value ");
});

test("site migration handles a missing workspace directory and propagates a non-directory error", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tw2-L224-missing-"));
  try {
    const layout = resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "plugins") } });
    assert.deepEqual(await migrateSiteAgentPluginLayouts({ contain: containAgentPluginStatePath, layout, workspaceId: "active" }), { complete: true, moved: 0 });
    await rm(layout.workspacesDir, { recursive: true, force: true });
    await writeFile(layout.workspacesDir, "file");
    await assert.rejects(migrateSiteAgentPluginLayouts({ contain: containAgentPluginStatePath, layout, workspaceId: "active" }), { code: "ENOTDIR" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("site migration skips files and invalid workspace folders, deduplicates active id and returns its result", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tw2-L224-workspaces-"));
  try {
    const layout = resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: root } });
    for (const id of ["active", "other", "bad_id"]) await mkdir(path.join(layout.workspacesDir, id), { recursive: true });
    await writeFile(path.join(layout.workspacesDir, "plain-file"), "skip");
    const legacy = path.join(layout.forWorkspace("other").root, "memory", "example", "notes");
    await mkdir(legacy, { recursive: true });
    await writeFile(path.join(legacy, "note.md"), "preserve");
    const warnings = t.mock.method(console, "warn", (..._args: unknown[]) => {});
    const calls: string[] = [];
    const tracked = { ...layout, forWorkspace: (id: string) => { calls.push(id); return layout.forWorkspace(id); } };
    assert.deepEqual(await migrateSiteAgentPluginLayouts({ contain: containAgentPluginStatePath, layout: tracked, workspaceId: "active" }), { complete: true, moved: 0 });
    assert.equal(calls.filter(id => id === "active").length, 2);
    assert.equal(warnings.mock.calls.filter(call => call.arguments[0] === "[agent-plugins:migration-failed] invalid legacy workspace folder bad_id").length, 1);
    assert.equal(await readFile(path.join(layout.forWorkspace("other").root, "example", "memory", "notes", "note.md"), "utf8"), "preserve");
  } finally { await rm(root, { recursive: true, force: true }); }
});
