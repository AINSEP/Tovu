import { render, screen } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import { PostEditor } from "../PostEditor";
import { PostPreview } from "../editor/preview/PostPreview";
import type { useWiredPostEditor } from "../hooks/use-post-editor.hooks";
import type { usePostEditorScreen } from "../hooks/use-post-editor-screen.hooks";

/**
 * @file The two hooks `PostEditor` and `PostPreview` call are props defaulted to the real hook (owner rule:
 * custom hooks a component uses are injected). Each test hands the component a FAKE hook and asserts what
 * the component renders from what that fake returned, and what it passed in, so the seam is proven to be
 * the one the component actually reads.
 */

const t = (key: string): string => key;

describe("PostEditor — usePostEditorScreenHook", () => {
  it("renders the loading notice from the injected screen, and forwards postId and the controller hook", () => {
    const usePostEditorHook = vi.fn() as unknown as typeof useWiredPostEditor;
    const usePostEditorScreenHook = vi.fn<typeof usePostEditorScreen>(() => ({ status: "loading", t: (key: string) => `fake:${key}` }));

    render(<PostEditor postId="p-42" usePostEditorHook={usePostEditorHook} usePostEditorScreenHook={usePostEditorScreenHook} />);

    expect(screen.getByText("fake:Loading editor…")).toHaveClass("notice");
    expect(usePostEditorScreenHook).toHaveBeenCalledTimes(1);
    expect(usePostEditorScreenHook).toHaveBeenCalledWith({ postId: "p-42", usePostEditorHook });
  });

  it("renders the error from the injected screen as an error notice", () => {
    const usePostEditorScreenHook = vi.fn<typeof usePostEditorScreen>(() => ({ status: "error", error: "The post could not be loaded." }));

    render(<PostEditor postId="p-1" usePostEditorScreenHook={usePostEditorScreenHook} />);

    expect(screen.getByText("The post could not be loaded.")).toHaveClass("notice", "error");
  });
});

describe("PostPreview — usePostPreviewSourceHook", () => {
  const props = {
    postId: "p-7", bodyJson: null, slug: "hello", status: "draft" as const, scheduled: false, dirty: false, contentDirty: false,
    templatePreviewUrl: "/admin/posts/p-7/template-preview", previewFormRef: () => undefined, previewFormTarget: "post-preview-frame",
    width: 800, expanded: false, onToggleExpanded: () => undefined, t,
  };

  it("shows the template-preview frame when the injected source says only that surface is available", () => {
    const usePostPreviewSourceHook = vi.fn(() => ({ canShowLiveSite: false, canShowTemplatePreview: true, frameRef: () => undefined, paneWidth: 640 }));

    render(<PostPreview {...props} usePostPreviewSourceHook={usePostPreviewSourceHook} />);

    expect(screen.getByTitle("Post preview")).toHaveAttribute("src", expect.stringContaining("/admin/posts/p-7/template-preview"));
    expect(usePostPreviewSourceHook).toHaveBeenCalledWith({ status: "draft", scheduled: false, dirty: false, contentDirty: false });
  });

  it("shows the save-first notice, whatever the injected source says, for a post with no id", () => {
    const usePostPreviewSourceHook = vi.fn(() => ({ canShowLiveSite: true, canShowTemplatePreview: true, frameRef: () => undefined, paneWidth: 640 }));

    render(<PostPreview {...props} postId="" usePostPreviewSourceHook={usePostPreviewSourceHook} />);

    expect(screen.getByRole("status")).toHaveTextContent("Save this post to preview it.");
    expect(screen.queryByTitle("Post preview")).toBeNull();
  });
});
