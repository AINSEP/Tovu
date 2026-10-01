import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { childProcessCoverageEnv } from "#src/contracts/core/child-process-coverage-env";

const require = createRequire(import.meta.url);

/**
 * @file CIC U-002 (ESCALATE_SECURITY): `registerPluginSdkResolver()` must be registered
 * synchronously, before any code path can reach `loadPlugin()`'s dynamic `import()`
 * (`server/runtime/boot/plugin-sdk-resolver.ts`'s own header;
 * `ADS-memory/reports/pipeline/005-plugin-system/critical-internal-constraints.md` U-002-B1/ORD1).
 * `cli/commands/export.ts` (`tovu export`) builds the same `createSiteRouteDeps()` composition
 * root as `cli/commands/serve.ts` — always wiring a real plugin `installDir` — and its own
 * `exportSite()` boots the same `createApp()`-equivalent internally, but never called
 * `registerPluginSdkResolver()` either.
 *
 * Unlike `serve-command-plugin-sdk-resolver.integration.test.ts` (which drives the full attacker
 * path — plant a shadow `node_modules/@tovu/sdk`, enable the plugin over the real admin route,
 * observe which SDK a real `import()` resolved to), this file proves the narrower WIRING claim
 * directly: `registerPluginSdkResolver()` throws `PluginSdkResolverAlreadyRegisteredError` on any
 * second call in the same process (proven generically by
 * `server/runtime/boot/__tests__/integration/plugin-sdk-resolver.integration.test.ts`), so calling
 * it again immediately after `runExportCommand()` resolves is an observable proof that
 * `runExportCommand()`'s own boot sequence already registered it once. `exportSite()`'s internal
 * listener is too short-lived to reliably drive a real HTTP plugin-enable round trip against it from
 * outside the process, which is why this file uses the signal-based proof instead of repeating the
 * heavier end-to-end technique for this second, structurally identical sink.
 *
 * Runs `runExportCommand()` in-process inside a freshly spawned Node process (not via the `tovu`
 * CLI's own argv parsing — this is the export ENGINE'S wiring, not the CLI flag-parsing layer
 * `export-command.integration.test.ts` already covers) so `node:test`'s per-file process isolation
 * (see the resolver test's own comment) keeps this file's `registerPluginSdkResolver()` calls from
 * colliding with any other test's.
 */

const TSX_LOADER = require.resolve("tsx");
const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");
const EXPORT_COMMAND_MODULE = path.resolve(import.meta.dirname, "../../commands/export.ts");
const PLUGIN_SDK_RESOLVER_MODULE = path.resolve(
  import.meta.dirname,
  "../../../server/runtime/boot/plugin-sdk-resolver.ts"
);

const WORKER_COVERAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-export-sdk-resolver-worker-coverage-"));
after(() => fs.rmSync(WORKER_COVERAGE_DIR, { recursive: true, force: true }));

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-export-sdk-resolver-"));
}

function runCliSync(args: string[]): { status: number | null; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, ...args], {
    encoding: "utf8",
    env: childProcessCoverageEnv(WORKER_COVERAGE_DIR),
  });
  return { status: result.status, stderr: result.stderr };
}

/**
 * A throwaway probe script (written to disk at test time, not checked in): calls the real
 * `runExportCommand()` against a real, already-`tovu init`-ed site dir, then — regardless of
 * whether the export itself succeeded — immediately calls `registerPluginSdkResolver()` a second
 * time in the SAME process and reports on stdout whether it threw the specific
 * `PluginSdkResolverAlreadyRegisteredError`. That is only possible if something before it (i.e.
 * `runExportCommand()` itself) already registered the hook once.
 */
