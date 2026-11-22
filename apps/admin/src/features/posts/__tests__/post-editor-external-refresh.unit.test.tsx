import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@/features/posts/api/posts-api.types";
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
  it.each([false, true])("focus checks the version without an assistant bus event, dirty=%s", async dirty => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor({ postId: POST.slug, deps: { port, navigate: vi.fn(), t: (k: string) => k } }));
    await waitFor(() => expect(result.current.post?.version, "the initial basis is loaded").toBe(POST.version));
    if (dirty) act(() => result.current.setTitle({ next: "Typed title" }));
    port.simulateConcurrentSave({}, { title: "Assistant title" });
    port.post.bodyJson = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Assistant body" }] }] };
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(dirty ? result.current.pendingExternalVersion : result.current.post?.version, "focus discovers the newer stored version").toBe(POST.version + 1));
    expect(result.current.title, "focus preserves typed text or adopts the clean title").toBe(dirty ? "Typed title" : "Assistant title");
    expect(result.current.post?.version, "a dirty editor retains its original basis").toBe(POST.version + (dirty ? 0 : 1));
    expect(result.current.editor?.getText(), "clean refresh adopts the body and dirty refresh preserves it").toContain(dirty ? "Body." : "Assistant body");
  });

  it.each([false, true])("a refresh ignored during Save is checked once after settlement, conflict=%s", async conflict => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor({ postId: POST.slug, deps: { port, navigate: vi.fn(), t: (k: string) => k } }));
    await waitFor(() => expect(result.current.post, "the post is loaded before saving").not.toBeNull());
    act(() => result.current.setTitle({ next: "Operator title" }));
    let finishSave!: () => void;
    const gate = new Promise<void>(resolve => { finishSave = resolve; });
    const update = port.updatePost;
    let saveHeld = false;
    port.updatePost = async input => {
      if (conflict) { saveHeld = true; await gate; return update(input); }
      const saved = await update(input);
      saveHeld = true;
      await gate;
      return saved;
    };
    let saving!: Promise<void>;
    act(() => { saving = result.current.save({}); });
    await waitFor(() => expect(saveHeld, "the write reaches its separate Save gate before the outside write").toBe(true));
    expect(result.current.saving, "Save remains in flight during the first refresh read").toBe(true);
    port.simulateConcurrentSave({}, { title: "Assistant title" });
    const fresh = port.post;
    let finishRead!: (value: { post: AdminPost }) => void;
    const read = new Promise<{ post: AdminPost }>(resolve => { finishRead = resolve; });
    const get = vi.spyOn(port, "getPost").mockReturnValueOnce(read);
    act(() => publishContentRefresh());
    await act(async () => { finishRead({ post: fresh }); await read; });
    expect(get, "the ignored check made exactly one read").toHaveBeenCalledTimes(1);
    await act(async () => { finishSave(); await saving; });
    await waitFor(() => expect(get, "settlement schedules exactly one replacement read").toHaveBeenCalledTimes(2));
    expect(get.mock.calls[1]?.[0], "the replacement read uses the saved row ID").toEqual({ id: POST.id });
    await waitFor(() => expect(conflict ? result.current.pendingExternalVersion : result.current.post?.version, "the replacement read observes the assistant write").toBe(fresh.version));
    expect(result.current.title, "only a clean buffer adopts the assistant title").toBe(conflict ? "Operator title" : "Assistant title");
    if (conflict) {
      await act(async () => { await result.current.save({}); });
      expect(port.updatePostCalls.map(patch => patch.expectedVersion), "normal Save keeps sending the original basis").toEqual([POST.version, POST.version]);
      expect(port.post.title, "repeated normal Save cannot overwrite the assistant").toBe("Assistant title");
    }
  });

  it.each([undefined, "published"] satisfies Array<"published" | undefined>)("deliberate replacement retains intent %s and a failed overwrite retains the old basis", async statusOverride => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor({ postId: POST.slug, deps: { port, navigate: vi.fn(), t: (k: string) => k } }));
    await waitFor(() => expect(result.current.post, "the original basis has loaded").not.toBeNull());
    act(() => result.current.setTitle({ next: "Operator title" }));
    port.simulateConcurrentSave({});
    await act(async () => { await result.current.save({}, { statusOverride }); });
    const update = port.updatePost;
    const overwrite = vi.spyOn(port, "updatePost").mockRejectedValueOnce(new Error("ordinary save failure"));
    await act(async () => { await result.current.saveOverwritingConflict(); });
    expect(overwrite.mock.calls[0]?.[0].patch, "replacement re-reads its basis and retains the original intent").toMatchObject({ expectedVersion: POST.version + 1, status: statusOverride ?? "draft" });
    expect(result.current.post?.version, "a failed overwrite cannot advance the loaded basis").toBe(POST.version);
    overwrite.mockImplementation(update);
    await act(async () => { await result.current.save({}); });
    expect(overwrite.mock.calls[1]?.[0].patch.expectedVersion, "the next normal Save still uses the original basis").toBe(POST.version);
  });

  it("stale Save Load latest preserves a failed reload, then discards the draft and ignores an old autosave refusal", async () => {
    const port = createFakePostEditorPort({ post: POST, autosave: { bodyFormat: "doc", bodyJson: POST.bodyJson,
      title: "Standing title", slug: POST.slug, baseVersion: POST.version, savedAt: "2026-09-06T00:00:00.000Z", savedByPrincipalId: "user-local" } });
    const { result } = renderHook(() => usePostEditor({ postId: POST.slug, deps: { port, navigate: vi.fn(), t: (k: string) => k } }));
    await waitFor(() => expect(result.current.recoverableDraft, "the Post has a standing draft").not.toBeNull());
    let refuse!: (value: { applied: boolean }) => void;
    const oldAutosave = new Promise<{ applied: boolean }>(resolve => { refuse = resolve; });
    const put = vi.spyOn(port, "putAutosave").mockReturnValueOnce(oldAutosave);
    vi.useFakeTimers();
    try {
      act(() => result.current.setTitle({ next: "Typed title" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(3001); });
      expect(put, "the old Post autosave is held in flight").toHaveBeenCalledTimes(1);
      port.simulateConcurrentSave({}, { title: "Assistant title" });
      await act(async () => { await result.current.save({}, { statusOverride: "published" }); });
      expect(result.current.saveConflict, "the stale Post Save offers recovery").not.toBeNull();
      const draft = result.current.recoverableDraft;
      const read = vi.spyOn(port, "getPost").mockRejectedValueOnce(new Error("reload failed"));
      await act(async () => { await result.current.loadExternalChange(); });
      expect(result.current.title, "failed reload preserves typed text").toBe("Typed title");
      expect(result.current.recoverableDraft, "failed reload preserves the standing draft").toEqual(draft);
      expect(result.current.saveConflict, "failed reload leaves the stale Save choice available").not.toBeNull();
      expect(port.discardAutosaveCalled, "failure leaves the stored draft intact").toBe(false);
      read.mockRestore();
      await act(async () => { await result.current.loadExternalChange(); });
      expect(result.current.title, "successful reload adopts the assistant title").toBe("Assistant title");
      expect(result.current.saveConflict, "successful reload clears the Post conflict").toBeNull();
      expect(result.current.recoverableDraft, "successful reload clears recovery work").toBeNull();
      expect(port.discardAutosaveCalled, "successful reload discards the stored draft").toBe(true);
      await act(async () => { refuse({ applied: false }); await oldAutosave; });
      expect(result.current.autosaveStaleBasis, "the old refusal cannot pause autosave again").toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it("a clean editor picks up the assistant's write and moves the address bar to the new slug", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const navigate = vi.fn<(path: string, options?: { replace?: boolean }) => void>();
    const { result } = renderHook(() => usePostEditor({ postId: "hello-world", deps: { port, navigate, t: (k: string) => k } }));
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
    expect(result.current.editor?.getText()).toContain("Rewritten by the assistant.");
    expect(result.current.dirty).toBe(false);
    expect(navigate).toHaveBeenCalledWith("/posts/assistant-title", { replace: true });
    // Same record: the panel keeps its key, so the editor is not remounted by the URL change.
    expect(postEditorRouteKey({ segment: "assistant-title" })).toBe("hello-world");
  });

  it("a dirty editor keeps the operator's unsaved text", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor({ postId: "hello-world", deps: { port, navigate: vi.fn(), t: (k: string) => k } }));
    await waitFor(() => expect(result.current.post?.version).toBe(3));
    act(() => result.current.setTitle({ next: "My unsaved title" }));

    port.simulateConcurrentSave({}, { title: "Assistant Title" });
    act(() => publishContentRefresh());

    await waitFor(() => expect(result.current.pendingExternalVersion).toBe(POST.version + 1));
    expect(result.current.title).toBe("My unsaved title");
    expect(result.current.post?.version).toBe(3);
    act(() => result.current.dismissExternalChange());
    expect(result.current.pendingExternalVersion).toBeNull();
    expect(result.current.title).toBe("My unsaved title");
  });

  /** UI check 2026-10-31: the status kept saying "Saved · version 2" after the assistant had saved
   *  versions 3 and 4 — the editor's own last save, read as the post's current state. */
  it("the save status follows the assistant's write instead of naming the editor's last save", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor({ postId: "hello-world", deps: { port, navigate: vi.fn(), t: (k: string) => k } }));
    await waitFor(() => expect(result.current.post?.version).toBe(3));
    act(() => result.current.setTitle({ next: "Operator title" }));
    await act(async () => { await result.current.save({}); });
    expect(result.current.message).toBe("Saved · version 4");

    port.simulateConcurrentSave({}, { title: "Assistant Title" });
    act(() => publishContentRefresh());
    await waitFor(() => expect(result.current.post?.version).toBe(5));
    expect(result.current.message).toMatch(/version 5/);
    expect(result.current.message).not.toMatch(/^Saved · version 4$/);
  });

  it("while an outside version waits on the operator's choice, the status names that version", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor({ postId: "hello-world", deps: { port, navigate: vi.fn(), t: (k: string) => k } }));
    await waitFor(() => expect(result.current.post?.version).toBe(3));
    act(() => result.current.setTitle({ next: "Operator title" }));
    await act(async () => { await result.current.save({}); });
    act(() => result.current.setTitle({ next: "More unsaved typing" }));

    port.simulateConcurrentSave({}, { title: "Assistant Title" });
    act(() => publishContentRefresh());
    await waitFor(() => expect(result.current.pendingExternalVersion).toBe(5));
    expect(result.current.message).toMatch(/version 5/);
  });

  it("Load latest replaces unsaved text with the newest saved post", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor({ postId: "hello-world", deps: { port, navigate: vi.fn(), t: (k: string) => k } }));
    await waitFor(() => expect(result.current.post?.version).toBe(3));
    act(() => result.current.setTitle({ next: "My unsaved title" }));
    port.simulateConcurrentSave({}, { title: "Assistant Title" });
    act(() => publishContentRefresh());
    await waitFor(() => expect(result.current.pendingExternalVersion).toBe(4));
    await act(async () => { await result.current.loadExternalChange(); });
    expect(result.current.title).toBe("Assistant Title");
    expect(result.current.post?.version).toBe(4);
    expect(result.current.pendingExternalVersion).toBeNull();
    expect(result.current.dirty).toBe(false);
  });
});
