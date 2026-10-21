import { act, fireEvent, render, screen, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@/lib/api";
import { createFakePostEditorPort } from "../hooks/post-editor-dependencies.hooks";
import { usePostEditor, type PostEditorController } from "../hooks/use-post-editor.hooks";
import { usePostFeaturedImage } from "../hooks/use-post-featured-image.hooks";
import { PostSettingsDialog } from "../PostSettingsDialog";
import { PostCoverImage } from "../PostCoverImage";
import { showsCoverImageSlot, showsHideCoverInBodyToggle } from "../rules";

/**
 * @file The cover image above the title node (owner, 2026-10-10): the slot's eligibility rule, its
 * empty/set/unavailable states, and that it edits `usePostEditor`'s `featuredMediaId` — a change
 * there shows here, and Remove marks the post dirty. Since 2026-10-11 it is the only featured-image
 * control (the settings modal's Image tab is gone) and carries "Hide the cover image in the body".
 */

const fakeT = (key: string): string => key;
type FakePostEditorPort = ReturnType<typeof createFakePostEditorPort>;

const fakePicker = (overrides: Partial<ReturnType<typeof usePostFeaturedImage>> = {}) => () => ({
  pickerOpen: false,
  openPicker: vi.fn(),
  closePicker: vi.fn(),
  handleSelect: vi.fn(),
  clear: vi.fn(),
  previewUrl: null,
  accept: ["image/*"],
  previewFailed: false,
  onPreviewError: vi.fn(),
  ...overrides,
});

/** The props every `PostCoverImage` render needs besides the ones a test is about. */
const toggleProps = { kind: "post" as const, hideCoverImageInBody: true, setHideCoverImageInBody: vi.fn() };

afterEach(() => {
  localStorage.clear();
});

describe("showsCoverImageSlot", () => {
  it("shows for a TipTap body (or no format recorded), never for an html page", () => {
    expect(showsCoverImageSlot("doc")).toBe(true);
    expect(showsCoverImageSlot(undefined)).toBe(true);
    expect(showsCoverImageSlot("html")).toBe(false);
  });
});

describe("showsHideCoverInBodyToggle", () => {
  it("posts carry the toggle, pages do not", () => {
    expect(showsHideCoverInBodyToggle("post")).toBe(true);
    expect(showsHideCoverInBodyToggle("page")).toBe(false);
  });
});

describe("PostCoverImage", () => {
  it("empty: one Add cover image button that opens the picker, and no image", () => {
    const openPicker = vi.fn();
    const { container } = render(<PostCoverImage {...toggleProps} bodyFormat="doc" featuredMediaId={null} setFeaturedMediaId={vi.fn()} t={fakeT} useFeaturedImage={fakePicker({ openPicker })} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    const add = screen.getByRole("button", { name: "Add cover image" });
    expect(container.innerHTML).toContain("post-cover-add");
    fireEvent.click(add);
    expect(openPicker).toHaveBeenCalledTimes(1);
  });

  it("set: the image plus Change (opens the picker) and Remove (clears)", () => {
    const openPicker = vi.fn();
    const clear = vi.fn();
    const { container } = render(
      <PostCoverImage {...toggleProps} bodyFormat="doc" featuredMediaId="m1" setFeaturedMediaId={vi.fn()} t={fakeT} useFeaturedImage={fakePicker({ openPicker, clear, previewUrl: "/media/m1" })} />,
    );
    expect(screen.getByRole("img", { name: "Cover image" }).getAttribute("src")).toBe("/media/m1");
    expect(screen.queryByRole("button", { name: "Add cover image" })).toBeNull();
    expect(container.innerHTML).toContain("post-cover-change");
    expect(container.innerHTML).toContain("post-cover-remove");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(openPicker).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("an open picker shows the media library dialog, and its Cancel closes the picker", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ media: [], data: [] }), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const closePicker = vi.fn();
      render(<PostCoverImage {...toggleProps} bodyFormat="doc" featuredMediaId={null} setFeaturedMediaId={vi.fn()} t={fakeT} useFeaturedImage={fakePicker({ pickerOpen: true, closePicker })} />);
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
      expect(closePicker).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("an image that will not load shows the unavailable placeholder and keeps Change/Remove", () => {
    render(
      <PostCoverImage {...toggleProps} bodyFormat="doc" featuredMediaId="m-gone" setFeaturedMediaId={vi.fn()} t={fakeT} useFeaturedImage={fakePicker({ previewUrl: "/media/m-gone", previewFailed: true })} />,
    );
    expect(screen.queryByRole("img", { name: "Cover image" })).toBeNull();
    const placeholder = screen.getByRole("img", { name: "Cover image unavailable" });
    expect(placeholder.tagName).toBe("SPAN");
    expect(placeholder.className).toContain("editor-featured-preview-missing");
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  });

  it("a broken image reports through onPreviewError", () => {
    const onPreviewError = vi.fn();
    render(
      <PostCoverImage {...toggleProps} bodyFormat="doc" featuredMediaId="m1" setFeaturedMediaId={vi.fn()} t={fakeT} useFeaturedImage={fakePicker({ previewUrl: "/media/m1", onPreviewError })} />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Cover image" }));
    expect(onPreviewError).toHaveBeenCalled();
  });

  it("renders nothing for an html page", () => {
    const { container } = render(
      <PostCoverImage {...toggleProps} bodyFormat="html" featuredMediaId="m1" setFeaturedMediaId={vi.fn()} t={fakeT} useFeaturedImage={fakePicker({ previewUrl: "/media/m1" })} />,
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("PostCoverImage edits usePostEditor's featuredMediaId and hideCoverImageInBody", () => {
  const POST: AdminPost = {
    id: "p1",
    workspaceId: "ws1",
    kind: "post",
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }] },
    bodyFormat: "doc",
    status: "draft",
    templateChoice: null,
    overridesThemePage: false,
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 3,
    featuredMediaId: "m1",
  };
  const mediaPort = { mediaOriginalUrl: (id: string) => `/media/${id}` };
  const useTestPicker = (value: string | null, onChange: (id: string | null) => void) => usePostFeaturedImage(value, onChange, { port: mediaPort });

  function Harness({ port, onController }: { port: FakePostEditorPort; onController: (c: PostEditorController) => void }) {
    const controller = usePostEditor("p1", { port, navigate: vi.fn(), t: fakeT });
    onController(controller);
    return (
      <PostCoverImage
        bodyFormat="doc"
        featuredMediaId={controller.featuredMediaId}
        setFeaturedMediaId={controller.setFeaturedMediaId}
        kind="post"
        hideCoverImageInBody={controller.hideCoverImageInBody}
        setHideCoverImageInBody={controller.setHideCoverImageInBody}
        t={fakeT}
        useFeaturedImage={useTestPicker}
      />
    );
  }

  it("Remove on the cover clears featuredMediaId and marks the post dirty; Save sends null", async () => {
    const port = createFakePostEditorPort({ post: POST });
    let controller: PostEditorController | null = null;
    render(<Harness port={port} onController={(c) => (controller = c)} />);
    await waitFor(() => expect(controller?.editor).not.toBeNull());
    await waitFor(() => expect(controller?.featuredMediaId).toBe("m1"));
    expect(controller!.dirty).toBe(false);
    expect(screen.getByRole("img", { name: "Cover image" }).getAttribute("src")).toBe("/media/m1");

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(controller!.featuredMediaId).toBeNull());
    expect(controller!.dirty).toBe(true);
    expect(screen.getByRole("button", { name: "Add cover image" })).toBeTruthy();

    await act(async () => {
      await controller!.save();
    });
    expect(port.updatePostCalls[0]).toMatchObject({ featuredMediaId: null });
  });

  it("a featuredMediaId change from elsewhere shows on the cover", async () => {
    const port = createFakePostEditorPort({ post: { ...POST, featuredMediaId: null } });
    let controller: PostEditorController | null = null;
    render(<Harness port={port} onController={(c) => (controller = c)} />);
    await waitFor(() => expect(controller?.editor).not.toBeNull());
    await waitFor(() => expect(controller?.post).not.toBeNull());
    expect(screen.getByRole("button", { name: "Add cover image" })).toBeTruthy();

    act(() => controller!.setFeaturedMediaId("m9"));
    expect(screen.getByRole("img", { name: "Cover image" }).getAttribute("src")).toBe("/media/m9");
    expect(controller!.dirty).toBe(true);
  });

  it("the toggle under the slot starts checked, unchecking it marks the post dirty, and Save sends false", async () => {
    const port = createFakePostEditorPort({ post: POST });
    let controller: PostEditorController | null = null;
    render(<Harness port={port} onController={(c) => (controller = c)} />);
    await waitFor(() => expect(controller?.editor).not.toBeNull());
    await waitFor(() => expect(controller?.post).not.toBeNull());
    const toggle = screen.getByRole("checkbox", { name: "Hide the cover image in the body" });
    expect(toggle).toBeChecked();
    expect(controller!.dirty).toBe(false);

    fireEvent.click(toggle);
    await waitFor(() => expect(controller!.hideCoverImageInBody).toBe(false));
    expect(controller!.dirty).toBe(true);
    await act(async () => {
      await controller!.save();
    });
    expect(port.updatePostCalls[0]).toMatchObject({ hideCoverImageInBody: false });
  });
});

describe("Hide the cover image in the body, under the cover slot (owner, 2026-10-11)", () => {
  it("posts show it with or without a cover, explained by an ⓘ; pages do not", () => {
    const setHideCoverImageInBody = vi.fn();
    const props = { bodyFormat: "doc" as const, featuredMediaId: null, setFeaturedMediaId: vi.fn(), hideCoverImageInBody: true, setHideCoverImageInBody, t: fakeT, useFeaturedImage: fakePicker() };
    const view = render(<PostCoverImage {...props} kind="post" />);
    const toggle = screen.getByRole("checkbox", { name: "Hide the cover image in the body" });
    expect(toggle).toBeChecked();
    expect(screen.getAllByText("Applies when the cover comes from the first image in the post").length).toBeGreaterThan(0);
    fireEvent.click(toggle);
    expect(setHideCoverImageInBody).toHaveBeenCalledWith(false);
    view.rerender(<PostCoverImage {...props} kind="post" featuredMediaId="m1" useFeaturedImage={fakePicker({ previewUrl: "/media/m1" })} />);
    expect(screen.getByRole("checkbox", { name: "Hide the cover image in the body" })).toBeTruthy();
    view.rerender(<PostCoverImage {...props} kind="page" />);
    expect(screen.queryByRole("checkbox", { name: "Hide the cover image in the body" })).toBeNull();
  });

  it("the settings modal has no Image tab any more", () => {
    render(
      <PostSettingsDialog
        dialog={{ open: true, tab: "author", setTab: vi.fn(), openDialog: vi.fn(), closeDialog: vi.fn() }}
        kindLabel="post"
        author=""
        setAuthor={vi.fn()}
        showAuthor={false}
        setShowAuthor={vi.fn()}
        publishAtInput=""
        setPublishAtInput={vi.fn()}
        scheduled={false}
        t={fakeT}
      />,
    );
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Author", "Publish"]);
    expect(screen.queryByRole("checkbox", { name: "Hide the cover image in the body" })).toBeNull();
  });
});
