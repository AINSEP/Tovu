import assert from "node:assert/strict";
import test from "node:test";
import { describeServeReadinessFailure } from "./tovu-server.output.ts";
import { parseCliErrorLine } from "./tovu-server.ts";

test("readiness diagnostics distinguish a signal from an unknown exit and keep only the last five log lines", () => {
  const redactOutput = ({ text }: { text: string }) => text.replaceAll("private-key", "[redacted]");
  const describe = (failure: Parameters<typeof describeServeReadinessFailure>[0]["failure"]) =>
    describeServeReadinessFailure({ failure, redactOutput, parseCliErrorLine });
  assert.equal(describe({ type: "exit", code: null, signal: null, text: " \n" }),
    "tovu serve exited (code none) before reporting a port.");
  assert.equal(describe({ type: "exit", code: null, signal: "SIGTERM", text: "old\n2\n3\n4\n5\nprivate-key\n" }),
    "tovu serve exited (code SIGTERM) before reporting a port. Signal: SIGTERM.\n2\n3\n4\n5\n[redacted]");
});

test("readiness failures without a usable child name the cause and never echo the captured output", () => {
  const redactOutput = ({ text }: { text: string }) => text;
  const describe = (failure: Parameters<typeof describeServeReadinessFailure>[0]["failure"]) =>
    describeServeReadinessFailure({ failure, redactOutput, parseCliErrorLine });
  assert.equal(describe({ type: "missing-pid", text: "TOVU_READY port=4100\n" }),
    "tovu serve reported a boot line without a process id");
  assert.equal(describe({ type: "missing-stream", text: "partial boot log\n" }),
    "tovu serve is missing its stdout or stderr stream");
  assert.equal(describe({ type: "output-limit", text: "flood\n", maxOutputChars: 8 }),
    "tovu serve startup output exceeded the diagnostic limit.");
  assert.equal(describe({ type: "timeout", text: "waiting\n", readyTimeoutMs: 2500 }),
    "tovu serve did not report a port within 2500ms.\nwaiting");
});
