import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createNodeWorkerFactory } from "@jini-ai/sandbox/node-worker";
import * as threads from "node:worker_threads";
import type { ResourceLimits, WorkerOptions } from "node:worker_threads";

import type { SiteRenderContext } from "../render.js";

// Observe the real Worker boundary, without replacing rendering or worker lifecycle.
const spawned: Array<{ requested: ResourceLimits | undefined; worker: threads.Worker }> = [];
let helperProbe: SharedArrayBuffer | undefined;
const installUnexpectedHelper = `
  const Handlebars = require("handlebars");
  const create = Handlebars.create.bind(Handlebars);
  Handlebars.create = () => {
    const env = create();
    const probe = new Int32Array(require("node:worker_threads").workerData.helperProbe);
    env.registerHelper("someUnknownName", () => {
      Atomics.add(probe, 1, 1);
      return "UNREVIEWED-HELPER";
    });
    Atomics.store(probe, 0, 1);
    return env;
  };
`;

class ObservedWorker extends threads.Worker {
  constructor(entry: string | URL, options: WorkerOptions = {}) {
    // The TS bootstrap is CJS. Install a real, unexpected helper into each newly created
    // Handlebars environment before the unchanged worker compiles the template.
    if (helperProbe) {
      assert.equal(options.eval, true, "helper injection requires the source-mode bootstrap");
      assert.equal(typeof entry, "string");
      entry = installUnexpectedHelper + entry;
      options = { ...options, workerData: { ...options.workerData, helperProbe } };
    }
    super(entry, options);
    spawned.push({ requested: options.resourceLimits, worker: this });
  }
}

const workerFactory = createNodeWorkerFactory({ env: { ...process.env } }, {
  typescriptBootstrap: { registerModulePath: createRequire(import.meta.url).resolve("tsx/cjs/api") },
  createWorker: ({ entry, options }) => new ObservedWorker(entry, options),
});
const { renderHandlebarsInSandbox } = await import("../handlebars-sandbox.js");

const ctx: SiteRenderContext = {
  siteTitle: "Policy fixture", route: "home", posts: [], products: [], themeName: "test",
  widgetRegions: {}, widgetInlineResolved: new Map(),
  mediaTransformVersions: new Map(), mediaAssetMetadata: new Map(), assignedTerms: [],
};

test("Handlebars forwards explicit resource limits to the real worker, including an effective stack limit", async () => {
  const before = spawned.length;
  const resourceLimits = { maxOldGenerationSizeMb: 48, maxYoungGenerationSizeMb: 8, codeRangeSizeMb: 12, stackSizeMb: 5 };
  const html = await renderHandlebarsInSandbox({ source: "<h1>{{site.title}}</h1>", ctx }, { resourceLimits, timeoutMs: 15_000, workerFactory });
  assert.equal(html, "<h1>Policy fixture</h1>");
  assert.equal(spawned.length, before + 1);
  assert.deepEqual(spawned[before].requested, resourceLimits);
  // The gate's --max-old-space-size overrides old-generation limits. Stack size is still
  // enforced by Node and distinguishes these options from the defaults without an OOM.
  assert.equal(spawned[before]?.worker.resourceLimits?.stackSizeMb, 5);
});

test("knownHelpersOnly prevents invocation of a real registered helper outside the allowlist", async () => {
  const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const probe = new Int32Array(buffer);
  helperProbe = buffer;
  try {
    const html = await renderHandlebarsInSandbox({ source: "[{{someUnknownName}}]", ctx }, { timeoutMs: 15_000, workerFactory });
    assert.equal(Atomics.load(probe, 0), 1, "the worker's environment must really contain the injected helper");
    assert.equal(html, "[]");
    assert.equal(Atomics.load(probe, 1), 0, "the compiler must treat the unknown name as data, not a helper");

    // Positive control through the same real compiler/registration: without this policy the
    // same bare expression invokes the helper. No production source is changed for the control.
    const control = new threads.Worker(installUnexpectedHelper + `
      const env = require("handlebars").create();
      require("node:worker_threads").parentPort.postMessage(env.compile("[{{someUnknownName}}]", { knownHelpersOnly: false })({}));
    `, { eval: true, workerData: { helperProbe: buffer } });
    try {
      const html = await new Promise<string>((resolve, reject) => {
        control.once("message", resolve);
        control.once("error", reject);
        control.once("exit", () => reject(new Error("helper control exited without a reply")));
      });
      assert.equal(html, "[UNREVIEWED-HELPER]");
      assert.equal(Atomics.load(probe, 1), 1);
    } finally {
      await control.terminate();
    }
  } finally {
    helperProbe = undefined;
  }
});
