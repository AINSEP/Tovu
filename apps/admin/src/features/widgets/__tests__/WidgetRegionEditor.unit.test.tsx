import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WidgetRegionEditor, WidgetRegionEditorHeaderActions } from "../WidgetRegionEditor";
import type { WidgetRegionEditorController } from "../hooks/use-widget-region-editor.hooks";
import type { AdminWidgetArea, AdminWidgetPlacement } from "@/lib/api";

/**
 * @file `WidgetRegionEditor` — `/admin/widgets/regions/{regionKey}`, driven through the
 * `useWidgetRegionEditorHook` dependency-injection seam. No dedicated test file existed for this
 * component before this pass.
 */

const AREA: AdminWidgetArea = {
  id: "area1",
  workspaceId: "w1",
  regionKey: "footer",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 3,
};

const PLACEMENT_1: AdminWidgetPlacement = {
  placementId: "p1",
  widgetEntryId: "w1",
  enabled: true,
  widgetTitle: "Newsletter",
  widgetType: "text",
  broken: false,
};

const PLACEMENT_2: AdminWidgetPlacement = {
  placementId: "p2",
  widgetEntryId: "w2",
  enabled: false,
  widgetTitle: "Recent posts",
  widgetType: "list",
  broken: false,
};

function baseController(overrides: Partial<WidgetRegionEditorController> = {}): WidgetRegionEditorController {
  return {
    area: AREA,
    placements: [PLACEMENT_1, PLACEMENT_2],
    message: null,
    error: null,
    loading: false,
    saving: false,
    removeAt: vi.fn(),
    moveAt: vi.fn(),
    toggleEnabled: vi.fn(),
    addPlacement: vi.fn(),
    save: vi.fn(async () => {}),
    t: (key: string) => key,
    locale: "en",
    ...overrides,
  };
}

