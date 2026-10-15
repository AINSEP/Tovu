import assert from "node:assert/strict";
import test from "node:test";

import { formatBridgePreflightLogLine, formatRunEndLogLine, formatRunErrorLogLine } from "../run-log-lines.js";

test("terminal log retains the existing failed-run line byte-for-byte", () => {
  assert.equal(formatRunEndLogLine({
    runId: "run-17", payload: { status: "failed", code: 143, signal: "SIGTERM", resumable: false },
    agentId: "claude", conversationId: "conversation-8", resumeAttempted: true,
  }), "[agent-daemon] run run-17 ended: failed (code=143, signal=SIGTERM, resumable=false, agent=claude, conversation=conversation-8, resumeAttempted=true)");
});

test("terminal log retains defaults and successful zero exit codes", () => {
  assert.equal(formatRunEndLogLine({
    runId: "run-17", payload: { code: null },
    agentId: "claude", conversationId: "conversation-8", resumeAttempted: false,
  }), "[agent-daemon] run run-17 ended: unknown (code=none, signal=none, resumable=false, agent=claude, conversation=conversation-8, resumeAttempted=false)");
  assert.equal(formatRunEndLogLine({
    runId: "run-17", payload: { status: "succeeded", code: 0, signal: null, resumable: true },
    agentId: "claude", conversationId: "conversation-8", resumeAttempted: false,
  }), "[agent-daemon] run run-17 ended: succeeded (code=0, signal=none, resumable=true, agent=claude, conversation=conversation-8, resumeAttempted=false)");
});

test("bridge error log includes its code, message and two-line stderr from protocol error.details", () => {
  assert.equal(formatRunErrorLogLine({ runId: "run-17", payload: {
    message: "The assistant's tools did not load.",
    error: { code: "MCP_BRIDGE_UNAVAILABLE", message: "The assistant's tools did not load.", details: {
      exitCode: 1, signal: null, elapsedMs: 42,
      stderrTail: "Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@modelcontextprotocol/sdk'\n    imported from /app/serve.js",
    } },
  } }), "[agent-daemon] run run-17 error: MCP_BRIDGE_UNAVAILABLE: The assistant's tools did not load. | Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@modelcontextprotocol/sdk' |     imported from /app/serve.js");
});

test("error log handles absent codes and non-diagnostic protocol details", () => {
  assert.equal(formatRunErrorLogLine({ runId: "run-17", payload: { message: "Spawn failed" } }),
    "[agent-daemon] run run-17 error: unknown: Spawn failed");
  const detailCases: NonNullable<Parameters<typeof formatRunErrorLogLine>[0]["payload"]["error"]>["details"][] =
    [undefined, null, "failure", [], {}, { stderrTail: 7 }, { stderrTail: "" }];
  for (const details of detailCases) {
    assert.equal(formatRunErrorLogLine({ runId: "run-17", payload: {
      message: "Spawn failed", error: { code: "AGENT_SPAWN_FAILED", message: "Spawn failed", details },
    } }), "[agent-daemon] run run-17 error: AGENT_SPAWN_FAILED: Spawn failed");
  }
});

test("error diagnostics collapse CRLF and CR to one line without dropping either line", () => {
  assert.equal(formatRunErrorLogLine({ runId: "run-17", payload: {
    message: "Bridge failed\nSee diagnostics", error: { code: "MCP_BRIDGE_UNAVAILABLE", message: "Bridge failed", details: {
      stderrTail: "Error: missing package\r\nat startup\rbridge stopped",
    } },
  } }), "[agent-daemon] run run-17 error: MCP_BRIDGE_UNAVAILABLE: Bridge failed | See diagnostics | Error: missing package | at startup | bridge stopped");
});

test("preflight success log includes elapsed milliseconds", () => {
  assert.equal(formatBridgePreflightLogLine({ result: {
    ok: true, exitCode: null, signal: null, stderrTail: "", elapsedMs: 42,
  } }), "[agent-daemon] jini bridge preflight ok (42ms)");
});

test("preflight failure log includes exit, signal and collapsed stderr", () => {
  assert.equal(formatBridgePreflightLogLine({ result: {
    ok: false, exitCode: 1, signal: null, stderrTail: "Error: missing package\nat startup", elapsedMs: 42,
  } }), "[agent-daemon] jini bridge preflight FAILED (exit=1, signal=null): Error: missing package | at startup");
  assert.equal(formatBridgePreflightLogLine({ result: {
    ok: false, exitCode: null, signal: "SIGKILL", stderrTail: "Error: timeout\r\nat startup\rbridge stopped", elapsedMs: 15000,
  } }), "[agent-daemon] jini bridge preflight FAILED (exit=null, signal=SIGKILL): Error: timeout | at startup | bridge stopped");
});
