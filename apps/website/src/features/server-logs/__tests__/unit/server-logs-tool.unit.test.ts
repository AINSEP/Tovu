import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";

import { attachServerLogFile } from "#src/platform/server-logs/index";
import type { ServerLogEntry } from "@jini-ai/core/contracts/site/platform-server-logs";
import { contributeServerLogsTools } from "@jini-ai/diagnostics/server-logs/tool-registrations";
import { processServerLogSource } from "../../process-source.js";

const ctx = (input: unknown): ToolExecutionContext => ({ executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input, signal: new AbortController().signal });

test("omitting the source reads the attached process log", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-tool-server-log-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "server.log");
  const entry: ServerLogEntry = { seq: 2, at: "2026-10-05T12:00:02.000Z", level: "error", source: "daemon", message: "process log fallback fixture" };
  const detach = attachServerLogFile({ filePath });
  t.after(detach);
  // Attach first: any boot-buffer flush must precede the controlled persisted fixture.
  fs.writeFileSync(filePath, `${JSON.stringify(entry)}\n`);
  const registration = contributeServerLogsTools({ serverLogs: processServerLogSource }).build({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "fixture grant" }) }, undefined)[0]!;
  const result = await registration.handler(ctx({ contains: "process log fallback fixture" }));
  assert.deepEqual(result, { entries: [entry], matched: 1, buffered: 1, truncated: false, capturing: true });
});
