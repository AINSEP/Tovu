import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { measureDesktop, measureTree, parseArgs, runMeasurement, serverLaunchArgs } from "../measure-site-memory.mjs";

const MAPS_OFF = new URL("../dev-source-maps-off.mjs", import.meta.url).href;
const TSX = "/repo/node_modules/tsx/dist/loader.mjs";
const SERVER = { pid: 10, name: "Electron", role: "server" };
const DAEMON = { pid: 11, name: "Electron", role: "daemon" };

/** Fake process tree and footprint reader; no inspector, no settle wait. `gone` pids read as exited. */
function fakePorts({ tree, gone = [] }) {
  return {
    listProcesses: () => tree,
    readFootprint: ({ pid }) => (gone.includes(pid) ? null : pid * 1024 * 1024),
    inspectorUrl: async () => null,
    sleep: async () => {},
  };
}

test("tsx launch imports the maps-off preload after tsx, like the real dev launchers", () => {
  assert.deepEqual(serverLaunchArgs({ entry: "/repo/cli/main.ts", mode: "tsx", siteCopy: "/t/site", port: 4100 }, { resolveTsx: () => TSX }), [
    "--optimize-for-size", "--import", pathToFileURL(TSX).href, "--import", MAPS_OFF, "/repo/cli/main.ts", "serve", "/t/site", "--port", "4100",
  ]);
  assert.deepEqual(serverLaunchArgs({ entry: "/t/dist/src/cli/main.js", mode: "compiled", siteCopy: "/t/site", port: 4100 }),
    ["--optimize-for-size", "/t/dist/src/cli/main.js", "serve", "/t/site", "--port", "4100"]);
});

test("cold and synthetic chat measurements expect an absent daemon unless running is explicit", () => {
  const chatting = parseArgs({ argv: ["--site", "/s", "--mode", "compiled", "--workload", "chatting"] });
  assert.equal(chatting.idleMinutes, 0);
  assert.equal(chatting.expectDaemon, "parked", "the fake chat turn does not demand a real daemon");
  assert.equal(parseArgs({ argv: ["--site", "/s", "--mode", "tsx"] }).expectDaemon, "parked");
  assert.equal(parseArgs({ argv: ["--site", "/s", "--mode", "tsx", "--idle-minutes", "1"] }).expectDaemon, "parked");
  assert.equal(parseArgs({ argv: ["--site", "/s", "--mode", "tsx", "--idle-minutes", "0"] }).expectDaemon, "parked");
  assert.equal(parseArgs({ argv: ["--site", "/s", "--mode", "tsx", "--idle-minutes", "1", "--expect-daemon", "running"] }).expectDaemon, "running");
  assert.throws(() => parseArgs({ argv: ["--site", "/s", "--mode", "tsx", "--expect-daemon", "maybe"] }), /--expect-daemon/);
});

test("the default cold and synthetic options accept a server-only tree", async () => {
  for (const workload of [[], ["--workload", "chatting"]]) {
    const { expectDaemon } = parseArgs({ argv: ["--site", "/s", "--mode", "tsx", ...workload] });
    const result = await measureTree({ rootPid: SERVER.pid, expectDaemon }, fakePorts({ tree: [SERVER] }));
    assert.equal(result.complete, true);
    assert.equal(result.processCount, 1);
    assert.deepEqual(result.totalFootprint, { natural: 10, afterGc: 10 });
  }
});

test("a dead server is never measured as zero", async () => {
  await assert.rejects(measureTree({ rootPid: 10, expectDaemon: "running" }, fakePorts({ tree: [] })), /server 10 is not running/);
});

test("the daemon state must match the phase before a sample is taken", async () => {
  await assert.rejects(measureTree({ rootPid: 10, expectDaemon: "running" }, fakePorts({ tree: [SERVER] })), /expected the daemon running/);
  await assert.rejects(measureTree({ rootPid: 10, expectDaemon: "parked" }, fakePorts({ tree: [SERVER, DAEMON] })), /expected the daemon parked/);
});

test("a complete sample totals every process's footprint", async () => {
  const result = await measureTree({ rootPid: 10, expectDaemon: "running" }, fakePorts({ tree: [SERVER, DAEMON] }));
  assert.equal(result.complete, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.totalFootprint, { natural: 21, afterGc: 21 });
  const parked = await measureTree({ rootPid: 10, expectDaemon: "parked" }, fakePorts({ tree: [SERVER] }));
  assert.deepEqual(parked.totalFootprint, { natural: 10, afterGc: 10 });
});

test("a missing footprint makes the sample incomplete, never a zero contribution", async () => {
  const result = await measureTree({ rootPid: 10, expectDaemon: "running" }, fakePorts({ tree: [SERVER, DAEMON], gone: [11] }));
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ["daemon 11 footprint.natural", "daemon 11 footprint.afterGc"]);
  assert.deepEqual(result.totalFootprint, { natural: null, afterGc: null });
});

