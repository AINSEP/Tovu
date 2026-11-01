import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import type { spawn } from "node:child_process";
import { buildAdmin, journeyAdminBundle, waitForLocalAdminBuild } from "../../local-admin-bundle.js";
import { runLocalSiteChild } from "../../local-site-child.js";
import { withFileLock } from "@jini-ai/platform/fs";

test("journey and local boot share one origin-neutral production bundle with failed-build recovery", async (t) => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-bundle-"));
  t.after(() => fs.rmSync(runtimeDir, { recursive: true, force: true }));
  let calls = 0;
  const required = { runtimeDir, repoRoot: "/repo" };
  await assert.rejects(journeyAdminBundle(required, { build: async () => { throw new Error("build failed"); } }), /build failed/);
  const build = async ({ env }: { env: NodeJS.ProcessEnv }) => {
    calls++; assert.equal(env.VITE_TOVU_SITE_URL, undefined); assert.equal(env.NODE_ENV, "production");
  };
  const options = { env: { VITE_TOVU_SITE_URL: "https://localhost:3000", NODE_ENV: "development" }, build };
  const outputs = await Promise.all([journeyAdminBundle(required, options), journeyAdminBundle(required, options)]);
  assert.deepEqual(outputs, [path.join(runtimeDir, "admin-build/dist"), path.join(runtimeDir, "admin-build/dist")]);
  assert.equal(calls, 1);
});


test("admin build redacts both streams and preserves failure code and signal", async () => {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let output = "";
  for (const stream of [stdout, stderr]) stream.on("data", bytes => { output += bytes.toString(); });
  const spawnBuild = (() => child) as unknown as typeof spawn;
  const build = buildAdmin({ repoRoot: "/repo", output: "/tmp/admin", env: {} }, { spawnBuild, stdout, stderr });
  const rejected = assert.rejects(build, /code 7, signal SIGABRT/);
  const secret = ["sk", "-", "x".repeat(40)].join("");
  const homePath = path.join(os.homedir(), "private/build.ts");
  for (const stream of [child.stdout, child.stderr]) {
    stream.write(`build failed ${secret.slice(0, 4)}`);
    stream.end(`${secret.slice(4)} ${homePath}`);
  }
  await Promise.all([once(child.stdout, "end"), once(child.stderr, "end")]);
  child.emit("close", 7, "SIGABRT");
  await rejected;
  assert.match(output, /build failed/);
  assert.ok(!output.includes(secret));
  assert.ok(!output.includes(homePath));
  assert.ok(output.length < 4_100);
});

function fakeChild() {
  const kills: Array<string | undefined> = [];
  const child = Object.assign(new EventEmitter(), { stdout: null, stderr: null, kill: (signal?: string) => { kills.push(signal); return true; } });
  return { child, kills, spawnBuild: (() => child) as unknown as typeof spawn };
}

test("admin build reports a spawn failure and a close without code or signal", async () => {
  const spawnFailure = fakeChild();
  const failed = buildAdmin({ repoRoot: "/repo", output: "/tmp/admin", env: {} }, { spawnBuild: spawnFailure.spawnBuild });
  spawnFailure.child.emit("error", new Error("ENOENT"));
  await assert.rejects(failed, /Journey admin build failed to spawn/);

  const vanished = fakeChild();
  const closed = buildAdmin({ repoRoot: "/repo", output: "/tmp/admin", env: {} }, { spawnBuild: vanished.spawnBuild });
  vanished.child.emit("close", null, null);
  await assert.rejects(closed, /code none, signal none/);
});

test("admin build that never finishes is killed and rejected after two minutes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const hung = fakeChild();
  const build = buildAdmin({ repoRoot: "/repo", output: "/tmp/admin", env: {} }, { spawnBuild: hung.spawnBuild });
  t.mock.timers.tick(119_999);
  assert.deepEqual(hung.kills, []);
  t.mock.timers.tick(1);
  await assert.rejects(build, /Journey admin build did not finish/);
  assert.deepEqual(hung.kills, ["SIGKILL"]);
});

