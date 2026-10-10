import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry, ToolInputError, type ToolRegistration } from "@jini-ai/core";
import { createLiveSkillRegistration } from "../../live-registration.js";

test("the host registry adapter forwards execution options and hides disabled slots", async () => {
  const registry = createToolRegistry({});
  let slot: ToolRegistration | undefined;
  const register = registry.register.bind(registry);
  registry.register = tool => { slot = tool; register(tool); };
  const replace = createLiveSkillRegistration(registry);
  const descriptor: ToolRegistration["descriptor"] = { id: "skill_fixture", description: "fixture", inputSchema: { type: "object", properties: {} } };
  let options: Parameters<ToolRegistration["handler"]>[1];
  const tool: ToolRegistration = { descriptor, policy: { authorize: () => "allow" }, handler: async (_required, optional) => { options = optional; return "current"; } };
  replace([tool]);
  const execution = { executionId: "fixture", principal: { id: "owner" }, run: { id: "run" }, input: {}, signal: new AbortController().signal };
  const optional = {};
  assert.equal(await slot!.handler(execution, optional), "current");
  assert.equal(options, optional);
  assert.throws(() => replace([tool, tool]), { message: "Duplicate skill registration ID." });
  replace([]);
  assert.deepEqual(registry.list({}), []);
  assert.equal(registry.has({ toolId: "skill_fixture" }), false);
  assert.throws(() => slot!.handler(execution), ToolInputError);
});
