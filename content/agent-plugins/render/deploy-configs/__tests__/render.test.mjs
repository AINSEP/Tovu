// Moved from core's apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-config-render.unit.test.ts (types stripped): vendor tests live with
// the vendor plugin; the host kits and fixtures it drives are still core's real ones, imported by path.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { load as parseYaml } from "js-yaml";

import { runDeployConfigCommand } from "../../../../../apps/website/src/cli/commands/deploy-config.ts";

import { ValidationError } from "../../../../../apps/website/src/platform/site-dir/index.ts";

import { createDeployConfigKit } from "../../../../../apps/website/src/features/deployments/deploy-config.ts";

/** The bundled `render` plugin's generator module, imported from its source like the other bundled-deploy tests. */
const MODULE_PATH = path.resolve(import.meta.dirname, "../render.mjs");
const imported = (await import(pathToFileURL(MODULE_PATH).href));
const RENDER_VALID_REGIONS = imported.RENDER_VALID_REGIONS;

/** The module's `render` with the real host kit, under the name the core renderer had before it moved. */
function renderRenderYaml(descriptor, options) {
  return imported.default.render(descriptor, options, createDeployConfigKit());
}

/**
 * @file `renderRenderYaml` against a KNOWN, hand-fixed descriptor — exact-string assertions, same
 * discipline as `content/agent-plugins/fly/deploy-configs/__tests__/fly.test.mjs`.
 */

const FIXTURE_DESCRIPTOR = {
  appName: "acme-app",
  port: 4000,
  dockerfilePath: "Dockerfile",
  volumeMountPath: "/workspace/Tovu/sites",
  volumeName: "acme_sites",
  healthCheckPath: "/readyz",
  secrets: [
    { name: "TOVU_ADMIN_PASSWORD", requirement: "boot-blocking" },
    { name: "TOVU_SITE_KEY", requirement: "recommended" },
  ],
};

test("renderRenderYaml: exact render.yaml contents for a known descriptor and region", () => {
  const result = renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "frankfurt" });

  assert.equal(result.filename, "render.yaml");
  assert.equal(
    result.contents,
    `services:
  - type: web
    name: acme-app
    runtime: docker
    plan: starter
    region: frankfurt
    healthCheckPath: /readyz
    envVars:
      - key: TOVU_RUNTIME_MODE
        value: production
      - key: PORT
        value: "4000"
      - key: TOVU_ADMIN_PASSWORD
        sync: false
      - key: TOVU_SITE_KEY
        sync: false
    disk:
      name: acme_sites
      mountPath: /workspace/Tovu/sites
      sizeGB: 10
`
  );
});

test("renderRenderYaml: never emits a secret VALUE — sync: false prompts in the Dashboard instead", (t) => {
  const previousPassword = process.env.TOVU_ADMIN_PASSWORD;
  const sentinel = "deployment-secret-value-must-never-escape-9374";
  process.env.TOVU_ADMIN_PASSWORD = sentinel;
  t.after(() => {
    if (previousPassword === undefined) delete process.env.TOVU_ADMIN_PASSWORD;
    else process.env.TOVU_ADMIN_PASSWORD = previousPassword;
  });
  const result = renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "frankfurt" });

  assert.match(result.contents, /- key: TOVU_ADMIN_PASSWORD\n {8}sync: false/);
  assert.match(result.contents, /- key: TOVU_SITE_KEY\n {8}sync: false/);
  assert.ok(!result.contents.includes(sentinel), "generated config must not contain the environment secret");
  assert.ok(!JSON.stringify(result.notes).includes(sentinel), "instructions must not contain the environment secret");
});

test("renderRenderYaml: notes state the headless-Chromium opt-in — the Dockerfile default is off (owner decision 2026-10-08)", () => {
  const result = renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "frankfurt" });
  assert.ok(
    result.notes.some((note) => note.includes("set the environment variable TOVU_INSTALL_BROWSER=1 on this service")),
    JSON.stringify(result.notes),
  );
  assert.ok(!result.contents.includes("TOVU_INSTALL_BROWSER"), "off stays the default: render.yaml itself never opts in");
});

test("renderRenderYaml: rejects a missing region rather than defaulting to Render's own \"oregon\" default", () => {
  assert.throws(() => renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "" }), ValidationError);
});

test("renderRenderYaml: rejects a region outside Render's own enum, e.g. a Fly region code", () => {
  assert.throws(() => renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "iad" }), ValidationError);
});

