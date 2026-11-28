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
 * Only `listProcessSnapshots` is wrapped, so one test can make discovery itself fail. The launch
 * refusals, readiness probe order and child-error handling of the same port run over stand-in children.
 */
const processModule = await import("@jini-ai/platform/process");
let snapshotFailure: Error | undefined;
/** Fails exactly the next process listing, then lists for real again. */
let nextSnapshotFailure: Error | undefined;
mock.module("@jini-ai/platform/process", { namedExports: { ...processModule,
  listProcessSnapshots: async (...args: Parameters<typeof processModule.listProcessSnapshots>) => {
    if (snapshotFailure) throw snapshotFailure;
    const once = nextSnapshotFailure;
    nextSnapshotFailure = undefined;
    if (once) throw once;
    return processModule.listProcessSnapshots(...args);
  } } });
const { createLocalSiteProcessPort } = await import("../local-site-process.js");
const { claimSiteRunning } = await import("#src/platform/site-dir/site-running");
const { createSitesWorkspace } = await import("#src/platform/site-dir/sites-home");

/** Claim the site's running lease from this test process, in the same workspace the port lists. */
function claimAsExternalHost(siteDir: string, { env, cwd, app }: { env: NodeJS.ProcessEnv; cwd: string; app: "Web" | "Desktop" }) {
  return claimSiteRunning({ dir: siteDir, app }, { log: () => {}, workspace: createSitesWorkspace({}, { env, cwd }) });
}

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

test("terminate still stops a daemon readiness discovered after its registry record was removed", { timeout: 30_000 }, async (t) => {
  const { switcherBase, siteDir } = siteFixture(t, "slow-remembered");
  let api: ChildProcess | undefined;
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1", TOVU_ADMIN_DIST: "/prebuilt/dist" },
    processOptions: { spawn: ({ options }) => (api = idleProcess(t, [], options)) },
    probeHttp: async () => true,
  });
  t.after(() => local.dispose?.());
  const launched = await local.launch({ name: "slow", port: 4741, daemonPort: DAEMON_PORT });
  const daemon = idleProcess(t, ["agent-daemon-server", "--local-site-api-pid", String(api!.pid)]);
  writeDaemonRecord(siteDir, daemon.pid!);
  assert.equal(await launched.ready(), true);
  // The daemon unpublishes (or crashed mid-write); the identity readiness saw must still be reaped.
  fs.rmSync(path.join(siteDir, "ops/assistant-daemon.json"));

  await launched.terminate();

  assert.equal(await exitOf(api!), "SIGTERM");
  assert.equal(await exitOf(daemon), "SIGTERM");
});

test("launch refuses a child the OS gave no pid, after recording the spawn attempt", async (t) => {
  const { switcherBase, log } = siteFixture(t, "slow-no-pid");
  const child = Object.assign(new EventEmitter(), { pid: undefined, stdout: new PassThrough(), stderr: new PassThrough() });
  t.after(() => { child.stdout.end(); child.stderr.end(); });
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1" },
    processOptions: { spawn: () => child as unknown as ChildProcess },
  });
  t.after(() => local.dispose?.());

  await assert.rejects(local.launch({ name: "slow", port: 4751, daemonPort: DAEMON_PORT }), { name: "LocalSiteError", code: "SITE_START_FAILED" });
  assert.match(log(), /\[local-site slow\] spawned pid=none/);
});