test("a successful admin build resolves", async () => {
  const ok = fakeChild();
  const build = buildAdmin({ repoRoot: "/repo", output: "/tmp/admin", env: {} }, { spawnBuild: ok.spawnBuild });
  ok.child.emit("close", 0, null);
  await build;
});

for (const stream of ["stdout", "stderr"] as const) {
  test(`a slow shared admin build with ${stream} progress survives 120 seconds and finishes site boot`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "slow-admin-bundle-"));
    t.after(() => fs.rmSync(runtimeDir, { recursive: true, force: true }));
    const kills: string[] = [];
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(),
      kill: (signal: string) => { kills.push(signal); return true; } });
    const sink = new PassThrough(); sink.resume();
    let spawned!: () => void;
    const started = new Promise<void>(resolve => { spawned = resolve; });
    const env: NodeJS.ProcessEnv = { TOVU_LOCAL_SITE_OWNER_PID: "42", TOVU_LOCAL_ADMIN_BUILD_ROOT: runtimeDir, TOVU_REPO_ROOT: "/repo" };
    let booted = false;
    const bundle = runLocalSiteChild({}, {
      proc: { env, pid: 43, ppid: 42, execPath: "/node", cwd: () => "/repo", kill() {}, exit() { assert.fail("unexpected exit"); } },
      timers: { setInterval: () => ({ unref() {} }), clearInterval() {} },
      reapOwnTree: async () => assert.fail("owner is alive"),
      importEntry: async () => { booted = true; },
      buildAdminBundle: required => journeyAdminBundle(required, { build: input => {
        const pending = buildAdmin(input, { spawnBuild: (() => child) as unknown as typeof spawn, stdout: sink, stderr: sink });
        spawned(); return pending;
      } }),
    });
    // Attach the rejection immediately: the old wall-clock watchdog fires during the fake ticks.
    const outcome = bundle.then(output => ({ output, error: undefined }), error => ({ output: undefined, error }));
    await started;
    for (let seconds = 0; seconds < 150; seconds += 30) {
      t.mock.timers.tick(30_000);
      child[stream].write("transforming another module\n");
    }
    child.emit("close", 0, null);
    const result = await outcome;
    assert.equal(result.error, undefined);
    assert.equal(booted, true);
    assert.equal(env.TOVU_ADMIN_DIST, path.join(runtimeDir, "admin-build/dist"));
    assert.equal(fs.readFileSync(path.join(runtimeDir, "admin-build/ready"), "utf8"), "ready");
    assert.deepEqual(kills, []);
    child.stdout.end(); child.stderr.end();
  });
}

test("a build that makes progress then stalls fails after 120 seconds of silence", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const kills: string[] = [];
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(),
    kill: (signal: string) => { kills.push(signal); return true; } });
  const sink = new PassThrough(); sink.resume();
  const pending = buildAdmin({ repoRoot: "/repo", output: "/tmp/admin", env: {} }, {
    spawnBuild: (() => child) as unknown as typeof spawn, stdout: sink, stderr: sink,
  });
  const outcome = pending.then(() => undefined, (error: Error) => error);
  t.mock.timers.tick(90_000);
  child.stdout.write("transforming\n");
  t.mock.timers.tick(119_999);
  assert.deepEqual(kills, []);
  t.mock.timers.tick(1);
  assert.match((await outcome)!.message, /Journey admin build did not finish.*no output for 120000 ms/);
  assert.deepEqual(kills, ["SIGKILL"]);
  // Late pipe data and close cannot revive a timed-out watchdog.
  child.stderr.write("late output\n");
  child.emit("close", 0, null);
  t.mock.timers.tick(120_000);
  assert.deepEqual(kills, ["SIGKILL"]);
  child.stdout.end(); child.stderr.end();
});

