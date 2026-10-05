import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

import type { SiteRenderContext } from "../render.js";
import { renderInWorkerSandbox } from "../worker-sandbox.js";

test("compiled JavaScript runs both real template workers and reports missing-entry and silent-exit failures without a TS loader", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "tovu-compiled-sandbox-"));
  const siteDir = path.resolve(import.meta.dirname, "..");
  const repoRoot = path.resolve(siteDir, "../../../../../../../..");
  try {
    writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
    symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"), "dir");
    // Targeted compilation of the exercised graph only. No full build, source mutation or
    // existing dist dependency; Node workers execute emitted .js with execArgv: [].
    await build({
      entryPoints: ["worker-sandbox.ts", "handlebars-worker.ts", "liquid-worker.ts", "__tests__/fixtures/exit-worker.ts"].map((file) => path.join(siteDir, file)),
      outdir: root, outbase: siteDir, bundle: true, platform: "node", format: "esm", packages: "external",
      plugins: [{ name: "tovu-source-imports", setup(build) {
        build.onResolve({ filter: /^#src\// }, (args) => ({ path: path.join(repoRoot, "apps/website/src", `${args.path.slice(5)}.ts`) }));
      } }],
    });
    const script = `
      import assert from "node:assert/strict";
      import { renderInWorkerSandbox } from ${JSON.stringify(pathToFileURL(path.join(root, "worker-sandbox.js")).href)};
      const ctx = { siteTitle: "Compiled fixture", route: "home", posts: [], products: [], themeName: "test", widgetRegions: {}, widgetInlineResolved: new Map() };
      for (const [worker, label] of [["handlebars-worker", "Handlebars"], ["liquid-worker", "Liquid"]]) {
        assert.equal(await renderInWorkerSandbox(worker, label, { source: "<h1>{{site.title}}</h1>", ctx }, { timeoutMs: 15000 }), "<h1>Compiled fixture</h1>");
        await assert.rejects(renderInWorkerSandbox("__tests__/fixtures/exit-worker", label, { source: "", ctx }, { timeoutMs: 15000 }), { message: label + " render worker exited with code 7" });
      }
      await assert.rejects(renderInWorkerSandbox("missing-worker", "Handlebars", { source: "", ctx }, { timeoutMs: 15000 }), (error) => {
        assert.equal(error.code, "MODULE_NOT_FOUND");
        assert.ok(error.message.includes("missing-worker.js"));
        return true;
      });
      console.log("compiled workers: 2 renders, 2 exits, missing JS entry checked");
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], { cwd: root, encoding: "utf8", timeout: 60_000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /compiled workers: 2 renders, 2 exits, missing JS entry checked/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * @file Exercises `renderInWorkerSandbox`'s `worker.once("exit", ...)` branch directly, via a
 * test-only fixture worker (`__tests__/fixtures/exit-worker.ts`) that calls `process.exit()`
 * immediately.
 *
 * Neither real worker (`liquid-worker.ts`, `handlebars-worker.ts`) can reach this branch: both
 * route every failure — malformed workerData, a lint violation, a render exception — through a
 * try/catch into a `postMessage({ ok: false, ... })` reply, and any UNCAUGHT exception in a worker
 * thread fires Node's `error` event before `exit`. Verified empirically 2026-08-20: pointing
 * `renderInWorkerSandbox` at a nonexistent worker file (so the eval bootstrap's own `require()`
 * throws) rejects with the raw `Cannot find module ...` error, not this function's
 * "... worker exited with code ..." wrapper — proving `error` fires first and settles the promise
 * before `exit` gets a chance to. So the exit-message formatting below is real defensive code —
 * worth keeping in case some future worker (or a native-level crash) terminates without an `error`
 * event — but it is only reachable through this fixture, not through either production wrapper's
 * real templates.
 *
 * This does not duplicate the timeout-message assertions in `liquid-sandbox.test.ts` /
 * `handlebars-sandbox.test.ts`: those exercise the real per-engine call sites end to end and would
 * catch a future swap of the literal `"Liquid"`/`"Handlebars"` `errorLabel` argument between the two
 * one-line wrappers (both branches share that same parameter). This file instead proves the
 * exit-message TEMPLATE itself substitutes the label correctly, for either engine.
 */

test("a worker that exits without posting a message or throwing rejects with the exact exit-code message, per engine label", async () => {
  const input = { source: "irrelevant — the fixture exits before reading workerData", ctx: {} as unknown as SiteRenderContext };

  await assert.rejects(
    renderInWorkerSandbox("__tests__/fixtures/exit-worker", "Liquid", input, { timeoutMs: 3000 }),
    (err: Error) => {
      assert.equal(err.message, "Liquid render worker exited with code 7");
      return true;
    }
  );

  await assert.rejects(
    renderInWorkerSandbox("__tests__/fixtures/exit-worker", "Handlebars", input, { timeoutMs: 3000 }),
    (err: Error) => {
      assert.equal(err.message, "Handlebars render worker exited with code 7");
      return true;
    }
  );
});

/**
 * Regression pin for the lcov dual-instantiation defect (see
 * `ADS-memory/reports/2026-09-05-coverage-dual-instantiation-routes-W-and-A.md`, "Route W").
 *
 * A `worker_threads` Worker writes its OWN V8 coverage profile into whatever directory
 * `NODE_V8_COVERAGE` names in ITS env — verified directly: a parent run with that variable set
 * produces two `coverage-<pid>-<ts>-<threadId>.json` files, one per thread. Under
 * `--experimental-test-coverage` the test runner sets that variable to its own aggregation
 * directory and merges every file it finds there, so an inheriting sandbox worker's profile lands
 * in the same lcov as the main thread's. That would be harmless if the two profiles had the same
 * shape, but they do not: under `tsx` the worker's entry is an eval'd CommonJS bootstrap, so
 * everything it loads is transpiled by esbuild in CJS format — `__toCommonJS`/`__copyProps`/
 * `__export` helpers and all — while the main thread holds an ESM image of the same files. Merging
 * the two concatenates the `FN:` tables and lets the never-exercised CJS image clobber `DA:` line
 * hits, which is exactly what `development/scripts/check-coverage-integrity.ts` flags.
 *
 * The property pinned here is the narrow, checkable one: a sandbox worker spawned while
 * `NODE_V8_COVERAGE` is set must not write anything into that directory. This runs identically
 * under a plain `npm test` (where the variable is otherwise unset) and under a coverage run —
 * the directory is this test's own temp dir either way, never the runner's.
 */
test("a sandbox worker does not write its own V8 coverage profile into the directory NODE_V8_COVERAGE names", async () => {
  const input = { source: "irrelevant — the fixture exits before reading workerData", ctx: {} as unknown as SiteRenderContext };
  const probeDir = mkdtempSync(path.join(tmpdir(), "tovu-sandbox-worker-coverage-"));
  const previous = process.env.NODE_V8_COVERAGE;
  process.env.NODE_V8_COVERAGE = probeDir;
  try {
    // Same exit fixture and TS bootstrap, with coverage deliberately inherited: proves that
    // this directory observes worker profiles before asserting the sandbox suppresses them.
    const registerModulePath = createRequire(import.meta.url).resolve("tsx/cjs/api");
    const fixture = new URL("./fixtures/exit-worker.ts", import.meta.url).pathname;
    const control = new Worker(`require(${JSON.stringify(registerModulePath)}).register(); require(${JSON.stringify(fixture)});`, {
      eval: true, env: { ...process.env },
    });
    const exitCode = await new Promise<number>((resolve, reject) => {
      control.once("error", reject);
      control.once("exit", resolve);
    });
    assert.equal(exitCode, 7);
    const profiles = readdirSync(probeDir);
    assert.ok(profiles.some((name) => /^coverage-.*\.json$/.test(name)), "the inherited-coverage control must produce a V8 profile");
    for (const name of profiles) rmSync(path.join(probeDir, name));
    await assert.rejects(renderInWorkerSandbox("__tests__/fixtures/exit-worker", "Liquid", input, { timeoutMs: 3000 }));
    assert.deepEqual(
      readdirSync(probeDir),
      [],
      "the sandbox worker wrote a V8 coverage profile into the aggregation directory it inherited — under a real coverage run that profile is a second, CJS-shaped image of every file the worker loads, and merging it into the main thread's ESM image is the dual-instantiation corruption check-coverage-integrity.ts exists to catch"
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_V8_COVERAGE;
    else process.env.NODE_V8_COVERAGE = previous;
    rmSync(probeDir, { recursive: true, force: true });
  }
});
