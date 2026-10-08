import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { classifyAgentPluginMcpServerTrust } from "../../capability-projection.js";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { parseAgentPluginMcpConfig } from "../../mcp-metadata.js";
import { packAgentPluginDirectory } from "../../lifecycle.js";

/**
 * @file The `supabase` bundled Agent Plugin's package is VALID, INSTALLABLE, and says what plan v2's
 * happy path needs (`ADS-memory/reports/2026-09-27-supabase-agent-plugin-plan-v2.md`, slice C1).
 *
 * Mirrors `bundled-higgsfield-media-package.unit.test.ts` deliberately — same three kinds of
 * assertion (validator, packer, content). The content assertions lock what an agent reading the
 * files acts on: `agent_plugin_connect` before any Supabase tool, plain words to the user, every
 * failure mode covered, the free-limit handling, and no SQL write granted yet.
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/supabase");
const SKILL_DIR = path.join(PACKAGE_ROOT, "skills", "supabase");

async function readPackageJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(PACKAGE_ROOT, relativePath), "utf8"));
}

async function readSkill(): Promise<string> {
  return readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
}

test("AC-01: plugin.json parses under the Agent Plugins v1.0.0 validator with no warnings", async () => {
  const parsed = parseAgentPluginManifest({ value: await readPackageJson("plugin.json") });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "supabase");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
});

const FEATURES_URL = "https://mcp.supabase.com/mcp?features=account,database,development,docs,debugging";

/** Lines the user reads: every markdown blockquote line in the skill and its references. */
function userFacingLines(markdown: string): string[] {
  return markdown.split("\n").filter((line) => /^\s*> /.test(line)).map((line) => line.replace(/^\s*> /, ""));
}

async function readFailureModes(): Promise<string> {
  return readFile(path.join(SKILL_DIR, "references", "failure-modes.md"), "utf8");
}

test("mcp.json declares exactly one streamable-http OAuth server at Supabase's account-wide endpoint, auto-admitted", async () => {
  const parsed = parseAgentPluginMcpConfig({ value: await readPackageJson("mcp.json") });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.deepEqual(parsed.config.serverIds, ["supabase"]);
  const server = parsed.config.servers.supabase;
  // `assert.ok` is an assertion function, so this line alone narrows `server` to a remote config.
  assert.ok(server && server.type !== "stdio");
  assert.deepEqual(
    { type: server.type, url: server.url, tovuAuthMode: server.tovuAuthMode },
    { type: "streamable-http", url: FEATURES_URL, tovuAuthMode: "oauth" },
  );
  // Granted on the first sign-in (`apply-connect-defaults.ts`). SQL writes stay out of `write` until
  // the confirm-before-destructive-SQL step (plan S-G3) exists.
  const defaults = server.tovuDefaultTools;
  assert.ok(defaults);
  const allow = defaults.allow;
  assert.ok(allow);
  assert.ok(defaults.write.every((name) => allow.includes(name)));
  assert.deepEqual(defaults.write, ["confirm_cost", "create_project", "pause_project", "restore_project"]);
  assert.deepEqual(defaults.allow, ["list_organizations", "get_organization", "list_projects", "get_project", "get_cost", "confirm_cost", "create_project", "pause_project", "restore_project", "list_tables", "list_extensions", "list_migrations", "apply_migration", "execute_sql", "get_advisors", "query_logs", "get_project_url", "get_publishable_keys", "generate_typescript_types", "search_docs"]);
  for (const needed of ["list_organizations", "list_projects", "get_project", "get_cost", "confirm_cost", "create_project", "pause_project", "restore_project"]) {
    assert.ok(defaults.allow.includes(needed), `the happy path needs '${needed}'`);
  }
  assert.equal(defaults.write.includes("execute_sql"), false);
  assert.equal(defaults.write.includes("apply_migration"), false);
  // Remote + oauth carries no secret and no local execution, so `federate-mcp.ts` auto-provisions the
  // `supabase` row (disabled, empty allowlists) rather than waiting on the stdio confirmation gate.
  assert.equal(classifyAgentPluginMcpServerTrust(server), "auto-admit");
});

