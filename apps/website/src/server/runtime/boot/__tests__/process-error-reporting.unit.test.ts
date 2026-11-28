import { createTracker } from "@jini-ai/diagnostics/observability/node";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  createNoopObservabilityPort,
  type ErrorReport,
  type ObservabilityPort,
} from "@jini-ai/core/contracts/observability";

import { installProcessErrorReporting } from "../process-error-guards.js";

/**
 * @file `installProcessErrorReporting`: unhandled rejections and uncaught exceptions of the server
 * and daemon processes reach `ObservabilityPort.reportError` once each, redacted. A plain emitter
 * stands in for `process` (the real one is the test runner's own).
 */

function recording(): { port: ObservabilityPort; reports: ErrorReport[] } {
  const reports: ErrorReport[] = [];
  return { reports, port: { ...createNoopObservabilityPort({}), reportError: (report) => { reports.push(report); } } };
}

// Built at runtime so no secret-shaped literal sits in the repo.
const secret = ["sk", "live", "P".repeat(12) + "w".repeat(12)].join("_");

test("separate rejection occurrences remain reportable; fatal reports flush before exiting", async () => {
  const { port, reports } = recording();
  const target = new EventEmitter();
  const steps: string[] = [];
  let release!: () => void;
  const drained = new Promise<void>(resolve => { release = resolve; });
  const uninstall = installProcessErrorReporting({ tracker: createTracker({ observability: port }), processRole: "daemon" }, {
    target, log() {}, flush: async () => { assert.equal(reports.length, 3); steps.push("flush"); await drained; }, exit: code => { steps.push(`exit:${code}`); },
  });
  const rejection = new Error(`provider refused ${secret}`);
  target.emit("unhandledRejection", rejection, Promise.resolve());
  target.emit("unhandledRejection", rejection, Promise.resolve());
  target.emit("uncaughtException", new RangeError("fatal"), "uncaughtException");
  assert.deepEqual(reports.map(({ context }) => context), [
    { operation: "process.unhandled_rejection", attributes: { process: "daemon" } },
    { operation: "process.unhandled_rejection", attributes: { process: "daemon" } },
    { operation: "process.uncaught_exception", attributes: { process: "daemon" } },
  ]);
  const sent = reports[0]!.error as Error;
  assert.ok(!sent.message.includes(secret) && !String(sent.stack).includes(secret), "the secret is redacted");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(steps, ["flush"]);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(steps, ["flush", "exit:1"]);
  uninstall();
  assert.equal(target.listenerCount("unhandledRejection") + target.listenerCount("uncaughtException"), 0);
});

