import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DEV_RESTART_DELAY_MS, DEV_RESTART_REQUEST_FILE_ENV, devRestartPortFromEnv } from "../dev-restart.js";

/** @file The server's half of `npm run dev`'s restart-on-request channel (OD-S1). Fakes only. */

test("no supervisor env var means no port (tovu serve, npm start, desktop, hosted)", () => {
  assert.equal(devRestartPortFromEnv({ env: {} }), null);
});

test("an acknowledged request returns the supervisor's decision, not a completed-restart claim", async () => {
  for (const decision of [{ accepted: true }, { accepted: false, reason: "Site is open in Desktop." }]) {
    const scheduled: Array<() => void> = [];
    const writes: Array<[string, string]> = [];
    const removed: string[] = [];
    const requestId = "11111111-1111-4111-8111-111111111111";
    const port = devRestartPortFromEnv({
      env: { [DEV_RESTART_REQUEST_FILE_ENV]: "/tmp/request.json" }, newId: () => requestId,
      writeFile: (file, data) => { writes.push([file, data]); },
      schedule: (fn, ms) => { assert.equal(ms, 100); scheduled.push(fn); },
      readFile: file => { assert.equal(file, `/tmp/request.json.${requestId}.result`); return JSON.stringify(decision); },
      removeFile: file => { removed.push(file); },
    })!;
    const result = port.requestRestart({ reason: "provider-settings-live-apply" }, { awaitAcceptance: true });
    assert.equal(writes.length, 1, 'the supervisor must precheck while the tool is still running');
    assert.equal(writes[0]![0], "/tmp/request.json");
    assert.equal(JSON.parse(writes[0]![1]).requestId, requestId);
    assert.equal(JSON.parse(writes[0]![1]).reason, "provider-settings-live-apply");
    scheduled.shift()!();
    assert.deepEqual(await result, decision);
    assert.deepEqual(removed, [`/tmp/request.json.${requestId}.result`]);
  }
});

test("acknowledgements are bounded and fail closed on missing, malformed or unreadable replies", async () => {
  const cases = [
    { readFile: () => null, polls: 50, reason: "The dev supervisor did not confirm the restart request." },
    { readFile: () => "{", polls: 1, reason: "Could not confirm the restart with the dev supervisor." },
    { readFile: () => JSON.stringify({ accepted: "yes" }), polls: 1, reason: "Could not confirm the restart with the dev supervisor." },
    { readFile: () => { throw new Error("unreadable"); }, polls: 1, reason: "Could not confirm the restart with the dev supervisor." },
  ];
  for (const scenario of cases) {
    const scheduled: Array<() => void> = [];
    let polls = 0;
    const port = devRestartPortFromEnv({
      env: { [DEV_RESTART_REQUEST_FILE_ENV]: "/tmp/request.json" }, newId: () => "11111111-1111-4111-8111-111111111111",
      writeFile: () => {}, schedule: fn => { scheduled.push(fn); }, removeFile: () => {},
      readFile: () => { polls++; return scenario.readFile(); },
    })!;
    const result = port.requestRestart({ reason: "restart" }, { awaitAcceptance: true });
    while (scheduled.length) scheduled.shift()!();
    assert.deepEqual(await result, { accepted: false, reason: scenario.reason });
    assert.equal(polls, scenario.polls);
  }
});

test("an acknowledgement request write failure returns a plain refusal without exposing error text", async () => {
  const port = devRestartPortFromEnv({
    env: { [DEV_RESTART_REQUEST_FILE_ENV]: "/tmp/request.json" },
    writeFile: () => { throw new Error(["fixture", "private", String(123)].join('-')); },
    schedule: () => assert.fail("failed writes must not poll"),
  })!;
  assert.deepEqual(await port.requestRestart({ reason: "restart" }, { awaitAcceptance: true }), {
    accepted: false, reason: "Could not send the restart request to the dev supervisor.",
  });
});

test("an explicit launcher site pin withdraws Switch now capability", () => {
  const env = { [DEV_RESTART_REQUEST_FILE_ENV]: "/tmp/req.json", TOVU_DEV_SITE_PINNED: "1" };
  assert.equal(devRestartPortFromEnv({ env })?.canSwitchSite, false);
  assert.equal(devRestartPortFromEnv({ env: { ...env, TOVU_DEV_SITE_PINNED: "0" } })?.canSwitchSite, true);
});

