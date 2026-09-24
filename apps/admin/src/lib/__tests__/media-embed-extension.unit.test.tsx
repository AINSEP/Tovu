import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import type { NodeViewProps } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type AdminMedia } from "../api";
import { Media, MediaEmbedNodeView } from "../media-embed-extension";
import { PostTitle, PostTitleDocument } from "../post-title-extension";

/**
 * @file First test file for `media-embed-extension.tsx` (new file, 2026-09-11 — the generic `media`
 * doc node; see that file's own header for the full "one node, dispatch by content type" reasoning
 * this pins). Structured the same two-tier way `media-image-extension.unit.test.tsx` covers its own
 * sibling node (mirrored here on purpose, since both nodes share the REF-only insert/replace shape):
 * - `MediaEmbedNodeView` (exported for this reason) — a plain React component once given fake
 *   `NodeViewProps`, so the broken-ref, video-preview, image-fallback, and Replace/Remove branches
 *   are all asserted directly, no `Editor` involved.
 * - `Media` itself — a real `@tiptap/core` `Editor` (StarterKit + this extension), so
 *   `addAttributes`/`addCommands`/the node NAME are proven through the actual TipTap pipeline.
 *
 * The two highest-value tests below are the video/image dispatch pair: `MediaEmbedNodeView` has no
 * stored content-type hint to read (see the file header's own explanation of why), so it asks the
 * asset's `/original` route for its real `Content-Type` (`api.mediaContentType`, stubbed here) —
 * these tests prove an image previews as `<img>` and a video as `<video>`, not just that the
 * component compiles.
 */

const adminLocale = vi.hoisted(() => ({ current: "en" }));
vi.mock("../../hooks/use-admin-locale.hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../hooks/use-admin-locale.hooks")>()),
  useAdminLocale: () => adminLocale.current,
}));

function media(overrides: Partial<AdminMedia> = {}): AdminMedia {
  return {
    id: "asset-1",
    workspaceId: "w1",
    title: "Launch clip",
    slug: "launch-clip",
    alt: "Rocket launch",
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
    contentType: "video/mp4",
    publicUrl: null,
    ...overrides,
  };
}

function fakeNodeViewProps(
  attrs: { assetId?: string; transformName?: string; alt?: string; cssClass?: string; htmlAttributes?: string },
  overrides: Partial<NodeViewProps> = {}
): NodeViewProps {
  return {
    node: { attrs } as unknown as NodeViewProps["node"],
    deleteNode: vi.fn(),
    updateAttributes: vi.fn(),
    ...overrides,
  } as unknown as NodeViewProps;
}

// Every rendered node view asks for its asset's content type; tests that care override this.
beforeEach(() => {
  vi.spyOn(api, "mediaContentType").mockResolvedValue("image/png");
});

afterEach(() => {
  vi.restoreAllMocks();
  adminLocale.current = "en";
});

