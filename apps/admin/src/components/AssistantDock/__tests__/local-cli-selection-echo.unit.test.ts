import { describe, expect, it } from "vitest";
import { isSelectionNormalizationEcho } from "../local-cli-selection-echo";

const agents = [
  { id: "claude", name: "Claude Code", models: [{ id: "default", label: "Default" }, { id: "opus", label: "Opus" }] },
  { id: "aider", name: "Aider", available: false },
];

describe("isSelectionNormalizationEcho", () => {
  it("is true for ChatPane's default-model fill-in of a model-less selection", () => {
    expect(isSelectionNormalizationEcho({ agentId: "claude" }, { agentId: "claude", model: "default" }, agents)).toBe(true);
  });

  it("is true for the fallback from an unavailable agent", () => {
    expect(isSelectionNormalizationEcho({ agentId: "aider" }, { agentId: "claude", model: "default" }, agents)).toBe(true);
  });

  it("is false for a different model than the resolved one", () => {
    expect(isSelectionNormalizationEcho({ agentId: "claude" }, { agentId: "claude", model: "opus" }, agents)).toBe(false);
  });

  it("is false without an inventory, since ChatPane cannot normalize against none", () => {
    expect(isSelectionNormalizationEcho({ agentId: "claude" }, { agentId: "claude", model: "default" }, undefined)).toBe(false);
    expect(isSelectionNormalizationEcho({ agentId: "claude" }, { agentId: "claude", model: "default" }, [])).toBe(false);
  });
});
