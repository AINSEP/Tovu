import { act, renderHook, waitFor } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import { describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { mediaPreviewKind, readMediaEmbedAttrs, useMediaEmbedNodeView } from "../media-embed-extension.hooks";

/**
 * @file `useMediaEmbedNodeView` — the `media` node view's attr reads, dialog toggles, video-probe
 * state and handlers, driven with `renderHook`. `media-embed-extension.unit.test.tsx` covers the
 * same behavior through the rendered component.
 */

function fakeProps(attrs: Record<string, unknown>) {
  const updateAttributes = vi.fn();
  const deleteNode = vi.fn();
  const props = { node: { attrs }, updateAttributes, deleteNode } as unknown as NodeViewProps;
  return { props, updateAttributes, deleteNode };
}

const imageType = vi.fn(async (_assetId: string) => "image/png");
function deps(locale: string, contentTypeOf: (assetId: string) => Promise<string> = imageType) {
  return { locale, contentTypeOf };
}

describe("mediaPreviewKind", () => {
  it("video/* is a video; images, octet-stream and a failed lookup ('') are images", () => {
    expect(mediaPreviewKind("video/mp4")).toBe("video");
    expect(mediaPreviewKind("Video/WebM; codecs=vp9")).toBe("video");
    expect(mediaPreviewKind("image/png")).toBe("image");
    expect(mediaPreviewKind("application/octet-stream")).toBe("image");
    expect(mediaPreviewKind("")).toBe("image");
  });
});

describe("readMediaEmbedAttrs", () => {
  it("reads string attrs through unchanged", () => {
    expect(
      readMediaEmbedAttrs({ assetId: "a1", transformName: "public", alt: "A cat", cssClass: "hero", htmlAttributes: 'data-kui="x"' })
    ).toEqual({ assetId: "a1", transformName: "public", alt: "A cat", cssClass: "hero", htmlAttributes: 'data-kui="x"' });
  });

  it("normalizes missing or non-string attrs: ref fields and alt to '', style overrides to null", () => {
    expect(readMediaEmbedAttrs({ assetId: 42, transformName: null, alt: undefined, cssClass: 7, htmlAttributes: {} })).toEqual({
      assetId: "",
      transformName: "",
      alt: "",
      cssClass: null,
      htmlAttributes: null,
    });
  });
});

describe("useMediaEmbedNodeView", () => {
  it("a complete ref previews api.mediaOriginalUrl(assetId); an incomplete one previews nothing", () => {
    const complete = renderHook(() => useMediaEmbedNodeView(fakeProps({ assetId: "a1", transformName: "public" }).props, deps("en")));
    expect(complete.result.current.previewSrc).toBe(api.mediaOriginalUrl("a1"));

    const incomplete = renderHook(() => useMediaEmbedNodeView(fakeProps({ assetId: "a1" }).props, deps("en")));
    expect(incomplete.result.current.previewSrc).toBe("");
  });

  it("seeds the Edit dialog from the node's current alt/cssClass/htmlAttributes", () => {
    const { result } = renderHook(() =>
      useMediaEmbedNodeView(fakeProps({ assetId: "a1", transformName: "public", alt: "A cat", cssClass: "hero" }).props, deps("en"))
    );
    expect(result.current.editInitial).toEqual({ alt: "A cat", cssClass: "hero", htmlAttributes: null });
  });

  it("previewKind is pending until the content type resolves, then follows it; a failed lookup previews as an image", async () => {
    const video = renderHook(() =>
      useMediaEmbedNodeView(fakeProps({ assetId: "v1", transformName: "public" }).props, deps("en", async () => "video/mp4"))
    );
    expect(video.result.current.previewKind).toBe("pending");
    await waitFor(() => expect(video.result.current.previewKind).toBe("video"));

    const failed = renderHook(() =>
      useMediaEmbedNodeView(fakeProps({ assetId: "x1", transformName: "public" }).props, deps("en", () => Promise.reject(new Error("offline"))))
    );
    await waitFor(() => expect(failed.result.current.previewKind).toBe("image"));
  });

  it("an incomplete ref never looks up a content type", () => {
    const contentTypeOf = vi.fn(async () => "image/png");
    renderHook(() => useMediaEmbedNodeView(fakeProps({ assetId: "a1" }).props, deps("en", contentTypeOf)));
    expect(contentTypeOf).not.toHaveBeenCalled();
  });

  it("Replace writes the picked ref and closes the picker; the new asset's kind is looked up afresh", async () => {
    const contentTypeOf = vi.fn(async (id: string) => (id === "a2" ? "video/mp4" : "image/png"));
    const initial = fakeProps({ assetId: "a1", transformName: "public" });
    const { result, rerender } = renderHook((p: NodeViewProps) => useMediaEmbedNodeView(p, deps("en", contentTypeOf)), {
      initialProps: initial.props,
    });
    await waitFor(() => expect(result.current.previewKind).toBe("image"));

    act(() => result.current.openPicker());
    expect(result.current.picking).toBe(true);
    act(() => result.current.replaceWith({ id: "a2", alt: "", title: "New pick" }));
    expect(initial.updateAttributes).toHaveBeenCalledWith({ assetId: "a2", transformName: "public", alt: "New pick" });
    expect(result.current.picking).toBe(false);

    rerender(fakeProps({ assetId: "a2", transformName: "public" }).props);
    expect(result.current.previewKind).toBe("pending");
    await waitFor(() => expect(result.current.previewKind).toBe("video"));
    expect(contentTypeOf).toHaveBeenLastCalledWith("a2");
  });

  it("Save in the Edit dialog writes all three fields and closes it", () => {
    const { props, updateAttributes } = fakeProps({ assetId: "a1", transformName: "public" });
    const { result } = renderHook(() => useMediaEmbedNodeView(props, deps("en")));

    act(() => result.current.openEdit());
    expect(result.current.editing).toBe(true);
    act(() => result.current.saveEdit({ alt: "A cat", cssClass: null, htmlAttributes: "muted" }));

    expect(updateAttributes).toHaveBeenCalledWith({ alt: "A cat", cssClass: null, htmlAttributes: "muted" });
    expect(result.current.editing).toBe(false);
  });

  it("closeEdit and closePicker close without writing; remove deletes the node", () => {
    const { props, updateAttributes, deleteNode } = fakeProps({ assetId: "a1", transformName: "public" });
    const { result } = renderHook(() => useMediaEmbedNodeView(props, deps("en")));

    act(() => result.current.openEdit());
    act(() => result.current.closeEdit());
    act(() => result.current.openPicker());
    act(() => result.current.closePicker());
    expect(result.current.editing).toBe(false);
    expect(result.current.picking).toBe(false);
    expect(updateAttributes).not.toHaveBeenCalled();

    act(() => result.current.remove());
    expect(deleteNode).toHaveBeenCalledTimes(1);
  });

  it("t translates the node view's copy for deps.locale", () => {
    const { result } = renderHook(() => useMediaEmbedNodeView(fakeProps({}).props, deps("es")));
    expect(result.current.t("Edit")).toBe("Editar");
    expect(result.current.t("Replace")).toBe("Reemplazar");
    expect(result.current.t("Remove")).toBe("Quitar");
    expect(result.current.t("Media unavailable")).toBe("Contenido multimedia no disponible");
    expect(result.current.t("Broken media reference")).toBe("Referencia multimedia rota");
  });
});