test("renderRenderYaml: accepts every documented Render region", () => {
  const expectedRegions = ["oregon", "ohio", "virginia", "frankfurt", "singapore"];
  assert.deepEqual(RENDER_VALID_REGIONS, expectedRegions);
  for (const region of expectedRegions) {
    const result = renderRenderYaml(FIXTURE_DESCRIPTOR, { region });
    assert.match(result.contents, new RegExp(`region: ${region}\\n`));
  }
});

test("renderRenderYaml: rejects a quote- or newline-bearing appName/volumeName (regression, same class of bug as the Fly TOML injection)", () => {
  assert.throws(() => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, appName: 'evil"\nsome_key: x' }, { region: "frankfurt" }), ValidationError);
  assert.throws(() => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, volumeName: 'evil"\nsome_key: x' }, { region: "frankfurt" }), ValidationError);
});

/**
 * Regression for the UNQUOTED-YAML-scalar hole: `assertNoConfigInjection` (`deploy-config.ts`)
 * rejected only `"`/newline/CR, but `renderRenderYaml`'s `name: ${descriptor.appName}` and disk
 * `name: ${descriptor.volumeName}` lines are unquoted plain YAML scalars — a `:`, `#`, `{`, `[`,
 * `&`, `*`, or a leading `-`/leading-trailing space in either field changes what the scalar means
 * (or makes the file invalid) with none of those characters tripping the old guard. Each case
 * asserts the EXACT thrown message, and the appName cases are mirrored onto volumeName since both
 * flow through the same unquoted `name:` sink.
 */
test("renderRenderYaml: rejects a colon in appName/volumeName — would end the plain scalar and start a new YAML key", () => {
  assert.throws(
    () => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, appName: "evil:app" }, { region: "frankfurt" }),
    (err) =>
      err instanceof ValidationError &&
      err.message ===
        'the derived Render service name (fly.toml\'s app) ("evil:app") contains a YAML-significant character (one of : # { [ & *), which would corrupt an unquoted YAML scalar in the generated config file'
  );
  assert.throws(
    () => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, volumeName: "evil:vol" }, { region: "frankfurt" }),
    (err) =>
      err instanceof ValidationError &&
      err.message ===
        'the derived Render disk name (fly.toml\'s [[mounts]].source) ("evil:vol") contains a YAML-significant character (one of : # { [ & *), which would corrupt an unquoted YAML scalar in the generated config file'
  );
});

test("renderRenderYaml: rejects a hash in appName — would start an inline YAML comment mid-scalar", () => {
  assert.throws(
    () => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, appName: "evil#app" }, { region: "frankfurt" }),
    (err) =>
      err instanceof ValidationError &&
      err.message ===
        'the derived Render service name (fly.toml\'s app) ("evil#app") contains a YAML-significant character (one of : # { [ & *), which would corrupt an unquoted YAML scalar in the generated config file'
  );
});

test("renderRenderYaml: rejects a curly brace in appName — would open a YAML flow mapping", () => {
  assert.throws(
    () => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, appName: "evil{app}" }, { region: "frankfurt" }),
    (err) =>
      err instanceof ValidationError &&
      err.message ===
        'the derived Render service name (fly.toml\'s app) ("evil{app}") contains a YAML-significant character (one of : # { [ & *), which would corrupt an unquoted YAML scalar in the generated config file'
  );
});

test("renderRenderYaml: rejects a leading hyphen in volumeName — would read as a YAML block-sequence entry", () => {
  assert.throws(
    () => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, volumeName: "-evilvol" }, { region: "frankfurt" }),
    (err) =>
      err instanceof ValidationError &&
      err.message ===
        'the derived Render disk name (fly.toml\'s [[mounts]].source) ("-evilvol") starts with "-" or has leading/trailing whitespace, which would corrupt an unquoted YAML scalar in the generated config file'
  );
});

test("renderRenderYaml: a normal appName/volumeName still renders byte-identically to before this fix (happy path unmoved)", () => {
  // Same FIXTURE_DESCRIPTOR ("acme-app" / "acme_sites") as the exact-content test above — pinned
  // again here, right next to the new reject-list cases, so a reviewer can see side by side that
  // widening the guard (deploy-config.ts's assertNoConfigInjection) never touched what an
  // already-safe name renders as; it only ever rejects additional unsafe ones.
  const result = renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "frankfurt" });
  assert.match(result.contents, /^ {4}name: acme-app$/m);
  assert.match(result.contents, /^ {6}name: acme_sites$/m);
});

