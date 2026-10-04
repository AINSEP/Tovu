import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminPost } from "@/lib/api";
import { usePageEditor } from "../hooks/use-page-editor.hooks";
import { createFakePageEditorPort } from "../hooks/page-editor-dependencies.hooks";
import { createFakeThemeCanvasPort } from "../hooks/theme-canvas-dependencies.hooks";

beforeEach(() => localStorage.clear());

const page: AdminPost = {
  id: "new-html-tab", workspaceId: "ws", kind: "page", title: "Untitled", slug: "untitled",
  status: "draft", bodyFormat: "doc", bodyJson: { type: "doc", content: [] }, bodyHtml: null,
  version: 1, updatedAt: "2026-10-04T12:00:00Z",
};

describe("new-page HTML tab metadata validation regression", () => {
  it.each(["draft", "published"] as const)("saves HTML and %s status, then saves again without a conflict", async (status) => {
    const port = createFakePageEditorPort({ page });
    const metadataWrite = port.updatePost.bind(port);
    const order: string[] = [];
    // Model the server's real doc-format validation. The previous permissive fake let
    // missing bodyJson through and concealed this failure after metadata was reordered.
    port.updatePost = async (target, patch) => {
      order.push("metadata");
      if (port.current.bodyFormat !== "html" && (!patch.bodyJson || Array.isArray(patch.bodyJson))) {
        throw new Error("bodyJson must be a JSON object");
      }
      return metadataWrite(target, patch);
    };
    const htmlWrite = port.updatePageHtml.bind(port);
    port.updatePageHtml = async (id, html) => {
      order.push("html");
      return htmlWrite(id, html);
    };
    // One deps object for every render — a fresh literal per render re-fires the editor's
    // dependency-keyed effects forever (the worker ran out of heap).
    const deps = {
      port, themeCanvasPort: createFakeThemeCanvasPort(), navigate: vi.fn(),
      locale: "en", t: (_locale: string, key: string) => key,
    };
    const { result } = renderHook(() => usePageEditor("untitled", deps));
    await waitFor(() => expect(result.current.page?.id).toBe(page.id));
    act(() => {
      result.current.setView("html");
      result.current.setHtml("<h1>Launch</h1>");
    });
    await act(async () => { await result.current.save(status); });
    expect(result.current.error).toBeNull();
    expect(result.current.saveConflict).toBeNull();
    expect(port.current).toMatchObject({ bodyFormat: "html", bodyHtml: "<h1>Launch</h1>", status });
    expect(result.current.page?.version).toBe(port.current.version);
    expect(result.current.dirty).toBe(false);
    expect(port.updatePostCalls[0]).toMatchObject({ expectedVersion: 1, bodyJson: page.bodyJson });
    const savedVersion = port.current.version;
    act(() => result.current.setHtml("<h1>Launch again</h1>"));
    await act(async () => { await result.current.save(); });
    expect(order).toEqual(["metadata", "html", "metadata", "html"]);
    expect(port.updatePostCalls[1]).toMatchObject({ expectedVersion: savedVersion });
    expect(port.updatePostCalls[1]).not.toHaveProperty("bodyJson");
    expect(port.current.bodyHtml).toBe("<h1>Launch again</h1>");
    expect(result.current.error).toBeNull();
    expect(result.current.saveConflict).toBeNull();
    expect(result.current.page?.version).toBe(port.current.version);
  });
});
