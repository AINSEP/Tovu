import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Pages, pagesListNotice } from "../Pages";
import { buildPageRowMenuHandleMap } from "../rules";
import type { PagesController } from "../hooks/use-pages.hooks";
import type { ThemePageRow, ThemePagesController } from "../hooks/use-theme-pages.hooks";
import { adminHref, navigate } from "@/lib/router";
import type { AdminPost } from "@/lib/api";
import { siteUrl } from "@/lib/site-url";

const identityT = (key: string): string => key;

/**
 * @file `Pages` — markup-only list screen, twin of `features/posts/Posts.tsx`. Driven entirely
 * through the injectable `usePagesHook` seam (`Pages.tsx`'s own doc comment on `PagesProps`), so
 * every state — loading, error-before-load, error-after-load, empty, mid-delete — is reached
 * directly rather than through a real `fetch`.
 */

/**
 * Only `navigate` is faked. `adminHref` is kept REAL via `importOriginal` on purpose: the theme-page
 * link assertions below check a literal `/admin/themes/explore?...`, and stubbing the very function
 * that prepends the base would make those assertions self-fulfilling — they would pass just as
 * happily if `Pages.tsx` emitted a route path with no base at all.
 */
vi.mock("../../../lib/router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/router")>()),
  navigate: vi.fn(),
}));

/**
 * Global, file-wide reset — NOT scoped to the `?tab=` describe block below. `Pages`'s tab switch
 * now writes `?tab=` via `history.replaceState` (`selectTab`, `Pages.tsx`) as a side effect, and
 * jsdom's `window.location` is shared across every test in this FILE (one jsdom window per file,
 * not per test) — so ANY earlier test that clicks the Theme Pages tab (most of the ones below do,
 * just to assert its content) leaves `?tab=themes` on the address bar for whichever test runs next,
 * silently changing that next test's OWN initial tab resolution. Reset after every test, not just
 * the ones that assert on the URL directly.
 */
afterEach(() => {
  window.history.replaceState(null, "", "/");
});

const PAGE: AdminPost = {
  id: "pg1",
  workspaceId: "w1",
  kind: "page",
  title: "About",
  slug: "about",
  bodyJson: {},
  status: "published",
  updatedAt: "2026-08-01T12:34:00.000Z",
  version: 1,
};

const DRAFT_PAGE: AdminPost = { ...PAGE, id: "pg2", title: "Draft Page", slug: "draft-page", status: "draft" };

function controller(overrides: Partial<PagesController> = {}): PagesController {
  const pages = overrides.pages !== undefined ? overrides.pages : [PAGE];
  return {
    pages: [PAGE],
    error: null,
    creating: false,
    rowSavingId: null,
    pendingDelete: null,
    setPendingDelete: vi.fn(),
    createPage: vi.fn(async () => {}),
    togglePagePublish: vi.fn(async () => {}),
    removePage: vi.fn(async () => {}),
    // `PAGES_DICT` has no `en` entry (only translated locales) — `key` IS the English copy, so
    // the identity function is a faithful fake for the wired hook's real English behavior, same
    // as every assertion below already expects.
    t: (key) => key,
    locale: "en",
    // `Pages.tsx` destructures this from the hook rather than computing it itself (2026-09-07,
    // audit claim #2), so the fixture has to build it from whatever `pages` this call passes —
    // mirrors `posts/__tests__/Posts.unit.test.tsx`'s identical fixture line.
    rowMenuHandleById: buildPageRowMenuHandleMap(pages),
    ...overrides,
  };
}

/** A real candidate page ("about") — this shape is what most rows on a live theme are. */
function candidateRow(overrides: Partial<ThemePageRow> = {}): ThemePageRow {
  return {
    pageId: "about",
    filePath: "render/pages/about.html",
    published: false,
    resettable: true,
    collidingContent: null,
    ...overrides,
  };
}

function themePagesController(overrides: Partial<ThemePagesController> = {}): ThemePagesController {
  const pages = overrides.pages ?? [];
  return {
    pages,
    // Mirrors the real `useThemePages`' own `pageCount` derivation (`pages === null ? 0 :
    // pages.length`) off whatever `pages` override this call passes, so a caller overriding
    // `pages` doesn't also have to separately override `pageCount` to keep them consistent.
    pageCount: pages === null ? 0 : pages.length,
    activeThemeId: "basic",
    error: null,
    savingPageId: null,
    setPagePublished: vi.fn(async () => {}),
    ...overrides,
  };
}

/**
 * `themePages` defaults to an already-loaded, empty list (not the real `useThemePages` hook) —
 * every test in this file predates the Theme Pages tab and asserts against the "My Pages" tab's
 * own content, so a real, unmocked `getPresentation()` call here would be pure noise (and, since
 * nothing in this test environment mocks `fetch`, a source of flaky unhandled-rejection warnings).
 */
function renderWith(overrides: Partial<PagesController> = {}, themePages: Partial<ThemePagesController> = {}) {
  const c = controller(overrides);
  const usePagesHook = () => c;
  const useThemePagesHook = () => themePagesController(themePages);
  render(<Pages usePagesHook={usePagesHook} useThemePagesHook={useThemePagesHook} />);
  return c;
}