describe("loading and error states", () => {
  it("shows a loading placeholder while loading", () => {
    render(
      <WidgetRegionEditor
        regionKey="footer"
        useWidgetRegionEditorHook={() => baseController({ loading: true })}
      />,
    );
    expect(screen.getByText("Loading region…")).toBeInTheDocument();
  });

  it("shows the error message when the initial load failed (no area yet)", () => {
    render(
      <WidgetRegionEditor
        regionKey="footer"
        useWidgetRegionEditorHook={() => baseController({ area: null, error: "failed to load region", loading: false })}
      />,
    );
    expect(screen.getByText("failed to load region")).toBeInTheDocument();
  });

  it("renders nothing once loading has settled with still no area (defensive null render)", () => {
    const { container } = render(
      <WidgetRegionEditor
        regionKey="footer"
        useWidgetRegionEditorHook={() => baseController({ area: null, error: null, loading: false })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("placements list", () => {
  it("shows the empty state when there are no placements", () => {
    render(
      <WidgetRegionEditor regionKey="footer" useWidgetRegionEditorHook={() => baseController({ placements: [] })} />,
    );
    expect(screen.getByText("No widgets placed in this region yet.")).toBeInTheDocument();
  });

  it("renders each placement's title/type and enabled state", () => {
    render(<WidgetRegionEditor regionKey="footer" useWidgetRegionEditorHook={() => baseController()} />);
    expect(screen.getByText("Newsletter")).toBeInTheDocument();
    expect(screen.getByText("Recent posts")).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("renders a broken-reference badge instead of the title/type for a broken placement", () => {
    render(
      <WidgetRegionEditor
        regionKey="footer"
        useWidgetRegionEditorHook={() => baseController({ placements: [{ ...PLACEMENT_1, broken: true }] })}
      />,
    );
    expect(screen.getByText("⚠ Broken reference")).toBeInTheDocument();
    expect(screen.queryByText("Newsletter")).not.toBeInTheDocument();
  });

  it("gives the ↑/↓/✕ buttons real accessible names, not the bare glyphs (title does not name a button that has text content)", () => {
    render(<WidgetRegionEditor regionKey="footer" useWidgetRegionEditorHook={() => baseController()} />);
    expect(screen.getAllByRole("button", { name: "Move up" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Move down" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);
  });

  it("shows each placement's widget type by its display label, like the Widgets library, not the raw type key", () => {
    render(<WidgetRegionEditor regionKey="footer" useWidgetRegionEditorHook={() => baseController()} />);
    expect(screen.getByText("(Text)")).toBeInTheDocument();
    expect(screen.queryByText("(text)")).not.toBeInTheDocument();
  });

  it("renders no empty '()' type suffix for a just-added placement whose title/type have not loaded yet", () => {
    const draft: AdminWidgetPlacement = { placementId: "p9", widgetEntryId: "w9", enabled: true, widgetTitle: null, widgetType: null, broken: false };
    const { container } = render(
      <WidgetRegionEditor regionKey="footer" useWidgetRegionEditorHook={() => baseController({ placements: [draft] })} />,
    );
    expect(container.textContent).not.toContain("()");
  });

  it("wires the ↑/↓/✕ buttons and the enabled checkbox to the controller", async () => {
    const user = userEvent.setup();
    const controller = baseController();
    render(<WidgetRegionEditor regionKey="footer" useWidgetRegionEditorHook={() => controller} />);

    await user.click(screen.getAllByTitle("Move down")[0]);
    expect(controller.moveAt).toHaveBeenCalledWith(0, 1);

    await user.click(screen.getAllByTitle("Move up")[1]);
    expect(controller.moveAt).toHaveBeenCalledWith(1, -1);

    await user.click(screen.getAllByTitle("Remove")[0]);
    expect(controller.removeAt).toHaveBeenCalledWith("p1");

    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(controller.toggleEnabled).toHaveBeenCalledWith("p1");
  });
});

describe("page chrome", () => {
  it("shows the region key in the title", () => {
    render(<WidgetRegionEditor regionKey="sidebar" useWidgetRegionEditorHook={() => baseController()} />);
    expect(screen.getByText("Region: sidebar")).toBeInTheDocument();
  });

  it("Save is disabled while saving, and reads Saving…", () => {
    render(<WidgetRegionEditor regionKey="footer" useWidgetRegionEditorHook={() => baseController({ saving: true })} />);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("clicking Save calls the controller's save", async () => {
    const user = userEvent.setup();
    const controller = baseController();
    render(<WidgetRegionEditor regionKey="footer" useWidgetRegionEditorHook={() => controller} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(controller.save).toHaveBeenCalled();
  });

  it("shows a success message and an error alert when present", () => {
    render(
      <WidgetRegionEditor
        regionKey="footer"
        useWidgetRegionEditorHook={() => baseController({ message: "Saved · version 4", error: "stale version" })}
      />,
    );
    expect(screen.getByText("Saved · version 4")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("stale version");
  });

  it("renders the Add widget control for placing a new widget", () => {
    render(<WidgetRegionEditor regionKey="footer" useWidgetRegionEditorHook={() => baseController()} />);
    expect(screen.getByRole("button", { name: "+ Add widget" })).toBeInTheDocument();
  });
});

describe("WidgetRegionEditorHeaderActions", () => {
  // Direct coverage of the header-actions cluster extracted out of `WidgetRegionEditor`'s own
  // render body under the tightened ≤9/≤9 pass. The "page chrome" tests above already pin the same
  // three branches end-to-end through the full screen; this exercises the component's own props
  // directly.
  it("shows neither message nor error when both are null", () => {
    const { container } = render(<WidgetRegionEditorHeaderActions message={null} error={null} saving={false} onSave={vi.fn()} />);
    expect(container.querySelector(".save-ok")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the message and error together when both are present", () => {
    render(<WidgetRegionEditorHeaderActions message="Saved · version 4" error="stale version" saving={false} onSave={vi.fn()} />);
    expect(screen.getByText("Saved · version 4")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("stale version");
  });

  it("disables Save and reads 'Saving…' while saving", () => {
    render(<WidgetRegionEditorHeaderActions message={null} error={null} saving={true} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("calls onSave when Save is clicked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<WidgetRegionEditorHeaderActions message={null} error={null} saving={false} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
