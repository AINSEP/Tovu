import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useComposerCapabilities } from "../hooks/AssistantDock.hooks";

/**
 * @file Regression coverage for the 2026-08-21 owner decision to stop projecting the live
 * tool-catalog source into the composer's "/" and "+" menus (see `useComposerCapabilities`'s own
 * doc in `AssistantDock.hooks.tsx` for the full reasoning: the menu is for pointing the assistant
 * at a Skill or Agent Plugin, not for handing it a raw, non-resolving tool id).
 *
 * `createToolCatalogComposerCapabilitySource().list()` is the ONLY thing in this hook's dependency
 * graph that calls `fetch` (`tool-catalog-composer-source.ts`'s own doc) — `fetch` never being
 * called is therefore direct proof the source is not in the projected list, not an inference from
 * the rendered groups. Before the fix (`AssistantDock.hooks.tsx` wiring
 * `createToolCatalogComposerCapabilitySource()` into the same `Promise.all` as the bundled source),
 * this test fails: `fetch` is called once for `/api/tools/search` and a `tool-catalog` group is
 * projected alongside the bundled ones.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useComposerCapabilities", () => {
  it("never calls fetch, and projects only the bundled groups — the live tool-catalog source is not wired in", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [{ id: "forms_create_definition", description: "Creates a form definition.", source: "forms", score: 3.1 }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useComposerCapabilities());

    await waitFor(() => {
      expect(result.current.composerCapabilities.groups.length).toBeGreaterThan(0);
    });

    const groupIds = result.current.composerCapabilities.groups.map((group) => group.id);
    expect(groupIds).not.toContain("tool-catalog");
    expect(groupIds).toEqual(["regular-plugins", "agent-plugins", "skills", "mcp", "tools"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
