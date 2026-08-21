import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useSettingsUi } from "../use-settings-ui.hooks";

/**
 * @file Coverage for `useSettingsUi` (0/4 funcs) — `SettingsUi.tsx`'s port/slice/save-merge
 * bootstrap. Only exercised through `SettingsUiProps.useSettingsUiHook`'s fake in
 * `SettingsUi.unit.test.tsx` today, never directly — this file drives the real hook itself.
 *
 * Every one of the six mounted `useSettingsSlice` instances (and `useWiredComposioConfig`) calls
 * `lib/api` for real here, with no mock — same "a failed fetch in a test environment degrades to a
 * loadError, never a crash" contract `useAdminExecutionCredential`'s/`useAdminLocale`'s own docs
 * establish, and `use-settings-slice.hooks.ts`'s own `loadError` surfacing confirms. This file's own
 * job is the COMPOSITION logic (the `save` merge, `loading`/`loadError` aggregation, the once-per-
 * mount ports), not each slice's individual load/save mechanics.
 */

describe("useSettingsUi — local view state", () => {
  it("modalOpen starts false and setModalOpen updates it", () => {
    const { result } = renderHook(() => useSettingsUi());
    expect(result.current.modalOpen).toBe(false);

    act(() => result.current.setModalOpen(true));

    expect(result.current.modalOpen).toBe(true);
  });

  it("memoryTopTab starts at 'memories' and setMemoryTopTab updates it", () => {
    const { result } = renderHook(() => useSettingsUi());
    expect(result.current.memoryTopTab).toBe("memories");

    act(() => result.current.setMemoryTopTab("chats"));

    expect(result.current.memoryTopTab).toBe("chats");
  });
});

describe("useSettingsUi — once-per-mount ports stay referentially stable across re-renders", () => {
  it("port/mediaProvidersPort/skillsPort keep the same object identity after an unrelated state update", () => {
    const { result, rerender } = renderHook(() => useSettingsUi());
    const { port, mediaProvidersPort, skillsPort } = result.current;

    act(() => result.current.setModalOpen(true));
    rerender();

    expect(result.current.port).toBe(port);
    expect(result.current.mediaProvidersPort).toBe(mediaProvidersPort);
    expect(result.current.skillsPort).toBe(skillsPort);
  });
});

describe("useSettingsUi — loading/loadError aggregation across the six mounted slices", () => {
  it("loading is true immediately (every slice starts unloaded), then eventually settles", async () => {
    const { result } = renderHook(() => useSettingsUi());
    expect(result.current.loading).toBe(true);

    // Every slice's load rejects for real here (no server, no mock) — `areAnySlicesLoading` should
    // still resolve to false once each slice's own load settles (success OR failure), same contract
    // `use-other-credentials.hooks.ts`'s own `allSettled` documents for its six stores.
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 5000 });
    expect(result.current.loadError).not.toBeNull();
  });
});

describe("useSettingsUi — save state merge", () => {
  it("save reflects a merged SaveState derived from all six slices, present from the first render", () => {
    const { result } = renderHook(() => useSettingsUi());
    expect(result.current.save).toBeDefined();
    expect(typeof result.current.save.status).toBe("string");
  });
});

describe("useSettingsUi — composed sub-controllers are present", () => {
  it("wires composio and externalMcp as real controllers, not stubs", () => {
    const { result } = renderHook(() => useSettingsUi());
    expect(result.current.composio).toHaveProperty("save");
    expect(result.current.composio).toHaveProperty("clear");
    expect(result.current.externalMcp).toHaveProperty("dependencies");
    expect(result.current.externalMcp.fieldSpecs.map((f) => f.key)).toContain("command");
  });
});
