import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import type { AdminMedia } from "../../lib/api";
import type { MediaPickerPort } from "../MediaPickerDialog/media-picker-port.hooks";
import { MediaContentEditor } from "../WidgetConfigFields/MediaContentEditor";
import { WIDGET_TYPE_OPTIONS, WidgetConfigFields, defaultWidgetConfig } from "../WidgetConfigFields/WidgetConfigFields";

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
