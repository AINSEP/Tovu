import { afterEach, describe, expect, it, vi } from "vitest";

import {
  droppedUri,
  handleImageDrop,
  postRowMenuItems,
  readFileAsDataUrl,
  sortPostsByUpdated,
  toolbarBtnClass,
  updatedSortButtonLabel,
} from "../rules";
import type { AdminPost } from "../../../lib/api";

/**
 * @file Pure(ish) logic for `features/posts` — `postRowMenuItems` (the row-action menu, driven
 * entirely by `post.status`), `readFileAsDataUrl` (a `File` -> `data:` URL reader, the one
 * genuinely async/I-O-bound helper here), and `handleImageDrop` (the editor's drag-and-drop image
 * handler, wired into `use-post-editor.hooks.ts`'s `handleDrop` editorProps). No dedicated test
 * file existed for this module before this pass — the whole file was at 0%.
 */

function post(overrides: Partial<AdminPost> = {}): AdminPost {
  return {
    id: "p1",
    workspaceId: "w1",
    kind: "post",
    title: "My Post",
    slug: "my-post",
    bodyJson: {},
    status: "draft",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

describe("postRowMenuItems", () => {
  const handlers = { onEdit: vi.fn(), onDisable: vi.fn(), onDelete: vi.fn() };

  it("always includes Edit and Delete", () => {
    const items = postRowMenuItems(post({ status: "draft" }), handlers, "en");
    const keys = items.map((i) => i.key);
    expect(keys).toContain("edit");
    expect(keys).toContain("delete");
  });

  it("offers Disable for a published post", () => {
    const items = postRowMenuItems(post({ status: "published" }), handlers, "en");
    expect(items.map((i) => i.key)).toContain("disable");
  });

  it("omits Disable entirely for a draft post — not rendered disabled, not present at all", () => {
    const items = postRowMenuItems(post({ status: "draft" }), handlers, "en");
    expect(items.map((i) => i.key)).not.toContain("disable");
  });

  it("Delete is marked destructive; Edit/Disable are not", () => {
    const items = postRowMenuItems(post({ status: "published" }), handlers, "en");
    expect(items.find((i) => i.key === "delete")?.destructive).toBe(true);
    expect(items.find((i) => i.key === "edit")?.destructive).toBeFalsy();
    expect(items.find((i) => i.key === "disable")?.destructive).toBeFalsy();
  });

  it("preserves order: edit, [disable], delete", () => {
    const items = postRowMenuItems(post({ status: "published" }), handlers, "en");
    expect(items.map((i) => i.key)).toEqual(["edit", "disable", "delete"]);
  });

  it("each item's onSelect calls the matching handler with the post", () => {
    const onEdit = vi.fn();
    const onDisable = vi.fn();
    const onDelete = vi.fn();
    const p = post({ status: "published" });
    const items = postRowMenuItems(p, { onEdit, onDisable, onDelete }, "en");
    items.find((i) => i.key === "edit")!.onSelect();
    items.find((i) => i.key === "disable")!.onSelect();
    items.find((i) => i.key === "delete")!.onSelect();
    expect(onEdit).toHaveBeenCalledWith(p);
    expect(onDisable).toHaveBeenCalledWith(p);
    expect(onDelete).toHaveBeenCalledWith(p);
  });

  it("translates labels to Spanish when locale is es", () => {
    const items = postRowMenuItems(post({ status: "published" }), handlers, "es");
    expect(items.map((i) => i.label)).toEqual(["Editar", "Desactivar", "Eliminar"]);
  });
});

describe("readFileAsDataUrl", () => {
  it("resolves to a data: URL for a real File", async () => {
    const file = new File(["hello world"], "hello.txt", { type: "text/plain" });
    const result = await readFileAsDataUrl(file);
    expect(result).toMatch(/^data:text\/plain;base64,/);
    expect(atob(result.split(",")[1])).toBe("hello world");
  });

  it("resolves to '' if the reader's result is somehow null/undefined rather than throwing", async () => {
    class FakeReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("FileReader", FakeReader);
    const file = new File(["x"], "x.txt");
    const result = await readFileAsDataUrl(file);
    expect(result).toBe("");
    vi.unstubAllGlobals();
  });

  it("rejects with the reader's own error on failure", async () => {
    class FailingReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      error = new Error("read failed");
      readAsDataURL() {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("FileReader", FailingReader);
    const file = new File(["x"], "x.txt");
    await expect(readFileAsDataUrl(file)).rejects.toThrow("read failed");
    vi.unstubAllGlobals();
  });

  it("rejects with a generic error when the reader fails with no error object of its own", async () => {
    class FailingReaderNoError {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      error: Error | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("FileReader", FailingReaderNoError);
    const file = new File(["x"], "x.txt");
    await expect(readFileAsDataUrl(file)).rejects.toThrow("failed to read file");
    vi.unstubAllGlobals();
  });
});

describe("toolbarBtnClass", () => {
  it("appends ' on' when active", () => {
    expect(toolbarBtnClass(true)).toBe("tb-btn on");
  });

  it("stays plain when inactive", () => {
    expect(toolbarBtnClass(false)).toBe("tb-btn");
  });
});

describe("sortPostsByUpdated", () => {
  const oldest = post({ id: "p-old", updatedAt: "2026-01-01T00:00:00.000Z" });
  const middle = post({ id: "p-mid", updatedAt: "2026-06-01T00:00:00.000Z" });
  const newest = post({ id: "p-new", updatedAt: "2026-08-10T00:00:00.000Z" });

  it("'newest' sorts most-recently-updated first", () => {
    const result = sortPostsByUpdated([middle, oldest, newest], "newest");
    expect(result.map((p) => p.id)).toEqual(["p-new", "p-mid", "p-old"]);
  });

  it("'oldest' sorts least-recently-updated first", () => {
    const result = sortPostsByUpdated([middle, oldest, newest], "oldest");
    expect(result.map((p) => p.id)).toEqual(["p-old", "p-mid", "p-new"]);
  });

  it("does not mutate the input array", () => {
    const input = [middle, oldest, newest];
    const original = [...input];
    sortPostsByUpdated(input, "newest");
    expect(input).toEqual(original);
  });

  it("returns [] for an empty list in either direction", () => {
    expect(sortPostsByUpdated([], "newest")).toEqual([]);
    expect(sortPostsByUpdated([], "oldest")).toEqual([]);
  });

  it("is stable-ish for a single row", () => {
    expect(sortPostsByUpdated([oldest], "newest")).toEqual([oldest]);
  });
});

describe("updatedSortButtonLabel", () => {
  it("states 'newest first' and offers oldest-first as the next action when direction is newest", () => {
    const label = updatedSortButtonLabel("newest");
    expect(label).toMatch(/newest first/i);
    expect(label).toMatch(/oldest first/i);
  });

  it("states 'oldest first' and offers newest-first as the next action when direction is oldest", () => {
    const label = updatedSortButtonLabel("oldest");
    expect(label).toMatch(/oldest first/i);
    expect(label).toMatch(/newest first/i);
  });

  it("the two directions produce different labels", () => {
    expect(updatedSortButtonLabel("newest")).not.toBe(updatedSortButtonLabel("oldest"));
  });
});

describe("droppedUri", () => {
  function dataTransfer(opts: { uriList?: string; plainText?: string }) {
    return {
      getData: (fmt: string) => {
        if (fmt === "text/uri-list") return opts.uriList ?? "";
        if (fmt === "text/plain") return opts.plainText ?? "";
        return "";
      },
    } as unknown as DataTransfer;
  }

  it("returns the text/uri-list value when present", () => {
    expect(droppedUri(dataTransfer({ uriList: "https://example.com/pic.png" }))).toBe(
      "https://example.com/pic.png"
    );
  });

  it("falls back to text/plain when text/uri-list is empty", () => {
    expect(droppedUri(dataTransfer({ plainText: "http://example.com/img.jpg" }))).toBe(
      "http://example.com/img.jpg"
    );
  });

  it("prefers text/uri-list over text/plain when both are present", () => {
    expect(
      droppedUri(dataTransfer({ uriList: "https://a.example/1.png", plainText: "https://b.example/2.png" }))
    ).toBe("https://a.example/1.png");
  });

  it("trims surrounding whitespace", () => {
    expect(droppedUri(dataTransfer({ uriList: "  https://example.com/pic.png  " }))).toBe(
      "https://example.com/pic.png"
    );
  });

  it("returns '' for a null dataTransfer", () => {
    expect(droppedUri(null)).toBe("");
  });

  it("returns '' when neither format has data", () => {
    expect(droppedUri(dataTransfer({}))).toBe("");
  });
});

// --- handleImageDrop ---

function fakeNode(attrs: Record<string, unknown>) {
  return { type: "image", attrs };
}

function fakeView(opts: { posAtCoordsResult?: { pos: number } | null; selectionTo?: number } = {}) {
  const insertedNodes: Array<{ pos: number; node: unknown }> = [];
  const dispatched: unknown[] = [];
  const tr = {
    insert: vi.fn((pos: number, node: unknown) => {
      insertedNodes.push({ pos, node });
      return tr;
    }),
  };
  const imageCreate = vi.fn((attrs: Record<string, unknown>) => fakeNode(attrs));
  const view = {
    posAtCoords: vi.fn(() => opts.posAtCoordsResult ?? null),
    dispatch: vi.fn((t: unknown) => dispatched.push(t)),
    state: {
      selection: { to: opts.selectionTo ?? 7 },
      tr,
      schema: { nodes: { image: { create: imageCreate } } },
    },
  };
  return { view, insertedNodes, dispatched, imageCreate, tr };
}

function fakeDragEvent(opts: {
  clientX?: number;
  clientY?: number;
  files?: File[];
  uriListData?: string;
  plainTextData?: string;
}): DragEvent {
  const files = opts.files ?? [];
  const fileListLike: Record<number, File> & { length: number; item: (i: number) => File | null } = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
  };
  files.forEach((f, i) => {
    fileListLike[i] = f;
  });
  const dataTransfer = {
    files: {
      ...fileListLike,
      [Symbol.iterator]: function* () {
        for (const f of files) yield f;
      },
    } as unknown as FileList,
    getData: (fmt: string) => {
      if (fmt === "text/uri-list") return opts.uriListData ?? "";
      if (fmt === "text/plain") return opts.plainTextData ?? "";
      return "";
    },
  };
  return {
    clientX: opts.clientX ?? 10,
    clientY: opts.clientY ?? 20,
    dataTransfer,
    preventDefault: vi.fn(),
  } as unknown as DragEvent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("handleImageDrop", () => {
  it("returns false immediately (no-op) when moved=true — an internal content reorder, not an external drop", () => {
    const { view } = fakeView();
    const event = fakeDragEvent({});
    const result = handleImageDrop(view as never, event, true);
    expect(result).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it("inserts an image node at the drop position for a dropped image file, calls preventDefault, and returns true", async () => {
    const { view, tr, imageCreate } = fakeView({ posAtCoordsResult: { pos: 5 } });
    const file = new File(["img-bytes"], "photo.png", { type: "image/png" });
    const event = fakeDragEvent({ files: [file] });

    const result = handleImageDrop(view as never, event, false);

    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    // The file read is async (readAsDataURL + FileReader onload) — poll until it settles rather
    // than assuming a fixed number of microtask ticks.
    await vi.waitFor(() => expect(imageCreate).toHaveBeenCalled());
    expect(imageCreate).toHaveBeenCalledWith(expect.objectContaining({ alt: "photo.png" }));
    expect(tr.insert).toHaveBeenCalledWith(5, expect.anything());
    expect(view.dispatch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the current selection's end position when posAtCoords returns null", async () => {
    const { view, tr } = fakeView({ posAtCoordsResult: null, selectionTo: 42 });
    const file = new File(["img-bytes"], "photo.png", { type: "image/png" });
    const event = fakeDragEvent({ files: [file] });

    handleImageDrop(view as never, event, false);
    await vi.waitFor(() => expect(tr.insert).toHaveBeenCalled());

    expect(tr.insert).toHaveBeenCalledWith(42, expect.anything());
  });

  it("inserts one node per dropped image file, filtering out non-image files", async () => {
    const { view, tr } = fakeView({ posAtCoordsResult: { pos: 1 } });
    const img1 = new File(["a"], "a.png", { type: "image/png" });
    const notImage = new File(["b"], "b.txt", { type: "text/plain" });
    const img2 = new File(["c"], "c.jpg", { type: "image/jpeg" });
    const event = fakeDragEvent({ files: [img1, notImage, img2] });

    const result = handleImageDrop(view as never, event, false);
    expect(result).toBe(true);
    await vi.waitFor(() => expect(tr.insert).toHaveBeenCalledTimes(2));
  });

  it("inserts a dropped http(s) image URL directly (no file read), calls preventDefault, returns true", () => {
    const { view, tr, imageCreate } = fakeView({ posAtCoordsResult: { pos: 3 } });
    const event = fakeDragEvent({ uriListData: "https://example.com/pic.png" });

    const result = handleImageDrop(view as never, event, false);

    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(imageCreate).toHaveBeenCalledWith({ src: "https://example.com/pic.png" });
    expect(tr.insert).toHaveBeenCalledWith(3, expect.anything());
    expect(view.dispatch).toHaveBeenCalledTimes(1);
  });

  it("falls back to text/plain for the URL when text/uri-list is empty", () => {
    const { imageCreate } = fakeView();
    const view2 = fakeView({ posAtCoordsResult: { pos: 0 } }).view;
    const event = fakeDragEvent({ plainTextData: "http://example.com/img.jpg" });

    const result = handleImageDrop(view2 as never, event, false);
    expect(result).toBe(true);
    void imageCreate;
  });

  it("prefers text/uri-list over text/plain when both are present", () => {
    const { view, imageCreate } = fakeView({ posAtCoordsResult: { pos: 0 } });
    const event = fakeDragEvent({ uriListData: "https://a.example/1.png", plainTextData: "https://b.example/2.png" });

    handleImageDrop(view as never, event, false);
    expect(imageCreate).toHaveBeenCalledWith({ src: "https://a.example/1.png" });
  });

  it("ignores a non-http(s) URL (e.g. a relative path or javascript: URI) and returns false — no dispatch", () => {
    const { view } = fakeView();
    const event = fakeDragEvent({ uriListData: "javascript:alert(1)" });

    const result = handleImageDrop(view as never, event, false);

    expect(result).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it("trims whitespace around the dropped URL before validating it", () => {
    const { view, imageCreate } = fakeView({ posAtCoordsResult: { pos: 0 } });
    const event = fakeDragEvent({ uriListData: "  https://example.com/pic.png  " });

    const result = handleImageDrop(view as never, event, false);

    expect(result).toBe(true);
    expect(imageCreate).toHaveBeenCalledWith({ src: "https://example.com/pic.png" });
  });

  it("returns false and does not dispatch when the drop has neither image files nor a usable URL", () => {
    const { view } = fakeView();
    const event = fakeDragEvent({});

    const result = handleImageDrop(view as never, event, false);

    expect(result).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it("treats a missing dataTransfer as an empty drop (no crash), returning false", () => {
    const { view } = fakeView();
    const event = { clientX: 0, clientY: 0, dataTransfer: null, preventDefault: vi.fn() } as unknown as DragEvent;

    const result = handleImageDrop(view as never, event, false);

    expect(result).toBe(false);
  });
});
