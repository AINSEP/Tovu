/**
 * @file Behaviour of the registered, beacon-gated background boot of routine sites
 * (`routine-sites.ts`): only registered sites whose bounded beacon reports enabled routines start,
 * running and session-withdrawn sites are skipped (withdrawal re-checked right before each start),
 * at most two starts run at once, and every failure is logged rather than thrown or shown.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ROUTINE_BEACON_MAX_BYTES, type RoutineBeacon } from "@tovu/contracts/routines";
import {
  createRoutineBeaconReader, createRoutineWithdrawals, startRoutineSites,
  type RoutineBootLogEntry, type RoutineSitesDeps,
} from "./routine-sites.ts";

const beacon = (enabled: number): RoutineBeacon => ({ v: 1, enabled, updatedAt: 1 });

function harness({ sites, beacons, running = [], withdrawn = [] }: {
  sites: string[]; beacons: Record<string, RoutineBeacon | null | Error>; running?: string[]; withdrawn?: string[];
}) {
  const started: string[] = [];
  const logs: RoutineBootLogEntry[] = [];
  const withdrawals = createRoutineWithdrawals();
  for (const siteDir of withdrawn) withdrawals.withdraw({ siteDir });
  const deps: RoutineSitesDeps = {
    listSites: async () => sites.map((siteDir) => ({ siteDir })),
    readBeacon: async ({ siteDir }) => {
      const value = beacons[siteDir];
      if (value instanceof Error) throw value;
      return value ?? null;
    },
    startSite: async ({ siteDir }) => { started.push(siteDir); },
    isRunning: ({ siteDir }) => running.includes(siteDir),
    isWithdrawn: withdrawals.isWithdrawn,
    log: (entry) => { logs.push(entry); },
  };
  return { deps, started, logs, withdrawals };
}

const ON = { releaseEnabled: true };

test("boot starts sites with enabled routines only", async () => {
  const h = harness({ sites: ["/a", "/b", "/c"], beacons: { "/a": beacon(2), "/b": beacon(0), "/c": null } });
  const result = await startRoutineSites(h.deps, ON);
  assert.deepEqual(h.started, ["/a"]);
  assert.deepEqual(result.started, ["/a"]);
  assert.deepEqual(h.logs, [], "a zero-count or absent beacon is a normal quiet skip");
});

test("withdrawn site stays stopped this session; a running site is not started twice", async () => {
  const h = harness({ sites: ["/a", "/b", "/c"], beacons: { "/a": beacon(1), "/b": beacon(1), "/c": beacon(1) }, running: ["/c"], withdrawn: ["/b"] });
  await startRoutineSites(h.deps, ON);
  assert.deepEqual(h.started, ["/a"]);
  assert.equal(h.withdrawals.isWithdrawn({ siteDir: "/b" }), true);
  assert.equal(h.withdrawals.isWithdrawn({ siteDir: "/a" }), false);
});

test("serialized-start race: a Stop recorded while the beacon is read wins over the background start", async () => {
  const h = harness({ sites: ["/a", "/b"], beacons: { "/a": beacon(1), "/b": beacon(1) } });
  const read = h.deps.readBeacon;
  h.deps.readBeacon = async (input) => {
    if (input.siteDir === "/a") h.withdrawals.withdraw({ siteDir: "/a" });
    return await read(input);
  };
  await startRoutineSites(h.deps, ON);
  assert.deepEqual(h.started, ["/b"]);
});

test("a site an explicit open started while the beacon was read is not started again", async () => {
  const h = harness({ sites: ["/a"], beacons: { "/a": beacon(1) } });
  let calls = 0;
  h.deps.isRunning = () => calls++ > 0;
  await startRoutineSites(h.deps, ON);
  assert.deepEqual(h.started, []);
});

test("concurrency two: never more than two starts in flight, and every eligible site still starts", async () => {
  const sites = ["/a", "/b", "/c", "/d", "/e"];
  const h = harness({ sites, beacons: Object.fromEntries(sites.map((s) => [s, beacon(1)])) });
  let inFlight = 0;
  let peak = 0;
  const releases: Array<() => void> = [];
  h.deps.startSite = async ({ siteDir }) => {
    h.started.push(siteDir);
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise<void>((resolve) => releases.push(resolve));
    inFlight--;
  };
  const done = startRoutineSites(h.deps, ON);
  for (let i = 0; i < 20 && h.started.length < sites.length; i++) {
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(inFlight <= 2, `in flight ${inFlight}`);
    releases.shift()?.();
  }
  while (releases.length) releases.shift()?.();
  await done;
  assert.equal(peak, 2);
  assert.deepEqual([...h.started].sort(), sites);
});

test("unreadable beacons and start failures are logged, never thrown, and do not stop other sites", async () => {
  const h = harness({ sites: ["/bad", "/fails", "/ok"], beacons: { "/bad": new Error("oversize"), "/fails": beacon(1), "/ok": beacon(3) } });
  const start = h.deps.startSite;
  h.deps.startSite = async (input) => {
    if (input.siteDir === "/fails") return await Promise.reject("port busy");
    await start(input);
  };
  const result = await startRoutineSites(h.deps, ON);
  assert.deepEqual(h.started, ["/ok"]);
  assert.deepEqual(result.started, ["/ok"]);
  assert.deepEqual(h.logs, [
    { event: "routine-beacon-unreadable", siteDir: "/bad", error: "oversize" },
    { event: "routine-site-start-failed", siteDir: "/fails", error: "port busy" },
  ]);
});

test("release flag off or a non-default policy does nothing: not even the registry is read", async () => {
  for (const optional of [{ releaseEnabled: false }, {}]) {
    const h = harness({ sites: ["/a"], beacons: { "/a": beacon(1) } });
    let listed = false;
    h.deps.listSites = async () => { listed = true; return [{ siteDir: "/a" }]; };
    assert.deepEqual(await startRoutineSites(h.deps, optional), { started: [] });
    assert.equal(listed, false);
  }
  const h = harness({ sites: ["/a"], beacons: { "/a": beacon(1) } });
  await startRoutineSites({ ...h.deps, policy: "none" }, ON);
  assert.deepEqual(h.started, []);
  await startRoutineSites({ ...h.deps, policy: "registered-enabled-except-withdrawn" }, ON);
  assert.deepEqual(h.started, ["/a"]);
});

/** A fake `fs/promises.open` over an in-memory file table, recording every path opened and read length. */
function fakeFs(files: Record<string, string | Error>, { chunk = Infinity }: { chunk?: number } = {}) {
  const opened: string[] = [];
  const requested: number[] = [];
  let closed = 0;
  const fs = {
    open: async (path: string, flags: string) => {
      assert.equal(flags, "r");
      opened.push(path);
      const file = files[path];
      if (file === undefined) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      if (file instanceof Error) throw file;
      const bytes = Buffer.from(file, "utf8");
      return {
        read: async (buffer: Buffer, offset: number, length: number, position: number) => {
          requested.push(length);
          const n = Math.max(0, Math.min(length, chunk, bytes.length - position));
          bytes.copy(buffer, offset, position, position + n);
          return { bytesRead: n };
        },
        close: async () => { closed++; },
      };
    },
  };
  return { fs, opened, requested, closed: () => closed };
}