test("site sampling preserves null totals with the shared asynchronous OS footprint reader", async () => {
  const ports = fakePorts({ tree: [SERVER, DAEMON] });
  ports.readFootprint = async ({ pid }) => pid === DAEMON.pid ? null : 1024 * 1024;
  const result = await measureTree({ rootPid: 10, expectDaemon: "running" }, ports);
  assert.equal(result.complete, false);
  assert.deepEqual(result.totalFootprint, { natural: null, afterGc: null });
  assert.equal(result.processes[0].footprint.natural, 1);
});

const DESKTOP = {
  groups: [{ name: "app", rootPids: [10] }, { name: "site", rootPids: [11] }],
  processes: [
    { pid: 10, family: "main", budgetMiB: 20 },
    { pid: 11, family: "server", budgetMiB: 30 },
    { pid: 12, family: "cli", budgetMiB: 40 },
  ],
};
const DESKTOP_USAGE = [
  { pid: 10, ppid: 1, name: "Electron", rssBytes: 999999999, cpuSeconds: 0 },
  { pid: 11, ppid: 10, name: "node", rssBytes: 999999999, cpuSeconds: 0 },
  { pid: 12, ppid: 11, name: "any-agent-cli", rssBytes: 999999999, cpuSeconds: 0 },
];
const desktopPorts = (overrides = {}) => ({
  platform: "darwin", listUsage: async () => DESKTOP_USAGE,
  listSnapshots: async () => DESKTOP_USAGE.map((row) => ({ pid: row.pid, ppid: row.ppid, command: row.name })),
  sampleMemory: async ({ pids }) => ({ metric: "physical-footprint", readings: pids.map((pid) => ({ pid, bytes: pid * 1024 * 1024 })) }),
  ...overrides,
});

test("desktop sampling counts each PID once across app and site groups", async () => {
  const result = await measureDesktop({ ...DESKTOP, workload: "idle-after-use" }, desktopPorts({
    sampleMemory: async ({ pids }) => {
      assert.equal(pids.length, new Set(pids).size);
      return { metric: "physical-footprint", readings: pids.map((pid) => ({ pid, bytes: pid * 1024 * 1024 })) };
    },
  }));
  assert.equal(result.complete, true);
  assert.equal(result.duplicatePidCount, 0);
  assert.equal(result.processCount, 3);
  assert.equal(result.totalPrimaryBytes, 33 * 1024 * 1024);
  assert.deepEqual(result.processes.find((row) => row.pid === 11).groups, ["app", "site"]);
  assert.equal(result.budgets.families.find((row) => row.family === "cli").budgetMiB, 40);
  assert.equal(result.processes.find((row) => row.pid === 12).budgetMiB, 40);
});

test("an unreadable live process nulls the total", async () => {
  const result = await measureDesktop({ ...DESKTOP, workload: "chatting" }, desktopPorts({
    sampleMemory: async ({ pids }) => ({ metric: "physical-footprint", readings: pids.map((pid) => ({ pid, bytes: pid === 11 ? null : 1024 })) }),
  }));
  assert.equal(result.complete, false);
  assert.equal(result.totalPrimaryBytes, null);
  assert.ok(result.missing.some((reason) => reason.includes("11")));
  assert.equal(result.processes.find((row) => row.pid === 11).rssBytes, 999999999);
  assert.equal(result.processes.find((row) => row.pid === 11).primaryBytes, null);
});

test("attach mode never launches builds forces GC or terminates the target", async () => {
  for (const workload of ["idle-after-use", "chatting"]) {
    const options = parseArgs({ argv: ["--mode", "desktop", "--attach", "desktop.json", "--workload", workload] });
    const result = await runMeasurement({ options }, {
      readManifest: () => DESKTOP,
      measureSite: () => assert.fail("site lifecycle copies, builds, launches, forces GC and terminates its tree"),
      measureDesktop: (input) => measureDesktop(input, desktopPorts({ platform: "win32", sampleMemory: async ({ pids }) => ({
        metric: "private-working-set", readings: pids.map((pid) => ({ pid, bytes: 1024 })),
      }) })),
    });
    assert.equal(result.workload, workload);
    assert.equal(result.metric, "private-working-set");
    assert.equal(result.complete, true);
    assert.equal(result.totalPrimaryBytes, 3072);
  }
});

test("desktop sampling includes detached helpers and rejects unclassified descendants", async () => {
  const input = { ...DESKTOP, processes: [...DESKTOP.processes, { pid: 20, family: "mcp-helper", budgetMiB: 50 }], workload: "chatting" };
  const rows = [...DESKTOP_USAGE,
    { pid: 20, ppid: 1, name: "helper", rssBytes: 1024 }, { pid: 21, ppid: 20, name: "worker", rssBytes: 1024 },
  ];
  const result = await measureDesktop(input, desktopPorts({ listUsage: async () => rows,
    listSnapshots: async () => rows.map((row) => ({ ...row, command: row.name })),
  }));
  assert.deepEqual(result.processes.map((row) => row.pid).sort((a, b) => a - b), [10, 11, 12, 20, 21]);
  assert.equal(result.complete, false);
  assert.equal(result.totalPrimaryBytes, null);
  assert.ok(result.missing.some((reason) => reason.includes("21") && reason.includes("budget")));
});

