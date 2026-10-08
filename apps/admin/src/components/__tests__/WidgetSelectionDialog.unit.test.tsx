import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WidgetAddControl, WidgetPickerDialog, WidgetSelectionDialog } from "../WidgetPickerDialog/WidgetPickerDialog";
import { useWidgetAddControl, useWidgetPickerDialog } from "../WidgetPickerDialog/WidgetPickerDialog.hooks";
import { createFakeWidgetPickerPort } from "../WidgetPickerDialog/widget-picker-dependencies.hooks";

const existing = {
  id: "hero", workspaceId: "ws1", slug: "hero", title: "Hero banner", status: "active" as const,
  widgetType: "text" as const, config: { body: "Welcome" }, updatedAt: "2026-10-08", version: 1,
};

function renderSelection({ port = createFakeWidgetPickerPort(), onResolved = vi.fn() } = {}) {
  const useAddControl: NonNullable<Parameters<typeof WidgetSelectionDialog>[0]["useAddControl"]> =
    props => useWidgetAddControl(props, { port, locale: "en" });
  const useDialog: NonNullable<Parameters<typeof WidgetPickerDialog>[0]["useDialog"]> =
    props => useWidgetPickerDialog(props, { port, locale: "en" });
  function Host() {
    const [open, setOpen] = useState(true);
    return open ? <WidgetSelectionDialog useAddControl={useAddControl} useDialog={useDialog}
      onResolved={async id => { await onResolved(id); setOpen(false); }} onCancel={() => setOpen(false)} /> : null;
  }
  render(<Host />);
  return { port, onResolved };
}

describe("native widget selection", () => {
  it("puts type selection and placement forms in one native dialog; Cancel closes it", async () => {
    const user = userEvent.setup();
    renderSelection();
    const dialog = screen.getByRole("dialog", { name: "Insert widget" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(dialog).getByRole("combobox", { name: "Widget type" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Title")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape first dismisses an open type dropdown, then native cancellation closes the dialog", async () => {
    const user = userEvent.setup();
    const { onResolved } = renderSelection();
    await user.click(screen.getByRole("combobox", { name: "Widget type" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    const dialog = screen.getByRole("dialog", { name: "Insert widget" });
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("changing type resets the draft without replacing the native dialog, and creates the chosen type", async () => {
    const user = userEvent.setup();
    const { port, onResolved } = renderSelection();
    const dialog = screen.getByRole("dialog", { name: "Insert widget" });
    await user.type(screen.getByLabelText("Title"), "Old text draft");
    await user.click(screen.getByRole("combobox", { name: "Widget type" }));
    await user.click(screen.getByRole("option", { name: "Social Links" }));
    expect(screen.getByRole("dialog", { name: "Insert widget" })).toBe(dialog);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.queryByLabelText("Text")).toBeNull();
    await user.type(screen.getByLabelText("Title"), "Social footer");
    await user.click(screen.getByRole("button", { name: "Create and place" }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith("fake-1"));
    expect(port.widgets.map(({ title, widgetType, config }) => ({ title, widgetType, config }))).toEqual([
      { title: "Social footer", widgetType: "social-links", config: { links: [] } },
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses an existing widget without creating another and closes after placement", async () => {
    const user = userEvent.setup();
    const { port, onResolved } = renderSelection({ port: createFakeWidgetPickerPort({ widgets: [existing] }) });
    await user.click(await screen.findByRole("combobox", { name: "Existing Text widgets" }));
    await user.click(screen.getByRole("option", { name: "Hero banner" }));
    await user.click(screen.getByRole("button", { name: "Use this widget" }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith("hero"));
    expect(port.widgets).toEqual([existing]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a created widget remains available for reuse when the editor rejects placement", async () => {
    const user = userEvent.setup();
    const onResolved = vi.fn().mockRejectedValueOnce(new Error("Cannot place here")).mockResolvedValue(undefined);
    const { port } = renderSelection({ onResolved });
    await user.type(screen.getByLabelText("Title"), "Footer note");
    await user.click(screen.getByRole("button", { name: "Create and place" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      'Widget "Footer note" was created but not placed (Cannot place here). Choose it under Use existing to try again.',
    );
    await user.click(await screen.findByRole("combobox", { name: "Existing Text widgets" }));
    await user.click(screen.getByRole("option", { name: "Footer note" }));
    await user.click(screen.getByRole("button", { name: "Use this widget" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onResolved.mock.calls).toEqual([["fake-1"], ["fake-1"]]);
    expect(port.widgets.map(({ title }) => title)).toEqual(["Footer note"]);
  });
});

describe("picker presentation compatibility", () => {
  it("inline presentation renders the same forms without a nested dialog, and keeps Cancel", () => {
    const port = createFakeWidgetPickerPort();
    const onCancel = vi.fn();
    render(<WidgetPickerDialog widgetType="text" presentation="inline" onCancel={onCancel}
      onUseExisting={vi.fn()} onCreateNew={vi.fn()}
      useDialog={props => useWidgetPickerDialog(props, { port, locale: "en" })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("region AddControl keeps its inline type selector and trigger until requested", () => {
    const port = createFakeWidgetPickerPort();
    render(<WidgetAddControl triggerLabel="+ Add widget" onResolved={vi.fn()}
      useAddControl={props => useWidgetAddControl(props, { port, locale: "en" })} />);
    expect(screen.getByRole("combobox", { name: "Widget type" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add widget" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
