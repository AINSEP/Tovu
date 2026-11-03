import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { WorkerFactory } from "@jini-ai/sandbox/node-worker";
import { renderInWorkerSandbox } from "../worker-sandbox.js";
import type { SiteRenderContext } from "../render-context.js";

test("Liquid and Handlebars visitors share a two-worker render limit and recover after cleanup", async () => {
  const workers: { events: EventEmitter; terminated: boolean }[] = [];
  const workerFactory: WorkerFactory = { spawn: () => {
    const worker = { events: new EventEmitter(), terminated: false };
    workers.push(worker);
    return {
      once: (subscription) => {
        if (subscription.event === "message") worker.events.once("message", (message) => subscription.listener({ message }));
        else if (subscription.event === "error") worker.events.once("error", (error) => subscription.listener({ error }));
        else worker.events.once("exit", (code) => subscription.listener({ code }));
      },
      terminate: async () => { worker.terminated = true; return 0; },
    };
  } };
  const ctx: SiteRenderContext = {
    siteTitle: "Capacity fixture", route: "home", posts: [], products: [], themeName: null, widgetRegions: {},
    widgetInlineResolved: new Map(), mediaTransformVersions: new Map(), mediaAssetMetadata: new Map(), assignedTerms: [],
  };
  // The injected worker ignores entry paths. Fixture names bypass source compilation so this
  // checks the shared host policy without spawning Node workers or an esbuild subprocess.
  const render = (engine: string) => renderInWorkerSandbox(`${engine}-capacity-fixture`, engine, {
    source: "hello", ctx,
  }, { workerFactory, productRoot: process.cwd() });
  const first = render("Liquid");
  const second = render("Handlebars");
  const refused = render("Liquid");
  const refusal = assert.rejects(refused, { name: "WorkerCapacityError" });
  try {
    assert.equal(workers.length, 2);
    await refusal;
    workers[0]!.events.emit("message", { ok: true, html: "first" });
    assert.equal(await first, "first");
    assert.equal(workers[0]!.terminated, true);
    const third = render("Handlebars");
    assert.equal(workers.length, 3);
    workers[1]!.events.emit("message", { ok: true, html: "second" });
    workers[2]!.events.emit("message", { ok: true, html: "third" });
    assert.deepEqual(await Promise.all([second, third]), ["second", "third"]);
  } finally {
    for (const worker of workers) worker.events.emit("message", { ok: true, html: "cleanup" });
    await Promise.allSettled([first, second, refused, refusal]);
  }
});
