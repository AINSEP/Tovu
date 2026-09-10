import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { parseAgentPluginManifest, parseAgentPluginMcpConfig } from "../../manifest.js";
import { packAgentPluginDirectory } from "../../bundled-source-archive.js";

/**
 * @file The `github` bundled Agent Plugin's package is VALID, INSTALLABLE, host-AGNOSTIC, and still
 * says the specific things it was built to say.
 *
 * Mirrors `bundled-tovu-deploy-fly-package.unit.test.ts` and
 * `bundled-site-compliance-package.unit.test.ts` deliberately — same kinds of assertion, for the
 * same reasons — with one whole class those two do not need:
 *
 * **Host-agnosticism is a CONTENT CONTRACT here, not a style preference.** This plugin exists
 * because GitHub know-how was previously entangled with fly.io deploy procedure inside
 * `tovu-deploy-fly`, which made it unreusable by any future host plugin (Render, Railway) and made
 * two plugins' skills overlap in the assistant's prompt. Every enabled plugin's skill reaches that
 * prompt SIMULTANEOUSLY, so an overlapping instruction is a contradiction rather than emphasis. A
 * later edit that "helpfully" adds one fly.toml example back here would silently undo both
 * properties while every other assertion in this file still passed — so the absence gets its own
 * test, across every file in the package rather than SKILL.md alone.
 *
 * The rules asserted below are each a real, paid-for failure: a dispatch reported as a deploy, a
 * push to a branch no trigger names, a force-push that dropped two build args from a MODIFIED file
 * nobody diffed, a 403 on an org listing misread as a dead credential, and a rendered static export
 * committed where app source was needed.
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/github");
const SKILL_DIR = path.join(PACKAGE_ROOT, "skills", "github");

async function readPackageFile(relativePath: string): Promise<string> {
  return readFile(path.join(PACKAGE_ROOT, relativePath), "utf8");
}

async function readSkill(): Promise<string> {
  return readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
}

async function readReference(name: string): Promise<string> {
  return readFile(path.join(SKILL_DIR, "references", name), "utf8");
}

test("plugin.json parses under the Agent Plugins v1.0.0 validator", async () => {
  const parsed = parseAgentPluginManifest(JSON.parse(await readPackageFile("plugin.json")));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "github");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
});

test("plugin.json's keywords carry the vocabulary that moved off tovu-deploy-fly", async () => {
  const parsed = parseAgentPluginManifest(JSON.parse(await readPackageFile("plugin.json")));
  assert.equal(parsed.ok, true);
  const keywords = new Set(parsed.ok ? (parsed.manifest.keywords ?? []) : []);
  for (const expected of ["github", "commit", "actions", "github-actions", "workflow-dispatch", "ci", "secrets", "branch"]) {
    assert.ok(keywords.has(expected), `plugin.json keywords must include '${expected}' — it is a primary discovery term`);
  }
});

test("mcp.json declares ZERO servers — this plugin ships no server, it drives existing native tools", async () => {
  const parsed = parseAgentPluginMcpConfig(JSON.parse(await readPackageFile("mcp.json")));
  assert.equal(parsed.ok, true);
  assert.deepEqual(
    parsed.ok ? parsed.config.serverIds : ["unreachable"],
    [],
    "adding a server here would declare a capability nothing in this repo can run — every step goes " +
      "through custom_credential_make_request / custom_credential_write_files, both NATIVE tools " +
      "(features/custom-credentials)",
  );
});

test("the eponymous skill folder exists — run-start injection resolves skills/<pluginId>/SKILL.md by that exact name", async () => {
  assert.ok((await readSkill()).length > 0);
});

test("the package packs through the real installer's own packer, every reference included", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);

  assert.ok(packed.files.includes("plugin.json"));
  assert.ok(packed.files.includes("skills/github/SKILL.md"));

  for (const reference of [
    "skills/github/references/actions.md",
    "skills/github/references/repo-files.md",
    "skills/github/references/auth-and-tokens.md",
    "skills/github/references/source-control.md",
  ]) {
    assert.ok(packed.files.includes(reference), `${reference} must survive packing — the assistant reads it off disk`);
  }

  assert.match(packed.sha256, /^[a-f0-9]{64}$/);
});

test("SKILL.md points at every reference file, and every reference file is pointed at", async () => {
  const references = (await readdir(path.join(SKILL_DIR, "references"))).sort();
  assert.deepEqual(references, ["actions.md", "auth-and-tokens.md", "repo-files.md", "source-control.md"]);

  const skill = await readSkill();
  for (const reference of references) {
    assert.ok(skill.includes(`references/${reference}`), `SKILL.md must point at references/${reference} — an unreferenced asset is one nothing reads`);
  }
});

test("the package knows NOTHING about fly.io — every file, not just SKILL.md", async () => {
  // The owner's hard constraint. This plugin must stay reusable by a future Render/Railway host
  // plugin, and `tovu-deploy-fly` must stay the ONE place fly-specific rules live. A single
  // fly.toml example added back here re-entangles the two and reintroduces the prompt-level
  // contradiction this split exists to end.
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);
  const forbidden = [/\bfly\.io\b/i, /\bflyctl\b/i, /\bfly\.toml\b/i, /FLY_API_TOKEN/, /machines\.dev/i, /\bfly secrets\b/i];

  for (const relativePath of packed.files) {
    const body = await readPackageFile(relativePath);
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(body), `${relativePath} must not mention ${pattern} — this plugin is host-agnostic by design`);
    }
  }
});

test("SKILL.md declares its own scope and disclaims deploy/host semantics", async () => {
  const skill = await readSkill();
  assert.match(skill, /## Scope/);
  // The reason, not just the rule: overlapping skills reach one prompt together.
  assert.match(skill, /same time|simultaneous/i);
  assert.match(skill, /contradiction/i);
});

test("SKILL.md: a repository secret is ALWAYS the human's step, and says WHY", async () => {
  const skill = await readSkill();
  const auth = await readReference("auth-and-tokens.md");

  // The mechanism is the whole argument — a rule with no reason gets treated as friction and
  // routed around. Encrypting against the repo's public key means holding the plaintext.
  assert.match(skill, /public key/i);
  assert.match(skill, /failure mode/i);
  assert.match(auth, /public key/i);

  // The specific API call that must never be made.
  assert.match(auth, /actions\/secrets/);
  assert.ok(/never/i.test(auth));

  // And the imperative forms a drifting edit would introduce. Checked as instructions, not as the
  // bare word "token" — both documents necessarily discuss tokens in order to forbid handling them.
  for (const document of [skill, auth]) {
    for (const banned of [
      /ask (the |a )?(human|operator|user) (for|to paste) (the |their )?(api )?token/i,
      /set the (repo(sitory)? )?secret (yourself|via the api|through the api)/i,
      /paste the token into/i,
      /echo the token/i,
    ]) {
      assert.ok(!banned.test(document), `must not contain an instruction matching ${banned}`);
    }
  }
});

test("SKILL.md: a 204 dispatch means QUEUED, never deployed", async () => {
  const skill = await readSkill();
  assert.match(skill, /204/);
  assert.match(skill, /queued/i);
  assert.match(skill, /Never report success/i);

  const actions = await readReference("actions.md");
  assert.match(actions, /204 with an empty body/);
  assert.match(actions, /queued/i);
});

test("SKILL.md: a workflow only fires on the branch its own trigger names", async () => {
  const skill = await readSkill();
  assert.match(skill, /only fires on the branch/i);
  // The silent half is the dangerous half: no run, no error, no warning.
  assert.match(skill, /nothing happen|does \*\*nothing\*\*|no run, no error/i);
  assert.match(skill, /default_branch/);
});

test("SKILL.md: editing an existing file means diffing the MODIFIED files, not just added and deleted", async () => {
  const skill = await readSkill();

  assert.match(skill, /MODIFIED/);
  assert.match(skill, /added and deleted|added.*deleted/i);
  // The incident that paid for the rule. Losing the concrete story turns a hard rule back into
  // generic advice about being careful.
  assert.match(skill, /force-push/i);
  assert.match(skill, /build-arg|build args?/i);

  // And the remedy, which is what makes it actionable: read the current content first, because the
  // write replaces the WHOLE file rather than patching it.
  assert.match(skill, /replaces a file's \*\*entire content\*\*|does not patch/i);
  assert.match(await readReference("repo-files.md"), /does not patch/i);
});

test("SKILL.md: a 403 on an org-wide listing is a permission BOUNDARY, not a broken credential", async () => {
  const skill = await readSkill();
  assert.match(skill, /403/);
  assert.match(skill, /org-wide|account-wide/i);
  assert.match(skill, /app-scoped|repo-scoped/i);
  assert.match(skill, /not a broken credential|BOUNDARY/i);
  // The actionable half: prefer per-resource endpoints over listings.
  assert.match(skill, /per-resource/i);

  const auth = await readReference("auth-and-tokens.md");
  assert.match(auth, /per-resource/i);
  // A 403 caused by a spent rate limit is the other thing misdiagnosed as a dead token.
  assert.match(auth, /x-ratelimit-remaining/i);
});

test("SKILL.md distinguishes pushing app source from committing a rendered static export", async () => {
  const skill = await readSkill();
  assert.match(skill, /app source/i);
  assert.match(skill, /rendered static export|static export/i);
  assert.match(skill, /source_control_execute_commit/);
  assert.match(skill, /custom_credential_write_files/);

  const sourceControl = await readReference("source-control.md");
  // The two facts that make the distinction real rather than a naming quibble: the export tool
  // generates its own content and DELETES paths it previously wrote, and it reads a different
  // credential store entirely.
  assert.match(sourceControl, /delete/i);
  assert.match(sourceControl, /filesDeleted/);
  assert.match(sourceControl, /Source Control page/);
  assert.match(sourceControl, /Access Tokens/);
});

test("SKILL.md forbids shelling out to git/curl for GitHub, and never invents a tool", async () => {
  const skill = await readSkill();
  assert.match(skill, /Never shell out/i);
  assert.match(skill, /curl/);
  // The host allowlist is a security property, not an obstacle — a drift that framed it as one
  // would invite exactly the "try another host" behaviour it exists to prevent.
  assert.match(skill, /allowlist/i);
  assert.match(skill, /before any request is sent/i);

  // This plugin ships no server, so it must not promise a tool that does not exist.
  assert.match(skill, /ships no MCP server|adds no tool/i);
});
