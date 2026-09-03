import assert from "node:assert/strict";
import test from "node:test";

import type { DetectedAgent } from "@jini-ai/agent-runtime";

import { toExecutionTabAgent } from "../detect-agents.js";

/**
 * @file `toExecutionTabAgent` is the projection from `@jini-ai/agent-runtime`'s `DetectedAgent`
 * onto `@jini-ai/ui`'s. It is a hand-written field list, which is exactly the shape that drifts:
 * detection pays to discover a field, the projection forgets to carry it, and the card renders
 * nothing with no error anywhere.
 *
 * That had already happened to both reasoning-effort fields. `LocalCliAgentCard` has rendered a
 * "Reasoning effort" control for any agent reporting `reasoningOptions` since it was ported, and
 * `claude`/`codex` have declared those options for just as long — but this function dropped them,
 * so the control was unreachable in Tovu for every runtime. These tests pin both fields to the
 * projection so a future narrowing fails here instead of silently in the UI.
 *
 * Exported for this test the same way `resolveTestAgentOutcome` was extracted for its own (see
 * that file's header): the route itself needs a real PATH scan and a real DB, neither of which a
 * field-projection assertion should have to stand up.
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

test("toExecutionTabAgent forwards reasoningOptions, so a flag-based runtime's effort picker is reachable", () => {
  const projected = toExecutionTabAgent(
    buildAgent({
      id: "claude",
      name: "Claude Code",
      reasoningOptions: [
        { id: "default", label: "Default" },
        { id: "high", label: "High" },
        { id: "max", label: "Max" },
      ],
    }),
  );
  assert.deepEqual(projected.reasoningOptions, [
    { id: "default", label: "Default" },
    { id: "high", label: "High" },
    { id: "max", label: "Max" },
  ]);
});

test("toExecutionTabAgent forwards reasoningInModelId, so the card can derive per-base-model effort levels", () => {
  const projected = toExecutionTabAgent(
    buildAgent({
      id: "antigravity",
      name: "Antigravity",
      reasoningInModelId: {
        levels: [
          { id: "high", label: "High" },
          { id: "medium", label: "Medium" },
          { id: "low", label: "Low" },
        ],
      },
    }),
  );
  assert.deepEqual(projected.reasoningInModelId, {
    levels: [
      { id: "high", label: "High" },
      { id: "medium", label: "Medium" },
      { id: "low", label: "Low" },
    ],
  });
});

test("toExecutionTabAgent omits both reasoning fields entirely for a runtime that declares neither", () => {
  const projected = toExecutionTabAgent(buildAgent());
  assert.equal("reasoningOptions" in projected, false);
  assert.equal("reasoningInModelId" in projected, false);
});

test("toExecutionTabAgent still carries the model list and its provenance alongside the reasoning fields", () => {
  const projected = toExecutionTabAgent(
    buildAgent({
      models: [{ id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (High)" }],
      modelsSource: "live",
      reasoningInModelId: { levels: [{ id: "high", label: "High" }] },
    }),
  );
  // The derivation is over `models`, so a payload carrying the vocabulary but not the catalog
  // would render an effort control with nothing to derive from.
  assert.deepEqual(projected.models, [{ id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (High)" }]);
  assert.equal(projected.modelsSource, "live");
  assert.ok(projected.reasoningInModelId);
});