test("readiness probes /readyz first and only then /admin/, logging which one failed", async (t) => {
  const { switcherBase, log } = siteFixture(t, "slow-probes");
  const child = Object.assign(new EventEmitter(), { pid: 4545, stdout: new PassThrough(), stderr: new PassThrough() });
  t.after(() => { child.stdout.end(); child.stderr.end(); });
  const answers = new Map<string, boolean>();
  const probed: string[] = [];
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1", TOVU_ADMIN_DIST: "/prebuilt/dist" },
    processOptions: { spawn: () => child as unknown as ChildProcess },
    probeHttp: async ({ url }) => { probed.push(url); return answers.get(new URL(url).pathname) ?? false; },
  });
  t.after(() => local.dispose?.());
  const launched = await local.launch({ name: "slow", port: 4761, daemonPort: DAEMON_PORT });

  answers.set("/readyz", false);
  assert.equal(await launched.ready(), false);
  assert.deepEqual(probed, ["http://127.0.0.1:4761/readyz"], "the admin is never probed while the API is not ready");
  assert.match(log(), /pid=4545 readiness failed: readyz=false, admin=not probed/);

  probed.length = 0;
  answers.set("/readyz", true);
  answers.set("/admin/", false);
  assert.equal(await launched.ready(), false);
  assert.deepEqual(probed, ["http://127.0.0.1:4761/readyz", "http://127.0.0.1:4761/admin/"]);
  assert.match(log(), /pid=4545 readiness failed: readyz=true, admin=false/);
});

test("a child process error counts as an exit: readiness refuses without probing and every exit listener hears it", async (t) => {
  const { switcherBase } = siteFixture(t, "slow-error");
  const child = Object.assign(new EventEmitter(), { pid: 4646, stdout: new PassThrough(), stderr: new PassThrough() });
  t.after(() => { child.stdout.end(); child.stderr.end(); });
  let probes = 0;
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1", TOVU_ADMIN_DIST: "/prebuilt/dist" },
    processOptions: { spawn: () => child as unknown as ChildProcess },
    probeHttp: async () => { probes++; return true; },
  });
  t.after(() => local.dispose?.());
  const launched = await local.launch({ name: "slow", port: 4771, daemonPort: DAEMON_PORT });
  const heard: string[] = [];
  launched.onExit({ listener: () => heard.push("early") });
  assert.equal(heard.length, 0, "a running child has not exited");

  child.emit("error", new Error("spawn EACCES"));
  launched.onExit({ listener: () => heard.push("late") });

  assert.deepEqual(heard, ["early", "late"], "a listener added after the error is told at once");
  assert.equal(await launched.ready(), false);
  assert.equal(probes, 0);
});

test("a remembered daemon that has since exited is re-checked and never signalled again, since its pid may be reused", { timeout: 30_000 }, async (t) => {
  const { switcherBase, siteDir } = siteFixture(t, "slow-stale");
  let api: ChildProcess | undefined;
  const signalled: number[] = [];
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1", TOVU_ADMIN_DIST: "/prebuilt/dist" },
    processOptions: {
      spawn: ({ options }) => (api = idleProcess(t, [], options)),
      signalProcess: (pid: number, signal?: string | number) => { signalled.push(pid); return process.kill(pid, signal); },
    },
    probeHttp: async () => true,
  });
  t.after(() => local.dispose?.());
  const launched = await local.launch({ name: "slow", port: 4781, daemonPort: DAEMON_PORT });
  const daemon = idleProcess(t, ["agent-daemon-server", "--local-site-api-pid", String(api!.pid)]);
  writeDaemonRecord(siteDir, daemon.pid!);
  assert.equal(await launched.ready(), true);
  fs.rmSync(path.join(siteDir, "ops/assistant-daemon.json"));
  daemon.kill("SIGKILL");
  assert.equal(await exitOf(daemon), "SIGKILL");

  await launched.terminate();

  assert.equal(await exitOf(api!), "SIGTERM");
  assert.deepEqual(signalled, [-api!.pid!], "only the site child's group is signalled; the dead daemon's pid is left alone");
});

/** Above Linux's largest possible pid_max (2^22), so a stand-in child's pid can never name a real process. */
const IMPOSSIBLE_PID = 4_194_401;

/** A stand-in site child the OS never ran; group signals to it fail and its own kill() succeeds. */
function standInChild(t: TestContext, pid: number) {
  const child = Object.assign(new EventEmitter(), { pid, stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true });
  t.after(() => { child.stdout.end(); child.stderr.end(); });
  return child;
}

