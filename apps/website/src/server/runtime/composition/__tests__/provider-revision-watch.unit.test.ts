import assert from "node:assert/strict";
import test from "node:test";
import { watchProviderRevisions } from "../provider-revision-watch.js";

test("one scheduled metadata read notices revision, attachment and detach changes and stops after close", async () => {
  const key = "plugin-state:analytics-example:provider.config";
  let rows = [{ id: key, revision: 1, attached_at: "first" }];
  let check!: () => Promise<void>; let cancelled = 0; const applied: string[] = [];
  const stop = watchProviderRevisions({ read: async () => rows, reapply: async ({ pluginId }) => { applied.push(pluginId); return "now"; } }, {
    schedule: (run, interval) => { assert.equal(interval, 30_000); check = run; return () => { cancelled++; }; },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(applied, ["analytics-example"]);
  await check(); assert.equal(applied.length, 1);
  rows = [{ id: key, revision: 2, attached_at: "first" }];
  await check(); assert.equal(applied.length, 2);
  rows = [{ id: key, revision: 2, attached_at: "reattached" }];
  await check(); assert.equal(applied.length, 3);
  rows = []; await check(); assert.equal(applied.length, 4);
  stop(); await check(); assert.equal(applied.length, 4); assert.equal(cancelled, 1);
});
