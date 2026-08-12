import { describe, expect, it } from "vitest";

import {
  createBundledComposerCapabilitySource,
  projectComposerCapabilities,
  resolveTovuComposerDiscoveryRoute,
  type ComposerCapabilitySource,
  type ComposerHostBinding,
  type TovuComposerCapability,
} from "../composer-capabilities";

/**
 * @file Regression coverage for debate 2's Tovu-side projection contract — the async
 * `ComposerCapabilitySource` composition and the `ComposerHostBinding` union
 * (ADS-memory/reports/swarm-consensus/runs/2026-08-12-tovu-six-debates-FINAL.md §2). `AssistantDock`'s
 * own unit tests cover the end-to-end wiring; this file isolates the pure composition/typing
 * contract so a future source (a live tool-registry fetch, or the Agent Plugins adapter) can be
 * proven against it without a DOM.
 */

function fakeSource(id: string, capabilities: readonly TovuComposerCapability[]): ComposerCapabilitySource {
  return { id, list: async () => capabilities };
}

describe("projectComposerCapabilities", () => {
  it("preserves today's exact bundled catalog shape — content unchanged from the pre-2026-08-12 static array", async () => {
    const projection = await projectComposerCapabilities([createBundledComposerCapabilitySource()]);

    expect(projection.groups.map((group) => group.id)).toEqual([
      "regular-plugins",
      "agent-plugins",
      "skills",
      "mcp",
    ]);
    expect(projection.groups.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "regular-plugin:word-count",
      "agent-plugin:ui-ux-design",
      "skill:ui-ux-design",
      "mcp:settings",
    ]);
    expect(projection.byItemId.get("mcp:settings")?.item.kind).toBe("mcp");
  });

  it("composes multiple sources, preserving first-seen group order across source boundaries", async () => {
    const sourceA = fakeSource("a", [
      { groupId: "g1", groupLabel: "Group One", item: { id: "a1", label: "A1" } },
    ]);
    const sourceB = fakeSource("b", [
      { groupId: "g2", groupLabel: "Group Two", item: { id: "b1", label: "B1" } },
      { groupId: "g1", groupLabel: "Group One", item: { id: "a2", label: "A2" } },
    ]);

    const projection = await projectComposerCapabilities([sourceA, sourceB]);

    expect(projection.groups.map((group) => group.id)).toEqual(["g1", "g2"]);
    expect(projection.groups.find((group) => group.id === "g1")?.items.map((item) => item.id)).toEqual([
      "a1",
      "a2",
    ]);
  });

  it("fails closed on a duplicate item id across two sources rather than silently letting one win", async () => {
    const sourceA = fakeSource("a", [
      { groupId: "g1", groupLabel: "Group One", item: { id: "dup", label: "First" } },
    ]);
    const sourceB = fakeSource("b", [
      { groupId: "g1", groupLabel: "Group One", item: { id: "dup", label: "Second" } },
    ]);

    await expect(projectComposerCapabilities([sourceA, sourceB])).rejects.toThrow(/duplicate discovery item id/i);
  });

  it("indexes every capability by item id for selection lookup, including its resolve function", async () => {
    const resolve = (): ComposerHostBinding => ({ kind: "compose-text", text: "resolved" });
    const source = fakeSource("a", [{ groupId: "g1", groupLabel: "Group One", item: { id: "a1", label: "A1" }, resolve }]);

    const projection = await projectComposerCapabilities([source]);

    expect(projection.byItemId.get("a1")?.resolve).toBe(resolve);
  });

  it("returns an empty projection for zero sources", async () => {
    const projection = await projectComposerCapabilities([]);
    expect(projection.groups).toEqual([]);
    expect(projection.byItemId.size).toBe(0);
  });
});

describe("resolveTovuComposerDiscoveryRoute", () => {
  it("routes only the mcp:settings id, unchanged from before the async projection", () => {
    expect(resolveTovuComposerDiscoveryRoute("mcp:settings")).toBe("/settings?tab=external-mcp");
    expect(resolveTovuComposerDiscoveryRoute("agent-plugin:ui-ux-design")).toBeNull();
  });
});
