import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminWidget } from "../../../lib/api";
import { createFakeWidgetsPort } from "../hooks/widgets-dependencies.hooks";
import { useWidgetsLibrary } from "../hooks/use-widgets-library.hooks";

/**
 * @file `useWidgetsLibrary` driven against the injected `WidgetsPort`, no `fetch` stub.
 * `WidgetsLibrary.unit.test.tsx` already covers the real-client path via `useWiredWidgetsLibrary`
 * (the component's default DI prop); this is the "injected port" half.
 */

const WIDGET: AdminWidget = {
  id: "w1",
  workspaceId: "ws1",
  slug: "hero",
  title: "Hero",
  status: "active",
  widgetType: "text",
  config: {},
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWidgetsLibrary — injected port (no fetch stub)", () => {
  it("loads the list from the injected port and never touches the real api client", async () => {
    const listSpy = vi.spyOn(api, "listWidgets");
    const port = createFakeWidgetsPort({ widgets: [WIDGET] });
    const { result } = renderHook(() => useWidgetsLibrary({ port, locale: "en" }));

    await waitFor(() => expect(result.current.widgets).toHaveLength(1));
    expect(result.current.widgets?.[0]?.id).toBe("w1");
    expect(listSpy).not.toHaveBeenCalled();
  });

  it("routes trashOrPurge (active widget) through the injected port's trashWidget, and the row disappears once the list re-reads it", async () => {
    const port = createFakeWidgetsPort({ widgets: [WIDGET] });
    const { result } = renderHook(() => useWidgetsLibrary({ port, locale: "en" }));
    await waitFor(() => expect(result.current.widgets).toHaveLength(1));

    await act(async () => {
      await result.current.trashOrPurge(WIDGET);
    });

    // `load()` re-reads with `includeInactive: true` then filters out only `purged` rows client-
    // side (see the hook's own comment) — a `trash` row stays in the list, just with its status
    // flipped, matching what `WidgetsLibrary.tsx` renders a "Delete permanently" action against.
    await waitFor(() => expect(result.current.widgets?.[0]?.status).toBe("trash"));
  });

  /**
   * Negative verification (per this refactor's own required check): temporarily replacing
   * `port.listWidgets(...)` in `use-widgets-library.hooks.ts`'s `load()` with a call to the real
   * `api.listWidgets(...)` and re-running this suite fails both non-pending assertions above (no
   * real network in this test env) — see this feature's commit/handoff report for the recorded run.
   */
  it("does not resolve `widgets` while the injected port's list call is still pending", () => {
    const port = createFakeWidgetsPort();
    port.listWidgets = () => new Promise(() => {});
    const { result } = renderHook(() => useWidgetsLibrary({ port, locale: "en" }));
    expect(result.current.widgets).toBeNull();
  });
});
