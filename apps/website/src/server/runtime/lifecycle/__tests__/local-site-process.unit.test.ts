import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SpawnedDaemonProcess } from "@jini-ai/sidecar/supervisor";
import { localSiteChildEnv, localSiteProcessLog } from "../local-site-process.js";

test("T47/runtime-0#5: stderr overflow retains the later fatal tail", (t) => {
  const siteDir = mkdtempSync(path.join(os.tmpdir(), "tovu-child-stderr-overflow-"));
  t.after(() => rmSync(siteDir, { recursive: true, force: true }));
  const events = new EventEmitter();
  const child: SpawnedDaemonProcess = { pid: 42, on(input) { events.on(input.event, input.listener); }, kill() { return true; } };
  const diagnostics = localSiteProcessLog({ name: "alpha", siteDir });
  t.after(() => diagnostics.stderr.destroy());
  diagnostics.observe({ child });
  diagnostics.stderr.write("x".repeat(65_537));
  diagnostics.stderr.write("\nFATAL ERROR: crash after verbose startup\n    at final-native-frame\n");
  events.emit("exit", { code: null, signal: "SIGABRT" });
  diagnostics.stderr.end();

  const saved = readFileSync(path.join(siteDir, "ops/logs/local-site.log"), "utf8");
  assert.match(saved, /FATAL ERROR: crash after verbose startup/);
  assert.match(saved, /at final-native-frame/);
});

// A parent must persist the native reason even when the site's own console never reports a crash.
for (const outcome of [{ code: 7, signal: null }, { code: null, signal: "SIGKILL" }, { code: 0, signal: null }] as const) {
  test(`local child exit is durable: code=${outcome.code}, signal=${outcome.signal}`, (t) => {
    const siteDir = mkdtempSync(path.join(os.tmpdir(), "tovu-child-exit-"));
    t.after(() => rmSync(siteDir, { recursive: true, force: true }));
    const events = new EventEmitter();
    const child: SpawnedDaemonProcess = { pid: 42, on(input) { events.on(input.event, input.listener); }, kill() { return true; } };
    const diagnostics = localSiteProcessLog({ name: "alpha", siteDir });
    diagnostics.observe({ child });
    diagnostics.stderr.write("FATAL ERROR: native allocation failed password=hunter2");
    diagnostics.stderr.write("hunter2\n    at native-frame");
    events.emit("exit", outcome);
    // The exit callback must synchronously persist before any later pipe-close event.
    const saved = readFileSync(path.join(siteDir, "ops/logs/local-site.log"), "utf8");
    assert.match(saved, /\[local-site alpha\] spawned pid=42/);
    assert.ok(saved.includes(`pid=42 exited code=${outcome.code ?? "none"} signal=${outcome.signal ?? "none"}`));
    assert.match(saved, /FATAL ERROR: native allocation failed/);
    assert.match(saved, /at native-frame/);
    assert.ok(!saved.includes("hunter2"), "split stderr credentials must be redacted before persistence");
    // Native stderr can finish draining after exit; that final evidence must survive too.
    diagnostics.stderr.end("\nlast fatal frame");
    assert.match(readFileSync(path.join(siteDir, "ops/logs/local-site.log"), "utf8"), /last fatal frame/);
  });
}

test("local child spawn errors and bounded UTF-8 stderr survive without an exit event", (t) => {
  const siteDir = mkdtempSync(path.join(os.tmpdir(), "tovu-child-error-"));
  t.after(() => rmSync(siteDir, { recursive: true, force: true }));
  const events = new EventEmitter();
  const child: SpawnedDaemonProcess = { on(input) { events.on(input.event, input.listener); }, kill() { return false; } };
  const diagnostics = localSiteProcessLog({ name: "beta", siteDir });
  diagnostics.observe({ child });
  diagnostics.stderr.write("discard this prefix" + "x".repeat(5000));
  const unicode = Buffer.from("💥 native failure");
  diagnostics.stderr.write(unicode.subarray(0, 2));
  diagnostics.stderr.write(unicode.subarray(2));
  const error = new Error("spawn ENOENT");
  error.stack = "Error: spawn ENOENT\n    at launch (/repo/worker.ts:1:1)";
  events.emit("error", { error });
  diagnostics.stderr.end();
  const saved = readFileSync(path.join(siteDir, "ops/logs/local-site.log"), "utf8");
  assert.ok(saved.includes("pid=none process error=Error: spawn ENOENT"));
  const entries = saved.trim().split("\n").map(line => JSON.parse(line) as { message: string });
  assert.ok(entries.some(entry => entry.message.includes(error.stack!)));
  assert.match(saved, /💥 native failure/);
  assert.ok(!saved.includes("discard this prefix"), "stderr capture must retain only its bounded tail");
});