test("existing and listExisting report a site another process runs: starting with no URL, then running with its admin URL", (t) => {
  const { switcherBase, siteDir } = siteFixture(t, "slow-external");
  const env = { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1" };
  const local = createLocalSiteProcessPort({ switcherBase }, { env });
  assert.equal(local.existing!({ name: "slow" }), null, "an idle site is not an existing process");
  assert.deepEqual(local.listExisting!(), []);
  // The test runner itself holds the lease, as a separately launched serving host would.
  const lease = claimAsExternalHost(siteDir, { env, cwd: switcherBase, app: "Desktop" });
  t.after(() => lease.release());
  const starting = { name: "slow", status: "starting", pid: process.pid, port: null, daemonPort: null, adminUrl: null, app: "Desktop", external: true };
  assert.deepEqual(local.existing!({ name: "slow" }), starting);
  assert.deepEqual(local.listExisting!(), [starting]);

  lease.ready({ port: 4799 });

  const running = { ...starting, status: "running", port: 4799, adminUrl: "http://localhost:4799/admin/" };
  assert.deepEqual(local.existing!({ name: "slow" }), running);
  assert.deepEqual(local.listExisting!(), [running]);
});

test("a watched warm site's daemon is the one owned by the site's running API, not by the launched watcher", { timeout: 30_000 }, async (t) => {
  const { switcherBase, siteDir } = siteFixture(t, "slow-watch");
  const child = standInChild(t, IMPOSSIBLE_PID);
  let spawnedEnv: NodeJS.ProcessEnv | undefined;
  const signalled: Array<[number, string | number | undefined]> = [];
  const env = { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1", TOVU_ADMIN_DIST: "/prebuilt/dist", TOVU_DEV_WARM_SITES: "1" };
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env,
    processOptions: {
      spawn: ({ options }) => { spawnedEnv = options.env; return child as unknown as ChildProcess; },
      signalProcess: (pid: number, signal?: string | number) => { signalled.push([pid, signal]); throw new Error("ESRCH"); },
    },
    probeHttp: async () => true,
  });
  t.after(() => local.dispose?.());
  const launched = await local.launch({ name: "slow", port: 4791, daemonPort: DAEMON_PORT });
  assert.equal(spawnedEnv?.TOVU_LOCAL_SITE_WATCH, "1");
  // Under tsx watch the API restarts as a grandchild; the site's running lease names the live API pid.
  const lease = claimAsExternalHost(siteDir, { env, cwd: switcherBase, app: "Web" });
  t.after(() => lease.release());
  const daemon = idleProcess(t, ["agent-daemon-server", "--local-site-api-pid", String(process.pid)]);
  writeDaemonRecord(siteDir, daemon.pid!);
  assert.equal(await launched.ready(), true);

  launched.killNow!();

  assert.equal(await exitOf(daemon), "SIGTERM", "the running API's daemon was discovered and stopped");
  assert.deepEqual(signalled, [[-IMPOSSIBLE_PID, "SIGTERM"], [-daemon.pid!, "SIGTERM"]]);
});

test("terminate still tears down the child and its daemon when the first daemon discovery fails", { timeout: 30_000 }, async (t) => {
  const { switcherBase, siteDir } = siteFixture(t, "slow-discovery-once");
  let api: ChildProcess | undefined;
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1" },
    processOptions: { spawn: ({ options }) => (api = idleProcess(t, [], options)) },
  });
  t.after(() => { nextSnapshotFailure = undefined; return local.dispose?.(); });
  const launched = await local.launch({ name: "slow", port: 4792, daemonPort: DAEMON_PORT });
  const daemon = idleProcess(t, ["agent-daemon-server", "--local-site-api-pid", String(api!.pid)]);
  writeDaemonRecord(siteDir, daemon.pid!);
  nextSnapshotFailure = new Error("ps busy");

  await launched.terminate();

  assert.equal(nextSnapshotFailure, undefined, "the failing listing was the one discovery made");
  assert.equal(await exitOf(api!), "SIGTERM");
  assert.equal(await exitOf(daemon), "SIGTERM", "the post-teardown discovery still finds and stops the daemon");
});

