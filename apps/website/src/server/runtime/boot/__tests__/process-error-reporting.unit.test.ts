import { createTracker } from "@jini-ai/diagnostics/observability/node";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createNoopObservabilityPort, type ErrorReport, type ObservabilityPort } from "@jini-ai/diagnostics/observability";

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

test("a rejection and an exception are each reported once; fatal reports flush before exiting", async () => {
  const { port, reports } = recording();
  const target = new EventEmitter();
  const steps: string[] = [];
  let release!: () => void;
  const drained = new Promise<void>(resolve => { release = resolve; });
  const uninstall = installProcessErrorReporting({ tracker: createTracker({ observability: port }), processRole: "daemon" }, {
    target, log() {}, flush: async () => { assert.equal(reports.length, 2); steps.push("flush"); await drained; }, exit: code => { steps.push(`exit:${code}`); },
  });
  const rejection = new Error(`provider refused ${secret}`);
  target.emit("unhandledRejection", rejection, Promise.resolve());
  target.emit("unhandledRejection", rejection, Promise.resolve());
  target.emit("uncaughtException", new RangeError("fatal"), "uncaughtException");
  assert.deepEqual(reports.map(({ context }) => context), [
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
