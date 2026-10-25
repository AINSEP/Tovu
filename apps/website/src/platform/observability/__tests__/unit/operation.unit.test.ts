import assert from "node:assert/strict";
import test from "node:test";

import { createNoopObservabilityPort, type ObservabilityPort } from "@jini-ai/diagnostics/observability";

import { trackAsyncOperation } from "../../operation.js";

/** @file `trackAsyncOperation`: one named operation around async work, with fake ports only. */

function recording({ withRun }: { withRun: boolean }) {
  const log: string[] = [];
  const noop = createNoopObservabilityPort({});
  const port: ObservabilityPort = { ...noop,
    trackOperation: ({ name, attributes }) => {
      log.push(`start:${name}:${JSON.stringify(attributes ?? null)}`);
      return { ...(withRun ? { run: <T>(fn: () => T) => { log.push("run"); return fn(); } } : {}), end: ({ outcome, failed }) => { log.push(`end:${outcome}:${failed}`); } };
    },
    reportError: ({ error, context }) => { log.push(`error:${context.operation}:${(error as Error).message}`); },
  };
  return { port, log };
}

test("the noop port (or none) runs the work directly", async () => {
  assert.equal(await trackAsyncOperation({ observability: createNoopObservabilityPort({}), name: "x", work: async () => 1, outcomeOf: () => { throw new Error("unused"); } }), 1);
  assert.equal(await trackAsyncOperation({ observability: undefined, name: "x", work: async () => 2, outcomeOf: () => { throw new Error("unused"); } }), 2);
});

test("a settled result ends the operation with its mapped outcome, inside the tracker's run()", async () => {
  const { port, log } = recording({ withRun: true });
  const result = await trackAsyncOperation({ observability: port, name: "site.publish", work: async () => ({ ok: false, code: "AUTH" }), outcomeOf: (r) => ({ outcome: r.code, failed: !r.ok }) }, { attributes: { "publish.target": "pages" } });
  assert.deepEqual(result, { ok: false, code: "AUTH" });
  assert.deepEqual(log, ['start:site.publish:{"publish.target":"pages"}', "run", "end:AUTH:true"]);
});

test("a throw is reported, ends the operation as error and is rethrown unchanged (no run() on the tracker)", async () => {
  const { port, log } = recording({ withRun: false });
  const failure = new Error("boom");
  await assert.rejects(trackAsyncOperation({ observability: port, name: "outbox.deliver", work: async () => { throw failure; }, outcomeOf: () => ({ outcome: "delivered", failed: false }) }), (error) => error === failure);
  assert.deepEqual(log, ["start:outbox.deliver:null", "error:outbox.deliver:boom", "end:error:true"]);
});
