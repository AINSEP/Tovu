import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeWidgetPickerPort } from "../WidgetPickerDialog/widget-picker-dependencies.hooks";
import { useExistingInstances, useWidgetAddControl, useWidgetPickerDialog } from "../WidgetPickerDialog/WidgetPickerDialog.hooks";
import type { AdminWidgetType } from "../../lib/api";

/**
 * @file `useExistingInstances`/`useWidgetPickerDialog`/`useWidgetAddControl` — split out of
 * `WidgetPickerDialog.unit.test.tsx` when `WidgetPickerDialog.tsx` split into
 * `WidgetPickerDialog.tsx`/`WidgetPickerDialog.hooks.tsx`, mirroring this repo's
 * `use-fab-position.hooks.test.ts`. `WidgetPickerDialog.unit.test.tsx` keeps the tests that render
 * the actual `<WidgetPickerDialog>` component; this file exercises the three hooks directly via
 * `renderHook`.
 *
 * All three `describe` blocks above drive the hooks with NO deps argument, so they exercise the
 * default-parameter fallback to `defaultWidgetPickerPort` — same shape as before this file's
 * `useWiredX` conversion pass, via the raw `fetch` stub already set up below. The "injected port"
 * block at the bottom is the new coverage that pass adds, proving `port` is a genuine seam rather
 * than a hardcoded reach for `lib/api`'s `api` — see `WidgetPickerDialog.hooks.tsx`'s own header
 * for why it's an optional second parameter rather than a separate `useWiredX()` export.
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

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

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

  it("typeLabel resolves the friendly label for a known widget type", async () => {
    const props = dialogProps();
    const { result } = renderHook(() => useWidgetPickerDialog(props));
    await flush();

    expect(result.current.typeLabel).toBe("Text");
  });

  it("typeLabel falls back to the raw widgetType string for one WIDGET_TYPE_OPTIONS has no entry for", async () => {
    // AdminWidgetType's five members are exactly WIDGET_TYPE_OPTIONS's five entries today, so this
    // never happens through a value the type system allows — but `widgetType` ultimately traces back
    // to server-sourced data (the widget's own persisted type), and a client bundle can be stale
    // against a server that has since added a type this build doesn't know the label for yet. Same
    // "real for externally-sourced data, impossible only by the static type" shape as
    // WidgetPickerDialog.tsx's own `instances ?? []` fallback.
    const props = { ...dialogProps(), widgetType: "future-widget-type" as unknown as AdminWidgetType };
    const { result } = renderHook(() => useWidgetPickerDialog(props));
    await flush();

    expect(result.current.typeLabel).toBe("future-widget-type");
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

  it("closing the picker after a failed create clears the stale error, not just pickerType", async () => {
    // Bug found during the 2026-09-03 admin complexity sweep: `error` was only ever set by
    // `handleCreateNew`'s catch, never cleared anywhere — not on cancel, not on a later success.
    // `WidgetShortcutPicker` (`EmbedInsertControl.tsx`) renders `error` as a SIBLING of the
    // `pickerType`-gated dialog, not nested inside it, so a stale "failed to create widget"
    // message stayed on screen forever after the very first failure, even once the dialog this
    // error came from was long closed. `setPickerType(null)` is exactly what both `Cancel`
    // (`WidgetPickerDialog.tsx`) and `WidgetShortcutPicker.onCancel` call.
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    const props = controlProps();
    const { result } = renderHook(() => useWidgetAddControl(props));
    act(() => result.current.setPickerType("text"));

    await act(async () => {
      await result.current.handleCreateNew("Hero", { body: "" });
    });
    expect(result.current.error).toBeTruthy();

    act(() => result.current.setPickerType(null));

    expect(result.current.error).toBeNull();
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

/**
 * The "injected port" half — every test above drives the hooks via their default-parameter
 * fallback and proves behavior via a stubbed global `fetch`, real coverage but not itself proof
 * that the dependency is INJECTED rather than reached for (a `fetch` stub intercepts either way).
 * These pass `{ port: createFakeWidgetPickerPort(...) }` explicitly — no `fetch` stub active at
 * all (`fetchMock` from `beforeEach` above sits unused in these three) — so a real network touch
 * has nothing to land on.
 *
 * Negative verification (per this refactor's own required check): temporarily reverting
 * `useExistingInstances`/`useWidgetAddControl` to call `defaultWidgetPickerPort` unconditionally
 * (ignoring the `port`/`deps` parameter) and re-running this block fails every assertion below —
 * `fetchMock` throws on the unmocked default `vi.fn()` return (`Cannot read properties of
 * undefined`), which the fake port never touches. Confirmed, then reverted back to the injected
 * read — see this feature's commit/handoff report for the recorded run.
 */
