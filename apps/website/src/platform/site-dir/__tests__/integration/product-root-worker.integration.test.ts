import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import { resolveProductRoot } from "../../product-root.js";

/**
 * @file End-to-end pin of `resolveProductRoot()`'s worker-thread default: a relocated theme worker
 * runs from a compiled temp folder, so its own location says nothing about the install; the parent
 * passes the product root in `workerData` instead. These tests start a real worker (inheriting this
 * process's TS loader) so the wiring to `node:worker_threads` is proven, not just the decision.
 */

const MODULE_URL = pathToFileURL(path.resolve(import.meta.dirname, "../../product-root.ts")).href;

type WorkerOutcome = { root: string } | { error: string };

/** Runs `resolveProductRoot(fromDir)` inside a real worker thread given `workerData`. */
function resolveInWorker({ workerData, fromDir }: { workerData: unknown; fromDir?: string }): Promise<WorkerOutcome> {
  const source = `
    const { parentPort } = require("node:worker_threads");
    import(${JSON.stringify(MODULE_URL)}).then((m) => {
      try { parentPort.postMessage({ root: m.resolveProductRoot(${fromDir === undefined ? "" : JSON.stringify(fromDir)}) }); }
      catch (error) { parentPort.postMessage({ error: error.message }); }
    });`;
  return new Promise((resolve, reject) => {
    const worker = new Worker(source, { eval: true, workerData });
    worker.once("message", (outcome: WorkerOutcome) => { void worker.terminate(); resolve(outcome); });
    worker.once("error", reject);
  });
}

function makeFixtureRoot(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(path.join(os.tmpdir(), "product-root-worker-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "package.json"), "{}");
  mkdirSync(path.join(root, "content"));
  return root;
}

test("a worker with an absolute workerData.productRoot gets that root back without any walk-up", async () => {
  const supplied = path.join(os.tmpdir(), "no-such-install-needed");
  assert.deepEqual(await resolveInWorker({ workerData: { productRoot: supplied } }), { root: supplied });
});

test("a worker with a relative workerData.productRoot is refused, naming the value and the fix", async () => {
  const outcome = await resolveInWorker({ workerData: { productRoot: "relative/root" } });
  assert.ok("error" in outcome);
  assert.match(outcome.error, /^resolveProductRoot: worker productRoot "relative\/root" must be an absolute path/);
});

test("a worker given an explicit fromDir ignores workerData.productRoot and walks up from fromDir", async (t) => {
  const root = makeFixtureRoot(t);
  const deep = path.join(root, "src", "a");
  mkdirSync(deep, { recursive: true });
  assert.deepEqual(await resolveInWorker({ workerData: { productRoot: "relative/ignored" }, fromDir: deep }), { root });
});

test("a worker whose workerData.productRoot is not a string falls back to walking up from the module", async () => {
  assert.deepEqual(await resolveInWorker({ workerData: { productRoot: 42 } }), { root: resolveProductRoot() });
});

test("a worker started without workerData falls back to walking up from the module", async () => {
  assert.deepEqual(await resolveInWorker({ workerData: undefined }), { root: resolveProductRoot() });
});
