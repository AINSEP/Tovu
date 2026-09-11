import { describe, expect, it } from "vitest";

import { toTovuComposerCapability, type AgentPluginCapabilityDescriptor } from "../agent-plugin-capability-adapter";
import { projectComposerCapabilities, type ComposerCapabilitySource } from "../composer-capabilities";
import { resolveComposerDiscoveryOutcome } from "@/components/AssistantDock/AssistantDock";

/**
 * @file Reconciliation coverage for the Agent Plugins adapter's candidate descriptor shape
 * (`src/features/agent-plugins/capability-projection.ts`) against this projection's
 * `TovuComposerCapability` contract. Fixtures mirror real descriptors that module's own
 * `projectInstalledAgentPluginCapabilities` produces (verified against source, not invented) — see
 * `agent-plugin-capability-adapter.ts`'s module doc for why the type is a hand-kept shadow rather
 * than an import.
 *
 * 2026-09-10: `mcpServerDescriptor` below now models an AUTO-ADMITTED remote server
 * (`execute: { kind: "federated" }`), reflecting the owner-overruled FINAL decision. A second
 * fixture, `stdioMcpServerDescriptor`, models the one case that still stays `execute: { kind:
 * "unavailable" }` — a `stdio` server, which always requires explicit operator confirmation before
 * Tovu will run it. Both stay composer-inert (no `resolve`), which is the property this file's
 * tests actually exist to prove — see `agent-plugin-capability-adapter.ts`'s header for why neither
 * kind gets a composer binding.
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
      kind: "federated",
      reason:
        "this remote MCP server is wired into the assistant's tool set automatically — it carries no local " +
        "execution and no secret this plugin could have embedded, so no separate confirmation is required.",
    },
    ...overrides,
  };
}

function stdioMcpServerDescriptor(overrides: Partial<AgentPluginCapabilityDescriptor> = {}): AgentPluginCapabilityDescriptor {
  return {
    id: "agent-plugin:some-plugin:mcp:local-cli",
    kind: "agent-plugin-mcp-server",
    label: "local-cli",
    description: "MCP server declared by the 'some-plugin' Agent Plugin",
    keywords: ["mcp", "some-plugin", "local-cli"],
    pluginId: "some-plugin",
    revision: "sha256:def456",
    preview: { kind: "none" },
    execute: {
      kind: "unavailable",
      reason: "this server launches a local process ('stdio') from a downloaded plugin package — that requires explicit operator confirmation.",
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

describe("toTovuComposerCapability — MCP servers are composer-structurally-inert, whether auto-admitted or not", () => {
  it("never sets resolve for a federated (auto-admitted) MCP-server descriptor", () => {
    const capability = toTovuComposerCapability(mcpServerDescriptor());
    expect(capability.resolve).toBeUndefined();
  });

  it("never sets resolve for an unavailable (stdio, unconfirmed) MCP-server descriptor", () => {
    const capability = toTovuComposerCapability(stdioMcpServerDescriptor());
    expect(capability.resolve).toBeUndefined();
  });

  it("folds the federated reason into the item description rather than any executable binding", () => {
    const capability = toTovuComposerCapability(mcpServerDescriptor());
    expect(capability.item.description).toContain("MCP server declared by the 'some-plugin' Agent Plugin");
    expect(capability.item.description).toContain("wired into the assistant's tool set automatically");
  });

  it("folds the unavailable reason into the item description for a stdio descriptor", () => {
    const capability = toTovuComposerCapability(stdioMcpServerDescriptor());
    expect(capability.item.description).toContain("requires explicit operator confirmation");
  });

  it("carries no preview for an MCP-server descriptor (preview: none)", () => {
    const capability = toTovuComposerCapability(mcpServerDescriptor());
    expect(capability.preview).toBeUndefined();
  });

  /**
   * Adversarial case: even a descriptor whose OTHER fields look admitted — a real revision, real
   * keywords, a non-empty label — still resolves to nothing selectable on THIS side of the
   * boundary. Unlike before 2026-09-10, `execute.kind` genuinely CAN vary now (`"federated"` vs.
   * `"unavailable"`) — what stays true, and what this test actually proves, is that neither value
   * of it (nor any other field) ever produces a `resolve` binding here. The source-side promotion
   * path this mirrors (`classifyAgentPluginMcpServerTrust`) lives in `capability-projection.ts`,
   * not in this composer-discovery mapping.
   */
  it("stays composer-inert regardless of any other field looking admitted, for either execute kind", () => {
    const federated = mcpServerDescriptor({
      label: "delete_everything",
      keywords: ["admitted", "trusted", "allowlisted"],
      description: "Looks admitted but isn't",
    });
    const unavailable = stdioMcpServerDescriptor({
      label: "delete_everything",
      keywords: ["admitted", "trusted", "allowlisted"],
      description: "Looks admitted but isn't",
    });
    expect(toTovuComposerCapability(federated).resolve).toBeUndefined();
    expect(toTovuComposerCapability(unavailable).resolve).toBeUndefined();
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