describe("loading and error-before-load states", () => {
  it("shows a loading notice while pages is null and there is no error", () => {
    renderWith({ pages: null, error: null });
    expect(screen.getByText("Loading pages…")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows only the error notice (no table) when pages is still null and error is set", () => {
    renderWith({ pages: null, error: "failed to load pages" });
    expect(screen.getByText("failed to load pages")).toBeInTheDocument();
    expect(screen.queryByText("Loading pages…")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an inline banner ABOVE the table, not a blank screen, once pages have loaded and a later error occurs", () => {
    renderWith({ pages: [PAGE], error: "failed to create page" });
    expect(screen.getByText("failed to create page")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("empty state", () => {
  it("renders the empty-state card instead of a bare table when there are no pages", () => {
    renderWith({ pages: [] });
    expect(screen.getByText("No pages yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("populated table", () => {
  it("renders title, slug, status, and formatted-updated columns for each row", () => {
    renderWith({ pages: [PAGE] });
    // The Pages editor, NOT the Posts one. A Page is a bespoke HTML document and is never
    // opened in Tiptap; this href is the guarantee, and it used to point at /admin/posts/{id}.
    // Built from the slug via `pageAdminPath` (`rules.ts`) — readable for every ordinary page;
    // see the "root-slug page" test below for the one page this falls back to the id for.
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/admin/pages/about");
    expect(screen.getByRole("link", { name: "/about" })).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    expect(screen.getByText("2026-08-01 12:34")).toBeInTheDocument();
  });

  /**
   * Regression test — a Page can claim the literal root slug `"/"` (`post.ts`'s `ROOT_SLUG`,
   * landed 2026-09-03). Before the original fix, this row's Slug column read "//" (`/${"/"}"`) and
   * both its edit links pointed at `/admin/pages//` / navigated to `/pages//`, which the admin
   * router's `/:slug` pattern cannot match — the link silently did nothing. `pageAdminPath`
   * (`rules.ts`, 2026-09-03 consolidation pass) now owns this slug-vs-id choice for every page-
   * editor link in the app: slug for an ordinary page (see the test above), id for this one, since
   * a value containing `/` can never match a single `/:slug` segment. Must FAIL if that fallback
   * regresses and pass now that both edit links route through `pageAdminPath` and the site link
   * goes through `pagePublicPath`.
   */
  it("renders a root-slug ('/') page's Slug column as '/' and its edit links by id, not slug", async () => {
    const user = userEvent.setup();
    const HOME_PAGE: AdminPost = { ...PAGE, id: "home-1", title: "Home", slug: "/" };
    renderWith({ pages: [HOME_PAGE] });

    const titleLink = screen.getByRole("link", { name: "Home" });
    expect(titleLink).toHaveAttribute("href", "/admin/pages/home-1");

    const slugLink = screen.getByRole("link", { name: "/" });
    expect(slugLink).toHaveAttribute("href", siteUrl("/"));

    await user.click(screen.getByRole("button", { name: 'Actions for "Home"' }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(navigate).toHaveBeenCalledWith("/pages/home-1");
  });
});

describe("Title/Slug/Status column sort (2026-09-02)", () => {
  const alpha = { ...PAGE, id: "pg-alpha", title: "Alpha Page", slug: "alpha-page", status: "published" as const };
  const bravo = { ...PAGE, id: "pg-bravo", title: "Bravo Page", slug: "bravo-page", status: "draft" as const };

  function rowOrder(): string[] {
    return screen.getAllByRole("row").slice(1).map((row) => row.textContent ?? "");
  }

  it("an unsorted column's header still reads as clickable via its own aria-label, before any click", () => {
    renderWith({ pages: [alpha, bravo] });
    expect(screen.getByRole("button", { name: /not sorted by title\. activate to sort ascending/i })).toBeInTheDocument();
  });

  it("clicking Title sorts ascending and cancels the default Updated sort", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [bravo, alpha] });
    await user.click(screen.getByRole("button", { name: /not sorted by title/i }));
    expect(rowOrder()[0]).toContain("Alpha Page");
    expect(screen.getByRole("button", { name: /sorted by title, ascending\. activate to sort descending/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /not sorted by updated date/i })).toBeInTheDocument();
  });

  it("clicking Title again toggles to descending", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [bravo, alpha] });
    const titleHeader = () => screen.getByRole("button", { name: /sort.*title/i });
    await user.click(titleHeader());
    await user.click(titleHeader());
    expect(rowOrder()[0]).toContain("Bravo Page");
    expect(screen.getByRole("button", { name: /sorted by title, descending/i })).toBeInTheDocument();
  });

  it("clicking Slug sorts ascending by slug", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [bravo, alpha] });
    await user.click(screen.getByRole("button", { name: /not sorted by slug/i }));
    expect(rowOrder()[0]).toContain("Alpha Page");
  });

  it("clicking Status sorts draft before published (ascending)", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [alpha, bravo] });
    await user.click(screen.getByRole("button", { name: /not sorted by status/i }));
    expect(rowOrder()[0]).toContain("Bravo Page"); // draft
    expect(rowOrder()[1]).toContain("Alpha Page"); // published
  });

  it("clicking Slug after Title cancels Title's active sort — only one column active at a time", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [bravo, alpha] });
    await user.click(screen.getByRole("button", { name: /not sorted by title/i }));
    expect(screen.getByRole("button", { name: /sorted by title/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /not sorted by slug/i }));
    expect(screen.getByRole("button", { name: /not sorted by title/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sorted by slug, ascending/i })).toBeInTheDocument();
  });
});

