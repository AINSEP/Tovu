import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PostUrlDialog } from "../PostUrlDialog";
import { usePostUrlDialog, type PostUrlEditorPort } from "../hooks/use-post-url-dialog.hooks";

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
    const dialog = usePostUrlDialog({ editor }, { afterEditorFocus: close => { frames.push(close); } });
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
    expect(calls).toEqual([{ src: "https://example.com/image.png", alt: undefined }]);
    act(() => { frames.shift()!(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(editorElement);
  } finally {
    view.unmount();
    editorElement.remove();
  }
});
