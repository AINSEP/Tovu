import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { load as parseYaml } from "js-yaml";

import { renderFromValues } from "@jini-ai/agent-plugins/fly/scripts/render-deploy-workflow.mjs";
import { runDeployConfigCommand } from "../../../../apps/website/src/cli/commands/deploy-config.ts";
import { createDeployConfigKit, HOST_DEPLOY_ENV } from "../../../../apps/website/src/features/deployments/deploy-config.ts";
import { agentPluginSourceDir } from "../../../../development/test-support/agent-plugin-source.mjs";
import { processComposedBundledSourceRoot } from "../../../../apps/website/src/features/agent-plugins/__tests__/fixtures/bundled-source-root.ts";

/**
 * @file Tovu's half of the Fly deploy-config generator (`@jini-ai/agent-plugins/fly`). Moved from the
 * plugin's own `deploy-configs/__tests__/cli.test.mjs` (itself from core's
 * `apps/website/src/cli/__tests__/unit/deploy-config-command.unit.test.ts`) and the production
 * parity cases of its `fly.test.mjs`: `tovu deploy config --target fly` in-process over the composed
 * bundle (Tovu's HOST_DEPLOY_ENV and this overlay's `deploy-notes.json`), and the production
 * workflow's generation step producing Tovu's live fly.toml. The generator's own output rules are
 * proven in Jini, `packages/agent-plugins/fly/deploy-configs/__tests__/fly.test.mjs`.
 */

// fly ships from @jini-ai/agent-plugins/fly: read it where Tovu takes it from.
const MODULE_PATH = path.join(agentPluginSourceDir({ pluginId: "fly" }), "deploy-configs", "fly.mjs");
const imported = await import(pathToFileURL(MODULE_PATH).href);
const OVERLAY_ROOT = path.resolve(import.meta.dirname, "..");

async function capture() {
  const out = []; const err = [];
  const env = { TOVU_BUNDLED_AGENT_PLUGINS_DIR: await processComposedBundledSourceRoot() };
  return { out, err, ports: { env, stdout: (m) => { out.push(m); }, stderr: (m) => { err.push(m); } } };
}

test("renders the fly config to stdout and its operator notes to stderr, Tovu's Chromium note last", async () => {
  const io = await capture();
  await runDeployConfigCommand({ target: "fly", region: "ams" }, io.ports);
  assert.equal(io.out.length, 1);
  assert.match(io.out[0], /ams/);
  assert.ok(io.err.every((line) => line.startsWith("tovu deploy config: ")));
  // The plugin defaults only PORT; Tovu's production switch follows it in [env].
  assert.match(io.out[0], /\[env\]\n {2}PORT = "\d+"\n {2}TOVU_RUNTIME_MODE = "production"\n/);
  assert.ok(io.err.at(-1).includes("TOVU_INSTALL_BROWSER = \"1\""), io.err.join(""));
});

test("--out writes the rendered fly.toml and reports where", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-deploy-config-out-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const io = await capture();
  const outPath = path.join(dir, "fly.toml");
  await runDeployConfigCommand({ target: "fly", region: "ams", out: outPath }, io.ports);
  const written = await readFile(outPath, "utf8");
  assert.ok(written.length > 0);
  assert.equal(io.out.length, 1);
  assert.match(io.out[0], new RegExp(`^tovu deploy config: wrote \\S+ \\(fly\\) to ${outPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n$`));
});

test("without --region the generator receives an empty region and fly refuses to assume one", async () => {
  const io = await capture();
  await assert.rejects(runDeployConfigCommand({ target: "fly" }, io.ports), { name: "ValidationError", message: /--region is required for --target fly/ });
  assert.deepEqual(io.out, []);
});

