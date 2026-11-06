import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { processComposedBundledSourceRootSync } from "../../../features/agent-plugins/__tests__/fixtures/bundled-source-root.js";
import { deployConfigTargetOptionHelp, runDeployConfigCommand } from "../../commands/deploy-config.js";

/**
 * @file `tovu deploy config` in-process over the real bundled hosting plugins (and a throwaway
 * plugin root for refusals), with stdout/stderr/env injected instead of read from the process.
 */

/** A plugin root holding only the neutral `example-host` generator (core stays vendor-neutral). */
const FIXTURE_PLUGINS_DIR = path.resolve(import.meta.dirname, "../fixtures/deploy-config-plugins");

function capture(env: Record<string, string> = {}) {
  const out: string[] = []; const err: string[] = [];
  return { out, err, ports: { env, stdout: (m: string) => { out.push(m); }, stderr: (m: string) => { err.push(m); } } };
}

function captureFixture() {
  return capture({ TOVU_BUNDLED_AGENT_PLUGINS_DIR: FIXTURE_PLUGINS_DIR });
}

test("renders the generator's config to stdout and its operator notes to stderr", async () => {
  const io = captureFixture();
  await runDeployConfigCommand({ target: "example-host", region: "ams" }, io.ports);
  assert.equal(io.out.length, 1);
  assert.match(io.out[0]!, /ams/);
  assert.ok(io.err.every((line) => line.startsWith("tovu deploy config: ")));
});

test("keeps the product's Chromium note when cwd has deployment inputs but no overlays", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-deploy-config-cwd-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pluginRoot = path.join(root, "plugins", "fly");
  await mkdir(pluginRoot, { recursive: true });
  // Reuse the neutral renderer so this pins the CLI's host-note wiring, not Fly's generator rules.
  await writeFile(path.join(pluginRoot, "generator.mjs"), await readFile(path.join(FIXTURE_PLUGINS_DIR, "example-host/deploy-configs/example-host.mjs")));
  await writeFile(path.join(pluginRoot, "plugin.json"), JSON.stringify({ name: "fly", version: "1.0.0" }));
  await writeFile(path.join(pluginRoot, "tovu-deploy-configs.json"), JSON.stringify({ schemaVersion: 1, generators: [{ id: "fly", label: "Fixture host", module: "generator.mjs" }] }));
  // Descriptor inputs still come from cwd; this directory deliberately has no product overlays.
  await writeFile(path.join(root, "Dockerfile"), 'FROM node:24\nVOLUME ["/data/sites"]\nEXPOSE 4321\n');
  // Pretty-printed like the real root package.json: the descriptor reads `"name"` at a line start.
  await writeFile(path.join(root, "package.json"), `${JSON.stringify({ name: "fixture" }, null, 2)}\n`);
  const healthRoute = path.join(root, "apps/website/src/server/inbound/public-http/routes/ops/health.ts");
  await mkdir(path.dirname(healthRoute), { recursive: true });
  await writeFile(healthRoute, 'export const registerReadyzRoute = () => app.get("/readyz", handler);');
  t.mock.method(process, "cwd", () => root);
  const io = capture({ TOVU_BUNDLED_AGENT_PLUGINS_DIR: path.dirname(pluginRoot), TOVU_SITE_DIR: root });

  await runDeployConfigCommand({ target: "fly", region: "ams" }, io.ports);

  assert.match(io.out[0]!, /^app = "fixture"$/m);
  assert.doesNotMatch(io.out[0]!, /Headless Chromium|TOVU_INSTALL_BROWSER/);
  assert.match(io.err[0]!, /example-host volumes create fixture_sites/);
  assert.equal(io.err.length, 2);
  assert.match(io.err[1]!, /^tovu deploy config: Headless Chromium is not installed by default\..*TOVU_INSTALL_BROWSER/);
});

test("the deployed server is named by the local site's .site-meta.json siteId (TOVU_SITE_ID in the generated env)", async (t) => {
  const site = await mkdtemp(path.join(tmpdir(), "tovu-deploy-config-site-")); t.after(() => rm(site, { recursive: true, force: true }));
  const io = capture({ TOVU_BUNDLED_AGENT_PLUGINS_DIR: FIXTURE_PLUGINS_DIR, TOVU_SITE_DIR: site });
  await runDeployConfigCommand({ target: "example-host", region: "ams" }, io.ports);
  assert.doesNotMatch(io.out[0]!, /TOVU_SITE_ID/, "a site with no meta (no id yet) adds nothing");
  await writeFile(path.join(site, ".site-meta.json"), JSON.stringify({ siteId: "site-uuid-1234" }));
  await runDeployConfigCommand({ target: "example-host", region: "ams" }, io.ports);
  assert.match(io.out[1]!, /^env\.TOVU_SITE_ID = "site-uuid-1234"$/m);
});

test("a site that cannot be resolved still renders, without TOVU_SITE_ID, and says why on stderr", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-deploy-config-unresolved-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const notADirectory = path.join(dir, "file");
  await writeFile(notADirectory, "x");
  const io = capture({ TOVU_BUNDLED_AGENT_PLUGINS_DIR: FIXTURE_PLUGINS_DIR, TOVU_SITES_HOME: notADirectory });
  await runDeployConfigCommand({ target: "example-host", region: "ams" }, io.ports);
  assert.doesNotMatch(io.out[0]!, /TOVU_SITE_ID/);
  assert.match(io.err[0]!, /^tovu deploy config: the site could not be resolved, so TOVU_SITE_ID is not set: /);
});