describe("New Page action", () => {
  it("disables the button and shows 'Creating…' while creating is true", () => {
    renderWith({ creating: true });
    const button = screen.getByRole("button", { name: "Creating…" });
    expect(button).toBeDisabled();
  });

  it("calls createPage when clicked", async () => {
    const user = userEvent.setup();
    const c = renderWith({ creating: false });
    await user.click(screen.getByRole("button", { name: "New Page" }));
    expect(c.createPage).toHaveBeenCalledTimes(1);
  });
});

describe("row menu — Publish/Unpublish visibility mirrors pageRowMenuItems", () => {
  it("offers Unpublish for a published page", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] });
    await user.click(screen.getByRole("button", { name: 'Actions for "About"' }));
    expect(screen.getByRole("menuitem", { name: "Unpublish" })).toBeInTheDocument();
  });

  it("offers Publish for a draft page — the item flips rather than being omitted", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [DRAFT_PAGE] });
    await user.click(screen.getByRole("button", { name: 'Actions for "Draft Page"' }));
    expect(screen.getByRole("menuitem", { name: "Publish" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Unpublish" })).not.toBeInTheDocument();
  });

  it("Edit navigates to the Pages editor by slug (via pageAdminPath), never the Posts editor", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] });
    await user.click(screen.getByRole("button", { name: 'Actions for "About"' }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(navigate).toHaveBeenCalledWith("/pages/about");
  });

  it("Unpublish calls togglePagePublish with the row", async () => {
    const user = userEvent.setup();
    const c = renderWith({ pages: [PAGE] });
    await user.click(screen.getByRole("button", { name: 'Actions for "About"' }));
    await user.click(screen.getByRole("menuitem", { name: "Unpublish" }));
    expect(c.togglePagePublish).toHaveBeenCalledWith(PAGE);
  });

  it("Publish calls togglePagePublish with the row, for a draft page", async () => {
    const user = userEvent.setup();
    const c = renderWith({ pages: [DRAFT_PAGE] });
    await user.click(screen.getByRole("button", { name: 'Actions for "Draft Page"' }));
    await user.click(screen.getByRole("menuitem", { name: "Publish" }));
    expect(c.togglePagePublish).toHaveBeenCalledWith(DRAFT_PAGE);
  });

  it("Delete calls setPendingDelete with the row rather than deleting immediately", async () => {
    const user = userEvent.setup();
    const c = renderWith({ pages: [PAGE] });
    await user.click(screen.getByRole("button", { name: 'Actions for "About"' }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(c.setPendingDelete).toHaveBeenCalledWith(PAGE);
    expect(c.removePage).not.toHaveBeenCalled();
  });
});

