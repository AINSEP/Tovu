import { describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@/lib/api";
import {
  DEFAULT_PAGE_SORT,
  lexicalPageSortButtonLabel,
  nextPageSortState,
  pageRowMenuItems,
  pageSortCaretGlyph,
  sortPages,
  sortPagesByStatus,
  sortPagesBySlug,
  sortPagesByTitle,
  sortPagesByUpdated,
  themePageRowMenuItems,
  updatedSortButtonLabel,
  updatedSortHeaderLabel,
  type PageSortState,
} from "../rules";
import type { ThemePageRow } from "../hooks/use-theme-pages.hooks";

/**
 * @file Pure logic for `features/pages/rules.ts`.
 *
 * `pageRowMenuItems` mirrors `features/posts/rules.ts`'s `postRowMenuItems` exactly (this feature's
 * own doc comment says so) — the branch worth pinning is the same one: "Disable" is omitted
 * entirely for a draft page rather than rendered disabled.
 */

const PUBLISHED_PAGE: AdminPost = {
  id: "pg1",
  workspaceId: "w1",
  kind: "page",
  title: "About",
  slug: "about",
  bodyJson: {},
  status: "published",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

const DRAFT_PAGE: AdminPost = { ...PUBLISHED_PAGE, id: "pg2", title: "Draft Page", status: "draft" };

function page(overrides: Partial<AdminPost> = {}): AdminPost {
  return { ...PUBLISHED_PAGE, ...overrides };
}

describe("pageRowMenuItems", () => {
  it("returns Edit, Disable, then Delete (in that order) for a published page", () => {
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit: vi.fn(), onDisable: vi.fn(), onDelete: vi.fn() }, "en");
    expect(items.map((i) => i.key)).toEqual(["edit", "disable", "delete"]);
  });

  it("omits Disable entirely (not a disabled entry) for a draft page", () => {
    const items = pageRowMenuItems(DRAFT_PAGE, { onEdit: vi.fn(), onDisable: vi.fn(), onDelete: vi.fn() }, "en");
    expect(items.map((i) => i.key)).toEqual(["edit", "delete"]);
    expect(items.find((i) => i.key === "disable")).toBeUndefined();
  });

  it("marks Delete destructive, and Edit/Disable not", () => {
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit: vi.fn(), onDisable: vi.fn(), onDelete: vi.fn() }, "en");
    expect(items.find((i) => i.key === "delete")).toMatchObject({ label: "Delete", destructive: true });
    expect(items.find((i) => i.key === "edit")).not.toHaveProperty("destructive", true);
    expect(items.find((i) => i.key === "disable")).not.toHaveProperty("destructive", true);
  });

  it("wires Edit's onSelect to onEdit with the page, and only onEdit", () => {
    const onEdit = vi.fn();
    const onDisable = vi.fn();
    const onDelete = vi.fn();
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit, onDisable, onDelete }, "en");
    items.find((i) => i.key === "edit")!.onSelect();
    expect(onEdit).toHaveBeenCalledWith(PUBLISHED_PAGE);
    expect(onDisable).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("wires Disable's onSelect to onDisable with the page, and only onDisable", () => {
    const onEdit = vi.fn();
    const onDisable = vi.fn();
    const onDelete = vi.fn();
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit, onDisable, onDelete }, "en");
    items.find((i) => i.key === "disable")!.onSelect();
    expect(onDisable).toHaveBeenCalledWith(PUBLISHED_PAGE);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("wires Delete's onSelect to onDelete with the page, and only onDelete", () => {
    const onEdit = vi.fn();
    const onDisable = vi.fn();
    const onDelete = vi.fn();
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit, onDisable, onDelete }, "en");
    items.find((i) => i.key === "delete")!.onSelect();
    expect(onDelete).toHaveBeenCalledWith(PUBLISHED_PAGE);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDisable).not.toHaveBeenCalled();
  });

  it("translates labels to Spanish when locale is es", () => {
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit: vi.fn(), onDisable: vi.fn(), onDelete: vi.fn() }, "es");
    expect(items.map((i) => i.label)).toEqual(["Editar", "Desactivar", "Eliminar"]);
  });
});

