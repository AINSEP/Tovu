import assert from "node:assert/strict";
import test from "node:test";

import { createNoopObservabilityPort } from "#src/platform/observability/index";
import { createAssistantToolExecutor, withToolCallObservability } from "../tool-recovery-preset.js";
import { createToolRegistry } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { EXPECTED_OPERATIONS, SCENARIO_SECRET, createRecordingObservabilityPort, runToolCallScenario } from "./fixtures/tool-call-observability-scenario.js";

/** The assistant tool-call path as observed operations, with a fake port (no SDK anywhere). */

test("every delegated tool call becomes one tool.call operation with outcome and validation-vs-internal error kind", async () => {
  const fake = createRecordingObservabilityPort();
  const kinds = await runToolCallScenario({ observability: fake.port });
  // The route's answers are unchanged by observation.
  assert.deepEqual(kinds, ["ok", "BAD_REQUEST", "TOOL_EXECUTION_FAILED", "BAD_REQUEST"]);
  assert.deepEqual(fake.normalized(), EXPECTED_OPERATIONS);
  assert.equal(fake.operations[0]?.attributes["agent.run.id"] !== undefined, true);
});

test("the reported execution error reaches the port with the secret already blanked by the Tovu redaction layer", async () => {
  const fake = createRecordingObservabilityPort();
  await runToolCallScenario({ observability: fake.port });
  const reported = fake.operations[2]?.errors[0] as Error;
  assert.match(reported.message, /ERR-AAAA-1111-BBBB-2222/);
  assert.ok(!reported.message.includes(SCENARIO_SECRET));
});

test("with the noop port the executor is returned untouched: no wrapper, zero cost when telemetry is off", () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const inner = createAssistantToolExecutor({ registry: createToolRegistry({}), surfaceExchanges }, {});
  assert.equal(withToolCallObservability({ inner, observability: createNoopObservabilityPort({}) }), inner);
});