test("relocated content: the beacon is read beside the RESOLVED content DB, never a guessed <siteDir>/content.db", async () => {
  const f = fakeFs({ "/moved/data/ops/routines-beacon.json": JSON.stringify(beacon(4)) }, { chunk: 7 });
  const resolved: string[] = [];
  const readBeacon = createRoutineBeaconReader({
    resolveContentDbPath: async ({ siteDir }) => { resolved.push(siteDir); return "/moved/data/content.db"; }, fs: f.fs,
  });
  assert.deepEqual(await readBeacon({ siteDir: "/site" }), beacon(4));
  assert.deepEqual(resolved, ["/site"]);
  assert.deepEqual(f.opened, ["/moved/data/ops/routines-beacon.json"]);
  assert.equal(f.closed(), 1);
});

test("absent beacon is null; malformed, oversize and unopenable beacons throw; the handle is always closed", async () => {
  const path = "/s/ops/routines-beacon.json";
  const reader = (files: Record<string, string | Error>) => {
    const f = fakeFs(files);
    return { f, read: createRoutineBeaconReader({ resolveContentDbPath: async () => "/s/content.db", fs: f.fs }) };
  };
  assert.equal(await reader({}).read({ siteDir: "/s" }), null);

  const malformed = reader({ [path]: "{\"v\":2,\"enabled\":1,\"updatedAt\":1}" });
  await assert.rejects(malformed.read({ siteDir: "/s" }), /malformed/);
  assert.equal(malformed.f.closed(), 1);

  const oversize = reader({ [path]: `${JSON.stringify(beacon(1))}${" ".repeat(ROUTINE_BEACON_MAX_BYTES)}` });
  await assert.rejects(oversize.read({ siteDir: "/s" }), /larger than 4096 bytes/);
  assert.ok(oversize.f.requested.every((n) => n <= ROUTINE_BEACON_MAX_BYTES + 1), "never reads past the bound");
  assert.equal(oversize.f.closed(), 1);

  const denied = reader({ [path]: Object.assign(new Error("EACCES"), { code: "EACCES" }) });
  await assert.rejects(denied.read({ siteDir: "/s" }), /EACCES/);
});