/** Typed `AdminWidget` builder — `EXISTING_WIDGET` above has no type annotation (it only ever
 *  feeds `jsonResponse`'s `unknown` body), so its `status`/`widgetType` fields infer as plain
 *  `string`, too wide for {@link createFakeWidgetPickerPort}'s `AdminWidget[]`. */
function widget(overrides: Partial<import("../../lib/api").AdminWidget> = {}): import("../../lib/api").AdminWidget {
  return { ...EXISTING_WIDGET, status: "active", widgetType: "text", ...overrides };
}

describe("useExistingInstances / useWidgetPickerDialog / useWidgetAddControl — injected port (no fetch stub)", () => {
  it("useExistingInstances reads from the injected port, filtered to the requested widgetType", async () => {
    const port = createFakeWidgetPickerPort({
      widgets: [
        widget({ id: "w-text", widgetType: "text" }),
        widget({ id: "w-menu", widgetType: "menu", slug: "menu-widget" }),
      ],
    });
    const { result } = renderHook(() => useExistingInstances("text", port));

    await flush();
    expect(result.current.instances).toEqual([widget({ id: "w-text", widgetType: "text" })]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("useWidgetPickerDialog's submitUseExisting reads existing instances from the injected port", async () => {
    const port = createFakeWidgetPickerPort({ widgets: [widget({ id: "w-text", widgetType: "text" })] });
    const props = { widgetType: "text" as const, onUseExisting: vi.fn(), onCreateNew: vi.fn(), onCancel: vi.fn() };
    const { result } = renderHook(() => useWidgetPickerDialog(props, { port }));
    await flush();

    act(() => result.current.setSelectedExistingId("w-text"));
    act(() => result.current.submitUseExisting(fakeFormEvent()));

    expect(props.onUseExisting).toHaveBeenCalledWith("w-text");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("useWidgetAddControl's handleCreateNew creates the widget through the injected port, never touching fetch", async () => {
    const port = createFakeWidgetPickerPort();
    const props = { triggerLabel: "+ Add widget", onResolved: vi.fn() };
    const { result } = renderHook(() => useWidgetAddControl(props, { port }));
    act(() => result.current.setPickerType("text"));

    await act(async () => {
      await result.current.handleCreateNew("Hero", { body: "" });
    });

    expect(port.widgets).toHaveLength(1);
    expect(port.widgets[0]!.title).toBe("Hero");
    expect(result.current.pickerType).toBeNull();
    expect(props.onResolved).toHaveBeenCalledWith(port.widgets[0]!.id);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("useWidgetAddControl's handleCreateNew surfaces the injected port's create error", async () => {
    const port = createFakeWidgetPickerPort({ createError: new Error("quota exceeded") });
    const props = { triggerLabel: "+ Add widget", onResolved: vi.fn() };
    const { result } = renderHook(() => useWidgetAddControl(props, { port }));
    act(() => result.current.setPickerType("text"));

    await act(async () => {
      await result.current.handleCreateNew("Hero", { body: "" });
    });

    expect(result.current.error).toBe("quota exceeded");
    expect(result.current.pickerType).toBe("text");
    expect(props.onResolved).not.toHaveBeenCalled();
  });

  it("a placement failure after a successful create says the widget WAS created and where to find it, not that creation failed", async () => {
    const port = createFakeWidgetPickerPort();
    const props = { triggerLabel: "+ Add widget", onResolved: vi.fn(async () => { throw new Error("region write failed"); }) };
    const { result } = renderHook(() => useWidgetAddControl(props, { port }));
    act(() => result.current.setPickerType("text"));

    await act(async () => {
      await result.current.handleCreateNew("Hero", { body: "" });
    });

    expect(port.widgets.map((w) => w.title)).toEqual(["Hero"]);
    expect(result.current.error).toBe(
      'Widget "Hero" was created but not placed (region write failed). Choose it under Use existing to try again.',
    );
  });

  it("handleUseExisting reports a placement failure instead of rejecting into a caller that discards the promise", async () => {
    const port = createFakeWidgetPickerPort();
    const props = { triggerLabel: "+ Add widget", onResolved: vi.fn(async () => { throw new Error("region write failed"); }) };
    const { result } = renderHook(() => useWidgetAddControl(props, { port }));
    act(() => result.current.setPickerType("text"));

    await act(async () => {
      await expect(result.current.handleUseExisting("w1")).resolves.toBeUndefined();
    });

    expect(props.onResolved).toHaveBeenCalledWith("w1");
    expect(result.current.error).toBe("region write failed");
  });
});
