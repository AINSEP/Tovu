import assert from "node:assert/strict";
import test from "node:test";

import { DEV_RESTART_DELAY_MS, DEV_RESTART_REQUEST_FILE_ENV, devRestartPortFromEnv } from "../dev-restart.js";

/** @file The server's half of `npm run dev`'s restart-on-request channel (OD-S1). Fakes only. */

test("no supervisor env var means no port (tovu serve, npm start, desktop, hosted)", () => {
  assert.equal(devRestartPortFromEnv({ env: {} }), null);
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
