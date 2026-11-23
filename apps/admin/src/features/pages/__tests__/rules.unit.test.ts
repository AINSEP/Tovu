import { compareAdminPostsByTitle, compareAdminPostsBySlug, compareAdminPostsByStatus, compareAdminPostsByUpdated, columnSortLabel, updatedColumnSortLabel, DEFAULT_ADMIN_POST_SORT } from "../../../lib/admin-post-list-sort";
import { describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@/features/posts/api/posts-api.types";
import {
  pageAdminPath,
  pageEditorSurface,
  pagePickerValue,
  pagePublicPath,
  themePageRowMenuItems,
} from "../rules";
import { pageVersionConflictMessage, THEME_DEFAULT_SENTINEL } from "@jini-ai/admin/pages/page-editor-rules";
import type { ThemePageRow } from "../hooks/use-theme-pages.hooks";

/**
 * @file Pure logic for `features/pages/rules.ts`.
 *
 * `pageRowMenuItems` moved with the list screen to `@jini-ai/admin/pages/pages-list-rules`; its
 * status-flip tests moved with it (`packages/admin/src/pages/__tests__/pages-list-rules.unit.test.ts`).
 * The editor-only rules moved to `@jini-ai/admin/pages/page-editor-rules` with their tests
 * (`packages/admin/src/pages/__tests__/page-editor-rules.unit.test.ts`).
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

const identityT = (key: string): string => key;

function page(overrides: Partial<AdminPost> = {}): AdminPost {
  return { ...PUBLISHED_PAGE, ...overrides };
}

const THEME_ROW: ThemePageRow = {
  pageId: "about",
  filePath: "render/pages/about.html",
  published: false,
  resettable: true,
  collidingContent: null,
};

describe("themePageRowMenuItems", () => {
  it("returns exactly Details then Edit — no Disable/Delete, since a theme page has no PostRecord for either", () => {
    const items = themePageRowMenuItems({ row: THEME_ROW, handlers: { onOpenDetails: vi.fn(), onEdit: vi.fn() }, t: (key) => key });
    expect(items.map((i) => i.key)).toEqual(["details", "edit"]);
    expect(items[0]).toMatchObject({ label: "Details" });
    expect(items[1]).toMatchObject({ label: "Edit" });
  });

  it("wires Details' onSelect to onOpenDetails with the row's own pageId, and only onOpenDetails", () => {
    const onOpenDetails = vi.fn();
    const onEdit = vi.fn();
    const items = themePageRowMenuItems({ row: THEME_ROW, handlers: { onOpenDetails, onEdit }, t: (key) => key });
    items.find((i) => i.key === "details")!.onSelect();
    expect(onOpenDetails).toHaveBeenCalledWith("about");
    expect(onEdit).not.toHaveBeenCalled();
  });

  /**
   * PART 4 (2026-08-31): Edit moved out of `ThemePageDetailsModal.tsx`'s own footer into this menu,
   * directly under Details. Takes the row's bare `pageId` — same shape as `onOpenDetails` — rather
   * than building the Theme Studio href itself, since this module stays free of navigation (this
   * file's own header comment, and `rules.ts`'s `ThemePageRowMenuHandlers` doc); the caller
   * (`ThemePagesTab.tsx`) is the one place that turns it into `navigate(themeStudioRoutePath(...))` —
   * the unprefixed route path `navigate()` expects, NOT `themeStudioHref`'s already-`/admin`-prefixed
   * form (2026-09-19 double-prefix bug fix; see `theme-page-publish-state.ts`'s `themeStudioRoutePath`
   * doc for why the two must stay separate).
   */
  it("wires Edit's onSelect to onEdit with the row's own pageId, and only onEdit", () => {
    const onOpenDetails = vi.fn();
    const onEdit = vi.fn();
    const items = themePageRowMenuItems({ row: THEME_ROW, handlers: { onOpenDetails, onEdit }, t: (key) => key });
    items.find((i) => i.key === "edit")!.onSelect();
    expect(onEdit).toHaveBeenCalledWith({ pageId: "about" });
    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  it("translates both labels through the given Translate function", () => {
    const items = themePageRowMenuItems({
      row: THEME_ROW,
      handlers: { onOpenDetails: vi.fn(), onEdit: vi.fn() },
      t: (key) => (key === "Details" ? "Detalles" : key === "Edit" ? "Editar" : key) }
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
describe("compareAdminPostsByUpdated", () => {
  const oldest = page({ id: "pg-old", updatedAt: "2026-01-01T00:00:00.000Z" });
  const middle = page({ id: "pg-mid", updatedAt: "2026-06-01T00:00:00.000Z" });
  const newest = page({ id: "pg-new", updatedAt: "2026-08-10T00:00:00.000Z" });

  it("ascending order (DataTable's 'asc') sorts least-recently-updated first", () => {
    expect([middle, oldest, newest].sort(compareAdminPostsByUpdated).map((p) => p.id)).toEqual(["pg-old", "pg-mid", "pg-new"]);
  });

  it("negating it (DataTable's 'desc') sorts most-recently-updated first", () => {
    expect([middle, oldest, newest].sort((a, b) => -compareAdminPostsByUpdated(a, b)).map((p) => p.id)).toEqual([
      "pg-new",
      "pg-mid",
      "pg-old",
    ]);
  });
});

describe("updatedColumnSortLabel", () => {
  it("states 'not sorted by updated date' and offers newest-first when direction is null", () => {
    const label = updatedColumnSortLabel({ t: identityT, direction: null });
    expect(label).toMatch(/not sorted by updated date/i);
    expect(label).toMatch(/newest first/i);
  });

  it("states 'newest first' and offers oldest-first as the next action when direction is 'desc'", () => {
    const label = updatedColumnSortLabel({ t: identityT, direction: "desc" });
    expect(label).toMatch(/newest first/i);
    expect(label).toMatch(/oldest first/i);
  });

  it("states 'oldest first' and offers newest-first as the next action when direction is 'asc'", () => {
    const label = updatedColumnSortLabel({ t: identityT, direction: "asc" });
    expect(label).toMatch(/oldest first/i);
    expect(label).toMatch(/newest first/i);
  });

  it("all three states produce different labels", () => {
    expect(new Set([updatedColumnSortLabel({ t: identityT, direction: null }), updatedColumnSortLabel({ t: identityT, direction: "asc" }), updatedColumnSortLabel({ t: identityT, direction: "desc" })]).size).toBe(3);
  });
});

describe("compareAdminPostsByTitle / compareAdminPostsBySlug", () => {
  const a = page({ id: "pg-a", title: "Alpha", slug: "charlie" });
  const b = page({ id: "pg-b", title: "Bravo", slug: "bravo" });
  const c = page({ id: "pg-c", title: "Charlie", slug: "alpha" });

  for (const [name, fn, ascending, descending] of [
    ["compareAdminPostsByTitle", compareAdminPostsByTitle, ["pg-a", "pg-b", "pg-c"], ["pg-c", "pg-b", "pg-a"]],
    ["compareAdminPostsBySlug", compareAdminPostsBySlug, ["pg-c", "pg-b", "pg-a"], ["pg-a", "pg-b", "pg-c"]],
  ] as const) {
    describe(name, () => {
      it("sorts A-to-Z ascending", () => {
        expect([c, a, b].sort(fn).map((p) => p.id)).toEqual(ascending);
      });

      it("negating it sorts Z-to-A", () => {
        expect([c, a, b].sort((x, y) => -fn(x, y)).map((p) => p.id)).toEqual(descending);
      });
    });
  }
});

describe("compareAdminPostsByStatus", () => {
  // Exactly two pages with different statuses — see `posts/rules.ts`'s own test for why a third,
  // necessarily-tied row would test `Array#sort`'s stability rather than this comparator.
  const draft = page({ id: "pg-draft", status: "draft" });
  const published = page({ id: "pg-published", status: "published" });

  it("ascending sorts draft before published", () => {
    expect([published, draft].sort(compareAdminPostsByStatus).map((p) => p.id)).toEqual(["pg-draft", "pg-published"]);
  });

  it("negating it sorts published before draft", () => {
    expect([draft, published].sort((a, b) => -compareAdminPostsByStatus(a, b)).map((p) => p.id)).toEqual([
      "pg-published",
      "pg-draft",
    ]);
  });
});

describe("pagePublicPath", () => {
  it("renders the root slug as '/' rather than doubling it into '//'", () => {
    expect(pagePublicPath({ slug: "/" })).toBe("/");
  });

  it("prefixes an ordinary slug with a single leading slash", () => {
    expect(pagePublicPath({ slug: "about" })).toBe("/about");
  });

  it("does not special-case a slug that merely starts with a slash but isn't exactly '/'", () => {
    // Not a real slug shape today (post.ts's isValidSlugFormat rejects it), but the function's own
    // equality check (`slug === "/"`) is what matters here, not slug-format validation elsewhere.
    expect(pagePublicPath({ slug: "/about" })).toBe("//about");
  });
});

/**
 * `pageAdminPath` (2026-09-03 consolidation pass) — the one place that now decides slug-vs-id for
 * every page-editor admin link (`Pages.tsx`'s title link and row-menu Edit, `ThemeExplore.tsx`'s and
 * `use-theme-pages.hooks.ts`'s collision links). Regression coverage for the bug family this
 * replaces: `45101306` fixed the root-slug page by switching every link to id, which broke readable
 * URLs for every ordinary page. Pins readable ordinary slugs, the root's `home` alias, and the id
 * fallback that keeps a real `home` page distinct from the root.
 */
describe("pageAdminPath", () => {
  it("prefers the slug for an ordinary page", () => {
    expect(pageAdminPath({ id: "pg1", slug: "about" })).toBe("/pages/about");
  });

  it("uses the home alias for a page holding the literal root slug '/'", () => {
    // Must FAIL if this collapses back to `/pages/${slug}` — `/pages//` cannot match the admin
    // router's `/:slug` pattern (`panels.tsx`) and the link silently does nothing.
    expect(pageAdminPath({ id: "home-1", slug: "/" })).toBe("/pages/home");
  });

  it("falls back to the id for a real page whose slug is 'home'", () => {
    expect(pageAdminPath({ id: "home-2", slug: "home" })).toBe("/pages/home-2");
  });

  it("does not special-case a slug that merely starts with a slash but isn't exactly '/'", () => {
    // Not a real slug shape today (post.ts's isValidSlugFormat rejects it) — mirrors
    // `pagePublicPath`'s identical test above: the equality check is what matters here, not
    // slug-format validation elsewhere.
    expect(pageAdminPath({ id: "pg1", slug: "/about" })).toBe("/pages//about");
  });
});

describe("DEFAULT_ADMIN_POST_SORT", () => {
  it("is Updated, newest-first, consistent with Posts' own default", () => {
    expect(DEFAULT_ADMIN_POST_SORT).toEqual({ column: "updated", direction: "desc" });
  });
});

describe("columnSortLabel", () => {
  it("states 'not sorted' and names the ascending action when direction is null (the column isn't active)", () => {
    const label = columnSortLabel({ t: identityT, columnName: "Title", direction: null });
    expect(label).toMatch(/not sorted by title/i);
    expect(label).toMatch(/activate to sort ascending/i);
  });

  it("states 'ascending' and offers descending as the next action when direction is 'asc'", () => {
    const label = columnSortLabel({ t: identityT, columnName: "Title", direction: "asc" });
    expect(label).toMatch(/sorted by title, ascending/i);
    expect(label).toMatch(/activate to sort descending/i);
  });

  it("states 'descending' and offers ascending as the next action when direction is 'desc'", () => {
    const label = columnSortLabel({ t: identityT, columnName: "Title", direction: "desc" });
    expect(label).toMatch(/sorted by title, descending/i);
    expect(label).toMatch(/activate to sort ascending/i);
  });

  it("all three states produce different labels", () => {
    expect(new Set([columnSortLabel({ t: identityT, columnName: "Title", direction: null }), columnSortLabel({ t: identityT, columnName: "Title", direction: "asc" }), columnSortLabel({ t: identityT, columnName: "Title", direction: "desc" })]).size).toBe(3);
  });
});


/**
 * The editor main pane's four-way surface choice, pulled out of `PageEditor.tsx`'s JSX in the
 * 2026-09-06 complexity-ceiling pass — it was 6 of that component's 10 cognitive-complexity points
 * and, as a nested ternary chain inside a render, could not be asserted without mounting the whole
 * editor. Same reasoning `pageRowMenuItems` records at the top of this file.
 */
describe("pageEditorSurface", () => {
  const READY = { status: "ready", styling: { css: "body{}" } } as const;
  const PENDING = { status: "pending" } as const;

  it("shows the preview surface on the preview tab, whatever the canvas is doing", () => {
    expect(pageEditorSurface({ view: "preview", canvasStyling: PENDING })).toEqual({ kind: "preview" });
    expect(pageEditorSurface({ view: "preview", canvasStyling: READY })).toEqual({ kind: "preview" });
  });

  it("shows the raw HTML surface on the html tab, whatever the canvas is doing", () => {
    expect(pageEditorSurface({ view: "html", canvasStyling: PENDING })).toEqual({ kind: "html" });
    expect(pageEditorSurface({ view: "html", canvasStyling: READY })).toEqual({ kind: "html" });
  });

  it("holds the Interactive tab at the pending surface until the theme's styling settles", () => {
    // Not cosmetic: `InteractiveHtmlEditor` reads its canvas styling ONCE at mount, so mounting it
    // early produces a canvas that can never pick the theme up afterwards.
    expect(pageEditorSurface({ view: "interactive", canvasStyling: PENDING })).toEqual({ kind: "interactive-pending" });
  });

  it("carries the resolved styling through on the interactive surface, so the view needs no cast", () => {
    expect(pageEditorSurface({ view: "interactive", canvasStyling: READY })).toEqual({ kind: "interactive", styling: READY.styling });
  });
});

describe("pagePickerValue (bare-page ruling 2026-09-23, S6)", () => {
  it("shows the shipped shell filename for a null Page when the theme lists it", () => {
    expect(pagePickerValue({ templateChoice: null, availableTemplates: ["pages-default.html", "blog-post.html"] })).toBe("pages-default.html");
  });

  it("falls back to the legacy page-shell.html name when the theme ships that instead", () => {
    expect(pagePickerValue({ templateChoice: null, availableTemplates: ["page-shell.html", "blog-post.html"] })).toBe("page-shell.html");
  });

  it("prefers pages-default.html over page-shell.html when a theme ships both", () => {
    expect(pagePickerValue({ templateChoice: null, availableTemplates: ["page-shell.html", "pages-default.html"] })).toBe("pages-default.html");
  });

  it("returns the sentinel for a null Page when the theme ships neither shell filename", () => {
    expect(pagePickerValue({ templateChoice: null, availableTemplates: ["blog-post.html"] })).toBe(THEME_DEFAULT_SENTINEL);
  });

  it("passes an explicit bare choice (\"\") straight through, never the sentinel", () => {
    expect(pagePickerValue({ templateChoice: "", availableTemplates: ["pages-default.html"] })).toBe("");
  });

  it("passes a real filename straight through", () => {
    expect(pagePickerValue({ templateChoice: "blog-post.html", availableTemplates: ["pages-default.html", "blog-post.html"] })).toBe("blog-post.html");
  });
});

describe("sort labels and conflict copy are translated, not English passthrough", () => {
  it("renders German sort labels and a fully German conflict message", async () => {
    const { t: pagesT } = await import("@jini-ai/admin/pages/pages-i18n");
    const { t: editorT } = await import("../page-editor-i18n");
    const deT = (key: string): string => pagesT({ locale: "de", key });
    expect(columnSortLabel({ t: deT, columnName: deT("Title"), direction: null })).toBe("Nicht nach Titel sortiert. Aktivieren, um aufsteigend zu sortieren.");
    expect(updatedColumnSortLabel({ t: deT, direction: "desc" })).toMatch(/^Nach Aktualisierungsdatum sortiert/);
    const message = pageVersionConflictMessage({ t: (key) => editorT({ locale: "de", key }), expectedVersion: null, currentVersion: 7, attemptedStatus: undefined });
    expect(message).toContain("die von dir geladene Version");
    expect(message).toContain("Version 7");
    expect(message).not.toMatch(/Someone else|version you loaded/);
  });
});
