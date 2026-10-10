import { act, fireEvent, render, renderHook, screen, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it } from "vitest";
import type { AdminPost } from "@/lib/api";
import { createFakePostEditorPort } from "../hooks/post-editor-dependencies.hooks";
import { usePostEditor } from "../hooks/use-post-editor.hooks";
import { PostAuthorFields } from "../PostAuthorFields";
import { POSTS_DICT, t } from "../posts-i18n";

const POST: AdminPost = { id: "p1", workspaceId: "ws", kind: "post", title: "Credit", slug: "credit",
  bodyJson: { type: "doc", content: [{ type: "paragraph" }] }, bodyFormat: "doc", status: "draft",
  templateChoice: null, overridesThemePage: null, updatedAt: "2026-10-09T00:00:00Z", version: 1, author: "admin", showAuthor: false };
const translate = (key: string) => key;
const navigate = () => {};
afterEach(() => localStorage.clear());

async function opened(post = POST) {
  const port = createFakePostEditorPort({ post });
  const hook = renderHook(() => usePostEditor("p1", { port, navigate, t: translate }));
  await waitFor(() => expect(hook.result.current.post?.id).toBe("p1"));
  await waitFor(() => expect(hook.result.current.editor).not.toBeNull());
  return { port, ...hook };
}

describe("post author editor", () => {
  it("loads the stored default without becoming dirty and omits untouched byline fields on save", async () => {
    const { port, result } = await opened();
    expect(result.current.author).toBe("admin");
    expect(result.current.showAuthor).toBe(false);
    expect(result.current.dirty).toBe(false);
    await act(async () => { await result.current.save(); });
    expect(port.updatePostCalls[0]).not.toHaveProperty("author");
    expect(port.updatePostCalls[0]).not.toHaveProperty("showAuthor");
  });

  it("an editable name and checkbox each make the hook dirty, persist, and can be cleared or switched off", async () => {
    const { port, result } = await opened();
    act(() => { result.current.setAuthor("Guest Writer"); result.current.setShowAuthor(true); });
    expect(result.current.dirty).toBe(true);
    await act(async () => { await result.current.save(); });
    expect(port.updatePostCalls[0]).toMatchObject({ author: "Guest Writer", showAuthor: true, expectedVersion: 1 });
    expect(result.current.dirty).toBe(false);
    act(() => { result.current.setAuthor(""); result.current.setShowAuthor(false); });
    await act(async () => { await result.current.save(); });
    expect(port.updatePostCalls[1]).toMatchObject({ author: null, showAuthor: false });
    expect(result.current.author).toBe("");
    expect(result.current.dirty).toBe(false);
  });

  it("a save response keeps newer author typing and leaves it dirty", async () => {
    const { port, result } = await opened();
    const save = port.updatePost;
    let finish!: () => void;
    const waiting = new Promise<void>(resolve => { finish = resolve; });
    port.updatePost = async (target, patch) => { await waiting; return save(target, patch); };
    act(() => result.current.setAuthor("Saved Writer"));
    let pending!: Promise<void>;
    act(() => { pending = result.current.save(); });
    act(() => result.current.setAuthor("Newer Typing"));
    await act(async () => { finish(); await pending; });
    expect(port.post.author).toBe("Saved Writer");
    expect(result.current.author).toBe("Newer Typing");
    expect(result.current.dirty).toBe(true);
  });

  it("author-only edits are retained in standing-draft autosaves", async () => {
    const { port, result } = await opened();
    act(() => result.current.setAuthor("Unsaved Writer"));
    await waitFor(() => expect(port.putAutosaveCalls.length).toBeGreaterThan(0), { timeout: 8000 });
    expect(port.putAutosaveCalls.at(-1)).toMatchObject({ author: "Unsaved Writer", showAuthor: false, baseVersion: 1 });
  });

  it("restores a parked author's name and toggle into the working copy", async () => {
    const autosave = { bodyFormat: "doc" as const, bodyJson: POST.bodyJson, title: POST.title, slug: POST.slug,
      baseVersion: 1, savedAt: "2026-10-09T01:00:00Z", savedByPrincipalId: "fake-principal", author: "Recovered Writer", showAuthor: true };
    const port = createFakePostEditorPort({ post: POST, autosave });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate, t: translate }));
    await waitFor(() => expect(result.current.recoverableDraft).not.toBeNull());
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    act(() => result.current.restoreRecoveredDraft());
    expect(result.current.author).toBe("Recovered Writer");
    expect(result.current.showAuthor).toBe(true);
    await act(async () => { await result.current.save(); });
    expect(port.post).toMatchObject({ author: "Recovered Writer", showAuthor: true });
  });

  it("renders accessible controls driven by hook state and saves their actual edits", async () => {
    const port = createFakePostEditorPort({ post: POST });
    function Fields() {
      const controller = usePostEditor("p1", { port, navigate, t: translate });
      return <><PostAuthorFields {...controller} t={translate} /><button onClick={() => { void controller.save(); }}>Save credit</button></>;
    }
    render(<Fields />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Author" })).toHaveValue("admin"));
    fireEvent.change(screen.getByRole("textbox", { name: "Author" }), { target: { value: "Source Author" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Show post author" }));
    fireEvent.click(screen.getByRole("button", { name: "Save credit" }));
    await waitFor(() => expect(port.post).toMatchObject({ author: "Source Author", showAuthor: true }));
  });

  it("both field labels have translations in all 21 supported locales", () => {
    for (const locale of Object.keys(POSTS_DICT)) {
      for (const key of ["Author", "Show post author"]) expect(t({ locale, key })).not.toBe(key);
    }
  });
});