test("mcp.json offers the access-token fallback: Supabase's tokens page, probed against its projects list", async () => {
  // Moved out of core `features/supabase-connect/` on 2026-09-29: the generic
  // `agent_plugin_set_access_token` (`access-token-tool.ts`) reads these from the plugin.
  const parsed = parseAgentPluginMcpConfig({ value: await readPackageJson("mcp.json") });
  assert.ok(parsed.ok);
  const server = parsed.config.servers.supabase;
  assert.ok(server && server.type !== "stdio");
  assert.deepEqual(server.tovuTokenAuth, {
    helpUrl: "https://supabase.com/dashboard/account/tokens",
    probeUrl: "https://api.supabase.com/v1/projects",
    // 2026-09-29: the retired env preset's token is copied onto this plugin's row at boot.
    importFromEnv: "TOVU_SUPABASE_MCP_ACCESS_TOKEN",
    retiredEnv: [
      "TOVU_SUPABASE_MCP_ENABLED",
      "TOVU_SUPABASE_MCP_PROJECT_REF",
      "TOVU_SUPABASE_MCP_ALLOWED_TOOLS",
      "TOVU_SUPABASE_MCP_FEATURES",
      "TOVU_SUPABASE_MCP_PACKAGE",
      "TOVU_SUPABASE_MCP_CONNECT_TIMEOUT_MS",
      "TOVU_SUPABASE_MCP_CALL_TIMEOUT_MS",
      "TOVU_SUPABASE_MCP_MAX_RESULT_BYTES",
    ],
  });
});

test("mcp.json carries saved selections across Supabase's get_logs -> query_logs rename, and defaults use the new name", async () => {
  const parsed = parseAgentPluginMcpConfig({ value: await readPackageJson("mcp.json") });
  assert.ok(parsed.ok);
  const server = parsed.config.servers.supabase;
  assert.ok(server && server.type !== "stdio");
  assert.deepEqual(server.tovuRenamedTools, { get_logs: "query_logs" });
  assert.ok(server.tovuDefaultTools?.allow?.includes("query_logs"));
  assert.equal(server.tovuDefaultTools?.allow?.includes("get_logs"), false);
});

test("plugin.json's keywords reach someone who just says they need a database", async () => {
  const parsed = parseAgentPluginManifest({ value: await readPackageJson("plugin.json") });
  const keywords = new Set(parsed.ok ? (parsed.manifest.keywords ?? []) : []);
  for (const expected of ["supabase", "database", "store-data", "signups", "forms", "backend", "postgres"]) {
    assert.ok(keywords.has(expected), `plugin.json keywords must include '${expected}'`);
  }
});

test("plugin.json's description tells the model to start with agent_plugin_connect", async () => {
  const parsed = parseAgentPluginManifest({ value: await readPackageJson("plugin.json") });
  assert.ok(parsed.ok);
  assert.match(parsed.manifest.description ?? "", /agent_plugin_connect/);
});

test("the package packs through the real installer's packer, the eponymous skill and its reference included", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);
  for (const file of ["plugin.json", "mcp.json", "skills/supabase/SKILL.md", "skills/supabase/references/failure-modes.md"]) {
    assert.ok(packed.files.includes(file), `${file} must survive packing`);
  }
  assert.match(packed.sha256, /^[a-f0-9]{64}$/);
});

test("SKILL.md points at every reference file that exists", async () => {
  const references = (await readdir(path.join(SKILL_DIR, "references"))).sort();
  assert.deepEqual(references, ["failure-modes.md"]);
  const skill = await readSkill();
  for (const reference of references) assert.ok(skill.includes(`references/${reference}`));
});

test("SKILL.md calls agent_plugin_connect before any Supabase tool", async () => {
  const skill = await readSkill();
  const connect = skill.indexOf('agent_plugin_connect { pluginId: "supabase" }');
  const firstSupabaseTool = skill.search(/mcp__supabase__/);
  assert.ok(connect >= 0, "SKILL.md must name the agent_plugin_connect call");
  assert.ok(firstSupabaseTool > connect, "no Supabase tool may come before agent_plugin_connect");
});

test("SKILL.md drops the old setup: no Settings trip, no restart, no pasted token, no project scoping", async () => {
  const skill = await readSkill();
  const connectStep = skill.split("## Step 1. Connect (always first)\n")[1]?.split("## Step 2.")[0];
  assert.ok(connectStep, "the actual first step must exist");
  assert.ok(connectStep.includes('Call `agent_plugin_connect { pluginId: "supabase" }` before any Supabase tool, every time'));
  assert.ok(connectStep.includes("It shows the person a card with a sign-in button."));
  const failureModes = await readFailureModes();
  for (const text of [skill, failureModes]) {
    for (const stale of [/Settings\s*→\s*External MCP/i, /restart/i, /personal access token/i, /supabase_set_access_token/, /supabase_set_project_scope/, /external_mcp_oauth_connect/]) {
      assert.doesNotMatch(text, stale);
    }
  }
});

