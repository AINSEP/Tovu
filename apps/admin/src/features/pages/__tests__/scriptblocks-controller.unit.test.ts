import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";
import { EditorSourceError } from "@jini-ai/ui/html-editor";
import { usePageEditor } from "../hooks/use-page-editor.hooks";
import { createFakePageEditorPort } from "../hooks/page-editor-dependencies.hooks";
import { createFakeThemeCanvasPort } from "../hooks/theme-canvas-dependencies.hooks";
import type { AdminPost } from "@/lib/api";

const html = '<p>hello</p><div data-kui id="ring"></div>';
const page: AdminPost = { id: "scriptblocks-page", workspaceId: "w", kind: "page", title: "Landing", slug: "scriptblocks", bodyJson: {}, bodyFormat: "html", bodyHtml: html, status: "draft", version: 1, updatedAt: "2026-10-11T00:00:00.000Z" };
function harness() {
  const port = createFakePageEditorPort({ page });
  const deps = { port, themeCanvasPort: createFakeThemeCanvasPort(), navigate: vi.fn(), t: (_locale: string, key: string) => key, locale: "en" };
  return { port, ...renderHook(() => usePageEditor("scriptblocks", deps)) };
}
describe("Page controller scriptblocks wiring", () => {
  it("Edit HTML flushes, switches tabs without dirtying content, and selects the exact tag", async () => {
    const { result } = harness();
    await waitFor(() => expect(result.current.page).not.toBeNull());
    act(() => result.current.setView("interactive"));
    result.current.interactiveEditorRef.current = { flush: async () => undefined };
    await act(async () => { await result.current.onRequestEditHtml({ occurrenceIndex: 0, tagName: "div", id: "ring" }, {}); });
    expect(result.current.view).toBe("html");
    expect(result.current.html).toBe(html);
    expect(result.current.draftHtml).toBe(html);
    expect(result.current.dirty).toBe(false);
    const node = document.createElement("textarea"); node.value = result.current.draftHtml;
    result.current.htmlTextareaRef(node);
    expect(node.value.slice(node.selectionStart, node.selectionEnd)).toBe('<div data-kui id="ring">');
  });
  it("source metadata failure stops both metadata/body Save; HTML can show the intact body", async () => {
    const { result, port } = harness();
    await waitFor(() => expect(result.current.page).not.toBeNull());
    act(() => result.current.setView("interactive"));
    result.current.interactiveEditorRef.current = { flush: async () => { throw new EditorSourceError(); } };
    await act(async () => { await result.current.save(); });
    expect(port.updatePostCalls).toEqual([]);
    expect(port.updatePageHtmlCalls).toEqual([]);
    expect(result.current.html).toBe(html);
    expect(result.current.error).toBe("Can't edit this source visually. Use HTML.");
    await act(async () => { result.current.setView("preview"); });
    expect(result.current.view).toBe("interactive");
    await act(async () => { result.current.setView("html"); });
    expect(result.current.view).toBe("html");
    expect(result.current.html).toBe(html);
  });
});
