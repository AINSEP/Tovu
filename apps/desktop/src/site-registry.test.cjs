/**
 * @file Direct tests for `site-registry.cjs`.
 *
 * `isProcessAlive`/`readProcessCommand`/`terminateOrphan`/`reconcileOrphans` spawn REAL (tiny, plain
 * `node`) child processes rather than faking `ps` output — the identity proof reads a live process's
 * actual argv, and the only way to prove that proof works is against a process the OS really knows
 * about. No real `tovu serve` is ever spawned; every child here is `node -e "setTimeout(...)"`, given
 * fabricated argv that stands in for a site dir and port.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const {
  registryFilePath,
  readRegistry,
  writeRegistry,
  recordSiteOpened,
  recordSiteClosed,
  isProcessAlive,
  readProcessCommand,
  isServeProcessForSite,
  terminateOrphan,
  reconcileOrphans,
} = require("./site-registry.cjs");

function tempStatePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-registry-")), "open-sites.json");
}

/** A long-lived child whose argv contains `siteDir` and `--port <port>` — the exact substrings
 *  `isServeProcessForSite` looks for, standing in for a real `tovu serve <siteDir> --port <port>`. */
function spawnFakeServeChild(siteDir, port, { ignoreSigterm = false } = {}) {
  const script = ignoreSigterm ? "process.on('SIGTERM', () => {}); setTimeout(() => {}, 60000);" : "setTimeout(() => {}, 60000);";
  return spawn(process.execPath, ["-e", script, siteDir, "--port", String(port)], { stdio: "ignore" });
}

async function waitForExit(child) {
  await new Promise((resolve) => child.once("exit", resolve));
}

test("registryFilePath places the file inside the given userData dir", () => {
  assert.equal(registryFilePath("/Users/x/Library/Application Support/Tovu"), path.join("/Users/x/Library/Application Support/Tovu", "open-sites.json"));
});

test("readRegistry treats a missing or corrupt file as an empty registry", () => {
  const registryPath = tempStatePath();
  assert.deepEqual(readRegistry(registryPath), { sites: [] });
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, "{ not json");
  assert.deepEqual(readRegistry(registryPath), { sites: [] });
});

test("readRegistry drops malformed rows (missing siteDir or a non-numeric pid) instead of failing", () => {
  const registryPath = tempStatePath();
  writeRegistry(registryPath, { sites: [{ siteDir: "/a", port: 1, pid: 111 }, { port: 2, pid: 222 }, { siteDir: "/b", port: 3, pid: "not-a-number" }] });
  assert.deepEqual(readRegistry(registryPath).sites, [{ siteDir: "/a", port: 1, pid: 111 }]);
});

test("recordSiteOpened writes a row, keyed by siteDir — a later call for the same dir replaces it", () => {
  const registryPath = tempStatePath();
  recordSiteOpened(registryPath, { siteDir: "/site-a", port: 100, workspaceId: "w1", pid: 111, updatedAt: 1 });
  recordSiteOpened(registryPath, { siteDir: "/site-b", port: 200, workspaceId: "w2", pid: 222, updatedAt: 2 });
  recordSiteOpened(registryPath, { siteDir: "/site-a", port: 101, workspaceId: "w1", pid: 333, updatedAt: 3 });

  const { sites } = readRegistry(registryPath);
  assert.equal(sites.length, 2);
  assert.deepEqual(sites.find((row) => row.siteDir === "/site-a"), { siteDir: "/site-a", port: 101, workspaceId: "w1", pid: 333, updatedAt: 3 });
});

test("recordSiteClosed drops exactly that site's row and leaves the others", () => {
  const registryPath = tempStatePath();
  recordSiteOpened(registryPath, { siteDir: "/site-a", port: 100, workspaceId: "w1", pid: 111, updatedAt: 1 });
  recordSiteOpened(registryPath, { siteDir: "/site-b", port: 200, workspaceId: "w2", pid: 222, updatedAt: 2 });

  recordSiteClosed(registryPath, "/site-a");

  const { sites } = readRegistry(registryPath);
  assert.deepEqual(sites.map((row) => row.siteDir), ["/site-b"]);
});

