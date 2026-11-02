import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse as parseToml } from "smol-toml";
import { load as parseYaml } from "js-yaml";

import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { packAgentPluginDirectory } from "../../../../apps/website/src/features/agent-plugins/lifecycle.ts";
import { agentPluginSourceDir } from "../../../../development/test-support/agent-plugin-source.mjs";

/**
 * @file Moved from core (`apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-fly-server.unit.test.ts`)
 * into the Fly plugin: vendor tests live with the vendor. The bundled `deploy` Agent Plugin carries the fly.io SERVER deploy procedure that used to be
 * its own bundled plugin, `tovu-deploy-fly` (merged 2026-09-29: one deploy plugin for every host,
 * plan `ADS-memory/reports/2026-09-29-deploy-agent-plugin-plan.md` §10, T10). Since the 2026-10-12
 * Phase B split gives this procedure to `fly` ("Fly.io"), alongside its ops/config/scheme data.
 *
 * Since D-W4 the plugin ships from `@jini-ai/agent-plugins/fly` (host-neutral: SKILL.md and the two
 * templates in `skills/fly/references/`), and Tovu's procedure is this overlay's `host/fly-server.md`
 * beside `host/machines-api-path.md`; `GUIDANCE.md` points at it. Three kinds of assertion, kept from
 * the old package test for the same reasons:
 *
 * 1. **Manifest** — `plugin.json` still parses and carries the fly vocabulary an operator searches
 *    for, so the merged plugin surfaces for "deploy to fly".
 * 2. **Installability** — the fly templates actually pack through `packAgentPluginDirectory`, the
 *    real first half of `seed-bundled.ts`'s install path. The assistant READS the templates off disk
 *    and writes them into the operator's repo; a packer change that filtered by extension would
 *    gut the procedure while leaving its prose intact.
 * 3. **Content contract** — the five Fly rules survive the move (into the overlay). Generic fly.io knowledge gets every
 *    one of them wrong, and they are the kind of prose that erodes silently during an unrelated edit.
 */

const CONTENT_ROOT = path.resolve(import.meta.dirname, "../../../agent-plugins");
// fly ships from @jini-ai/agent-plugins/fly: read it where Tovu takes it from.
const PACKAGE_ROOT = agentPluginSourceDir({ pluginId: "fly" });
const SKILL_DIR = path.join(PACKAGE_ROOT, "skills", "fly");
/** Tovu's host text for the plugin: `host/fly-server.md` and `host/machines-api-path.md`. */
const OVERLAY_HOST_DIR = path.resolve(import.meta.dirname, "../host");
const FLY_TEMPLATES = ["fly.template.toml", "fly-deploy.template.yml"];

async function readPackageFile(relativePath) {
  return readFile(path.join(PACKAGE_ROOT, relativePath), "utf8");
}

/** The Fly server procedure — what the old plugin's SKILL.md said, now Tovu's overlay host file. */
async function readSkill() {
  return readFile(path.join(OVERLAY_HOST_DIR, "fly-server.md"), "utf8");
}

test("the old tovu-deploy-fly package is gone — retire-bundled.ts removes it from workspaces", async () => {
  await assert.rejects(() => access(path.join(CONTENT_ROOT, "tovu-deploy-fly")), (error) => error.code === "ENOENT");
});

test("plugin.json still parses and carries the fly vocabulary an operator would search for", async () => {
  const parsed = parseAgentPluginManifest({ value: JSON.parse(await readPackageFile("plugin.json")) });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "fly");
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

test("the fly skill triggers for a Fly server deploy and defers to the host guidance that names the procedure", async () => {
  const skill = await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  const frontmatter = skill.slice(0, skill.indexOf("\n---", 4));
  assert.match(frontmatter, /fly\.io/);
  assert.match(frontmatter, /flyctl/);
  assert.match(frontmatter, /code, not content/i);
  assert.match(skill, /Follow the host guidance first/, "SKILL.md must send the assistant to the host guidance");
  const guidance = await readFile(path.resolve(import.meta.dirname, "../GUIDANCE.md"), "utf8");
  assert.ok(guidance.includes("host/fly-server.md"), "GUIDANCE.md must point at host/fly-server.md");
});

test("the package packs through the real installer's own packer, fly templates included", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);

  assert.ok(packed.files.includes("plugin.json"));
  assert.ok(packed.files.includes("skills/fly/SKILL.md"));
  for (const reference of FLY_TEMPLATES) {
    const asset = `skills/fly/references/${reference}`;
    assert.ok(packed.files.includes(asset), `${asset} must survive packing — the assistant reads it off disk`);
  }
  assert.ok(!packed.files.some((file) => file.includes("tovu-deploy-fly")), "no file may still live under the old plugin's skill folder");
  for (const hostFile of ["fly-server.md", "machines-api-path.md"]) {
    assert.ok(!packed.files.includes(`skills/fly/references/${hostFile}`), `${hostFile} is Tovu's: it arrives through the overlay, not the package`);
  }
  assert.match(packed.sha256, /^[a-f0-9]{64}$/);
});