/** The service's envVars as a plain map: secrets map to `{ sync: false }`, values to their string. */
function envVarsOf(contents) {
  const [service] = parseYaml(contents).services;
  return Object.fromEntries(service.envVars.map(({ key, ...rest }) => [key, "value" in rest ? rest.value : rest]));
}

/**
 * Bug class: a generator silently dropping the `options.env` the CLI stamps (bug 376 — Render
 * ignored it, so `tovu deploy config --target render` printed "stamped TOVU_SITE_ID=…" and then
 * deployed a server that would mint a different site identity). Driven the way an operator hits it.
 */
test("tovu deploy config --target render carries the local site's TOVU_SITE_ID into render.yaml", async (t) => {
  const site = await mkdtemp(path.join(tmpdir(), "tovu-render-site-")); t.after(() => rm(site, { recursive: true, force: true }));
  await writeFile(path.join(site, ".site-meta.json"), JSON.stringify({ siteId: "site-uuid-render" }));
  const out = []; const err = [];
  await runDeployConfigCommand({ target: "render", region: "oregon" }, {
    env: { TOVU_SITE_DIR: site }, stdout: (m) => { out.push(m); }, stderr: (m) => { err.push(m); },
  });
  assert.ok(err.some((line) => line.includes("stamped TOVU_SITE_ID=site-uuid-render")), err.join(""));
  assert.equal(envVarsOf(out[0]).TOVU_SITE_ID, "site-uuid-render", "the stamped id must reach the deployed service");
});

test("renderRenderYaml: options.env values are quoted YAML strings that parse back exactly, and may override the defaults", () => {
  const value = 'https://example.test/a?next="quoted"\\path\n- key: EVIL\r\t#x: y \u007f\u0085\u0090';
  const result = renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "frankfurt", env: { TOVU_PUBLIC_URL: value, PORT: "4321" } });
  assert.deepEqual(envVarsOf(result.contents), {
    TOVU_RUNTIME_MODE: "production", PORT: "4321", TOVU_PUBLIC_URL: value,
    TOVU_ADMIN_PASSWORD: { sync: false }, TOVU_SITE_KEY: { sync: false },
  });
  assert.equal((result.contents.match(/- key: PORT$/gm) ?? []).length, 1, "an override emits a single PORT entry");
  assert.ok(!/[\u007f-\u009f]/.test(result.contents), "YAML-non-printable characters are escaped, never raw");
});

test("renderRenderYaml: an empty env map renders byte-identically to no env map", () => {
  assert.equal(renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "frankfurt", env: {} }).contents,
    renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "frankfurt" }).contents);
});

test("renderRenderYaml: rejects invalid env names, non-string values and declared secret names without echoing the value", () => {
  for (const env of [{ "BAD\n- key": "value" }, { BAD: 123 }, { TOVU_ADMIN_PASSWORD: "never-include-this-value" }]) {
    assert.throws(() => renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "frankfurt", env }),
      (error) => error instanceof ValidationError && !error.message.includes("never-include-this-value"));
  }
});

test("render is a seeded-disabled package with its config and deploy-ops descriptors, modules and skill packed", async () => {
  const { readFile } = await import("node:fs/promises");
  const { packAgentPluginDirectory, BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED } = await import("../../../../../apps/website/src/features/agent-plugins/lifecycle.ts");
  const { loadDeployConfigGeneratorsFromSource } = await import("../../../../../apps/website/src/features/deployments/deploy-config-registry.ts");
  const packageRoot = path.dirname(path.dirname(MODULE_PATH));
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "plugin.json"), "utf8"));
  assert.equal(manifest.name, "render");
  assert.equal(manifest.extensions.tovu.id, "tovu/render");
  assert.equal(manifest.extensions.tovu.displayName, "Render");
  assert.deepEqual(manifest.extensions.tovu.provides, ["deploy-config:render", "deploy-ops:render"]);
  assert.deepEqual(JSON.parse(await readFile(path.join(packageRoot, "mcp.json"), "utf8")).mcpServers, {});
  const registry = await loadDeployConfigGeneratorsFromSource({ pluginId: "render", packageRoot });
  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(registry.list().map(item => item.descriptor.id), ["render"]);
  const packed = await packAgentPluginDirectory(packageRoot);
  for (const file of ["plugin.json", "mcp.json", "tovu-deploy-configs.json", "deploy-configs/render.mjs", "skills/render/SKILL.md", "tovu-deploy-ops.json", "deploy-ops/render.mjs"]) assert.ok(packed.files.includes(file), file);
  assert.ok(!packed.files.includes("tovu-deploy-targets.json"));
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has("render"), false);
});
