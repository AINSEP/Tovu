import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HtmlPreviewPort } from "@jini-ai/ui/admin-widgets";
import type { AdminMedia } from "../../../lib/api";
import { MediaContentEditor } from "../MediaContentEditor";
import type { MediaContentEditorController, MediaItemRow } from "../MediaContentEditor.hooks";
import type { MediaSlugProblem } from "../media-content-rules";
import { useWidgetPreview } from "../WidgetPreview.hooks";

/**
 * @file Every rendering branch of `MediaContentEditor` against a typed fake controller (the
 * component's `useEditor` seam), including states the real hook only reaches indirectly. The
 * behaviour-level tests against the real hook live in `MediaContentEditor.unit.test.tsx`.
 */

afterEach(cleanup);

type Call = readonly [name: string, ...args: unknown[]];

function asset(id: string, overrides: Partial<AdminMedia> = {}): AdminMedia {
  return {
    id, slug: id, workspaceId: "ws", title: `${id} title`, alt: `${id} alt`, caption: `${id} caption`, credit: "", sha256: id,
    status: "active", contentType: "image/png", createdAt: "", updatedAt: "", version: 1, width: null, height: null,
    cssClass: null, htmlAttributes: null, publicUrl: null, ...overrides,
  };
}

function row(slug: string, overrides: Partial<MediaItemRow> = {}): MediaItemRow {
  return { item: { slug }, asset: undefined, kind: "unknown", showsSlugEnd: false, problem: null, ...overrides };
}

/** A complete controller whose actions only record their calls. */
function fakeController(overrides: Partial<MediaContentEditorController> = {}) {
  const calls: Call[] = [];
  const record = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); };
  const vm: MediaContentEditorController = {
    mode: "media", setMode: record("setMode"), inactiveHasContent: false, library: [], libraryError: null, pickable: [],
    mediaUrl: (media) => `/m/${media.id}`,
    layouts: ["single", "grid"], media: { items: [], layout: "single" }, showColumns: false,
    setLayout: record("setLayout"), setColumns: record("setColumns"), setAspectRatio: record("setAspectRatio"), setCssClass: record("setCssClass"),
    rows: [], maxItems: 50, updateItem: record("updateItem"), moveItem: record("moveItem"), removeItem: record("removeItem"),
    slugDraft: "", setSlugDraft: record("setSlugDraft"), slugProblem: null, addSlug: record("addSlug"),
    setHtmlAttributes: record("setHtmlAttributes"),
    picker: null, picked: [], openPicker: record("openPicker"), togglePicked: record("togglePicked"),
    cancelPicker: record("cancelPicker"), confirmPicker: record("confirmPicker"),
    html: "", setHtml: record("setHtml"), htmlLines: 1, htmlTooLong: false, maxHtmlLength: 65_536,
    htmlRef: { current: null }, gutterRef: { current: null }, onHtmlScroll: record("onHtmlScroll"),
    ...overrides,
  };
  return { vm, calls };
}

const instantPreview: HtmlPreviewPort = async () => "<p>preview</p>";

function renderEditor(vm: MediaContentEditorController, options: { agentHandle?: string; preview?: HtmlPreviewPort } = {}) {
  const port = options.preview ?? instantPreview;
  return render(
    <MediaContentEditor widgetType="media" config={{}} onChange={() => {}} agentHandle={options.agentHandle}
      useEditor={() => vm} usePreview={(input) => useWidgetPreview(input, { render: port })} />,
  );
}

const agentElements = () => Array.from(document.querySelectorAll("[data-agent-element]"), (element) => element.getAttribute("data-agent-element"));

describe("agent handles", () => {
  it("marks every media-tab control and the picker's add button under the given base", () => {
    const { vm } = fakeController({ showColumns: true, picker: "items", pickable: [] });
    renderEditor(vm, { agentHandle: "w" });
    expect(agentElements()).toEqual(expect.arrayContaining([
      "w-tab-media", "w-tab-html", "w-layout-single", "w-layout-grid", "w-columns", "w-aspect-ratio",
      "w-choose", "w-slug", "w-slug-add", "w-css-class", "w-attribute-add", "w-picker-add",
    ]));
  });

  it("marks the Raw HTML tab's controls under the given base", () => {
    const { vm } = fakeController({ mode: "html" });
    renderEditor(vm, { agentHandle: "w" });
    expect(agentElements()).toEqual(expect.arrayContaining(["w-insert-media", "w-html"]));
  });

  it("emits no agent markup without a base", () => {
    const { vm } = fakeController({ showColumns: true, picker: "items" });
    renderEditor(vm);
    expect(agentElements()).toEqual([]);
  });
});

