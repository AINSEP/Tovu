import assert from "node:assert/strict";
import test from "node:test";

import { redactSecretShapes } from "#src/contracts/core/secret-redaction";
import { installConsoleTee, type TeeableConsole } from "../../console-tee.js";
import { createLogBuffer } from "../../log-buffer.js";

function fakeConsole() {
  const calls: Array<[string, unknown[]]> = [];
  const target = Object.fromEntries((["debug", "log", "info", "warn", "error"] as const).map(m => [m, (...args: unknown[]) => { calls.push([m, args]); }])) as TeeableConsole;
  return { target, calls };
}
const buffer = () => createLogBuffer({ redact: text => redactSecretShapes({ text }).text }, { now: () => new Date("2026-10-05T12:00:00.000Z") });

test("the original console method still runs with the original arguments, then the line is captured", () => {
  const { target, calls } = fakeConsole();
  const logs = buffer();
  installConsoleTee({ buffer: logs }, { target });
  const err = new Error("boom");
  target.error("[route] failed", 42, err);
  assert.deepEqual(calls, [["error", ["[route] failed", 42, err]]]);
  const [entry] = logs.entries();
  assert.equal(entry.level, "error");
  assert.equal(entry.source, "server");
  assert.match(entry.message, /^\[route\] failed 42 Error: boom\n/);
});

test("console methods map to levels: debug, log->info, info, warn, error", () => {
  const { target } = fakeConsole();
  const logs = buffer();
  installConsoleTee({ buffer: logs }, { target, source: "daemon" });
  target.debug("d"); target.log("l"); target.info("i"); target.warn("w"); target.error("e");
  assert.deepEqual(logs.entries().map(e => [e.level, e.message, e.source]), [["debug", "d", "daemon"], ["info", "l", "daemon"], ["info", "i", "daemon"], ["warn", "w", "daemon"], ["error", "e", "daemon"]]);
});

test("format placeholders are applied like console does, and secrets inside are redacted", () => {
  const { target } = fakeConsole();
  const logs = buffer();
  installConsoleTee({ buffer: logs }, { target });
  const key = "sk-ant-api03-" + "x".repeat(90);
  target.warn("retrying %s with %d attempts, key %s", "anthropic", 3, key);
  assert.equal(logs.entries()[0].message, "retrying anthropic with 3 attempts, key [REDACTED:credential]");
});

test("uninstall restores exactly the original methods", () => {
  const { target, calls } = fakeConsole();
  const originalError = target.error;
  const logs = buffer();
  const uninstall = installConsoleTee({ buffer: logs }, { target });
  uninstall();
  assert.equal(target.error, originalError);
  target.error("after");
  assert.equal(logs.entries().length, 0);
  assert.deepEqual(calls, [["error", ["after"]]]);
});

test("a throwing buffer never breaks the console call", () => {
  const { target, calls } = fakeConsole();
  const broken = { append: () => { throw new Error("full"); }, entries: () => [], appendedCount: () => 0, subscribe: () => () => {} };
  installConsoleTee({ buffer: broken }, { target });
  assert.doesNotThrow(() => target.error("still printed"));
  assert.deepEqual(calls, [["error", ["still printed"]]]);
});
