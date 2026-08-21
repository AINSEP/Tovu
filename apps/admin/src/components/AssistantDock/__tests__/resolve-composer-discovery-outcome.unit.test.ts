import { describe, expect, it, vi } from "vitest";

import { resolveComposerDiscoveryOutcome } from "../AssistantDock";
import { projectComposerCapabilities } from "../../../features/plugins/composer-capabilities";
import type { ComposerHostBinding, TovuComposerCapability } from "../../../features/plugins/composer-capabilities";
import type { ComposerDiscoverySelection } from "@jini-ai/chat/react";

/**
 * @file Direct, DI-only coverage for `resolveComposerDiscoveryOutcome` — debate 2's ("Composer
 * slash commands") host-side selection resolver. Every dependency (`capabilities`, `navigate`,
 * `callAllowlistedTool`) is injected, so both `ComposerHostBinding` kinds — including
 * `'allowlisted-tool-call'`, unreachable through any capability in today's bundled catalog — are
 * provable without rendering `AssistantDock` or mocking `@jini-ai/chat/react`.
 */

function selection(itemId: string, argument?: string | null): ComposerDiscoverySelection {
  return { item: { id: itemId, label: itemId }, source: "slash", argument };
}

async function projectionWith(capabilities: readonly TovuComposerCapability[]) {
  return projectComposerCapabilities([{ id: "test", list: async () => capabilities }]);
}

