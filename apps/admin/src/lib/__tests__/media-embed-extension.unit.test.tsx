import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { NodeViewProps } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminMedia } from "../api";
import { Media, MediaEmbedNodeView } from "../media-embed-extension";

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
 * server round trip and no stored content-type hint to read (see the file header's own explanation
 * of why), so its ONLY source of truth for which tag to show is the `<video>` element's own
 * `error` event — these tests are what proves that client-side probe actually works, in both
 * directions, not just that the component compiles.
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

afterEach(() => {
  vi.restoreAllMocks();
  adminLocale.current = "en";
});

describe("MediaEmbedNodeView", () => {
  it("resolved ref: renders a <video> against api.mediaOriginalUrl(assetId) FIRST, before any error — the video-first probe this file's header describes", () => {
    const { container } = render(
      <MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public", alt: "Rocket launch" })} />
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.src).toContain(api.mediaOriginalUrl("asset-1"));
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveTextContent("Rocket launch");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByLabelText("Broken media reference")).not.toBeInTheDocument();
  });

  it("video fallback text defaults when alt is empty", () => {
    const { container } = render(<MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-1", transformName: "public" })} />);
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).toHaveTextContent("Your browser does not support the video tag.");
  });

  it("resolved ref whose asset is actually an IMAGE: the <video> element's own error event flips the preview to a real <img>, same src, never stuck on a broken video element", () => {
    const { container } = render(
      <MediaEmbedNodeView {...fakeNodeViewProps({ assetId: "asset-2", transformName: "public", alt: "A photo" })} />
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    fireEvent.error(video);

    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain(api.mediaOriginalUrl("asset-2"));
    expect(img).toHaveAttribute("alt", "A photo");
    expect(container.querySelector("video")).toBeNull();
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
});
