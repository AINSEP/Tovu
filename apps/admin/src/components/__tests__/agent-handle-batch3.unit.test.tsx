import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type AdminMedia, type AdminWidget } from "../../lib/api";
import { MediaPickerDialog } from "../MediaPickerDialog/MediaPickerDialog";
import { WidgetAddControl, WidgetPickerDialog } from "../WidgetPickerDialog/WidgetPickerDialog";

/**
 * @file Batch 3 of the shared `components/` pass-through `agentHandle` prop: `MediaPickerDialog`,
 * `WidgetPickerDialog`, and `WidgetAddControl` — the three dialog-shaped components that COMPOSE
 * `Select` and `WidgetConfigFields` (batches 1/2), so this file also pins that composition: handing
 * one of these dialogs a base handle reaches all the way down into the composed component's own
 * sub-elements, not just this file's own buttons/inputs.
 */

const AGENT_ELEMENT = "data-agent-element";
const AGENT_ROLE = "data-agent-role";

const EXISTING_WIDGET: AdminWidget = {
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

function mediaItem(overrides: Partial<AdminMedia> = {}): AdminMedia {
  return {
    id: "m1",
    workspaceId: "w1",
    title: "Sunset",
    slug: "sunset",
    alt: "A sunset over water",
    caption: "",
    credit: "",
    sha256: "abc",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    contentType: "image/png",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MediaPickerDialog agentHandle", () => {
  it("omits data-agent-* on grid items and Cancel when agentHandle is not passed", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [mediaItem({ id: "m1", title: "Sunset" })] });
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);
    const item = await screen.findByTitle("Sunset");
    expect(item).not.toHaveAttribute(AGENT_ELEMENT);
    expect(screen.getByRole("button", { name: "Cancel" })).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("keys each grid item by the asset's own id, and tags Cancel", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({
      media: [mediaItem({ id: "m1", title: "Sunset" }), mediaItem({ id: "m2", title: "Mountain" })],
    });
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} agentHandle="post-media" />);

    expect(await screen.findByTitle("Sunset")).toHaveAttribute(AGENT_ELEMENT, "post-media-item-m1");
    expect(screen.getByTitle("Mountain")).toHaveAttribute(AGENT_ELEMENT, "post-media-item-m2");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveAttribute(AGENT_ELEMENT, "post-media-cancel");
    expect(cancel).toHaveAttribute(AGENT_ROLE, "button");
  });
});

describe("WidgetPickerDialog agentHandle", () => {
  it("omits data-agent-* on the new-title field, config field, and both dialogs' actions when not passed", () => {
    render(<WidgetPickerDialog widgetType="text" onUseExisting={vi.fn()} onCreateNew={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Title")).not.toHaveAttribute(AGENT_ELEMENT);
    expect(screen.getByLabelText("Text")).not.toHaveAttribute(AGENT_ELEMENT);
    expect(screen.getByRole("button", { name: "Cancel" })).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("publishes the new-title field, the composed WidgetConfigFields field, and the submit/cancel actions", () => {
    render(
      <WidgetPickerDialog
        widgetType="text"
        onUseExisting={vi.fn()}
        onCreateNew={vi.fn()}
        onCancel={vi.fn()}
        agentHandle="place-widget"
      />,
    );
    expect(screen.getByLabelText("Title")).toHaveAttribute(AGENT_ELEMENT, "place-widget-new-title");
    // Composition proof: WidgetConfigFields receives `${base}-new-config` and derives its own
    // `-body` field from it — this is NOT a handle WidgetPickerDialog writes itself.
    expect(screen.getByLabelText("Text")).toHaveAttribute(AGENT_ELEMENT, "place-widget-new-config-body");
    expect(screen.getByRole("button", { name: "Create and place" })).toHaveAttribute(AGENT_ELEMENT, "place-widget-new-submit");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute(AGENT_ELEMENT, "place-widget-cancel");
  });

  it("publishes the existing-instances Select and its submit once instances resolve", async () => {
    vi.spyOn(api, "listWidgets").mockResolvedValue({ widgets: [EXISTING_WIDGET] });
    render(
      <WidgetPickerDialog
        widgetType="text"
        onUseExisting={vi.fn()}
        onCreateNew={vi.fn()}
        onCancel={vi.fn()}
        agentHandle="place-widget"
      />,
    );
    const existingSelect = await screen.findByRole("combobox", { name: /existing text widgets/i });
    // Composition proof: the Select's own trigger handle is exactly its `${base}-existing-select`
    // base, from Select.tsx's own scheme (batch 1) — no `-trigger` or other extra suffix.
    expect(existingSelect).toHaveAttribute(AGENT_ELEMENT, "place-widget-existing-select");
    expect(screen.getByRole("button", { name: "Use this widget" })).toHaveAttribute(
      AGENT_ELEMENT,
      "place-widget-existing-submit",
    );
  });
});

describe("WidgetAddControl agentHandle", () => {
  it("omits data-agent-* on the type Select and the trigger when agentHandle is not passed", () => {
    render(<WidgetAddControl triggerLabel="Insert widget" onResolved={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Widget type" })).not.toHaveAttribute(AGENT_ELEMENT);
    expect(screen.getByRole("button", { name: "Insert widget" })).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("publishes <base>-type and <base>-open, and hands the opened dialog <base>-picker as ITS OWN base", async () => {
    const user = userEvent.setup();
    render(<WidgetAddControl triggerLabel="Insert widget" onResolved={vi.fn()} agentHandle="add-widget" />);

    expect(screen.getByRole("combobox", { name: "Widget type" })).toHaveAttribute(AGENT_ELEMENT, "add-widget-type");
    const trigger = screen.getByRole("button", { name: "Insert widget" });
    expect(trigger).toHaveAttribute(AGENT_ELEMENT, "add-widget-open");

    await user.click(trigger);
    // The nested WidgetPickerDialog's own new-title field, reachable only because `-picker` was
    // threaded down as ITS base and WidgetPickerDialog derived `-new-title` from that in turn.
    await waitFor(() => expect(screen.getByLabelText("Title")).toBeInTheDocument());
    expect(screen.getByLabelText("Title")).toHaveAttribute(AGENT_ELEMENT, "add-widget-picker-new-title");
  });
});
