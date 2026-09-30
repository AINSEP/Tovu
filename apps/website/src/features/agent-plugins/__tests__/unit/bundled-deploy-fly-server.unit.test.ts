import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { parseAgentPluginManifest } from "../../manifest.js";
import { packAgentPluginDirectory } from "../../bundled-source-archive.js";

/**
 * @file The bundled `deploy` Agent Plugin carries the fly.io SERVER deploy procedure that used to be
 * its own bundled plugin, `tovu-deploy-fly` (merged 2026-09-29: one deploy plugin for every host,
 * plan `ADS-memory/reports/2026-09-29-deploy-agent-plugin-plan.md` §10, T10).
 *
 * The procedure lives in `skills/deploy/references/fly-server.md`, beside its two templates and
 * `machines-api-path.md`; the deploy skill points at it. Three kinds of assertion, kept from the old
 * package test for the same reasons:
 *
 * 1. **Manifest** — `plugin.json` still parses and carries the fly vocabulary an operator searches
 *    for, so the merged plugin surfaces for "deploy to fly".
 * 2. **Installability** — the fly references actually pack through `packAgentPluginDirectory`, the
 *    real first half of `seed-bundled.ts`'s install path. The assistant READS the templates off disk
 *    and writes them into the operator's repo; a packer change that filtered by extension would
 *    gut the procedure while leaving its prose intact.
 * 3. **Content contract** — the five Fly rules survive the move. Generic fly.io knowledge gets every
 *    one of them wrong, and they are the kind of prose that erodes silently during an unrelated edit.
 */

const CONTENT_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
const PACKAGE_ROOT = path.join(CONTENT_ROOT, "deploy");
const SKILL_DIR = path.join(PACKAGE_ROOT, "skills", "deploy");
const FLY_REFERENCES = ["fly-server.md", "fly.template.toml", "fly-deploy.template.yml", "machines-api-path.md"] as const;

async function readPackageFile(relativePath: string): Promise<string> {
  return readFile(path.join(PACKAGE_ROOT, relativePath), "utf8");
}

/** The Fly server procedure — what the old plugin's SKILL.md said, now a reference of `deploy`. */
async function readSkill(): Promise<string> {
  return readFile(path.join(SKILL_DIR, "references", "fly-server.md"), "utf8");
}

test("the old tovu-deploy-fly package is gone — retire-bundled.ts removes it from workspaces", async () => {
  await assert.rejects(() => access(path.join(CONTENT_ROOT, "tovu-deploy-fly")), (error: unknown) => (error as { code?: string }).code === "ENOENT");
});

test("plugin.json still parses and carries the fly vocabulary an operator would search for", async () => {
  const parsed = parseAgentPluginManifest(JSON.parse(await readPackageFile("plugin.json")));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "deploy");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
  assert.match(parsed.ok ? (parsed.manifest.description ?? "") : "", /fly\.io/);

  const keywords = new Set(parsed.ok ? (parsed.manifest.keywords ?? []) : []);
  for (const expected of ["deploy", "hosting", "fly", "fly.io", "flyctl", "machines", "volume"]) {
    assert.ok(keywords.has(expected), `plugin.json keywords must include '${expected}' — it is a primary discovery term`);
  }

  // The GitHub vocabulary belongs to the `github` plugin, which owns that half of the procedure.
  for (const moved of ["ci", "github-actions", "workflow-dispatch"]) {
    assert.ok(!keywords.has(moved), `plugin.json must NOT keyword '${moved}' — the bundled 'github' plugin owns that vocabulary`);
  }
});

test("the deploy skill triggers for a Fly server deploy and points at the procedure", async () => {
  const skill = await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  const frontmatter = skill.slice(0, skill.indexOf("\n---", 4));
  assert.match(frontmatter, /fly\.io/);
  assert.match(frontmatter, /flyctl/);
  assert.match(frontmatter, /code, not content/i);
  assert.ok(skill.includes("references/fly-server.md"), "SKILL.md must point at references/fly-server.md");
});

test("the package packs through the real installer's own packer, fly references and templates included", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);

  assert.ok(packed.files.includes("plugin.json"));
  assert.ok(packed.files.includes("skills/deploy/SKILL.md"));
  for (const reference of FLY_REFERENCES) {
    const asset = `skills/deploy/references/${reference}`;
    assert.ok(packed.files.includes(asset), `${asset} must survive packing — the assistant reads it off disk`);
  }
  assert.ok(!packed.files.some((file) => file.includes("tovu-deploy-fly")), "no file may still live under the old plugin's skill folder");
  assert.match(packed.sha256, /^[a-f0-9]{64}$/);
});