test("desktop sampling never reports a missing root or an empty snapshot as zero", async () => {
  const result = await measureDesktop({ ...DESKTOP, workload: "chatting" }, desktopPorts({ listUsage: async () => [], listSnapshots: async () => [] }));
  assert.equal(result.complete, false);
  assert.equal(result.totalPrimaryBytes, null);
  assert.ok(result.missing.some((reason) => reason.includes("10")));
});

test("a live descendant without RSS or CPU diagnostics still requires a primary reading", async () => {
  const result = await measureDesktop({ ...DESKTOP, workload: "chatting" }, desktopPorts({
    listUsage: async () => DESKTOP_USAGE.filter((row) => row.pid !== 12),
    sampleMemory: async ({ pids }) => ({ metric: "physical-footprint", readings: pids.map((pid) => ({ pid, bytes: pid === 12 ? null : 1024 })) }),
  }));
  assert.equal(result.processCount, 3);
  assert.equal(result.processes.find((row) => row.pid === 12).rssBytes, null);
  assert.equal(result.processes.find((row) => row.pid === 12).name, "any-agent-cli");
  assert.equal(result.totalPrimaryBytes, null);
});

test("processes appearing or disappearing during desktop sampling fail the run explicitly", async () => {
  let snapshots = 0;
  const result = await measureDesktop({ ...DESKTOP, workload: "chatting" }, desktopPorts({
    listSnapshots: async () => {
      snapshots += 1;
      const rows = DESKTOP_USAGE.map((row) => ({ ...row, command: row.name }));
      return snapshots === 1 ? rows : [...rows.filter((row) => row.pid !== 12), { pid: 13, ppid: 11, command: "new-helper" }];
    },
  }));
  assert.equal(result.complete, false);
  assert.equal(result.totalPrimaryBytes, null);
  assert.deepEqual(result.processes.map((row) => row.pid).sort((a, b) => a - b), [10, 11, 12, 13]);
  assert.ok(result.missing.some((reason) => reason.includes("12")));
  assert.ok(result.missing.some((reason) => reason.includes("13")));
  assert.equal(result.processes.find((row) => row.pid === 13).primaryBytes, null);
});

test("the warm slim daemon keeps its 80 MiB gate and planning targets stay advisory", async () => {
  const input = { groups: [{ name: "site", rootPids: [12] }], processes: [{ pid: 12, family: "warm-slim-daemon", budgetMiB: 100 }], workload: "idle-after-use" };
  const result = await measureDesktop(input, desktopPorts({ sampleMemory: async () => ({ metric: "physical-footprint", readings: [{ pid: 12, bytes: 81 * 1024 * 1024 }] }) }));
  assert.equal(result.complete, true);
  assert.equal(result.withinBudgets, false);
  assert.equal(result.processes[0].budgetMiB, 80);
  assert.deepEqual(result.planningTargetsMiB, { sharedElectron: [600, 900], server: [180, 300], guest: [250, 450] });
});

test("desktop attach requires a workload, process groups and unique PID metadata", async () => {
  assert.throws(() => parseArgs({ argv: ["--mode", "desktop", "--attach", "desktop.json"] }), /workload/);
  assert.throws(() => parseArgs({ argv: ["--mode", "desktop", "--attach", "desktop.json", "--workload", "idle"] }), /workload/);
  await assert.rejects(measureDesktop({ ...DESKTOP, groups: [], workload: "chatting" }, desktopPorts()), /groups/);
  await assert.rejects(measureDesktop({ ...DESKTOP, processes: [...DESKTOP.processes, DESKTOP.processes[0]], workload: "chatting" }, desktopPorts()), /duplicate/);
});

test("both desktop workloads account for every Electron, server, daemon, CLI and MCP family", async () => {
  const families = ["main", "GPU", "network", "shell-renderer", "site-guest", "server", "warm-slim-daemon", "cli", "cli", "mcp-helper"];
  const processes = families.map((family, index) => ({ pid: 100 + index, family, budgetMiB: 1 }));
  const snapshots = processes.map((row) => ({ pid: row.pid, ppid: row.pid === 100 ? 1 : 100, command: "executable" }));
  for (const workload of ["idle-after-use", "chatting"]) {
    const result = await measureDesktop({ groups: [{ name: "app", rootPids: [100] }], processes, workload }, desktopPorts({
      listSnapshots: async () => snapshots, listUsage: async () => [],
      sampleMemory: async ({ pids }) => ({ metric: "physical-footprint", readings: pids.map((pid) => ({ pid, bytes: 1024 })) }),
    }));
    assert.equal(result.complete, true);
    assert.equal(result.processCount, families.length);
    assert.equal(result.duplicatePidCount, 0);
    assert.equal(result.totalPrimaryBytes, 10 * 1024);
    assert.equal(result.budgets.families.find((row) => row.family === "cli").budgetMiB, 2);
    assert.equal(result.processes.filter((row) => row.family === "cli").length, 2);
  }
});