test("a build that keeps printing but never exits still fails at the 15-minute backstop", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const kills: string[] = [];
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(),
    kill: (signal: string) => { kills.push(signal); return true; } });
  const sink = new PassThrough(); sink.resume();
  const outcome = buildAdmin({ repoRoot: "/repo", output: "/tmp/admin", env: {} }, {
    spawnBuild: (() => child) as unknown as typeof spawn, stdout: sink, stderr: sink,
  }).then(() => undefined, (error: Error) => error);
  for (let seconds = 0; seconds < 840; seconds += 60) {
    t.mock.timers.tick(60_000);
    child.stdout.write("still transforming\n");
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual(kills, []);
  t.mock.timers.tick(60_000);
  assert.match((await outcome)!.message, /Journey admin build did not finish: still running after 900000 ms/);
  assert.deepEqual(kills, ["SIGKILL"]);
  child.stdout.end(); child.stderr.end();
});

test("bundle preparation waits for completion even before the builder holds the lock", async (t) => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-readiness-"));
  t.after(() => fs.rmSync(runtimeDir, { recursive: true, force: true }));
  const root = path.join(runtimeDir, "admin-build");
  let startupPolls = 0;
  await waitForLocalAdminBuild({ runtimeDir, exited: () => false }, { sleep: async () => {
    startupPolls++;
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "ready"), "ready");
  } });
  assert.equal(startupPolls, 1, "no lock yet does not mean the child finished preparation");
  fs.rmSync(root, { recursive: true });
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "build.lock"), "builder");
  let polls = 0;
  await waitForLocalAdminBuild({ runtimeDir, exited: () => false }, { sleep: async () => {
    if (++polls === 300) fs.writeFileSync(path.join(root, "ready"), "ready");
  } });
  assert.equal(polls, 300, "150 seconds of build work must not consume the HTTP readiness budget");
  fs.rmSync(path.join(root, "ready"));
  await waitForLocalAdminBuild({ runtimeDir, exited: () => true }, { sleep: async () => assert.fail("child exited") });
  fs.rmSync(path.join(root, "build.lock"));
  fs.writeFileSync(path.join(root, "ready"), "ready");
  await waitForLocalAdminBuild({ runtimeDir, exited: () => false }, { sleep: async () => assert.fail("build finished") });
});

test("preparation that never starts or finishes is bounded by the build backstop", async (t) => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-startup-backstop-"));
  t.after(() => fs.rmSync(runtimeDir, { recursive: true, force: true }));
  let elapsed = 0;
  await assert.rejects(waitForLocalAdminBuild({ runtimeDir, exited: () => false }, {
    monotonicMs: () => elapsed,
    sleep: async () => { elapsed += 300_000; },
  }), /900000 ms/);
  assert.equal(elapsed, 900_000);
});

test("another starting site waits past 125 seconds and reuses the active builder's result", async (t) => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "waiting-admin-bundle-"));
  t.after(() => fs.rmSync(runtimeDir, { recursive: true, force: true }));
  const root = path.join(runtimeDir, "admin-build");
  const lockPath = path.join(root, "build.lock");
  fs.mkdirSync(root);
  fs.writeFileSync(lockPath, `${process.pid}:builder`);
  let elapsed = 0;
  const output = await journeyAdminBundle({ runtimeDir, repoRoot: "/repo" }, {
    build: async () => assert.fail("the active builder supplies the shared bundle"),
    // Keep Jini's real locking, liveness and ownership checks; replace only the wait clock/delay.
    lock: (required, options) => withFileLock(required, { ...options, monotonicMs: () => elapsed, sleep: () => {
      assert.equal(fs.readFileSync(lockPath, "utf8"), `${process.pid}:builder`);
      elapsed += 75_000;
      if (elapsed === 225_000) {
        fs.writeFileSync(path.join(root, "ready"), "ready");
        fs.rmSync(lockPath);
      }
    } }),
  });
  assert.equal(output, path.join(root, "dist"));
  assert.equal(elapsed, 225_000);
  assert.equal(fs.existsSync(lockPath), false);
});