test("the templates are separate asset files, not inlined, and fly-server.md points at each", async () => {
  const procedure = await readSkill();
  for (const reference of FLY_TEMPLATES) {
    assert.ok(
      procedure.includes(`references/${reference}`),
      `fly-server.md must point at references/${reference} — an asset nothing references is an asset nothing writes`,
    );
  }

  assert.ok(procedure.includes("host/machines-api-path.md"), "fly-server.md must point at host/machines-api-path.md");

  // The Machines API note points back at the procedure by its overlay name, not the deleted SKILL.md.
  const machines = await readFile(path.join(OVERLAY_HOST_DIR, "machines-api-path.md"), "utf8");
  assert.ok(machines.includes("host/fly-server.md"));
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
  // `internal_port` takes an unquoted placeholder (a number once filled): give it one to parse.
  const config = parseToml(flyToml.replace(/= <<PLACEHOLDER:[^>]+>>$/gm, "= 0"));
  assert.equal(config.app, "<<PLACEHOLDER: fly app name>>");
  assert.equal(config.primary_region, "<<PLACEHOLDER: fly region, e.g. iad — this is NOT a default>>");
  assert.deepEqual(config.mounts.map(mount => ({ ...mount })), [{
    source: "<<PLACEHOLDER: volume name — must match `flyctl volumes create` exactly>>",
    destination: "<<PLACEHOLDER: volume mount path inside the container>>",
  }]);
  const service = config.http_service;
  assert.equal(service.auto_stop_machines, false);
  assert.equal(service.auto_start_machines, true);
  assert.equal(service.min_machines_running, 1);

  const workflowText = await readFile(path.join(SKILL_DIR, "references", "fly-deploy.template.yml"), "utf8");
  // Substitute syntax-safe tokens before parsing: placeholder punctuation is not YAML.
  const token = (value) => `placeholder_${Buffer.from(value).toString("hex")}`;
  const workflow = parseYaml(workflowText.replace(/<<PLACEHOLDER:[^>]+>>/g, token));
  assert.deepEqual(workflow.on.push.branches, [token("<<PLACEHOLDER: default branch, e.g. main>>")]);
  assert.equal(workflow.concurrency.group, `fly-deploy-${token("<<PLACEHOLDER: fly app name>>")}`);
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  // The template is host-neutral (Tovu's build args come from this overlay's workflow/ blocks,
  // proven by fly-overlay.test.mjs); its operator default is a plain remote deploy.
  assert.deepEqual(workflow.jobs.deploy.steps, [
    { uses: "actions/checkout@v4" },
    { uses: "superfly/flyctl-actions/setup-flyctl@v1" },
    { run: "flyctl deploy --remote-only", env: { FLY_API_TOKEN: "${{ secrets.FLY_API_TOKEN }}" } },
  ]);

});

test("fly-server.md encodes the single-machine rule and forbids autoscaling", async () => {
  const skill = await readSkill();
  assert.match(skill, /exactly one machine/i);
  assert.match(skill, /fly scale count/i);
  assert.match(skill, /autoscal/i);
  assert.match(skill, /SQLite/);
  // Prose drift guard; the template values above establish the config policy.
  assert.ok(skill.includes("### Rule 1 — Exactly one machine. Never autoscale."));
  assert.ok(skill.includes("Never run `fly scale count` above 1."));
  assert.ok(skill.includes("Never enable autoscaling"));
  assert.doesNotMatch(skill, /(?:you (?:may|should|must)|please)\s+(?:enable autoscal\w*|run more than (?:exactly )?one machine)/i);
  assert.doesNotMatch(skill, /(?:^|\n)\s*(?:[-*]\s*)?(?:Enable|Turn on)\s+autoscal\w*/i);
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
  assert.match(skill, /TOVU_SITE_KEY/);

  // As of 2026-09-09 (ddfa5e07) all three are boot-blocking — TOVU_SITE_KEY's old
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
  const machines = await readFile(path.join(OVERLAY_HOST_DIR, "machines-api-path.md"), "utf8");
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

test("Fly owns ops, config and FlyV1 scheme with no static publish target, and seeds disabled", async () => {
  const { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED } = await import("../../../../apps/website/src/features/agent-plugins/bundled-catalog.ts");
  const manifest = JSON.parse(await readPackageFile("plugin.json"));
  assert.equal(manifest.extensions.tovu.id, "tovu/fly");
  assert.equal(manifest.extensions.tovu.displayName, "Fly.io");
  assert.deepEqual(manifest.extensions.tovu.provides, ["deploy-ops:fly", "deploy-config:fly", "credential-scheme:fly-io"]);
  assert.deepEqual(JSON.parse(await readPackageFile("tovu-deploy-ops.json")).platforms.map((entry) => entry.id), ["fly"]);
  assert.deepEqual(JSON.parse(await readPackageFile("tovu-deploy-configs.json")).generators.map((entry) => entry.id), ["fly"]);
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);
  assert.ok(packed.files.includes("deploy-ops/fly.mjs"));
  assert.ok(packed.files.includes("deploy-configs/fly.mjs"));
  assert.ok(packed.files.includes("tovu-credential-schemes.json"));
  assert.ok(!packed.files.includes("tovu-deploy-targets.json"));
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has("fly"), false);
});
