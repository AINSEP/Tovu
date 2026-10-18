import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isReadOnlyTool, type ToolExecutionContext } from "@jini-ai/core";

import { attachServerLogFile, type ServerLogEntry } from "#src/platform/server-logs/index";
import { serverLogsAgentToolCatalog } from "../../agent-tools.js";
import { buildServerLogsRegistrations, serverLogsDerivedRisk } from "../../tool-registrations.js";
import type { ServerLogSourcePort } from "../../read-server-logs.js";

const ENTRIES: ServerLogEntry[] = [
  { seq: 1, at: "2026-10-05T12:00:01.000Z", level: "info", source: "server", message: "listening" },
  { seq: 2, at: "2026-10-05T12:00:02.000Z", level: "error", source: "daemon", message: "[agent-daemon] crashed" },
];
const logs: ServerLogSourcePort = { read: () => ({ entries: ENTRIES, capturing: true }) };
const ctx = (input: unknown): ToolExecutionContext => ({ executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input, signal: new AbortController().signal });

function tool(allow = true, serverLogs: ServerLogSourcePort = logs) {
  return buildServerLogsRegistrations({
    workspaceId: "ws",
    serverLogs,
    authorize: async (request) => {
      assert.deepEqual(request, { principalId: "owner", permission: "system.read", workspaceId: "ws", entityType: "server-logs" });
      return { allowed: allow, reason: "fixture grant" };
    },
  })[0]!;
}

test("returns the filtered lines through the shared readServerLogs", async () => {
  assert.deepEqual(await tool().handler(ctx({ level: "error" })), { entries: [ENTRIES[1]], matched: 1, buffered: 2, truncated: false, capturing: true });
});

test("an unusable filter is a ToolInputError naming the field", async () => {
  await assert.rejects(() => tool().handler(ctx({ limit: 9999 })), { name: "ToolInputError", message: "limit must be an integer from 1 to 500" });
});

test("unexpected failures reading a filter propagate unchanged without reading logs", async () => {
  const failure = new Error("filter property unavailable");
  const input = { get level() { throw failure; } };
  const unread: ServerLogSourcePort = { read: () => assert.fail("failed filters must not read logs") };
  await assert.rejects(() => tool(true, unread).handler(ctx(input)), error => error instanceof Error && error === failure && error.message === "filter property unavailable");
});

test("omitting the source reads the attached process log", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-tool-server-log-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "server.log");
  const entry: ServerLogEntry = { ...ENTRIES[1], message: "process log fallback fixture" };
  const detach = attachServerLogFile({ filePath });
  t.after(detach);
  // Attach first: any boot-buffer flush must precede the controlled persisted fixture.
  fs.writeFileSync(filePath, `${JSON.stringify(entry)}\n`);
  const registration = buildServerLogsRegistrations({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "fixture grant" }) })[0]!;
  const result = await registration.handler(ctx({ contains: "process log fallback fixture" }));
  assert.deepEqual(result, { entries: [entry], matched: 1, buffered: 1, truncated: false, capturing: true });
});

test("permission denial precedes reading any log line", async () => {
  const unread: ServerLogSourcePort = { read: () => assert.fail("denied read") };
  await assert.rejects(() => tool(false, unread).handler(ctx({})), { name: "ToolInputError", message: "SERVER_LOGS_FORBIDDEN: principal 'owner' is not authorized for 'system.read' (fixture grant)" });
});

test("descriptor is read-only with derived none risk", () => {
  assert.equal(isReadOnlyTool({ descriptor: tool().descriptor }), true);
  assert.equal(serverLogsDerivedRisk.get("system_read_server_logs"), "none");
});

test("description names every schema field and its exact bounds", () => {
  const [entry] = serverLogsAgentToolCatalog;
  assert.deepEqual(Object.keys(entry.inputSchema.properties), ["level", "sinceIso", "contains", "limit"]);
  assert.match(entry.description, /level \(minimum severity: debug, info, warn, error;/);
  assert.match(entry.description, /contains \(case-insensitive text, at most 200 characters\)/);
  assert.match(entry.description, /limit \(1-500, default 100\)/);
  assert.deepEqual(entry.inputSchema.properties.limit, { type: "integer", minimum: 1, maximum: 500 });
});