const THEME_ROW: ThemePageRow = {
  pageId: "about",
  filePath: "render/pages/about.html",
  published: false,
  resettable: true,
  collidingContent: null,
};

describe("themePageRowMenuItems", () => {
  it("returns exactly Details then Edit — no Disable/Delete, since a theme page has no PostRecord for either", () => {
    const items = themePageRowMenuItems(THEME_ROW, { onOpenDetails: vi.fn(), onEdit: vi.fn() }, (key) => key);
    expect(items.map((i) => i.key)).toEqual(["details", "edit"]);
    expect(items[0]).toMatchObject({ label: "Details" });
    expect(items[1]).toMatchObject({ label: "Edit" });
  });

  it("wires Details' onSelect to onOpenDetails with the row's own pageId, and only onOpenDetails", () => {
    const onOpenDetails = vi.fn();
    const onEdit = vi.fn();
    const items = themePageRowMenuItems(THEME_ROW, { onOpenDetails, onEdit }, (key) => key);
    items.find((i) => i.key === "details")!.onSelect();
    expect(onOpenDetails).toHaveBeenCalledWith("about");
    expect(onEdit).not.toHaveBeenCalled();
  });

  /**
   * PART 4 (2026-08-31): Edit moved out of `ThemePageDetailsModal.tsx`'s own footer into this menu,
   * directly under Details. Takes the row's bare `pageId` — same shape as `onOpenDetails` — rather
   * than building the Theme Studio href itself, since this module stays free of navigation (this
   * file's own header comment, and `rules.ts`'s `ThemePageRowMenuHandlers` doc); the caller
   * (`ThemePagesTab.tsx`) is the one place that turns it into `navigate(themeStudioHref(...))`.
   */
  it("wires Edit's onSelect to onEdit with the row's own pageId, and only onEdit", () => {
    const onOpenDetails = vi.fn();
    const onEdit = vi.fn();
    const items = themePageRowMenuItems(THEME_ROW, { onOpenDetails, onEdit }, (key) => key);
    items.find((i) => i.key === "edit")!.onSelect();
    expect(onEdit).toHaveBeenCalledWith("about");
    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  it("translates both labels through the given Translate function", () => {
    const items = themePageRowMenuItems(
      THEME_ROW,
      { onOpenDetails: vi.fn(), onEdit: vi.fn() },
      (key) => (key === "Details" ? "Detalles" : key === "Edit" ? "Editar" : key)
    );
    expect(items.map((i) => i.label)).toEqual(["Detalles", "Editar"]);
  });
});

/**
 * @file Multi-column sort (2026-09-02) — mirrors `features/posts/rules.ts`'s own test block for its
 * identical sort functions. "My Pages" had no sort code before this pass.
 */

describe("sortPagesByUpdated", () => {
  const oldest = page({ id: "pg-old", updatedAt: "2026-01-01T00:00:00.000Z" });
  const middle = page({ id: "pg-mid", updatedAt: "2026-06-01T00:00:00.000Z" });
  const newest = page({ id: "pg-new", updatedAt: "2026-08-10T00:00:00.000Z" });

  it("'newest' sorts most-recently-updated first", () => {
    expect(sortPagesByUpdated([middle, oldest, newest], "newest").map((p) => p.id)).toEqual(["pg-new", "pg-mid", "pg-old"]);
  });

  it("'oldest' sorts least-recently-updated first", () => {
    expect(sortPagesByUpdated([middle, oldest, newest], "oldest").map((p) => p.id)).toEqual(["pg-old", "pg-mid", "pg-new"]);
  });

  it("returns [] for an empty list in either direction", () => {
    expect(sortPagesByUpdated([], "newest")).toEqual([]);
    expect(sortPagesByUpdated([], "oldest")).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [middle, oldest, newest];
    const original = [...input];
    sortPagesByUpdated(input, "newest");
    expect(input).toEqual(original);
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

describe("sortPagesByTitle / sortPagesBySlug", () => {
  const a = page({ id: "pg-a", title: "Alpha", slug: "alpha" });
  const b = page({ id: "pg-b", title: "Bravo", slug: "bravo" });
  const c = page({ id: "pg-c", title: "Charlie", slug: "charlie" });

  for (const [name, fn] of [
    ["sortPagesByTitle", sortPagesByTitle],
    ["sortPagesBySlug", sortPagesBySlug],
  ] as const) {
    describe(name, () => {
      it("'asc' sorts A-to-Z", () => {
        expect(fn([c, a, b], "asc").map((p) => p.id)).toEqual(["pg-a", "pg-b", "pg-c"]);
      });

      it("'desc' sorts Z-to-A", () => {
        expect(fn([c, a, b], "desc").map((p) => p.id)).toEqual(["pg-c", "pg-b", "pg-a"]);
      });

      it("returns [] for an empty list in either direction", () => {
        expect(fn([], "asc")).toEqual([]);
        expect(fn([], "desc")).toEqual([]);
      });

      it("does not mutate the input array", () => {
        const input = [c, a, b];
        const original = [...input];
        fn(input, "asc");
        expect(input).toEqual(original);
      });
    });
  }
});

describe("sortPagesByStatus", () => {
  // Exactly two pages with different statuses — see `posts/rules.ts`'s own test for why a third,
  // necessarily-tied row would test `Array#sort`'s stability rather than this comparator.
  const draft = page({ id: "pg-draft", status: "draft" });
  const published = page({ id: "pg-published", status: "published" });

  it("'asc' sorts draft before published", () => {
    expect(sortPagesByStatus([published, draft], "asc").map((p) => p.id)).toEqual(["pg-draft", "pg-published"]);
  });

  it("'desc' sorts published before draft", () => {
    expect(sortPagesByStatus([draft, published], "desc").map((p) => p.id)).toEqual(["pg-published", "pg-draft"]);
  });

  it("returns [] for an empty list in either direction", () => {
    expect(sortPagesByStatus([], "asc")).toEqual([]);
    expect(sortPagesByStatus([], "desc")).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [published, draft];
    const original = [...input];
    sortPagesByStatus(input, "asc");
    expect(input).toEqual(original);
  });
});

describe("sortPages (dispatcher)", () => {
  const a = page({ id: "pg-a", title: "Alpha", slug: "alpha", status: "draft", updatedAt: "2026-01-01T00:00:00.000Z" });
  const b = page({ id: "pg-b", title: "Bravo", slug: "bravo", status: "published", updatedAt: "2026-08-01T00:00:00.000Z" });

  it("dispatches 'title' to sortPagesByTitle", () => {
    expect(sortPages([b, a], { column: "title", direction: "asc" }).map((p) => p.id)).toEqual(["pg-a", "pg-b"]);
  });

  it("dispatches 'slug' to sortPagesBySlug", () => {
    expect(sortPages([b, a], { column: "slug", direction: "asc" }).map((p) => p.id)).toEqual(["pg-a", "pg-b"]);
  });

  it("dispatches 'status' to sortPagesByStatus", () => {
    expect(sortPages([b, a], { column: "status", direction: "asc" }).map((p) => p.id)).toEqual(["pg-a", "pg-b"]);
  });

  it("dispatches 'updated' to sortPagesByUpdated, mapping 'desc' to newest-first", () => {
    expect(sortPages([a, b], { column: "updated", direction: "desc" }).map((p) => p.id)).toEqual(["pg-b", "pg-a"]);
  });

  it("dispatches 'updated' to sortPagesByUpdated, mapping 'asc' to oldest-first", () => {
    expect(sortPages([b, a], { column: "updated", direction: "asc" }).map((p) => p.id)).toEqual(["pg-a", "pg-b"]);
  });

  it("DEFAULT_PAGE_SORT reproduces Updated/newest-first, consistent with Posts' own default", () => {
    expect(sortPages([a, b], DEFAULT_PAGE_SORT).map((p) => p.id)).toEqual(["pg-b", "pg-a"]);
  });

  it("does not mutate the input array", () => {
    const input = [b, a];
    const original = [...input];
    sortPages(input, { column: "title", direction: "asc" });
    expect(input).toEqual(original);
  });
});

describe("nextPageSortState", () => {
  it("clicking a column that isn't active makes it active at its default direction, cancelling the previous column", () => {
    const current: PageSortState = { column: "updated", direction: "desc" };
    expect(nextPageSortState(current, "title")).toEqual({ column: "title", direction: "asc" });
  });

  it("clicking the already-active lexicographic column toggles asc -> desc", () => {
    const current: PageSortState = { column: "title", direction: "asc" };
    expect(nextPageSortState(current, "title")).toEqual({ column: "title", direction: "desc" });
  });

  it("clicking the already-active lexicographic column toggles desc -> asc", () => {
    const current: PageSortState = { column: "title", direction: "desc" };
    expect(nextPageSortState(current, "title")).toEqual({ column: "title", direction: "asc" });
  });

  it("switching TO Updated from another column defaults to 'desc' (newest first)", () => {
    const current: PageSortState = { column: "title", direction: "asc" };
    expect(nextPageSortState(current, "updated")).toEqual({ column: "updated", direction: "desc" });
  });

  it("clicking the already-active Updated column toggles desc -> asc", () => {
    const current: PageSortState = { column: "updated", direction: "desc" };
    expect(nextPageSortState(current, "updated")).toEqual({ column: "updated", direction: "asc" });
  });
});

describe("pageSortCaretGlyph", () => {
  it("shows the neutral both-direction glyph for a column that isn't the active sort", () => {
    expect(pageSortCaretGlyph("title", { column: "updated", direction: "desc" })).toBe(" ⇅");
  });

  it("shows an upward caret for the active column sorted ascending", () => {
    expect(pageSortCaretGlyph("title", { column: "title", direction: "asc" })).toBe(" ▲");
  });

  it("shows a downward caret for the active column sorted descending", () => {
    expect(pageSortCaretGlyph("title", { column: "title", direction: "desc" })).toBe(" ▼");
  });

  it("the three states are all distinct", () => {
    const notActive = pageSortCaretGlyph("title", { column: "updated", direction: "desc" });
    const asc = pageSortCaretGlyph("title", { column: "title", direction: "asc" });
    const desc = pageSortCaretGlyph("title", { column: "title", direction: "desc" });
    expect(new Set([notActive, asc, desc]).size).toBe(3);
  });
});

describe("lexicalPageSortButtonLabel", () => {
  it("states 'not sorted' and names the ascending action when the column isn't active", () => {
    const label = lexicalPageSortButtonLabel("Title", "title", { column: "updated", direction: "desc" });
    expect(label).toMatch(/not sorted by title/i);
    expect(label).toMatch(/activate to sort ascending/i);
  });

  it("states 'ascending' and offers descending as the next action when the column is active ascending", () => {
    const label = lexicalPageSortButtonLabel("Title", "title", { column: "title", direction: "asc" });
    expect(label).toMatch(/sorted by title, ascending/i);
    expect(label).toMatch(/activate to sort descending/i);
  });

  it("states 'descending' and offers ascending as the next action when the column is active descending", () => {
    const label = lexicalPageSortButtonLabel("Title", "title", { column: "title", direction: "desc" });
    expect(label).toMatch(/sorted by title, descending/i);
    expect(label).toMatch(/activate to sort ascending/i);
  });

  it("all three states produce different labels", () => {
    const notSorted = lexicalPageSortButtonLabel("Title", "title", { column: "updated", direction: "desc" });
    const asc = lexicalPageSortButtonLabel("Title", "title", { column: "title", direction: "asc" });
    const desc = lexicalPageSortButtonLabel("Title", "title", { column: "title", direction: "desc" });
    expect(new Set([notSorted, asc, desc]).size).toBe(3);
  });
});

describe("updatedSortHeaderLabel", () => {
  it("states 'not sorted by updated date' when another column is active", () => {
    const label = updatedSortHeaderLabel({ column: "title", direction: "asc" });
    expect(label).toMatch(/not sorted by updated date/i);
    expect(label).toMatch(/newest first/i);
  });

  it("delegates to updatedSortButtonLabel('newest') when active and 'desc'", () => {
    expect(updatedSortHeaderLabel({ column: "updated", direction: "desc" })).toBe(updatedSortButtonLabel("newest"));
  });

  it("delegates to updatedSortButtonLabel('oldest') when active and 'asc'", () => {
    expect(updatedSortHeaderLabel({ column: "updated", direction: "asc" })).toBe(updatedSortButtonLabel("oldest"));
  });
});
