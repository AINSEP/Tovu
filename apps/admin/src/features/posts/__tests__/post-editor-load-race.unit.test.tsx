import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@jini-ai/admin/posts/api/posts-api.types";
import { ApiError } from "@/lib/admin-http/request";
import type { AdminMedia } from "@/features/media/api/media-api.types";
import { createFakePostEditorPort } from "../hooks/post-editor-dependencies.hooks";
import { handleFileDrop, handleFilePaste } from "../hooks/post-editor-file-upload";
import { usePostEditor } from "../hooks/use-post-editor.hooks";
import { isLiveEditor } from "@/lib/live-tiptap-editor";

/**
 * Client report (2026-11-21, Tovu desktop): opening a post showed "Cannot read properties of null
 * (reading 'commands')" next to Delete, the title loaded but the body read "0 characters", and Publish
 * (or Save → "Save anyway") would have written that empty body over the real one.
 *
 * `@tiptap/react`'s `useEditor` can hand back a NEW editor instance after mount: its instance manager
 * schedules a 1 ms destroy at construction and, when the component's effects run later than that, the
 * first instance is destroyed (TipTap nulls its command manager) and a replacement is built. The load
 * effect had already captured the first instance, so the fetched post was written into a destroyed
 * editor. These tests destroy the instance by hand — the same end state — with a real TipTap editor and
 * only the server faked.
 */

const POST: AdminPost = {
  id: "p1", workspaceId: "ws1", kind: "post", title: "Hello World", slug: "hello-world",
  bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }] },
  bodyFormat: "doc", status: "draft", templateChoice: null, overridesThemePage: false,
  updatedAt: "2026-08-01T00:00:00.000Z", version: 3,
};

const LOAD_FAILED = "This post didn't finish loading. Reload the page; nothing was changed.";

/** A port whose `getPost` waits until the test calls `release()`. */
function gatedPort() {
  const port = createFakePostEditorPort({ post: POST });
  const getPost = port.getPost.bind(port);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  vi.spyOn(port, "getPost").mockImplementation(async (input) => { await gate; return getPost(input); });
  return { port, release };
}

function mount(port: ReturnType<typeof createFakePostEditorPort>) {
  return renderHook(() => usePostEditor({ postId: "hello-world", deps: { port, navigate: vi.fn(), t: (key: string) => key } }));
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("usePostEditor — the post loads after the editor instance was replaced", () => {
  it("applies the body to the replacement editor, with no error and no save before it lands", async () => {
    const { port, release } = gatedPort();
    const update = vi.spyOn(port, "updatePost");
    const { result, rerender } = mount(port);
    const first = result.current.editor!;
    act(() => { first.destroy(); });
    rerender();
    await waitFor(() => expect(result.current.editor).not.toBe(first));

    // Publish before the body is in the editor must not write anything.
    await act(async () => { await result.current.save({}, { statusOverride: "published" }); });
    expect(update).not.toHaveBeenCalled();
    expect(result.current.error).toBe("This post hasn't finished loading, so nothing was saved. Wait a moment, then try again.");

    await act(async () => { release(); });
    await waitFor(() => expect(result.current.post?.id).toBe("p1"));
    expect(result.current.error).toBeNull();
    expect(result.current.editor!.getText()).toContain("Body.");
    expect(result.current.dirty).toBe(false);
  });

  it("a load that lands after the editor was destroyed goes into the replacement, and Save writes the real body", async () => {
    const { port, release } = gatedPort();
    const { result } = mount(port);
    const first = result.current.editor!;
    act(() => { first.destroy(); });

    await act(async () => { release(); });
    await waitFor(() => expect(result.current.post?.id).toBe("p1"));
    expect(result.current.error).toBeNull();
    expect(result.current.editor).not.toBe(first);
    expect(result.current.editor!.getText()).toContain("Body.");

    await act(async () => { await result.current.save({}); });
    expect(port.post.bodyJson).toEqual(expect.objectContaining({ content: expect.arrayContaining([
      expect.objectContaining({ content: [expect.objectContaining({ text: "Body." })] }),
    ]) }));
  });

  it("a load that lands before the replacement renders waits for it instead of writing into the destroyed one", async () => {
    const { port, release } = gatedPort();
    const { result } = mount(port);
    const first = result.current.editor!;
    // Destroy and resolve inside one act scope: React renders nothing until the scope ends, so the
    // fetched row arrives while the newest instance the hook has seen is the destroyed one.
    await act(async () => {
      first.destroy();
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.post?.id).toBe("p1"));
    expect(result.current.error).toBeNull();
    expect(result.current.editor).not.toBe(first);
    expect(result.current.editor!.getText()).toContain("Body.");
  });
});

describe("usePostEditor — load failures read as plain words", () => {
  it("a client-side failure shows the plain line, never the raw JavaScript message", async () => {
    const port = createFakePostEditorPort({ post: POST });
    vi.spyOn(port, "getPost").mockRejectedValue(new TypeError("Cannot read properties of null (reading 'commands')"));
    const { result } = mount(port);
    await waitFor(() => expect(result.current.error).toBe(LOAD_FAILED));
    expect(result.current.post).toBeNull();
  });

  it("a server or network failure shows the same plain line (the shared notice carries the details)", async () => {
    const port = createFakePostEditorPort({ post: POST });
    vi.spyOn(port, "getPost").mockRejectedValue(new ApiError({ message: "Internal Server Error", status: 500 }));
    const { result } = mount(port);
    await waitFor(() => expect(result.current.error).toBe(LOAD_FAILED));
  });

  it("a server refusal keeps the server's own plain reason", async () => {
    const port = createFakePostEditorPort({ post: POST });
    vi.spyOn(port, "getPost").mockRejectedValue(new ApiError({ message: "post not found", status: 404 }));
    const { result } = mount(port);
    await waitFor(() => expect(result.current.error).toBe("post not found"));
  });
});

describe("isLiveEditor", () => {
  it("is false for a missing editor and for a destroyed one, true for a working one", async () => {
    const { result } = mount(createFakePostEditorPort({ post: POST }));
    const editor = result.current.editor!;
    expect(isLiveEditor(null)).toBe(false);
    expect(isLiveEditor(editor)).toBe(true);
    act(() => { editor.destroy(); });
    expect(isLiveEditor(editor)).toBe(false);
  });
});

describe("drop/paste uploads that finish after the editor is gone", () => {
  const MEDIA = { id: "asset-99", title: "photo.png", contentType: "image/png" } as AdminMedia;

  it.each([
    ["drop", handleFileDrop],
    ["paste", handleFilePaste],
  ] as const)("a %s upload settling into a destroyed editor inserts nothing and does not throw", async (_name, handle) => {
    const port = createFakePostEditorPort({ post: POST, uploadMediaResult: MEDIA });
    const upload = vi.spyOn(port, "uploadMedia");
    const { result } = mount(port);
    await waitFor(() => expect(result.current.post?.id).toBe("p1"));
    const editor = result.current.editor!;
    act(() => { editor.destroy(); });

    handle({ port, editor, files: [new File(["bytes"], "photo.png", { type: "image/png" })], pos: 1 });

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    await act(async () => { await upload.mock.results[0]?.value; });
    expect(JSON.stringify(editor.getJSON())).not.toContain("asset-99");
  });
});
