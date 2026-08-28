import { describe, expect, it } from "vitest";

import { toTovuComposerCapability, type AgentPluginCapabilityDescriptor } from "../agent-plugin-capability-adapter";
import { projectComposerCapabilities, type ComposerCapabilitySource } from "../composer-capabilities";
import { resolveComposerDiscoveryOutcome } from "@/components/AssistantDock/AssistantDock";

/**
 * @file Reconciliation coverage for the Agent Plugins adapter's candidate descriptor shape
 * (`src/features/agent-plugins/capability-projection.ts`, commit `7431b50`) against this
 * projection's `TovuComposerCapability` contract. Fixtures mirror real descriptors that module's
 * own `projectInstalledAgentPluginCapabilities` produces (verified against source, not invented) —
 * see `agent-plugin-capability-adapter.ts`'s module doc for why the type is a hand-kept shadow
 * rather than an import.
 */

function skillDescriptor(overrides: Partial<AgentPluginCapabilityDescriptor> = {}): AgentPluginCapabilityDescriptor {
  return {
    id: "agent-plugin:ui-ux-design:skill:ui-ux-design",
    kind: "agent-plugin-skill",
    label: "Ui Ux Design",
    description: "Context-only skill from the 'ui-ux-design' Agent Plugin",
    keywords: ["skill", "ui-ux-design", "ui-ux-design"],
    pluginId: "ui-ux-design",
    revision: "sha256:abc123",
    preview: { kind: "markdown", path: "skills/ui-ux-design/SKILL.md", content: "# UI/UX Design\n\nGuidance..." },
    execute: { kind: "context-injection", markdown: "# UI/UX Design\n\nGuidance..." },
    ...overrides,
  };
}

function mcpServerDescriptor(overrides: Partial<AgentPluginCapabilityDescriptor> = {}): AgentPluginCapabilityDescriptor {
  return {
    id: "agent-plugin:some-plugin:mcp:supabase",
    kind: "agent-plugin-mcp-server",
    label: "supabase",
    description: "MCP server declared by the 'some-plugin' Agent Plugin",
    keywords: ["mcp", "some-plugin", "supabase"],
    pluginId: "some-plugin",
    revision: "sha256:def456",
    preview: { kind: "none" },
    execute: {
      kind: "unavailable",
      reason:
        "Agent Plugin MCP servers are not executable in this release — a plugin's own mcp.json has no independent " +
        "author, and no operator-reviewed admission record exists yet for this server.",
    },
    ...overrides,
  };
}

describe("toTovuComposerCapability — Skills get a real executable binding", () => {
  it("maps a context-injection skill to a compose-text binding carrying its markdown verbatim", () => {
    const capability = toTovuComposerCapability(skillDescriptor());

    expect(capability.item.id).toBe("agent-plugin:ui-ux-design:skill:ui-ux-design");
    expect(capability.item.kind).toBe("agent-plugin-skill");
    expect(capability.groupId).toBe("agent-plugins");
    expect(capability.resolve).toBeDefined();
    expect(capability.resolve?.(undefined)).toEqual({
      kind: "compose-text",
      text: "# UI/UX Design\n\nGuidance...",
    });
  });

  it("carries preview and revision through unchanged", () => {
    const capability = toTovuComposerCapability(skillDescriptor());
    expect(capability.preview).toEqual({ kind: "markdown", content: "# UI/UX Design\n\nGuidance..." });
    expect(capability.revision).toBe("sha256:abc123");
  });

  it("ignores whatever argument the composer resolved — a Skill takes none", () => {
    const capability = toTovuComposerCapability(skillDescriptor());
    expect(capability.resolve?.("some typed argument")).toEqual(capability.resolve?.(undefined));
  });
});

