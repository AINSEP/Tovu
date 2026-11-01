import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@/lib/api";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { createFakePostEditorPort } from "../hooks/post-editor-dependencies.hooks";
import { usePostEditor } from "../hooks/use-post-editor.hooks";
import { postEditorRouteKey } from "../post-editor-route-key";

/**
 * todos.md:367 (09-24, L3110): the Posts editor ignored edits the assistant made to the open post,
 * and the address bar kept the old slug. A finished assistant run (or a content tool result)
 * publishes on the content-refresh bus (`AssistantDock.hooks.tsx`); the Pages editor re-reads on it,
 * the Posts editor never subscribed. Real hook, real TipTap editor, real bus — only the server is faked.
 */

const POST: AdminPost = {
  id: "p1", workspaceId: "ws1", kind: "post", title: "Hello World", slug: "hello-world",
  bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }] },
  bodyFormat: "doc", status: "draft", templateChoice: null, overridesThemePage: false,
  updatedAt: "2026-08-01T00:00:00.000Z", version: 3,
};

afterEach(() => {
  resetContentRefreshBus();
  localStorage.clear();
});

describe("usePostEditor — assistant edits while the editor is open", () => {
  it("a clean editor picks up the assistant's write and moves the address bar to the new slug", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const navigate = vi.fn<(path: string, options?: { replace?: boolean }) => void>();
    const { result } = renderHook(() => usePostEditor("hello-world", { port, navigate, t: (k: string) => k }));
    await waitFor(() => expect(result.current.post?.version).toBe(3));

    // The assistant's content_post_update lands server-side: new title, new body, new slug.
    port.post = {
      ...POST, title: "Assistant Title", slug: "assistant-title", version: 4,
      bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Rewritten by the assistant." }] }] },
    };
    act(() => publishContentRefresh());

    await waitFor(() => expect(result.current.post?.version).toBe(4));
    expect(result.current.title).toBe("Assistant Title");
    expect(result.current.slug).toBe("assistant-title");
    expect(result.current.editor.getText()).toContain("Rewritten by the assistant.");
    expect(result.current.dirty).toBe(false);
    expect(navigate).toHaveBeenCalledWith("/posts/assistant-title", { replace: true });
    // Same record: the panel keeps its key, so the editor is not remounted by the URL change.
    expect(postEditorRouteKey("assistant-title")).toBe("hello-world");
  });

  it("a dirty editor keeps the operator's unsaved text", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("hello-world", { port, navigate: vi.fn(), t: (k: string) => k }));
    await waitFor(() => expect(result.current.post?.version).toBe(3));
    act(() => result.current.setTitle("My unsaved title"));

    port.simulateConcurrentSave("Assistant Title");
    act(() => publishContentRefresh());

    await waitFor(() => expect(result.current.pendingExternalVersion).toBe(POST.version + 1));
    expect(result.current.title).toBe("My unsaved title");
    expect(result.current.post?.version).toBe(3);
    act(() => result.current.dismissExternalChange());
    expect(result.current.pendingExternalVersion).toBeNull();
    expect(result.current.title).toBe("My unsaved title");
  });

  it("Load latest replaces unsaved text with the newest saved post", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("hello-world", { port, navigate: vi.fn(), t: (k: string) => k }));
    await waitFor(() => expect(result.current.post?.version).toBe(3));
    act(() => result.current.setTitle("My unsaved title"));
    port.simulateConcurrentSave("Assistant Title");
    act(() => publishContentRefresh());
    await waitFor(() => expect(result.current.pendingExternalVersion).toBe(4));
    await act(async () => { await result.current.loadExternalChange(); });
    expect(result.current.title).toBe("Assistant Title");
    expect(result.current.post?.version).toBe(4);
    expect(result.current.pendingExternalVersion).toBeNull();
    expect(result.current.dirty).toBe(false);
  });
});