describe("resolveComposerDiscoveryOutcome", () => {
  it("navigates for the existing client-local /mcp route and clears no draft (returns void)", async () => {
    const navigate = vi.fn();
    const callAllowlistedTool = vi.fn();
    const capabilities = await projectionWith([]);

    const outcome = await resolveComposerDiscoveryOutcome(selection("mcp:settings"), {
      capabilities,
      navigate,
      callAllowlistedTool,
    });

    expect(navigate).toHaveBeenCalledWith("/settings?tab=external-mcp");
    expect(outcome).toBeUndefined();
    expect(callAllowlistedTool).not.toHaveBeenCalled();
  });

  it("resolves a compose-text binding into a draft-replacing outcome, without calling the tool endpoint", async () => {
    const resolve = (argument: string | null | undefined): ComposerHostBinding => ({
      kind: "compose-text",
      text: `Search the web for: ${argument}`,
    });
    const capabilities = await projectionWith([
      { groupId: "search", groupLabel: "Search", item: { id: "search:web", label: "/search" }, resolve },
    ]);
    const callAllowlistedTool = vi.fn();

    const outcome = await resolveComposerDiscoveryOutcome(selection("search:web", "aria listbox"), {
      capabilities,
      navigate: vi.fn(),
      callAllowlistedTool,
    });

    expect(outcome).toEqual({ draft: "Search the web for: aria listbox" });
    expect(callAllowlistedTool).not.toHaveBeenCalled();
  });

  it("resolves an allowlisted-tool-call binding by POSTing through the injected caller, then clears the draft", async () => {
    const resolve = (): ComposerHostBinding => ({
      kind: "allowlisted-tool-call",
      toolName: "content_post_delete",
      params: { postId: "42" },
    });
    const capabilities = await projectionWith([
      { groupId: "danger", groupLabel: "Danger", item: { id: "danger:delete", label: "/delete" }, resolve },
    ]);
    const callAllowlistedTool = vi.fn().mockResolvedValue({ ok: true });

    const outcome = await resolveComposerDiscoveryOutcome(selection("danger:delete", ""), {
      capabilities,
      navigate: vi.fn(),
      callAllowlistedTool,
    });

    expect(callAllowlistedTool).toHaveBeenCalledWith({
      name: "content_post_delete",
      arguments: { postId: "42" },
    });
    expect(outcome).toEqual({ draft: "" });
  });

  it("propagates an allowlist rejection (e.g. TOOL_NOT_ALLOWLISTED) rather than swallowing it", async () => {
    const resolve = (): ComposerHostBinding => ({
      kind: "allowlisted-tool-call",
      toolName: "search_web",
      params: {},
    });
    const capabilities = await projectionWith([
      { groupId: "search", groupLabel: "Search", item: { id: "search:web", label: "/search" }, resolve },
    ]);
    const rejection = new Error("'search_web' is not an MCP-UI-redeemable tool");
    const callAllowlistedTool = vi.fn().mockRejectedValue(rejection);

    await expect(
      resolveComposerDiscoveryOutcome(selection("search:web", "cats"), {
        capabilities,
        navigate: vi.fn(),
        callAllowlistedTool,
      }),
    ).rejects.toThrow(rejection);
  });

  it("does nothing for a selection whose item id has no route and no projected capability", async () => {
    const capabilities = await projectionWith([]);
    const navigate = vi.fn();
    const callAllowlistedTool = vi.fn();

    const outcome = await resolveComposerDiscoveryOutcome(selection("unknown:item"), {
      capabilities,
      navigate,
      callAllowlistedTool,
    });

    expect(outcome).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
    expect(callAllowlistedTool).not.toHaveBeenCalled();
  });

  it("does nothing for a projected capability that declares no resolve (macro-only item)", async () => {
    const capabilities = await projectionWith([
      { groupId: "plugins", groupLabel: "Plugins", item: { id: "regular-plugin:word-count", label: "Word Count", insertText: "Word Count plugin" } },
    ]);

    const outcome = await resolveComposerDiscoveryOutcome(selection("regular-plugin:word-count"), {
      capabilities,
      navigate: vi.fn(),
      callAllowlistedTool: vi.fn(),
    });

    expect(outcome).toBeUndefined();
  });

  it("pins a pluginRefId capability via addPluginRef, leaving the draft untouched", async () => {
    const capabilities = await projectionWith([
      {
        groupId: "agent-plugins",
        groupLabel: "Agent Plugins",
        item: { id: "agent-plugin:ui-ux-design", label: "UI/UX Design (Agent Plugin)" },
        pluginRefId: "ui-ux-design",
      },
    ]);
    const addPluginRef = vi.fn();

    const outcome = await resolveComposerDiscoveryOutcome(selection("agent-plugin:ui-ux-design"), {
      capabilities,
      navigate: vi.fn(),
      callAllowlistedTool: vi.fn(),
      addPluginRef,
    });

    expect(addPluginRef).toHaveBeenCalledWith("ui-ux-design");
    expect(outcome).toBeUndefined();
  });

  it("does not call callAllowlistedTool or navigate when pinning a pluginRefId capability", async () => {
    const capabilities = await projectionWith([
      {
        groupId: "agent-plugins",
        groupLabel: "Agent Plugins",
        item: { id: "agent-plugin:ui-ux-design", label: "UI/UX Design (Agent Plugin)" },
        pluginRefId: "ui-ux-design",
      },
    ]);
    const navigate = vi.fn();
    const callAllowlistedTool = vi.fn();

    await resolveComposerDiscoveryOutcome(selection("agent-plugin:ui-ux-design"), {
      capabilities,
      navigate,
      callAllowlistedTool,
      addPluginRef: vi.fn(),
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(callAllowlistedTool).not.toHaveBeenCalled();
  });

  it("does not throw when addPluginRef is omitted for a pluginRefId capability — a documented no-op", async () => {
    const capabilities = await projectionWith([
      {
        groupId: "agent-plugins",
        groupLabel: "Agent Plugins",
        item: { id: "agent-plugin:ui-ux-design", label: "UI/UX Design (Agent Plugin)" },
        pluginRefId: "ui-ux-design",
      },
    ]);

    const outcome = await resolveComposerDiscoveryOutcome(selection("agent-plugin:ui-ux-design"), {
      capabilities,
      navigate: vi.fn(),
      callAllowlistedTool: vi.fn(),
    });

    expect(outcome).toBeUndefined();
  });
});
