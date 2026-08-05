import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useExistingInstances, useWidgetAddControl, useWidgetPickerDialog, WidgetPickerDialog } from "../WidgetPickerDialog";

/**
 * @file `WidgetPickerDialog` — end-to-end proof, in the real dialog (not just `Select.unit.test.tsx`'s
 * emulated host), that swapping its two native `<select>`s for `components/Select.tsx` didn't
 * reintroduce the exact regression the dispatch that made that swap called out by name: this
 * dialog's own `document`-level Escape listener (the `onCancel` effect below `useExistingInstances`)
 * must not fire when Escape is only meant to close the new dropdown's floating panel.
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

it("Escape closes the Select's dropdown without cancelling the dialog underneath it", async () => {
  const user = userEvent.setup();
  const onCancel = vi.fn();

  render(<WidgetPickerDialog widgetType="text" onUseExisting={vi.fn()} onCreateNew={vi.fn()} onCancel={onCancel} />);

  const trigger = await screen.findByRole("combobox", { name: /existing text widgets/i });
  await user.click(trigger);
  expect(screen.getByRole("listbox")).toBeInTheDocument();

  await user.keyboard("{Escape}");

  expect(screen.queryByRole("listbox")).not.toBeInTheDocument(); // the dropdown closed
  expect(onCancel).not.toHaveBeenCalled(); // the dialog was not cancelled
  expect(screen.getByRole("dialog")).toBeInTheDocument(); // still open
});

it("a bare Escape (no dropdown open) still cancels the dialog, unaffected by the fix above", async () => {
  const user = userEvent.setup();
  const onCancel = vi.fn();

  render(<WidgetPickerDialog widgetType="text" onUseExisting={vi.fn()} onCreateNew={vi.fn()} onCancel={onCancel} />);
  await screen.findByRole("combobox", { name: /existing text widgets/i });

  await user.keyboard("{Escape}");

  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("Cancel is styled as a secondary action, not the primary fill", async () => {
  render(<WidgetPickerDialog widgetType="text" onUseExisting={vi.fn()} onCreateNew={vi.fn()} onCancel={vi.fn()} />);

  expect(await screen.findByRole("button", { name: "Cancel" })).toHaveClass("btn-secondary");
});

// REGRESSION, found live in a real browser (not by this suite): `hasExisting` derives from
// `instances`, which starts `null` while the `listWidgets` fetch is in flight — on the Title
// input's very first paint that always reads as `false` regardless of the real answer, so a plain
// `autoFocus={!hasExisting}` used to focus Title unconditionally on every open, even for a widget
// type that already has existing instances, and `autoFocus` only fires once at mount so the fetch
// resolving a moment later never undid it. `ui.spec.md` §5 (quoted in `WidgetPickerDialog.tsx`'s own
// header) wants no pre-selected default once existing instances are a real, equally-weighted option.
it("does not steal focus onto Title once existing instances resolve as present", async () => {
  render(<WidgetPickerDialog widgetType="text" onUseExisting={vi.fn()} onCreateNew={vi.fn()} onCancel={vi.fn()} />);

  await screen.findByRole("combobox", { name: /existing text widgets/i }); // waits for the fetch to resolve
  expect(screen.getByLabelText("Title")).not.toHaveFocus();
});

it("still focuses Title once instances resolve as empty (a genuinely fresh widget type)", async () => {
  fetchMock.mockResolvedValue(jsonResponse({ widgets: [] }));
  render(<WidgetPickerDialog widgetType="text" onUseExisting={vi.fn()} onCreateNew={vi.fn()} onCancel={vi.fn()} />);

  await screen.findByLabelText("Title");
  await waitFor(() => expect(screen.getByLabelText("Title")).toHaveFocus());
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
