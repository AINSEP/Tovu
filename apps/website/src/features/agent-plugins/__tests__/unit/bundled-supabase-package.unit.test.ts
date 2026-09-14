import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { classifyAgentPluginMcpServerTrust } from "../../capability-projection.js";
import { parseAgentPluginManifest, parseAgentPluginMcpConfig } from "../../manifest.js";
import { packAgentPluginDirectory } from "../../bundled-source-archive.js";

/**
 * @file The `supabase` bundled Agent Plugin's package is VALID, INSTALLABLE, and still says the
 * specific things SPEC-052 requires it to say (AC-01, plus the agent-guidance half of AC-02/03/09).
 *
 * Mirrors `bundled-higgsfield-media-package.unit.test.ts` deliberately — same three kinds of
 * assertion (validator, packer, content). The content assertions lock the ORDER and the SAFETY of the
 * connect flow, because those are what an agent reading the file acts on: OAuth before the token
 * fallback, never a token in chat, read-only by default, and the separate write grant.
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
  const parsed = parseAgentPluginManifest(await readPackageJson("plugin.json"));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "supabase");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
});

test("AC-01: mcp.json declares exactly one streamable-http OAuth server at Supabase's hosted endpoint, auto-admitted", async () => {
  const parsed = parseAgentPluginMcpConfig(await readPackageJson("mcp.json"));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.deepEqual(parsed.config.serverIds, ["supabase"]);
  const server = parsed.config.servers.supabase;
  assert.deepEqual(server, { type: "streamable-http", url: "https://mcp.supabase.com/mcp", tovuAuthMode: "oauth" });
  // Remote + oauth carries no secret and no local execution, so `federate-mcp.ts` auto-provisions the
  // `supabase` row (disabled, empty allowlists) rather than waiting on the stdio confirmation gate.
  if (server) assert.equal(classifyAgentPluginMcpServerTrust(server), "auto-admit");
});

test("plugin.json's keywords reach an operator who says 'database', 'postgres', or 'connect'", async () => {
  const parsed = parseAgentPluginManifest(await readPackageJson("plugin.json"));
  const keywords = new Set(parsed.ok ? (parsed.manifest.keywords ?? []) : []);
  for (const expected of ["supabase", "database", "postgres", "sql", "connect", "login", "external-mcp"]) {
    assert.ok(keywords.has(expected), `plugin.json keywords must include '${expected}'`);
  }
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

test("SKILL.md forbids a token in chat, EARLY", async () => {
  const skill = await readSkill();
  const position = skill.search(/Never ask for a Supabase token in chat/);
  assert.ok(position >= 0 && position < skill.length / 4, "the no-token-in-chat rule must appear in the first quarter");
});

test("AC-02/03/09: SKILL.md orders the connect flow — enable the plugin, OAuth link first, token form only as the fallback, then the project", async () => {
  const skill = await readSkill();
  const enable = skill.indexOf("Agent Plugins");
  const oauth = skill.indexOf("external_mcp_oauth_connect { id: \"supabase\" }");
  const fallback = skill.indexOf("Call `supabase_set_access_token`");
  const project = skill.indexOf("Call `supabase_set_project_scope`");
  for (const [name, index] of Object.entries({ enable, oauth, fallback, project })) {
    assert.ok(index >= 0, `SKILL.md must contain the '${name}' step`);
  }
  assert.ok(enable < oauth && oauth < fallback && fallback < project, "steps must appear in enable -> OAuth -> fallback -> project order");
  assert.match(skill, /https:\/\/supabase\.com\/dashboard\/account\/tokens/);
  assert.match(skill, /Do not retry Step B in a loop/);
});

test("SKILL.md states read-only is the default and that turning it off grants nothing without writeAllowedToolNames", async () => {
  const skill = await readSkill();
  assert.match(skill, /Read-only is on by\s+default/);
  assert.match(skill, /grants \*\*nothing\*\* by itself/);
  assert.match(skill, /writeAllowedToolNames/);
  assert.match(skill, /remote-declares-not-read-only/);
});

test("SKILL.md routes an expired credential to external_mcp_reauth_prompt and forbids relaying the raw error", async () => {
  const skill = await readSkill();
  assert.match(skill, /external_mcp_reauth_prompt/);
  assert.match(skill, /Never retry silently/);
  assert.match(skill, /Never paste Supabase's raw error body/);
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