test("requestRestart writes the request file only after the delay, with the reason", () => {
  const writes: Array<[string, string]> = [];
  const scheduled: Array<{ fn: () => void; ms: number }> = [];
  const port = devRestartPortFromEnv({
    env: { [DEV_RESTART_REQUEST_FILE_ENV]: "/tmp/req.json" },
    writeFile: (path, data) => void writes.push([path, data]),
    schedule: (fn, ms) => void scheduled.push({ fn, ms }),
  });
  assert.ok(port);
  port.requestRestart({ reason: "switch site to 'beta'" });
  assert.equal(writes.length, 0, "nothing is written before the tool result can reach the chat");
  assert.equal(scheduled[0]?.ms, DEV_RESTART_DELAY_MS);
  scheduled[0]!.fn();
  assert.equal(writes[0]?.[0], "/tmp/req.json");
  assert.equal(JSON.parse(writes[0]![1]).reason, "switch site to 'beta'");
});

test("a failed write is logged, not thrown into a timer", () => {
  const logs: string[] = [];
  const port = devRestartPortFromEnv({
    env: { [DEV_RESTART_REQUEST_FILE_ENV]: "/nope/req.json" },
    writeFile: () => { throw new Error("EACCES"); },
    schedule: (fn) => fn(),
    log: (message) => void logs.push(message),
  });
  port!.requestRestart({ reason: "x" });
  assert.deepEqual(logs, ["[dev-restart] could not ask the dev supervisor to restart: EACCES"]);
});

test("the native environment and writer produce a supervisor request in the configured temp directory", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dev-restart-"));
  const previous = process.env[DEV_RESTART_REQUEST_FILE_ENV];
  t.after(() => {
    if (previous === undefined) delete process.env[DEV_RESTART_REQUEST_FILE_ENV];
    else process.env[DEV_RESTART_REQUEST_FILE_ENV] = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const requestFile = path.join(directory, "request.json");
  process.env[DEV_RESTART_REQUEST_FILE_ENV] = requestFile;
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-16T12:00:00.000Z") });
  const port = devRestartPortFromEnv({ schedule: (fn) => fn(), delayMs: 0 });
  assert.ok(port);
  port.requestRestart({ reason: "switch to beta" });
  assert.deepEqual(JSON.parse(fs.readFileSync(requestFile, "utf8")), {
    reason: "switch to beta", requestedAt: "2026-10-16T12:00:00.000Z", pid: process.pid,
  });
});

test("the native scheduler delivers a zero-delay request asynchronously", async () => {
  let synchronous = true;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      // Also keeps the event loop alive while the production scheduler's unref'ed timer runs.
      timeout = setTimeout(() => reject(new Error("restart request was not delivered")), 10_000);
      const port = devRestartPortFromEnv({
        env: { [DEV_RESTART_REQUEST_FILE_ENV]: "/unused/request.json" }, delayMs: 0,
        writeFile: (file, data) => {
          try {
            assert.equal(synchronous, false);
            assert.equal(file, "/unused/request.json");
            assert.equal(JSON.parse(data).reason, "scheduled restart");
            resolve();
          } catch (error) { reject(error); }
        },
      });
      port!.requestRestart({ reason: "scheduled restart" });
      synchronous = false;
    });
  } finally { clearTimeout(timeout); }
});

test("a non-Error write failure uses the native error logger without rejecting the request", (t) => {
  const messages: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { messages.push(args); });
  const port = devRestartPortFromEnv({
    env: { [DEV_RESTART_REQUEST_FILE_ENV]: "/unused/request.json" },
    schedule: (fn) => fn(), writeFile: () => { throw "disk unavailable"; },
  });
  assert.doesNotThrow(() => port!.requestRestart({ reason: "restart" }));
  assert.deepEqual(messages, [["[dev-restart] could not ask the dev supervisor to restart: disk unavailable"]]);
});

test("calling without options outside a supervisor returns no port", (t) => {
  const previous = process.env[DEV_RESTART_REQUEST_FILE_ENV];
  t.after(() => {
    if (previous === undefined) delete process.env[DEV_RESTART_REQUEST_FILE_ENV];
    else process.env[DEV_RESTART_REQUEST_FILE_ENV] = previous;
  });
  delete process.env[DEV_RESTART_REQUEST_FILE_ENV];
  assert.equal(devRestartPortFromEnv(), null);
});