test("a child that exits while readiness discovers its daemon is not ready, and exit listeners hear the exit", async (t) => {
  const { switcherBase } = siteFixture(t, "slow-exit-mid-ready");
  const child = standInChild(t, IMPOSSIBLE_PID + 1);
  let probes = 0;
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1", TOVU_ADMIN_DIST: "/prebuilt/dist" },
    processOptions: { spawn: () => child as unknown as ChildProcess },
    probeHttp: async () => { probes++; return true; },
  });
  t.after(() => local.dispose?.());
  const launched = await local.launch({ name: "slow", port: 4793, daemonPort: DAEMON_PORT });
  const heard: string[] = [];
  launched.onExit({ listener: () => heard.push("exit") });

  const pending = launched.ready();
  // Discovery is awaiting the registry read when the child exits.
  child.emit("exit", 1, null);

  assert.equal(await pending, false);
  assert.equal(probes, 0, "an exited child is never probed");
  assert.deepEqual(heard, ["exit"]);
});

test("killNow logs a discovered daemon whose tree stop fails, after still signalling it", { timeout: 30_000 }, async (t) => {
  const { switcherBase, siteDir, log } = siteFixture(t, "slow-kill-now-daemon");
  const child = standInChild(t, IMPOSSIBLE_PID + 2);
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1", TOVU_ADMIN_DIST: "/prebuilt/dist" },
    processOptions: {
      spawn: () => child as unknown as ChildProcess,
      signalProcess: () => { throw new Error("ESRCH"); },
    },
    probeHttp: async () => true,
  });
  t.after(() => { snapshotFailure = undefined; return local.dispose?.(); });
  const launched = await local.launch({ name: "slow", port: 4794, daemonPort: DAEMON_PORT });
  const daemon = idleProcess(t, ["agent-daemon-server", "--local-site-api-pid", String(IMPOSSIBLE_PID + 2)]);
  writeDaemonRecord(siteDir, daemon.pid!);
  assert.equal(await launched.ready(), true);
  // Both tree stops can signal but can no longer list the tree they must reap.
  snapshotFailure = new Error("ps unavailable");

  launched.killNow!();

  assert.equal(await exitOf(daemon), "SIGTERM", "the daemon's own kill() ran before the tree listing failed");
  const text = log();
  assert.match(text, /"level":"error"[^\n]*Could not terminate the site process: Error/);
  assert.match(text, /"level":"error"[^\n]*Could not terminate the site daemon: Error/);
});

test("a daemon that refuses its direct signal does not abort terminate; the tree stop still reaps it", { timeout: 30_000 }, async (t) => {
  const { switcherBase, siteDir } = siteFixture(t, "slow-daemon-refuses");
  let api: ChildProcess | undefined;
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1" },
    processOptions: { spawn: ({ options }) => (api = idleProcess(t, [], options)) },
  });
  t.after(() => local.dispose?.());
  const launched = await local.launch({ name: "slow", port: 4795, daemonPort: DAEMON_PORT });
  const daemon = idleProcess(t, ["agent-daemon-server", "--local-site-api-pid", String(api!.pid)]);
  writeDaemonRecord(siteDir, daemon.pid!);
  const realKill = process.kill.bind(process);
  const refused: Array<[number, string | number | undefined]> = [];
  // Fault injection at the OS boundary: the first direct SIGTERM to the daemon is refused (EPERM);
  // liveness probes (signal 0) and every later signal reach the OS.
  t.mock.method(process, "kill", (pid: number, signal?: string | number) => {
    if (pid === daemon.pid && signal === "SIGTERM" && refused.length === 0) { refused.push([pid, signal]); throw Object.assign(new Error("kill EPERM"), { code: "EPERM" }); }
    return realKill(pid, signal);
  });

  await launched.terminate();

  assert.deepEqual(refused, [[daemon.pid, "SIGTERM"]], "the discovered daemon was asked directly once");
  assert.equal(await exitOf(api!), "SIGTERM");
  assert.equal(await exitOf(daemon), "SIGTERM", "the process-tree stop reaped the daemon after the refusal");
});
