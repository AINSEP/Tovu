import { describe, expect, it } from "vitest";

import { createBundledComposerCapabilitySource, resolveTovuComposerDiscoveryRoute } from "../composer-capabilities";
import { projectComposerCapabilities } from "@jini-ai/admin/screens/plugins/composer-capabilities";

/**
 * @file Regression coverage for debate 2's Tovu-side projection contract — the async
 * `ComposerCapabilitySource` composition and the `ComposerHostBinding` union
 * (ADS-memory/reports/swarm-consensus/runs/2026-08-12-tovu-six-debates-FINAL.md §2). `AssistantDock`'s
 * own unit tests cover the end-to-end wiring; this file isolates the pure composition/typing
 * contract so a future source (a live tool-registry fetch, or the Agent Plugins adapter) can be
 * proven against it without a DOM.
 */

describe("projectComposerCapabilities", () => {
  it("preserves today's exact bundled catalog shape — the pre-2026-08-12 static array plus this dispatch's /search addition", async () => {
    const projection = await projectComposerCapabilities({ sources: [createBundledComposerCapabilitySource()] });

    expect(projection.groups.map((group) => group.id)).toEqual([
      "regular-plugins",
      "agent-plugins",
      "mcp",
      "tools",
    ]);
    expect(projection.groups.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "regular-plugin:word-count",
      "agent-plugin:ui-ux-design",
      "mcp:settings",
      "tool:content-search",
    ]);
    expect(projection.byItemId.get("mcp:settings")?.item.kind).toBe("mcp");
  });

  it("wires /search to a real allowlisted-tool-call binding against content_post_search, not a synthetic fixture", async () => {
    const projection = await projectComposerCapabilities({ sources: [createBundledComposerCapabilitySource()] });
    const search = projection.byItemId.get("tool:content-search");

    expect(search?.item.command).toBe("search");
    expect(search?.item.argument).toEqual({ placeholder: "search terms", required: true });
    // No needsConfirmation: content_post_search is read-only (see mcp-ui-tool-calls.ts's allowlist
    // entry) and this binding executes immediately on selection — declaring a confirmation cue with
    // nothing behind it would be worse than declaring none.
    expect(search?.item.needsConfirmation).toBeUndefined();

    expect(search?.resolve?.({ argument: "aria listbox" })).toEqual({
      kind: "allowlisted-tool-call",
      toolName: "content_post_search",
      params: { query: "aria listbox" },
    });
    // Defensive fallback for a caller (e.g. this test) that invokes `resolve` directly, bypassing
    // Jini's own grammar — through the real composer, `argument.required: true` means `resolve`
    // is never reached with a blank/undefined argument in the first place.
    expect(search?.resolve?.({ argument: undefined })).toEqual({
      kind: "allowlisted-tool-call",
      toolName: "content_post_search",
      params: { query: "" },
    });
  });
});

describe("bundled catalog label uniqueness", () => {
  it("gives every bundled discovery item a distinct visible label — two rows with the same label are indistinguishable when scanning the composer menu", async () => {
    const projection = await projectComposerCapabilities({ sources: [createBundledComposerCapabilitySource()] });
    const labels = projection.groups.flatMap((group) => group.items.map((item) => item.label));
    const duplicates = labels.filter((label, index) => labels.indexOf(label) !== index);

    expect(duplicates).toEqual([]);
  });
});

describe("resolveTovuComposerDiscoveryRoute", () => {
  it("routes only the mcp:settings id, unchanged from before the async projection", () => {
    expect(resolveTovuComposerDiscoveryRoute({ itemId: "mcp:settings" })).toBe("/settings?tab=external-mcp");
    expect(resolveTovuComposerDiscoveryRoute({ itemId: "agent-plugin:ui-ux-design" })).toBeNull();
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
    const projection = await projectComposerCapabilities({ sources: [createBundledComposerCapabilitySource()] });
    const capability = projection.byItemId.get("agent-plugin:ui-ux-design");

    expect(capability?.pluginRefId).toBe("ui-ux-design");
    // `""`, not undefined: an explicit empty string is what clears the slash trigger to an empty
    // draft (`replaceComposerSlashTrigger` returns its second arg verbatim) while staying falsy for
    // the "+" path's `item.insertText ? ... : composer.draft` guard — see the production doc on this
    // field for the two-path reasoning. (Pre-existing test drift: this assertion predates that fix
    // and was never updated to match — unrelated to this dispatch's slash-command work.)
    expect(capability?.item.insertText).toBe("");
  });

  it("is indexed by pluginRefId for the chip tray's label lookup", async () => {
    const projection = await projectComposerCapabilities({ sources: [createBundledComposerCapabilitySource()] });

    expect(projection.byPluginRefId.get("ui-ux-design")?.item.id).toBe("agent-plugin:ui-ux-design");
  });

  it("declares command: \"ui-ux-design\" so /ui-ux-design locks onto this item, not just fuzzy matches it", async () => {
    const projection = await projectComposerCapabilities({ sources: [createBundledComposerCapabilitySource()] });
    const capability = projection.byItemId.get("agent-plugin:ui-ux-design");

    expect(capability?.item.command).toBe("ui-ux-design");
    // No argument: selecting the item invokes immediately once the typed word matches, same as any
    // other no-argument command (see composer-discovery.ts's resolveComposerSlashInvocation).
    expect(capability?.item.argument).toBeUndefined();
  });
});