describe("add-by-slug problems", () => {
  it.each<[MediaSlugProblem, string]>([
    ["empty", "Type a media slug."],
    ["invalid", "Slugs can't contain spaces or slashes."],
    ["duplicate", "Already in this list."],
    ["full", "Up to 50 items."],
    ["unknown", 'No media with the slug "ghost".'],
  ])("explains a %s slug", (problem, text) => {
    const { vm } = fakeController({ slugProblem: { problem, slug: "ghost" } });
    renderEditor(vm);
    expect(screen.getByRole("alert").textContent).toBe(text);
    expect(screen.getByLabelText("Add by slug").getAttribute("aria-invalid")).toBe("true");
  });

  it("adds on Enter and ignores other keys", () => {
    const { vm, calls } = fakeController();
    renderEditor(vm);
    fireEvent.keyDown(screen.getByLabelText("Add by slug"), { key: "a" });
    expect(calls).toEqual([]);
    fireEvent.keyDown(screen.getByLabelText("Add by slug"), { key: "Enter" });
    expect(calls).toEqual([["addSlug"]]);
  });

  it("disables adding once the list is full", () => {
    const { vm } = fakeController({ rows: [row("a")], maxItems: 1 });
    renderEditor(vm);
    expect((screen.getByLabelText("Add by slug") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Choose from library" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("1 / 1")).toBeTruthy();
  });
});

describe("item rows", () => {
  it.each<[NonNullable<MediaItemRow["problem"]>, string]>([
    ["invalid", "Slugs can't contain spaces or slashes."],
    ["duplicate", "Already in this list."],
    ["unknown", "Not in the media library"],
  ])("explains a %s row under the row", (problem, text) => {
    const { vm } = fakeController({ rows: [row("bad slug", { problem })] });
    renderEditor(vm);
    expect(screen.getByText(text).className).toBe("field-error media-content-editor__row-error");
    expect(screen.getByLabelText("Media slug 1").getAttribute("aria-invalid")).toBe("true");
  });

  it("shows a warning thumbnail for a slug missing from the library", () => {
    const { vm } = fakeController({ rows: [row("ghost", { problem: "unknown", kind: "image", asset: asset("ghost") })] });
    const { container } = renderEditor(vm);
    expect(container.querySelector(".media-content-editor__thumb")!.className).toBe("media-content-editor__thumb is-missing");
  });

  it("shows the image itself for a library image", () => {
    const { vm } = fakeController({ rows: [row("photo", { kind: "image", asset: asset("photo") })] });
    const { container } = renderEditor(vm);
    expect(container.querySelector("img.media-content-editor__thumb")!.getAttribute("src")).toBe("/m/photo");
  });

  it.each([["video", "Video file"], ["audio", "Audio file"]] as const)("labels a %s thumbnail", (kind, label) => {
    const { vm } = fakeController({ rows: [row("clip", { kind, asset: asset("clip") })] });
    const { container } = renderEditor(vm);
    expect(container.querySelector(".media-content-editor__thumb")!.getAttribute("title")).toBe(label);
  });

  it("shows a placeholder icon for an image row whose asset is not loaded", () => {
    const { vm } = fakeController({ rows: [row("pending", { kind: "image" })] });
    const { container } = renderEditor(vm);
    expect(container.querySelector(".media-content-editor__thumb")!.tagName).toBe("SPAN");
    expect(container.querySelector(".media-content-editor__thumb")!.getAttribute("title")).toBeNull();
  });

  it("trims an edited slug and clears blank alt and caption to fall back to the library", () => {
    const { vm, calls } = fakeController({ rows: [row("a", { item: { slug: "a", alt: "A", caption: "C" } })] });
    renderEditor(vm);
    fireEvent.change(screen.getByLabelText("Media slug 1"), { target: { value: " b " } });
    fireEvent.change(screen.getByLabelText("Alt text 1"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Caption 1"), { target: { value: "" } });
    expect(calls).toEqual([["updateItem", 0, { slug: "b" }], ["updateItem", 0, { alt: undefined }], ["updateItem", 0, { caption: undefined }]]);
  });

  it("keeps typed alt and caption text", () => {
    const { vm, calls } = fakeController({ rows: [row("a")] });
    renderEditor(vm);
    fireEvent.change(screen.getByLabelText("Alt text 1"), { target: { value: "Alt" } });
    fireEvent.change(screen.getByLabelText("Caption 1"), { target: { value: "Cap" } });
    expect(calls).toEqual([["updateItem", 0, { alt: "Alt" }], ["updateItem", 0, { caption: "Cap" }]]);
  });

  it("uses the library's alt and caption as placeholders, else the field names", () => {
    const { vm } = fakeController({ rows: [row("a", { asset: asset("a") }), row("b", { asset: asset("b", { alt: "", caption: "" }) }), row("c")] });
    renderEditor(vm);
    const placeholders = (label: string) => [1, 2, 3].map((n) => screen.getByLabelText(`${label} ${n}`).getAttribute("placeholder"));
    expect(placeholders("Alt text")).toEqual(["a alt", "Alt text", "Alt text"]);
    expect(placeholders("Caption")).toEqual(["a caption", "Caption", "Caption"]);
  });

  it("moves and removes by index, disabling the moves that would leave the list", () => {
    const { vm, calls } = fakeController({ rows: [row("a"), row("b")] });
    renderEditor(vm);
    expect((screen.getByRole("button", { name: "Move up 1" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move down 2" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Move up 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Move down 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove 2" }));
    expect(calls).toEqual([["moveItem", 1, -1], ["moveItem", 0, 1], ["removeItem", 1]]);
  });
});

describe("layout fields", () => {
  it("shows three columns by default and forwards typed values", () => {
    const { vm, calls } = fakeController({ showColumns: true });
    renderEditor(vm);
    const columns = screen.getByLabelText("Columns") as HTMLInputElement;
    expect(columns.value).toBe("3");
    fireEvent.change(columns, { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Aspect ratio"), { target: { value: "16/9" } });
    fireEvent.change(screen.getByLabelText("CSS class"), { target: { value: "wide" } });
    expect(calls).toEqual([["setColumns", "4"], ["setAspectRatio", "16/9"], ["setCssClass", "wide"]]);
  });

  it("shows the saved column count", () => {
    const { vm } = fakeController({ showColumns: true, media: { items: [], layout: "grid", columns: 5 } });
    renderEditor(vm);
    expect((screen.getByLabelText("Columns") as HTMLInputElement).value).toBe("5");
  });
});

describe("tabs, notices and preview", () => {
  it("switches tabs from the keyboard", () => {
    const { vm, calls } = fakeController();
    renderEditor(vm);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Media" }), { key: "ArrowRight" });
    expect(calls).toEqual([["setMode", "html"]]);
  });

  it("shows a library load failure", () => {
    const { vm } = fakeController({ libraryError: "Media library unavailable." });
    renderEditor(vm);
    expect(screen.getByRole("alert").textContent).toBe("Media library unavailable.");
  });

  it("says the preview is loading while the render is pending", async () => {
    const { vm } = fakeController();
    renderEditor(vm, { preview: () => new Promise<string>(() => {}) });
    expect(await screen.findByText("Loading preview…")).toBeTruthy();
  });

  it("shows no preview status once the render has finished without error", async () => {
    const { vm } = fakeController();
    renderEditor(vm);
    const frame = screen.getByTitle("Preview");
    await waitFor(() => expect(frame.getAttribute("srcdoc")).toContain("<p>preview</p>"));
    const status = within(screen.getByRole("region", { name: "Preview" })).getByRole("status");
    expect(status.textContent).toBe("");
    expect(status.className).toBe("field-hint");
  });

  it("says the preview is unavailable when the render fails", async () => {
    const { vm } = fakeController();
    renderEditor(vm, { preview: async () => { throw new Error("render failed"); } });
    expect((await screen.findByText("Preview unavailable.")).className).toBe("field-error");
  });
});

describe("library picker", () => {
  it("says the library is loading", () => {
    const { vm } = fakeController({ picker: "items", pickable: null });
    renderEditor(vm);
    expect(screen.getByText("Loading media…")).toBeTruthy();
  });

  it("shows images as thumbnails and video/audio as icons", () => {
    const { vm } = fakeController({ picker: "items", pickable: [
      asset("photo"), asset("clip", { contentType: "video/mp4" }), asset("song", { contentType: "audio/mpeg" }),
    ] });
    renderEditor(vm);
    const items = Array.from(document.querySelectorAll(".media-picker-item"));
    expect(items.map((item) => item.querySelector("img")?.getAttribute("src") ?? item.querySelector(".media-content-editor__picker-icon")?.tagName))
      .toEqual(["/m/photo", "SPAN", "SPAN"]);
  });

  it("toggles, cancels and confirms picks", () => {
    const { vm, calls } = fakeController({ picker: "items", pickable: [asset("photo")], picked: ["photo"] });
    renderEditor(vm);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add selected" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    // The buttons hand their click event straight to the controller, so compare the actions only.
    expect(calls.map(([name]) => name)).toEqual(["togglePicked", "confirmPicker", "cancelPicker"]);
    expect(calls[0]).toEqual(["togglePicked", "photo"]);
  });
});
