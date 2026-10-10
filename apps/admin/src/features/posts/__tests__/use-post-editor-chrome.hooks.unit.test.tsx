import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AdminPost } from "@/lib/api";
import {
  POST_SETTINGS_OPEN_KEY,
  isSaveChord,
  singleLineTitle,
  usePostEditorChrome,
  type PostEditorChromeInput,
  type PostEditorChromePort,
} from "../hooks/use-post-editor-chrome.hooks";

afterEach(() => { vi.useRealTimers(); });

const POST = { id: "p1", slug: "hello", title: "Hello", kind: "post", version: 3 } as AdminPost;

function fakePort(overrides: Partial<PostEditorChromePort> = {}) {
  const settings = new Map<string, string>();
  const port: PostEditorChromePort = {
    createPost: vi.fn(async (title: string) => ({ post: { ...POST, id: "p2", slug: "hello-copy", title, version: 1 } as AdminPost })),
    updatePost: vi.fn(async (target: { id: string }) => ({ post: { ...POST, id: target.id } as AdminPost })),
    navigate: vi.fn(),
    copyText: vi.fn(async () => {}),
    siteUrl: (path: string) => `https://site.test${path}`,
    readSetting: (key: string) => settings.get(key) ?? null,
    writeSetting: vi.fn((key: string, value: string) => { settings.set(key, value); }),
    isWide: () => true,
    ...overrides,
  };
  return { port, settings };
}

function input(overrides: Partial<PostEditorChromeInput> = {}): PostEditorChromeInput {
  return {
    post: POST,
    title: "Hello",
    setTitle: vi.fn(),
    bodyJson: { type: "doc" },
    templateChoice: "wide",
    author: "Ana",
    showAuthor: true,
    featuredMediaId: "m1",
    dirty: true,
    saving: false,
    message: null,
    error: null,
    onSave: vi.fn(),
    confirmLeave: () => true,
    t: (key: string) => key,
    ...overrides,
  };
}

function pressSave() {
  const event = new KeyboardEvent("keydown", { key: "s", metaKey: true, cancelable: true });
  window.dispatchEvent(event);
  return event;
}

it("⌘S saves only when dirty and not saving, and always swallows the browser's Save page", () => {
  const onSave = vi.fn();
  const { port } = fakePort();
  const { rerender } = renderHook((props: PostEditorChromeInput) => usePostEditorChrome(props, port), {
    initialProps: input({ onSave, dirty: false }),
  });
  expect(pressSave().defaultPrevented).toBe(true);
  rerender(input({ onSave, dirty: true, saving: true }));
  pressSave();
  expect(onSave).not.toHaveBeenCalled();
  rerender(input({ onSave, dirty: true, saving: false }));
  pressSave();
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(isSaveChord({ key: "S", metaKey: false, ctrlKey: true, altKey: false, shiftKey: false })).toBe(true);
  expect(isSaveChord({ key: "s", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true })).toBe(false);
});

