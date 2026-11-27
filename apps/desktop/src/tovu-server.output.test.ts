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
