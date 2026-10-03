import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { usePostEditorUi, usePostPreviewIframeEscape } from "../hooks/use-post-editor-ui.hooks";

afterEach(() => { vi.restoreAllMocks(); document.querySelectorAll("iframe").forEach((node) => node.remove()); });

// Author Checklist: F2.3/F2.5/F6.2/F7.6. Real hooks and DOM listeners, exact callback
// payloads, state readback, and rerender/unmount controls. Source mutations are forbidden.
it("saves with the requested status and opens and closes each dialog independently", async () => {
  // Reject: onPublish calls save() or cancel sets true instead of false.
  const save = vi.fn(async (_status?: "draft" | "published") => {});
  const { result } = renderHook(() => {
    const [deleting, setConfirmingDelete] = useState(false);
    const [template, setShowTemplateModal] = useState(false);
    return { deleting, template, ...usePostEditorUi({ save, setConfirmingDelete, setShowTemplateModal }) };
  });
  await act(async () => { await result.current.onPublish(); });
  await act(async () => { await result.current.onSave(); });
  expect(save.mock.calls).toEqual([["published"], []]);
  act(() => result.current.onDeleteClick());
  expect([result.current.deleting, result.current.template]).toEqual([true, false]);
  act(() => result.current.onDeleteCancel());
  act(() => result.current.onViewTemplateClick());
  expect([result.current.deleting, result.current.template]).toEqual([false, true]);
  act(() => result.current.onCloseTemplateModal());
  expect([result.current.deleting, result.current.template]).toEqual([false, false]);
});

it("rebinds Escape after frame navigation and callback changes, and detaches on collapse and unmount", async () => {
  // Reject: omit old-document removal, expanded gating, load listener or callback dependency.
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const firstDocument = frame.contentDocument!;
  const first = vi.fn();
  const second = vi.fn();
  const { result, rerender, unmount } = renderHook(({ expanded, collapse }) => usePostPreviewIframeEscape(expanded, collapse), {
    initialProps: { expanded: false, collapse: first },
  });
  act(() => result.current(frame));
  const key = (doc: Document, value = "Escape") => act(() => { doc.dispatchEvent(new KeyboardEvent("keydown", { key: value })); });
  key(firstDocument);
  expect(first).not.toHaveBeenCalled();
  rerender({ expanded: true, collapse: first });
  key(firstDocument, "Enter");
  expect(first).not.toHaveBeenCalled();
  key(firstDocument);
  expect(first.mock.calls).toEqual([[]]);
  // F3.5: let jsdom replace the iframe document and deliver its real load event.
  // about:blank needs no network or listening port.
  const navigated = new Promise<void>((resolve) => frame.addEventListener("load", () => resolve(), { once: true }));
  await act(async () => { frame.src = "about:blank"; await navigated; });
  const nextDocument = frame.contentDocument!;
  expect(nextDocument).not.toBe(firstDocument);
  key(firstDocument);
  expect(first.mock.calls).toEqual([[]]);
  key(nextDocument);
  expect(first.mock.calls).toEqual([[], []]);
  rerender({ expanded: true, collapse: second });
  key(nextDocument);
  expect(second.mock.calls).toEqual([[]]);
  expect(first.mock.calls).toEqual([[], []]);
  rerender({ expanded: false, collapse: second });
  act(() => { frame.dispatchEvent(new Event("load")); });
  key(nextDocument);
  expect(second.mock.calls).toEqual([[]]);
  rerender({ expanded: true, collapse: second });
  key(nextDocument);
  expect(second.mock.calls).toEqual([[], []]);
  unmount();
  act(() => { frame.dispatchEvent(new Event("load")); });
  key(nextDocument);
  expect(second.mock.calls).toEqual([[], []]);
});

it("tolerates an inaccessible frame document and binds when a same-origin document becomes available", () => {
  // Reject: remove the nullable-document guards.
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const doc = frame.contentDocument!;
  const getter = vi.spyOn(frame, "contentDocument", "get").mockReturnValue(null);
  const collapse = vi.fn();
  const { result } = renderHook(() => usePostPreviewIframeEscape(true, collapse));
  act(() => result.current(frame));
  act(() => { doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
  expect(collapse).not.toHaveBeenCalled();
  getter.mockReturnValue(doc);
  act(() => { frame.dispatchEvent(new Event("load")); });
  act(() => { doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
  expect(collapse.mock.calls).toEqual([[]]);
});
