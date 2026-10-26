import { createTracker } from "@jini-ai/diagnostics/observability/node";
import assert from "node:assert/strict";
import test from "node:test";

import { createNoopObservabilityPort, type ObservabilityPort } from "@jini-ai/diagnostics/observability";


/** @file `tracker.span`: one named operation around async work, with fake ports only. */

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

test("the no-provider facade runs work and preserves its result", async () => {
  assert.equal(await createTracker({}).span("x", async () => 1), 1);
  assert.equal(await createTracker({}).span("x", async () => 2), 2);
});

test("a settled result ends the operation with its mapped outcome, inside the tracker's run()", async () => {
  const { port, log } = recording({ withRun: true });
  const result = await createTracker({ observability: port }).span("site.publish", async (span) => {
    const result = { ok: false, code: "AUTH" };
    span.setOutcome({ outcome: result.code, failed: !result.ok });
    return result;
  }, { attributes: { "publish.target": "pages" } });
  assert.deepEqual(result, { ok: false, code: "AUTH" });
  assert.deepEqual(log, ['start:site.publish:{"publish.target":"pages"}', "run", "end:AUTH:true"]);
});

test("a throw is reported, ends the operation as error and is rethrown unchanged (no run() on the tracker)", async () => {
  const { port, log } = recording({ withRun: false });
  const failure = new Error("boom");
  await assert.rejects(createTracker({ observability: port }).span("outbox.deliver", async () => { throw failure; }), (error) => error === failure);
  assert.deepEqual(log, ["start:outbox.deliver:null", "error:outbox.deliver:boom", "end:error:true"]);
});
