import { describe, expect, it } from "vitest";
import { isSelectionNormalizationEcho } from "../local-cli-selection-echo";

// ChatPane normalizes to concrete model IDs; aliases and the retired Gemini CLI are excluded.
const agents = [
  { id: "claude", name: "Claude Code", models: [{ id: "claude-sonnet-4-5", label: "Sonnet" }, { id: "claude-opus-4-5", label: "Opus" }] },
  { id: "copilot", name: "Copilot", models: [{ id: "claude-sonnet-4-5", label: "Sonnet" }] },
  { id: "aider", name: "Aider", available: false },
];

describe("isSelectionNormalizationEcho", () => {
  it("is true for ChatPane's default-model fill-in of a model-less selection", () => {
    expect(isSelectionNormalizationEcho({ agentId: "claude" }, { agentId: "claude", model: "claude-sonnet-4-5" }, agents)).toBe(true);
  });

  it("is true for the fallback from an unavailable agent", () => {
    expect(isSelectionNormalizationEcho({ agentId: "aider" }, { agentId: "claude", model: "claude-sonnet-4-5" }, agents)).toBe(true);
  });

  it("is false for a different model than the resolved one", () => {
    expect(isSelectionNormalizationEcho({ agentId: "claude" }, { agentId: "claude", model: "claude-opus-4-5" }, agents)).toBe(false);
  });

  it("is false for another available agent with the same default model", () => {
    expect(isSelectionNormalizationEcho({ agentId: "claude" }, { agentId: "copilot", model: "claude-sonnet-4-5" }, agents)).toBe(false);
  });

  it("is false for a reasoning pick with the same agent and model", () => {
    const reasoningAgents = [{ id: "codex", name: "Codex", models: [{ id: "gpt-5.5", label: "GPT-5.5" }],
      reasoningOptions: [{ id: "medium", label: "Medium" }, { id: "high", label: "High" }] }];
    expect(isSelectionNormalizationEcho(
      { agentId: "codex", model: "gpt-5.5", reasoning: "medium" },
      { agentId: "codex", model: "gpt-5.5", reasoning: "high" }, reasoningAgents,
    )).toBe(false);
  });

  it("is false without an inventory, since ChatPane cannot normalize against none", () => {
    expect(isSelectionNormalizationEcho({ agentId: "claude" }, { agentId: "claude", model: "claude-sonnet-4-5" }, undefined)).toBe(false);
    expect(isSelectionNormalizationEcho({ agentId: "claude" }, { agentId: "claude", model: "claude-sonnet-4-5" }, [])).toBe(false);
  });
});
