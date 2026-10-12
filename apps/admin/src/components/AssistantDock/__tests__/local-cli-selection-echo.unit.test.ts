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
    expect(isSelectionNormalizationEcho({ current: { agentId: "claude" }, incoming: { agentId: "claude", model: "claude-sonnet-4-5" }, agents })).toBe(true);
  });

  it("is true for the fallback from an unavailable agent", () => {
    expect(isSelectionNormalizationEcho({ current: { agentId: "aider" }, incoming: { agentId: "claude", model: "claude-sonnet-4-5" }, agents })).toBe(true);
  });

  it("is false for a different model than the resolved one", () => {
    expect(isSelectionNormalizationEcho({ current: { agentId: "claude" }, incoming: { agentId: "claude", model: "claude-opus-4-5" }, agents })).toBe(false);
  });

  it("is false for another available agent with the same default model", () => {
    expect(isSelectionNormalizationEcho({ current: { agentId: "claude" }, incoming: { agentId: "copilot", model: "claude-sonnet-4-5" }, agents })).toBe(false);
  });

  it("is false for a reasoning pick with the same agent and model", () => {
    const reasoningAgents = [{ id: "codex", name: "Codex", models: [{ id: "gpt-5.5", label: "GPT-5.5" }],
      reasoningOptions: [{ id: "medium", label: "Medium" }, { id: "high", label: "High" }] }];
    expect(isSelectionNormalizationEcho({
      current: { agentId: "codex", model: "gpt-5.5", reasoning: "medium" },
      incoming: { agentId: "codex", model: "gpt-5.5", reasoning: "high" }, agents: reasoningAgents,
    })).toBe(false);
  });

  it.each(["opus", "claude-opus-4-5"])("recognizes Default normalization with the same %s model", model => {
    const reasoningAgents = [{ id: "claude", name: "Claude Code", models: [{ id: model, label: "Opus" }],
      reasoningOptions: [{ id: "default", label: "Default" }, { id: "high", label: "High" }] }];
    expect(isSelectionNormalizationEcho({
      current: { agentId: "claude", model },
      incoming: { agentId: "claude", model, reasoning: "default" }, agents: reasoningAgents,
    })).toBe(true);
    // An explicit reset from High must still be saved, including with a cached legacy alias.
    expect(isSelectionNormalizationEcho({
      current: { agentId: "claude", model, reasoning: "high" },
      incoming: { agentId: "claude", model, reasoning: "default" }, agents: reasoningAgents,
    })).toBe(false);
  });

  it("is false without an inventory, since ChatPane cannot normalize against none", () => {
    expect(isSelectionNormalizationEcho({ current: { agentId: "claude" }, incoming: { agentId: "claude", model: "claude-sonnet-4-5" }, agents: undefined })).toBe(false);
    expect(isSelectionNormalizationEcho({ current: { agentId: "claude" }, incoming: { agentId: "claude", model: "claude-sonnet-4-5" }, agents: [] })).toBe(false);
  });
});
