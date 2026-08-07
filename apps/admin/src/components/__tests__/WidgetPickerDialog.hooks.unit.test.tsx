import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useExistingInstances, useWidgetAddControl, useWidgetPickerDialog } from "../WidgetPickerDialog/WidgetPickerDialog.hooks";

/**
 * @file `useExistingInstances`/`useWidgetPickerDialog`/`useWidgetAddControl` — split out of
 * `WidgetPickerDialog.unit.test.tsx` when `WidgetPickerDialog.tsx` split into
 * `WidgetPickerDialog.tsx`/`WidgetPickerDialog.hooks.tsx`, mirroring this repo's
 * `use-fab-position.hooks.test.ts`. `WidgetPickerDialog.unit.test.tsx` keeps the tests that render
 * the actual `<WidgetPickerDialog>` component; this file exercises the three hooks directly via
 * `renderHook`.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const EXISTING_WIDGET = {
  id: "w1",
  workspaceId: "ws1",
  slug: "hero-banner",
  title: "Hero banner",
  status: "active",
  widgetType: "text",
  config: { body: "" },
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(jsonResponse({ widgets: [EXISTING_WIDGET] }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Flushes the microtask queue past `request()`'s `fetch().then(res => res.json())` chain so a
 * pending `useExistingInstances` fetch settles inside `act` instead of leaking a state update past
 * the end of the test. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function fakeFormEvent(): React.FormEvent {
  return { preventDefault: () => {} } as unknown as React.FormEvent;
}

describe("useExistingInstances", () => {
  it("starts with instances/error both null and resolves to the fetched list", async () => {
    const { result } = renderHook(() => useExistingInstances("text"));
    expect(result.current.instances).toBeNull();
    expect(result.current.error).toBeNull();

    await flush();
    expect(result.current.instances).toEqual([EXISTING_WIDGET]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a describable error and leaves instances null when the fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useExistingInstances("text"));

    await flush();
    expect(result.current.instances).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});

describe("useWidgetPickerDialog", () => {
  function dialogProps() {
    return {
      widgetType: "text" as const,
      onUseExisting: vi.fn(),
      onCreateNew: vi.fn(),
      onCancel: vi.fn(),
    };
  }

  it("submitUseExisting rejects an empty selection and does not call onUseExisting", async () => {
    const props = dialogProps();
    const { result } = renderHook(() => useWidgetPickerDialog(props));
    await flush();

    act(() => result.current.submitUseExisting(fakeFormEvent()));

    expect(result.current.error).toBe("Choose an existing widget to use.");
    expect(props.onUseExisting).not.toHaveBeenCalled();
  });

  it("submitUseExisting forwards the selected id once one is chosen", async () => {
    const props = dialogProps();
    const { result } = renderHook(() => useWidgetPickerDialog(props));
    await flush();

    act(() => result.current.setSelectedExistingId("w1"));
    act(() => result.current.submitUseExisting(fakeFormEvent()));

    expect(props.onUseExisting).toHaveBeenCalledWith("w1");
    expect(result.current.error).toBeNull();
  });

  it("submitCreateNew rejects a blank (or whitespace-only) title and does not call onCreateNew", async () => {
    const props = dialogProps();
    const { result } = renderHook(() => useWidgetPickerDialog(props));
    await flush();

    act(() => result.current.setNewTitle("   "));
    act(() => result.current.submitCreateNew(fakeFormEvent()));

    expect(result.current.error).toBe("Title is required.");
    expect(props.onCreateNew).not.toHaveBeenCalled();
  });

  it("submitCreateNew trims the title and forwards it with the current draft config", async () => {
    const props = dialogProps();
    const { result } = renderHook(() => useWidgetPickerDialog(props));
    await flush();

    act(() => result.current.setNewTitle("  Hero  "));
    act(() => result.current.submitCreateNew(fakeFormEvent()));

    expect(props.onCreateNew).toHaveBeenCalledWith("Hero", result.current.newConfig);
  });
});

describe("useWidgetAddControl", () => {
  function controlProps() {
    return { triggerLabel: "+ Add widget", onResolved: vi.fn() };
  }

  it("starts closed (pickerType null) with the type defaulted to text", () => {
    const { result } = renderHook(() => useWidgetAddControl(controlProps()));
    expect(result.current.pickerType).toBeNull();
    expect(result.current.selectedType).toBe("text");
  });

  it("handleCreateNew is a no-op when no picker type is open, per the pickerType guard", async () => {
    const props = controlProps();
    const { result } = renderHook(() => useWidgetAddControl(props));

    await act(async () => {
      await result.current.handleCreateNew("Hero", { body: "" });
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(props.onResolved).not.toHaveBeenCalled();
  });

  it("handleCreateNew creates the widget, closes the picker, and resolves with the new id", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ widget: EXISTING_WIDGET }));
    const props = controlProps();
    const { result } = renderHook(() => useWidgetAddControl(props));
    act(() => result.current.setPickerType("text"));

    await act(async () => {
      await result.current.handleCreateNew("Hero", { body: "" });
    });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/widgets"), expect.objectContaining({ method: "POST" }));
    expect(result.current.pickerType).toBeNull();
    expect(props.onResolved).toHaveBeenCalledWith(EXISTING_WIDGET.id);
  });

  it("handleCreateNew leaves the picker open and records the error when creation fails", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    const props = controlProps();
    const { result } = renderHook(() => useWidgetAddControl(props));
    act(() => result.current.setPickerType("text"));

    await act(async () => {
      await result.current.handleCreateNew("Hero", { body: "" });
    });

    // The regression this pins: `setPickerType(null)` sits AFTER the `await` in the source, so a
    // rejected create must leave the dialog open (the user still has their draft) rather than
    // closing it out from under them the same way a success does.
    expect(result.current.pickerType).toBe("text");
    expect(result.current.error).toBeTruthy();
    expect(props.onResolved).not.toHaveBeenCalled();
  });

  it("handleUseExisting always closes the picker and resolves with the given id", async () => {
    const props = controlProps();
    const { result } = renderHook(() => useWidgetAddControl(props));
    act(() => result.current.setPickerType("text"));

    await act(async () => {
      await result.current.handleUseExisting("w1");
    });

    expect(result.current.pickerType).toBeNull();
    expect(props.onResolved).toHaveBeenCalledWith("w1");
  });
});
