import assert from "node:assert/strict";
import test from "node:test";

import { listAssistantAgents } from "../agents";

/**
 * @file Regression coverage for `listAssistantAgents()` projecting model/reasoning metadata.
 *
 * This DTO used to silently drop `models`/`reasoningOptions` even though the underlying
 * `RuntimeAgentDef` (from `@jini-ai/agent-runtime`) always carried them — Tovu's own hand-written
 * ambient shim for that package (`jini-agent-runtime-shim.d.ts`, needed because the root tsconfig's
 * `moduleResolution: "Node"` can't read the package's `exports` map) declared a narrower
 * `RuntimeAgentDef` that never widened to include those fields, so nothing in `agents.ts` ever
 * read or forwarded them. The frontend's `AgentRuntimePicker` only renders the model/reasoning
 * `<select>`s when `AgentSummary.models`/`.reasoningOptions` are present, so this was invisible at
 * the type layer and the UI layer alike until someone looked for the dropdown. Assert directly on
 * the real, unmocked `AGENT_DEFS` registry (not a fake) so a future shim/DTO regression here fails
 * a test instead of only showing up as a missing dropdown in manual testing.
 */

test("listAssistantAgents projects fallback models and reasoning options for claude", async () => {
  const agents = await listAssistantAgents();
  const claude = agents.find((agent) => agent.id === "claude");
  assert.ok(claude, "expected a 'claude' entry in the agent list");
  assert.ok(claude.models && claude.models.length > 0, "expected claude.models to be non-empty");
  assert.ok(
    claude.reasoningOptions && claude.reasoningOptions.length > 0,
    "expected claude.reasoningOptions to be non-empty",
  );
  assert.equal(claude.modelsSource, "fallback");
  for (const option of claude.reasoningOptions ?? []) {
    assert.equal(typeof option.id, "string");
    assert.equal(typeof option.label, "string");
  }
});

test("listAssistantAgents never returns an agent with an empty id/name", async () => {
  const agents = await listAssistantAgents();
  assert.ok(agents.length > 0, "expected at least one agent def");
  for (const agent of agents) {
    assert.ok(agent.id, `agent missing id: ${JSON.stringify(agent)}`);
    assert.ok(agent.name, `agent ${agent.id} missing name`);
  }
});