it("opens one menu at a time and closes it on an outside pointerdown or Escape, not inside it or an open dialog", () => {
  const { port } = fakePort();
  const menu = document.createElement("div");
  menu.dataset.postMenu = "insert";
  const inside = document.createElement("button");
  menu.append(inside);
  const dialog = document.createElement("dialog");
  dialog.setAttribute("open", "");
  const inDialog = document.createElement("input");
  dialog.append(inDialog);
  document.body.append(menu, dialog);
  const { result } = renderHook(() => usePostEditorChrome(input(), port));

  act(() => result.current.toggleMenu("text"));
  act(() => result.current.toggleMenu("insert"));
  expect(result.current.openMenu).toBe("insert");
  act(() => { inside.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
  act(() => { inDialog.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
  act(() => { inDialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  expect(result.current.openMenu).toBe("insert");
  act(() => { document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
  expect(result.current.openMenu).toBeNull();

  act(() => result.current.toggleMenu("actions"));
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
  expect(result.current.openMenu).toBeNull();

  const action = vi.fn();
  act(() => result.current.toggleMenu("more-format"));
  act(() => result.current.closeMenuAfter(action)());
  expect([result.current.openMenu, action.mock.calls.length]).toEqual([null, 1]);
  menu.remove();
  dialog.remove();
});

it("settings default to open when wide and closed when narrow, then remember the choice", () => {
  const narrow = fakePort({ isWide: () => false });
  expect(renderHook(() => usePostEditorChrome(input(), narrow.port)).result.current.settingsOpen).toBe(false);

  const wide = fakePort();
  const { result } = renderHook(() => usePostEditorChrome(input(), wide.port));
  expect(result.current.settingsOpen).toBe(true);
  act(() => result.current.toggleSettings());
  expect(result.current.settingsOpen).toBe(false);
  expect(wide.settings.get(POST_SETTINGS_OPEN_KEY)).toBe("0");

  // A stored choice beats the width default.
  narrow.settings.set(POST_SETTINGS_OPEN_KEY, "1");
  const remembered = renderHook(() => usePostEditorChrome(input(), narrow.port));
  expect(remembered.result.current.settingsOpen).toBe(true);
  act(() => remembered.result.current.closeSettings());
  expect([remembered.result.current.settingsOpen, narrow.settings.get(POST_SETTINGS_OPEN_KEY)]).toEqual([false, "0"]);
});

it("Copy link copies the live URL and flashes, or reports a failure", async () => {
  vi.useFakeTimers();
  const { port } = fakePort();
  const { result } = renderHook(() => usePostEditorChrome(input(), port));
  expect(result.current.liveUrl).toBe("https://site.test/hello");
  await act(async () => { result.current.copyLink(); });
  expect(port.copyText).toHaveBeenCalledWith("https://site.test/hello");
  expect(result.current.linkCopied).toBe(true);
  act(() => { vi.advanceTimersByTime(2000); });
  expect(result.current.linkCopied).toBe(false);

  const failing = fakePort({ copyText: vi.fn(async () => { throw new Error("denied"); }) });
  const second = renderHook(() => usePostEditorChrome(input(), failing.port));
  await act(async () => { second.result.current.copyLink(); });
  expect(second.result.current.chromeError).toBe("Could not copy the link");
  act(() => second.result.current.dismissChromeError());
  expect(second.result.current.chromeError).toBeNull();
});

it("Duplicate creates a copy, carries the editable fields over and opens it", async () => {
  const { port } = fakePort();
  const { result } = renderHook(() => usePostEditorChrome(input(), port));
  expect(result.current.canDuplicate).toBe(true);
  await act(async () => { result.current.duplicate(); });
  expect(port.createPost).toHaveBeenCalledWith("Hello (copy)");
  expect(port.updatePost).toHaveBeenCalledWith({ id: "p2" }, {
    bodyJson: { type: "doc" },
    templateChoice: "wide",
    author: "Ana",
    showAuthor: true,
    featuredMediaId: "m1",
    expectedVersion: 1,
  });
  expect(port.navigate).toHaveBeenCalledWith("/posts/hello-copy");
  expect(result.current.duplicating).toBe(false);
});

it("Duplicate reports a failure, stays put when leaving is declined, and is off for pages", async () => {
  const failing = fakePort({ updatePost: vi.fn(async () => { throw new Error("409"); }) });
  const { result } = renderHook(() => usePostEditorChrome(input(), failing.port));
  await act(async () => { result.current.duplicate(); });
  expect(result.current.chromeError).toBe("Could not duplicate this post");
  expect(failing.port.navigate).not.toHaveBeenCalled();

  const declined = fakePort();
  const kept = renderHook(() => usePostEditorChrome(input({ confirmLeave: () => false }), declined.port));
  await act(async () => { kept.result.current.duplicate(); });
  expect(declined.port.createPost).not.toHaveBeenCalled();

  const page = renderHook(() => usePostEditorChrome(input({ post: { ...POST, kind: "page" } as AdminPost }), declined.port));
  expect(page.result.current.canDuplicate).toBe(false);
});

it("shows Saved briefly after a successful save message, never for an error", () => {
  vi.useFakeTimers();
  const { port } = fakePort();
  const { result, rerender } = renderHook((props: PostEditorChromeInput) => usePostEditorChrome(props, port), {
    initialProps: input(),
  });
  rerender(input({ message: "Saved", error: "Conflict" }));
  expect(result.current.savedFlash).toBe(false);
  rerender(input({ message: "Saved" }));
  expect(result.current.savedFlash).toBe(true);
  act(() => { vi.advanceTimersByTime(2400); });
  expect(result.current.savedFlash).toBe(false);
});

it("keeps the title on one line", () => {
  const setTitle = vi.fn();
  const { port } = fakePort();
  const { result } = renderHook(() => usePostEditorChrome(input({ setTitle }), port));
  act(() => result.current.onTitleChange("a\nb\r\nc"));
  expect(setTitle).toHaveBeenCalledWith("a b c");
  const preventDefault = vi.fn();
  result.current.onTitleKeyDown({ key: "Enter", preventDefault } as never);
  result.current.onTitleKeyDown({ key: "a", preventDefault } as never);
  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(singleLineTitle("x\ny")).toBe("x y");
});
