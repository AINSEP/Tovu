import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test, { mock, type TestContext } from "node:test";

/**
 * @file `terminate()`, `killNow()` and readiness discovery of a launched local site against REAL
 * short-lived `node -e` processes: the site child, and a stand-in daemon whose command line carries
 * the `agent-daemon-server` marker and the `--local-site-api-pid` owner flag the discovery reads.
 * Only `listProcessSnapshots` is wrapped, so one test can make discovery itself fail.
 */
const processModule = await import("@jini-ai/platform/process");
let snapshotFailure: Error | undefined;
mock.module("@jini-ai/platform/process", { namedExports: { ...processModule,
  listProcessSnapshots: async (...args: Parameters<typeof processModule.listProcessSnapshots>) => {
    if (snapshotFailure) throw snapshotFailure;
    return processModule.listProcessSnapshots(...args);
  } } });
const { createLocalSiteProcessPort } = await import("../local-site-process.js");

const IDLE = "setInterval(() => {}, 1000)";
const DAEMON_PORT = 4702;

function siteFixture(t: TestContext, siteId: string) {
  const switcherBase = fs.mkdtempSync(path.join(os.tmpdir(), "site-terminate-"));
  t.after(() => fs.rmSync(switcherBase, { recursive: true, force: true }));
  const siteDir = path.join(switcherBase, "sites/slow");
  fs.mkdirSync(path.join(siteDir, "ops"), { recursive: true });
  fs.writeFileSync(path.join(siteDir, "config.json"), JSON.stringify({ name: "slow" }));
  fs.writeFileSync(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId, templateId: "blank",
    templateVersion: "1", schemaTag: "test", schemaVersion: 0, createdAt: "2026-10-31" }));
  const log = () => fs.readFileSync(path.join(siteDir, "ops/logs/local-site.log"), "utf8");
  return { switcherBase, siteDir, log };
}

/** A real idle node process; killed in cleanup if a test leaves it running. */
function idleProcess(t: TestContext, args: string[], options: Parameters<typeof spawn>[2] = { stdio: "ignore" }): ChildProcess {
  const child = spawn(process.execPath, ["-e", IDLE, ...args], options);
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  return child;
}

/** How the process ended, or "still running" after a bounded wait, so a regression fails instead of hanging. */
const exitOf = (child: ChildProcess) => new Promise<NodeJS.Signals | number | null | "still running">((resolve) => {
  if (child.exitCode !== null || child.signalCode !== null) return resolve(child.signalCode ?? child.exitCode);
  const deadline = setTimeout(() => resolve("still running"), 8000);
  child.once("exit", (code, signal) => { clearTimeout(deadline); resolve(signal ?? code); });
});

const isAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

function writeDaemonRecord(siteDir: string, pid: number) {
  fs.writeFileSync(path.join(siteDir, "ops/assistant-daemon.json"), JSON.stringify({
    url: `http://127.0.0.1:${DAEMON_PORT}`, host: "127.0.0.1", port: DAEMON_PORT, pid, startedAt: "2026-11-28T00:00:00.000Z" }));
}

test("terminate stops the real site child and then the site's own daemon, which detached from its tree", { timeout: 30_000 }, async (t) => {
  const { switcherBase, siteDir, log } = siteFixture(t, "slow-terminate");
  let api: ChildProcess | undefined;
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1" },
    // Keep the launch plan's own options (detached group, piped stdio); only the program is swapped.
    processOptions: { spawn: ({ options }) => (api = idleProcess(t, [], options)) },
  });
  t.after(() => local.dispose?.());
  const launched = await local.launch({ name: "slow", port: 4701, daemonPort: DAEMON_PORT });
  assert.ok(api?.pid);
  // Not detached here, so the group signal fails and the discovered daemon's own kill() is the path taken.
  const daemon = idleProcess(t, ["agent-daemon-server", "--local-site-api-pid", String(api.pid)]);
  writeDaemonRecord(siteDir, daemon.pid!);

  await launched.terminate();

  assert.equal(await exitOf(api), "SIGTERM", "the site child's process group was signalled");
  assert.equal(await exitOf(daemon), "SIGTERM", "the daemon named by the registry and owned by this API pid was stopped too");
  assert.match(log(), new RegExp(`\\[local-site slow\\] pid=${api.pid} supervisor requested tree termination`));
});

