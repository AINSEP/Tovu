import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { NodeViewProps } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminMedia } from "../api";
import { MediaImage, MediaImageNodeView } from "../media-image-extension";

/**
 * @file First test file for `media-image-extension.tsx` (0% before this pass — no test file
 * existed at all). Structured the same two-tier way `widget-embed-extension.unit.test.tsx` covers
 * its own TipTap node (that file's header explains the split; mirrored here):
 * - `MediaImageNodeView` (exported for this reason) — a plain React component once given fake
 *   `NodeViewProps`, so the REF/LEGACY/broken-ref branches and the Replace/Remove actions are all
 *   asserted directly, no `Editor` involved.
 * - `MediaImage` itself — a real `@tiptap/core` `Editor` (StarterKit + this extension), so
 *   `addAttributes` is proven through the actual TipTap pipeline.
 *
 * `MediaImageInsertControl` had its own third tier in the reference file's shape, but this file's
 * insert control was dead code (zero callers, superseded by `EmbedInsertControl`) and was deleted
 * in the same pass that added this suite — see this file's own former header/git history, not
 * reproduced here.
 */

function media(overrides: Partial<AdminMedia> = {}): AdminMedia {
  return {
    id: "asset-1",
    workspaceId: "w1",
    title: "Dune",
    slug: "dune",
    alt: "Sand dunes at dusk",
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
    publicUrl: null,
    ...overrides,
  };
}

function fakeNodeViewProps(
  attrs: { assetId?: string; transformName?: string; src?: string; alt?: string; title?: string },
  overrides: Partial<NodeViewProps> = {},
): NodeViewProps {
  return {
    node: { attrs } as unknown as NodeViewProps["node"],
    deleteNode: vi.fn(),
    updateAttributes: vi.fn(),
    ...overrides,
  } as unknown as NodeViewProps;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MediaImageNodeView", () => {
  it("REF branch: renders the live api.mediaOriginalUrl(assetId) preview, not a stored src", () => {
    render(<MediaImageNodeView {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public", alt: "Dune" })} />);

    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toContain(api.mediaOriginalUrl("asset-1"));
    expect(img).toHaveAttribute("alt", "Dune");
    expect(screen.queryByLabelText("Broken image reference")).not.toBeInTheDocument();
  });

  it("LEGACY branch: renders attrs.src directly when there is no assetId/transformName", () => {
    render(<MediaImageNodeView {...fakeNodeViewProps({ src: "https://example.com/legacy.png", alt: "Legacy" })} />);

    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toBe("https://example.com/legacy.png");
  });

  it("REF wins over LEGACY when both assetId/transformName and src are present", () => {
    // Not a reachable combination through `replaceWith` (see this file's other tests — it always
    // nulls out `src`), but the component's own branch order should still favor
    // the ref, since a stray legacy `src` is exactly what ADR-027 §4 says must never win.
    render(
      <MediaImageNodeView
        {...fakeNodeViewProps({
          assetId: "asset-1",
          transformName: "public",
          src: "https://example.com/stale.png",
          alt: "Dune",
        })}
      />,
    );

    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toContain(api.mediaOriginalUrl("asset-1"));
  });

  it("broken-ref branch: neither assetId/transformName nor src renders the unavailable label, no real <img>", () => {
    const { container } = render(<MediaImageNodeView {...fakeNodeViewProps({})} />);

    // The broken-label `<span>` itself carries `role="img"` (existing component behavior, unchanged
    // here), so it's excluded by tag rather than by role.
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByLabelText("Broken image reference")).toHaveTextContent("⚠ Image unavailable");
  });

  it("an assetId with no transformName (or vice versa) is not a complete ref — falls back to broken", () => {
    render(<MediaImageNodeView {...fakeNodeViewProps({ assetId: "asset-1" })} />);
    expect(screen.getByLabelText("Broken image reference")).toBeInTheDocument();
  });

  it("Remove calls deleteNode", async () => {
    const user = userEvent.setup();
    const deleteNode = vi.fn();
    render(<MediaImageNodeView {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public" }, { deleteNode })} />);

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(deleteNode).toHaveBeenCalledTimes(1);
  });

  describe("Replace flow", () => {
    it("opens the media picker dialog and, on selection, updates the node to the new ref and clears the legacy fields", async () => {
      const user = userEvent.setup();
      const updateAttributes = vi.fn();
      // Spies on `api.listMedia` directly rather than stubbing `fetch` — `MediaImageNodeView` renders
      // the real `MediaPickerDialog` without forwarding its own `useDialog` injection seam (it has no
      // seam of its own to plumb one through), so this is the same "spy on the api boundary" pattern
      // `MediaPickerDialog.unit.test.tsx` and `WidgetConfigFields.unit.test.tsx` already use, not a
      // raw network stub.
      // `alt: ""` on the picked asset — exercises `replaceWith`'s `item.alt || item.title` fallback,
      // rather than masking it with a truthy alt that would pass either way.
      vi.spyOn(api, "listMedia").mockResolvedValue({ media: [media({ id: "asset-2", title: "New pick", alt: "" })] });
      render(
        <MediaImageNodeView
          {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public", alt: "Old" }, { updateAttributes })}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Replace" }));
      await user.click(await screen.findByTitle("New pick"));

      expect(updateAttributes).toHaveBeenCalledWith({
        assetId: "asset-2",
        transformName: "public",
        alt: "New pick",
        src: null,
        title: null,
      });
    });

    it("closes the dialog on cancel without updating anything", async () => {
      const user = userEvent.setup();
      const updateAttributes = vi.fn();
      vi.spyOn(api, "listMedia").mockResolvedValue({ media: [] });
      render(
        <MediaImageNodeView
          {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public" }, { updateAttributes })}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Replace" }));
      await screen.findByRole("dialog");
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(updateAttributes).not.toHaveBeenCalled();
    });
  });
});

describe("MediaImage — real @tiptap/core Editor integration", () => {
  function newEditor() {
    return new Editor({ extensions: [StarterKit, MediaImage], content: "<p>hello</p>" });
  }

  it("addAttributes: assetId/transformName default to null for a plain legacy setImage insert", () => {
    const editor = newEditor();
    try {
      editor.commands.setImage({ src: "https://example.com/legacy.png", alt: "Legacy" });
      const json = editor.getJSON();
      const imageNode = json.content?.find((n) => n.type === "image" && n.attrs?.src === "https://example.com/legacy.png");

      expect(imageNode?.attrs?.assetId ?? null).toBeNull();
      expect(imageNode?.attrs?.transformName ?? null).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});
