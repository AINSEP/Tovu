/**
 * @file Direct tests for `site-process-registry.ts`.
 *
 * `isProcessAlive`/`readProcessCommand`/`terminateOrphan`/`reconcileOrphans` spawn REAL (tiny, plain
 * `node`) child processes rather than faking `ps` output — the identity proof reads a live process's
 * actual argv, and the only way to prove that proof works is against a process the OS really knows
 * about. No real `tovu serve` is ever spawned; every child here is `node -e "setTimeout(...)"`, given
 * fabricated argv that stands in for a site dir and port.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";

import { registryDirPath, legacyRegistryFilePath, instanceFilePath, readRegistryFile, readRegistry, writeRegistry, recordSiteOpened, recordSiteClosed, isProcessAlive, readProcessCommand, readProcessParentPid, isOrphanedProcess, isServeProcessForSite, terminateOrphan, reconcileOrphans } from "./site-process-registry.ts";
import { tempPathFor } from "./durable-json-file.ts";

/** A fresh registry DIRECTORY, not yet created — exactly as a first launch finds `userData`. */
function tempRegistryDir(): string {
  return registryDirPath(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-registry-")));
}

/** An instance id whose owner pid is really gone — a crashed app instance's file name. */
async function deadInstanceId(): Promise<string> {
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  await waitForExit(child);
  return `${child.pid}-deadbeef`;
}

/** A long-lived child whose argv contains `siteDir` and `--port <port>` — the exact substrings
 *  `isServeProcessForSite` looks for, standing in for a real `tovu serve <siteDir> --port <port>`. */
function spawnFakeServeChild(siteDir: string, port: number, { ignoreSigterm = false } = {}): ChildProcess {
  const script = ignoreSigterm ? "process.on('SIGTERM', () => {}); setTimeout(() => {}, 60000);" : "setTimeout(() => {}, 60000);";
  return spawn(process.execPath, ["-e", script, siteDir, "--port", String(port)], { stdio: "ignore" });
}

async function waitForExit(child: ChildProcess): Promise<void> {
  await new Promise((resolve) => child.once("exit", resolve));
}

/**
 * A long-lived fake `tovu serve` that is a REAL orphan: spawned by a throwaway launcher which then
 * exits, so the kernel reparents it to launchd. `spawnFakeServeChild` above cannot stand in for one
 * — its parent is this test process, which is very much alive, which is exactly the live-sibling
 * case `reconcileOrphans` must now refuse to kill.
 */
async function spawnOrphanedServeChild(siteDir: string, port: number, { script = "setTimeout(() => {}, 60000);" } = {}): Promise<number> {
  const launcher = [
    'const { spawn } = require("node:child_process");',
    `const child = spawn(process.execPath, ["-e", ${JSON.stringify(script)}, ${JSON.stringify(siteDir)}, "--port", ${JSON.stringify(String(port))}], { detached: true, stdio: "ignore" });`,
    "child.unref();",
    "console.log(child.pid);",
  ].join("\n");
  const pid = Number(execFileSync(process.execPath, ["-e", launcher], { encoding: "utf8" }).trim());
  const deadline = Date.now() + 5000;
  while (readProcessParentPid(pid) !== 1 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return pid;
}

test("registryDirPath is a directory inside userData; the legacy shared file sits beside it", () => {
  const userData = "/Users/x/Library/Application Support/Tovu";
  assert.equal(registryDirPath(userData), path.join(userData, "site-processes"));
  assert.equal(legacyRegistryFilePath(registryDirPath(userData)), path.join(userData, "open-sites.json"));
  assert.equal(instanceFilePath(registryDirPath(userData), "123-abcd"), path.join(userData, "site-processes", "123-abcd.json"));
  assert.match(path.basename(instanceFilePath(registryDirPath(userData))), new RegExp(`^${process.pid}-[0-9a-f]{8}\\.json$`), "this process's own file carries its pid and a nonce");
});

test("readRegistry of a registry nobody has written yet is empty, with nothing unreadable", () => {
  assert.deepEqual(readRegistry(tempRegistryDir()), { sites: [], unreadable: [] });
});

test("readRegistry reports an unparseable file as UNREADABLE — never as an empty registry", () => {
  const registryDir = tempRegistryDir();
  const filePath = instanceFilePath(registryDir, "4242-abcd");
  fs.mkdirSync(registryDir, { recursive: true });
  fs.writeFileSync(filePath, "{ not json");
  assert.deepEqual(readRegistry(registryDir), { sites: [], unreadable: [filePath] });
});

test("readRegistryFile: valid JSON that is not a registry is unreadable too, a missing file is missing", () => {
  const registryDir = tempRegistryDir();
  fs.mkdirSync(registryDir, { recursive: true });
  const filePath = path.join(registryDir, "4242-abcd.json");
  for (const text of ["null", "[]", "{}", '{"sites": "nope"}']) {
    fs.writeFileSync(filePath, text);
    assert.deepEqual(readRegistryFile(filePath), { state: "unreadable" }, text);
  }
  assert.deepEqual(readRegistryFile(path.join(registryDir, "absent.json")), { state: "missing" });
});

test("readRegistry drops malformed rows (missing siteDir or a non-numeric pid) instead of failing", () => {
  const registryDir = tempRegistryDir();
  writeRegistry(instanceFilePath(registryDir), { sites: [{ siteDir: "/a", port: 1, pid: 111 }, { port: 2, pid: 222 }, { siteDir: "/b", port: 3, pid: "not-a-number" }] });
  assert.deepEqual(readRegistry(registryDir).sites, [{ siteDir: "/a", port: 1, pid: 111 }]);
});

test("readRegistry unions every instance's file and the legacy file, ignoring temp and quarantined files", () => {
  const registryDir = tempRegistryDir();
  const own = { siteDir: "/own", port: 1, workspaceId: "w", pid: 1001, updatedAt: 1 };
  const sibling = { siteDir: "/sibling", port: 2, workspaceId: "w", pid: 1002, updatedAt: 2 };
  const legacy = { siteDir: "/legacy", port: 3, workspaceId: "w", pid: 1003, updatedAt: 3 };
  writeRegistry(instanceFilePath(registryDir), { sites: [own] });
  writeRegistry(instanceFilePath(registryDir, "77777-0badf00d"), { sites: [sibling] });
  writeRegistry(legacyRegistryFilePath(registryDir), { sites: [legacy] });
  fs.writeFileSync(tempPathFor(instanceFilePath(registryDir, "77777-0badf00d"), 77777), "{ half a wri");
  fs.writeFileSync(`${instanceFilePath(registryDir, "88888-0badf00d")}.corrupt-1`, "garbage");

  const { sites, unreadable } = readRegistry(registryDir);
  assert.deepEqual(sites.map((row) => row.pid).sort(), [1001, 1002, 1003]);
  assert.deepEqual(unreadable, []);
});

test("readRegistry reports a registry directory it cannot list as unreadable", () => {
  const registryDir = tempRegistryDir();
  fs.writeFileSync(registryDir, "a file where the directory should be");
  assert.deepEqual(readRegistry(registryDir), { sites: [], unreadable: [registryDir] });
});

test("recordSiteOpened writes a row, keyed by siteDir — a later call for the same dir replaces it", () => {
  const registryDir = tempRegistryDir();
  recordSiteOpened(registryDir, { siteDir: "/site-a", port: 100, workspaceId: "w1", pid: 111, updatedAt: 1 });
  recordSiteOpened(registryDir, { siteDir: "/site-b", port: 200, workspaceId: "w2", pid: 222, updatedAt: 2 });
  recordSiteOpened(registryDir, { siteDir: "/site-a", port: 101, workspaceId: "w1", pid: 333, updatedAt: 3 });

  const { sites } = readRegistry(registryDir);
  assert.equal(sites.length, 2);
  assert.deepEqual(sites.find((row) => row.siteDir === "/site-a"), { siteDir: "/site-a", port: 101, workspaceId: "w1", pid: 333, updatedAt: 3 });
});

test("recordSiteClosed drops exactly that site's row and leaves the others", () => {
  const registryDir = tempRegistryDir();
  recordSiteOpened(registryDir, { siteDir: "/site-a", port: 100, workspaceId: "w1", pid: 111, updatedAt: 1 });
  recordSiteOpened(registryDir, { siteDir: "/site-b", port: 200, workspaceId: "w2", pid: 222, updatedAt: 2 });

  recordSiteClosed(registryDir, "/site-a");

  const { sites } = readRegistry(registryDir);
  assert.deepEqual(sites.map((row) => row.siteDir), ["/site-b"]);
});

test("isProcessAlive is true for this very process and false once a child has actually exited", async () => {
  assert.equal(isProcessAlive(process.pid), true);

  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  await waitForExit(child);
  assert.equal(isProcessAlive(child.pid!), false);
});

test("readProcessCommand reads a live process's own argv, and null once it is gone", async () => {
  const child = spawnFakeServeChild("/fake/site/marker-1", 4001);
  try {
    const commandLine = readProcessCommand(child.pid!)!;
    assert.match(commandLine, /\/fake\/site\/marker-1/);
    assert.match(commandLine, /--port 4001/);
  } finally {
    child.kill("SIGKILL");
    await waitForExit(child);
  }
  assert.equal(readProcessCommand(child.pid!), null);
});

test("readProcessCommand short-circuits to null on win32 without ever invoking ps", () => {
  // `process.pid` (this very test process) is guaranteed alive, so a non-null result on the default
  // platform proves `ps` really ran; getting null for that SAME live pid when `platform` is injected
  // as "win32" can only mean the win32 branch returned before calling `ps` at all — there is no `ps`
  // on Windows, and orphan reaping is a documented no-op there (plan item W9).
  assert.notEqual(readProcessCommand(process.pid), null, "sanity: the POSIX path must still call ps");
  assert.equal(readProcessCommand(process.pid, "win32"), null);
});

test("isServeProcessForSite requires BOTH the site dir and the exact --port token", () => {
  const row = { siteDir: "/fake/site/marker-2", port: 4002 };
  assert.equal(isServeProcessForSite("node cli.js serve /fake/site/marker-2 --port 4002", row), true);
  assert.equal(isServeProcessForSite("node cli.js serve /fake/site/marker-2 --port 9999", row), false);
  assert.equal(isServeProcessForSite("node cli.js serve /some/other/dir --port 4002", row), false);
});

test("terminateOrphan sends SIGTERM and confirms the child actually exited, needing no escalation", async () => {
  const siteDir = "/fake/site/marker-3";
  const port = 4003;
  const child = spawnFakeServeChild(siteDir, port);
  await terminateOrphan({ siteDir, port, pid: child.pid! }, 2000);
  assert.equal(isProcessAlive(child.pid!), false);
});

test("terminateOrphan escalates to SIGKILL when the child ignores SIGTERM, but only after re-confirming identity", async () => {
  const siteDir = "/fake/site/marker-4";
  const port = 4004;
  const child = spawnFakeServeChild(siteDir, port, { ignoreSigterm: true });
  try {
    await terminateOrphan({ siteDir, port, pid: child.pid! }, 400);
    assert.equal(isProcessAlive(child.pid!), false);
  } finally {
    if (isProcessAlive(child.pid!)) child.kill("SIGKILL");
  }
});

test("terminateOrphan on an already-gone pid is a safe no-op", async () => {
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  await waitForExit(child);
  await assert.doesNotReject(terminateOrphan({ siteDir: "/gone", port: 1, pid: child.pid! }, 200));
});

test("reconcileOrphans terminates a live, identity-confirmed orphan and deletes its dead owner's file", async () => {
  const registryDir = tempRegistryDir();
  const siteDir = "/fake/site/marker-5";
  const port = 4005;
  // A genuine orphan (parent exited, reparented to launchd) rather than a child of this test
  // process — see `spawnOrphanedServeChild`'s own doc on why the distinction is now the rule.
  const pid = await spawnOrphanedServeChild(siteDir, port);
  const crashed = await deadInstanceId();
  recordSiteOpened(registryDir, { siteDir, port, workspaceId: "w5", pid, updatedAt: Date.now() }, { instanceId: crashed });
  fs.writeFileSync(tempPathFor(instanceFilePath(registryDir, crashed), Number(crashed.split("-")[0])), "{ a crash left this");

  const reconciled = await reconcileOrphans(registryDir);

  assert.deepEqual(reconciled.map((row) => row.siteDir), [siteDir]);
  assert.equal(isProcessAlive(pid), false);
  assert.deepEqual(fs.readdirSync(registryDir), [], "the crashed instance's file and its leftover .tmp are both gone");
});

test("readProcessParentPid reports the real parent, and null once the pid is gone", async () => {
  const child = spawnFakeServeChild("/fake/site/marker-8", 4008);
  try {
    assert.equal(readProcessParentPid(child.pid!), process.pid);
    assert.equal(isOrphanedProcess(child.pid!), false, "a child of a live parent is not an orphan");
  } finally {
    child.kill("SIGKILL");
    await waitForExit(child);
  }
  assert.equal(readProcessParentPid(child.pid!), null);
  assert.equal(isOrphanedProcess(child.pid!), false, "a pid that is gone cannot be proven orphaned");
});

test("readProcessParentPid short-circuits to null on win32 without ever invoking ps", () => {
  // Same proof shape as readProcessCommand's own win32 test: this process's real parent is
  // provably readable via `ps` on the default platform, so `null` for the identical pid under an
  // injected "win32" platform can only come from a short-circuit before `ps` runs.
  assert.notEqual(readProcessParentPid(process.pid), null, "sanity: the POSIX path must still call ps");
  assert.equal(readProcessParentPid(process.pid, "win32"), null);
});

test("isOrphanedProcess is true for a process whose parent has exited", async () => {
  const pid = await spawnOrphanedServeChild("/fake/site/marker-9", 4009);
  try {
    assert.equal(readProcessParentPid(pid), 1);
    assert.equal(isOrphanedProcess(pid), true);
  } finally {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
});

test("reconcileOrphans leaves an unrelated process alone when a recycled pid no longer matches the row's identity", async () => {
  const registryDir = tempRegistryDir();
  // A real, alive process whose argv has nothing to do with the persisted row — standing in for the
  // OS having reused the recorded pid for something else entirely since the row was written.
  const unrelated = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  try {
    recordSiteOpened(registryDir, { siteDir: "/fake/site/marker-6", port: 4006, workspaceId: "w6", pid: unrelated.pid!, updatedAt: Date.now() }, { instanceId: await deadInstanceId() });

    const reconciled = await reconcileOrphans(registryDir);

    assert.deepEqual(reconciled, []);
    assert.equal(isProcessAlive(unrelated.pid!), true, "an unrelated live process must never be killed on a stale row's authority");
    assert.deepEqual(readRegistry(registryDir).sites, [], "the stale, unverifiable row is still dropped so it is never re-processed");
  } finally {
    unrelated.kill("SIGKILL");
    await waitForExit(unrelated);
  }
});

test("reconcileOrphans silently drops a row whose pid is already gone", async () => {
  const registryDir = tempRegistryDir();
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  await waitForExit(child);
  recordSiteOpened(registryDir, { siteDir: "/fake/site/marker-7", port: 4007, workspaceId: "w7", pid: child.pid!, updatedAt: Date.now() }, { instanceId: await deadInstanceId() });

  const reconciled = await reconcileOrphans(registryDir);

  assert.deepEqual(reconciled, []);
  assert.deepEqual(readRegistry(registryDir).sites, []);
});

// --- live-sibling protection (2026-09-06) ---------------------------------------------------
//
// `reconcileOrphans` moved above the boot-mode split so the sites home UI (the default since a53c80df)
// reaps orphans too. Nothing stops two Electron instances running at once — there is no
// `requestSingleInstanceLock` in `main.ts` — so the SECOND instance's boot-time reconciliation
// reads the FIRST instance's rows, whose pids are alive and whose argv matches their row exactly.
// Only the child's own parentage distinguishes the two cases. Since 2026-09-20 those rows live in the
// first instance's own file, which the second must also leave byte-for-byte alone.

/** A fake `tovu serve` whose parent process is STILL ALIVE — a live sibling instance's child. */
function spawnSupervisedServeChild(siteDir: string, port: number): Promise<{ supervisor: ChildProcess; childPid: number }> {
  const launcher = [
    'const { spawn } = require("node:child_process");',
    `const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000);", ${JSON.stringify(siteDir)}, "--port", ${JSON.stringify(String(port))}], { detached: true, stdio: "ignore" });`,
    "console.log(child.pid);",
    "setTimeout(() => {}, 60000);",
  ].join("\n");
  const supervisor = spawn(process.execPath, ["-e", launcher], { stdio: ["ignore", "pipe", "ignore"] });
  return new Promise((resolve) => {
    let buffered = "";
    supervisor.stdout.on("data", (chunk) => {
      buffered += chunk;
      if (buffered.includes("\n")) resolve({ supervisor, childPid: Number(buffered.trim()) });
    });
  });
}

test("reconcileOrphans leaves a LIVE sibling instance's child alone, and its file untouched", async () => {
  const registryDir = tempRegistryDir();
  const siteDir = "/sites/owned-by-a-live-sibling";
  const port = 45001;
  const { supervisor, childPid } = await spawnSupervisedServeChild(siteDir, port);
  const row = { siteDir, port, workspaceId: "w1", pid: childPid, updatedAt: 1 };
  // The supervisor stands in for the sibling Electron instance, so its pid owns the file.
  const siblingFile = instanceFilePath(registryDir, `${supervisor.pid}-5151abcd`);
  writeRegistry(siblingFile, { sites: [row] });
  const before = fs.readFileSync(siblingFile, "utf8");

  try {
    const reconciled = await reconcileOrphans(registryDir);

    assert.deepEqual(reconciled, [], "a live sibling's child is not an orphan and must not be terminated");
    assert.equal(isProcessAlive(childPid), true, "the live sibling's tovu serve must still be running");
    assert.deepEqual(readRegistry(registryDir).sites, [row], "its row must survive so the sibling can still be reconciled later");
    assert.equal(fs.readFileSync(siblingFile, "utf8"), before, "a live instance's file is never rewritten by another");
  } finally {
    supervisor.kill("SIGKILL");
    try {
      process.kill(childPid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
});

test("recordSiteOpened keeps a still-LIVE row for the same site instead of replacing it", async () => {
  // D-07, as it stands since per-instance files: a sibling's rows are in the sibling's own file and
  // cannot be reached from here at all (see the cross-instance tests below). Inside ONE instance, a
  // window's `closed` handler drops its `openSites` entry before the old child's stop() finishes, so
  // the site can be reopened while that child is still draining. Replacing its row by siteDir would
  // leave nothing on disk naming it: hard-kill the app mid-drain and no later boot could reap it.
  const registryDir = tempRegistryDir();
  const drainingChild = spawnFakeServeChild("/site-x", 100);
  recordSiteOpened(registryDir, { siteDir: "/site-x", port: 100, workspaceId: "w1", pid: drainingChild.pid!, updatedAt: 1 });

  recordSiteOpened(registryDir, { siteDir: "/site-x", port: 101, workspaceId: "w1", pid: 999_999, updatedAt: 2 });

  const pids = readRegistry(registryDir).sites.map((row) => row.pid);
  assert.ok(pids.includes(drainingChild.pid!), "the still-live child must still be recorded and therefore still reapable");
  assert.ok(pids.includes(999_999), "and its replacement must be recorded too");

  drainingChild.kill("SIGKILL");
  await waitForExit(drainingChild);
});

test("recordSiteOpened still replaces a row whose process is dead or is no longer that site's serve", () => {
  // The other direction, and the reason this is not just "never replace": a row left by a crashed
  // child, or one whose pid the OS recycled to something unrelated, must not accumulate.
  const registryDir = tempRegistryDir();
  recordSiteOpened(registryDir, { siteDir: "/site-x", port: 100, workspaceId: "w1", pid: 999_998, updatedAt: 1 });
  recordSiteOpened(registryDir, { siteDir: "/site-x", port: 101, workspaceId: "w1", pid: 999_999, updatedAt: 2 });

  assert.deepEqual(readRegistry(registryDir).sites.map((row) => row.pid), [999_999]);
});

test("recordSiteClosed narrowed by pid drops only that child's row, not the other live one for the same site", async () => {
  // The write path's other half. Once two rows can legitimately exist for one siteDir, a
  // remove-everything-by-siteDir close would wipe the other child's row and reintroduce D-07 from
  // the close side.
  const registryDir = tempRegistryDir();
  const otherChild = spawnFakeServeChild("/site-x", 100);
  recordSiteOpened(registryDir, { siteDir: "/site-x", port: 100, workspaceId: "w1", pid: otherChild.pid!, updatedAt: 1 });
  recordSiteOpened(registryDir, { siteDir: "/site-x", port: 101, workspaceId: "w1", pid: 999_999, updatedAt: 2 });

  recordSiteClosed(registryDir, "/site-x", { pid: 999_999 });

  assert.deepEqual(readRegistry(registryDir).sites.map((row) => row.pid), [otherChild.pid!]);

  otherChild.kill("SIGKILL");
  await waitForExit(otherChild);
});

test("recordSiteClosed with no pid still drops every row for that site — the unchanged old contract", () => {
  const registryDir = tempRegistryDir();
  writeRegistry(instanceFilePath(registryDir), {
    sites: [
      { siteDir: "/site-x", port: 100, workspaceId: "w1", pid: 111, updatedAt: 1 },
      { siteDir: "/site-x", port: 101, workspaceId: "w1", pid: 222, updatedAt: 2 },
      { siteDir: "/site-y", port: 200, workspaceId: "w2", pid: 333, updatedAt: 3 },
    ],
  });

  recordSiteClosed(registryDir, "/site-x");

  assert.deepEqual(readRegistry(registryDir).sites.map((row) => row.pid), [333]);
});


// --- torn writes and cross-instance lost updates (2026-09-20) ------------------------------
//
// Each of these failed against the single shared `open-sites.json`: a torn file read as `[]` and the
// next write persisted that; a crash mid-write left a torn file; two instances' read-modify-writes
// lost each other's rows; and boot-time reconciliation rewrote the file after awaiting every
// orphan's SIGTERM grace, dropping whatever a sibling recorded meanwhile.

const ROW_A = { siteDir: "/site-a", port: 100, workspaceId: "w1", pid: 999_901, updatedAt: 1 };
const ROW_B = { siteDir: "/site-b", port: 200, workspaceId: "w2", pid: 999_902, updatedAt: 2 };
const ROW_C = { siteDir: "/site-c", port: 300, workspaceId: "w3", pid: 999_903, updatedAt: 3 };

/** Truncate a well-formed file to half its bytes, as a crash mid-`writeFileSync` would. */
function tearFile(filePath: string): string {
  const intact = fs.readFileSync(filePath, "utf8");
  const torn = intact.slice(0, Math.floor(intact.length / 2));
  fs.writeFileSync(filePath, torn);
  return torn;
}

/** Every `<name>.corrupt-<ms>` beside `filePath`, by full path. */
function quarantinedPaths(filePath: string): string[] {
  const dir = path.dirname(filePath);
  return fs.readdirSync(dir).filter((name) => name.startsWith(`${path.basename(filePath)}.corrupt-`)).map((name) => path.join(dir, name));
}

function quarantineMessage(filePath: string, asidePath: string): string {
  return `tovu desktop: site-process registry file ${filePath} was unreadable (torn or corrupt). Moved it aside to ${asidePath}; site processes it listed cannot be reconciled automatically.`;
}

test("readRegistry reports a TORN file as unreadable, not as an empty registry", () => {
  const registryDir = tempRegistryDir();
  const filePath = instanceFilePath(registryDir, "4242-abcd");
  writeRegistry(filePath, { sites: [ROW_A, ROW_B] });
  tearFile(filePath);
  assert.deepEqual(readRegistry(registryDir), { sites: [], unreadable: [filePath] });
});

test("recordSiteOpened over a torn own file moves the torn bytes aside, then records the new row", (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const registryDir = tempRegistryDir();
  const filePath = instanceFilePath(registryDir);
  writeRegistry(filePath, { sites: [ROW_A, ROW_B] });
  const torn = tearFile(filePath);

  recordSiteOpened(registryDir, ROW_C, { isLiveRow: () => false });

  const aside = quarantinedPaths(filePath);
  assert.equal(aside.length, 1);
  assert.equal(fs.readFileSync(aside[0]!, "utf8"), torn, "the torn bytes survive, byte for byte");
  assert.deepEqual(readRegistryFile(filePath), { state: "ok", sites: [ROW_C] });
  assert.deepEqual(errors.mock.calls.map((call) => call.arguments[0]), [quarantineMessage(filePath, aside[0]!)]);
});

test("recordSiteClosed over a torn own file moves the torn bytes aside instead of writing over them", (t) => {
  t.mock.method(console, "error", () => {});
  const registryDir = tempRegistryDir();
  const filePath = instanceFilePath(registryDir);
  writeRegistry(filePath, { sites: [ROW_A, ROW_B] });
  const torn = tearFile(filePath);

  recordSiteClosed(registryDir, ROW_A.siteDir, { pid: ROW_A.pid });

  const aside = quarantinedPaths(filePath);
  assert.deepEqual(aside.map((asidePath) => fs.readFileSync(asidePath, "utf8")), [torn]);
  assert.deepEqual(readRegistryFile(filePath), { state: "ok", sites: [] });
});

test("an unreadable own file that cannot be moved aside is left exactly as it was — nothing is written over it", (t) => {
  const registryDir = tempRegistryDir();
  const filePath = instanceFilePath(registryDir);
  writeRegistry(filePath, { sites: [ROW_A] });
  const torn = tearFile(filePath);
  const errors = t.mock.method(console, "error", () => {});
  t.mock.method(fs, "renameSync", () => {
    throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
  });

  recordSiteOpened(registryDir, ROW_C, { isLiveRow: () => false });
  t.mock.restoreAll();

  assert.equal(fs.readFileSync(filePath, "utf8"), torn);
  assert.deepEqual(fs.readdirSync(registryDir), [path.basename(filePath)], "no temp file and no aside copy either");
  assert.deepEqual(errors.mock.calls.map((call) => call.arguments[0]), [
    `tovu desktop: site-process registry file ${filePath} is unreadable and could not be moved aside (Error: EACCES: permission denied). Left untouched; nothing was written over it.`,
  ]);
});

test("a write that dies partway leaves the previous file whole, and readers never see the partial one", (t) => {
  const registryDir = tempRegistryDir();
  const filePath = instanceFilePath(registryDir);
  writeRegistry(filePath, { sites: [ROW_A] });
  const before = fs.readFileSync(filePath, "utf8");
  const realWrite = fs.writeFileSync;
  const crash = t.mock.method(fs, "writeFileSync", (target: fs.PathOrFileDescriptor, data: string) => {
    realWrite(target, data.slice(0, 10));
    throw new Error("simulated crash mid-write");
  });

  assert.throws(() => writeRegistry(filePath, { sites: [ROW_A, ROW_B] }), /simulated crash mid-write/);
  crash.mock.restore();

  assert.equal(crash.mock.callCount(), 1);
  assert.equal(fs.readFileSync(filePath, "utf8"), before);
  assert.deepEqual(readRegistry(registryDir), { sites: [ROW_A], unreadable: [] });
});

test("a crash between the temp write and the rename leaves the previous file whole", (t) => {
  const registryDir = tempRegistryDir();
  const filePath = instanceFilePath(registryDir);
  writeRegistry(filePath, { sites: [ROW_A] });
  const before = fs.readFileSync(filePath, "utf8");
  const crash = t.mock.method(fs, "renameSync", () => {
    throw new Error("simulated crash before rename");
  });

  assert.throws(() => writeRegistry(filePath, { sites: [ROW_A, ROW_B] }), /simulated crash before rename/);
  crash.mock.restore();

  assert.equal(crash.mock.callCount(), 1);
  assert.equal(fs.readFileSync(filePath, "utf8"), before);
  assert.deepEqual(JSON.parse(fs.readFileSync(tempPathFor(filePath), "utf8")), { sites: [ROW_A, ROW_B] }, "the complete new state was fsynced to the temp file, not the real one");
  assert.deepEqual(readRegistry(registryDir), { sites: [ROW_A], unreadable: [] });
});

test("a second instance's row written in the middle of this instance's read-modify-write is not lost", () => {
  const registryDir = tempRegistryDir();
  const instanceA = `${process.pid}-aaaa0001`;
  const instanceB = `${process.pid}-bbbb0002`;
  // A's own stale row for /site-a makes A's recordSiteOpened stop inside its read-modify-write to ask
  // the OS about it; instance B records its own row during exactly that window.
  recordSiteOpened(registryDir, { ...ROW_A, pid: 999_900 }, { instanceId: instanceA, isLiveRow: () => false });
  recordSiteOpened(registryDir, ROW_A, {
    instanceId: instanceA,
    isLiveRow: () => {
      recordSiteOpened(registryDir, ROW_B, { instanceId: instanceB, isLiveRow: () => false });
      return false;
    },
  });

  assert.deepEqual(readRegistryFile(instanceFilePath(registryDir, instanceA)), { state: "ok", sites: [ROW_A] });
  assert.deepEqual(readRegistryFile(instanceFilePath(registryDir, instanceB)), { state: "ok", sites: [ROW_B] });
});

test("boot-time reconciliation does not drop a row another instance records while it runs", async () => {
  const registryDir = tempRegistryDir();
  const siteDir = "/fake/site/marker-10";
  const port = 4010;
  // Takes ~400 ms to die after SIGTERM, so `terminateOrphan`'s poll holds reconciliation open.
  const pid = await spawnOrphanedServeChild(siteDir, port, { script: "process.on('SIGTERM', () => setTimeout(() => process.exit(0), 400)); setTimeout(() => {}, 60000);" });
  const crashed = await deadInstanceId();
  recordSiteOpened(registryDir, { siteDir, port, workspaceId: "w10", pid, updatedAt: 1 }, { instanceId: crashed });

  const reconciling = reconcileOrphans(registryDir, { instanceId: `${process.pid}-0000feed` });
  await new Promise((resolve) => setTimeout(resolve, 50));
  recordSiteOpened(registryDir, ROW_C, { instanceId: `${process.pid}-cccc0003`, isLiveRow: () => false });
  const reconciled = await reconciling;

  assert.deepEqual(reconciled.map((row) => row.pid), [pid], "the orphan was really reconciled while the other write landed");
  assert.deepEqual(readRegistry(registryDir), { sites: [ROW_C], unreadable: [] });
  assert.equal(fs.existsSync(instanceFilePath(registryDir, crashed)), false, "the crashed instance's file is gone");
});

test("reconcileOrphans never touches this instance's own file", async () => {
  const registryDir = tempRegistryDir();
  const own = await deadInstanceId(); // even a dead-looking pid: own is decided by id, not liveness
  writeRegistry(instanceFilePath(registryDir, own), { sites: [ROW_A] });
  const before = fs.readFileSync(instanceFilePath(registryDir, own), "utf8");

  assert.deepEqual(await reconcileOrphans(registryDir, { instanceId: own }), []);
  assert.equal(fs.readFileSync(instanceFilePath(registryDir, own), "utf8"), before);
});

test("reconcileOrphans leaves a live owner's file byte-for-byte, even when its rows are dead", async () => {
  const registryDir = tempRegistryDir();
  const liveFile = instanceFilePath(registryDir, `${process.pid}-11112222`);
  writeRegistry(liveFile, { sites: [ROW_A, ROW_B] });
  const before = fs.readFileSync(liveFile, "utf8");

  assert.deepEqual(await reconcileOrphans(registryDir, { instanceId: `${process.pid}-0000feed` }), []);
  assert.equal(fs.readFileSync(liveFile, "utf8"), before, "its owner drops its own rows; nobody else rewrites them");
});

test("reconcileOrphans moves a dead owner's unreadable file aside, and leaves a live owner's alone", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const registryDir = tempRegistryDir();
  const deadFile = instanceFilePath(registryDir, await deadInstanceId());
  const liveFile = instanceFilePath(registryDir, `${process.pid}-11112222`);
  writeRegistry(deadFile, { sites: [ROW_A] });
  writeRegistry(liveFile, { sites: [ROW_B] });
  const deadTorn = tearFile(deadFile);
  const liveTorn = tearFile(liveFile);

  assert.deepEqual(await reconcileOrphans(registryDir, { instanceId: `${process.pid}-0000feed` }), []);

  const aside = quarantinedPaths(deadFile);
  assert.deepEqual(aside.map((asidePath) => fs.readFileSync(asidePath, "utf8")), [deadTorn]);
  assert.equal(fs.existsSync(deadFile), false);
  assert.equal(fs.readFileSync(liveFile, "utf8"), liveTorn, "a live owner's unreadable file is its owner's to replace");
  assert.deepEqual(errors.mock.calls.map((call) => call.arguments[0]).sort(), [
    quarantineMessage(deadFile, aside[0]!),
    `tovu desktop: site-process registry file ${liveFile} is unreadable; its owner (pid ${process.pid}) is still running, so it is left untouched.`,
  ].sort());
});

test("reconcileOrphans reaps an orphan recorded in the LEGACY shared file, and never rewrites that file", async () => {
  const registryDir = tempRegistryDir();
  const siteDir = "/fake/site/marker-11";
  const port = 4011;
  const pid = await spawnOrphanedServeChild(siteDir, port);
  const legacyPath = legacyRegistryFilePath(registryDir);
  writeRegistry(legacyPath, { sites: [{ siteDir, port, workspaceId: "w11", pid, updatedAt: 1 }] });
  const before = fs.readFileSync(legacyPath, "utf8");

  const reconciled = await reconcileOrphans(registryDir);

  assert.deepEqual(reconciled.map((row) => row.pid), [pid]);
  assert.equal(isProcessAlive(pid), false);
  assert.equal(fs.readFileSync(legacyPath, "utf8"), before, "older builds still write it; this build only reads it");
});

test("reconcileOrphans moves an unreadable LEGACY file aside instead of reading it as empty", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const registryDir = tempRegistryDir();
  const legacyPath = legacyRegistryFilePath(registryDir);
  writeRegistry(legacyPath, { sites: [ROW_A, ROW_B] });
  const torn = tearFile(legacyPath);

  assert.deepEqual(await reconcileOrphans(registryDir), []);

  const aside = quarantinedPaths(legacyPath);
  assert.deepEqual(aside.map((asidePath) => fs.readFileSync(asidePath, "utf8")), [torn]);
  assert.equal(fs.existsSync(legacyPath), false);
  assert.deepEqual(errors.mock.calls.map((call) => call.arguments[0]), [quarantineMessage(legacyPath, aside[0]!)]);
});

test("reconcileOrphans reports a registry directory it cannot list, and still reconciles the legacy file", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const registryDir = tempRegistryDir();
  fs.writeFileSync(registryDir, "a file where the directory should be");
  writeRegistry(legacyRegistryFilePath(registryDir), { sites: [ROW_A] });

  assert.deepEqual(await reconcileOrphans(registryDir), []);
  assert.deepEqual(errors.mock.calls.map((call) => call.arguments[0]), [`tovu desktop: could not list ${registryDir}; orphans recorded there are not reconciled this boot.`]);
});