test("terminate never touches a registry pid whose daemon belongs to a different API process", { timeout: 30_000 }, async (t) => {
  const { switcherBase, siteDir } = siteFixture(t, "slow-foreign");
  let api: ChildProcess | undefined;
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1" },
    processOptions: { spawn: ({ options }) => (api = idleProcess(t, [], options)) },
  });
  t.after(() => local.dispose?.());
  const launched = await local.launch({ name: "slow", port: 4711, daemonPort: DAEMON_PORT });
  const foreign = idleProcess(t, ["agent-daemon-server", "--local-site-api-pid", String(api!.pid! + 100_000)]);
  writeDaemonRecord(siteDir, foreign.pid!);

  await launched.terminate();

  assert.equal(await exitOf(api!), "SIGTERM");
  assert.equal(isAlive(foreign.pid!), true, "another API's daemon survives this site's teardown");
  // A live pid that is not a daemon at all (this test runner) is equally left alone.
  writeDaemonRecord(siteDir, process.pid);
  await launched.terminate();
  assert.equal(isAlive(process.pid), true);
});

test("killNow logs a site child the OS refuses to stop, and still stops the daemon readiness discovered", { timeout: 30_000 }, async (t) => {
  const { switcherBase, siteDir, log } = siteFixture(t, "slow-kill-now");
  // Fault injection: the group signal and the child's own kill both fail, so tree teardown rejects.
  const refused = Object.assign(new EventEmitter(), { pid: 4242, stdout: new PassThrough(), stderr: new PassThrough(),
    kill: () => { throw new Error("operation not permitted"); } });
  t.after(() => { refused.stdout.end(); refused.stderr.end(); });
  const signalled: Array<[number, string | number | undefined]> = [];
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1", TOVU_ADMIN_DIST: "/prebuilt/dist" },
    processOptions: {
      spawn: () => refused as unknown as ChildProcess,
      signalProcess: (pid: number, signal?: string | number) => { signalled.push([pid, signal]); throw new Error("ESRCH"); },
    },
    probeHttp: async () => true,
  });
  t.after(() => local.dispose?.());
  const launched = await local.launch({ name: "slow", port: 4721, daemonPort: DAEMON_PORT });
  const daemon = idleProcess(t, ["agent-daemon-server", "--local-site-api-pid", "4242"]);
  writeDaemonRecord(siteDir, daemon.pid!);
  assert.equal(await launched.ready(), true, "readiness discovers the daemon before both probes pass");

  launched.killNow!();

  assert.equal(await exitOf(daemon), "SIGTERM", "the daemon is stopped even though the site child refused");
  assert.deepEqual(signalled, [[-4242, "SIGTERM"], [-daemon.pid!, "SIGTERM"]], "each tree is asked as a process group first");
  const text = log();
  assert.match(text, /\[local-site slow\] pid=4242 host shutdown requested tree termination/);
  assert.match(text, /"level":"error"[^\n]*Could not terminate the site process: Error"/);
  assert.doesNotMatch(text, /Could not terminate the site daemon/);
});

test("readiness rethrows a failed daemon discovery after recording it in the site log", { timeout: 30_000 }, async (t) => {
  const { switcherBase, siteDir, log } = siteFixture(t, "slow-discovery");
  const child = Object.assign(new EventEmitter(), { pid: 4343, stdout: new PassThrough(), stderr: new PassThrough() });
  t.after(() => { child.stdout.end(); child.stderr.end(); snapshotFailure = undefined; });
  let probes = 0;
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1", TOVU_ADMIN_DIST: "/prebuilt/dist" },
    processOptions: { spawn: () => child as unknown as ChildProcess },
    probeHttp: async () => { probes++; return true; },
  });
  t.after(() => local.dispose?.());
  const launched = await local.launch({ name: "slow", port: 4731, daemonPort: DAEMON_PORT });
  // A live registry pid makes discovery list processes; that listing is what fails.
  writeDaemonRecord(siteDir, process.pid);
  snapshotFailure = new Error("ps unavailable");

  await assert.rejects(launched.ready(), snapshotFailure);

  assert.equal(probes, 0, "no HTTP probe runs after discovery failed");
  assert.match(log(), /"level":"error"[^\n]*pid=4343 readiness discovery failed: Error: ps unavailable/);
});