describe("delete confirmation dialog", () => {
  it("stays closed when pendingDelete is null", () => {
    renderWith({ pages: [PAGE], pendingDelete: null });
    const dialog = document.querySelector("dialog.confirm-dialog")!;
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("opens with copy naming only the observable consequence — no 'permanently' claim, no 'cannot be undone' claim", () => {
    renderWith({ pages: [PAGE], pendingDelete: PAGE });
    const dialog = document.querySelector("dialog.confirm-dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(screen.getByText('Move "About" to trash? It will disappear from the site and from this list.')).toBeInTheDocument();
    expect(screen.queryByText(/permanently/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument();
  });

  it("confirming calls removePage (the hook reads pendingDelete itself, not an argument)", async () => {
    const user = userEvent.setup();
    const c = renderWith({ pages: [PAGE], pendingDelete: PAGE });
    await user.click(screen.getByRole("button", { name: "Move to trash" }));
    expect(c.removePage).toHaveBeenCalledTimes(1);
  });

  it("canceling calls setPendingDelete(null) rather than removePage", async () => {
    const user = userEvent.setup();
    const c = renderWith({ pages: [PAGE], pendingDelete: PAGE });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(c.setPendingDelete).toHaveBeenCalledWith(null);
    expect(c.removePage).not.toHaveBeenCalled();
  });

  it("is pending only when rowSavingId matches the pendingDelete row's id", () => {
    renderWith({ pages: [PAGE], pendingDelete: PAGE, rowSavingId: PAGE.id });
    expect(screen.getByRole("button", { name: "Move to trash" })).toBeDisabled();
  });

  it("is not pending when rowSavingId belongs to a different row", () => {
    renderWith({ pages: [PAGE], pendingDelete: PAGE, rowSavingId: "some-other-id" });
    expect(screen.getByRole("button", { name: "Move to trash" })).not.toBeDisabled();
  });
});

describe("Theme Pages tab", () => {
  it("shows a count on each tab and hides the New Page action once switched to Theme Pages", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "pricing" }), candidateRow({ pageId: "docs" })] });
    expect(screen.getByRole("tab", { name: "My Pages1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Theme Pages2" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Theme Pages2" }));
    expect(screen.queryByRole("button", { name: "New Page" })).not.toBeInTheDocument();
  });

  /**
   * 2026-08-31 owner review pass: this tab now matches "My Pages"' own column shape — same
   * `DataTable` `columns` API, same shared `RowMenu` in a `More` column — rather than being its own
   * bespoke screen. This replaces an earlier assertion that pinned the OPPOSITE ("no RowMenu"), from
   * before the owner asked for the two tabs to read as siblings.
   */
  it("lists each theme page id with a publish switch and a RowMenu in the More column, same shape as My Pages", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "pricing", published: true })] });
    await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
    expect(screen.getByText("pricing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "/pricing" })).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: 'Actions for "pricing"' })).toBeInTheDocument();
  });

  /** Every row renders the SAME four columns regardless of its own locked/candidate shape — the
   *  table's own structure must never depend on which row it is (owner-reported bug, the old inline
   *  "see more" disclosure changed row height/column contents row to row). The standalone "Theme
   *  Studio" column (PART 1, 2026-08-31) was folded back into `Page` (PART 5, 2026-09-13 owner
   *  screenshot review) — see `ThemePagesTab.tsx`'s own file header. */
  it("gives every row the same column set — a locked row and a candidate row both get page/URL/publish/More", async () => {
    const user = userEvent.setup();
    renderWith(
      { pages: [PAGE] },
      { pages: [candidateRow({ pageId: "index", published: null }), candidateRow({ pageId: "about", published: false })] }
    );
    await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
    const columnHeaders = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(columnHeaders).toEqual(["Page", "URL", "Publish", "More"]);
    expect(screen.getByRole("button", { name: 'Actions for "index"' })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: 'Actions for "about"' })).toBeInTheDocument();
  });

  describe("publish switch", () => {
    /**
     * Regression guard (2026-08-31 owner-reported bug): every row here sits inside a `.list-table
     * td`, which is exactly the context `styles.css`'s row-action reset
     * (`.list-table td button:not([class*="btn-"]):not(.link-button)`) targets — and that
     * selector's specificity silently overrode this switch's on/off background to one flat colour
     * regardless of state, which is why a locked-ON switch read as indistinguishable from a
     * genuinely off one. `btn-toggle-switch` is the documented escape hatch (`styles.css`'s own
     * comment on that reset) — this pins its presence so the collision cannot silently return.
     */
    it("carries the btn- escape-hatch class, so the shared row-button reset never reaches this switch's own background", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "pricing" })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      expect(screen.getByRole("switch")).toHaveClass("btn-toggle-switch");
    });

    it("reflects the row's published state and calls setPagePublished with the flipped value on click", async () => {
      const user = userEvent.setup();
      const setPagePublished = vi.fn(async () => {});
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "pricing", published: false })], setPagePublished });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      const toggle = screen.getByRole("switch");
      expect(toggle).toHaveAttribute("aria-checked", "false");
      await user.click(toggle);
      expect(setPagePublished).toHaveBeenCalledWith("pricing", true);
    });

    it("disables the switch, renders it ON, and carries the reason on an info icon (not inline text) for index", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "index", published: null })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      const toggle = screen.getByRole("switch");
      expect(toggle).toBeDisabled();
      expect(toggle).toHaveAttribute("aria-checked", "true");
      expect(toggle).toHaveClass("is-on");
      // The reason is no longer inline text sprawling the row — it lives on the info icon's tooltip.
      expect(screen.queryByText("Always published — theme home page")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Always published — theme home page")).toBeInTheDocument();
    });

    it("disables the switch, renders it ON, and carries the reason on an info icon for 404", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "404", published: null })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      const toggle = screen.getByRole("switch");
      expect(toggle).toBeDisabled();
      expect(toggle).toHaveAttribute("aria-checked", "true");
      expect(toggle).toHaveClass("is-on");
      expect(screen.getByLabelText("Always published — error page")).toBeInTheDocument();
    });

    it("disables the switch, renders it OFF, and carries the reason on an info icon for a declared template shell", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "blog-post", published: null })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      const toggle = screen.getByRole("switch");
      expect(toggle).toBeDisabled();
      expect(toggle).toHaveAttribute("aria-checked", "false");
      expect(toggle).not.toHaveClass("is-on");
      expect(screen.getByLabelText("Not a standalone page — used as a content template")).toBeInTheDocument();
    });

    /**
     * Owner-reported bug (2026-08-31): a locked-ON switch used to be visually indistinguishable
     * from a genuinely off, switchable one — both rendered dim/grey at a glance. The lock glyph is
     * the added third, colour-independent signal: present on every locked row regardless of on/off,
     * absent on every switchable row regardless of on/off — the three real states (off+switchable,
     * on+switchable, locked) are then each a distinct (checked, disabled, hasLockGlyph) triple.
     */
    it("shows the lock glyph on a locked row (on or off) and never on a switchable one", async () => {
      const user = userEvent.setup();
      renderWith(
        { pages: [PAGE] },
        {
          pages: [
            candidateRow({ pageId: "index", published: null }), // locked ON
            candidateRow({ pageId: "blog-post", published: null }), // locked OFF
            candidateRow({ pageId: "about", published: false }), // switchable OFF
            candidateRow({ pageId: "pricing", published: true }), // switchable ON
          ],
        }
      );
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      // Exactly the two locked rows carry a lock glyph — an `aria-hidden` svg, so found by class.
      expect(document.querySelectorAll(".theme-page-lock-glyph")).toHaveLength(2);
    });

    it("never renders a locked-row info icon for a switchable row", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "about", published: false })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      expect(screen.queryByLabelText("Not a standalone page — used as a content template")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Always published — theme home page")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Always published — error page")).not.toBeInTheDocument();
    });

    it("disables the switch while its own row's publish call is in flight, without disabling other rows", async () => {
      const user = userEvent.setup();
      renderWith(
        { pages: [PAGE] },
        { pages: [candidateRow({ pageId: "about" }), candidateRow({ pageId: "pricing" })], savingPageId: "about" }
      );
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      const [aboutSwitch, pricingSwitch] = screen.getAllByRole("switch");
      expect(aboutSwitch).toBeDisabled();
      expect(pricingSwitch).not.toBeDisabled();
    });
  });

  /**
   * PART 1 (2026-08-31 owed-work pass): the old single "URL" column was mislabeled — it always
   * linked to the theme studio, never the page's own public address. Split into two real columns;
   * see `ThemePagesTab.tsx`'s own file header. These pin the public "URL" column's three cases —
   * the part that needs care, not the column split itself.
   */
  describe("URL column (public site)", () => {
    it("links a published candidate page to its real address on the public origin, external target/rel", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "pricing", published: true })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      const link = screen.getByRole("link", { name: "/pricing" });
      expect(link).toHaveAttribute("href", siteUrl("/pricing"));
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    });

    /**
     * Theme pages ship unpublished by default (2026-08-30), so most rows currently 404 on the real
     * site. The public column must never present that as a working link — text only, no `<a>`.
     */
    it("shows an unpublished candidate page's address as plain text, not a dead link", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "about", published: false })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      expect(screen.queryByRole("link", { name: "/about" })).not.toBeInTheDocument();
      const text = screen.getByText("/about");
      expect(text.tagName).toBe("SPAN");
      expect(text).toHaveClass("theme-page-url-not-live");
    });

    /** `index` is genuinely live at `/`, not at `/index` — the one locked row with a real address. */
    it("links index to '/' — it is genuinely always reachable there, unlike its own id-path", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "index", published: null })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      const link = screen.getByRole("link", { name: "/" });
      expect(link).toHaveAttribute("href", siteUrl("/"));
      expect(link).toHaveAttribute("target", "_blank");
    });

    /** `404` and a declared template shell have no public address at all — not "a URL that 404s",
     *  no address, so no `<a>` at all, not even a non-clickable-looking one. */
    it("shows no link at all for 404 or a declared template shell — they have no address, not a broken one", async () => {
      const user = userEvent.setup();
      renderWith(
        { pages: [PAGE] },
        { pages: [candidateRow({ pageId: "404", published: null }), candidateRow({ pageId: "blog-post", published: null })] }
      );
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      expect(screen.queryByRole("link", { name: "No direct URL" })).not.toBeInTheDocument();
      const texts = screen.getAllByText("No direct URL");
      expect(texts).toHaveLength(2);
      for (const text of texts) {
        expect(text.tagName).toBe("SPAN");
        expect(text).toHaveClass("theme-page-no-url");
      }
    });
  });

  /**
   * PART 5 (2026-09-13, owner screenshot review): the standalone "Theme Studio" column is gone —
   * its destination (`themeStudioHref`) and its unchanged no-target/no-rel in-app treatment now live
   * on the `Page` cell itself, whose accessible name is the page id rather than a separate `t("Edit")`
   * cell.
   */
  describe("Page column links to Theme Studio", () => {
    it("links every row to the theme studio with both params, named after the page id, regardless of publish state", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "404", published: null })], activeThemeId: "basic" });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      const link = screen.getByRole("link", { name: "404" });
      expect(link.getAttribute("href")).toBe("/admin/themes/explore?theme=basic&page=404");
    });

    /**
     * An in-app admin destination, so it must NOT open a new tab: `installInternalLinkInterceptor`
     * (`@jini-ai/admin/browser`) explicitly declines to intercept any anchor carrying a `target`, so
     * leaving `target="_blank"` on would both full-page-load the SPA and strand the operator in a
     * second tab.
     */
    it("navigates in place — no target/rel, so the SPA link interceptor handles it", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "404", published: null })], activeThemeId: "basic" });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      const link = screen.getByRole("link", { name: "404" });
      expect(link).not.toHaveAttribute("target");
      expect(link).not.toHaveAttribute("rel");
    });

    it("percent-encodes both params, so a page id or theme id containing a space or & cannot forge a third param", async () => {
      const user = userEvent.setup();
      renderWith(
        { pages: [PAGE] },
        { pages: [candidateRow({ pageId: "my page&x=1", published: false })], activeThemeId: "b a&sic" }
      );
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      const link = screen.getByRole("link", { name: "my page&x=1" });
      expect(link.getAttribute("href")).toBe("/admin/themes/explore?theme=b%20a%26sic&page=my%20page%26x%3D1");
    });

    it("still points 'index' at that page's own studio entry — pages.ts's static-page route excludes that slug (home is served by the route === \"home\" branch instead)", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "index", published: null })], activeThemeId: "basic" });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      const link = screen.getByRole("link", { name: "index" });
      expect(link.getAttribute("href")).toBe("/admin/themes/explore?theme=basic&page=index");
    });

    it("shows a loading notice, never a half-built ?theme= link, before the active theme id is known", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "404", published: null })], activeThemeId: null });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      expect(screen.getByText("Loading theme pages…")).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });

  /**
   * 2026-08-31 owner review pass: the old inline "see more" disclosure reflowed the row in place —
   * *"this reorganization when you click see more... looks awful."* Its content (file path, whether
   * there is an original to reset to) now lives in `ThemePageDetailsModal.tsx`, opened from the
   * row's `RowMenu` `More` menu, plus two facts the old panel never showed: the row's own publish
   * reason and any colliding content record.
   */
  describe("Details modal", () => {
    async function openDetails(user: ReturnType<typeof userEvent.setup>, pageName: string) {
      await user.click(screen.getByRole("button", { name: `Actions for "${pageName}"` }));
      await user.click(screen.getByRole("menuitem", { name: "Details" }));
    }

    it("opens from the row's More menu, revealing its underlying file path, without reflowing the row", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "about", filePath: "render/pages/about.html" })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      const row = screen.getByText("about").closest("tr")!;
      const cellCountBefore = row.querySelectorAll("td").length;
      expect(screen.queryByText("render/pages/about.html")).not.toBeInTheDocument();
      await openDetails(user, "about");
      expect(screen.getByText("render/pages/about.html")).toBeInTheDocument();
      // The row itself never changed shape — the detail lives in a dialog OUTSIDE the table, not a
      // fifth cell or extra content squeezed into an existing one.
      expect(row.querySelectorAll("td").length).toBe(cellCountBefore);
      expect(row.contains(document.querySelector("dialog.theme-page-details-dialog"))).toBe(false);
    });

    it("mentions there is no original to reset to for a page the theme author added after install", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "about", resettable: false })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await openDetails(user, "about");
      expect(screen.getByText("Added to this theme after it was installed — there is no original to reset to.")).toBeInTheDocument();
    });

    it("omits the 'no original' note when the page is resettable", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "about", resettable: true })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await openDetails(user, "about");
      expect(screen.queryByText("Added to this theme after it was installed — there is no original to reset to.")).not.toBeInTheDocument();
    });

    it("shows the Live/Not live publish state for a real candidate row", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "pricing", published: true })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await openDetails(user, "pricing");
      // "Publish"/value now render as a label/value pair (a `<dl>`), not one "Publish: Live"
      // sentence — see `ThemePageDetailsModal.tsx`'s own header, PART 3.
      const dialog = document.querySelector<HTMLElement>("dialog.theme-page-details-dialog")!;
      expect(within(dialog).getByText("Publish")).toBeInTheDocument();
      expect(within(dialog).getByText("Live")).toBeInTheDocument();
    });

    it("shows the locked reason (not Live/Not live) as the Publish line for a locked row", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "index", published: null })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await openDetails(user, "index");
      const dialog = document.querySelector<HTMLElement>("dialog.theme-page-details-dialog")!;
      expect(within(dialog).getByText("Always published — theme home page")).toBeInTheDocument();
    });

    it("is available for a locked row too — the row's own detail did not disappear when the inline reason moved onto the info icon", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "index", published: null, filePath: "render/pages/index.html" })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await openDetails(user, "index");
      expect(screen.getByText("render/pages/index.html")).toBeInTheDocument();
    });

    it("shows a warning naming the colliding content record and a link to open it", async () => {
      const user = userEvent.setup();
      renderWith(
        { pages: [PAGE] },
        {
          pages: [
            candidateRow({
              pageId: "about",
              published: true,
              collidingContent: { id: "post-1", slug: "about", title: "About Us", kind: "post" },
            }),
          ],
        }
      );
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await openDetails(user, "about");
      expect(screen.getByText(/A content record shares this page's URL: About Us\./)).toBeInTheDocument();
      const openLink = screen.getByRole("link", { name: "Open About Us" });
      expect(openLink).toHaveAttribute("href", "/admin/posts/post-1");
    });

    it("links to the Pages editor by slug, not id, when the colliding record is a Page", async () => {
      const user = userEvent.setup();
      renderWith(
        { pages: [PAGE] },
        {
          pages: [
            candidateRow({
              pageId: "about",
              collidingContent: { id: "pg-9", slug: "about-us", title: "About Us Page", kind: "page" },
            }),
          ],
        }
      );
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await openDetails(user, "about");
      expect(screen.getByRole("link", { name: "Open About Us Page" })).toHaveAttribute("href", "/admin/pages/about-us");
    });

    /**
     * Regression test — the collision link must fall back to the id for a colliding Page holding
     * the literal root slug `"/"` (`pageAdminPath`, `rules.ts`, 2026-09-03), since `/admin/pages//`
     * cannot match the admin router's `/:slug` pattern. Must FAIL against a bare `/pages/${slug}`
     * template and pass now that `themePageCollisionAdminPath` routes through `pageAdminPath`.
     */
    it("links to the Pages editor by id when the colliding Page holds the root slug '/'", async () => {
      const user = userEvent.setup();
      renderWith(
        { pages: [PAGE] },
        {
          pages: [
            candidateRow({
              pageId: "about",
              collidingContent: { id: "home-1", slug: "/", title: "Home", kind: "page" },
            }),
          ],
        }
      );
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await openDetails(user, "about");
      expect(screen.getByRole("link", { name: "Open Home" })).toHaveAttribute("href", "/admin/pages/home-1");
    });

    it("shows no collision warning when the row has no colliding content", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "about", collidingContent: null })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await openDetails(user, "about");
      expect(screen.queryByText(/A content record shares this page's URL/)).not.toBeInTheDocument();
    });

    it("closes via its own Close button", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "about" })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await openDetails(user, "about");
      const dialog = document.querySelector("dialog.theme-page-details-dialog")!;
      expect(dialog.hasAttribute("open")).toBe(true);
      await user.click(screen.getByRole("button", { name: "Close" }));
      expect(dialog.hasAttribute("open")).toBe(false);
    });

    it("closes on Escape (the dialog's native cancel event), preventing the browser's own close — mirrors MessageOverflowModal.unit.test.tsx's own pattern", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "about" })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await openDetails(user, "about");
      const dialog = document.querySelector("dialog.theme-page-details-dialog")!;
      expect(dialog.hasAttribute("open")).toBe(true);
      const cancelEvent = new Event("cancel", { cancelable: true });
      fireEvent(dialog, cancelEvent);
      expect(dialog.hasAttribute("open")).toBe(false);
      expect(cancelEvent.defaultPrevented).toBe(true);
    });

    it("closes on a click landing on the dialog's own backdrop area, not when it lands on content", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "about" })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await openDetails(user, "about");
      const dialog = document.querySelector("dialog.theme-page-details-dialog")!;
      fireEvent.click(screen.getByText("render/pages/about.html"));
      expect(dialog.hasAttribute("open")).toBe(true);
      fireEvent.click(dialog);
      expect(dialog.hasAttribute("open")).toBe(false);
    });

    it("stays closed (no attribute) until a row's Details item is chosen", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "about" })] });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      const dialog = document.querySelector("dialog.theme-page-details-dialog")!;
      expect(dialog.hasAttribute("open")).toBe(false);
    });

  });

  /**
   * PART 4 (2026-08-31, same-day follow-up to PART 2 above): the owner asked for Edit to live in the
   * row's `RowMenu`, directly under Details, not as a button inside the modal — moved out of
   * `ThemePageDetailsModal.tsx`'s own footer entirely. Same Theme Studio destination as before
   * (`themeStudioHref`, reused rather than re-derived) and as the table's own `Page` column link
   * (PART 5, 2026-09-13); `navigate` is mocked at the top of this file, same pattern `"row menu —
   * Publish/Unpublish visibility..."`'s own "Edit navigates to the Pages editor" test above uses for
   * My Pages' row menu.
   */
  describe("row menu — Edit (Theme Pages)", () => {
    /**
     * Asserts the RESOLVED destination, not the raw argument handed to the (mocked) `navigate` —
     * a bare `toHaveBeenCalledWith("/admin/themes/explore?...")` passed even while `onEdit` handed
     * `navigate` an ALREADY-`/admin`-prefixed href (2026-09-19 bug), because the mock swallows
     * `navigate`'s own real behavior of applying `adminHref` to whatever it receives. Running the
     * captured argument through the REAL `adminHref` (kept real via `importOriginal` at this file's
     * own top) reproduces that real behavior: a correct unprefixed route path resolves to the single
     * `/admin/...` URL below, while an already-prefixed one would double into `/admin/admin/...` and
     * fail this assertion — which is exactly the router-has-no-match-for-that, falls-back-to-
     * Dashboard bug an operator hit live.
     */
    function resolvedEditDestination(): string {
      const call = vi.mocked(navigate).mock.calls.at(-1);
      if (!call) throw new Error("navigate was not called");
      return adminHref(call[0]);
    }

    it("navigates to the same Theme Studio destination as the table's own Page column link", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "about" })], activeThemeId: "basic" });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      // The row's OWN `Page` cell also renders a link to the same destination, named after the page
      // id rather than "Edit" — no naming collision with this row-menu item (role "menuitem").
      await user.click(screen.getByRole("button", { name: 'Actions for "about"' }));
      await user.click(screen.getByRole("menuitem", { name: "Edit" }));
      expect(resolvedEditDestination()).toBe("/admin/themes/explore?theme=basic&page=about");
    });

    it("works for a locked row too — index has no `PostRecord` but is still editable in Theme Studio", async () => {
      const user = userEvent.setup();
      renderWith(
        { pages: [PAGE] },
        { pages: [candidateRow({ pageId: "index", published: null })], activeThemeId: "basic" }
      );
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await user.click(screen.getByRole("button", { name: 'Actions for "index"' }));
      await user.click(screen.getByRole("menuitem", { name: "Edit" }));
      expect(resolvedEditDestination()).toBe("/admin/themes/explore?theme=basic&page=index");
    });

    it("is listed directly under Details in the menu", async () => {
      const user = userEvent.setup();
      renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "about" })], activeThemeId: "basic" });
      await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
      await user.click(screen.getByRole("button", { name: 'Actions for "about"' }));
      const menuItems = screen.getAllByRole("menuitem").map((item) => item.textContent);
      expect(menuItems).toEqual(["Details", "Edit"]);
    });
  });

  it("shows a sensible empty state, not the My Pages empty copy, when the active theme ships no pages", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] }, { pages: [] });
    await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
    expect(screen.getByText("The active theme doesn't ship any of its own static pages.")).toBeInTheDocument();
    expect(screen.queryByText("No pages yet.")).not.toBeInTheDocument();
  });

  it("shows a loading notice on the Theme Pages tab while its own request is still in flight, without blocking My Pages", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] }, { pages: null, error: null });
    // "My Pages" (the default tab) already rendered its table — only the Theme Pages tab's own
    // body is gated on its own load, not the whole screen.
    expect(screen.getByRole("table")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
    expect(screen.getByText("Loading theme pages…")).toBeInTheDocument();
  });
});