test("local child uses an allowlist: deploy/admin/provider secrets and owner paths never inherit", () => {
  const env = localSiteChildEnv({ parent: { PATH: "/bin", HOME: "/home/operator", TOVU_ADMIN_PASSWORD: "secret",
    AWS_SECRET_ACCESS_KEY: "secret", OPENAI_API_KEY: "secret", DATABASE_URL: "secret", NODE_OPTIONS: "--require owner-hook",
    TOVU_CONTENT_DB: "/owner/content.db", TOVU_ADMIN_DEV_PROXY_URL: "https://localhost:5173", TOVU_DEV_RESTART_REQUEST_FILE: "/owner/restart" },
    siteDir: "/repo/sites/alpha", name: "alpha", port: 3101, daemonPort: 3102, repoRoot: "/repo", buildRoot: "/tmp/build" });
  assert.equal(env.HOME, "/home/operator");
  assert.equal(env.TOVU_SITE_DIR, "/repo/sites/alpha");
  assert.equal(env.JINI_AGENT_DAEMON_URL, "http://127.0.0.1:3102");
  assert.equal(env.TOVU_ENABLE_SITE_SWITCHER, "0");
  assert.equal(env.TOVU_DEV_OWNER_SIGNIN, "0");
  for (const key of ["TOVU_ADMIN_PASSWORD", "AWS_SECRET_ACCESS_KEY", "OPENAI_API_KEY", "DATABASE_URL", "NODE_OPTIONS", "TOVU_CONTENT_DB", "TOVU_ADMIN_DEV_PROXY_URL", "TOVU_DEV_RESTART_REQUEST_FILE"]) {
    assert.equal(env[key], undefined, key);
  }
});

test("devsignin: managed children inherit only a safely admitted local owner capability", () => {
  const dev = { NODE_ENV: "development", TOVU_HOST: "127.0.0.1", TOVU_DEV_OWNER_SIGNIN: "1", TOVU_DEV_SUPERVISOR_PID: "42" };
  const make = (parent: NodeJS.ProcessEnv) => localSiteChildEnv({ parent,
    siteDir: "/repo/sites/beta", name: "beta", port: 3103, daemonPort: 3104, repoRoot: "/repo", buildRoot: "/tmp/build" }, { pathExists: () => false });
  assert.equal(make(dev).TOVU_DEV_OWNER_SIGNIN, "1");
  for (const override of [{ TOVU_DEV_OWNER_SIGNIN: "0" }, { NODE_ENV: "production" }, { TOVU_RUNTIME_MODE: "production" }, { FLY_APP_NAME: "live" }, { TOVU_HOST: "0.0.0.0" }]) {
    assert.equal(make({ ...dev, ...override }).TOVU_DEV_OWNER_SIGNIN, "0");
  }
});


test("native fatal evidence redacts home paths and runtime-built vendor tokens before taking a tail", (t) => {
  const siteDir = mkdtempSync(path.join(os.tmpdir(), "native-redaction-"));
  t.after(() => rmSync(siteDir, { recursive: true, force: true }));
  const events = new EventEmitter();
  const child: SpawnedDaemonProcess = { pid: 42, on(input) { events.on(input.event, input.listener); }, kill() { return true; } };
  const diagnostics = localSiteProcessLog({ name: "fatal", siteDir });
  diagnostics.observe({ child });
  const secret = ["sk", "-", "x".repeat(6000)].join("");
  const homePath = path.join(os.homedir(), "private/addon.node");
  diagnostics.stderr.write(`FATAL ERROR: native load ${homePath} ${secret.slice(0, 5)}`);
  diagnostics.stderr.write(secret.slice(5));
  events.emit("exit", { code: null, signal: "SIGABRT" });
  diagnostics.stderr.end();
  const saved = readFileSync(path.join(siteDir, "ops/logs/local-site.log"), "utf8");
  assert.match(saved, /FATAL ERROR: native load/);
  assert.match(saved, /code=none signal=SIGABRT/);
  assert.ok(!saved.includes(secret));
  assert.ok(!saved.includes(secret.slice(-40)), "cutting before redaction would leak the secret's suffix");
  assert.ok(!saved.includes(homePath));
  const entries = saved.trim().split("\n").map(line => JSON.parse(line) as { message: string });
  assert.ok(entries.every(entry => entry.message.length <= 8_100));
});
