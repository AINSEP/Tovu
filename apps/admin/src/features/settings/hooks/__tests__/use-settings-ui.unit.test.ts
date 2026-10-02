import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSettingsUi } from "../use-settings-ui.hooks";

/**
 * @file Coverage for `useSettingsUi` (0/4 funcs) — `SettingsUi.tsx`'s port/slice/save-merge
 * bootstrap. Only exercised through `SettingsUiProps.useSettingsUiHook`'s fake in
 * `SettingsUi.unit.test.tsx` today, never directly — this file drives the real hook itself.
 *
 * Load outcomes are controlled explicitly. Slice overrides in the save-merge cases exercise
 * composition while the real slice and merge implementations retain their own sibling coverage.
 */

const control = vi.hoisted(() => ({
  loads: Array.from({ length: 6 }, () => vi.fn()),
  slices: null as null | Array<{ value: unknown; loadError: string | null; saveState: { status: string; message?: string } }>,
}));
vi.mock("@/lib/execution-settings", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/execution-settings")>(),
  loadExecutionConfig: () => control.loads[0](),
}));
vi.mock("@/lib/settings-tabs", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/settings-tabs")>(),
  loadInstructions: () => control.loads[1](),
  loadNotifications: () => control.loads[2](),
  loadPrivacy: () => control.loads[3](),
  loadAppearance: () => control.loads[4](),
  loadLanguage: () => control.loads[5](),
}));
vi.mock("@/hooks/use-settings-slice.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-settings-slice.hooks")>();
  return {
    ...actual,
    useSettingsSlice: (options: Parameters<typeof actual.useSettingsSlice>[0]) => {
      if (!control.slices) return actual.useSettingsSlice(options);
      const index = ["core.execution", "core.instructions", "core.notifications", "core.privacy", "core.appearance", "core.language"].indexOf(options.namespaces![0]);
      return control.slices[index];
    },
  };
});
beforeEach(() => {
  control.slices = null;
  for (const load of control.loads) load.mockReset().mockRejectedValue(new Error("controlled load failure"));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unexpected network request")));
});
afterEach(() => vi.unstubAllGlobals());

describe("useSettingsUi — local view state", () => {
  it("memoryTopTab starts at 'memories' and setMemoryTopTab updates it", () => {
    const { result } = renderHook(() => useSettingsUi());
    expect(result.current.memoryTopTab).toBe("memories");

    // "how" is the segmented control's other real tab (Memories | How it works) — see
    // `MemoryTopTab` in Jini's `useMemoryNavigation.hooks.ts`. "chats" was never a member of that
    // union; it was fiction that only compiled because `apps/admin`'s tsconfig excludes `__tests__`
    // from `tsc`, so vitest (which never typechecks) let it pass silently.
    act(() => result.current.setMemoryTopTab("how"));

    expect(result.current.memoryTopTab).toBe("how");
  });
});

describe("useSettingsUi — once-per-mount ports stay referentially stable across re-renders", () => {
  // `mediaProvidersPort` dropped out of this assertion on 2026-09-10 with the Media providers tab
  // itself — see `SettingsUi.tsx`'s header for why that inert duplicate was deleted rather than
  // moved. `port` is the once-per-mount ref this hook still owns.
  it("port keeps the same object identity after an unrelated state update", () => {
    const { result, rerender } = renderHook(() => useSettingsUi());
    const { port } = result.current;

    act(() => result.current.setMemoryTopTab("how"));
    rerender();

    expect(result.current.port).toBe(port);
  });
});

describe("useSettingsUi — loading/loadError aggregation across the six mounted slices", () => {
  it("loading is true immediately (every slice starts unloaded), then eventually settles", async () => {
    const { result } = renderHook(() => useSettingsUi());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toBe("controlled load failure");
  });
  it("keeps loading until all six loads settle, including a failed slice", async () => {
    const releases = control.loads.map((load, index) => {
      let release!: () => void;
      load.mockImplementation(() => new Promise((resolve, reject) => {
        release = () => index === 2 ? reject(new Error("notifications failed")) : resolve(`slice-${index}`);
      }));
      return () => release();
    });
    const { result } = renderHook(() => useSettingsUi());
    expect(result.current.loading).toBe(true);
    for (let index = 0; index < releases.length; index += 1) {
      await act(async () => releases[index]());
      expect(result.current.loading).toBe(index < releases.length - 1);
    }
    expect(result.current.loadError).toBe("notifications failed");
  });

});

describe("useSettingsUi — save state merge", () => {
  it("save reflects a merged SaveState derived from all six slices, present from the first render", () => {
    const { result } = renderHook(() => useSettingsUi());
    expect(result.current.save).toBeDefined();
    expect(typeof result.current.save.status).toBe("string");
  });
  it.each([0, 1, 2, 3, 4, 5])("includes slice %s in the exact aggregate save state", (index) => {
    control.slices = Array.from({ length: 6 }, () => ({ value: "loaded", loadError: null, saveState: { status: "idle" } }));
    const { result, rerender } = renderHook(() => useSettingsUi());
    expect(result.current.save).toEqual({ status: "idle" });
    const update = (target: number, saveState: { status: string; message?: string }) => {
      control.slices![target] = { ...control.slices![target], saveState };
      rerender();
    };
    update(index, { status: "saved" });
    expect(result.current.save).toEqual({ status: "saved" });
    update(index, { status: "saving" });
    expect(result.current.save).toEqual({ status: "saving" });
    update(index, { status: "error", message: `slice ${index} failed` });
    update((index + 1) % 6, { status: "saving" });
    update((index + 2) % 6, { status: "saved" });
    expect(result.current.save).toEqual({ status: "error", message: `slice ${index} failed` });
  });

});

// The "composed sub-controllers are present" case that lived here MOVED, unchanged in what it
// asserts, to `features/providers/hooks/__tests__/use-providers.unit.test.ts` — `externalMcp` is
// `useProviders`'s controller now, not this hook's (2026-09-10, see
// `SettingsUi.tsx`'s header). It was moved rather than re-authored so the guarantee it encodes
// (real controllers, not stubs) survives the restructure intact.

describe("useSettingsUi — the moved tabs' controllers are gone from this hook", () => {
  it("no longer exposes composio, externalMcp or mediaProvidersPort", () => {
    // A negative assertion, deliberately: the four tabs those fields fed left this screen, and a
    // stray re-add here would silently re-mount a second live External MCP controller alongside the
    // Providers page's own — two independent controllers writing the same `external_mcp_servers`
    // table. (`composio` was removed outright on 2026-09-27; its guard stays so it cannot return.)
    const { result } = renderHook(() => useSettingsUi());
    expect(result.current).not.toHaveProperty("composio");
    expect(result.current).not.toHaveProperty("externalMcp");
    expect(result.current).not.toHaveProperty("mediaProvidersPort");
  });
});