test("--out writes the rendered file and reports where", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-deploy-config-out-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const io = captureFixture();
  const outPath = path.join(dir, "example-host.conf");
  await runDeployConfigCommand({ target: "example-host", region: "ams", out: outPath }, io.ports);
  const written = await readFile(outPath, "utf8");
  assert.ok(written.length > 0);
  assert.equal(io.out.length, 1);
  assert.match(io.out[0]!, new RegExp(`^tovu deploy config: wrote \\S+ \\(example-host\\) to ${outPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n$`));
});

test("without --region the generator receives an empty region and refuses to assume one", async () => {
  const io = captureFixture();
  await assert.rejects(runDeployConfigCommand({ target: "example-host" }, io.ports), { name: "ValidationError", message: /--region is required for --target example-host/ });
  assert.deepEqual(io.out, []);
});

test("a missing or unknown --target is refused with the loaded ids", async () => {
  // The shipped bundle, as the build composes it: the hosting plugins live in @jini-ai/agent-plugins.
  const io = capture({ TOVU_BUNDLED_AGENT_PLUGINS_DIR: processComposedBundledSourceRootSync() });
  await assert.rejects(runDeployConfigCommand({}, io.ports), { name: "ValidationError", message: '--target must be one of: fly, railway, render (got "")' });
  await assert.rejects(runDeployConfigCommand({ target: "heroku" }, io.ports), { name: "ValidationError", message: /\(got "heroku"\)$/ });
  assert.deepEqual(io.out, []);
});

test("a refused generator is explained on stderr before the target is rejected", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-deploy-config-refusal-")); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "broken"));
  await writeFile(path.join(root, "broken", "plugin.json"), JSON.stringify({ name: "broken", version: "1.0.0" }));
  await writeFile(path.join(root, "broken", "tovu-deploy-configs.json"), JSON.stringify({ schemaVersion: 1, generators: [{ id: "broken", label: "Broken", module: "gen.mjs" }] }));
  await writeFile(path.join(root, "broken", "gen.mjs"), "export const notRender = 1;\n");
  const io = capture();
  await assert.rejects(runDeployConfigCommand({ target: "broken" }, { ...io.ports, env: { TOVU_BUNDLED_AGENT_PLUGINS_DIR: root } }), { name: "ValidationError" });
  assert.equal(io.err.length, 1);
  assert.match(io.err[0]!, /^tovu deploy config: deploy config 'broken' from 'broken' was not loaded: /);
});

test("--target help degrades to the generic text when the plugin root cannot be read", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-deploy-config-help-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const notADirectory = path.join(dir, "file");
  await writeFile(notADirectory, "x");
  assert.equal(deployConfigTargetOptionHelp({ env: { TOVU_BUNDLED_AGENT_PLUGINS_DIR: notADirectory } }), "deploy platform id declared by bundled plugins");
});

test("by default the rendered config goes to stdout", async (t) => {
  const written: string[] = [];
  t.mock.method(process.stdout, "write", (chunk: string) => { written.push(chunk); return true; });
  const errors: string[] = [];
  t.mock.method(process.stderr, "write", (chunk: string) => { errors.push(chunk); return true; });
  const previous = process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR;
  process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = FIXTURE_PLUGINS_DIR;
  try {
    await runDeployConfigCommand({ target: "example-host", region: "ams" });
  } finally {
    t.mock.restoreAll();
    if (previous === undefined) delete process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR; else process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = previous;
  }
  assert.ok(written.some((chunk) => chunk.includes("ams")));
  assert.deepEqual(errors, ["tovu deploy config: Create the volume before the first deploy: example-host volumes create tovu_sites --region ams\n"]);
});

test("--site <name> picks which local site's id is stamped, and stderr says which site it was", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-deploy-config-sites-")); t.after(() => rm(root, { recursive: true, force: true }));
  const siteAt = async (name: string, siteId: string) => {
    const dir = path.join(root, name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "config.json"), "{}");
    await writeFile(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId }));
    return dir;
  };
  const current = await siteAt("current", "site-uuid-current");
  await siteAt("blog", "site-uuid-blog");
  const io = capture({ TOVU_BUNDLED_AGENT_PLUGINS_DIR: FIXTURE_PLUGINS_DIR, TOVU_SITES_HOME: root, TOVU_SITE_DIR: current });
  await runDeployConfigCommand({ target: "example-host", region: "ams", site: "blog" }, io.ports);
  assert.match(io.out[0]!, /^env\.TOVU_SITE_ID = "site-uuid-blog"$/m);
  assert.ok(io.err.some((line) => /^tovu deploy config: stamped TOVU_SITE_ID=site-uuid-blog \(site 'blog' at .*blog\)\n$/.test(line)), io.err.join(""));
  // Without --site, the process's own site (and stderr names it too).
  await runDeployConfigCommand({ target: "example-host", region: "ams" }, io.ports);
  assert.match(io.out[1]!, /^env\.TOVU_SITE_ID = "site-uuid-current"$/m);
  assert.ok(io.err.some((line) => line.includes("stamped TOVU_SITE_ID=site-uuid-current (site 'current'")));
});

test("a site id that is not a short token (a newline, quotes, a long string) is never stamped into the config", async (t) => {
  const site = await mkdtemp(path.join(tmpdir(), "tovu-deploy-config-badid-")); t.after(() => rm(site, { recursive: true, force: true }));
  await writeFile(path.join(site, ".site-meta.json"), JSON.stringify({ siteId: "x\"\nenv.EVIL = \"1" }));
  const io = capture({ TOVU_BUNDLED_AGENT_PLUGINS_DIR: FIXTURE_PLUGINS_DIR, TOVU_SITE_DIR: site });
  await runDeployConfigCommand({ target: "example-host", region: "ams" }, io.ports);
  assert.doesNotMatch(io.out[0]!, /TOVU_SITE_ID|EVIL/);
  assert.ok(io.err.some((line) => /not a valid site id, so TOVU_SITE_ID is not set/.test(line)), io.err.join(""));
});