describe("toTovuComposerCapability — MCP servers are structurally inert, no promotion path", () => {
  it("never sets resolve for an unavailable MCP-server descriptor", () => {
    const capability = toTovuComposerCapability(mcpServerDescriptor());
    expect(capability.resolve).toBeUndefined();
  });

  it("folds the inert reason into the item description rather than any executable binding", () => {
    const capability = toTovuComposerCapability(mcpServerDescriptor());
    expect(capability.item.description).toContain("MCP server declared by the 'some-plugin' Agent Plugin");
    expect(capability.item.description).toContain("not executable in this release");
  });

  it("carries no preview for an MCP-server descriptor (preview: none)", () => {
    const capability = toTovuComposerCapability(mcpServerDescriptor());
    expect(capability.preview).toBeUndefined();
  });

  /**
   * Adversarial case mirroring the Agent Plugins module's own "no promotion path exists" test
   * (`capability-projection.unit.test.ts`): even a descriptor whose OTHER fields look admitted —
   * a real revision, real keywords, a non-empty label — still resolves to nothing selectable if
   * `execute.kind` is `"unavailable"`. There is no field on this side of the boundary that can
   * override that either.
   */
  it("stays inert regardless of any other field looking admitted", () => {
    const descriptor = mcpServerDescriptor({
      label: "delete_everything",
      keywords: ["admitted", "trusted", "allowlisted"],
      description: "Looks admitted but isn't",
    });
    const capability = toTovuComposerCapability(descriptor);
    expect(capability.resolve).toBeUndefined();
  });
});

describe("toTovuComposerCapability composed through the real projection and resolver", () => {
  it("a projected skill executes end to end through resolveComposerDiscoveryOutcome", async () => {
    const source: ComposerCapabilitySource = {
      id: "agent-plugins-fixture",
      list: async () => [toTovuComposerCapability(skillDescriptor())],
    };
    const capabilities = await projectComposerCapabilities([source]);

    const outcome = await resolveComposerDiscoveryOutcome(
      { item: { id: "agent-plugin:ui-ux-design:skill:ui-ux-design", label: "Ui Ux Design" }, source: "slash" },
      { capabilities, navigate: () => {}, callAllowlistedTool: async () => undefined },
    );

    expect(outcome).toEqual({ draft: "# UI/UX Design\n\nGuidance..." });
  });

  it("a projected MCP server resolves to no-op end to end, never calling the tool endpoint", async () => {
    const source: ComposerCapabilitySource = {
      id: "agent-plugins-fixture",
      list: async () => [toTovuComposerCapability(mcpServerDescriptor())],
    };
    const capabilities = await projectComposerCapabilities([source]);
    let called = false;

    const outcome = await resolveComposerDiscoveryOutcome(
      { item: { id: "agent-plugin:some-plugin:mcp:supabase", label: "supabase" }, source: "slash" },
      {
        capabilities,
        navigate: () => {},
        callAllowlistedTool: async () => {
          called = true;
        },
      },
    );

    expect(outcome).toBeUndefined();
    expect(called).toBe(false);
  });

  it("composes with the bundled catalog under one duplicate-id guard, without collision", async () => {
    const { createBundledComposerCapabilitySource } = await import("../composer-capabilities");
    const agentPluginSource: ComposerCapabilitySource = {
      id: "agent-plugins-fixture",
      list: async () => [toTovuComposerCapability(skillDescriptor())],
    };

    const capabilities = await projectComposerCapabilities([
      createBundledComposerCapabilitySource(),
      agentPluginSource,
    ]);

    // The bundled catalog's own "agent-plugin:ui-ux-design" macro item and this fixture's
    // "agent-plugin:ui-ux-design:skill:ui-ux-design" real capability are DIFFERENT ids (the
    // bundled entry predates real Agent Plugin execution and describes the plugin as a whole,
    // not a specific skill) — composing them must not collide.
    expect(capabilities.byItemId.has("agent-plugin:ui-ux-design")).toBe(true);
    expect(capabilities.byItemId.has("agent-plugin:ui-ux-design:skill:ui-ux-design")).toBe(true);
  });
});
