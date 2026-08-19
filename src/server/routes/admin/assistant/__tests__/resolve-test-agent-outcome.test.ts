import assert from "node:assert/strict";
import test from "node:test";

import type { DetectedAgent } from "@jini-ai/agent-runtime";

import { resolveTestAgentOutcome } from "../resolve-test-agent-outcome.js";

/**
 * @file `resolveTestAgentOutcome` is the branch logic `test-agent.ts`'s POST route delegates to
 * once it already has a real `DetectedAgent` in hand (installed/authenticated/model-mismatch/
 * success). Extracted specifically so these branches are testable without a real PATH scan —
 * `admin-assistant-execution-routes.test.ts`'s header documents that, before this extraction, only
 * the "agent id not found" branch was host-independent and the rest was an accepted gap (no
 * injectable seam for `detectAgents()`, and Node's `mock.module()` needs
 * `--experimental-test-module-mocks`, which this repo's test scripts do not pass).
 */

function buildAgent(overrides: Partial<DetectedAgent> = {}): DetectedAgent {
  return {
    id: "test-cli",
    name: "Test CLI",
    bin: "test-cli",
    versionArgs: ["--version"],
    streamFormat: "text",
    models: [],
    modelsSource: "fallback",
    available: true,
    ...overrides,
  } as DetectedAgent;
}

test("resolveTestAgentOutcome: authStatus 'missing' with an explicit authMessage returns ok:false with that exact message", () => {
  const agent = buildAgent({ authStatus: "missing", authMessage: "Run `test-cli login` first." });
  const result = resolveTestAgentOutcome(agent, "");
  assert.equal(result.ok, false);
  assert.equal(result.message, "Run `test-cli login` first.");
});

test("resolveTestAgentOutcome: authStatus 'missing' with no authMessage falls back to a generic not-authenticated message", () => {
  const agent = buildAgent({ authStatus: "missing", authMessage: undefined });
  const result = resolveTestAgentOutcome(agent, "");
  assert.equal(result.ok, false);
  assert.equal(result.message, "Test CLI is installed but not authenticated.");
});

test("resolveTestAgentOutcome: authStatus 'unknown' returns ok:true but says sign-in status could not be verified", () => {
  const agent = buildAgent({ authStatus: "unknown", version: "1.2.3" });
  const result = resolveTestAgentOutcome(agent, "some-model");
  assert.equal(result.ok, true);
  assert.match(result.message, /could not be verified/);
  assert.match(result.message, /^Test CLI 1\.2\.3/);
});

test("resolveTestAgentOutcome: a requested model absent from the agent's real model list returns ok:false, not silently accepted", () => {
  const agent = buildAgent({
    authStatus: "ok",
    models: [{ id: "model-a", label: "Model A" }, { id: "model-b", label: "Model B" }],
  });
  const result = resolveTestAgentOutcome(agent, "model-zzz-does-not-exist");
  assert.equal(result.ok, false);
  assert.match(result.message, /no longer offers the model 'model-zzz-does-not-exist'/);
});

test("resolveTestAgentOutcome: a requested model present in the agent's model list returns ok:true naming it", () => {
  const agent = buildAgent({
    authStatus: "ok",
    version: "2.0.0",
    models: [{ id: "model-a", label: "Model A" }],
  });
  const result = resolveTestAgentOutcome(agent, "model-a");
  assert.equal(result.ok, true);
  assert.match(result.message, /is installed and authenticated, and offers 'model-a'/);
});

test("resolveTestAgentOutcome: no model requested returns ok:true with the plain installed-and-authenticated message", () => {
  const agent = buildAgent({ authStatus: "ok", version: "2.0.0" });
  const result = resolveTestAgentOutcome(agent, "");
  assert.equal(result.ok, true);
  assert.equal(result.message, "Test CLI 2.0.0 is installed and authenticated.");
});

test("resolveTestAgentOutcome: authStatus undefined (adapter declares no probe result) is treated the same as 'ok'", () => {
  const agent = buildAgent({ authStatus: undefined, version: "9.9.9" });
  const result = resolveTestAgentOutcome(agent, "");
  assert.equal(result.ok, true);
  assert.equal(result.message, "Test CLI 9.9.9 is installed and authenticated.");
});

test("resolveTestAgentOutcome: a model requested against an agent with an EMPTY model list is not treated as a mismatch (models?.length guard)", () => {
  // Pins existing behavior carried over unchanged from the route: the mismatch check is gated on
  // `agent.models?.length` being truthy, so an agent that reports no model list at all cannot ever
  // fail the mismatch check — it falls through to the success branch instead.
  const agent = buildAgent({ authStatus: "ok", models: [] });
  const result = resolveTestAgentOutcome(agent, "whatever-model");
  assert.equal(result.ok, true);
  assert.match(result.message, /offers 'whatever-model'/);
});
