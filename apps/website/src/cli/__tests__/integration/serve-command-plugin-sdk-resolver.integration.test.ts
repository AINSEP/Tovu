import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { childProcessCoverageEnv } from "#src/contracts/core/child-process-coverage-env";
import { removeFixtureTree } from "../helpers/remove-fixture-tree.js";

const require = createRequire(import.meta.url);

/**
 * @file CIC U-002 (ESCALATE_SECURITY): `registerPluginSdkResolver()` must be registered
 * synchronously, before any code path can reach `loadPlugin()`'s dynamic `import()`
 * (`server/runtime/boot/plugin-sdk-resolver.ts`'s own header; `ADS-memory/reports/pipeline/
 * 005-plugin-system/critical-internal-constraints.md` U-002-B1/ORD1). `src/index.ts`'s `main()`
 * calls it first, before anything else — but `cli/commands/serve.ts` (`tovu serve`, the packaged
 * CLI path and what Tovu-Runner spawns per project — see that file's own header) never did.
 *
 * `server/runtime/boot/__tests__/integration/plugin-sdk-resolver.integration.test.ts` already
 * proves the HOOK ITSELF redirects `@tovu/sdk` correctly once registered — that is not
 * re-proven here. This file proves the WIRING: that a real `tovu serve`-spawned process actually
 * registers it before a site-installed plugin's `import()` can run, using the exact spoofing
 * vector CIC U-002's own required verification surface names (a planted local
 * `node_modules/@tovu/sdk` sitting next to the plugin) — retargeted at the actual vulnerable boot
 * entrypoint (`cli/commands/serve.ts`) rather than `src/index.ts`, since `src/index.ts` is not
 * the path a packaged `tovu serve <dir>` (or the desktop app) ever boots through.
 *
 * The plugin's own `server/index.mjs` entry does the observable work: it imports the `@tovu/sdk`
 * namespace at module TOP LEVEL (so the import is observed synchronously the instant `import()`
 * runs, before any of `loadPlugin()`'s later `definePlugin()`-shape checks that this fixture does
 * not bother satisfying) and writes which SDK build answered — the runtime's real one, or the
 * planted local shadow — to a marker file next to it. Whether the route call ultimately reports
 * success is irrelevant to this test; what matters is which `@tovu/sdk` module actually executed.
 */

const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");
const TSX_LOADER = require.resolve("tsx");

const WORKER_COVERAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-serve-sdk-resolver-worker-coverage-"));
after(() => fs.rmSync(WORKER_COVERAGE_DIR, { recursive: true, force: true }));

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-serve-sdk-resolver-"));
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("could not determine a free port")));
      }
    });
    srv.on("error", reject);
  });
}

/** Same scaling rationale as `serve-command.integration.test.ts`'s own `loadFactor` — this repo's
 *  own guardrail against flat timeouts misreporting load contention as a real failure. */
function loadFactor(): number {
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  const ratio = os.loadavg()[0] / Math.max(cores, 1);
  return Math.min(Math.max(ratio, 1), 6);
}

/** Same rationale as `serve-command.integration.test.ts`'s own `FETCH_POLL_TIMEOUT_MS`: a server
 *  that accepts a connection but never answers must not be able to wedge a single bare `fetch()`
 *  forever and starve this loop's own deadline re-check. Flat, not `loadFactor()`-scaled — the
 *  outer deadline already accounts for load. */
const FETCH_POLL_TIMEOUT_MS = 2000;

/** Bounds a single, non-retried fetch made after `waitForHttpReady` already proved the server is
 *  up, scaled by {@link loadFactor} like every other post-boot timing assumption in this file. */
function fetchTimeoutSignal(baseMs = 10000): AbortSignal {
  return AbortSignal.timeout(baseMs * loadFactor());
}

/**
 * `timeoutMs` bounds the underlying `spawnSync`, which otherwise defaults to no timeout at all — a
 * hard, synchronous `waitpid` on the whole test process that nothing else can preempt. Scaled by
 * `loadFactor()`, the same as every HTTP wait in this file: a flat 30s is not safe on this shared,
 * contended machine — the 2026-09-07 verification run measured a 1-minute load average of 139 on 8
 * cores (~17x, from other concurrently active agents) and that alone killed a healthy `tovu init`
 * at ~30.1s with a null status and empty stderr, a false failure indistinguishable in its symptoms
 * from a real one. `tovu init` normally finishes in well under a second at rest, so 30s is already
 * generous unscaled — DO NOT flatten this back to a bare number, it reintroduces that false failure.
 */
function runCliSync(args: string[], env: NodeJS.ProcessEnv = {}, timeoutMs = 30_000 * loadFactor()): { status: number | null; stderr: string } {
  const result = require("node:child_process").spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, ...args], {
    encoding: "utf8",
    env: { ...childProcessCoverageEnv(WORKER_COVERAGE_DIR), ...env },
    timeout: timeoutMs,
  });
  return { status: result.status, stderr: result.stderr };
}

