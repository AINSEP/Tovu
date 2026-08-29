import assert from "node:assert/strict";
import { test } from "node:test";

import { isAdminAssistantEnabled, shouldStartAgentDaemon } from "../admin-assistant-enabled.js";

/**
 * @file `TOVU_ADMIN_ASSISTANT=off` — the admin assistant's master switch.
 *
 * The load-bearing case is the LAST one: the daemon is not a chat-only process, so turning the admin
 * assistant off must NOT stop the daemon when external MCP is configured. Getting that wrong breaks
 * the External MCP settings tab (`routes/external-mcp/admissions.ts` 503s `AGENT_DAEMON_UNAVAILABLE`
 * without a live daemon) for an operator who wanted MCP tools but no admin chat.
 */

test("default (var unset) leaves the admin assistant ENABLED — absent config is bit-for-bit today's behavior", () => {
  assert.equal(isAdminAssistantEnabled({}), true);
});

test('only the exact value "off" disables — case-insensitive and whitespace-tolerant', () => {
  for (const value of ["off", "OFF", "Off", "  off  "]) {
    assert.equal(isAdminAssistantEnabled({ TOVU_ADMIN_ASSISTANT: value }), false, `expected ${JSON.stringify(value)} to disable`);
  }
});

test("a typo or any other value leaves it ENABLED — a mistyped var must never silently disable a feature the operator believes is running", () => {
  for (const value of ["of", "false", "0", "no", "", "on", "disabled"]) {
    assert.equal(isAdminAssistantEnabled({ TOVU_ADMIN_ASSISTANT: value }), true, `expected ${JSON.stringify(value)} to leave it enabled`);
  }
});

test("daemon still starts when the assistant is ON, regardless of external MCP", () => {
  assert.equal(shouldStartAgentDaemon(false, {}), true);
  assert.equal(shouldStartAgentDaemon(true, {}), true);
});

test("daemon is skipped only when the assistant is OFF *and* no external MCP is configured", () => {
  assert.equal(shouldStartAgentDaemon(false, { TOVU_ADMIN_ASSISTANT: "off" }), false);
});

test("assistant OFF but external MCP configured still starts the daemon — the daemon owns federation, not just chat", () => {
  assert.equal(
    shouldStartAgentDaemon(true, { TOVU_ADMIN_ASSISTANT: "off" }),
    true,
    "gating the spawn on chat alone would break the External MCP settings tab",
  );
});