test("nothing the user reads mentions tokens, OAuth, MCP or other setup words, and every link is https", async () => {
  const lines = [...userFacingLines(await readSkill()), ...userFacingLines(await readFailureModes())];
  assert.ok(lines.length >= 10, "user-facing lines are written as blockquotes");
  const banned = /\b(token|oauth|mcp|plugin|allowlist|scope|read-only|region|org|organization id|project ref|api key|service_role)\b/i;
  for (const line of lines) {
    assert.doesNotMatch(line.replace(/\]\([^)]*\)/g, "]"), banned, `user-facing line uses a setup word: ${line}`);
    for (const [, url] of line.matchAll(/\]\(([^)]+)\)/g)) assert.match(url ?? "", /^https:\/\//, `link must be https: ${line}`);
  }
  assert.match(await readSkill(), /Never say/);
});

test("the free limit: count active databases first, treat Supabase's limit error as the limit, offer reuse, pause and paid", async () => {
  const skill = await readSkill();
  const listProjects = skill.indexOf("mcp__supabase__list_projects");
  const create = skill.indexOf("mcp__supabase__create_project");
  assert.ok(listProjects >= 0 && listProjects < create, "active databases are counted before create_project");
  assert.match(skill, /maximum limits for the number of active free plan projects/);
  assert.match(skill, /get_cost.*(can't|cannot)\s+see\s+the\s+free\s+limit/is);
  for (const option of [/Use "<name>"/, /Pause "<name>"/, /paid/i]) assert.match(skill, option);
  assert.match(skill, /mcp__supabase__pause_project/);
  assert.match(skill, /Create it \(\$<amount>/);
  assert.match(skill, /mcp__supabase__confirm_cost/);
});

test("failure-modes.md covers every failure the plan lists", async () => {
  const failureModes = await readFailureModes();
  for (const marker of [
    /waiting-for-sign-in/,
    /said no|declined|cancel/i,
    /maximum limits for the number of active free plan projects/,
    /asleep/i,
    /mcp__supabase__restore_project/,
    /INIT_FAILED/,
    /external_mcp_reauth_prompt/,
    /429/,
    /change|delete.*data/i,
  ]) {
    assert.match(failureModes, marker);
  }
});

test("SKILL.md (G3): small database changes go through execute_sql, the SQL is shown first, and the confirm card is expected", async () => {
  const skill = await readSkill();
  assert.match(skill, /## Changing data or tables/);
  assert.match(skill, /mcp__supabase__execute_sql/);
  assert.match(skill, /show the SQL/i);
  assert.match(skill, /\*\*Allow\*\* \/ \*\*Allow for this chat\*\* \/ \*\*Cancel\*\*/);
  assert.match(skill, /Do NOT ask first with `assistant_ask_choice`/);
  assert.doesNotMatch(skill, /ask first before any change/i);
  assert.match(skill, /cancel/i);
  assert.doesNotMatch(skill, /not available yet/i);
  const failureModes = await readFailureModes();
  assert.doesNotMatch(failureModes, /I can't make tables or change data/);
});

test("the user signs up for their own account, and a sign-up link opens in a new tab", async () => {
  const skill = await readSkill();
  assert.match(skill, /Sign up/);
  assert.match(skill, /new\s+tab/i);
});

test("no file in the package carries credential material", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);
  const credentialShapes: readonly RegExp[] = [
    /\bBearer\s+[A-Za-z0-9._-]{16,}/,
    /\bsbp_[A-Za-z0-9]{16,}/,
    /(api[_-]?key|access[_-]?token|client[_-]?secret|refresh[_-]?token)\s*[:=]\s*["'][^"']{12,}["']/i,
  ];
  for (const file of packed.files) {
    const body = await readFile(path.join(PACKAGE_ROOT, file), "utf8");
    for (const shape of credentialShapes) assert.ok(!shape.test(body), `${file} matches a credential shape (${shape})`);
  }
});
