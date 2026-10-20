import assert from "node:assert/strict";
import test from "node:test";
import { inspect } from "node:util";

import { redactSecretShapes } from "#src/contracts/core/secret-redaction";
import { installConsoleTee, type TeeableConsole } from "../../console-tee.js";
import { createLogBuffer } from "../../log-buffer.js";

function fakeConsole() {
  const calls: Array<[string, unknown[]]> = [];
  const target = Object.fromEntries((["debug", "log", "info", "warn", "error"] as const).map(m => [m, (...args: unknown[]) => { calls.push([m, args]); }])) as TeeableConsole;
  return { target, calls };
}
const buffer = () => createLogBuffer({ redact: text => redactSecretShapes({ text }).text }, { now: () => new Date("2026-10-05T12:00:00.000Z") });

test("the original console method receives the formatted string that is captured", () => {
  const { target, calls } = fakeConsole();
  const logs = buffer();
  installConsoleTee({ buffer: logs }, { target });
  const err = new Error("boom");
  target.error("[route] failed", 42, err);
  const [entry] = logs.entries();
  assert.deepEqual(calls, [["error", [entry.message]]]);
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
  const { target, calls } = fakeConsole();
  const logs = buffer();
  installConsoleTee({ buffer: logs }, { target, redact: text => redactSecretShapes({ text }).text });
  const key = "sk-ant-api03-" + "x".repeat(90);
  target.warn("retrying %s with %d attempts, key %s", "anthropic", 3, key);
  assert.equal(logs.entries()[0].message, "retrying anthropic with 3 attempts, key [REDACTED:credential]");
  assert.deepEqual(calls, [["warn", [logs.entries()[0].message]]]);
});

test("all original console methods receive redacted strings", () => {
  const { target, calls } = fakeConsole();
  const logs = buffer();
  installConsoleTee({ buffer: logs }, { target, redact: text => redactSecretShapes({ text }).text });
  const key = "sk-ant-api03-" + "x".repeat(90);
  for (const method of Object.keys(target) as Array<keyof TeeableConsole>) target[method]("key %s", key);
  assert.deepEqual(calls, Object.keys(target).map(method => [method, ["key [REDACTED:credential]"]]));
  assert.ok(logs.entries().every(entry => entry.message === "key [REDACTED:credential]"));
});

test("formatting and the injected redactor each run once before either copy", () => {
  const { target, calls } = fakeConsole();
  const logs = createLogBuffer({ redact: text => text });
  let formats = 0;
  let redactions = 0;
  installConsoleTee({ buffer: logs }, { target, redact: text => {
    redactions += 1;
    assert.equal(text, "secret");
    assert.equal(calls.length, 0);
    assert.equal(logs.entries().length, 0);
    return "safe %s";
  } });
  target.log({ [inspect.custom]() { formats += 1; return "secret"; } });
  assert.equal(formats, 1);
  assert.equal(redactions, 1);
  assert.deepEqual(calls, [["log", ["safe %s"]]]);
  assert.equal(logs.entries()[0].message, "safe %s");
});

test("the generic tee defaults to identity redaction", () => {
  const { target, calls } = fakeConsole();
  const logs = createLogBuffer({ redact: text => text });
  installConsoleTee({ buffer: logs }, { target });
  target.log("password=hunter2hunter2");
  assert.deepEqual(calls, [["log", ["password=hunter2hunter2"]]]);
  assert.equal(logs.entries()[0].message, "password=hunter2hunter2");
});

test("a throwing redactor emits only the safe placeholder and never throws", () => {
  const { target, calls } = fakeConsole();
  const logs = buffer();
  installConsoleTee({ buffer: logs }, { target, redact: () => { throw new Error("secret in redactor failure"); } });
  assert.doesNotThrow(() => target.error("secret in raw arguments"));
  assert.deepEqual(calls, [["error", ["[log redaction failed]"]]]);
  assert.equal(logs.entries()[0].message, "[log redaction failed]");
});

test("a throwing formatter emits only the safe placeholder and never throws", () => {
  const { target, calls } = fakeConsole();
  const logs = buffer();
  installConsoleTee({ buffer: logs }, { target });
  assert.doesNotThrow(() => target.error({ [inspect.custom]() { throw new Error("secret"); } }));
  assert.deepEqual(calls, [["error", ["[log redaction failed]"]]]);
  assert.equal(logs.entries()[0].message, "[log redaction failed]");
});

test("uninstall restores exactly the original methods", () => {
  const { target, calls } = fakeConsole();
  const originals = { ...target };
  const logs = buffer();
  const uninstall = installConsoleTee({ buffer: logs }, { target, redact: () => "redacted" });
  uninstall();
  assert.deepEqual(target, originals);
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