function buildProbeScript(dir: string, outDir: string, resultPath: string, pluginPath: string): string {
  // Writes its result to a FILE, not stdout: `runExportCommand()`'s own success path
  // (`printExportReport`) writes real report lines straight to `process.stdout`, which would
  // otherwise collide with (and precede) this probe's own output on the same stream.
  return [
    "import { writeFileSync } from 'node:fs';",
    "import { mock } from 'node:test';",
    `const bootUrl = ${JSON.stringify(pathToFileURL(path.resolve(import.meta.dirname, "../../../platform/site-dir/boot-site-dir.ts")).href)};`,
    "const boot = await import(bootUrl);",
    `const resolver = await import(${JSON.stringify(PLUGIN_SDK_RESOLVER_MODULE)});`,
    "let sdkAtBoot = false;",
    // Import at the first boot boundary, where plugin-loading dependencies become reachable.
    // Stop at this boundary after the import; the later crawl is irrelevant to boot ordering.
    "mock.module(bootUrl, { namedExports: { ...boot, bootSiteDir: async () => {",
    `  const plugin = await import(${JSON.stringify(pathToFileURL(pluginPath).href)});`,
    "  const runtimeSdk = await import((await import('node:url')).pathToFileURL(resolver.resolveDefaultSdkModulePath()).href);",
    "  sdkAtBoot = plugin.sdk === runtimeSdk;",
    "  throw new Error('boot boundary observed');",
    "} } });",
    `const { runExportCommand } = await import(${JSON.stringify(EXPORT_COMMAND_MODULE)});`,
    `const { registerPluginSdkResolver, PluginSdkResolverAlreadyRegisteredError } = await import(${JSON.stringify(PLUGIN_SDK_RESOLVER_MODULE)});`,
    "try {",
    `  await runExportCommand({ dir: ${JSON.stringify(dir)}, out: ${JSON.stringify(outDir)} });`,
    "} catch {",
    "  // Irrelevant to this test — a route/crawl failure says nothing about boot-sequence wiring.",
    "}",
    "let alreadyRegistered;",
    "try {",
    "  registerPluginSdkResolver();",
    "  alreadyRegistered = false;",
    "} catch (error) {",
    "  alreadyRegistered = error instanceof PluginSdkResolverAlreadyRegisteredError;",
    "}",
    `writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({ alreadyRegistered, sdkAtBoot }), 'utf8');`,
    "",
  ].join("\n");
}

test("CIC U-002 (ESCALATE_SECURITY): tovu export's runExportCommand() must register the plugin SDK resolver hook during its own boot sequence, mirroring src/index.ts's and cli/commands/serve.ts's ordering — not just wire it for the serve path and leave this structurally identical sink unregistered", () => {
  const parent = mkTempParent();
  try {
    const dir = path.join(parent, "site");
    const outDir = path.join(parent, "out");
    const init = runCliSync(["init", dir, "--name", "Export SDK Resolver Fixture"]);
    assert.equal(init.status, 0, `fixture setup: tovu init must succeed (stderr: ${init.stderr})`);

    const probeScriptPath = path.join(parent, "probe.mjs");
    const resultPath = path.join(parent, "probe-result.json");
    const pluginDir = path.join(parent, "plugin", "server");
    const plantedSdkDir = path.join(parent, "plugin", "node_modules", "@tovu", "sdk");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(plantedSdkDir, { recursive: true });
    fs.writeFileSync(path.join(plantedSdkDir, "package.json"), JSON.stringify({ name: "@tovu/sdk", type: "module", main: "index.mjs" }));
    fs.writeFileSync(path.join(plantedSdkDir, "index.mjs"), "export const planted = true;");
    const pluginPath = path.join(pluginDir, "index.mjs");
    fs.writeFileSync(pluginPath, "import * as sdk from '@tovu/sdk'; export { sdk };");
    fs.writeFileSync(probeScriptPath, buildProbeScript(dir, outDir, resultPath, pluginPath), "utf8");

    const probe = spawnSync(process.execPath, ["--import", TSX_LOADER, "--experimental-test-module-mocks", probeScriptPath], {
      encoding: "utf8",
      env: childProcessCoverageEnv(WORKER_COVERAGE_DIR),
      timeout: 60000,
    });
    assert.equal(probe.status, 0, `probe script must run to completion (stderr: ${probe.stderr})`);
    assert.ok(fs.existsSync(resultPath), `probe script must write its result file (stderr: ${probe.stderr})`);

    const observed = JSON.parse(fs.readFileSync(resultPath, "utf8")) as { alreadyRegistered: boolean; sdkAtBoot: boolean };
    assert.equal(observed.sdkAtBoot, true, "a plugin import at the first boot boundary must use the runtime SDK before export proceeds");
    assert.equal(
      observed.alreadyRegistered,
      true,
      "calling registerPluginSdkResolver() again right after runExportCommand() resolved did NOT throw " +
        "PluginSdkResolverAlreadyRegisteredError — meaning runExportCommand()'s own boot sequence never " +
        "registered it in the first place"
    );
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
