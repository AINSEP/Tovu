import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createAssistantToolExecutor } from "#src/assistant/tool-recovery-preset";
import { runByokProviderTurn, type ByokTurnEvent } from "#src/assistant/byok-provider-turn";
import { startStubProviderServer } from "#src/server/__tests__/helpers/stub-provider-server";
import { installSupportingFilesFixture } from "#src/features/agent-plugins/__tests__/fixtures/supporting-files.js";

/** Real provider turn + real ToolExecutor + real installed skill bytes; only the model is scripted. */
test("assistant tool-call transcript contains the installed ui-ux-design foundations reference", async t => {
  const require = createRequire(import.meta.url);
  const foundations = await readFile(require.resolve("@jini-ai/plugin-ui-ux-design/ui-ux-design/skills/ui-ux-design/references/foundations.md"), "utf8");
  const distinctiveLine = "Give Programmer a constrained, reusable system instead of one-off styling decisions.";
  assert.ok(foundations.includes(distinctiveLine));
  const fixture = await installSupportingFilesFixture({}, { files: { "skills/ui-ux-design/references/foundations.md": foundations } });
  t.after(fixture.cleanup);
  const executor = createAssistantToolExecutor({ registry: fixture.registry, surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) }, {});
  const { run } = await createRunLifecycle({ eventLog: createInMemoryEventLog({}) }).start({ contextRef: "skill-supporting-files-chat" });
  const input = { skill: "ui-ux-design", file: "references/foundations.md" };
  const toolId = "agent_plugin_ui_ux_design";
  const frame = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
  let continuation: Record<string, unknown> | undefined;
  const baseUrl = await startStubProviderServer(t, (count, body) => {
    if (count === 1) return { status: 200, body:
      frame({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "foundations-call", type: "function", function: { name: toolId, arguments: JSON.stringify(input) } }] }, finish_reason: null }] }) +
      frame({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }) + "data: [DONE]\n\n" };
    continuation = body;
    return { status: 200, body: frame({ choices: [{ index: 0, delta: { content: "I loaded the visual foundations." }, finish_reason: null }] }) + frame({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) + "data: [DONE]\n\n" };
  });
  const events: ByokTurnEvent[] = [];
  const executions: unknown[] = [];
  const turn = await runByokProviderTurn({
    protocol: "openai", baseUrl, apiKey: "test-key-not-real", model: "scripted-model",
    system: "Load the requested installed skill reference before answering.",
    messages: [{ role: "user", content: "Read the UI/UX visual foundations reference." }],
    tools: fixture.registry.list({}),
    executeTool: async call => {
      assert.equal(call.name, toolId);
      assert.deepEqual(call.input, input);
      const result = await executor.execute({ principal: { id: "chat-skill-reader" }, run: { id: run.id }, toolId: call.name, input: call.input });
      executions.push(result);
      assert.equal(result.status, "completed");
      return { content: JSON.stringify(result.output), isError: false };
    },
    onEvent: event => events.push(event),
  });
  assert.equal(turn.toolTurns, 1);
  assert.equal(executions.length, 1);
  const use = events.find(event => event.type === "tool_use");
  assert.deepEqual(use && { name: use.name, input: use.input }, { name: toolId, input });
  const result = events.find(event => event.type === "tool_result");
  assert.ok(result && result.type === "tool_result");
  assert.equal(result.isError, false);
  const output = JSON.parse(result.content) as { guidance: string; files: string[] };
  assert.equal(output.guidance, foundations);
  assert.ok(output.guidance.includes(distinctiveLine));
  assert.deepEqual(output.files, ["references/foundations.md"]);
  assert.ok(continuation);
  const toolMessage = (continuation.messages as { role: string; content: string }[]).find(message => message.role === "tool");
  assert.ok(toolMessage);
  assert.equal(JSON.parse(toolMessage.content).guidance, foundations);
  assert.equal(JSON.stringify(events).includes(fixture.installed.packageRoot), false);
  assert.equal(JSON.stringify(continuation).includes(fixture.installed.packageRoot), false);
});
