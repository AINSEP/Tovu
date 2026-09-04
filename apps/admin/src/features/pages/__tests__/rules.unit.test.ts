import { describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@/lib/api";
import {
  DEFAULT_PAGE_SORT,
  comparePagesByStatus,
  comparePagesBySlug,
  comparePagesByTitle,
  comparePagesByUpdated,
  pageAdminPath,
  pageColumnSortLabel,
  pagePublicPath,
  pageRowMenuItems,
  themePageRowMenuItems,
  updatedPageColumnSortLabel,
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

/**
 * Sort dispatch, the header-click transition, the caret glyph, and multi-column-cancels-previous
 * behavior all moved onto `DataTable`'s own shared mechanism (2026-09-02 migration — see `rules.ts`'s
 * "Column sort" section, and `Pages.unit.test.tsx`'s "Title/Slug/Status column sort" describe block,
 * which still exercises every one of those through the real rendered table). What's left testable
 * here, independent of any table, is each column's own comparator direction and its accessible-name
 * phrasing — mirrors `posts/__tests__/rules.unit.test.ts`'s identical section.
 */
describe("comparePagesByUpdated", () => {
  const oldest = page({ id: "pg-old", updatedAt: "2026-01-01T00:00:00.000Z" });
  const middle = page({ id: "pg-mid", updatedAt: "2026-06-01T00:00:00.000Z" });
  const newest = page({ id: "pg-new", updatedAt: "2026-08-10T00:00:00.000Z" });

  it("ascending order (DataTable's 'asc') sorts least-recently-updated first", () => {
    expect([middle, oldest, newest].sort(comparePagesByUpdated).map((p) => p.id)).toEqual(["pg-old", "pg-mid", "pg-new"]);
  });

  it("negating it (DataTable's 'desc') sorts most-recently-updated first", () => {
    expect([middle, oldest, newest].sort((a, b) => -comparePagesByUpdated(a, b)).map((p) => p.id)).toEqual([
      "pg-new",
      "pg-mid",
      "pg-old",
    ]);
  });
});

describe("updatedPageColumnSortLabel", () => {
  it("states 'not sorted by updated date' and offers newest-first when direction is null", () => {
    const label = updatedPageColumnSortLabel(null);
    expect(label).toMatch(/not sorted by updated date/i);
    expect(label).toMatch(/newest first/i);
  });

  it("states 'newest first' and offers oldest-first as the next action when direction is 'desc'", () => {
    const label = updatedPageColumnSortLabel("desc");
    expect(label).toMatch(/newest first/i);
    expect(label).toMatch(/oldest first/i);
  });

  it("states 'oldest first' and offers newest-first as the next action when direction is 'asc'", () => {
    const label = updatedPageColumnSortLabel("asc");
    expect(label).toMatch(/oldest first/i);
    expect(label).toMatch(/newest first/i);
  });

  it("all three states produce different labels", () => {
    expect(new Set([updatedPageColumnSortLabel(null), updatedPageColumnSortLabel("asc"), updatedPageColumnSortLabel("desc")]).size).toBe(3);
  });
});

describe("comparePagesByTitle / comparePagesBySlug", () => {
  const a = page({ id: "pg-a", title: "Alpha", slug: "alpha" });
  const b = page({ id: "pg-b", title: "Bravo", slug: "bravo" });
  const c = page({ id: "pg-c", title: "Charlie", slug: "charlie" });

  for (const [name, fn] of [
    ["comparePagesByTitle", comparePagesByTitle],
    ["comparePagesBySlug", comparePagesBySlug],
  ] as const) {
    describe(name, () => {
      it("sorts A-to-Z ascending", () => {
        expect([c, a, b].sort(fn).map((p) => p.id)).toEqual(["pg-a", "pg-b", "pg-c"]);
      });

      it("negating it sorts Z-to-A", () => {
        expect([c, a, b].sort((x, y) => -fn(x, y)).map((p) => p.id)).toEqual(["pg-c", "pg-b", "pg-a"]);
      });
    });
  }
});

describe("comparePagesByStatus", () => {
  // Exactly two pages with different statuses — see `posts/rules.ts`'s own test for why a third,
  // necessarily-tied row would test `Array#sort`'s stability rather than this comparator.
  const draft = page({ id: "pg-draft", status: "draft" });
  const published = page({ id: "pg-published", status: "published" });

  it("ascending sorts draft before published", () => {
    expect([published, draft].sort(comparePagesByStatus).map((p) => p.id)).toEqual(["pg-draft", "pg-published"]);
  });

  it("negating it sorts published before draft", () => {
    expect([draft, published].sort((a, b) => -comparePagesByStatus(a, b)).map((p) => p.id)).toEqual([
      "pg-published",
      "pg-draft",
    ]);
  });
});

describe("pagePublicPath", () => {
  it("renders the root slug as '/' rather than doubling it into '//'", () => {
    expect(pagePublicPath("/")).toBe("/");
  });

  it("prefixes an ordinary slug with a single leading slash", () => {
    expect(pagePublicPath("about")).toBe("/about");
  });

  it("does not special-case a slug that merely starts with a slash but isn't exactly '/'", () => {
    // Not a real slug shape today (post.ts's isValidSlugFormat rejects it), but the function's own
    // equality check (`slug === "/"`) is what matters here, not slug-format validation elsewhere.
    expect(pagePublicPath("/about")).toBe("//about");
  });
});

/**
 * `pageAdminPath` (2026-09-03 consolidation pass) — the one place that now decides slug-vs-id for
 * every page-editor admin link (`Pages.tsx`'s title link and row-menu Edit, `ThemeExplore.tsx`'s and
 * `use-theme-pages.hooks.ts`'s collision links). Regression coverage for the bug family this
 * replaces: `45101306` fixed the root-slug page by switching every link to id, which broke readable
 * URLs for every ordinary page; this pins both halves — slug for the ordinary case, id only for the
 * one page a slug can't express as a path segment.
 */
describe("pageAdminPath", () => {
  it("prefers the slug for an ordinary page", () => {
    expect(pageAdminPath({ id: "pg1", slug: "about" })).toBe("/pages/about");
  });

  it("falls back to the id for a page holding the literal root slug '/'", () => {
    // Must FAIL if this collapses back to `/pages/${slug}` — `/pages//` cannot match the admin
    // router's `/:slug` pattern (`panels.tsx`) and the link silently does nothing.
    expect(pageAdminPath({ id: "home-1", slug: "/" })).toBe("/pages/home-1");
  });

  it("does not special-case a slug that merely starts with a slash but isn't exactly '/'", () => {
    // Not a real slug shape today (post.ts's isValidSlugFormat rejects it) — mirrors
    // `pagePublicPath`'s identical test above: the equality check is what matters here, not
    // slug-format validation elsewhere.
    expect(pageAdminPath({ id: "pg1", slug: "/about" })).toBe("/pages//about");
  });
});

describe("DEFAULT_PAGE_SORT", () => {
  it("is Updated, newest-first, consistent with Posts' own default", () => {
    expect(DEFAULT_PAGE_SORT).toEqual({ column: "updated", direction: "desc" });
  });
});

describe("pageColumnSortLabel", () => {
  it("states 'not sorted' and names the ascending action when direction is null (the column isn't active)", () => {
    const label = pageColumnSortLabel("Title", null);
    expect(label).toMatch(/not sorted by title/i);
    expect(label).toMatch(/activate to sort ascending/i);
  });

  it("states 'ascending' and offers descending as the next action when direction is 'asc'", () => {
    const label = pageColumnSortLabel("Title", "asc");
    expect(label).toMatch(/sorted by title, ascending/i);
    expect(label).toMatch(/activate to sort descending/i);
  });

  it("states 'descending' and offers ascending as the next action when direction is 'desc'", () => {
    const label = pageColumnSortLabel("Title", "desc");
    expect(label).toMatch(/sorted by title, descending/i);
    expect(label).toMatch(/activate to sort ascending/i);
  });

  it("all three states produce different labels", () => {
    expect(new Set([pageColumnSortLabel("Title", null), pageColumnSortLabel("Title", "asc"), pageColumnSortLabel("Title", "desc")]).size).toBe(3);
  });
});
