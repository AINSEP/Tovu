/** P11 ST-18a.T / ST-18b.T — the bundled CLI's storage JSON, read strictly and capped. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  bindRunCli, bindStorageReports, parseStorageCapabilities, projectStorageReport, readStorageCapabilities, type RunCli,
} from "./storage-report-cli.ts";

const REPORT = {
  siteDir: "/secret/site", totalBytes: 30, knownBytes: 30, skippedSymlinks: ["/secret/x"], unknownPaths: [],
  classes: { automatic: { bytes: 10, knownBytes: 10, files: 2 }, "owner-data": { bytes: 20, knownBytes: 20, files: 3 } },
  databases: [{ category: "content-database", path: "/secret/site/db", mainBytes: 1, walBytes: 0, shmBytes: 0 }], elsewhere: [],
};

test("a report projects only safe numbers", () => {
  const read = projectStorageReport({ stdout: JSON.stringify(REPORT) });
  assert.deepEqual(read, { state: "ok", report: { totalBytes: 30, knownBytes: 30, classes: { automatic: { bytes: 10, files: 2 }, "owner-data": { bytes: 20, files: 3 } } } });
  assert.doesNotMatch(JSON.stringify(read), /secret/);
});

test("an odd report is unknown, never a guess", () => {
  for (const bad of ["not json", "[]", JSON.stringify({ ...REPORT, knownBytes: -1 }), JSON.stringify({ ...REPORT, classes: { "../x": { bytes: 1, files: 1 } } })]) {
    assert.deepEqual(projectStorageReport({ stdout: bad }), { state: "unknown" });
  }
});

test("T-18.7 capabilities are strict: unknown shape or operation means no action", () => {
  const read = parseStorageCapabilities({ stdout: '{"operations":["report","move","clean"]}' });
  assert.ok(read.state === "ok");
  assert.deepEqual([...read.operations], ["report", "move", "clean"]);
  for (const bad of ['{"clean":true,"compact":true}', '{"operations":["clean","vacuum"]}', '{"operations":["compact"],"version":2}', "", "null"]) {
    assert.deepEqual(parseStorageCapabilities({ stdout: bad }), { state: "unknown" });
  }
});

test("a failed or nonzero capabilities child is unknown", async () => {
  assert.deepEqual(await readStorageCapabilities({ runCli: async () => ({ state: "failed" }) }), { state: "unknown" });
  assert.deepEqual(await readStorageCapabilities({ runCli: async () => ({ state: "exited", code: 1, stdout: '{"operations":["compact"]}' }) }), { state: "unknown" });
});

test("at most two report children run at once", async () => {
  let running = 0;
  let peak = 0;
  const runCli: RunCli = async () => {
    running += 1; peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    return { state: "exited", code: 0, stdout: JSON.stringify(REPORT) };
  };
  const report = bindStorageReports({ runCli });
  const reads = await Promise.all(["/a", "/b", "/c", "/d", "/e"].map((dir) => report({ dir })));
  assert.equal(peak, 2);
  assert.ok(reads.every((read) => read.state === "ok"));
});

const nodeChild = (source: string) => bindRunCli({ planFor: () => ({ command: process.execPath, args: ["-e", source] }), spawn: ({ command, args }) => spawn(command, [...args], { stdio: ["ignore", "pipe", "ignore"] }) }, { maxBytes: 64 });

test("a real child: exit code and stdout are read; overflow and timeout fail", async () => {
  assert.deepEqual(await nodeChild('process.stdout.write("{}")')({ cliArgs: [] }), { state: "exited", code: 0, stdout: "{}" });
  assert.deepEqual(await nodeChild('process.stdout.write("x".repeat(1000))')({ cliArgs: [] }), { state: "failed" });
  assert.deepEqual(await nodeChild("setTimeout(() => {}, 10000)")({ cliArgs: [] }, { timeoutMs: 50 }), { state: "failed" });
});
