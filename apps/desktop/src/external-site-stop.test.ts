import assert from "node:assert/strict";
import test from "node:test";

import {
  EXTERNAL_STOP_UNCONFIRMED, NODE_PORTS, createExternalSiteStopper, readProcessStartMs, resolveExternalStopTarget, stopExternalSite, waitForExternalSiteStop,
  type ExternalStopPorts,
} from "./external-site-stop.ts";

// The real `npm run dev` shape: 10 npm run dev → 11 dev.mjs → 12 npm exec → 13 tsx watch → 14 server (lease pid).
const CLAIMED = Date.parse("2026-10-13T12:00:00.000Z");
const LEASE = { pid: 14, token: "lease-a", started: new Date(CLAIMED).toISOString() };
const DEV_TREE: Record<number, { ppid: number; command: string; startMs: number }> = {
  10: { ppid: 1, command: "npm run dev", startMs: CLAIMED - 60_000 },
  11: { ppid: 10, command: "node development/scripts/dev.mjs", startMs: CLAIMED - 59_000 },
  12: { ppid: 11, command: "npm exec tsx watch apps/website/src/index.ts", startMs: CLAIMED - 58_000 },
  13: { ppid: 12, command: "node /repo/node_modules/.bin/tsx watch apps/website/src/index.ts", startMs: CLAIMED - 58_000 },
  14: { ppid: 13, command: "node --import tsx/loader.mjs apps/website/src/index.ts", startMs: CLAIMED - 2_000 },
};

/** Fake OS over a mutable process table; `kill` records signals and runs `onKill` (the "exit"). */
function fakePorts(table: Record<number, { ppid: number; command: string; startMs: number }>, { onKill }: { onKill?: (pid: number) => void } = {}) {
  const signals: Array<[number, string]> = [];
  let now = 0;
  const ports: ExternalStopPorts = {
    readCommand: (pid) => table[pid]?.command ?? null,
    readParentPid: (pid) => table[pid]?.ppid ?? null,
    readStartMs: (pid) => table[pid]?.startMs ?? null,
    kill: (pid, signal) => { signals.push([pid, signal]); onKill?.(pid); },
    sleep: async (ms) => { now += ms; },
    nowMs: () => now,
  };
  return { ports, signals };
}

test("npm run dev: the target is dev.mjs, never the lease pid or the npm parent", () => {
  const { ports } = fakePorts(DEV_TREE);
  assert.deepEqual(resolveExternalStopTarget({ lease: LEASE }, { ports }), { pid: 11, launcher: "npm-run-dev", command: "node development/scripts/dev.mjs" });
  const absolute = { ...DEV_TREE, 11: { ...DEV_TREE[11]!, command: "/usr/local/bin/node /Users/me/Tovu/development/scripts/dev.mjs" } };
  assert.equal(resolveExternalStopTarget({ lease: LEASE }, { ports: fakePorts(absolute).ports })?.pid, 11);
});

test("no dev.mjs ancestor: the lease pid itself, labelled other", () => {
  const table = { 20: { ppid: 1, command: "tovu serve /sites/a --port 4000", startMs: CLAIMED - 1_000 } };
  assert.deepEqual(resolveExternalStopTarget({ lease: { ...LEASE, pid: 20 } }, { ports: fakePorts(table).ports }), { pid: 20, launcher: "other", command: "tovu serve /sites/a --port 4000" });
});

test("PID reuse fails closed: a lease pid or launcher that started AFTER the claim is never a target", () => {
  const reused = { ...DEV_TREE, 14: { ...DEV_TREE[14]!, startMs: CLAIMED + 5_000 } };
  assert.equal(resolveExternalStopTarget({ lease: LEASE }, { ports: fakePorts(reused).ports }), null);
  const newLauncher = { ...DEV_TREE, 11: { ...DEV_TREE[11]!, startMs: CLAIMED + 1 } };
  assert.equal(resolveExternalStopTarget({ lease: LEASE }, { ports: fakePorts(newLauncher).ports }), null);
  assert.equal(resolveExternalStopTarget({ lease: { ...LEASE, started: "not a date" } }, { ports: fakePorts(DEV_TREE).ports }), null);
  assert.equal(resolveExternalStopTarget({ lease: { ...LEASE, pid: 99 } }, { ports: fakePorts(DEV_TREE).ports }), null, "a gone pid");
});

