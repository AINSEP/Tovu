import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { measureTree, parseArgs, serverLaunchArgs } from "../measure-site-memory.mjs";

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
    "--import", pathToFileURL(TSX).href, "--import", MAPS_OFF, "/repo/cli/main.ts", "serve", "/t/site", "--port", "4100",
  ]);
  assert.deepEqual(serverLaunchArgs({ entry: "/t/dist/src/cli/main.js", mode: "compiled", siteCopy: "/t/site", port: 4100 }),
    ["/t/dist/src/cli/main.js", "serve", "/t/site", "--port", "4100"]);
});

test("the daemon is expected running unless the idle wait outlasts --idle-minutes", () => {
  assert.equal(parseArgs({ argv: ["--site", "/s", "--mode", "tsx"] }).expectDaemon, "running");
  assert.equal(parseArgs({ argv: ["--site", "/s", "--mode", "tsx", "--idle-minutes", "1"] }).expectDaemon, "parked");
  assert.equal(parseArgs({ argv: ["--site", "/s", "--mode", "tsx", "--idle-minutes", "0"] }).expectDaemon, "running");
  assert.equal(parseArgs({ argv: ["--site", "/s", "--mode", "tsx", "--idle-minutes", "1", "--expect-daemon", "running"] }).expectDaemon, "running");
  assert.throws(() => parseArgs({ argv: ["--site", "/s", "--mode", "tsx", "--expect-daemon", "maybe"] }), /--expect-daemon/);
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
