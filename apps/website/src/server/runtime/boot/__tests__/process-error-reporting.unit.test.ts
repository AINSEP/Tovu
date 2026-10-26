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