const FIXTURE_DESCRIPTOR = {
  appName: "tovu",
  port: 3000,
  dockerfilePath: "Dockerfile",
  volumeMountPath: "/workspace/Tovu/sites",
  volumeName: "tovu_sites",
  healthCheckPath: "/readyz",
  secrets: [
    { name: "TOVU_ADMIN_PASSWORD", requirement: "boot-blocking" },
    { name: "TOVU_SITE_KEY", requirement: "recommended" },
  ],
};

/** Tovu's live fly.toml. The plugin emits PORT first, then the host's variables in the order passed. */
const PRODUCTION_FLY_TOML = `app = "tovu"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[build.args]
  TOVU_INSTALL_BROWSER = "0"

[env]
  PORT = "3000"
  TOVU_RUNTIME_MODE = "production"
  TOVU_SITE = "tovu-com"
  TOVU_SITE_ID = "fly-site-fixture"
  TOVU_PUBLIC_URL = "https://tovu.dev"

[[mounts]]
  source = "tovu_sites"
  destination = "/workspace/Tovu/sites"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    grace_period = "60s"
    interval = "30s"
    method = "GET"
    timeout = "5s"
    path = "/readyz"
`;

test("the plugin with Tovu's kit and HOST_DEPLOY_ENV preserves every production field, including the live volume folder and public origin", () => {
  const result = imported.default.render(FIXTURE_DESCRIPTOR, {
    region: "iad",
    env: { ...HOST_DEPLOY_ENV, TOVU_SITE: "tovu-com", TOVU_SITE_ID: "fly-site-fixture", TOVU_PUBLIC_URL: "https://tovu.dev" },
    buildArgs: { TOVU_INSTALL_BROWSER: "0" },
  }, createDeployConfigKit());
  assert.equal(result.contents, PRODUCTION_FLY_TOML);
});

test("the production workflow's generation step uses the fetched plugin and emits the parity config without npm or a built CLI", (t) => {
  // The workflow as this overlay renders it (fly-overlay.test.mjs proves the committed file equals it).
  const valuesPath = path.join(OVERLAY_ROOT, "tovu-production.values.json");
  const { contents } = renderFromValues({ readFile: (file) => readFileSync(file, "utf8"), valuesPath });
  const workflow = parseYaml(contents);
  const steps = workflow.jobs.deploy.steps;
  const index = steps.findIndex(step => step.name === "Generate Fly config from the plugin");
  assert.ok(index >= 0);
  assert.equal(steps[index + 1].run,
    "flyctl deploy --remote-only --config fly.toml --build-arg TOVU_BUILD_SHA=${{ github.sha }}");
  assert.deepEqual(steps[index + 1].env, { FLY_API_TOKEN: "${{ secrets.FLY_API_TOKEN }}" });
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.ok(!("FLY_API_TOKEN" in workflow.env), "generation receives no Fly credential from workflow inputs");

  // Run only the generation step in a fresh checkout-shaped directory, the plugin where the fetch
  // step unpacks it ($RUNNER_TEMP/plugin-fly/package/fly). No flyctl, npm, TS loader, network, or
  // repo-root output is involved; the actual YAML env/command must produce the golden.
  const root = mkdtempSync(path.join(tmpdir(), "tovu-fly-workflow-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runnerTemp = path.join(root, "runner-temp");
  const moduleCopy = path.join(runnerTemp, "plugin-fly/package/fly/deploy-configs/fly.mjs");
  mkdirSync(path.dirname(moduleCopy), { recursive: true });
  copyFileSync(MODULE_PATH, moduleCopy);
  const checkout = path.join(root, "checkout");
  mkdirSync(checkout);
  const result = spawnSync("bash", ["-eu", "-c", steps[index].run], {
    cwd: checkout, encoding: "utf8",
    env: { PATH: process.env.PATH, ...workflow.env, RUNNER_TEMP: runnerTemp, TOVU_SITE_ID: "fly-site-fixture", TOVU_ADMIN_PASSWORD: "never-render-this-secret" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(path.join(checkout, "fly.toml"), "utf8"), PRODUCTION_FLY_TOML);
});
