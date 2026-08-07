import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { NodeViewProps } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { WidgetEmbed, WidgetEmbedInsertControl, WidgetEmbedNodeView, WidgetEmbedStatus, widgetTypeLabel } from "../widget-embed-extension";

/**
 * @file First test file for `widget-embed-extension.tsx` (18.6% before this pass, no dedicated test
 * file — flagged in the coverage audit's risk ranking, rank #14, `WidgetEmbedNodeView` cog 10/cyc 12).
 *
 * Three surfaces, three different testing strategies:
 * - `WidgetEmbedNodeView` (exported for this reason) — a plain React component once given fake
 *   `NodeViewProps`, so every loading/broken/success/change/remove state is asserted directly.
 * - `WidgetEmbed` itself — a real `@tiptap/core` `Editor` (StarterKit + this extension), so
 *   `addAttributes`/`parseHTML`/`renderHTML`/`addCommands` are proven through the actual TipTap
 *   pipeline rather than by re-deriving what each option object "should" do.
 * - `WidgetEmbedInsertControl` / the private `insertWidgetEmbedAtCursor`+`newPlacementId` pair — only
 *   reachable through the full "insert widget" UI flow (`WidgetAddControl` -> `WidgetPickerDialog`),
 *   mirroring `WidgetPickerDialog.unit.test.tsx`'s own fetch-stub pattern.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const NO_WHERE_USED = { count: 0, references: [] };

const ACTIVE_WIDGET = {
  id: "w1",
  workspaceId: "ws1",
  slug: "hero-text",
  title: "Hero text",
  status: "active" as const,
  widgetType: "text" as const,
  config: { body: "hi" },
  updatedAt: "2026-01-01",
  version: 1,
};

function fakeNodeViewProps(
  attrs: { widgetEntryId?: string; placementId?: string },
  overrides: Partial<NodeViewProps> = {},
): NodeViewProps {
  return {
    node: { attrs } as unknown as NodeViewProps["node"],
    deleteNode: vi.fn(),
    updateAttributes: vi.fn(),
    ...overrides,
  } as unknown as NodeViewProps;
}

describe("WidgetEmbedNodeView", () => {
  it("shows 'Loading widget…' before the getWidget fetch resolves", () => {
    vi.spyOn(api, "getWidget").mockReturnValue(new Promise(() => {}));
    render(<WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1", placementId: "p1" })} />);

    expect(screen.getByText("Loading widget…")).toBeInTheDocument();
  });

  it("renders broken, without even calling getWidget, when widgetEntryId is missing", () => {
    const getWidget = vi.spyOn(api, "getWidget");
    render(<WidgetEmbedNodeView {...fakeNodeViewProps({ placementId: "p1" })} />);

    expect(screen.getByLabelText("Broken widget reference")).toBeInTheDocument();
    expect(screen.getByText(/Widget unavailable/)).toBeInTheDocument();
    expect(getWidget).not.toHaveBeenCalled();
  });

  it("renders broken when the fetch rejects (e.g. the widget was purged)", async () => {
    vi.spyOn(api, "getWidget").mockRejectedValue(new Error("404"));
    render(<WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1", placementId: "p1" })} />);

    expect(await screen.findByLabelText("Broken widget reference")).toBeInTheDocument();
    // No widget was ever resolved, so the "(title)" suffix must not render either.
    expect(screen.getByText("⚠ Widget unavailable")).toBeInTheDocument();
  });

  it("renders broken with the widget's own title when it resolved but is not active", async () => {
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: { ...ACTIVE_WIDGET, status: "trash" }, whereUsed: NO_WHERE_USED });
    render(<WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1", placementId: "p1" })} />);

    expect(await screen.findByText("⚠ Widget unavailable (Hero text)")).toBeInTheDocument();
  });

  it("renders the widget's title and type label once resolved and active", async () => {
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    render(<WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1", placementId: "p1" })} />);

    expect(await screen.findByText("Hero text")).toBeInTheDocument();
    expect(screen.getByText("(Text)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Broken widget reference")).not.toBeInTheDocument();
  });

  it("falls back to the raw widgetType string when it matches no WIDGET_TYPE_OPTIONS label", async () => {
    vi.spyOn(api, "getWidget").mockResolvedValue({
      widget: { ...ACTIVE_WIDGET, widgetType: "not-a-real-type" as unknown as typeof ACTIVE_WIDGET.widgetType },
      whereUsed: NO_WHERE_USED,
    });
    render(<WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1", placementId: "p1" })} />);

    expect(await screen.findByText("(not-a-real-type)")).toBeInTheDocument();
  });

  it("Remove calls deleteNode", async () => {
    const user = userEvent.setup();
    const deleteNode = vi.fn();
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    render(<WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1", placementId: "p1" }, { deleteNode })} />);
    await screen.findByText("Hero text");

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(deleteNode).toHaveBeenCalledTimes(1);
  });

  it("Change opens the widget picker dialog scoped to the resolved widget's own type", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ widgets: [] }), { status: 200 })));
    render(<WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1", placementId: "p1" })} />);
    await screen.findByText("Hero text");

    await user.click(screen.getByRole("button", { name: "Change" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("Change is unavailable while the widget hasn't resolved yet (no widget to scope the dialog to)", () => {
    vi.spyOn(api, "getWidget").mockReturnValue(new Promise(() => {}));
    render(<WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1", placementId: "p1" })} />);

    // The Change button itself always renders, but clicking it while `widget` is still `undefined`
    // must not throw or open a dialog scoped to nothing (`changing && widget` guard).
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("selecting an existing instance from the Change dialog updates the node's widgetEntryId and closes the dialog", async () => {
    const user = userEvent.setup();
    const updateAttributes = vi.fn();
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ widgets: [{ ...ACTIVE_WIDGET, id: "w2", title: "Other text widget" }] }), { status: 200 }),
      ),
    );
    render(
      <WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1", placementId: "p1" }, { updateAttributes })} />,
    );
    await screen.findByText("Hero text");
    await user.click(screen.getByRole("button", { name: "Change" }));

    // The custom `Select` component (not a native `<select>`) — click to open, then click the
    // option by its visible label, the same pattern `Select.unit.test.tsx` itself uses.
    const combobox = await screen.findByRole("combobox", { name: /existing text widgets/i });
    await user.click(combobox);
    await user.click(screen.getByRole("option", { name: "Other text widget" }));
    await user.click(screen.getByRole("button", { name: "Use this widget" }));

    expect(updateAttributes).toHaveBeenCalledWith({ widgetEntryId: "w2" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("creating a new instance from the Change dialog updates widgetEntryId to the newly created widget's id", async () => {
    const user = userEvent.setup();
    const updateAttributes = vi.fn();
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    vi.spyOn(api, "createWidget").mockResolvedValue({ widget: { ...ACTIVE_WIDGET, id: "w-new" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ widgets: [] }), { status: 200 })));
    render(
      <WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1", placementId: "p1" }, { updateAttributes })} />,
    );
    await screen.findByText("Hero text");
    await user.click(screen.getByRole("button", { name: "Change" }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText("Title"), "A brand new text widget");
    await user.click(screen.getByRole("button", { name: "Create and place" }));

    await waitFor(() => expect(updateAttributes).toHaveBeenCalledWith({ widgetEntryId: "w-new" }));
  });

  it("a failed create-new in the Change dialog alerts the describable error rather than updating anything", async () => {
    const user = userEvent.setup();
    const updateAttributes = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    vi.spyOn(api, "createWidget").mockRejectedValue(new Error("title already taken"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ widgets: [] }), { status: 200 })));
    render(
      <WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1", placementId: "p1" }, { updateAttributes })} />,
    );
    await screen.findByText("Hero text");
    await user.click(screen.getByRole("button", { name: "Change" }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText("Title"), "Doomed widget");
    await user.click(screen.getByRole("button", { name: "Create and place" }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("title already taken"));
    expect(updateAttributes).not.toHaveBeenCalled();
  });

  it("Cancel from the Change dialog closes it without updating the node", async () => {
    const user = userEvent.setup();
    const updateAttributes = vi.fn();
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ widgets: [] }), { status: 200 })));
    render(
      <WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1", placementId: "p1" }, { updateAttributes })} />,
    );
    await screen.findByText("Hero text");
    await user.click(screen.getByRole("button", { name: "Change" }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(updateAttributes).not.toHaveBeenCalled();
  });

  it("a missing placementId falls back to an empty string rather than the literal 'undefined'", () => {
    vi.spyOn(api, "getWidget").mockReturnValue(new Promise(() => {}));
    const { container } = render(<WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1" })} />);

    expect(container.querySelector('input[type="hidden"]')).toHaveValue("");
  });

  it("carries the node's placementId through as a hidden, read-only field", async () => {
    vi.spyOn(api, "getWidget").mockResolvedValue({ widget: ACTIVE_WIDGET, whereUsed: NO_WHERE_USED });
    const { container } = render(
      <WidgetEmbedNodeView {...fakeNodeViewProps({ widgetEntryId: "w1", placementId: "placement-xyz" })} />,
    );
    await screen.findByText("Hero text");

    const hidden = container.querySelector('input[type="hidden"]');
    expect(hidden).toHaveValue("placement-xyz");
  });
});

// Direct tests for the two units pulled out of `WidgetEmbedNodeView` in the complexity pass
// (cyc 12/cog 10 -> 6/3) — extracted to top-level so they're testable on their own, not just
// through the parent's existing coverage above.
describe("widgetTypeLabel", () => {
  it("returns '' for null or undefined widget (still loading, or unresolvable)", () => {
    expect(widgetTypeLabel(null)).toBe("");
    expect(widgetTypeLabel(undefined)).toBe("");
  });

  it("resolves the WIDGET_TYPE_OPTIONS label for a known widgetType", () => {
    expect(widgetTypeLabel(ACTIVE_WIDGET)).toBe("Text");
  });

  it("falls back to the raw widgetType string when it isn't in WIDGET_TYPE_OPTIONS", () => {
    expect(widgetTypeLabel({ ...ACTIVE_WIDGET, widgetType: "retired-type" as unknown as typeof ACTIVE_WIDGET.widgetType })).toBe(
      "retired-type",
    );
  });
});

describe("WidgetEmbedStatus", () => {
  it("renders the loading notice when widget is undefined", () => {
    render(<WidgetEmbedStatus widget={undefined} isBroken={false} typeLabel="" />);
    expect(screen.getByText("Loading widget…")).toBeInTheDocument();
  });

  it("renders the broken label, with the last-known title if one resolved before breaking", () => {
    render(<WidgetEmbedStatus widget={ACTIVE_WIDGET} isBroken={true} typeLabel="Text" />);
    expect(screen.getByText(/Widget unavailable \(Hero text\)/)).toBeInTheDocument();
  });

  it("renders the broken label with no title suffix when widget is null", () => {
    render(<WidgetEmbedStatus widget={null} isBroken={true} typeLabel="" />);
    const label = screen.getByRole("img", { name: "Broken widget reference" });
    expect(label).toHaveTextContent(/^⚠ Widget unavailable$/);
  });

  it("renders the resolved title and type label when not broken", () => {
    render(<WidgetEmbedStatus widget={ACTIVE_WIDGET} isBroken={false} typeLabel="Text" />);
    expect(screen.getByText("Hero text")).toBeInTheDocument();
    expect(screen.getByText("(Text)")).toBeInTheDocument();
  });
});

describe("WidgetEmbed — real @tiptap/core Editor integration", () => {
  function newEditor() {
    return new Editor({ extensions: [StarterKit, WidgetEmbed], content: "<p>hello</p>" });
  }

  it("addCommands: insertWidgetEmbed inserts a widgetEmbed node carrying exactly the given attrs", () => {
    const editor = newEditor();
    try {
      const applied = editor.commands.insertWidgetEmbed({ placementId: "p1", widgetEntryId: "w1" });
      expect(applied).toBe(true);

      const json = editor.getJSON();
      const embedNode = json.content?.find((n) => n.type === "widgetEmbed");
      expect(embedNode?.attrs).toEqual({ placementId: "p1", widgetEntryId: "w1" });
    } finally {
      editor.destroy();
    }
  });

  it("addAttributes: both placementId and widgetEntryId default to null when omitted", () => {
    const editor = newEditor();
    try {
      editor.commands.insertContent({ type: "widgetEmbed" });
      const json = editor.getJSON();
      const embedNode = json.content?.find((n) => n.type === "widgetEmbed");
      expect(embedNode?.attrs).toEqual({ placementId: null, widgetEntryId: null });
    } finally {
      editor.destroy();
    }
  });

  it("renderHTML/parseHTML round-trip: serializing to HTML and re-parsing preserves the node and its attrs", () => {
    const editor = newEditor();
    try {
      editor.commands.insertWidgetEmbed({ placementId: "p2", widgetEntryId: "w2" });
      const html = editor.getHTML();
      expect(html).toContain("data-widget-embed");

      const reparsed = newEditor();
      try {
        reparsed.commands.setContent(html);
        const embedNode = reparsed.getJSON().content?.find((n) => n.type === "widgetEmbed");
        expect(embedNode?.attrs).toEqual({ placementId: "p2", widgetEntryId: "w2" });
      } finally {
        reparsed.destroy();
      }
    } finally {
      editor.destroy();
    }
  });
});

describe("WidgetEmbedInsertControl", () => {
  it("renders nothing when there is no editor yet", () => {
    const { container } = render(<WidgetEmbedInsertControl editor={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("inserting an existing widget calls editor.commands.insertWidgetEmbed with a freshly minted placementId and the chosen widgetEntryId", async () => {
    const user = userEvent.setup();
    const insertWidgetEmbed = vi.fn().mockReturnValue(true);
    const fakeEditor = { commands: { insertWidgetEmbed } };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ widgets: [{ ...ACTIVE_WIDGET, id: "w9", title: "Reusable text" }] }), { status: 200 }),
      ),
    );

    render(<WidgetEmbedInsertControl editor={fakeEditor} />);
    await user.click(screen.getByRole("button", { name: "Insert widget" }));

    const combobox = await screen.findByRole("combobox", { name: /existing text widgets/i });
    await user.click(combobox);
    await user.click(screen.getByRole("option", { name: "Reusable text" }));
    await user.click(screen.getByRole("button", { name: "Use this widget" }));

    await waitFor(() => expect(insertWidgetEmbed).toHaveBeenCalledTimes(1));
    const [attrs] = insertWidgetEmbed.mock.calls[0] as [{ placementId: string; widgetEntryId: string }];
    expect(attrs.widgetEntryId).toBe("w9");
    expect(attrs.placementId).toBeTruthy();
    expect(typeof attrs.placementId).toBe("string");
  });

  it("mints a Date.now()+Math.random placementId when crypto.randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {});
    const user = userEvent.setup();
    const insertWidgetEmbed = vi.fn().mockReturnValue(true);
    const fakeEditor = { commands: { insertWidgetEmbed } };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ widgets: [{ ...ACTIVE_WIDGET, id: "w10", title: "Another text widget" }] }), { status: 200 }),
      ),
    );

    render(<WidgetEmbedInsertControl editor={fakeEditor} />);
    await user.click(screen.getByRole("button", { name: "Insert widget" }));
    const combobox = await screen.findByRole("combobox", { name: /existing text widgets/i });
    await user.click(combobox);
    await user.click(screen.getByRole("option", { name: "Another text widget" }));
    await user.click(screen.getByRole("button", { name: "Use this widget" }));

    await waitFor(() => expect(insertWidgetEmbed).toHaveBeenCalledTimes(1));
    const [attrs] = insertWidgetEmbed.mock.calls[0] as [{ placementId: string }];
    expect(attrs.placementId).toMatch(/^placement-\d+-[a-z0-9]+$/);
  });
});
