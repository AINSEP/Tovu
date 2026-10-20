import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import type { AdminMedia } from "../../../lib/api";
import type { MediaPickerPort } from "../../MediaPickerDialog/media-picker-port.hooks";
import { MediaContentEditor } from "../MediaContentEditor";
import { useMediaContentEditor } from "../MediaContentEditor.hooks";
import { useHtmlAttributeRows } from "../HtmlAttributeRows.hooks";
import { WIDGET_TYPE_OPTIONS, WidgetConfigFields, defaultWidgetConfig } from "../WidgetConfigFields";

/**
 * @file `MediaContentEditor` behaviour against an in-memory media library port (no module mocks):
 * the two tabs keep each other's content until save, slugs are validated on add, rows reorder and
 * remove, library picks append, HTML attribute rows write the contract's `htmlAttributes` string,
 * and "Insert media…" drops slug-first markup at the caret.
 */

const asset = (id: string, slug: string, contentType: string): AdminMedia => ({
  id, slug, workspaceId: "ws", title: `${slug} title`, alt: `${slug} alt`, caption: "", credit: "", sha256: id, status: "active",
  contentType, createdAt: "", updatedAt: "", version: 1, width: null, height: null, cssClass: null, htmlAttributes: null,
} as AdminMedia);

const LIBRARY = [asset("id-a", "sl-a", "image/png"), asset("id-b", "sl-b", "image/jpeg"), asset("id-v", "clip", "video/mp4"), asset("id-p", "doc", "application/pdf")];
const port: MediaPickerPort = { listMedia: async () => ({ media: LIBRARY }), mediaOriginalUrl: (id) => `/m/${id}/original` };

function Harness({ initial, widgetType = "media", emits = [] }: { initial: Record<string, unknown>; widgetType?: string; emits?: unknown[] }) {
  const [config, setConfig] = useState(initial);
  return (
    <>
      <MediaContentEditor widgetType={widgetType} config={config} onChange={(next) => { emits.push(next); setConfig(next); }} port={port} />
      <output data-testid="config">{JSON.stringify(config)}</output>
    </>
  );
}

const saved = () => JSON.parse(screen.getByTestId("config").textContent!) as Record<string, unknown>;