test("the templates are separate asset files, not inlined, and fly-server.md points at each", async () => {
  const procedure = await readSkill();
  for (const reference of FLY_REFERENCES.filter((name) => name !== "fly-server.md")) {
    assert.ok(
      procedure.includes(`references/${reference}`),
      `fly-server.md must point at references/${reference} — an asset nothing references is an asset nothing writes`,
    );
  }

  // The Machines API note points back at the procedure by its new name, not the deleted SKILL.md.
  const machines = await readFile(path.join(SKILL_DIR, "references", "machines-api-path.md"), "utf8");
  assert.ok(machines.includes("references/fly-server.md"));
  assert.doesNotMatch(machines, /parent SKILL\.md/);
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

test("fly-server.md encodes the single-machine rule and forbids autoscaling", async () => {
  const skill = await readSkill();
  assert.match(skill, /exactly one machine/i);
  assert.match(skill, /fly scale count/i);
  assert.match(skill, /autoscal/i);
  assert.match(skill, /SQLite/);
});

test("fly-server.md states that the volume shadows the image's ENTIRE sites/ tree", async () => {
  const skill = await readSkill();
  assert.match(skill, /\/workspace\/Tovu\/sites/);
  assert.match(skill, /shadows/i);
  // The workaround must be named, not just the hazard — a rule with no remedy gets guessed at.
  assert.match(skill, /hydrateContentDbFromSeed/);
  assert.match(skill, /hydrateBlobStoreFromSeed/);
});

test("fly-server.md keeps secrets out of fly.toml and names all three as boot-blocking", async () => {
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

test("fly-server.md says plainly and EARLY that deploying ships code, not content", async () => {
  const skill = await readSkill();
  assert.match(skill, /ships \*\*CODE, not CONTENT\*\*|CODE, not CONTENT/);
  assert.match(skill, /content\.db/);
  assert.match(skill, /\.gitignore/i);

  // "Early" is part of the rule — the plugin's own instruction is to say it before touching a
  // file, so it must not be buried at the end of a long document.
  const position = skill.indexOf("CODE, not CONTENT");
  assert.ok(position >= 0 && position < skill.length / 4, "the code-not-content warning must appear in the first quarter of fly-server.md");
});

test("fly-server.md forbids org-wide or account-wide Fly API listing calls during pre-flight", async () => {
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

test("fly-server.md documents the Machines API path as BLOCKED and never as a procedure to run", async () => {
  const machines = await readFile(path.join(SKILL_DIR, "references", "machines-api-path.md"), "utf8");
  assert.match(machines, /NOT implemented|Do not implement/i);
  assert.match(machines, /config\.image/);
  // The blocker must be stated concretely. "Not supported yet" would let a future reader assume
  // it merely needs effort rather than a published image.
  assert.match(machines, /No such image exists|no such image/i);

  const skill = await readSkill();
  assert.match(skill, /Do not improvise the Machines API path/i);
});

test("fly-server.md defers every GitHub step to the `github` plugin instead of restating the procedure", async () => {
  const skill = await readSkill();

  // Both plugins' skills reach the assistant's prompt at the SAME TIME, so the same rule written
  // twice, slightly differently, is a contradiction rather than emphasis. The GitHub procedure moved
  // out wholesale (2026-09-10); what stays here is a pointer plus the Fly-specific facts.
  assert.match(skill, /`github` plugin/);
  assert.match(skill, /does not describe the GitHub half|not repeated here|deliberately not repeated/i);

  // The concrete procedure that moved. Its RE-APPEARANCE here is the drift this test exists to
  // catch — a well-meaning edit that "helpfully" inlines the dispatch call again.
  assert.ok(!skill.includes("api.github.com"), "fly-server.md must not hand-roll a GitHub API URL — the `github` plugin owns every GitHub call");
  assert.ok(!/actions\/workflows\/[^\s]*\/dispatches/.test(skill), "the workflow-dispatch procedure belongs to the `github` plugin, not here");
  assert.ok(!/204 with an empty body/.test(skill), "the 204-means-queued rule is the `github` plugin's — restating it here creates two sources of truth");

  // And the dependency itself has to be stated in prose, because the manifest schema cannot carry
  // it: `manifest.ts`'s KNOWN_MANIFEST_KEYS is $schema/name/version/description/author/license/
  // keywords, with no dependency field to invent.
  assert.match(skill, /no dependency\s+field/i);
});

test("fly-server.md never tells the assistant to handle a secret value itself", async () => {
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
    assert.ok(!forbidden.test(skill), `fly-server.md must not contain an instruction matching ${forbidden}`);
  }

  // And the positive half: it must actively say this step is the human's.
  assert.match(skill, /You cannot do this step/i);
});
