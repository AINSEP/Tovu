import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry } from "@jini-ai/core";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";

import { createAssistantToolExecutor } from "../tool-recovery-preset.js";

/** The assistant executor's attempt audit is observation, not a gate: a sink that throws is
 *  reported on stderr without its error text and the tool call still completes. */
test("a throwing attempt-audit sink is reported on stderr and never breaks the call", async (t) => {
  const registry = createToolRegistry({});
  let calls = 0;
  registry.register({ descriptor: { id: "probe_read", description: "probe", inputSchema: { type: "object" } },
    policy: { authorize: () => "allow" }, handler: async () => { calls++; return { ok: true }; } });
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const appended: unknown[] = [];
  const executor = createAssistantToolExecutor({ registry, surfaceExchanges,
    toolAttemptAudit: { workspaceId: "ws", sink: { append: async (row) => { appended.push(row); throw new Error("disk full at /private/path"); } } } });
  const logged: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });

  const result = await executor.execute({ toolId: "probe_read", principal: { id: "owner" }, run: { id: "run" }, input: {} });
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.restoreAll();

  assert.equal(result.status, "completed");
  assert.equal(calls, 1);
  assert.ok(appended.length >= 1, "the attempt was offered to the sink");
  assert.ok(logged.length >= 1);
  for (const args of logged) assert.deepEqual(args, ["[tool-audit] sink threw; execution is unaffected"]);
});