test("the ancestor walk is bounded, so a ps cycle cannot loop", () => {
  const cycle = { 30: { ppid: 31, command: "node server", startMs: 0 }, 31: { ppid: 30, command: "node other", startMs: 0 } };
  assert.equal(resolveExternalStopTarget({ lease: { ...LEASE, pid: 30 } }, { ports: fakePorts(cycle).ports })?.launcher, "other");
});

test("stop SIGTERMs dev.mjs once and waits for both the lease and the launcher to be gone", async () => {
  const table = structuredClone(DEV_TREE);
  let lease: typeof LEASE | null = LEASE;
  let polls = 0;
  const { ports, signals } = fakePorts(table, { onKill: () => { lease = null; } });
  const sleep = ports.sleep;
  // dev.mjs outlives the lease by a few polls (it SIGKILLs leftovers after 1.5 s, then exits).
  ports.sleep = async (ms) => { polls += 1; if (polls === 3) delete table[11]; await sleep(ms); };
  await stopExternalSite({ lease: LEASE, readLease: () => lease }, { ports });
  assert.deepEqual(signals, [[11, "SIGTERM"]]);
  assert.equal(polls, 3, "kept waiting while dev.mjs was still alive after the lease cleared");
});

test("stop refuses without signalling when identity cannot be proved, or changed before the signal", async () => {
  const reused = fakePorts({ ...DEV_TREE, 14: { ...DEV_TREE[14]!, startMs: CLAIMED + 1 } });
  await assert.rejects(stopExternalSite({ lease: LEASE, readLease: () => LEASE }, { ports: reused.ports }), { message: EXTERNAL_STOP_UNCONFIRMED });
  assert.deepEqual(reused.signals, []);

  // The launcher's argv changed between resolve and signal: its pid now names something else.
  const table = structuredClone(DEV_TREE);
  const swapped = fakePorts(table);
  const read = swapped.ports.readCommand;
  let reads = 0;
  swapped.ports.readCommand = (pid) => (pid === 11 && ++reads > 1 ? "vim notes.txt" : read(pid));
  await assert.rejects(stopExternalSite({ lease: LEASE, readLease: () => LEASE }, { ports: swapped.ports }), { message: EXTERNAL_STOP_UNCONFIRMED });
  assert.deepEqual(swapped.signals, []);

  const late = fakePorts({ ...DEV_TREE, 11: { ...DEV_TREE[11]!, startMs: CLAIMED - 1 } });
  let checks = 0;
  const start = late.ports.readStartMs;
  late.ports.readStartMs = (pid) => (pid === 11 && ++checks > 1 ? CLAIMED + 1 : start(pid));
  await assert.rejects(stopExternalSite({ lease: LEASE, readLease: () => LEASE }, { ports: late.ports }), { message: EXTERNAL_STOP_UNCONFIRMED });
  assert.deepEqual(late.signals, []);
});

test("a lease that changed hands before the signal is a no-op", async () => {
  const { ports, signals } = fakePorts(DEV_TREE);
  await stopExternalSite({ lease: LEASE, readLease: () => ({ token: "lease-b" }) }, { ports });
  await stopExternalSite({ lease: LEASE, readLease: () => null }, { ports });
  assert.deepEqual(signals, []);
});

test("a stack that does not exit in time is reported, never SIGKILLed", async () => {
  const { ports, signals } = fakePorts(DEV_TREE);
  await assert.rejects(stopExternalSite({ lease: LEASE, readLease: () => LEASE }, { ports, timeoutMs: 1_000, pollMs: 200 }), /did not stop within 1 s/);
  assert.deepEqual(signals, [[11, "SIGTERM"]]);
});

test("stop polling waits for the matching lease even after the target exits", async () => {
  let lease: typeof LEASE | undefined = LEASE;
  const { ports, signals } = fakePorts({});
  let polls = 0;
  const sleep = ports.sleep;
  ports.sleep = async (ms) => { assert.equal(ms, 75); polls++; lease = undefined; await sleep(ms); };
  await waitForExternalSiteStop({ lease: LEASE, target: { pid: 11, launcher: "npm-run-dev", command: "dev.mjs" }, readLease: () => lease, ports }, { pollMs: 75 });
  assert.equal(polls, 1);
  assert.deepEqual(signals, [], "polling itself must never signal");
});

