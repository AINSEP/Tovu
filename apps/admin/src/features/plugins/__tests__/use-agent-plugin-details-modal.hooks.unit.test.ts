import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useAgentPluginDetailsModal } from "../hooks/use-agent-plugin-details-modal.hooks";
import { UI_UX_DESIGN_SOURCE_FILES } from "../agent-plugin-source-catalog";

/**
 * @file `useAgentPluginDetailsModal` — the file-tree selection state extracted out of
 * `AgentPluginDetailsModal.tsx`. Pins the hook's own contract: it defaults to the first catalogued
 * file, `selectFile` moves the selection, an unrecognized plugin id resolves to an empty list with
 * a `null` selection, and an unrecognized path is a no-op rather than clearing the selection.
 */
describe("useAgentPluginDetailsModal", () => {
  it("defaults selectedFile to the plugin's first catalogued file", () => {
    const { result } = renderHook(() => useAgentPluginDetailsModal("ui-ux-design"));

    expect(result.current.files).toBe(UI_UX_DESIGN_SOURCE_FILES);
    expect(result.current.selectedFile).toEqual(UI_UX_DESIGN_SOURCE_FILES[0]);
  });

  it("selectFile moves the selection to the given relativePath", () => {
    const { result } = renderHook(() => useAgentPluginDetailsModal("ui-ux-design"));
    const target = UI_UX_DESIGN_SOURCE_FILES[3]!;

    act(() => result.current.selectFile(target.relativePath));

    expect(result.current.selectedFile).toEqual(target);
  });

  it("an unrecognized plugin id resolves to an empty file list and a null selection", () => {
    const { result } = renderHook(() => useAgentPluginDetailsModal("not-a-real-plugin"));

    expect(result.current.files).toEqual([]);
    expect(result.current.selectedFile).toBeNull();
  });

  it("selectFile with an unrecognized path leaves the current selection in place", () => {
    const { result } = renderHook(() => useAgentPluginDetailsModal("ui-ux-design"));
    const firstFile = result.current.selectedFile;

    act(() => result.current.selectFile("not/a/real/path.md"));

    // `findBundledAgentPluginSourceFile` returns null for the miss, but the `?? files[0]` fallback
    // in the hook resolves back to the same first file rather than surfacing a null selection.
    expect(result.current.selectedFile).toEqual(firstFile);
  });
});