test("a hung fatal drain exits at its deadline, once, even when the drain later settles", async () => {
  const target = new EventEmitter(), exits: number[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const uninstall = installProcessErrorReporting({ tracker: createTracker({}), processRole: "server" }, {
    target, log() {}, flush: () => held, timeoutMs: 5, exit: code => { exits.push(code); },
  });
  try {
    target.emit("uncaughtException", new Error("fatal"));
    target.emit("uncaughtException", new Error("second fatal"));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(exits, [1]);
    release();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(exits, [1]);
  } finally { uninstall(); }
});

test("a rejected fatal drain still exits and a failing logger cannot skip the drain", async () => {
  const target = new EventEmitter(), steps: string[] = [];
  const uninstall = installProcessErrorReporting({ tracker: createTracker({}), processRole: "server" }, {
    target, log() { throw new Error("log unavailable"); },
    flush: async () => { steps.push("flush"); throw new Error("drain unavailable"); }, exit: code => { steps.push(`exit:${code}`); },
  });
  try {
    target.emit("uncaughtException", new Error("fatal"));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(steps, ["flush", "exit:1"]);
  } finally { uninstall(); }
});

test('without flush: retain rejection + monitor listeners exactly, with no fatal handler, log or exit', () => {
  for (const processRole of ['server', 'daemon', 'desktop-main'] as const) {
    const { port, reports } = recording();
    const target = new EventEmitter();
    const sentinel = () => {};
    target.on('uncaughtExceptionMonitor', sentinel);
    const uninstall = installProcessErrorReporting({ tracker: createTracker({ observability: port }), processRole }, {
      target, log() { assert.fail('Node owns logging without flush'); }, exit() { assert.fail('Node owns exit without flush'); },
    });
    assert.deepEqual(target.eventNames().sort(), ['uncaughtExceptionMonitor', 'unhandledRejection']);
    assert.equal(target.listenerCount('uncaughtException'), 0);
    assert.equal(target.listenerCount('uncaughtExceptionMonitor'), 2);
    target.emit('unhandledRejection', new Error('fake rejection'));
    target.emit('uncaughtExceptionMonitor', new Error('fake fatal'));
    assert.deepEqual(reports.map(report => report.context), [
      { operation: 'process.unhandled_rejection', attributes: { process: processRole } },
      { operation: 'process.uncaught_exception', attributes: { process: processRole } },
    ]);
    uninstall();
    assert.deepEqual(target.listeners('uncaughtExceptionMonitor'), [sentinel]);
    assert.equal(target.listenerCount('unhandledRejection'), 0);
  }
});

test("the injected event source reports a non-Error rejection as an attributed Error", t => {
  const { port, reports } = recording();
  const target = new EventEmitter();
  const uninstall = installProcessErrorReporting({ tracker: createTracker({ observability: port }), processRole: "desktop-main" }, { target });
  t.after(uninstall);
  target.emit("unhandledRejection", "worker startup failed", Promise.resolve());
  assert.deepEqual(reports.map(({ context }) => context), [
    { operation: "process.unhandled_rejection", attributes: { process: "desktop-main" } },
  ]);
  assert.ok(reports[0]?.error instanceof Error);
  assert.match(reports[0].error.message, /worker startup failed/);
  uninstall();
  target.emit("unhandledRejection", "not reported after removal", Promise.resolve());
  assert.equal(reports.length, 1);
});

test('fatal path logs, reports, awaits flush and exits 1 in that order', async () => {
  const steps: string[] = [];
  const target = new EventEmitter();
  const error = new Error('fake fatal');
  const { port } = recording();
  port.reportError = () => { steps.push('report'); };
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const uninstall = installProcessErrorReporting({ tracker: createTracker({ observability: port }), processRole: 'server' }, {
    target, log(_message, logged) { assert.equal(logged, error); steps.push('log'); },
    flush: async () => { steps.push('flush'); await pending; }, exit: code => { steps.push(`exit:${code}`); },
  });
  try {
    assert.equal(target.listenerCount('uncaughtExceptionMonitor'), 0);
    target.emit('uncaughtException', error);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(steps, ['log', 'report', 'flush']);
    release();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(steps, ['log', 'report', 'flush', 'exit:1']);
  } finally { uninstall(); }
});

test('fatal flush is bounded to 2000ms even if a caller requests a longer deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const target = new EventEmitter(), exits: number[] = [];
  let flushed = false;
  const uninstall = installProcessErrorReporting({ tracker: createTracker({}), processRole: 'daemon' }, {
    target, log() {}, timeoutMs: 5_000, flush: () => { flushed = true; return new Promise(() => {}); },
    exit: code => { exits.push(code); },
  });
  try {
    target.emit('uncaughtException', new Error('fake fatal'));
    await Promise.resolve();
    assert.equal(flushed, true);
    t.mock.timers.tick(1_999); assert.deepEqual(exits, []);
    t.mock.timers.tick(1); assert.deepEqual(exits, [1]);
  } finally { uninstall(); t.mock.timers.reset(); }
});

