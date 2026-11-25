/** P11 ST-7b.T (T4d) — the desktop idle compaction trigger stays inert unless every gate is positive. */
import assert from "node:assert/strict";
import test from "node:test";
import type { StorageOperation } from "../../storage/storage-report-cli.ts";
import { createStorageIdleCompaction, type IdleCompactionRequired } from "./storage-idle-compaction.ts";

function deps(over: Partial<IdleCompactionRequired> = {}, operations: StorageOperation[] = ["report", "move", "clean", "compact"]) {
  const spawned: string[] = [];
  const timers: number[] = [];
  const attempts = new Map<string, number>();
  const d: IdleCompactionRequired = {
    capabilities: { state: "ok", operations: new Set(operations) },
    onAcPower: () => true,
    idleSeconds: () => 900,
    trackedSites: async () => ["/sites/a"],
    windowOpenOrTransitioning: () => false,
    siteBytes: async () => 1024,
    spawnCompact: async ({ dir }) => { spawned.push(dir); },
    lastAttempt: ({ dir }) => attempts.get(dir),
    recordAttempt: ({ dir, at }) => { attempts.set(dir, at); },
    now: () => 1_000_000_000,
    setInterval: (_run, ms) => { timers.push(ms); return timers.length; },
    clearInterval: () => {},
    ...over,
  };
  return { d, spawned, timers };
}

test("no compact capability: nothing is constructed, no timer, no spawn", () => {
  const { d, timers } = deps({}, ["report", "move", "clean"]);
  assert.equal(createStorageIdleCompaction(d), undefined);
  assert.equal(createStorageIdleCompaction({ ...d, capabilities: { state: "unknown" } }), undefined);
  assert.deepEqual(timers, []);
});

test("open window or battery means no idle compaction", async () => {
  for (const over of [{ windowOpenOrTransitioning: () => true }, { windowOpenOrTransitioning: () => "unknown" as const }, { onAcPower: () => false }, { onAcPower: () => "unknown" as const }, { idleSeconds: () => 60 }, { idleSeconds: () => "unknown" as const }, { siteBytes: async () => 3 * 2 ** 30 }, { siteBytes: async () => null }, { trackedSites: async () => "unknown" as const }]) {
    const { d, spawned } = deps(over);
    assert.equal(await createStorageIdleCompaction(d)!.tick(), "skipped");
    assert.deepEqual(spawned, []);
  }
});

test("all gates positive spawns the bundled CLI once, then the 24-hour cooldown holds", async () => {
  const { d, spawned } = deps();
  const trigger = createStorageIdleCompaction(d)!;
  assert.equal(await trigger.tick(), "ran");
  assert.equal(await trigger.tick(), "skipped");
  assert.deepEqual(spawned, ["/sites/a"]);
  trigger.dispose();
  assert.equal(await trigger.tick(), "skipped");
});

test("one child at a time", async () => {
  let release!: () => void;
  const { d, spawned } = deps({ trackedSites: async () => ["/sites/a", "/sites/b"], spawnCompact: async ({ dir }) => { spawned.push(dir); await new Promise<void>((r) => { release = r; }); } });
  const trigger = createStorageIdleCompaction(d)!;
  const first = trigger.tick();
  await new Promise((r) => setImmediate(r));
  assert.equal(await trigger.tick(), "skipped");
  release();
  assert.equal(await first, "ran");
  assert.deepEqual(spawned, ["/sites/a"]);
});
