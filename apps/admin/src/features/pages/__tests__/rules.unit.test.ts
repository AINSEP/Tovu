import { describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@/lib/api";
import {
  DEFAULT_PAGE_SORT,
  buildPageAutosaveDraft,
  buildPageSavePlan,
  comparePagesByStatus,
  comparePagesBySlug,
  comparePagesByTitle,
  comparePagesByUpdated,
  isAutosaveDraftStale,
  pageAcceptsHtmlBody,
  pageAdminPath,
  pageAutosaveBannerMessage,
  pageAutosaveStaleBasisMessage,
  pageColumnSortLabel,
  pageDirtyGuardBaseline,
  pageEditableHtml,
  pageEditorSurface,
  pageLivePreviewPath,
  pagePreviewFormTarget,
  pagePublicPath,
  pageRefreshMayHaveUnsavedEdits,
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
   * (`ThemePagesTab.tsx`) is the one place that turns it into `navigate(themeStudioRoutePath(...))` —
   * the unprefixed route path `navigate()` expects, NOT `themeStudioHref`'s already-`/admin`-prefixed
   * form (2026-09-19 double-prefix bug fix; see `theme-page-publish-state.ts`'s `themeStudioRoutePath`
   * doc for why the two must stay separate).
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

/**
 * The predicate behind "the Pages editor cannot write HTML into a newly created page" (2026-09-06).
 * `New Page` -> `createPost` -> `bodyFormat: "doc"` with `DEFAULT_BODY_JSON`, and the flat
 * `bodyFormat === "html"` test this replaced made every keystroke of hand-authored markup on such a
 * page unsavable. The two guards below are what keep the F01 data-loss fix intact — see the
 * function's own doc.
 */
describe("pageAcceptsHtmlBody", () => {
  const EMPTY_DOC = { type: "doc", content: [] };
  const REAL_DOC = { type: "doc", content: [{ type: "paragraph" }] };

  it("is true for an html-format page, authored or not", () => {
    expect(pageAcceptsHtmlBody({ bodyFormat: "html", bodyJson: {} }, "<p>x</p>")).toBe(true);
    expect(pageAcceptsHtmlBody({ bodyFormat: "html", bodyJson: {} }, "")).toBe(true);
  });

  it("is true for a brand-new doc-format page once HTML is actually authored into it", () => {
    expect(pageAcceptsHtmlBody({ bodyFormat: "doc", bodyJson: EMPTY_DOC }, "<h1>hi</h1>")).toBe(true);
  });

  it("is false for a doc-format page with nothing authored — no premature conversion on a metadata save", () => {
    expect(pageAcceptsHtmlBody({ bodyFormat: "doc", bodyJson: EMPTY_DOC }, "")).toBe(false);
  });

  it("is false for a doc-format page carrying a real Tiptap document, even with HTML typed (the F01 guard)", () => {
    expect(pageAcceptsHtmlBody({ bodyFormat: "doc", bodyJson: REAL_DOC }, "<p>typed over it</p>")).toBe(false);
  });

  it("treats an absent or non-array content field as nothing to lose", () => {
    expect(pageAcceptsHtmlBody({ bodyFormat: "doc", bodyJson: {} }, "<p>x</p>")).toBe(true);
    expect(pageAcceptsHtmlBody({ bodyFormat: "doc", bodyJson: { content: "not an array" } }, "<p>x</p>")).toBe(true);
  });

  it("treats an absent bodyFormat the same as doc — an older row that predates the column", () => {
    expect(pageAcceptsHtmlBody({ bodyJson: REAL_DOC }, "<p>x</p>")).toBe(false);
    expect(pageAcceptsHtmlBody({ bodyJson: EMPTY_DOC }, "<p>x</p>")).toBe(true);
  });
});

describe("buildPageSavePlan", () => {
  const FORM = { title: "About", slug: "about", status: "draft" as const, templateChoice: null, html: "<p>body</p>" };

  it("omits bodyJson whenever the HTML route will fire — updatePageHtml converts the row first, so the server no longer demands one", () => {
    const plan = buildPageSavePlan({ bodyFormat: "html", bodyJson: { type: "doc", content: [] }, version: 7 }, FORM);
    expect(plan.canSaveHtml).toBe(true);
    expect(plan.updatePostPayload).not.toHaveProperty("bodyJson");
  });

  it("round-trips bodyJson whenever the HTML route will not fire", () => {
    const bodyJson = { type: "doc", content: [{ type: "paragraph" }] };
    const plan = buildPageSavePlan({ bodyFormat: "doc", bodyJson, version: 7 }, FORM);
    expect(plan.canSaveHtml).toBe(false);
    expect(plan.updatePostPayload.bodyJson).toEqual(bodyJson);
  });

  it("saves the HTML authored into a brand-new page — the 2026-09-06 fix", () => {
    const plan = buildPageSavePlan({ bodyFormat: "doc", bodyJson: { type: "doc", content: [] }, version: 7 }, FORM);
    expect(plan.canSaveHtml).toBe(true);
    expect(plan.updatePostPayload).not.toHaveProperty("bodyJson");
  });

  it("prefers nextStatus over the form's own status, and writes it to both fields", () => {
    const plan = buildPageSavePlan({ bodyFormat: "html", bodyJson: {}, version: 7 }, FORM, "published");
    expect(plan.statusToWrite).toBe("published");
    expect(plan.updatePostPayload.status).toBe("published");
  });

  it("falls back to the form's status when no nextStatus is given", () => {
    const plan = buildPageSavePlan({ bodyFormat: "html", bodyJson: {}, version: 7 }, { ...FORM, status: "published" });
    expect(plan.statusToWrite).toBe("published");
  });
});

describe("buildPageAutosaveDraft", () => {
  it("an html-format page sends bodyHtml, never the inert bodyJson placeholder", () => {
    const draft = buildPageAutosaveDraft(
      { bodyFormat: "html", bodyJson: { type: "doc", content: [] }, version: 3 },
      { title: "About", slug: "about", html: "<main>hi</main>" }
    );
    expect(draft).toEqual({
      bodyFormat: "html",
      bodyHtml: "<main>hi</main>",
      title: "About",
      slug: "about",
      baseVersion: 3,
    });
  });

  it("a doc-format page round-trips bodyJson unchanged — this editor has no way to edit it", () => {
    const bodyJson = { type: "doc", content: [{ type: "paragraph" }] };
    const draft = buildPageAutosaveDraft(
      { bodyFormat: "doc", bodyJson, version: 1 },
      { title: "About", slug: "about", html: "ignored for a doc-format page" }
    );
    expect(draft).toEqual({
      bodyFormat: "doc",
      bodyJson,
      title: "About",
      slug: "about",
      baseVersion: 1,
    });
  });

  it("baseVersion always comes from the page's own version, not a caller-supplied guess", () => {
    const draft = buildPageAutosaveDraft(
      { bodyFormat: "html", bodyJson: {}, version: 42 },
      { title: "About", slug: "about", html: "<p/>" }
    );
    expect(draft.baseVersion).toBe(42);
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
    expect(pageEditorSurface("preview", PENDING)).toEqual({ kind: "preview" });
    expect(pageEditorSurface("preview", READY)).toEqual({ kind: "preview" });
  });

  it("shows the raw HTML surface on the html tab, whatever the canvas is doing", () => {
    expect(pageEditorSurface("html", PENDING)).toEqual({ kind: "html" });
    expect(pageEditorSurface("html", READY)).toEqual({ kind: "html" });
  });

  it("holds the Interactive tab at the pending surface until the theme's styling settles", () => {
    // Not cosmetic: `InteractiveHtmlEditor` reads its canvas styling ONCE at mount, so mounting it
    // early produces a canvas that can never pick the theme up afterwards.
    expect(pageEditorSurface("interactive", PENDING)).toEqual({ kind: "interactive-pending" });
  });

  it("carries the resolved styling through on the interactive surface, so the view needs no cast", () => {
    expect(pageEditorSurface("interactive", READY)).toEqual({ kind: "interactive", styling: READY.styling });
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

describe("pageAutosaveBannerMessage", () => {
  const NOW = new Date("2026-09-06T00:10:00.000Z").getTime();

  it("a fresh draft reads 'Unsaved changes from N minutes ago'", () => {
    expect(pageAutosaveBannerMessage("2026-09-06T00:05:00.000Z", NOW, false)).toBe(
      "Unsaved changes from 5 minutes ago"
    );
  });

  it("a stale draft names the newer save explicitly instead of implying it is current", () => {
    expect(pageAutosaveBannerMessage("2026-09-06T00:05:00.000Z", NOW, true)).toBe(
      "Unsaved changes from before a newer save (captured 5 minutes ago)"
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
describe("pageAutosaveStaleBasisMessage", () => {
  const EXPECTED =
    "Someone else saved this while you were editing — you were working from version 4, so autosaving " +
    "has paused and nothing you type now is being stored. Your changes were NOT saved, and are still " +
    "here in the editor. Reload to pick up their version and resume autosaving; copy anything you " +
    "want to keep first.";

  it("names the basis the operator was working from, and states all four facts they cannot infer", () => {
    const message = pageAutosaveStaleBasisMessage({ baseVersion: 4, draft: {
      bodyFormat: "html",
      bodyHtml: "<p>still being typed</p>",
      title: "Landing",
      slug: "landing",
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
    const message = pageAutosaveStaleBasisMessage({ baseVersion: 4, draft: {
      bodyFormat: "html",
      bodyHtml: "<p>still being typed</p>",
      title: "Landing",
      slug: "landing",
      baseVersion: 4,
    } });

    expect(message).not.toMatch(/restore|recover|saved locally|in your browser/i);
  });
});

const LOADED_PAGE = {
  id: "pg-1",
  title: "Landing",
  slug: "landing",
  status: "published",
} as AdminPost;

describe("pagePreviewFormTarget", () => {
  it("is empty before the page loads", () => {
    expect(pagePreviewFormTarget(null)).toBe("");
  });

  it("names the loaded page's id", () => {
    expect(pagePreviewFormTarget(LOADED_PAGE)).toBe("page-preview-pending-pg-1");
  });
});

describe("pageDirtyGuardBaseline", () => {
  it("is null before the page loads", () => {
    expect(pageDirtyGuardBaseline(null, "<p>saved</p>", "pages-default.html")).toBeNull();
  });

  it("pairs the loaded row's title/slug/status with the SAVED html and template choice", () => {
    expect(pageDirtyGuardBaseline(LOADED_PAGE, "<p>saved</p>", "pages-default.html")).toEqual({
      title: "Landing",
      slug: "landing",
      status: "published",
      html: "<p>saved</p>",
      templateChoice: "pages-default.html",
    });
  });
});

describe("pageEditableHtml", () => {
  it("returns bodyHtml for an html-format page", () => {
    expect(pageEditableHtml(page({ bodyFormat: "html", bodyHtml: "<p>hi</p>" }))).toBe("<p>hi</p>");
  });

  it("returns \"\" for a doc-format page", () => {
    expect(pageEditableHtml(page({ bodyFormat: "doc", bodyHtml: "<p>ignored</p>" }))).toBe("");
  });

  it("returns \"\" for a null bodyHtml on an html-format page", () => {
    expect(pageEditableHtml(page({ bodyFormat: "html", bodyHtml: null }))).toBe("");
  });
});

describe("pageLivePreviewPath", () => {
  it("appends the version to an ordinary slug", () => {
    expect(pageLivePreviewPath("landing", 7)).toBe("/landing?_v=7");
  });

  it("keeps the root slug a single slash before the query string", () => {
    expect(pageLivePreviewPath("/", 7)).toBe("/?_v=7");
  });
});

describe("pageRefreshMayHaveUnsavedEdits", () => {
  it("is false for a clean editor on the Preview or HTML tab", () => {
    expect(pageRefreshMayHaveUnsavedEdits({ dirty: false, view: "preview" })).toBe(false);
    expect(pageRefreshMayHaveUnsavedEdits({ dirty: false, view: "html" })).toBe(false);
  });

  it("is true for a dirty editor on any tab", () => {
    expect(pageRefreshMayHaveUnsavedEdits({ dirty: true, view: "preview" })).toBe(true);
    expect(pageRefreshMayHaveUnsavedEdits({ dirty: true, view: "html" })).toBe(true);
    expect(pageRefreshMayHaveUnsavedEdits({ dirty: true, view: "interactive" })).toBe(true);
  });

  it("is true on the Interactive tab even when dirty reads false, since canvas typing may not have reached html yet", () => {
    expect(pageRefreshMayHaveUnsavedEdits({ dirty: false, view: "interactive" })).toBe(true);
  });
});