/** Captures what `installProcessErrorReporting` registers on the real `process` without letting a listener reach the test runner's process. */
function captureProcessListeners(t: test.TestContext): { on: Array<readonly unknown[]>; off: Array<readonly unknown[]>; handler(event: string): (reason: unknown) => void } {
  const on: Array<readonly unknown[]> = [], off: Array<readonly unknown[]> = [];
  t.mock.method(process, "on", (...args: unknown[]) => { on.push(args); return process; });
  t.mock.method(process, "off", (...args: unknown[]) => { off.push(args); return process; });
  return { on, off, handler(event) {
    const listener = on.find(([name]) => name === event)?.[1];
    assert.ok(typeof listener === "function", `a ${event} listener was installed on process`);
    return reason => { listener(reason); };
  } };
}

test("with no injected target, log or exit: the real process carries the listeners, console.error logs a non-Error fatal and process.exit ends it with 1", async t => {
  const { port, reports } = recording();
  const listeners = captureProcessListeners(t);
  const logged = t.mock.method(console, "error", () => {});
  const exits: unknown[] = [];
  t.mock.method(process, "exit", (code?: unknown) => { exits.push(code); return undefined as never; });
  const uninstall = installProcessErrorReporting({ tracker: createTracker({ observability: port }), processRole: "server" }, { flush: async () => {} });
  assert.deepEqual(listeners.on.map(([name]) => name), ["unhandledRejection", "uncaughtException"]);
  listeners.handler("uncaughtException")("disk vanished");
  assert.equal(logged.mock.callCount(), 1);
  const printed = logged.mock.calls[0]!.arguments[0];
  assert.ok(printed instanceof Error, "the default log prints the redacted Error, not the raw reason");
  assert.match(printed.message, /disk vanished/);
  assert.ok(reports[0]?.error instanceof Error);
  assert.match(reports[0].error.message, /disk vanished/);
  assert.deepEqual(reports.map(({ context }) => context), [{ operation: "process.uncaught_exception", attributes: { process: "server" } }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(exits, [1]);
  uninstall();
  assert.deepEqual(listeners.off, listeners.on);
});

test("without flush, the real process's monitor reports a non-Error fatal as an attributed Error and never exits", t => {
  const { port, reports } = recording();
  const listeners = captureProcessListeners(t);
  t.mock.method(process, "exit", () => assert.fail("Node owns exit without flush"));
  const tracker = createTracker({ observability: port }), handed: unknown[] = [];
  const uninstall = installProcessErrorReporting({ tracker: { ...tracker, error: (input, options) => { handed.push(input.error); tracker.error(input, options); } }, processRole: "daemon" });
  assert.deepEqual(listeners.on.map(([name]) => name), ["unhandledRejection", "uncaughtExceptionMonitor"]);
  listeners.handler("uncaughtExceptionMonitor")("stdout pipe closed");
  assert.ok(handed[0] instanceof Error, "the tracker port is handed an Error, never the raw reason");
  assert.match(handed[0].message, /stdout pipe closed/);
  assert.ok(reports[0]?.error instanceof Error);
  assert.match(reports[0].error.message, /stdout pipe closed/);
  assert.deepEqual(reports.map(({ context }) => context), [{ operation: "process.uncaught_exception", attributes: { process: "daemon" } }]);
  uninstall();
  assert.deepEqual(listeners.off, listeners.on);
});

test("a diagnostic sink that throws on the fatal report cannot skip the drain or the exit", async () => {
  const target = new EventEmitter(), steps: string[] = [];
  const tracker = createTracker({});
  const uninstall = installProcessErrorReporting({ tracker: { ...tracker, error: () => { steps.push("report"); throw new Error("sink unavailable"); } }, processRole: "server" }, {
    target, log() { steps.push("log"); },
    flush: async () => { steps.push("flush"); }, exit: code => { steps.push(`exit:${code}`); },
  });
  try {
    target.emit("uncaughtException", new Error("fatal"));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(steps, ["log", "report", "flush", "exit:1"]);
  } finally { uninstall(); }
});
