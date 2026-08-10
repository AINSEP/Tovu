import assert from "node:assert/strict";
import test from "node:test";

import { listAssistantAgents, rescanAssistantAgents } from "../agents";

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

/**
 * @file Regression coverage for the 2026-08-10 caching fix: `listAssistantAgents()` used to re-run
 * the full 24-def PATH probe on every single call, and `POST /api/agents/rescan` had no way to tell
 * apart from a plain read (see `agents.ts`'s module doc for the production cost — `AssistantDock`'s
 * health-check poll re-triggered the full sweep dozens of times a minute). These pin the memoization
 * contract directly: same underlying async work reused across calls, without needing to mock
 * `@jini-ai/agent-runtime` — asserting on PROMISE IDENTITY across back-to-back (unawaited) calls is
 * enough to prove a second probe was never started, and works against the real `AGENT_DEFS`
 * registry like the two tests above.
 */
test("listAssistantAgents memoizes — two back-to-back calls reuse the same in-flight/settled probe", () => {
  const first = listAssistantAgents();
  const second = listAssistantAgents();
  assert.strictEqual(first, second, "expected the second call to reuse the first call's own promise, not start a new probe");
});

test("rescanAssistantAgents forces a fresh probe, and a later listAssistantAgents call picks up that fresh result", async () => {
  const before = listAssistantAgents();
  await before;

  const rescanned = rescanAssistantAgents();
  assert.notStrictEqual(rescanned, before, "expected rescan to start a NEW probe rather than reuse the cached one");

  const after = listAssistantAgents();
  assert.strictEqual(after, rescanned, "expected the cache to now hold the rescanned probe, not the stale pre-rescan one");
  await after;
});
