import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { setAgentPluginActivation } from "../../activation.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { installAgentPlugin, type AgentPluginArchiveEntry, type AgentPluginArchiveReaderPort } from "../../install.js";
import { buildAgentPluginSearchRegistrations } from "../../tool-registrations.js";

/**
 * @file Behavioral certification for `search_agent_plugin_local`'s handler — real installs through
 * the production `installAgentPlugin` pipeline (the same idiom `tool-registrations.unit.test.ts`
 * already establishes for the dynamic `agent_plugin_<id>` tools), against a real `ToolRegistry`.
 *
 * Complements, does not duplicate, `agent-plugin-search-discovery.integration.test.ts` (which proves
 * the tool ranks and resolves via `search_tools`/`describe_tool` against the real 172-tool catalog,
 * but never executes the handler — its `fakeEvalRouteDeps()` has no installed plugins on disk). This
 * file proves the handler's OWN behavior: ranking against real installed content, activation-state
 * reporting, MCP server-id surfacing, and the no-host-path-leak security property.
 */

const WORKSPACE_A = "77777777-7777-4777-8777-777777777777";

function reader(entries: readonly AgentPluginArchiveEntry[]): AgentPluginArchiveReaderPort {
  return {
    async *entries() {
      yield* entries;
    },
  };
}

function fileEntry(entryPath: string, content: string): AgentPluginArchiveEntry {
  const bytes = Buffer.from(content, "utf8");
  return {
    kind: "file",
    entryPath,
    declaredSize: bytes.byteLength,
    executable: false,
    async *openReadStream() {
      yield bytes;
    },
  };
}

interface ManifestFields {
  readonly version?: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
}

function manifestJson(name: string, fields: ManifestFields = {}): string {
  return JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name, ...fields });
}

function mcpJson(serverIds: readonly string[]): string {
  const mcpServers = Object.fromEntries(serverIds.map((id) => [id, { command: "should-never-leave-disk", args: ["--secret", "shh"] }]));
  return JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", mcpServers });
}