describe("Theme Pages tab — deep link via ?tab=", () => {
  it("opens directly on Theme Pages when the URL carries ?tab=themes", () => {
    window.history.replaceState(null, "", "/admin/pages?tab=themes");
    renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "pricing" })] });
    expect(screen.getByRole("tab", { name: /^Theme Pages/, selected: true })).toBeInTheDocument();
  });

  it("falls back to My Pages for an unrecognized ?tab= value, rather than rendering neither tab", () => {
    window.history.replaceState(null, "", "/admin/pages?tab=bogus");
    renderWith({ pages: [PAGE] });
    expect(screen.getByRole("tab", { name: /^My Pages/, selected: true })).toBeInTheDocument();
  });

  it("writes ?tab=themes into the address bar via replaceState (not a new history entry) when the tab is clicked", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/admin/pages");
    const lengthBefore = window.history.length;
    renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "pricing" })] });
    await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
    expect(window.location.search).toBe("?tab=themes");
    expect(window.history.length).toBe(lengthBefore);
  });

  it("removes the ?tab= param when switching back to My Pages", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/admin/pages?tab=themes");
    renderWith({ pages: [PAGE] }, { pages: [candidateRow({ pageId: "pricing" })] });
    await user.click(screen.getByRole("tab", { name: /^My Pages/ }));
    expect(window.location.search).toBe("");
  });
});

