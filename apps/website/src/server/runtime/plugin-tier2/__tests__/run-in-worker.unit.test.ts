import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import type { WorkerFactory, WorkerScheduler, WorkerSubscription } from "@jini-ai/sandbox/node-worker";

import type { Tier2Request } from "@jini-ai/plugins/host/worker";
import { createTier2WorkerRunner, resolveTier2TimeoutMs, tier2WorkerEnv } from "../run-in-worker.js";

/**
 * @file `createTier2WorkerRunner()` — the host side of a Tier-2 call: one fresh bounded worker per
 * request over `@jini-ai/sandbox/node-worker`. Fake worker/timer ports here; the real worker is the
 * composition integration test.
 *
 * Requirement-to-test map:
 * - the request is the worker payload, the entry is the sibling worker file, default heap limits
 *   and the env-resolved timeout apply -> the spawn test.
 * - the reply is decoded against the request kind -> the decode tests.
 * - a timeout or crash rejects (hook-registry then fails closed) -> the timeout test.
 * - timeout env parsing is strict -> the resolveTier2TimeoutMs table.
 * - a compiled build spawns `worker.js` without the TS bootstrap -> the .js test.
 * - the worker env is an allowlist, never the server env -> the tier2WorkerEnv test.
 */

const request: Tier2Request = {
  kind: "probe",
  plugin: { pluginId: "t2", entryPath: "/p.js", capabilities: ["hooks.attach"], hooks: [] },
};

function fakePorts(reply: { message?: unknown; error?: Error } = {}) {
  const spawned: Array<{ workerEntry: string | URL; payload: unknown; resourceLimits: unknown }> = [];
  const timers: Array<{ delayMs: number; run: () => void }> = [];
  let terminated = 0;
  const workerFactory: WorkerFactory = {
    spawn(input) {
      spawned.push(input);
      return {
        once(sub: WorkerSubscription) {
          if (sub.event === "message" && "message" in reply) queueMicrotask(() => sub.listener({ message: reply.message }));
          if (sub.event === "error" && reply.error) queueMicrotask(() => sub.listener({ error: reply.error! }));
        },
        terminate: async () => { terminated += 1; return 0; },
      };
    },
  };
  const scheduler: WorkerScheduler = {
    schedule(input) {
      timers.push(input);
      return () => {};
    },
  };
  return { workerFactory, scheduler, spawned, timers, terminated: () => terminated };
}

test("spawns the sibling worker entry with the request as payload, default heap limits and the env timeout", async () => {
  const ports = fakePorts({ message: { ok: true, kind: "probe", hooks: [] } });
  const runCall = createTier2WorkerRunner({}, { workerFactory: ports.workerFactory, scheduler: ports.scheduler, env: { TOVU_PLUGIN_TIER2_TIMEOUT_MS: "1234" } });
  assert.deepEqual(await runCall(request), { ok: true, kind: "probe", hooks: [] });
  assert.equal(ports.spawned.length, 1);
  assert.equal(ports.spawned[0]!.workerEntry, path.join(import.meta.dirname, "..", "worker.ts"));
  assert.deepEqual(ports.spawned[0]!.payload, request);
  assert.deepEqual(ports.spawned[0]!.resourceLimits, { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, codeRangeSizeMb: 16 });
  assert.equal(ports.timers[0]!.delayMs, 1234);
  assert.equal(ports.terminated(), 1, "the worker is torn down after its one reply");
});

test("explicit timeout and resource limits override the defaults", async () => {
  const ports = fakePorts({ message: { ok: true, kind: "probe", hooks: [] } });
  const runCall = createTier2WorkerRunner({}, {
    workerFactory: ports.workerFactory,
    scheduler: ports.scheduler,
    timeoutMs: 77,
    resourceLimits: { maxOldGenerationSizeMb: 8 },
  });
  await runCall(request);
  assert.equal(ports.timers[0]!.delayMs, 77);
  assert.deepEqual(ports.spawned[0]!.resourceLimits, { maxOldGenerationSizeMb: 8 });
});

test("a reply of the wrong kind rejects", async () => {
  const ports = fakePorts({ message: { ok: true, kind: "beforeSave", patch: {} } });
  const runCall = createTier2WorkerRunner({}, { workerFactory: ports.workerFactory, scheduler: ports.scheduler });
  await assert.rejects(runCall(request), { message: "invalid tier-2 worker reply" });
});

test("a worker error rejects with that error", async () => {
  const ports = fakePorts({ error: new Error("heap limit") });
  const runCall = createTier2WorkerRunner({}, { workerFactory: ports.workerFactory, scheduler: ports.scheduler });
  await assert.rejects(runCall(request), { message: "heap limit" });
});

test("a timeout rejects with the plugin named and terminates the worker", async () => {
  const ports = fakePorts();
  const runCall = createTier2WorkerRunner({}, { workerFactory: ports.workerFactory, scheduler: ports.scheduler, timeoutMs: 50 });
  const pending = runCall(request);
  ports.timers[0]!.run();
  await assert.rejects(pending, { message: "plugin 't2' tier-2 exceeded 50ms timeout" });
  assert.equal(ports.terminated(), 1);
});

const timeoutCases: ReadonlyArray<[string | undefined, number]> = [
  [undefined, 5_000],
  ["2500", 2_500],
  [" 60000 ", 60_000],
  ["60001", 5_000],
  ["5e3", 5_000],
  ["0", 5_000],
  ["abc", 5_000],
];
for (const [raw, expected] of timeoutCases) {
  test(`TOVU_PLUGIN_TIER2_TIMEOUT_MS=${JSON.stringify(raw)} -> ${expected}ms`, () => {
    assert.equal(resolveTier2TimeoutMs({ env: raw === undefined ? {} : { TOVU_PLUGIN_TIER2_TIMEOUT_MS: raw } }), expected);
  });
}

test("a compiled build (.js) spawns worker.js with the real factory and no TypeScript bootstrap", async () => {
  // No worker.js exists beside the .ts sources, so the real worker fails to load it: the rejection
  // names worker.js, proving the entry choice and that no tsx bootstrap wrapped it.
  const runCall = createTier2WorkerRunner({}, { moduleExtension: ".js", timeoutMs: 30_000 });
  await assert.rejects(runCall(request), (error: Error) => {
    assert.match(error.message, /plugin-tier2\/worker\.js/);
    return true;
  });
});

test("tier2WorkerEnv keeps only the runtime/tooling allowlist, never server secrets", () => {
  assert.deepEqual(
    tier2WorkerEnv({ env: { NODE_ENV: "production", TZ: "UTC", TSX_TSCONFIG_PATH: "t.json", NODE_V8_COVERAGE: "/cov", TOVU_SITE_KEY: "site-key", DATABASE_URL: "postgres://u:p@h/db", PATH: "/bin" } }),
    { NODE_ENV: "production", TZ: "UTC", TSX_TSCONFIG_PATH: "t.json", NODE_V8_COVERAGE: "/cov" },
  );
  assert.deepEqual(tier2WorkerEnv({ env: {} }), {});
});