describe("MediaContentEditor", () => {
  it("switching to an empty tab changes nothing until the first edit there (no false \"Leave site?\")", () => {
    const initial = { mode: "media", items: [{ slug: "sl-a" }], layout: "grid", columns: 3 };
    const emits: unknown[] = [];
    render(<Harness initial={initial} emits={emits} />);

    fireEvent.click(screen.getByRole("tab", { name: "Raw HTML" }));
    expect((screen.getByLabelText("HTML source") as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(screen.getByRole("tab", { name: "Media" }));
    fireEvent.click(screen.getByRole("tab", { name: "Raw HTML" }));
    expect(emits).toEqual([]);
    expect(saved()).toEqual(initial);
    // Saving now would keep the Media tab, so nothing is dropped and nothing warns.
    expect(screen.queryByText("Saving keeps only this tab. The other tab's content will be dropped.")).toBeNull();

    fireEvent.change(screen.getByLabelText("HTML source"), { target: { value: "<p>hi</p>" } });
    expect(emits).toEqual([{ mode: "html", html: "<p>hi</p>" }]);
  });

  it("switching tabs keeps each tab's content, saves only the active one, and warns about the other", async () => {
    render(<Harness initial={{ mode: "media", items: [{ slug: "sl-a" }], layout: "grid", columns: 3 }} />);
    const warning = () => screen.queryByText("Saving keeps only this tab. The other tab's content will be dropped.");
    expect(warning()).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Raw HTML" }));
    expect(saved()).toEqual({ mode: "media", items: [{ slug: "sl-a" }], layout: "grid", columns: 3 });
    expect(warning()).toBeNull();

    fireEvent.change(screen.getByLabelText("HTML source"), { target: { value: "<p>hi</p>" } });
    expect(saved()).toEqual({ mode: "html", html: "<p>hi</p>" });
    expect(warning()).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Media" }));
    expect(saved()).toEqual({ mode: "media", items: [{ slug: "sl-a" }], layout: "grid", columns: 3 });
    expect(warning()).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Raw HTML" }));
    expect(saved()).toEqual({ mode: "html", html: "<p>hi</p>" });
  });

  it("adds a slug only when it is valid, new and in the library", async () => {
    render(<Harness initial={{ mode: "media", items: [{ slug: "sl-a" }] }} />);
    // The datalist fills once the library has loaded — "unknown" is only checked against a loaded library.
    await waitFor(() => expect(document.querySelectorAll("datalist option")).toHaveLength(3));
    const input = screen.getByLabelText("Add by slug");

    fireEvent.change(input, { target: { value: "missing" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toBe('No media with the slug "missing".');
    expect((saved().items as unknown[]).length).toBe(1);

    fireEvent.change(input, { target: { value: "sl-a" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert").textContent).toBe("Already in this list.");

    fireEvent.change(input, { target: { value: "sl-b" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(saved().items).toEqual([{ slug: "sl-a" }, { slug: "sl-b" }]);
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("reorders, edits alt/caption (blank falls back to the library) and removes rows", () => {
    render(<Harness initial={{ mode: "media", items: [{ slug: "sl-a" }, { slug: "sl-b", alt: "B" }], layout: "single" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Move down 1" }));
    expect(saved().items).toEqual([{ slug: "sl-b", alt: "B" }, { slug: "sl-a" }]);
    expect((screen.getByRole("button", { name: "Move up 1" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Caption 2"), { target: { value: "Second" } });
    fireEvent.change(screen.getByLabelText("Alt text 1"), { target: { value: "" } });
    expect(saved().items).toEqual([{ slug: "sl-b" }, { slug: "sl-a", caption: "Second" }]);

    fireEvent.click(screen.getByRole("button", { name: "Remove 1" }));
    expect(saved().items).toEqual([{ slug: "sl-a", caption: "Second" }]);
    expect(screen.queryByLabelText("Columns")).toBeNull();
  });

  it("shows each slug's distinguishing end when unfocused, with the full slug as its tooltip", () => {
    render(<Harness initial={{ mode: "media", items: [{ slug: "peach-and-lily-body-scrub" }, { slug: "2024-gala" }] }} />);
    const first = screen.getByLabelText("Media slug 1");
    expect(first.getAttribute("title")).toBe("peach-and-lily-body-scrub");
    expect(first.className).toContain("is-end-first");
    // RTL would visibly reorder a digit-first slug, so it keeps the plain box.
    expect(screen.getByLabelText("Media slug 2").className).not.toContain("is-end-first");
  });

  it("flags a row whose slug is not in the library once it loads", async () => {
    render(<Harness initial={{ mode: "media", items: [{ slug: "ghost" }] }} />);
    expect(await screen.findByText("Not in the media library")).toBeTruthy();
    expect(screen.getByLabelText("Media slug 1").getAttribute("aria-invalid")).toBe("true");
  });

  it("adds several library picks at once, offering media kinds only", async () => {
    render(<Harness initial={{ mode: "media", items: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose from library" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "clip title" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "sl-a title" }));
    expect(screen.queryByRole("checkbox", { name: "doc title" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add selected" }));
    expect(saved().items).toEqual([{ slug: "clip" }, { slug: "sl-a" }]);
    expect(screen.queryByRole("button", { name: "Add selected" })).toBeNull();
  });

  it("writes HTML attribute rows to the htmlAttributes string and back", () => {
    render(<Harness initial={{ mode: "media", items: [], htmlAttributes: 'data-kui="scroll-snap-x"' }} />);
    expect((screen.getByLabelText("Attribute name 1") as HTMLInputElement).value).toBe("data-kui");

    fireEvent.click(screen.getByRole("button", { name: "Add attribute" }));
    expect(saved().htmlAttributes).toBe('data-kui="scroll-snap-x"');
    fireEvent.change(screen.getByLabelText("Attribute name 2"), { target: { value: "aria-label" } });
    fireEvent.change(screen.getByLabelText("Attribute value 2"), { target: { value: "Photos" } });
    expect(saved().htmlAttributes).toBe('data-kui="scroll-snap-x" aria-label="Photos"');

    fireEvent.change(screen.getByLabelText("Attribute name 2"), { target: { value: "onclick" } });
    expect(screen.getByText("Dropped when rendered")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove data-kui" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove onclick" }));
    expect(saved()).not.toHaveProperty("htmlAttributes");
  });

  it("replaces local attribute rows when a different stored value arrives without emitting an edit", () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useHtmlAttributeRows({ value, onChange }), {
      initialProps: { value: 'aria-label="Before"' },
    });
    act(() => result.current.addRow());
    expect(result.current.rows).toEqual([{ name: "aria-label", value: "Before" }, { name: "", value: "" }]);

    rerender({ value: 'title="Reloaded" onclick="alert(1)"' });

    expect(result.current.rows).toEqual([{ name: "title", value: "Reloaded" }, { name: "onclick", value: "alert(1)" }]);
    expect(result.current.dropped).toEqual([false, true]);
    expect(onChange).not.toHaveBeenCalled();
    rerender({ value: 'title="Reloaded" onclick="alert(1)"' });
    expect(result.current.rows).toEqual([{ name: "title", value: "Reloaded" }, { name: "onclick", value: "alert(1)" }]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("inserts slug-first markup for picked media at the Raw HTML caret", async () => {
    render(<Harness initial={{ mode: "html", html: "<div></div>" }} />);
    const source = screen.getByLabelText("HTML source") as HTMLTextAreaElement;
    source.setSelectionRange(5, 5);
    fireEvent.click(screen.getByRole("button", { name: "Insert media…" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "sl-a title" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected" }));
    expect(saved()).toEqual({ mode: "html", html: '<div><img data-media-slug="sl-a" alt="sl-a alt"></div>' });
  });

  it("shows the 65,536-character cap inline", () => {
    render(<Harness initial={{ mode: "html", html: "x".repeat(65_537) }} />);
    expect(screen.getByRole("alert").textContent).toContain("won't save");
  });

  it("reads a legacy Gallery's images by library slug and saves slug items without them; no Single layout", async () => {
    render(<Harness widgetType="gallery" initial={{ images: [{ mediaId: "id-b", alt: "B" }], layout: "carousel", columns: 3 }} />);
    expect(await screen.findByDisplayValue("sl-b")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Single" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Grid" }));
    expect(saved()).toEqual({ mode: "media", items: [{ slug: "sl-b", alt: "B" }], layout: "grid", columns: 3 });
  });

  it("is what WidgetConfigFields renders for media and gallery widgets", () => {
    expect(WIDGET_TYPE_OPTIONS).toContainEqual({ value: "media", label: "Media" });
    expect(defaultWidgetConfig("media")).toEqual({ mode: "media", items: [], layout: "single" });
    const { unmount } = render(<WidgetConfigFields widgetType="media" config={defaultWidgetConfig("media")} onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Raw HTML" })).toBeTruthy();
    unmount();
    render(<WidgetConfigFields widgetType="gallery" config={defaultWidgetConfig("gallery")} onChange={() => {}} />);
    expect(within(screen.getByRole("tablist")).getAllByRole("tab")).toHaveLength(2);
  });
});


function useControlledMedia(initial: Record<string, unknown>) {
  const [config, setConfig] = useState(initial);
  const [emissions, setEmissions] = useState<Record<string, unknown>[]>([]);
  const controller = useMediaContentEditor({ config, widgetType: "media", onChange: next => {
    setConfig(next);
    setEmissions(current => [...current, next]);
  } }, { port });
  return { controller, config, emissions };
}

describe("MediaContentEditor controller boundaries", () => {
  it("distinguishes invalid, duplicate, known and unknown rows after the library loads", async () => {
    const { result } = renderHook(() => useControlledMedia({ mode: "media", items: [
      { slug: "bad/slug" }, { slug: "sl-a" }, { slug: "sl-a" }, { slug: "missing" },
    ] }));
    await waitFor(() => expect(result.current.controller.library).toEqual(LIBRARY));
    expect(result.current.controller.rows.map(row => [row.item.slug, row.problem, row.kind])).toEqual([
      ["bad/slug", "invalid", "unknown"], ["sl-a", null, "image"], ["sl-a", "duplicate", "image"], ["missing", "unknown", "unknown"],
    ]);
    expect(result.current.controller.mediaUrl(LIBRARY[0])).toBe("/m/id-a/original");
  });

  it("clamps numeric columns and removes an invalid column setting", () => {
    const { result } = renderHook(() => useControlledMedia({ mode: "media", items: [], layout: "grid", columns: 3 }));
    act(() => result.current.controller.setColumns("0"));
    expect(result.current.config.columns).toBe(1);
    act(() => result.current.controller.setColumns("9"));
    expect(result.current.config.columns).toBe(6);
    act(() => result.current.controller.setColumns("invalid"));
    expect(result.current.config).not.toHaveProperty("columns");
  });

  it("persists aspect ratio and CSS class through the same replacement config", () => {
    const { result } = renderHook(() => useControlledMedia({ mode: "media", items: [], layout: "single" }));
    act(() => result.current.controller.setAspectRatio("16/9"));
    act(() => result.current.controller.setCssClass("hero-media"));
    expect(result.current.config).toEqual({ mode: "media", items: [], layout: "single", aspectRatio: "16/9", cssClass: "hero-media" });
  });

  it("does not emit for the active tab or an out-of-bounds move", () => {
    const initial = { mode: "media", items: [{ slug: "sl-a" }], layout: "single" };
    const { result } = renderHook(() => useControlledMedia(initial));
    act(() => result.current.controller.setMode("media"));
    act(() => result.current.controller.moveItem(0, -1));
    act(() => result.current.controller.moveItem(0, 1));
    act(() => result.current.controller.confirmPicker());
    expect(result.current.config).toEqual(initial);
    expect(result.current.emissions).toEqual([]);
  });

  it("deselects one pick, cancels without saving, and clears selections on reopening", async () => {
    const { result } = renderHook(() => useControlledMedia({ mode: "media", items: [] }));
    await waitFor(() => expect(result.current.controller.library).toEqual(LIBRARY));
    act(() => result.current.controller.openPicker("items"));
    act(() => result.current.controller.togglePicked("sl-a"));
    act(() => result.current.controller.togglePicked("sl-b"));
    act(() => result.current.controller.togglePicked("sl-a"));
    expect(result.current.controller.picked).toEqual(["sl-b"]);
    act(() => result.current.controller.cancelPicker());
    expect(result.current.controller.picker).toBeNull();
    expect(result.current.emissions).toEqual([]);
    act(() => result.current.controller.openPicker("items"));
    expect(result.current.controller.picked).toEqual([]);
  });

  it("appends HTML without a mounted textarea and skips a missing library asset", async () => {
    const { result, rerender } = renderHook(() => useControlledMedia({ mode: "html", html: "prefix" }));
    await waitFor(() => expect(result.current.controller.library).toEqual(LIBRARY));
    act(() => result.current.controller.openPicker("html"));
    act(() => result.current.controller.togglePicked("missing"));
    act(() => result.current.controller.togglePicked("sl-a"));
    act(() => result.current.controller.confirmPicker());
    const html = 'prefix<img data-media-slug="sl-a" alt="sl-a alt">';
    expect(result.current.config).toEqual({ mode: "html", html });
    expect(result.current.controller.picker).toBeNull();
    // A later textarea mount still receives the pending caret, once.
    const area = document.createElement("textarea");
    area.value = html;
    document.body.append(area);
    try {
      result.current.controller.htmlRef.current = area;
      rerender();
      expect(document.activeElement).toBe(area);
      expect([area.selectionStart, area.selectionEnd]).toEqual([html.length, html.length]);
      area.setSelectionRange(0, 0);
      rerender();
      expect(area.selectionStart).toBe(0);
    } finally { area.remove(); }
  });

  it("synchronizes scroll only when the gutter is attached", () => {
    const { result } = renderHook(() => useControlledMedia({ mode: "html", html: "a\nb" }));
    const area = document.createElement("textarea");
    area.scrollTop = 37;
    const event = { currentTarget: area } as Parameters<typeof result.current.controller.onHtmlScroll>[0];
    act(() => result.current.controller.onHtmlScroll(event));
    const gutter = document.createElement("div");
    result.current.controller.gutterRef.current = gutter;
    act(() => result.current.controller.onHtmlScroll(event));
    expect(gutter.scrollTop).toBe(37);
    expect(result.current.controller.htmlLines).toBe(2);
  });
});


it("the controller's default port loads media through the real API adapter", async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    expect(String(input)).toBe("/api/admin/v1/workspaces/workspace-local/media");
    return new Response(JSON.stringify({ media: LIBRARY }), { status: 200, headers: { "content-type": "application/json" } });
  });
  try {
    const { result, unmount } = renderHook(() => useMediaContentEditor({ config: { mode: "media", items: [{ slug: "sl-a" }] },
      widgetType: "media", onChange: () => { throw new Error("loading must not change the config"); } }));
    await waitFor(() => expect(result.current.library).toEqual(LIBRARY));
    expect(result.current.rows[0].asset).toEqual(LIBRARY[0]);
    expect(result.current.mediaUrl(LIBRARY[0])).toBe("/api/admin/v1/workspaces/workspace-local/media/id-a/original");
    unmount();
  } finally { vi.unstubAllGlobals(); }
});