test("stop polling waits for the original launcher after the lease changes", async () => {
  const table = structuredClone(DEV_TREE);
  const { ports } = fakePorts(table);
  let polls = 0;
  const sleep = ports.sleep;
  ports.sleep = async (ms) => { polls++; table[11]!.startMs = CLAIMED + 1; await sleep(ms); };
  await waitForExternalSiteStop({ lease: LEASE, target: { pid: 11, launcher: "npm-run-dev", command: "dev.mjs" }, readLease: () => ({ token: "new-owner" }), ports });
  assert.equal(polls, 1, "a recycled launcher PID ends this wait");
});

test("stop polling returns immediately after drain, and times out without signalling", async () => {
  const target = { pid: 11, launcher: "npm-run-dev" as const, command: "dev.mjs" };
  const { ports, signals } = fakePorts({});
  ports.sleep = async () => assert.fail("an already-drained stop must not sleep");
  await waitForExternalSiteStop({ lease: LEASE, target, readLease: () => null, ports });
  await assert.rejects(waitForExternalSiteStop({ lease: LEASE, target, readLease: () => LEASE, ports }, { timeoutMs: 0 }), /did not stop within 0 s/);
  assert.deepEqual(signals, []);
});

test("launcherOf caches proved answers per lease token, and never caches a failure", () => {
  const table = structuredClone(DEV_TREE);
  const { ports } = fakePorts(table);
  let reads = 0;
  const read = ports.readCommand;
  ports.readCommand = (pid) => { reads += 1; return read(pid); };
  const stopper = createExternalSiteStopper({}, { ports });
  assert.equal(stopper.launcherOf({ lease: LEASE }), "npm-run-dev");
  const after = reads;
  assert.equal(stopper.launcherOf({ lease: LEASE }), "npm-run-dev");
  assert.equal(reads, after, "cached");
  const gone = { ...LEASE, pid: 99, token: "lease-gone" };
  assert.equal(stopper.launcherOf({ lease: gone }), null);
  table[99] = { ppid: 1, command: "tovu serve", startMs: 0 };
  assert.equal(stopper.launcherOf({ lease: gone }), "other", "a failed proof is retried on the next poll");
  for (let index = 0; index < 70; index++) {
    assert.equal(stopper.launcherOf({ lease: { ...LEASE, pid: 99, token: `t-${index}` } }), "other", "stays bounded past the cache limit");
  }
});

test("the stopper's stop delegates to stopExternalSite with its ports", async () => {
  const table = structuredClone(DEV_TREE);
  let lease: typeof LEASE | null = LEASE;
  const { ports, signals } = fakePorts(table, { onKill: (pid) => { lease = null; delete table[pid]; } });
  await createExternalSiteStopper({}, { ports }).stop({ lease: LEASE, readLease: () => lease });
  assert.deepEqual(signals, [[11, "SIGTERM"]]);
});

test("real ports read this test process, argv-only, and win32 reads nothing", async () => {
  const startMs = readProcessStartMs(process.pid);
  assert.ok(startMs !== null && startMs <= Date.now());
  assert.equal(readProcessStartMs(process.pid, "win32"), null);
  assert.equal(readProcessStartMs(2 ** 22 + 12345), null, "a pid that does not exist");
  assert.equal(NODE_PORTS.readStartMs(process.pid), startMs);
  assert.match(NODE_PORTS.readCommand(process.pid) ?? "", /node/);
  assert.equal(NODE_PORTS.readParentPid(process.pid), process.ppid);
  assert.ok(Math.abs(NODE_PORTS.nowMs() - Date.now()) < 1_000);
  await NODE_PORTS.sleep(1);
  NODE_PORTS.kill(process.pid, 0 as unknown as NodeJS.Signals); // signal 0: an existence probe, sends nothing
});

test("readProcessStartMs asks ps for argv-free lstart and reads output that is not a date as unknown", () => {
  const calls: string[][] = [];
  const fixedStart = new Date(2026, 9, 21, 9, 30, 15);
  const lstart = fixedStart.toString().slice(0, 24);
  assert.equal(readProcessStartMs(4242, "linux", { runPs: (args) => (calls.push(args), `  ${lstart}\n`) }), fixedStart.getTime());
  assert.deepEqual(calls, [["-o", "lstart=", "-p", "4242"]]);
  assert.equal(readProcessStartMs(4242, "darwin", { runPs: () => "\n" }), null, "an empty answer is not a start time");
  assert.equal(readProcessStartMs(4242, "darwin", { runPs: () => "ps: lstart: keyword not found" }), null);
});
