import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { parseAgentPluginManifest, parseAgentPluginMcpConfig } from "../../manifest.js";

/**
 * @file The `site-compliance` bundled Agent Plugin's package is VALID and, more importantly, still
 * says the things it was built to say.
 *
 * Two very different kinds of assertion live here on purpose:
 *
 * 1. **Schema validity** — the manifests parse under this repo's own v1.0.0 validators, and
 *    `mcp.json` declares ZERO servers. That last one is not a formality: `capability-projection.ts`
 *    marks every plugin-declared MCP server `execute: { kind: "unavailable" }` with no promotion
 *    path, so a server declared here would be inert decoration that looks like a capability. The
 *    emptiness is the design; a future edit that adds one should fail this test and have to argue
 *    with it.
 *
 * 2. **Output-contract content** — the SKILL.md still forbids compliance verdicts and still
 *    requires "cannot determine". This is content, not code, and it is exactly the kind of thing
 *    that erodes silently during an unrelated edit. The debate that produced this plugin called the
 *    output contract "the decision that determines whether this capability is an asset or a
 *    liability", above the packaging question it was nominally about — so it gets a test.
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../../../agent-plugins/site-compliance");
const SKILL_DIR = path.join(PACKAGE_ROOT, "skills", "site-compliance");

async function readPackageFile(relativePath: string): Promise<string> {
  return readFile(path.join(PACKAGE_ROOT, relativePath), "utf8");
}

test("plugin.json parses under the Agent Plugins v1.0.0 validator", async () => {
  const parsed = parseAgentPluginManifest(JSON.parse(await readPackageFile("plugin.json")));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "site-compliance");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
});

test("plugin.json's keywords carry the vocabulary an operator would actually search for", async () => {
  const parsed = parseAgentPluginManifest(JSON.parse(await readPackageFile("plugin.json")));
  assert.equal(parsed.ok, true);
  const keywords = new Set(parsed.ok ? (parsed.manifest.keywords ?? []) : []);
  for (const expected of ["gdpr", "ccpa", "cookie", "consent", "accessibility", "wcag", "privacy"]) {
    assert.ok(keywords.has(expected), `plugin.json keywords must include '${expected}' — it is a primary discovery term`);
  }
});

test("mcp.json declares ZERO servers — plugin-declared MCP servers cannot execute in this codebase", async () => {
  const parsed = parseAgentPluginMcpConfig(JSON.parse(await readPackageFile("mcp.json")));
  assert.equal(parsed.ok, true);
  assert.deepEqual(
    parsed.ok ? parsed.config.serverIds : ["unreachable"],
    [],
    "adding a server here would declare a capability nothing in this repo can run — the browser-backed " +
      "evidence tool is a NATIVE tool (features/site-evidence), deliberately not bundled in this plugin",
  );
});

test("the eponymous skill folder exists — run-start injection resolves skills/<pluginId>/SKILL.md by that exact name", async () => {
  const markdown = await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  assert.ok(markdown.length > 0);
});

test("the rulepacks are separate files, not inlined into SKILL.md", async () => {
  const references = (await readdir(path.join(SKILL_DIR, "references"))).sort();
  assert.deepEqual(references, ["ccpa-cpra.md", "gdpr-eu-uk.md", "wcag-2-2.md"]);

  const skill = await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  for (const reference of references) {
    assert.ok(
      skill.includes(`references/${reference}`),
      `SKILL.md must point at references/${reference} — a rulepack nothing references is a rulepack nothing reads`,
    );
  }

  // Each rulepack carries its own version line, which is the whole point of splitting them out:
  // legal guidance rots on a different cadence than the reasoning procedure does.
  for (const reference of references) {
    const body = await readFile(path.join(SKILL_DIR, "references", reference), "utf8");
    assert.match(body, /\*\*Rulepack version:\*\*/, `${reference} must declare its own independent version`);
  }
});

test("SKILL.md's output contract requires citations, forbids verdicts, and mandates 'cannot determine'", async () => {
  const skill = (await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8")).toLowerCase();

  assert.ok(skill.includes("cannot-determine") || skill.includes("cannot determine"));
  assert.ok(skill.includes("output contract"));
  assert.ok(skill.includes("citation"));
  // The banned-output list must still be present and must still name the specific phrasings.
  assert.ok(skill.includes("banned outputs"));
  assert.ok(skill.includes("gdpr compliant"));
  assert.ok(skill.includes("risk screening, not legal advice") || skill.includes("not legal advice"));
});

test("SKILL.md never instructs the model to state a compliance verdict", async () => {
  const skill = await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");

  // Deliberately checks the IMPERATIVE forms a drifting edit would introduce ("report whether the
  // site is compliant", "determine compliance"), not the mere presence of the word "compliant" —
  // the file necessarily discusses the word in order to forbid it.
  for (const forbidden of [
    /report whether the site (is|complies)/i,
    /determine (whether the site is )?compliance/i,
    /state (that )?the site is compliant/i,
    /assign a compliance score/i,
  ]) {
    assert.ok(!forbidden.test(skill), `SKILL.md must not contain an instruction matching ${forbidden}`);
  }
});
