import { getEmbedUrlFromYoutubeUrl } from "@tiptap/extension-youtube";
import { act, fireEvent, render, screen } from "@/__tests__/render-with-jini-kits";
import { expect, it, vi } from "vitest";
import { PostUrlDialog } from "@jini-ai/admin/posts/PostUrlDialog";
import { usePostUrlDialog, type PostUrlEditorPort } from "@jini-ai/cms/react/posts/hooks/use-post-url-dialog.hooks";
import { usePostUrlDialog as useHostPostUrlDialog } from "../editor/PostEditorBody";

it("shows errors after typing or submitting, resets on reopen, and returns Insert focus to the editor", () => {
  const editorElement = document.createElement("div");
  editorElement.contentEditable = "true";
  editorElement.tabIndex = 0;
  document.body.append(editorElement);
  const calls: unknown[] = [];
  const frames: Array<() => void> = [];
  const chain: ReturnType<PostUrlEditorPort["chain"]> = {
    focus: () => { editorElement.focus(); return chain; },
    extendMarkRange: () => chain, unsetLink: () => chain, setLink: () => chain,
    setImage: input => { calls.push(input); return chain; }, setYoutubeVideo: () => chain,
    run: () => true,
  };
  const editor: PostUrlEditorPort = { isActive: () => false, chain: () => chain };
  function Harness() {
    const dialog = usePostUrlDialog({ editor, getEmbedUrlFromYoutubeUrl }, { afterEditorFocus: close => { frames.push(close); } });
    return <><button onClick={dialog.openImage}>Image</button><PostUrlDialog dialog={dialog} t={key => key} /></>;
  }
  const view = render(<Harness />);
  try {
    const opener = screen.getByRole("button", { name: "Image" });
    fireEvent.click(opener);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("textbox", { name: "URL" }).getAttribute("aria-invalid")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Insert" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter an HTTP or HTTPS URL.");
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "URL" }), { target: { value: "https://not a url" } });
    expect(screen.getByRole("alert").textContent).toBe("Enter an HTTP or HTTPS URL.");
    fireEvent.change(screen.getByRole("textbox", { name: "URL" }), { target: { value: "https://example.com/image.png" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Insert" }));
    expect(calls).toEqual([{ src: "https://example.com/image.png" }]);
    expect(calls[0]).not.toHaveProperty("alt");
    act(() => { frames.shift()!(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(editorElement);
  } finally {
    view.unmount();
    editorElement.remove();
  }
});

it("binds the real YouTube parser and defers cleanup before final editor focus", () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  const editorElement = document.createElement("div");
  editorElement.tabIndex = 0;
  document.body.append(editorElement);
  const order: string[] = [];
  const inserted: unknown[] = [];
  editorElement.addEventListener("focus", () => order.push("editor"));
  const chain: ReturnType<PostUrlEditorPort["chain"]> = {
    focus: () => { editorElement.focus(); return chain; },
    extendMarkRange: () => chain, unsetLink: () => chain, setLink: () => chain,
    setImage: () => chain, setYoutubeVideo: input => { inserted.push(input); return chain; }, run: () => true,
  };
  const editor: PostUrlEditorPort = { isActive: () => false, chain: () => chain };
  function Harness() {
    const dialog = useHostPostUrlDialog({ editor });
    return <><button onFocus={() => order.push("opener")} onClick={dialog.openYoutube}>YouTube</button><PostUrlDialog dialog={dialog} t={key => key} /></>;
  }
  const view = render(<Harness />);
  try {
    fireEvent.click(screen.getByRole("button", { name: "YouTube" }));
    fireEvent.change(screen.getByRole("textbox", { name: "URL" }), { target: { value: "https://example.com/video" } });
    expect(screen.getByRole("alert").textContent).toBe("Enter a supported YouTube URL.");
    expect(inserted).toEqual([]);
    expect(frames).toHaveLength(0);
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    fireEvent.change(screen.getByRole("textbox", { name: "URL" }), { target: { value: url } });
    order.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "Insert" }));
    expect(inserted).toEqual([{ src: url }]);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(frames).toHaveLength(1);
    expect(order).toEqual(["editor"]);
    act(() => { const frame = frames.shift(); expect(frame).toBeDefined(); frame?.(0); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(order).toEqual(["editor", "opener", "editor"]);
    expect(document.activeElement).toBe(editorElement);
  } finally {
    view.unmount();
    editorElement.remove();
    vi.unstubAllGlobals();
  }
});