/**
 * `pagesListNotice` — pulled out of `Pages` (2026-08-06, complexity pass, fourth pass; see its own
 * doc). The states above already exercise it end to end through the full component; these pin the
 * function's own branch decisions directly, no render involved.
 */
describe("pagesListNotice", () => {
  it("returns the error notice when there is an error and no list yet", () => {
    expect(pagesListNotice(null, "boom", identityT)).not.toBeNull();
  });

  it("returns the loading notice when there is no list and no error", () => {
    expect(pagesListNotice(null, null, identityT)).not.toBeNull();
  });

  it("prioritizes the error branch over the loading branch when both conditions could apply", () => {
    render(<>{pagesListNotice(null, "boom", identityT)}</>);
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.queryByText("Loading pages…")).not.toBeInTheDocument();
  });

  it("returns null once the list has loaded, even with an error set (the inline-banner case)", () => {
    expect(pagesListNotice([], "a later error", identityT)).toBeNull();
  });
});

/**
 * REGRESSION (2026-09-07 audit claim #2): per-row agent handles must follow the ROW, not the
 * render position.
 *
 * `DataTable` sorts internally (`sortedTableRows(props.rows, props.columns, props.sort)`, see
 * `@jini-ai/admin`'s `DataTable.tsx`) and hands each `cell` callback the index into that SORTED
 * order. `Pages.tsx` built its handle array from the unsorted `pages` prop and looked it up by
 * that sorted index, so every row whose sort position differed from its array position published
 * another page's handle — an agent asked to open "Draft Page" clicked "About".
 *
 * The fixture below is arranged so the default sort (`DEFAULT_PAGE_SORT`, Updated newest-first)
 * inverts the array order: `pg1` is first in `pages` but renders second.
 */
