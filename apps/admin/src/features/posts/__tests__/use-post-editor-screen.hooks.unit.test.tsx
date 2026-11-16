import { renderHook } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@/lib/api";
import type { PostEditorController } from "../hooks/use-post-editor.hooks";
import { usePostEditorScreen, type PostEditorReadyScreen } from "../hooks/use-post-editor-screen.hooks";

/**
 * @file `usePostEditorScreen` — the wiring half of the `PostEditor` screen: the loading / error / ready
 * contract, the region bundles it hands the root, and that its hook calls are the same on every
 * render (so a loading → ready → loading sequence never changes the hook order). The rendered
 * markup is pinned separately by `PostEditor.dom.characterization.unit.test.tsx`.
 */

const t = (key: string): string => key;

const POST: AdminPost = {
  id: "p1",
  workspaceId: "w1",
  kind: "post",
  title: "Hello world",
  slug: "hello-world",
  bodyJson: { type: "doc", content: [] },
  bodyFormat: "doc",
  status: "draft",
  templateChoice: null,
  overridesThemePage: false,
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

/** Only the fields the bundles read need real values; the rest stay undefined, which the bundles pass through. */
function controller(overrides: Partial<PostEditorController>): PostEditorController {
  return {
    post: POST, error: null, t, view: "edit", setView: vi.fn(), title: "Hello world", slug: "hello-world",
    bodyJson: { type: "doc", content: [] }, status: "draft", ...overrides,
  } as PostEditorController;
}

function render(ctrl: () => PostEditorController) {
  const usePostEditorHook = vi.fn((input: { postId: string }) => { void input; return ctrl(); });
  const utils = renderHook(() => usePostEditorScreen({ postId: "p1", usePostEditorHook }));
  return { ...utils, usePostEditorHook };
}

describe("usePostEditorScreen", () => {
  it("is loading, with the translator, while there is no post and no error", () => {
    const { result } = render(() => controller({ post: null }));
    expect(result.current).toEqual({ status: "loading", t });
  });

  it("is an error when the load failed and there is no post to show", () => {
    const { result } = render(() => controller({ post: null, error: "Failed to load" }));
    expect(result.current).toEqual({ status: "error", error: "Failed to load" });
  });

  it("stays ready when an error arrives while a post is on screen, and carries it to the actions row", () => {
    const { result } = render(() => controller({ error: "Could not save" }));
    expect(result.current.status).toBe("ready");
    expect((result.current as PostEditorReadyScreen).actions.error).toBe("Could not save");
  });

  it("calls the injected controller hook once per render with the postId", () => {
    const { usePostEditorHook, rerender } = render(() => controller({}));
    expect(usePostEditorHook).toHaveBeenCalledTimes(1);
    expect(usePostEditorHook).toHaveBeenCalledWith({ postId: "p1" });
    rerender();
    expect(usePostEditorHook).toHaveBeenCalledTimes(2);
  });

  it("hands the root one bundle per region, with the same keys on every ready render", () => {
    const { result } = render(() => controller({}));
    const ready = result.current as PostEditorReadyScreen;
    expect(Object.keys(ready).sort()).toEqual([
      "actions", "body", "cover", "deleteDialog", "header", "notices", "preview", "savedPanels",
      "settings", "slugCollision", "status", "t", "templateGate", "unchangedSave", "view", "viewBar",
    ]);
  });

  it("derives the kind label and passes the saved identity through", () => {
    const post = renderScreen({ post: POST });
    expect(post.header.kindLabel).toBe("post");
    expect(post.header.post).toBe(POST);
    expect(post.cover.kind).toBe("post");
    const page = renderScreen({ post: { ...POST, kind: "page" } });
    expect(page.header.kindLabel).toBe("page");
    expect(page.actions.kindLabel).toBe("page");
    expect(page.settings.kindLabel).toBe("page");
    expect(page.deleteDialog.kindLabel).toBe("page");
  });

  it("takes the server timestamp for the notices and the post id for the preview and the body", () => {
    const ready = renderScreen({ post: POST });
    expect(ready.notices.serverUpdatedAt).toBe(POST.updatedAt);
    expect(ready.preview.postId).toBe("p1");
    expect(ready.body.currentPostId).toBe("p1");
    expect(ready.savedPanels).toEqual({ post: POST, title: "Hello world", bodyJson: { type: "doc", content: [] } });
  });

  it("wires the settings gear to the settings dialog's own opener, and Save anyway to the unchanged-save dialog", () => {
    const { result } = render(() => controller({ confirmingUnchangedSave: true, saving: true }));
    const ready = result.current as PostEditorReadyScreen;
    expect(ready.actions.onOpenSettings).toBe(ready.settings.dialog.openDialog);
    expect(ready.unchangedSave).toMatchObject({ open: true, pending: true });
  });

  it("passes the controller's setView through to the view bar", () => {
    const setView = vi.fn();
    const { result } = render(() => controller({ setView }));
    expect((result.current as PostEditorReadyScreen).viewBar.setView).toBe(setView);
  });

  it("keeps the hook order across loading → ready → error renders (no 'rendered more hooks')", () => {
    let current: Partial<PostEditorController> = { post: null };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, rerender } = render(() => controller(current));
    expect(result.current.status).toBe("loading");
    current = { post: POST };
    rerender();
    expect(result.current.status).toBe("ready");
    current = { post: null, error: "gone" };
    rerender();
    expect(result.current.status).toBe("error");
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

function renderScreen(overrides: Partial<PostEditorController>): PostEditorReadyScreen {
  const { result } = render(() => controller(overrides));
  return result.current as PostEditorReadyScreen;
}
