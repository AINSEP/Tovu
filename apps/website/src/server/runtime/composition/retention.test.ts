import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createRetentionRunner } from "@jini-ai/platform/retention";
import { SiteShareRegistry } from "#src/features/site-backup/share-registry";
import { servingDatabaseCopies, siteRetentionPolicies, startSiteRetention } from "./retention.js";
import { createMediaBytesPolicy } from "./retention-policies/media-bytes.js";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

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
  // P11 ST-12b: the one registered source of policies is the share expiry pass (asserted below).
  assert.match(serving, /policiesForSignal: signal => siteRetentionPolicies\(/);
  assert.doesNotMatch(serving, /id: ["'][^"']*(chat|revision|screenshot|media)|kind: ["'](content|history)/i);
  assert.doesNotMatch(source("./retention.ts"), /id: ["'][^"']*(chat|revision|screenshot|media)|kind: ["'](content|history)/i);
  // P11 ST-11b.T: media bytes are registered, but only on the report-only path, and the policy has no
  // sweep at all. Enabling unlinks is a separate owner-gated change (STOP 6, OQ-11a).
  assert.match(serving, /reportOnlyForSignal: signal => [^\n]*\[createMediaBytesPolicy\(/);
  assert.doesNotMatch(serving.match(/policiesForSignal: signal => [^\n]*/)![0], /createMediaBytesPolicy/);
  const media = source("./retention-policies/media-bytes.ts");
  assert.doesNotMatch(media, /sweep\s*[:(]|unlink|kind: ["'](content|history)/);
});

test("host policy has no sweep even on a live pass", async () => {
  const errors: unknown[] = [];
  const media = createMediaBytesPolicy({
    gc: { workspaceId: "ws", graceMs: 0, now: () => 10, listLegacyOrphans: async () => [{ sha256: "old", storageKey: "media/old.jpg" }] },
    journal: { list: async () => [] }, probes: {}, stat: async () => ({ size: 5 }), signal: new AbortController().signal,
  }, {});
  assert.equal("sweep" in media, false);
  const lifecycle = startSiteRetention({
    createRunner: createRetentionRunner, policiesForSignal: () => [], reportOnlyForSignal: () => [media],
    clock: { now: () => 10 }, scheduler: { setTimeout, clearTimeout, setInterval, clearInterval },
    reportError: error => errors.push(error), log: () => {},
  });
  const report = await lifecycle.runOnce({ dryRun: false });
  assert.equal(report.status, "completed");
  assert.deepEqual(report.status === "completed" && report.policies.map(({ id, status }) => ({ id, status })), [{ id: "media-bytes", status: "measured" }]);
  assert.deepEqual(errors, []);
  assert.deepEqual(lifecycle.lastReport(), report);
  await lifecycle.stop();
});

test("the serving policies are the share expiry pass (only with a share catalog) and the temp-root tidy, both old-copy classes", async () => {
  const deps = { fs: { stat: async () => ({ size: 0 }), unlink: async () => {} }, clock: { now: () => 0 }, signal: new AbortController().signal, reportError: () => {} };
  assert.deepEqual(siteRetentionPolicies({ registry: undefined, ...deps }).map(({ id, kind }) => ({ id, kind })), [{ id: "temp-roots", kind: "old-copy" }]);
  const directory = await mkdtemp(path.join(tmpdir(), "retention-policies-"));
  try {
    const policies = siteRetentionPolicies({ registry: new SiteShareRegistry({ directory, now: () => 0 }), ...deps });
    assert.deepEqual(policies.map(({ id, kind }) => ({ id, kind })), [{ id: "share-files", kind: "old-copy" }, { id: "temp-roots", kind: "old-copy" }]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("database-copies registers as an old-copy class only for a file-backed site", () => {
  const deps = { registry: undefined, fs: { stat: async () => ({ size: 0 }), unlink: async () => {} }, clock: { now: () => 0 }, signal: new AbortController().signal, reportError: () => {} };
  assert.equal(servingDatabaseCopies({ contentDbPath: ":memory:" }), undefined);
  const databaseCopies = servingDatabaseCopies({ contentDbPath: path.join(tmpdir(), "site", "content.db") });
  assert.deepEqual(databaseCopies?.opsDirs, [path.join(tmpdir(), "site", "ops")]);
  const policies = siteRetentionPolicies({ ...deps, databaseCopies });
  assert.deepEqual(policies.map(({ id, kind }) => ({ id, kind })), [{ id: "database-copies", kind: "old-copy" }, { id: "temp-roots", kind: "old-copy" }]);
  assert.match(source("./serving-app.ts"), /databaseCopies: servingDatabaseCopies\(\{ contentDbPath: routeDeps\.siteStoragePaths\.contentDbPath \}\)/);
});

// P11 ST-7c.T (T5b): the free-page reclaim has its OWN schedule, off unless the host supplies the work. Its tick
// may call only that work; it must never start the general runner or turn its measure-only passes live.
// Mutation `M7c-enable-global-sweep` (a free-page tick that also runs a live general pass) must fail this test.
test("daily free-page work cannot invoke any other policy", async () => {
  const timers: Array<{ callback: () => void; ms: number }> = [];
  const calls = { measure: 0, sweep: 0, reportOnly: 0, freePages: 0 };
  const lifecycle = startSiteRetention({
    createRunner: createRetentionRunner,
    policiesForSignal: () => [{ id: "database-copies", kind: "old-copy", measure: async () => { calls.measure++; return { bytes: 1 }; }, sweep: async () => { calls.sweep++; return { freedBytes: 1, removed: 1 }; } }],
    reportOnlyForSignal: () => [{ id: "media-bytes", kind: "old-copy", measure: async () => { calls.reportOnly++; return { bytes: 1 }; } }],
    freePagesForSignal: () => ({ run: async () => { calls.freePages++; }, drain: async () => {} }),
    clock: { now: () => 0 },
    scheduler: {
      setTimeout: (callback: () => void, ms: number) => timers.push({ callback, ms }),
      clearTimeout: () => {},
      setInterval: (callback: () => void, ms: number) => timers.push({ callback, ms }),
      clearInterval: () => {},
    },
    reportError: () => {}, log: () => {},
  }, { bootDelayMs: 1, freePagesDelayMs: 2, freePagesIntervalMs: 3 });
  lifecycle.listenerReady();
  const freePageTimers = () => timers.filter(timer => timer.ms === 2 || timer.ms === 3);
  freePageTimers()[0]!.callback();
  await new Promise(resolve => setImmediate(resolve));
  freePageTimers()[1]!.callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.freePages, 2);
  assert.deepEqual({ ...calls, freePages: 0 }, { measure: 0, sweep: 0, reportOnly: 0, freePages: 0 }, "a free-page tick touched another policy");
  // The general runner's own boot pass is still measure-only.
  timers.find(timer => timer.ms === 1)!.callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.sweep, 0);
  await lifecycle.stop();
  // Daily reclamation is never turned on by flipping the general runner live.
  assert.doesNotMatch(source("./serving-app.ts"), /scheduledDryRun/);
});

test("free-page work is scheduled only when the host supplies it", () => {
  const timers: number[] = [];
  const lifecycle = startSiteRetention({
    createRunner: createRetentionRunner, policiesForSignal: () => [],
    clock: { now: () => 0 },
    scheduler: { setTimeout: (_callback: () => void, ms: number) => timers.push(ms), clearTimeout: () => {}, setInterval: () => undefined, clearInterval: () => {} },
    reportError: () => {}, log: () => {},
  }, { bootDelayMs: 1, freePagesDelayMs: 2 });
  lifecycle.listenerReady();
  assert.deepEqual(timers, [1]);
  // Off by default: serving-app binds the work only from an explicit host option, which no entrant passes yet.
  assert.match(source("./serving-app.ts"), /freePagesForSignal: optional\.dbFreePages/);
});

test("free-page shutdown drains before closing SQLite", async () => {
  const timers: Array<{ callback: () => void; ms: number }> = [];
  const events: string[] = [];
  let finish!: () => void;
  let signal!: AbortSignal;
  const lifecycle = startSiteRetention({
    createRunner: createRetentionRunner, policiesForSignal: () => [],
    freePagesForSignal: received => {
      signal = received;
      let inFlight: Promise<void> = Promise.resolve();
      return {
        run: () => (inFlight = new Promise<void>(resolve => { finish = () => { events.push("step finished"); resolve(); }; })),
        drain: async () => { await inFlight; events.push("drained"); },
      };
    },
    clock: { now: () => 0 },
    scheduler: { setTimeout: (callback: () => void, ms: number) => timers.push({ callback, ms }), clearTimeout: () => {}, setInterval: () => undefined, clearInterval: () => {} },
    reportError: () => {}, log: () => {},
  }, { bootDelayMs: 1, freePagesDelayMs: 2 });
  lifecycle.listenerReady();
  timers.find(timer => timer.ms === 2)!.callback();
  const stopped = lifecycle.stop().then(() => events.push("sqlite closes"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(signal.aborted, true);
  assert.deepEqual(events, [], "stop returned while a free-page step was in flight");
  finish();
  await stopped;
  assert.deepEqual(events, ["step finished", "drained", "sqlite closes"]);
});
