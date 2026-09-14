import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_POST_SORT,
  buildPostAutosaveDraft,
  buildPostRowMenuHandleMap,
  isAutosaveDraftStale,
  postAutosaveBannerMessage,
  postAutosaveStaleBasisMessage,
  postVersionConflictMessage,
  readPostVersionConflict,
  resolvePostPreviewBranches,
  comparePostsByStatus,
  comparePostsBySlug,
  comparePostsByTitle,
  comparePostsByUpdated,
  droppedUri,
  handleImageDrop,
  postColumnSortLabel,
  postRowMenuItems,
  readFileAsDataUrl,
  titleNodeText,
  toolbarBtnClass,
  updatedColumnSortLabel,
  withTitleNode,
} from "../rules";
import { ApiError, type AdminPost } from "@/lib/api";

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

describe("buildPostRowMenuHandleMap", () => {
  it("returns an empty map for null (not-yet-loaded) posts", () => {
    expect(buildPostRowMenuHandleMap(null).size).toBe(0);
  });

  it("returns an empty map for an empty list", () => {
    expect(buildPostRowMenuHandleMap([]).size).toBe(0);
  });

  it("keys the handle by post id, not by array position", () => {
    const a = post({ id: "a" });
    const b = post({ id: "b" });
    const map = buildPostRowMenuHandleMap([a, b]);
    expect(map.get("a")).toBe("posts-row-a");
    expect(map.get("b")).toBe("posts-row-b");
  });

  it("keeps each post's handle stable when the list is reordered", () => {
    const a = post({ id: "a" });
    const b = post({ id: "b" });
    const forward = buildPostRowMenuHandleMap([a, b]);
    const reordered = buildPostRowMenuHandleMap([b, a]);
    expect(reordered.get("a")).toBe(forward.get("a"));
    expect(reordered.get("b")).toBe(forward.get("b"));
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

/**
 * Sort dispatch, the header-click transition, the caret glyph, and multi-column-cancels-previous
 * behavior all moved onto `DataTable`'s own shared mechanism (2026-09-02 migration — see `rules.ts`'s
 * "Column sort" section, and `Posts.unit.test.tsx`'s "Title/Slug/Status column sort" describe block,
 * which still exercises every one of those through the real rendered table). What's left testable
 * here, independent of any table, is each column's own comparator direction and its accessible-name
 * phrasing — the two things `DataTable` cannot supply generically and still asks this module for.
 */
describe("comparePostsByUpdated", () => {
  const oldest = post({ id: "p-old", updatedAt: "2026-01-01T00:00:00.000Z" });
  const middle = post({ id: "p-mid", updatedAt: "2026-06-01T00:00:00.000Z" });
  const newest = post({ id: "p-new", updatedAt: "2026-08-10T00:00:00.000Z" });

  it("ascending order (DataTable's ' asc') sorts least-recently-updated first", () => {
    const result = [middle, oldest, newest].sort(comparePostsByUpdated);
    expect(result.map((p) => p.id)).toEqual(["p-old", "p-mid", "p-new"]);
  });

  it("negating it (DataTable's 'desc') sorts most-recently-updated first", () => {
    const result = [middle, oldest, newest].sort((a, b) => -comparePostsByUpdated(a, b));
    expect(result.map((p) => p.id)).toEqual(["p-new", "p-mid", "p-old"]);
  });
});

describe("updatedColumnSortLabel", () => {
  it("states 'not sorted by updated date' and offers newest-first when direction is null (a different column is active)", () => {
    const label = updatedColumnSortLabel(null);
    expect(label).toMatch(/not sorted by updated date/i);
    expect(label).toMatch(/newest first/i);
  });

  it("states 'newest first' and offers oldest-first as the next action when direction is 'desc'", () => {
    const label = updatedColumnSortLabel("desc");
    expect(label).toMatch(/newest first/i);
    expect(label).toMatch(/oldest first/i);
  });

  it("states 'oldest first' and offers newest-first as the next action when direction is 'asc'", () => {
    const label = updatedColumnSortLabel("asc");
    expect(label).toMatch(/oldest first/i);
    expect(label).toMatch(/newest first/i);
  });

  it("all three states produce different labels", () => {
    expect(new Set([updatedColumnSortLabel(null), updatedColumnSortLabel("asc"), updatedColumnSortLabel("desc")]).size).toBe(3);
  });
});

describe("comparePostsByTitle / comparePostsBySlug", () => {
  const a = post({ id: "p-a", title: "Alpha", slug: "alpha" });
  const b = post({ id: "p-b", title: "Bravo", slug: "bravo" });
  const c = post({ id: "p-c", title: "Charlie", slug: "charlie" });

  for (const [name, fn] of [
    ["comparePostsByTitle", comparePostsByTitle],
    ["comparePostsBySlug", comparePostsBySlug],
  ] as const) {
    describe(name, () => {
      it("sorts A-to-Z ascending", () => {
        const result = [c, a, b].sort(fn);
        expect(result.map((p) => p.id)).toEqual(["p-a", "p-b", "p-c"]);
      });

      it("negating it sorts Z-to-A", () => {
        const result = [c, a, b].sort((x, y) => -fn(x, y));
        expect(result.map((p) => p.id)).toEqual(["p-c", "p-b", "p-a"]);
      });
    });
  }
});

describe("comparePostsByStatus", () => {
  // Exactly two posts with different statuses — `status` only has two possible values
  // ("draft" | "published"), so a third row would necessarily tie with one of these and the
  // resulting order among ties would depend on `Array#sort`'s stability rather than on this
  // comparator's own direction logic, which is what this block means to isolate.
  const draft = post({ id: "p-draft", status: "draft" });
  const published = post({ id: "p-published", status: "published" });

  it("ascending sorts draft before published (alphabetical, which happens to equal domain order)", () => {
    expect([published, draft].sort(comparePostsByStatus).map((p) => p.id)).toEqual(["p-draft", "p-published"]);
  });

  it("negating it sorts published before draft", () => {
    expect([draft, published].sort((a, b) => -comparePostsByStatus(a, b)).map((p) => p.id)).toEqual([
      "p-published",
      "p-draft",
    ]);
  });
});

describe("DEFAULT_POST_SORT", () => {
  it("is Updated, newest-first — unchanged from the pre-existing Updated-only default", () => {
    expect(DEFAULT_POST_SORT).toEqual({ column: "updated", direction: "desc" });
  });
});

describe("postColumnSortLabel", () => {
  it("states 'not sorted' and names the ascending action when direction is null (the column isn't active)", () => {
    const label = postColumnSortLabel("Title", null);
    expect(label).toMatch(/not sorted by title/i);
    expect(label).toMatch(/activate to sort ascending/i);
  });

  it("states 'ascending' and offers descending as the next action when direction is 'asc'", () => {
    const label = postColumnSortLabel("Title", "asc");
    expect(label).toMatch(/sorted by title, ascending/i);
    expect(label).toMatch(/activate to sort descending/i);
  });

  it("states 'descending' and offers ascending as the next action when direction is 'desc'", () => {
    const label = postColumnSortLabel("Title", "desc");
    expect(label).toMatch(/sorted by title, descending/i);
    expect(label).toMatch(/activate to sort ascending/i);
  });

  it("all three states produce different labels", () => {
    expect(new Set([postColumnSortLabel("Title", null), postColumnSortLabel("Title", "asc"), postColumnSortLabel("Title", "desc")]).size).toBe(3);
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

  // A dropped local FILE is deliberately UNHANDLED here as of 2026-08-12 (B1, file-handler
  // drag/paste upload) — see `handleImageDrop`'s own doc for why returning `true`/dispatching here
  // would make `@tiptap/extension-file-handler`'s own `onDrop` (`use-post-editor.hooks.ts`'s
  // `handleFileDrop`, which now owns local file drops end-to-end: upload + ref-based insert) silently
  // unreachable. This replaces the three tests that used to assert the old base64-inlining behavior.
  it("does NOT handle a dropped image file — returns false, no preventDefault, no dispatch (FileHandler's own onDrop must be reachable instead)", () => {
    const { view } = fakeView({ posAtCoordsResult: { pos: 5 } });
    const file = new File(["img-bytes"], "photo.png", { type: "image/png" });
    const event = fakeDragEvent({ files: [file] });

    const result = handleImageDrop(view as never, event, false);

    expect(result).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it("falls back to the current selection's end position when posAtCoords returns null (URI-drop path — the file-drop path that used to cover this fallback no longer exists here)", () => {
    const { view, tr } = fakeView({ posAtCoordsResult: null, selectionTo: 42 });
    const event = fakeDragEvent({ uriListData: "https://example.com/pic.png" });

    const result = handleImageDrop(view as never, event, false);

    expect(result).toBe(true);
    expect(tr.insert).toHaveBeenCalledWith(42, expect.anything());
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

describe("withTitleNode", () => {
  it("prepends a title node synthesized from `title`, appending nothing extra, when the doc already has block content", () => {
    const bodyJson = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }] };

    const result = withTitleNode(bodyJson, "My Post");

    expect(result).toEqual({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "My Post" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body." }] },
      ],
    });
  });

  it("appends one empty paragraph when the source has no block content at all — the schema requires at least one block", () => {
    const result = withTitleNode({ type: "doc", content: [] }, "My Post");

    expect(result).toEqual({
      type: "doc",
      content: [{ type: "title", content: [{ type: "text", text: "My Post" }] }, { type: "paragraph" }],
    });
  });

  it("passes an already-migrated doc through unchanged, ignoring `title` entirely (the node, not the field, is authoritative once one exists)", () => {
    const bodyJson = {
      type: "doc",
      content: [
        { type: "title", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Existing" }] },
        { type: "paragraph" },
      ],
    };

    const result = withTitleNode(bodyJson, "Stale Field Value");

    expect(result).toBe(bodyJson); // same reference — no copy made when nothing needs changing
  });

  it("treats null/undefined bodyJson (a brand-new post) the same as an empty doc", () => {
    expect(withTitleNode(null, "New Post")).toEqual({
      type: "doc",
      content: [{ type: "title", content: [{ type: "text", text: "New Post" }] }, { type: "paragraph" }],
    });
    expect(withTitleNode(undefined, "New Post")).toEqual({
      type: "doc",
      content: [{ type: "title", content: [{ type: "text", text: "New Post" }] }, { type: "paragraph" }],
    });
  });

  it("synthesizes a title node with empty content (not a text node with an empty string) when `title` is empty", () => {
    const result = withTitleNode({ type: "doc", content: [{ type: "paragraph" }] }, "");

    expect(result).toEqual({ type: "doc", content: [{ type: "title", content: [] }, { type: "paragraph" }] });
  });

  it("treats a non-object bodyJson (malformed/corrupt) the same as an empty doc, never throwing", () => {
    expect(withTitleNode("not a doc", "T")).toEqual({
      type: "doc",
      content: [{ type: "title", content: [{ type: "text", text: "T" }] }, { type: "paragraph" }],
    });
  });

  it("multiple pre-existing blocks are all preserved, in order, after the synthesized title", () => {
    const bodyJson = {
      type: "doc",
      content: [{ type: "heading", attrs: { level: 2 } }, { type: "paragraph" }, { type: "bulletList" }],
    };

    const result = withTitleNode(bodyJson, "T");

    expect((result.content as unknown[]).map((n) => (n as { type: string }).type)).toEqual([
      "title",
      "heading",
      "paragraph",
      "bulletList",
    ]);
  });
});

describe("titleNodeText", () => {
  it("joins the title node's text children into one plain string", () => {
    const bodyJson = {
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Fresh " }, { type: "text", text: "Title" }] },
        { type: "paragraph" },
      ],
    };

    expect(titleNodeText(bodyJson)).toBe("Fresh Title");
  });

  it("returns '' for an empty title node (not undefined, not a crash)", () => {
    expect(titleNodeText({ type: "doc", content: [{ type: "title", content: [] }] })).toBe("");
  });

  it("returns '' when the doc has no title node at all (pre-migration shape, before withTitleNode has run)", () => {
    expect(titleNodeText({ type: "doc", content: [{ type: "paragraph" }] })).toBe("");
  });

  it("returns '' for null/undefined/malformed input, never throwing", () => {
    expect(titleNodeText(null)).toBe("");
    expect(titleNodeText(undefined)).toBe("");
    expect(titleNodeText("not a doc")).toBe("");
    expect(titleNodeText({ type: "doc" })).toBe("");
  });

  it("ignores a non-text inline child (e.g. a future inline node type) rather than throwing", () => {
    const bodyJson = { type: "doc", content: [{ type: "title", content: [{ type: "text", text: "A" }, { type: "hardBreak" }] }] };

    expect(titleNodeText(bodyJson)).toBe("A");
  });

  it("round-trips through withTitleNode: extracting the text back out of a freshly synthesized doc returns the original title", () => {
    const synthesized = withTitleNode({ type: "doc", content: [] }, "Round Trip");
    expect(titleNodeText(synthesized)).toBe("Round Trip");
  });
});

describe("resolvePostPreviewBranches", () => {
  it.each([
    { status: "published", dirty: false, contentDirty: false, expected: "canShowLiveSite" },
    { status: "published", dirty: true, contentDirty: false, expected: "canShowTemplatePreview" },
    { status: "published", dirty: true, contentDirty: true, expected: "canShowPendingContentPreview" },
    // The clean brand-new draft: before the shared helper, the hook's copy of this condition said
    // `false` here while `PostPreview`'s said `true`, and the preview iframe sat at about:blank.
    { status: "draft", dirty: false, contentDirty: false, expected: "canShowPendingContentPreview" },
    { status: "draft", dirty: true, contentDirty: true, expected: "canShowPendingContentPreview" },
  ] as const)("$status dirty=$dirty contentDirty=$contentDirty -> $expected", ({ status, dirty, contentDirty, expected }) => {
    const branches = resolvePostPreviewBranches({ status, dirty, contentDirty });
    expect(branches).toEqual({
      canShowLiveSite: expected === "canShowLiveSite",
      canShowTemplatePreview: expected === "canShowTemplatePreview",
      canShowPendingContentPreview: expected === "canShowPendingContentPreview",
    });
  });

  it("selects exactly one branch for every status x dirty x contentDirty combination, including the impossible ones", () => {
    for (const status of ["draft", "published"] as const) {
      for (const dirty of [false, true]) {
        for (const contentDirty of [false, true]) {
          const branches = resolvePostPreviewBranches({ status, dirty, contentDirty });
          expect(Object.values(branches).filter(Boolean), JSON.stringify({ status, dirty, contentDirty })).toHaveLength(1);
        }
      }
    }
  });
});

describe("buildPostAutosaveDraft", () => {
  it("always sends bodyFormat 'doc' — a Post can never carry bodyFormat 'html'", () => {
    const bodyJson = { type: "doc", content: [{ type: "paragraph" }] };
    const draft = buildPostAutosaveDraft({ version: 5 }, { title: "Hello", slug: "hello", bodyJson });
    expect(draft).toEqual({ bodyFormat: "doc", bodyJson, title: "Hello", slug: "hello", baseVersion: 5 });
  });

  it("baseVersion always comes from the post's own version, not a caller-supplied guess", () => {
    const draft = buildPostAutosaveDraft({ version: 42 }, { title: "T", slug: "t", bodyJson: {} });
    expect(draft.baseVersion).toBe(42);
  });
});

describe("isAutosaveDraftStale", () => {
  it("is false when the draft's baseVersion still matches the row's current version", () => {
    expect(isAutosaveDraftStale(3, 3)).toBe(false);
  });

  it("is true once a real save has moved the row's version past the draft's basis", () => {
    expect(isAutosaveDraftStale(3, 4)).toBe(true);
  });
});

describe("postAutosaveBannerMessage", () => {
  const NOW = new Date("2026-09-06T00:10:00.000Z").getTime();

  it("a fresh draft reads 'Unsaved changes from N minutes ago'", () => {
    expect(postAutosaveBannerMessage("2026-09-06T00:05:00.000Z", NOW, false)).toBe(
      "Unsaved changes from 5 minutes ago"
    );
  });

  it("a stale draft names the newer save explicitly instead of implying it is current", () => {
    expect(postAutosaveBannerMessage("2026-09-06T00:05:00.000Z", NOW, true)).toBe(
      "Unsaved changes from before a newer save (captured 5 minutes ago)"
    );
  });
});

describe("readPostVersionConflict / postVersionConflictMessage", () => {
  /**
   * The trap this whole pair exists for: `PUT /posts/:id` returns 409 for BOTH a slug-uniqueness
   * collision and a stale version, from the same `PostConflictError` hierarchy. Only the version
   * one carries `code: "VERSION_CONFLICT"`, so a status-only check would send an operator into the
   * "someone else saved" flow for a duplicate slug — and, worse, tell them their edit is safe to
   * force through.
   */
  it("does NOT classify a slug-uniqueness 409 (same status, no code) as a version conflict", () => {
    const slugConflict = new ApiError("slug 'taken' already exists", 409);
    expect(readPostVersionConflict(slugConflict, undefined)).toBeNull();
  });

  it("classifies a 409 VERSION_CONFLICT, carrying both versions and the attempted status", () => {
    const err = new ApiError("post 'p1' was modified by another save (expected version 3, current version 4)", 409, "VERSION_CONFLICT", {
      details: { expectedVersion: 3, currentVersion: 4 },
    });
    expect(readPostVersionConflict(err, "published")).toEqual({
      expectedVersion: 3,
      currentVersion: 4,
      attemptedStatus: "published",
    });
  });

  it("still reports a conflict when the server sent the code but no details bag", () => {
    const err = new ApiError("stale", 409, "VERSION_CONFLICT");
    expect(readPostVersionConflict(err, undefined)).toEqual({
      expectedVersion: null,
      currentVersion: null,
      attemptedStatus: undefined,
    });
  });

  it("ignores the code on a non-409 status, and any non-ApiError", () => {
    expect(readPostVersionConflict(new ApiError("nope", 500, "VERSION_CONFLICT"), undefined)).toBeNull();
    expect(readPostVersionConflict(new Error("network down"), undefined)).toBeNull();
    expect(readPostVersionConflict("not an error at all", undefined)).toBeNull();
  });

  it("says the work is unsaved AND still present, naming both versions", () => {
    expect(postVersionConflictMessage({ expectedVersion: 3, currentVersion: 4, attemptedStatus: undefined })).toBe(
      "Someone else saved this while you were editing — you were working from version 3, and version 4 is now stored. " +
        "Your changes were NOT saved, and are still here in the editor. Saving again will replace their version."
    );
  });

  it("degrades to prose rather than printing 'version null' when the server omitted the details", () => {
    expect(postVersionConflictMessage({ expectedVersion: null, currentVersion: null, attemptedStatus: undefined })).toBe(
      "Someone else saved this while you were editing — you were working from the version you loaded, and a newer version is now stored. " +
        "Your changes were NOT saved, and are still here in the editor. Saving again will replace their version."
    );
  });
});

/**
 * The stale-basis notice's copy, pinned literally. `toBe` on the whole sentence, not a substring
 * match: this is the only thing an operator ever learns about a running editor that has silently
 * stopped persisting their work, so each clause is load-bearing and a reworded one should have to be
 * a deliberate edit here. In particular it must never grow a promise that the text is recoverable
 * after a reload — see the function's own doc for why that promise cannot be kept.
 */
describe("postAutosaveStaleBasisMessage", () => {
  const EXPECTED =
    "Someone else saved this while you were editing — you were working from version 4, so autosaving " +
    "has paused and nothing you type now is being stored. Your changes were NOT saved, and are still " +
    "here in the editor. Reload to pick up their version and resume autosaving; copy anything you " +
    "want to keep first.";

  it("names the basis the operator was working from, and states all four facts they cannot infer", () => {
    const message = postAutosaveStaleBasisMessage({ baseVersion: 4, draft: {
      bodyFormat: "doc",
      bodyJson: { type: "doc", content: [] },
      title: "Hello world",
      slug: "hello-world",
      baseVersion: 4,
    } });

    expect(message).toBe(EXPECTED);
    // Spelled out so a reword that drops one of them fails here rather than silently shipping.
    expect(message).toContain("version 4");
    expect(message).toContain("autosaving has paused");
    expect(message).toContain("were NOT saved");
    expect(message).toContain("still here in the editor");
  });

  it("promises no recovery it cannot deliver — the browser-storage mirror is best-effort and unnamed", () => {
    const message = postAutosaveStaleBasisMessage({ baseVersion: 4, draft: {
      bodyFormat: "doc",
      bodyJson: { type: "doc", content: [] },
      title: "Hello world",
      slug: "hello-world",
      baseVersion: 4,
    } });

    expect(message).not.toMatch(/restore|recover|saved locally|in your browser/i);
  });
});
