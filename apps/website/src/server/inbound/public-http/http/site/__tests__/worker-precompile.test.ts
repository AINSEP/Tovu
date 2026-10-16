/** rr10a: concurrent TS-source renders share emitted JS and never bootstrap tsx in a worker. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("cold concurrent source renders compile both theme workers once and start plain JS with the product root", (t) => {
  // The writer investigation must cover module evaluation too: workers inherit cwd, but compilation
  // and preview rendering must never recreate a cwd-relative sites/tovu-dev/themes tree.
  const cwd = mkdtempSync(path.join(tmpdir(), "stalecard-worker-cwd-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  // A fresh parent makes this a cold-start race even when another suite already rendered.
  const script = `
    import assert from "node:assert/strict";
    import { readdirSync } from "node:fs";
    import path from "node:path";
    import { Worker } from "node:worker_threads";
    import { createNodeWorkerFactory } from ${JSON.stringify(import.meta.resolve("@jini-ai/sandbox/node-worker"))};
    import { renderInWorkerSandbox, resolveDefaultTimeoutMs } from ${JSON.stringify(new URL("../worker-sandbox.ts", import.meta.url).href)};
    import { resolveProductRoot } from ${JSON.stringify(new URL("../../../../../../platform/site-dir/product-root.ts", import.meta.url).href)};
    delete process.env.TOVU_THEME_RENDER_TIMEOUT_MS;
    assert.equal(resolveDefaultTimeoutMs(), 5000);
    const productRoot = resolveProductRoot();
    const entries = [];
    const threads = new Set();
    const workerFactory = createNodeWorkerFactory({ env: {
      ...process.env, ESBUILD_BINARY_PATH: "/nonexistent/rr10a-worker-must-not-spawn-esbuild",
    } }, {
      createWorker: ({ entry, options }) => {
        assert.equal(options.eval, undefined, "no eval/tsx bootstrap");
        assert.deepEqual(options.execArgv, [], "no inherited TS loader");
        assert.equal(path.extname(entry), ".js");
        assert.equal(options.workerData.productRoot, productRoot);
        assert.notEqual(path.dirname(entry), path.resolve(${JSON.stringify(new URL("..", import.meta.url).pathname)}));
        entries.push(entry);
        const worker = new Worker(entry, options);
        threads.add(worker.threadId);
        return worker;
      },
    });
    const ctx = {
      siteTitle: "Precompiled fixture", route: "home", posts: [], products: [], themeName: "test",
      widgetRegions: {}, widgetInlineResolved: new Map(), mediaTransformVersions: new Map(),
      mediaAssetMetadata: new Map(), assignedTerms: [],
    };
    const render = ([worker, label]) => renderInWorkerSandbox(worker, label, {
      source: "<h1>{{site.title}}</h1>", ctx,
    }, { workerFactory });
    const engines = [["handlebars-worker", "Handlebars"], ["liquid-worker", "Liquid"]];
    for (let round = 0; round < 2; round++) {
      const html = await Promise.all([...engines, ...engines].map(render));
      assert.deepEqual(html, Array(4).fill("<h1>Precompiled fixture</h1>"));
    }
    assert.equal(entries.length, 8);
    assert.equal(threads.size, 8, "each render retains a fresh isolation boundary");
    const dirs = new Set(entries.map((entry) => path.dirname(entry)));
    assert.equal(dirs.size, 1, "both engines and concurrent/repeated calls share one build");
    assert.deepEqual(readdirSync([...dirs][0]).filter((file) => file.endsWith(".js")).sort(), ["handlebars-worker.js", "liquid-worker.js"]);
    console.log("precompiled workers: cold race, reuse, root and plain JS verified");
  `;
  const env = { ...process.env };
  // The cold parent runs outside the repository; tsx still needs the runner's JSX config.
  if (env.TSX_TSCONFIG_PATH) env.TSX_TSCONFIG_PATH = path.resolve(import.meta.dirname, "../../../../../../../../..", env.TSX_TSCONFIG_PATH);
  const result = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), "--input-type=module", "--eval", script], {
    cwd, env, encoding: "utf8", timeout: 60_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /precompiled workers: cold race, reuse, root and plain JS verified/);
  assert.equal(existsSync(path.join(cwd, "sites")), false, "rr10a precompile/render leaves cwd site data untouched");
});