async function withAgentPluginsDir<T>(fn: (agentPluginsDir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-search-tool-test-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

async function installReal(
  workspaceId: string,
  pluginId: string,
  files: Readonly<Record<string, string>>,
  archiveSeed: string,
) {
  const entries: AgentPluginArchiveEntry[] = Object.entries(files).map(([entryPath, content]) => fileEntry(entryPath, content));
  const archive = new Uint8Array(Buffer.from(archiveSeed));
  const digest = createHash("sha256").update(archive).digest("hex");
  return installAgentPlugin({ archive, expectedSha256: digest, archiveReader: reader(entries), layout: resolveAgentPluginLayout(), workspaceId });
}

function fakeCtx(input: unknown): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
}

interface SearchResponse {
  matches: {
    pluginId: string;
    version: string | null;
    description: string | null;
    keywords: readonly string[];
    enabled: boolean;
    skills: readonly { name: string; summary: string }[];
    mcpServers: readonly string[];
    score: number;
  }[];
  totalInstalled: number;
}

function findRegistration(workspaceId: string): ToolRegistration {
  const [registration] = buildAgentPluginSearchRegistrations({ workspaceId });
  assert.ok(registration, "search_agent_plugin_local must be registered");
  return registration;
}

async function search(workspaceId: string, input: unknown): Promise<SearchResponse> {
  return (await findRegistration(workspaceId).handler(fakeCtx(input))) as SearchResponse;
}

const SITE_COMPLIANCE_SKILL = `---
name: site-compliance
description: Evidence-based privacy, cookie/consent, and accessibility risk screening for a Tovu site.
---

# Site Compliance
`;

test("the catalog carries exactly one tool, search_agent_plugin_local, with a required 'query' and optional 'limit'", async () => {
  const registrations = buildAgentPluginSearchRegistrations({ workspaceId: WORKSPACE_A });
  assert.equal(registrations.length, 1);
  const [registration] = registrations;
  assert.ok(registration);
  assert.equal(registration.descriptor.id, "search_agent_plugin_local");
  const schema = registration.descriptor.inputSchema as { required: readonly string[]; properties: Record<string, unknown> };
  assert.deepEqual(schema.required, ["query"]);
  assert.ok(schema.properties.query);
  assert.ok(schema.properties.limit);
});

test("the description sends the model to plugins_set_enabled's 'agent-plugin' family — it no longer claims that tool manages only .tovu-plugin site plugins", () => {
  // Tool descriptions ship verbatim to the model. Since a1abe2bb plugins_set_enabled toggles BOTH
  // plugin families, so the old wording steered the model away from the one tool that can turn a
  // plugin found here on or off.
  const [registration] = buildAgentPluginSearchRegistrations({ workspaceId: WORKSPACE_A });
  const description = registration?.descriptor.description ?? "";
  assert.doesNotMatch(description, /plugins_list\/plugins_set_enabled, which manage the separate \.tovu-plugin/);
  assert.match(description, /plugins_set_enabled with family 'agent-plugin'/);
});

test("finds a real installed plugin by keyword, with description/version/keywords/skills carried through", async () => {
  await withAgentPluginsDir(async () => {
    await installReal(
      WORKSPACE_A,
      "site-compliance",
      {
        "plugin.json": manifestJson("site-compliance", {
          version: "1.0.0",
          description: "Evidence-based privacy, cookie/consent, and accessibility risk screening for a Tovu site.",
          keywords: ["compliance", "privacy", "gdpr", "ccpa", "cookie", "consent", "wcag", "accessibility"],
        }),
        "skills/site-compliance/SKILL.md": SITE_COMPLIANCE_SKILL,
      },
      "archive-site-compliance",
    );

    const result = await search(WORKSPACE_A, { query: "gdpr" });
    assert.equal(result.totalInstalled, 1);
    assert.equal(result.matches.length, 1);
    const [match] = result.matches;
    assert.ok(match);
    assert.equal(match.pluginId, "site-compliance");
    assert.equal(match.version, "1.0.0");
    assert.match(match.description ?? "", /risk screening/);
    assert.deepEqual([...match.keywords].sort(), ["accessibility", "ccpa", "compliance", "consent", "cookie", "gdpr", "privacy", "wcag"]);
    assert.equal(match.enabled, true, "absent activation record defaults to enabled");
    assert.deepEqual(match.skills, [{ name: "site-compliance", summary: "Evidence-based privacy, cookie/consent, and accessibility risk screening for a Tovu site." }]);
    assert.ok(match.score > 0);
  });
});

test("a query matching nothing still reports totalInstalled, distinguishing 'nothing installed' from 'nothing matched'", async () => {
  await withAgentPluginsDir(async () => {
    await installReal(WORKSPACE_A, "coffee-roastery", { "plugin.json": manifestJson("coffee-roastery") }, "archive-no-match");

    const result = await search(WORKSPACE_A, { query: "zzz-nonexistent-zzz" });
    assert.equal(result.totalInstalled, 1);
    assert.deepEqual(result.matches, []);
  });
});

test("an empty workspace (nothing installed) returns zero matches and totalInstalled 0, no throw", async () => {
  await withAgentPluginsDir(async () => {
    const result = await search(WORKSPACE_A, { query: "anything" });
    assert.deepEqual(result.matches, []);
    assert.equal(result.totalInstalled, 0);
  });
});

test("a DISABLED plugin is still found (unlike the dynamic agent_plugin_<id> tools) — search must not gate on activation", async () => {
  await withAgentPluginsDir(async () => {
    const installed = await installReal(
      WORKSPACE_A,
      "site-compliance",
      { "plugin.json": manifestJson("site-compliance", { description: "compliance screening" }) },
      "archive-disabled",
    );
    const layout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A);
    await setAgentPluginActivation({ workspaceRoot: layout.root, pluginId: "site-compliance", enabled: false, actor: "test-operator" });
    assert.ok(installed);

    const result = await search(WORKSPACE_A, { query: "compliance" });
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0]?.enabled, false, "search must report the real disabled state, and still return the plugin");
  });
});

test("MCP server ids are surfaced, but never their transport config (command/args/env)", async () => {
  await withAgentPluginsDir(async () => {
    await installReal(
      WORKSPACE_A,
      "fly-deploy",
      {
        "plugin.json": manifestJson("fly-deploy", { description: "Deploy Tovu sites to fly.io", keywords: ["fly", "fly.io", "deploy", "deployment"] }),
        "mcp.json": mcpJson(["fly-cli"]),
      },
      "archive-mcp",
    );

    const result = await search(WORKSPACE_A, { query: "fly.io deploy" });
    assert.equal(result.matches.length, 1);
    assert.deepEqual(result.matches[0]?.mcpServers, ["fly-cli"]);

    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /should-never-leave-disk/, "mcp.json's transport config (command) must never reach the response");
    assert.doesNotMatch(serialized, /--secret|shh/, "mcp.json's args must never reach the response");
  });
});

test("a plugin with no mcp.json at all reports an empty mcpServers array, not an error", async () => {
  await withAgentPluginsDir(async () => {
    await installReal(WORKSPACE_A, "no-mcp-plugin", { "plugin.json": manifestJson("no-mcp-plugin", { description: "plain plugin" }) }, "archive-no-mcp");

    const result = await search(WORKSPACE_A, { query: "plain" });
    assert.equal(result.matches.length, 1);
    assert.deepEqual(result.matches[0]?.mcpServers, []);
  });
});

