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
  it("preserves today's exact bundled catalog shape — the pre-2026-08-12 static array plus this dispatch's /search addition", async () => {
    const projection = await projectComposerCapabilities([createBundledComposerCapabilitySource()]);

    expect(projection.groups.map((group) => group.id)).toEqual([
      "regular-plugins",
      "agent-plugins",
      "skills",
      "mcp",
      "tools",
    ]);
    expect(projection.groups.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "regular-plugin:word-count",
      "agent-plugin:ui-ux-design",
      "skill:ui-ux-design",
      "mcp:settings",
      "tool:content-search",
    ]);
    expect(projection.byItemId.get("mcp:settings")?.item.kind).toBe("mcp");
  });

  it("wires /search to a real allowlisted-tool-call binding against content_post_search, not a synthetic fixture", async () => {
    const projection = await projectComposerCapabilities([createBundledComposerCapabilitySource()]);
    const search = projection.byItemId.get("tool:content-search");

    expect(search?.item.command).toBe("search");
    expect(search?.item.argument).toEqual({ placeholder: "search terms", required: true });
    // No needsConfirmation: content_post_search is read-only (see mcp-ui-tool-calls.ts's allowlist
    // entry) and this binding executes immediately on selection — declaring a confirmation cue with
    // nothing behind it would be worse than declaring none.
    expect(search?.item.needsConfirmation).toBeUndefined();

    expect(search?.resolve?.("aria listbox")).toEqual({
      kind: "allowlisted-tool-call",
      toolName: "content_post_search",
      params: { query: "aria listbox" },
    });
    // Defensive fallback for a caller (e.g. this test) that invokes `resolve` directly, bypassing
    // Jini's own grammar — through the real composer, `argument.required: true` means `resolve`
    // is never reached with a blank/undefined argument in the first place.
    expect(search?.resolve?.(undefined)).toEqual({
      kind: "allowlisted-tool-call",
      toolName: "content_post_search",
      params: { query: "" },
    });
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

describe("bundled catalog label uniqueness", () => {
  it("gives every bundled discovery item a distinct visible label — two rows with the same label are indistinguishable when scanning the composer menu", async () => {
    const projection = await projectComposerCapabilities([createBundledComposerCapabilitySource()]);
    const labels = projection.groups.flatMap((group) => group.items.map((item) => item.label));
    const duplicates = labels.filter((label, index) => labels.indexOf(label) !== index);

    expect(duplicates).toEqual([]);
  });
});

describe("resolveTovuComposerDiscoveryRoute", () => {
  it("routes only the mcp:settings id, unchanged from before the async projection", () => {
    expect(resolveTovuComposerDiscoveryRoute("mcp:settings")).toBe("/settings?tab=external-mcp");
    expect(resolveTovuComposerDiscoveryRoute("agent-plugin:ui-ux-design")).toBeNull();
  });
});

/**
 * 2026-08-21: this row used to carry `insertText: "UI/UX Design agent plugin"` — selecting it
 * typed that literal string into the draft, indistinguishable from the operator having typed it
 * themselves, and the agent never saw the plugin's real content. `pluginRefId` replaces it —
 * see `TovuComposerCapability.pluginRefId`'s own doc for the full resolution chain.
 */
describe("the bundled agent-plugin:ui-ux-design row pins a chip, no longer types text", () => {
  it("carries pluginRefId and no insertText", async () => {
    const projection = await projectComposerCapabilities([createBundledComposerCapabilitySource()]);
    const capability = projection.byItemId.get("agent-plugin:ui-ux-design");

    expect(capability?.pluginRefId).toBe("ui-ux-design");
    expect(capability?.item.insertText).toBeUndefined();
  });

  it("is indexed by pluginRefId for the chip tray's label lookup", async () => {
    const projection = await projectComposerCapabilities([createBundledComposerCapabilitySource()]);

    expect(projection.byPluginRefId.get("ui-ux-design")?.item.id).toBe("agent-plugin:ui-ux-design");
  });
});

describe("byPluginRefId indexing", () => {
  it("is empty when no capability sets pluginRefId", async () => {
    const projection = await projectComposerCapabilities([
      fakeSource("a", [{ groupId: "g1", groupLabel: "Group One", item: { id: "a1", label: "A1" } }]),
    ]);

    expect(projection.byPluginRefId.size).toBe(0);
  });

  it("fails closed on a duplicate pluginRefId across two capabilities, rather than letting one win silently", async () => {
    const sourceA = fakeSource("a", [
      { groupId: "g1", groupLabel: "Group One", item: { id: "first", label: "First" }, pluginRefId: "shared" },
    ]);
    const sourceB = fakeSource("b", [
      { groupId: "g1", groupLabel: "Group One", item: { id: "second", label: "Second" }, pluginRefId: "shared" },
    ]);

    await expect(projectComposerCapabilities([sourceA, sourceB])).rejects.toThrow(/duplicate pluginRefId/i);
  });
});
