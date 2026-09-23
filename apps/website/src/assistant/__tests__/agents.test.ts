import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { AGENT_DEFS, resolveAgentLaunch, runtimeSupportsExternalTools } from "@jini-ai/agent-runtime";

import { listAssistantAgents, rescanAssistantAgents, setAgentModelProberForTesting } from "../agents.js";

// No test here may spawn a real CLI's model listing: every test runs against a prober that reports
// "nothing live" unless it installs its own.
before(() => setAgentModelProberForTesting(async (def) => ({ models: def.fallbackModels, source: "fallback" })));
after(() => setAgentModelProberForTesting(null));

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

/**
 * @file Regression coverage for the transcript-duplication bug: the admin transport used to resend
 * the full rendered transcript on every turn regardless of the target agent, even for defs whose CLI
 * already resumes its own multi-turn session (`--resume`/`session/load`) — duplicating history the
 * CLI already remembers on top of what it re-derives from `--resume`. `@jini-ai/agent-runtime`'s
 * `resumesSessionViaCli`/`resumesSessionViaAcpLoad` doc (`types.ts`) is explicit that a caller
 * should send just the latest message for these defs; `carriesOwnMemory` is `listAssistantAgents`'s
 * client-safe projection of that pair so the admin transport can gate on it without importing
 * `@jini-ai/agent-runtime` server-only internals into the browser.
 *
 * Asserted against the real `AGENT_DEFS` registry rather than a hand-maintained id list, so a def
 * that later opts into (or out of) resume support is covered automatically instead of silently
 * drifting out of sync with this projection.
 */
test("listAssistantAgents' carriesOwnMemory exactly matches each def's own resumesSessionViaCli/resumesSessionViaAcpLoad declaration", async () => {
  const agents = await listAssistantAgents();
  assert.ok(AGENT_DEFS.length > 0, "expected at least one real def to assert against");
  for (const def of AGENT_DEFS) {
    const agent = agents.find((candidate) => candidate.id === def.id);
    assert.ok(agent, `expected an agent list entry for def '${def.id}'`);
    const expected = Boolean(def.resumesSessionViaCli) || Boolean(def.resumesSessionViaAcpLoad);
    assert.equal(
      agent.carriesOwnMemory === true,
      expected,
      `agent '${def.id}'.carriesOwnMemory should be ${expected} (resumesSessionViaCli=${def.resumesSessionViaCli}, resumesSessionViaAcpLoad=${def.resumesSessionViaAcpLoad}), got ${agent.carriesOwnMemory}`,
    );
  }
});

/**
 * @file Regression coverage for the "silent zero tools" bug: three defs (aider, antigravity, pi)
 * have no `externalMcpInjection` mechanism (each documents why in its own def file — see
 * `@jini-ai/agent-runtime`'s `runtimeSupportsExternalTools` doc), so a user who picked one of them
 * in the chat runtime picker got an agent with zero Tovu/Jini tools and no indication why. This pins
 * `listAssistantAgents`' `supportsTools` projection to the real `AGENT_DEFS` registry (not a
 * hardcoded id list), matching the `carriesOwnMemory` test above, so the picker's "No tools" badge
 * (`@jini-ai/chat`'s `AgentRuntimePicker`) tracks the def-level fact automatically instead of
 * drifting stale.
 */
test("listAssistantAgents' supportsTools exactly matches each def's own runtimeSupportsExternalTools() result", async () => {
  const agents = await listAssistantAgents();
  assert.ok(AGENT_DEFS.length > 0, "expected at least one real def to assert against");
  for (const def of AGENT_DEFS) {
    const agent = agents.find((candidate) => candidate.id === def.id);
    assert.ok(agent, `expected an agent list entry for def '${def.id}'`);
    const expected = runtimeSupportsExternalTools(def);
    assert.equal(
      agent.supportsTools,
      expected,
      `agent '${def.id}'.supportsTools should be ${expected} (externalMcpInjection=${def.externalMcpInjection}), got ${agent.supportsTools}`,
    );
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

/**
 * @file Regression coverage for the "Local CLI picker never shows a live model" bug: the probe used to
 * hardcode every entry to `fallbackModels`/`"fallback"` and never called the def's model listing at
 * all, so `claude`'s credential-free live catalog (e.g. a new `claude-opus-*` id) could never reach
 * `GET /api/agents`/`POST /api/agents/rescan`, however the runtime-side probe behaved.
 */
test("rescanAssistantAgents surfaces the live model list the prober returns for an available def", async () => {
  const liveOnly = { id: "claude-live-only-test-id", label: "claude-live-only-test-id" };
  const probed: string[] = [];
  setAgentModelProberForTesting(async (def) => {
    probed.push(def.id);
    return def.id === "claude"
      ? { models: [...def.fallbackModels, liveOnly], source: "live" }
      : { models: def.fallbackModels, source: "fallback" };
  });
  try {
    const agents = await rescanAssistantAgents();
    const claude = agents.find((agent) => agent.id === "claude");
    assert.ok(claude, "expected a 'claude' entry in the agent list");
    if (claude.available) {
      assert.equal(claude.modelsSource, "live");
      assert.ok(claude.models?.some((model) => model.id === liveOnly.id), "expected the live-only id in claude.models");
    }
    for (const def of AGENT_DEFS) {
      const installed = Boolean(resolveAgentLaunch(def).launchPath);
      assert.equal(probed.includes(def.id), installed, `def '${def.id}' probed=${probed.includes(def.id)} but installed=${installed}`);
    }
  } finally {
    setAgentModelProberForTesting(async (def) => ({ models: def.fallbackModels, source: "fallback" }));
  }
});
