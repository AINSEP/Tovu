import { DevicePreviewFrame } from "@jini-ai/admin/shell/components/DevicePreview/DevicePreviewFrame";
import { PAGE_PREVIEW_IFRAME_SANDBOX } from "@jini-ai/admin/pages/page-editor-rules";
import { usePostPreviewIframeEscape } from "@jini-ai/admin/posts/hooks/use-post-editor-ui.hooks";
import { useThemePreviewFrame } from "../../themes/hooks/use-theme-preview-refresh.hooks";
import { createPostEditorRouteKeyStore } from "@jini-ai/admin/posts/post-editor-route-key";
import { render, screen } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import { PostEditor } from "../PostEditor";
import { PostPreview } from "@jini-ai/cms/react/posts/editor/preview/PostPreview";
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

    const routeKeys = createPostEditorRouteKeyStore();
    render(<PostEditor routeKeys={routeKeys} postId="p-42" usePostEditorHook={usePostEditorHook} usePostEditorScreenHook={usePostEditorScreenHook} />);

    expect(screen.getByText("fake:Loading editor…")).toHaveClass("notice");
    expect(usePostEditorScreenHook).toHaveBeenCalledTimes(1);
    expect(usePostEditorScreenHook).toHaveBeenCalledWith({ postId: "p-42", usePostEditorHook: expect.any(Function) });
    // HW3: the forwarded controller hook is the injected one with the host's route-key store bound in.
    const forwarded = usePostEditorScreenHook.mock.calls[0]![0].usePostEditorHook;
    forwarded({ postId: "p-42" });
    expect(usePostEditorHook).toHaveBeenCalledWith({ postId: "p-42", routeKeys }, {});
  });

  it("renders the error from the injected screen as an error notice", () => {
    const usePostEditorScreenHook = vi.fn<typeof usePostEditorScreen>(() => ({ status: "error", error: "The post could not be loaded." }));

    render(<PostEditor routeKeys={createPostEditorRouteKeyStore()} postId="p-1" usePostEditorScreenHook={usePostEditorScreenHook} />);

    expect(screen.getByText("The post could not be loaded.")).toHaveClass("notice", "error");
  });
});

describe("PostPreview — injected preview collaborators", () => {
  const props = {
    DevicePreviewFrame, sandbox: PAGE_PREVIEW_IFRAME_SANDBOX, usePostPreviewIframeEscapeHook: usePostPreviewIframeEscape, useThemePreviewFrameHook: useThemePreviewFrame,
    postId: "p-7", bodyJson: null, slug: "hello", status: "draft" as const, scheduled: false, dirty: false, contentDirty: false,
    templatePreviewUrl: "/admin/posts/p-7/template-preview", previewFormRef: () => undefined, previewFormTarget: "post-preview-frame",
    width: 800, expanded: false, onToggleExpanded: () => undefined, t,
  };

  it("shows the template-preview frame when the injected source says only that surface is available", () => {
    const usePreviewPaneWidthHook = vi.fn(() => ({ frameRef: () => undefined, paneWidth: 640 }));
    const resolvePostPreviewBranches = vi.fn(() => ({ canShowLiveSite: false, canShowTemplatePreview: true, canShowPendingContentPreview: false }));

    render(<PostPreview {...props} usePreviewPaneWidthHook={usePreviewPaneWidthHook} resolvePostPreviewBranches={resolvePostPreviewBranches} />);

    expect(screen.getByTitle("Post preview")).toHaveAttribute("src", expect.stringContaining("/admin/posts/p-7/template-preview"));
    expect(usePreviewPaneWidthHook).toHaveBeenCalledWith();
    expect(resolvePostPreviewBranches).toHaveBeenCalledWith({ status: "draft", scheduled: false, dirty: false, contentDirty: false });
  });

  it("shows the save-first notice, whatever the injected source says, for a post with no id", () => {
    const usePreviewPaneWidthHook = vi.fn(() => ({ frameRef: () => undefined, paneWidth: 640 }));
    const resolvePostPreviewBranches = vi.fn(() => ({ canShowLiveSite: true, canShowTemplatePreview: true, canShowPendingContentPreview: false }));

    render(<PostPreview {...props} postId="" usePreviewPaneWidthHook={usePreviewPaneWidthHook} resolvePostPreviewBranches={resolvePostPreviewBranches} />);

    expect(screen.getByRole("status")).toHaveTextContent("Save this post to preview it.");
    expect(screen.queryByTitle("Post preview")).toBeNull();
  });
});
