import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { parseAgentPluginManifest, parseAgentPluginMcpConfig } from "../../manifest.js";
import { packAgentPluginDirectory } from "../../bundled-source-archive.js";

/**
 * @file The `tovu-deploy-fly` bundled Agent Plugin's package is VALID, INSTALLABLE, and still says
 * the specific things it was built to say.
 *
 * Mirrors `bundled-site-compliance-package.unit.test.ts` deliberately — same three kinds of
 * assertion, for the same reasons — with one addition that plugin does not need:
 *
 * 1. **Schema validity** — the manifests parse under this repo's own v1.0.0 validators, and
 *    `mcp.json` declares ZERO servers. Same reasoning as `site-compliance`: this plugin ships no
 *    server at all (every step it describes runs through the ALREADY-EXISTING
 *    `custom_credential_make_request` native tool), so a server declared here would be inert
 *    decoration that looks like a capability.
 *
 * 2. **Installability** — this package actually packs through `packAgentPluginDirectory`, the real
 *    first half of `seed-bundled.ts`'s install path, and the pack carries the non-markdown template
 *    assets. That last part is the point: this plugin's whole delivery mechanism is that the
 *    assistant READS `fly.template.toml` / `fly-deploy.template.yml` off disk and writes them into
 *    the operator's repo. `resolve-agent-plugin-refs.ts` lists every non-SKILL.md package file by
 *    absolute path for exactly that. A packer change that started filtering by extension would
 *    silently gut this plugin while leaving its SKILL.md perfectly intact — so it gets a test.
 *
 * 3. **Content contract** — the five rules survive. These are the entire reason the plugin exists:
 *    generic fly.io knowledge gets every one of them wrong, and they are the kind of prose that
 *    erodes silently during an unrelated edit.
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/tovu-deploy-fly");
const SKILL_DIR = path.join(PACKAGE_ROOT, "skills", "tovu-deploy-fly");

async function readPackageFile(relativePath: string): Promise<string> {
  return readFile(path.join(PACKAGE_ROOT, relativePath), "utf8");
}

async function readSkill(): Promise<string> {
  return readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
}

test("plugin.json parses under the Agent Plugins v1.0.0 validator", async () => {
  const parsed = parseAgentPluginManifest(JSON.parse(await readPackageFile("plugin.json")));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "tovu-deploy-fly");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
});

test("plugin.json's keywords carry the vocabulary an operator would actually search for", async () => {
  const parsed = parseAgentPluginManifest(JSON.parse(await readPackageFile("plugin.json")));
  assert.equal(parsed.ok, true);
  const keywords = new Set(parsed.ok ? (parsed.manifest.keywords ?? []) : []);
  for (const expected of ["deploy", "fly.io", "flyctl", "hosting", "sqlite", "volume"]) {
    assert.ok(keywords.has(expected), `plugin.json keywords must include '${expected}' — it is a primary discovery term`);
  }

  // The GitHub vocabulary moved OUT with the procedure it described (2026-09-10). Leaving these
  // here would surface this plugin for a bare "github actions" query it can no longer answer, and
  // would rank it against the `github` plugin that now owns exactly that.
  for (const moved of ["ci", "github-actions", "workflow-dispatch"]) {
    assert.ok(!keywords.has(moved), `plugin.json must NOT keyword '${moved}' — the bundled 'github' plugin owns that vocabulary now`);
  }
});

test("mcp.json declares ZERO servers — this plugin ships no server, it drives existing native tools", async () => {
  const parsed = parseAgentPluginMcpConfig(JSON.parse(await readPackageFile("mcp.json")));
  assert.equal(parsed.ok, true);
  assert.deepEqual(
    parsed.ok ? parsed.config.serverIds : ["unreachable"],
    [],
    "adding a server here would declare a capability nothing in this repo can run — every deploy step " +
      "goes through custom_credential_make_request, which is a NATIVE tool (features/custom-credentials)",
  );
});

test("the eponymous skill folder exists — run-start injection resolves skills/<pluginId>/SKILL.md by that exact name", async () => {
  assert.ok((await readSkill()).length > 0);
});

test("the package packs through the real installer's own packer, templates included", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);

  assert.ok(packed.files.includes("plugin.json"));
  assert.ok(packed.files.includes("skills/tovu-deploy-fly/SKILL.md"));

  // The delivery mechanism itself. `resolve-agent-plugin-refs.ts` lists every non-SKILL.md file by
  // absolute path so the agent can Read it; if these stop being packed, the plugin can still
  // describe a deploy but can no longer produce the two files it exists to write.
  for (const asset of [
    "skills/tovu-deploy-fly/references/fly.template.toml",
    "skills/tovu-deploy-fly/references/fly-deploy.template.yml",
  ]) {
    assert.ok(packed.files.includes(asset), `${asset} must survive packing — the assistant writes it into the operator's repo`);
  }

  assert.match(packed.sha256, /^[a-f0-9]{64}$/);
});

test("the templates are separate asset files, not inlined into SKILL.md, and SKILL.md points at each", async () => {
  const references = (await readdir(path.join(SKILL_DIR, "references"))).sort();
  assert.deepEqual(references, ["fly-deploy.template.yml", "fly.template.toml", "machines-api-path.md"]);

  const skill = await readSkill();
  for (const reference of references) {
    assert.ok(
      skill.includes(`references/${reference}`),
      `SKILL.md must point at references/${reference} — an asset nothing references is an asset nothing writes`,
    );
  }
});

test("every operator-supplied value in both templates is marked as a placeholder", async () => {
  for (const template of ["fly.template.toml", "fly-deploy.template.yml"]) {
    const body = await readFile(path.join(SKILL_DIR, "references", template), "utf8");
    assert.match(
      body,
      /<<PLACEHOLDER:/,
      `${template} must mark install-specific values — an unmarked default is a deploy against the wrong app`,
    );
  }

  // The app name must never be hardcoded to this repo's own production app in a template the
  // assistant writes into someone ELSE's repo.
  const flyToml = await readFile(path.join(SKILL_DIR, "references", "fly.template.toml"), "utf8");
  assert.ok(!/^\s*app\s*=\s*"tovu"/m.test(flyToml), "fly.template.toml must not hardcode this repo's own production app name");
});

test("SKILL.md encodes the single-machine rule and forbids autoscaling", async () => {
  const skill = await readSkill();
  assert.match(skill, /exactly one machine/i);
  assert.match(skill, /fly scale count/i);
  assert.match(skill, /autoscal/i);
  assert.match(skill, /SQLite/);
});

test("SKILL.md states that the volume shadows the image's ENTIRE sites/ tree", async () => {
  const skill = await readSkill();
  assert.match(skill, /\/workspace\/Tovu\/sites/);
  assert.match(skill, /shadows/i);
  // The workaround must be named, not just the hazard — a rule with no remedy gets guessed at.
  assert.match(skill, /hydrateContentDbFromSeed/);
  assert.match(skill, /hydrateBlobStoreFromSeed/);
});

test("SKILL.md keeps secrets out of fly.toml and names all three as boot-blocking", async () => {
  const skill = await readSkill();
  assert.match(skill, /TOVU_ADMIN_PASSWORD/);
  assert.match(skill, /ANALYTICS_ROOT_KEY_SEED/);
  assert.match(skill, /TOVU_INTEGRATIONS_ROOT_KEY/);

  // As of 2026-09-09 (ddfa5e07) all three are boot-blocking — TOVU_INTEGRATIONS_ROOT_KEY's old
  // silent-rekey-on-redeploy failure mode was closed by a boot gate, so there is no longer a
  // "not boot-blocking" secret to distinguish in this table. What still has to survive: the
  // rotation/undecryptable risk is a DIFFERENT hazard the boot gate cannot close (a rotated key
  // still boots fine and silently orphans every credential sealed under the old one) — a drift
  // that dropped that warning while flattening the table would lose real information.
  assert.match(skill, /Boot-blocking/i);
  assert.doesNotMatch(skill, /Not boot-blocking/i);
  assert.match(skill, /undecryptable/i);
});

test("SKILL.md says plainly and EARLY that deploying ships code, not content", async () => {
  const skill = await readSkill();
  assert.match(skill, /ships \*\*CODE, not CONTENT\*\*|CODE, not CONTENT/);
  assert.match(skill, /content\.db/);
  assert.match(skill, /\.gitignore/i);

  // "Early" is part of the rule — the plugin's own instruction is to say it before touching a
  // file, so it must not be buried at the end of a long document.
  const position = skill.indexOf("CODE, not CONTENT");
  assert.ok(position >= 0 && position < skill.length / 4, "the code-not-content warning must appear in the first quarter of SKILL.md");
});

test("SKILL.md forbids org-wide or account-wide Fly API listing calls during pre-flight", async () => {
  const skill = await readSkill();

  // A live run hit `GET /v1/apps?org_slug=personal` mid pre-flight — undocumented, and 403'd on
  // an app-scoped deploy token that could fully manage its own app but not enumerate the org.
  // That looked like a broken credential; it is a normal, expected Fly token permission boundary.
  // Everything this pre-flight needs is available per-app once the app name is known, so the
  // guardrail must name the hazard concretely, not just gesture at "be careful with the API".
  assert.match(skill, /org_slug/);
  assert.match(skill, /org-wide|account-wide/i);
  assert.match(skill, /app-scoped/i);
  assert.match(skill, /403/);
});

test("SKILL.md documents the Machines API path as BLOCKED and never as a procedure to run", async () => {
  const machines = await readFile(path.join(SKILL_DIR, "references", "machines-api-path.md"), "utf8");
  assert.match(machines, /NOT implemented|Do not implement/i);
  assert.match(machines, /config\.image/);
  // The blocker must be stated concretely. "Not supported yet" would let a future reader assume
  // it merely needs effort rather than a published image.
  assert.match(machines, /No such image exists|no such image/i);

  const skill = await readSkill();
  assert.match(skill, /Do not improvise the Machines API path/i);
});

test("SKILL.md defers every GitHub step to the `github` plugin instead of restating the procedure", async () => {
  const skill = await readSkill();

  // Both plugins' skills reach the assistant's prompt at the SAME TIME, so the same rule written
  // twice, slightly differently, is a contradiction rather than emphasis. The GitHub procedure moved
  // out wholesale (2026-09-10); what stays here is a pointer plus the Fly-specific facts.
  assert.match(skill, /`github` plugin/);
  assert.match(skill, /does not describe the GitHub half|not repeated here|deliberately not repeated/i);

  // The concrete procedure that moved. Its RE-APPEARANCE here is the drift this test exists to
  // catch — a well-meaning edit that "helpfully" inlines the dispatch call again.
  assert.ok(!skill.includes("api.github.com"), "SKILL.md must not hand-roll a GitHub API URL — the `github` plugin owns every GitHub call");
  assert.ok(!/actions\/workflows\/[^\s]*\/dispatches/.test(skill), "the workflow-dispatch procedure belongs to the `github` plugin, not here");
  assert.ok(!/204 with an empty body/.test(skill), "the 204-means-queued rule is the `github` plugin's — restating it here creates two sources of truth");

  // And the dependency itself has to be stated in prose, because the manifest schema cannot carry
  // it: `manifest.ts`'s KNOWN_MANIFEST_KEYS is $schema/name/version/description/author/license/
  // keywords, with no dependency field to invent.
  assert.match(skill, /no dependency\s+field/i);
});

test("SKILL.md never tells the assistant to handle a secret value itself", async () => {
  const skill = await readSkill();

  // Deliberately checks the IMPERATIVE forms a drifting edit would introduce, not the mere
  // presence of the word "token" — the file necessarily discusses tokens in order to forbid
  // handling them.
  for (const forbidden of [
    /ask the (human|operator|user) (for|to paste) (the |their )?(fly )?(api )?token/i,
    /set the (repo(sitory)? )?secret (yourself|via the api|through the api)/i,
    /paste the token into/i,
    /echo the token/i,
  ]) {
    assert.ok(!forbidden.test(skill), `SKILL.md must not contain an instruction matching ${forbidden}`);
  }

  // And the positive half: it must actively say this step is the human's.
  assert.match(skill, /You cannot do this step/i);
});
