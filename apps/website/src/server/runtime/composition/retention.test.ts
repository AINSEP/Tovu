import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRetentionRunner } from "@jini-ai/platform/retention";
import { startSiteRetention } from "./retention.js";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("never starts on a client role", () => {
  assert.match(source("./serving-app.ts"), /optional\.runningLease && !optional\.runningLease\.attached[\s\S]*?startSiteRetention/);
  assert.match(source("../../../index.ts"), /runningLease,\n/);
  assert.match(source("../../../cli/commands/serve-listen.ts"), /runningLease: owned\.runningLease/);
});

test("stop drains before storage closes", async () => {
  let finish!: () => void;
  let signal!: AbortSignal;
  const events: string[] = [];
  const lifecycle = startSiteRetention({
    createRunner: createRetentionRunner,
    policiesForSignal: received => {
      signal = received;
      return [{ id: "database-copies", kind: "old-copy", measure: () => new Promise(resolve => {
        finish = () => { events.push("drained"); resolve({ bytes: 0 }); };
      }), sweep: async () => ({ freedBytes: 0, removed: 0 }) }];
    },
    clock: { now: () => 0 }, scheduler: { setTimeout, clearTimeout, setInterval, clearInterval },
    reportError: () => {}, log: () => {},
  });
  const pass = lifecycle.runOnce({ dryRun: true });
  const stopped = lifecycle.stop().then(() => events.push("storage closes"));
  assert.equal(signal.aborted, true);
  assert.deepEqual(events, []);
  finish();
  await Promise.all([pass, stopped]);
  assert.deepEqual(events, ["drained", "storage closes"]);
  assert.match(source("../../../cli/commands/serve-listen.ts"), /await siteRetention\?\.stop\(\);[\s\S]*?stopServingWithinGrace/);
  assert.match(source("../../../index.ts"), /await siteRetention\?\.stop\(\);[\s\S]*?stopServingWithinGrace/);
});

test("report line written", async () => {
  const lines: string[] = [];
  const errors: unknown[] = [];
  const lifecycle = startSiteRetention({
    createRunner: createRetentionRunner,
    policiesForSignal: () => [{ id: "database-copies", kind: "old-copy", measure: async () => { throw new Error("read failed"); }, sweep: async () => ({ freedBytes: 0, removed: 0 }) }],
    clock: { now: () => 7 }, scheduler: { setTimeout, clearTimeout, setInterval, clearInterval },
    reportError: error => errors.push(error), log: line => lines.push(line),
  });
  const report = await lifecycle.runOnce({ dryRun: true });
  assert.deepEqual(lifecycle.lastReport(), report);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /database-copies/);
  assert.equal(errors.length, 1);
  assert.equal((errors[0] as { policyId: string }).policyId, "database-copies");
  await lifecycle.stop();
});

test("boot pass waits for ready", async () => {
  const timers: Array<{ callback: () => void; ms: number }> = [];
  let measures = 0;
  const lifecycle = startSiteRetention({
    createRunner: createRetentionRunner,
    policiesForSignal: () => [{ id: "database-copies", kind: "old-copy", measure: async () => { measures++; return { bytes: 0 }; }, sweep: async () => { throw new Error("scheduled pass must measure"); } }],
    clock: { now: () => 0 },
    scheduler: {
      setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; }, clearTimeout: () => {},
      setInterval: (callback, ms) => { timers.push({ callback, ms }); return timers.length; }, clearInterval: () => {},
    }, reportError: () => {}, log: () => {},
  });
  assert.deepEqual(timers, []);
  assert.equal(measures, 0);
  lifecycle.listenerReady();
  assert.equal(timers[0]!.ms, 300000);
  assert.equal(measures, 0);
  timers[0]!.callback();
  assert.equal(measures, 1);
  assert.equal(timers[1]!.ms, 86400000);
  await lifecycle.stop();
});

test("no chat, revision, screenshot or media policy is registered", () => {
  const serving = source("./serving-app.ts");
  assert.match(serving, /policiesForSignal: \(\) => \[\]/);
  assert.doesNotMatch(serving, /id: ["'][^"']*(chat|revision|screenshot|media)|kind: ["'](content|history)/i);
});