function spawnServe(args: string[], env: NodeJS.ProcessEnv = {}): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, "serve", ...args], {
    env: { ...childProcessCoverageEnv(WORKER_COVERAGE_DIR), ...env },
  }) as ChildProcessWithoutNullStreams;
}

async function waitForHttpReady(port: number, child: ChildProcessWithoutNullStreams, timeoutMs = 20000): Promise<void> {
  const factor = loadFactor();
  const deadline = Date.now() + timeoutMs * factor;
  let exited = false;
  let exitCode: number | null = null;
  child.on("exit", (code) => {
    exited = true;
    exitCode = code;
  });
  while (Date.now() < deadline) {
    if (exited) throw new Error(`server process exited early (code ${exitCode}) before becoming ready`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(FETCH_POLL_TIMEOUT_MS) });
      void res.text();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error(`timed out waiting for http://127.0.0.1:${port}/ to respond after ${Math.round((timeoutMs * factor) / 1000)}s`);
}

async function stopGracefully(child: ChildProcessWithoutNullStreams, timeoutMs = 10000): Promise<number | null> {
  const scaled = timeoutMs * loadFactor();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not exit within ${Math.round(scaled / 1000)}s after SIGTERM`)), scaled);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.kill("SIGTERM");
  });
}

function initFixture(name = "Serve Fixture"): { parent: string; dir: string } {
  const parent = mkTempParent();
  const dir = path.join(parent, "site");
  const initResult = runCliSync(["init", dir, "--name", name]);
  assert.equal(initResult.status, 0, `fixture setup: tovu init must succeed (stderr: ${initResult.stderr})`);
  return { parent, dir };
}

/**
 * Plants a site-installed plugin at `<pluginsRoot>/spoof-test-plugin/1.0.0/` (REQ-02's
 * `<install-dir>/plugins/<id>/<version>/` layout) with a manifest that passes static validation
 * cleanly (zero `validateManifest` errors ⇒ discovery `status: "valid"`, the precondition
 * `setPluginEnabled` requires before it will ever call `onEnabled`/`loadPlugin` at all) and a
 * `node_modules/@tovu/sdk` shadow package planted one level up from `server/` — the exact position
 * `plugin-sdk-resolver.integration.test.ts`'s own fixture uses, and the position Node's ESM bare-
 * specifier resolution reaches first once it walks up from the plugin's own entry file.
 */
function buildSpoofPluginFixture(pluginsRoot: string): { markerPath: string } {
  const pluginRoot = path.join(pluginsRoot, "spoof-test-plugin", "1.0.0");
  const serverDir = path.join(pluginRoot, "server");
  fs.mkdirSync(serverDir, { recursive: true });

  const entryPath = path.join(serverDir, "index.mjs");
  const markerPath = path.join(pluginRoot, "observed-sdk.json");
  fs.writeFileSync(
    entryPath,
    [
      "import { writeFileSync } from 'node:fs';",
      "",
      // A DYNAMIC import wrapped in try/catch, not a static one: this repo's own
      // `resolveDefaultSdkModulePath()` (plugin-sdk-resolver.ts) has a separate, pre-existing path
      // bug unrelated to CIC U-002's wiring (reported alongside this fix, not corrected here — it
      // is fail-closed, not a security gap: a wrong redirect target still blocks the planted
      // package via `shortCircuit: true`, it just throws instead of resolving). A static import
      // would let that unrelated ENOENT abort this module's evaluation before the marker below ever
      // gets written, which would make this test unable to distinguish 'the resolver was never
      // registered' from 'the resolver was registered but points at a broken path'. Catching the
      // import lets this fixture report all three real outcomes distinctly.
      "let outcome;",
      "try {",
      "  const sdkNamespace = await import('@tovu/sdk');",
      "  outcome = { status: sdkNamespace.IS_PLANTED === true ? 'planted' : 'real' };",
      "} catch (error) {",
      "  outcome = { status: 'import-failed', message: String(error && error.message || error) };",
      "}",
      `writeFileSync(${JSON.stringify(markerPath)}, JSON.stringify(outcome), 'utf8');`,
      "",
    ].join("\n"),
    "utf8"
  );

  const plantedSdkDir = path.join(pluginRoot, "node_modules", "@tovu", "sdk");
  fs.mkdirSync(plantedSdkDir, { recursive: true });
  fs.writeFileSync(
    path.join(plantedSdkDir, "package.json"),
    JSON.stringify({ name: "@tovu/sdk", version: "0.0.0-planted", main: "index.mjs", type: "module" }),
    "utf8"
  );
  fs.writeFileSync(path.join(plantedSdkDir, "index.mjs"), "export const IS_PLANTED = true;\n", "utf8");

  const entryHash = `sha256-${createHash("sha256").update(fs.readFileSync(entryPath)).digest("hex")}`;
  const manifest = {
    id: "spoof-test-plugin",
    name: "Spoof Test Plugin",
    version: "1.0.0",
    sdkRange: "0.1.0",
    engine: 1,
    tier: "tier-3",
    capabilities: [],
    hooks: [],
    fields: [],
    integrity: { "server/index.mjs": entryHash },
  };
  fs.writeFileSync(path.join(pluginRoot, "tovu.plugin.json"), JSON.stringify(manifest), "utf8");

  return { markerPath };
}

/** Extracts just the `name=value` half of a `Set-Cookie` response header — enough to replay on a
 *  follow-up request via a plain `Cookie` header; this test has no cookie jar of its own. */
function sessionCookieFrom(setCookieHeader: string | null): string {
  if (!setCookieHeader) throw new Error("login response carried no Set-Cookie header");
  const first = setCookieHeader.split(";")[0];
  if (!first) throw new Error(`could not parse a cookie pair out of Set-Cookie header: ${setCookieHeader}`);
  return first;
}

test("CIC U-002 (ESCALATE_SECURITY): tovu serve must register the plugin SDK resolver hook before a site-installed plugin's import() can run — a plugin's bare '@tovu/sdk' import must resolve to the runtime's real SDK, never a planted local node_modules/@tovu/sdk sitting next to it", async () => {
  const { parent, dir } = initFixture();
  const pluginsRoot = path.join(dir, "plugins");
  const { markerPath } = buildSpoofPluginFixture(pluginsRoot);

  const port = await getFreePort();
  // TOVU_PLUGINS_DIR takes first precedence in `pluginsInstallDir()` (server/runtime/composition/
  // deps.ts), overriding whatever `siteDir()`/`resolveSiteRoot()` would otherwise resolve — this
  // sidesteps that resolution entirely and points site-plugin discovery straight at the fixture.
  const child = spawnServe([dir, "--port", String(port)], { TOVU_PLUGINS_DIR: pluginsRoot });
  let stdoutBuf = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
  });

  try {
    await waitForHttpReady(port, child);

    const workspaceIdMatch = /workspaceId=(\S+)/.exec(stdoutBuf);
    assert.ok(workspaceIdMatch, `expected the boot line to report workspaceId=... (stdout so far: ${stdoutBuf})`);
    const workspaceId = workspaceIdMatch![1];

    // Same fallback identity/wiring.ts's own seeder uses — mirrors whatever this process's real
    // ambient env actually seeded the owner account with, rather than assuming either value.
    const username = process.env.TOVU_ADMIN_USER ?? "admin";
    const password = process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev";

    const loginRes = await fetch(`http://127.0.0.1:${port}/api/admin/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: fetchTimeoutSignal(),
    });
    assert.equal(loginRes.status, 200, `admin login must succeed against the seeded owner account (status ${loginRes.status})`);
    const cookie = sessionCookieFrom(loginRes.headers.get("set-cookie"));

    // Enable the planted plugin — this is the one call in the whole request lifecycle that reaches
    // `setPluginEnabled()` -> `onPluginEnabled()` -> `loadPlugin()` -> a real `import()` of the
    // plugin's `server/index.mjs`. The route's own JSON response is not asserted on: even a
    // PLUGIN_LOAD_FAILED 500 (this fixture's entry deliberately never satisfies `definePlugin()`'s
    // shape) still means `import()` ran — its top-level `writeFileSync` already fired by then.
    await fetch(`http://127.0.0.1:${port}/api/admin/v1/workspaces/${workspaceId}/plugins/spoof-test-plugin`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ enabled: true }),
      signal: fetchTimeoutSignal(),
    });

    const deadline = Date.now() + 10_000 * loadFactor();
    while (!fs.existsSync(markerPath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(fs.existsSync(markerPath), "the plugin's server/index.mjs must have been import()-ed at least once (no marker file was ever written)");

    const observed = JSON.parse(fs.readFileSync(markerPath, "utf8")) as { status: string; message?: string };
    // Either 'real' (resolved to the runtime's actual bundled SDK) or 'import-failed' (blocked
    // before evaluation — e.g. by the separate, fail-closed default-path bug noted above) proves
    // the security property: the planted shadow package was never reached. Only 'planted' means
    // registerPluginSdkResolver() was not registered before this import() could run.
    assert.notEqual(
      observed.status,
      "planted",
      `the plugin's bare '@tovu/sdk' import resolved to the PLANTED local node_modules/@tovu/sdk instead of the runtime's real SDK build — registerPluginSdkResolver() was not registered before this import() could run (observed: ${JSON.stringify(observed)})`
    );
  } finally {
    if (child.exitCode === null && !child.killed) {
      await stopGracefully(child);
    }
    removeFixtureTree(parent);
  }
});