test("isProcessAlive is true for this very process and false once a child has actually exited", async () => {
  assert.equal(isProcessAlive(process.pid), true);

  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  await waitForExit(child);
  assert.equal(isProcessAlive(child.pid), false);
});

test("readProcessCommand reads a live process's own argv, and null once it is gone", async () => {
  const child = spawnFakeServeChild("/fake/site/marker-1", 4001);
  try {
    const commandLine = readProcessCommand(child.pid);
    assert.match(commandLine, /\/fake\/site\/marker-1/);
    assert.match(commandLine, /--port 4001/);
  } finally {
    child.kill("SIGKILL");
    await waitForExit(child);
  }
  assert.equal(readProcessCommand(child.pid), null);
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
  await terminateOrphan({ siteDir, port, pid: child.pid }, 2000);
  assert.equal(isProcessAlive(child.pid), false);
});

test("terminateOrphan escalates to SIGKILL when the child ignores SIGTERM, but only after re-confirming identity", async () => {
  const siteDir = "/fake/site/marker-4";
  const port = 4004;
  const child = spawnFakeServeChild(siteDir, port, { ignoreSigterm: true });
  try {
    await terminateOrphan({ siteDir, port, pid: child.pid }, 400);
    assert.equal(isProcessAlive(child.pid), false);
  } finally {
    if (isProcessAlive(child.pid)) child.kill("SIGKILL");
  }
});

test("terminateOrphan on an already-gone pid is a safe no-op", async () => {
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  await waitForExit(child);
  await assert.doesNotReject(terminateOrphan({ siteDir: "/gone", port: 1, pid: child.pid }, 200));
});

test("reconcileOrphans terminates a live, identity-confirmed orphan and empties the registry", async () => {
  const registryPath = tempStatePath();
  const siteDir = "/fake/site/marker-5";
  const port = 4005;
  const child = spawnFakeServeChild(siteDir, port);
  recordSiteOpened(registryPath, { siteDir, port, workspaceId: "w5", pid: child.pid, updatedAt: Date.now() });

  const reconciled = await reconcileOrphans(registryPath);

  assert.deepEqual(reconciled.map((row) => row.siteDir), [siteDir]);
  assert.equal(isProcessAlive(child.pid), false);
  assert.deepEqual(readRegistry(registryPath).sites, []);
});

test("reconcileOrphans leaves an unrelated process alone when a recycled pid no longer matches the row's identity", async () => {
  const registryPath = tempStatePath();
  // A real, alive process whose argv has nothing to do with the persisted row — standing in for the
  // OS having reused the recorded pid for something else entirely since the row was written.
  const unrelated = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  try {
    recordSiteOpened(registryPath, { siteDir: "/fake/site/marker-6", port: 4006, workspaceId: "w6", pid: unrelated.pid, updatedAt: Date.now() });

    const reconciled = await reconcileOrphans(registryPath);

    assert.deepEqual(reconciled, []);
    assert.equal(isProcessAlive(unrelated.pid), true, "an unrelated live process must never be killed on a stale row's authority");
    assert.deepEqual(readRegistry(registryPath).sites, [], "the stale, unverifiable row is still dropped so it is never re-processed");
  } finally {
    unrelated.kill("SIGKILL");
    await waitForExit(unrelated);
  }
});

test("reconcileOrphans silently drops a row whose pid is already gone", async () => {
  const registryPath = tempStatePath();
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  await waitForExit(child);
  recordSiteOpened(registryPath, { siteDir: "/fake/site/marker-7", port: 4007, workspaceId: "w7", pid: child.pid, updatedAt: Date.now() });

  const reconciled = await reconcileOrphans(registryPath);

  assert.deepEqual(reconciled, []);
  assert.deepEqual(readRegistry(registryPath).sites, []);
});
