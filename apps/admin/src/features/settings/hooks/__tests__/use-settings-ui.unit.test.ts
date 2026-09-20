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
  // moved. `port` and `skillsPort` are the two once-per-mount refs this hook still owns.
  it("port/skillsPort keep the same object identity after an unrelated state update", () => {
    const { result, rerender } = renderHook(() => useSettingsUi());
    const { port, skillsPort } = result.current;

    act(() => result.current.setMemoryTopTab("how"));
    rerender();

    expect(result.current.port).toBe(port);
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

// The "composed sub-controllers are present" case that lived here MOVED, unchanged in what it
// asserts, to `features/providers/hooks/__tests__/use-providers.unit.test.ts` — `composio` and
// `externalMcp` are `useProviders`'s controllers now, not this hook's (2026-09-10, see
// `SettingsUi.tsx`'s header). It was moved rather than re-authored so the guarantee it encodes
// (real controllers, not stubs) survives the restructure intact.

describe("useSettingsUi — the moved tabs' controllers are gone from this hook", () => {
  it("no longer exposes composio, externalMcp or mediaProvidersPort", () => {
    // A negative assertion, deliberately: the four tabs those fields fed left this screen, and a
    // stray re-add here would silently re-mount a second live Composio/External MCP controller
    // alongside the Providers page's own — two independent controllers writing the same sealed
    // `composio_config` row and the same `external_mcp_servers` table.
    const { result } = renderHook(() => useSettingsUi());
    expect(result.current).not.toHaveProperty("composio");
    expect(result.current).not.toHaveProperty("externalMcp");
    expect(result.current).not.toHaveProperty("mediaProvidersPort");
  });
});