describe("per-row agent handles survive the table's own sort", () => {
  const OLDER: AdminPost = { ...PAGE, id: "pg1", title: "About", slug: "about", updatedAt: "2026-08-01T00:00:00.000Z" };
  const NEWER: AdminPost = { ...PAGE, id: "pg2", title: "Draft Page", slug: "draft-page", updatedAt: "2026-08-09T00:00:00.000Z" };

  /** The `data-agent-element` handle published on the row whose Title cell links to `title`. */
  function editHandleForTitle(container: HTMLElement, title: string): string | null {
    const link = within(container).getByRole("link", { name: title });
    return link.getAttribute("data-agent-element");
  }

  it("publishes each row's own id-derived handle after the default sort reorders them", () => {
    const { container } = render(
      <Pages
        usePagesHook={() => controller({ pages: [OLDER, NEWER] })}
        useThemePagesHook={() => themePagesController()}
      />
    );

    // Sanity: the default sort really did invert the array order, or this test proves nothing.
    const titles = within(container)
      .getAllByRole("link")
      .map((el) => el.textContent)
      .filter((text) => text === "About" || text === "Draft Page");
    expect(titles).toEqual(["Draft Page", "About"]);

    expect(editHandleForTitle(container, "Draft Page")).toBe("pages-row-pg2-edit");
    expect(editHandleForTitle(container, "About")).toBe("pages-row-pg1-edit");
  });
});
