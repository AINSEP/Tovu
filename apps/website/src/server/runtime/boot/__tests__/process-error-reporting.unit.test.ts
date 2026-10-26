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

test("a rejection and an exception are each reported once with the process role; uninstall removes both", () => {
  const { port, reports } = recording();
  const target = new EventEmitter();
  const uninstall = installProcessErrorReporting({ observability: port, processRole: "daemon" }, { target });
  const rejection = new Error(`provider refused ${secret}`);
  target.emit("unhandledRejection", rejection, Promise.resolve());
  target.emit("unhandledRejection", rejection, Promise.resolve());
  target.emit("uncaughtExceptionMonitor", new RangeError("fatal"), "uncaughtException");
  assert.deepEqual(reports.map(({ context }) => context), [
    { operation: "process.unhandled_rejection", attributes: { process: "daemon" } },
    { operation: "process.uncaught_exception", attributes: { process: "daemon" } },
  ]);
  const sent = reports[0]!.error as Error;
  assert.ok(!sent.message.includes(secret) && !String(sent.stack).includes(secret), "the secret is redacted");
  uninstall();
  assert.equal(target.listenerCount("unhandledRejection") + target.listenerCount("uncaughtExceptionMonitor"), 0);
});