describe("MediaEmbedNodeView", () => {
  it("resolved ref whose asset is a VIDEO (Content-Type video/*): previews as a <video> against api.mediaOriginalUrl(assetId)", async () => {
    const contentType = vi.spyOn(api, "mediaContentType").mockResolvedValue("video/mp4");
    const { container } = render(
      <MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public", alt: "Rocket launch" })} />
    );

    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(contentType).toHaveBeenCalledWith("asset-1");
    expect(video.src).toContain(api.mediaOriginalUrl("asset-1"));
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveTextContent("Rocket launch");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByLabelText("Broken media reference")).not.toBeInTheDocument();
  });

  it("video fallback text defaults when alt is empty", async () => {
    vi.spyOn(api, "mediaContentType").mockResolvedValue("video/webm");
    const { container } = render(<MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public" })} />);
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    expect(container.querySelector("video")).toHaveTextContent("Your browser does not support the video tag.");
  });

  it("resolved ref whose asset is an IMAGE (Content-Type image/png): previews as an <img> with no event needed — never an empty <video> player (Chrome fires no error for an image src on <video>)", async () => {
    vi.spyOn(api, "mediaContentType").mockResolvedValue("image/png");
    const { container } = render(
      <MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-2", transformName: "public", alt: "A photo" })} />
    );

    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.src).toContain(api.mediaOriginalUrl("asset-2"));
    expect(img).toHaveAttribute("alt", "A photo");
    expect(container.querySelector("video")).toBeNull();
  });

  it("before the content type resolves, neither a <video> nor an <img> is rendered", () => {
    vi.spyOn(api, "mediaContentType").mockReturnValue(new Promise(() => {}));
    const { container } = render(<MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-2", transformName: "public" })} />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("broken-ref branch: neither assetId nor transformName renders the unavailable label, no <video> and no <img>", () => {
    const { container } = render(<MediaEmbedNodeView {...fakeNodeViewProps({})} />);

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByLabelText("Broken media reference")).toHaveTextContent("⚠ Media unavailable");
  });

  it("an assetId with no transformName (or vice versa) is not a complete ref — falls back to broken", () => {
    render(<MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-1" })} />);
    expect(screen.getByLabelText("Broken media reference")).toBeInTheDocument();
  });

  it("Remove calls deleteNode", async () => {
    const user = userEvent.setup();
    const deleteNode = vi.fn();
    render(<MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public" }, { deleteNode })} />);

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(deleteNode).toHaveBeenCalledTimes(1);
  });

  it("action labels and the broken-ref label render through media-i18n for the admin locale", () => {
    adminLocale.current = "es";
    render(<MediaEmbedNodeView {...fakeNodeViewProps({})} />);

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Editar", "Reemplazar", "Quitar"]);
    expect(screen.getByLabelText("Referencia multimedia rota")).toHaveTextContent("⚠ Contenido multimedia no disponible");
  });

  it("action row order is Edit, Replace, Remove — Edit FIRST per the owner's UI revision", () => {
    render(<MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public" })} />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["Edit", "Replace", "Remove"]);
  });

  describe("Edit flow (2026-09-11, per-post styling; renamed from Style… and widened to alt+cssClass+htmlAttributes)", () => {
    it("opens the edit MODAL pre-filled with the node's current alt/cssClass/htmlAttributes", async () => {
      const user = userEvent.setup();
      render(
        <MediaEmbedNodeView
          {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public", alt: "A cat", cssClass: "hero", htmlAttributes: 'data-kui="x"' })}
        />
      );

      await user.click(screen.getByRole("button", { name: "Edit" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByLabelText("Alt text (optional)")).toHaveValue("A cat");
      expect(screen.getByLabelText("CSS class (optional)")).toHaveValue("hero");
      expect(screen.getByLabelText("HTML attributes (optional)")).toHaveValue('data-kui="x"');
    });

    it("Save calls updateAttributes with the new alt/cssClass/htmlAttributes and closes the dialog", async () => {
      const user = userEvent.setup();
      const updateAttributes = vi.fn();
      render(
        <MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public" }, { updateAttributes })} />
      );

      await user.click(screen.getByRole("button", { name: "Edit" }));
      await user.type(screen.getByLabelText("Alt text (optional)"), "A cat");
      await user.type(screen.getByLabelText("CSS class (optional)"), "float-right");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(updateAttributes).toHaveBeenCalledWith({ alt: "A cat", cssClass: "float-right", htmlAttributes: null });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Cancel closes the dialog without updating anything", async () => {
      const user = userEvent.setup();
      const updateAttributes = vi.fn();
      render(
        <MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public" }, { updateAttributes })} />
      );

      await user.click(screen.getByRole("button", { name: "Edit" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(updateAttributes).not.toHaveBeenCalled();
    });
  });

  describe("Replace flow", () => {
    it("opens the media picker dialog and, on selection, updates the node to the new ref — no src, no contentType hint stored", async () => {
      const user = userEvent.setup();
      const updateAttributes = vi.fn();
      // Same "spy on the api boundary" pattern media-image-extension.unit.test.tsx already uses for
      // MediaPickerDialog's own listMedia call, not a raw network stub.
      vi.spyOn(api, "listMedia").mockResolvedValue({ media: [media({ id: "asset-3", title: "New pick", alt: "" })] });
      render(
        <MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public", alt: "Old" }, { updateAttributes })} />
      );

      await user.click(screen.getByRole("button", { name: "Replace" }));
      await user.click(await screen.findByTitle("New pick"));

      expect(updateAttributes).toHaveBeenCalledWith({ assetId: "asset-3", transformName: "public", alt: "New pick" });
    });

    it("closes the dialog on cancel without updating anything", async () => {
      const user = userEvent.setup();
      const updateAttributes = vi.fn();
      vi.spyOn(api, "listMedia").mockResolvedValue({ media: [] });
      render(<MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public" }, { updateAttributes })} />);

      await user.click(screen.getByRole("button", { name: "Replace" }));
      await screen.findByRole("dialog");
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(updateAttributes).not.toHaveBeenCalled();
    });
  });
});

describe("Media — real @tiptap/core Editor integration", () => {
  function newEditor() {
    return new Editor({ extensions: [StarterKit, Media], content: "<p>hello</p>" });
  }

  it("node type is 'media' — render.ts's DOC_NODE_HANDLERS/renderDocMedia dispatch on this exact type string", () => {
    const editor = newEditor();
    try {
      editor.commands.insertMediaEmbed({ assetId: "asset-1", transformName: "public" });
      const json = editor.getJSON();
      const mediaNode = json.content?.find((n) => n.attrs?.assetId === "asset-1");
      expect(mediaNode?.type).toBe("media");
    } finally {
      editor.destroy();
    }
  });

  it("insertMediaEmbed writes only assetId/transformName/alt to bodyJson — no src, no content-type hint of any kind", () => {
    const editor = newEditor();
    try {
      editor.commands.insertMediaEmbed({ assetId: "asset-1", transformName: "public", alt: "Rocket launch" });
      const json = editor.getJSON();
      const mediaNode = json.content?.find((n) => n.attrs?.assetId === "asset-1");

      expect(mediaNode?.attrs?.assetId).toBe("asset-1");
      expect(mediaNode?.attrs?.transformName).toBe("public");
      expect(mediaNode?.attrs?.alt).toBe("Rocket launch");
      // cssClass/htmlAttributes (2026-09-11, per-post styling) are declared node attrs now too — see
      // this file's own header — so they appear here at their default (null), same as every other
      // insert-time-unset attr. Still no src, no content-type hint: the ONLY two shapes this insert
      // ever adds beyond assetId/transformName/alt are the per-post style overrides this task added.
      expect(Object.keys(mediaNode?.attrs ?? {}).sort()).toEqual(["alt", "assetId", "cssClass", "htmlAttributes", "transformName"]);
    } finally {
      editor.destroy();
    }
  });

  it("addAttributes: assetId/transformName/alt/cssClass/htmlAttributes default to null when inserted with no attrs at all", () => {
    const editor = newEditor();
    try {
      editor.commands.insertContent({ type: "media" });
      const json = editor.getJSON();
      const mediaNode = json.content?.find((n) => n.type === "media");

      expect(mediaNode?.attrs?.assetId ?? null).toBeNull();
      expect(mediaNode?.attrs?.transformName ?? null).toBeNull();
      expect(mediaNode?.attrs?.alt ?? null).toBeNull();
      expect(mediaNode?.attrs?.cssClass ?? null).toBeNull();
      expect(mediaNode?.attrs?.htmlAttributes ?? null).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("updateAttributes can set cssClass/htmlAttributes on an already-inserted node — the Edit action's own write path", () => {
    const editor = newEditor();
    try {
      editor.commands.insertMediaEmbed({ assetId: "asset-1", transformName: "public" });
      // Locate the inserted media node's position and update its attrs directly, the same
      // ProseMirror-transaction shape `NodeViewProps.updateAttributes` uses under the hood.
      let mediaPos = -1;
      editor.state.doc.descendants((node, position) => {
        if (node.type.name === "media") mediaPos = position;
      });
      expect(mediaPos).toBeGreaterThanOrEqual(0);
      editor.commands.command(({ tr }) => {
        tr.setNodeMarkup(mediaPos, undefined, {
          assetId: "asset-1",
          transformName: "public",
          alt: null,
          cssClass: "float-right",
          htmlAttributes: 'data-kui="hero"',
        });
        return true;
      });

      const json = editor.getJSON();
      const mediaNode = json.content?.find((n) => n.type === "media");
      expect(mediaNode?.attrs?.cssClass).toBe("float-right");
      expect(mediaNode?.attrs?.htmlAttributes).toBe('data-kui="hero"');
    } finally {
      editor.destroy();
    }
  });

  it("insertMediaEmbed reports success (applied === true)", () => {
    const editor = newEditor();
    try {
      const applied = editor.commands.insertMediaEmbed({ assetId: "asset-1", transformName: "public" });
      expect(applied).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  // 2026-09-14 (q4 visual QA): a second Embed > Media REPLACED the first. `insertContent` leaves a
  // NodeSelection on the atom it just inserted, and the next `insertContent` replaces whatever is
  // selected. See `lib/block-atom-insert.ts`.
  describe("consecutive inserts keep every node", () => {
    function mediaAssetIds(editor: Editor) {
      return (editor.getJSON().content ?? []).filter((n) => n.type === "media").map((n) => n.attrs?.assetId);
    }

    it("two inserts in a row produce two media nodes in order, with a text cursor in a paragraph right after the second", () => {
      const editor = new Editor({ extensions: [StarterKit, Media], content: "<p></p>" });
      try {
        editor.commands.setTextSelection(1);
        editor.commands.insertMediaEmbed({ assetId: "asset-1", transformName: "public" });
        editor.commands.insertMediaEmbed({ assetId: "asset-2", transformName: "public" });

        expect(mediaAssetIds(editor)).toEqual(["asset-1", "asset-2"]);
        const { selection } = editor.state;
        expect(selection).toBeInstanceOf(TextSelection);
        expect(selection.$from.parent.type.name).toBe("paragraph");
        expect(selection.$from.index(0)).toBe(2);
      } finally {
        editor.destroy();
      }
    });

    it("same in the post editor's own `title block+` document, where StarterKit's TrailingNode adds no paragraph", () => {
      const editor = new Editor({
        extensions: [StarterKit.configure({ document: false }), PostTitleDocument, PostTitle, Media],
        content: { type: "doc", content: [{ type: "title" }, { type: "paragraph" }] },
      });
      try {
        editor.commands.setTextSelection(3);
        editor.commands.insertMediaEmbed({ assetId: "asset-1", transformName: "public" });
        editor.commands.insertMediaEmbed({ assetId: "asset-2", transformName: "public" });

        expect(mediaAssetIds(editor)).toEqual(["asset-1", "asset-2"]);
        expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
        expect(editor.state.selection).toBeInstanceOf(TextSelection);
        expect(editor.state.selection.$from.parent).toBe(editor.state.doc.lastChild);
      } finally {
        editor.destroy();
      }
    });

    it("with an existing media node SELECTED, inserting adds the new node after it instead of replacing it", () => {
      const editor = new Editor({
        extensions: [StarterKit, Media],
        content: { type: "doc", content: [{ type: "media", attrs: { assetId: "asset-1", transformName: "public" } }, { type: "paragraph" }] },
      });
      try {
        editor.commands.setNodeSelection(0);
        editor.commands.insertMediaEmbed({ assetId: "asset-2", transformName: "public" });

        expect(mediaAssetIds(editor)).toEqual(["asset-1", "asset-2"]);
      } finally {
        editor.destroy();
      }
    });
  });
});