test("SINK: a plugin whose SKILL.md is no longer readable does not take another installed plugin's search entry down with it", async () => {
  await withAgentPluginsDir(async () => {
    const broken = await installReal(
      WORKSPACE_A,
      "broken-plugin",
      {
        "plugin.json": manifestJson("broken-plugin", { description: "has a skill file that will go missing from disk" }),
        "skills/broken-plugin/SKILL.md": SITE_COMPLIANCE_SKILL,
      },
      "archive-broken",
    );
    await installReal(
      WORKSPACE_A,
      "healthy-plugin",
      { "plugin.json": manifestJson("healthy-plugin", { description: "stays fully readable" }) },
      "archive-healthy",
    );
    // Simulates the real-world failure this covers: the skill file still EXISTS (so the fresh
    // `indexInstalledRoot` walk `listInstalledPlugins` runs on every call still lists it as one of
    // the plugin's skills — deleting the file instead would simply make the walk stop listing it,
    // never exercising `readInstalledSkillMarkdown`'s own failure path at all) but is no longer
    // readable — e.g. a permissions problem on disk. chmod 0 revokes read for everyone, including
    // this test's own process.
    const skillFile = path.join(broken.packageRoot, "skills", "broken-plugin", "SKILL.md");
    await chmod(skillFile, 0o000);

    const result = await search(WORKSPACE_A, { query: "plugin" });
    assert.equal(result.totalInstalled, 2);
    assert.deepEqual(
      result.matches.map((m) => m.pluginId).sort(),
      ["broken-plugin", "healthy-plugin"],
      "the plugin with the missing skill file must still be found — search degrades per-skill, not per-plugin"
    );
    const brokenMatch = result.matches.find((m) => m.pluginId === "broken-plugin");
    assert.deepEqual(brokenMatch?.skills, [], "the unreadable skill itself is dropped, not fabricated");
  });
});

test("two installed digests of the same plugin id do not crash search — unlike the dynamic tool loader's refusal", async () => {
  await withAgentPluginsDir(async () => {
    await installReal(WORKSPACE_A, "site-compliance", { "plugin.json": manifestJson("site-compliance", { description: "variant a compliance" }) }, "archive-a");
    await installReal(WORKSPACE_A, "site-compliance", { "plugin.json": manifestJson("site-compliance", { description: "variant b compliance" }) }, "archive-b");

    const result = await search(WORKSPACE_A, { query: "compliance" });
    assert.equal(result.totalInstalled, 1, "one logical plugin id, even though two digests are on disk");
    assert.equal(result.matches.length, 1);
  });
});

test("limit is clamped, not rejected — an out-of-range value still returns a result within [1, 25]", async () => {
  await withAgentPluginsDir(async () => {
    for (let i = 0; i < 3; i += 1) {
      await installReal(WORKSPACE_A, `compliance-tool-${i}`, { "plugin.json": manifestJson(`compliance-tool-${i}`, { keywords: ["compliance"] }) }, `archive-limit-${i}`);
    }

    const zero = await search(WORKSPACE_A, { query: "compliance", limit: 0 });
    assert.ok(zero.matches.length >= 1, "limit 0 clamps up to 1, not down to nothing");

    const huge = await search(WORKSPACE_A, { query: "compliance", limit: 999 });
    assert.ok(huge.matches.length <= 25, "limit is capped at 25 regardless of what was requested");
  });
});

test("a missing 'query' argument throws — query is genuinely required, not merely documented as such", async () => {
  await withAgentPluginsDir(async () => {
    await assert.rejects(() => search(WORKSPACE_A, {}));
    await assert.rejects(() => search(WORKSPACE_A, undefined));
  });
});

test("SECURITY: no absolute host path leaks into the response, even for a matched plugin", async () => {
  await withAgentPluginsDir(async (agentPluginsDir) => {
    const installed = await installReal(
      WORKSPACE_A,
      "site-compliance",
      { "plugin.json": manifestJson("site-compliance", { description: "compliance screening" }), "skills/site-compliance/SKILL.md": SITE_COMPLIANCE_SKILL },
      "archive-security",
    );
    assert.ok(installed.packageRoot.startsWith(agentPluginsDir));

    const result = await search(WORKSPACE_A, { query: "compliance" });
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(agentPluginsDir)));
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(installed.packageRoot)));
  });
});

test("workspace isolation: a search in workspace A finds nothing installed only under a different workspace", async () => {
  await withAgentPluginsDir(async () => {
    const WORKSPACE_OTHER = "88888888-8888-4888-8888-888888888888";
    await installReal(WORKSPACE_OTHER, "only-in-other", { "plugin.json": manifestJson("only-in-other", { keywords: ["only"] }) }, "archive-tenancy");

    const result = await search(WORKSPACE_A, { query: "only" });
    assert.deepEqual(result.matches, []);
    assert.equal(result.totalInstalled, 0);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
