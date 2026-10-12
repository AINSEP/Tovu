import { describe, expect, it } from "vitest";
import { DEFAULT_EXECUTION_CONFIG, buildLocalCliConfigFromLedger } from "@/lib/execution-settings";
import { localCliSelectionFromConfig, withLocalCliSelection } from "../execution-config-write";

describe("Local CLI selection persistence", () => {
  it("saves effort with the selected model using the existing per-agent settings owner", () => {
    const previous = {
      ...DEFAULT_EXECUTION_CONFIG,
      localCli: { agentId: "codex", reasoningByAgentId: { codex: "low", claude: "medium" } },
    };
    const next = withLocalCliSelection({ previous, selection: { agentId: "claude", model: "opus", reasoning: "high" } });
    expect(next.localCli).toEqual({
      agentId: "claude", modelByAgentId: { claude: "opus" },
      reasoningByAgentId: { codex: "low", claude: "high" },
    });
    expect(previous.localCli.reasoningByAgentId).toEqual({ codex: "low", claude: "medium" });
  });

  it("hydrates effort from the scalar ledger format after reload", () => {
    const localCli = buildLocalCliConfigFromLedger(new Map<string, unknown>([
      ["localCli.agentId", "claude"], ["localCli.model", "opus"], ["localCli.reasoning", "max"],
    ]));
    expect(localCliSelectionFromConfig({ config: { ...DEFAULT_EXECUTION_CONFIG, localCli } }))
      .toEqual({ agentId: "claude", model: "opus", reasoning: "max" });
  });

  it("records an explicit default reset but preserves effort when the field is omitted", () => {
    const previous = {
      ...DEFAULT_EXECUTION_CONFIG,
      localCli: { agentId: "claude", reasoningByAgentId: { claude: "high" } },
    };
    expect(withLocalCliSelection({ previous, selection: { agentId: "claude", reasoning: "default" } }).localCli.reasoningByAgentId)
      .toEqual({ claude: "default" });
    expect(withLocalCliSelection({ previous, selection: { agentId: "claude", model: "sonnet" } }).localCli.reasoningByAgentId)
      .toEqual({ claude: "high" });
    expect(withLocalCliSelection({ previous, selection: { agentId: "claude", reasoning: "" } }).localCli.reasoningByAgentId)
      .toEqual({ claude: "" });
  });

  it("does not attach an effort to an absent agent", () => {
    expect(withLocalCliSelection({ previous: DEFAULT_EXECUTION_CONFIG, selection: { agentId: "", reasoning: "high" } }).localCli)
      .toEqual({ agentId: null });
    expect(localCliSelectionFromConfig({ config: DEFAULT_EXECUTION_CONFIG })).toEqual({ agentId: "claude" });
  });
});
