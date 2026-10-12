import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { usePostUrlDialog, type PostUrlEditorPort } from "../hooks/use-post-url-dialog.hooks";

// F1: real state/validation, injected command fake, exact URL/alt payloads and no module mocks.
it("validates URLs, submits the existing commands and cancels without inserting or leaking image state", () => {
  const calls: unknown[][] = [];
  let linked = false;
  const chain: ReturnType<PostUrlEditorPort["chain"]> = {
    focus: () => { calls.push(["focus"]); return chain; },
    extendMarkRange: (name) => { calls.push(["extendMarkRange", name]); return chain; },
    unsetLink: () => { calls.push(["unsetLink"]); return chain; },
    setLink: (input) => { calls.push(["setLink", input]); return chain; },
    setImage: (input) => { calls.push(["setImage", input]); return chain; },
    setYoutubeVideo: (input) => { calls.push(["setYoutubeVideo", input]); return chain; },
    run: () => { calls.push(["run"]); return true; },
  };
  const editor: PostUrlEditorPort = { chain: () => chain, isActive: (name) => linked && name === "link" };
  const button = document.createElement("button");
  document.body.append(button);
  const opener = { currentTarget: button };
  let prevented = 0;
  const submit = { preventDefault: () => { prevented += 1; } };
  const afterFocus: Array<() => void> = [];
  const { result, rerender, unmount } = renderHook(({ editor }) => usePostUrlDialog({ editor }, { afterEditorFocus: (close) => { afterFocus.push(close); } }), {
    initialProps: { editor: editor as PostUrlEditorPort | null },
  });
  act(() => result.current.openLink(opener));
  expect(document.activeElement).toBe(button);
  expect([result.current.open, result.current.title, result.current.url]).toEqual([true, "Link URL", "https://"]);
  expect([result.current.error, result.current.invalid, result.current.disabled]).toEqual(["", false, false]);
  for (const value of ["", "https://", "https://bad host", "https:example.com", "javascript:alert(1)", "ftp://example.com", "//example.com", "https://not a url", "https://exa\tmple.com", "https://example.com/has space", "https://example.com/has\nnewline", " https://example.com", "https://example.com "]) {
    act(() => result.current.changeUrl({ value }));
    expect(result.current.error).toBe("Enter an HTTP or HTTPS URL.");
    expect(result.current.invalid).toBe(true);
    act(() => result.current.submit(submit));
    expect(calls).toEqual([]);
    expect(result.current.open).toBe(true);
  }
  act(() => result.current.changeUrl({ value: "http://example.com/page" }));
  expect(result.current.error).toBe("");
  expect(result.current.invalid).toBe(false);
  act(() => result.current.submit(submit));
  expect(calls.splice(0)).toEqual([["focus"], ["extendMarkRange", "link"], ["setLink", { href: "http://example.com/page" }], ["run"]]);
  expect([result.current.open, result.current.pending, result.current.disabled]).toEqual([true, true, true]);
  act(() => result.current.submit(submit));
  expect(calls).toEqual([]);
  act(() => afterFocus.shift()!());
  expect(calls.splice(0)).toEqual([["focus"], ["run"]]);
  expect(result.current.open).toBe(false);
  expect(result.current.pending).toBe(false);
  act(() => result.current.submit(submit));
  expect(calls).toEqual([]);

  linked = true;
  act(() => result.current.openLink(opener));
  expect(result.current.open).toBe(false);
  expect(calls.splice(0)).toEqual([["focus"], ["extendMarkRange", "link"], ["unsetLink"], ["run"]]);
  linked = false;
  act(() => result.current.openImage(opener));
  expect([result.current.title, result.current.image, result.current.url, result.current.alt]).toEqual(["Image URL", true, "", ""]);
  act(() => { result.current.changeUrl({ value: "https://example.com/pic.png" }); result.current.changeAlt({ value: "A picture" }); });
  act(() => result.current.submit(submit));
  expect(calls.splice(0)).toEqual([["focus"], ["setImage", { src: "https://example.com/pic.png", alt: "A picture" }], ["run"]]);
  act(() => afterFocus.shift()!());
  expect(calls.splice(0)).toEqual([["focus"], ["run"]]);
  act(() => result.current.openImage(opener));
  expect(result.current.alt).toBe("");
  act(() => result.current.changeUrl({ value: "https://example.com/no-alt.png" }));
  act(() => result.current.submit(submit));
  expect(calls.splice(0)).toEqual([["focus"], ["setImage", { src: "https://example.com/no-alt.png", alt: undefined }], ["run"]]);
  act(() => afterFocus.shift()!());
  expect(calls.splice(0)).toEqual([["focus"], ["run"]]);
  act(() => result.current.openImage(opener));
  act(() => result.current.changeAlt({ value: "Discard this" }));
  act(() => result.current.cancel());
  expect(result.current.open).toBe(false);
  expect(calls).toEqual([]);

  act(() => result.current.openYoutube(opener));
  expect([result.current.title, result.current.image, result.current.alt]).toEqual(["YouTube video URL", false, ""]);
  for (const value of ["https://example.com/video", "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/channel/example"]) {
    act(() => result.current.changeUrl({ value }));
    expect(result.current.error).toBe("Enter a supported YouTube URL.");
    expect(result.current.invalid).toBe(true);
    act(() => result.current.submit(submit));
    expect(calls).toEqual([]);
  }
  for (const value of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]) {
    act(() => result.current.changeUrl({ value }));
    expect(result.current.error).toBe("");
    expect(result.current.invalid).toBe(false);
  }
  act(() => result.current.submit(submit));
  expect(calls.splice(0)).toEqual([["focus"], ["setYoutubeVideo", { src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" }], ["run"]]);
  act(() => afterFocus.shift()!());
  expect(calls.splice(0)).toEqual([["focus"], ["run"]]);
  act(() => result.current.openLink(opener));
  expect([result.current.url, result.current.alt]).toEqual(["https://", ""]);
  act(() => result.current.changeUrl({ value: "https://example.com" }));
  act(() => result.current.cancel());
  expect(result.current.open).toBe(false);
  expect(calls).toEqual([]);

  rerender({ editor: null });
  act(() => result.current.openLink(opener));
  expect(result.current.open).toBe(false);
  act(() => result.current.openImage(opener));
  act(() => result.current.changeUrl({ value: "https://example.com" }));
  expect(result.current.disabled).toBe(true);
  act(() => result.current.submit(submit));
  expect(calls).toEqual([]);
  expect(prevented).toBe(23);
  unmount();
  button.remove();
});


it.each([
  ["https://not a url", "Enter an HTTP or HTTPS URL."],
  ["https://", "Enter an HTTP or HTTPS URL."],
  ["http://", "Enter an HTTP or HTTPS URL."],
  ["https://example.com/space%20encoded.png", ""],
  ["HTTP://localhost:3000/image.png", ""],
  ["https://[::1]:3000/image.png?size=20#preview", ""],
] as const)("validates the exact URL %s with the native parser", (value, error) => {
  const { result, unmount } = renderHook(() => usePostUrlDialog({ editor: null }));
  const button = document.createElement("button");
  act(() => result.current.openImage({ currentTarget: button }));
  expect(result.current.error).toBe("");
  act(() => result.current.changeUrl({ value }));
  expect(result.current.error).toBe(error);
  expect(result.current.url).toBe(value);
  unmount();
});
