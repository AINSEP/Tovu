import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Pages, pagesListNotice } from "../Pages";
import type { PagesController } from "../hooks/use-pages.hooks";
import type { ThemePagesController } from "../hooks/use-theme-pages.hooks";
import { navigate } from "@/lib/router";
import type { AdminPost } from "@/lib/api";

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
  return {
    pages: [PAGE],
    error: null,
    creating: false,
    rowSavingId: null,
    pendingDelete: null,
    setPendingDelete: vi.fn(),
    createPage: vi.fn(async () => {}),
    disablePage: vi.fn(async () => {}),
    removePage: vi.fn(async () => {}),
    // `PAGES_DICT` has no `en` entry (only translated locales) — `key` IS the English copy, so
    // the identity function is a faithful fake for the wired hook's real English behavior, same
    // as every assertion below already expects.
    t: (key) => key,
    locale: "en",
    ...overrides,
  };
}

function themePagesController(overrides: Partial<ThemePagesController> = {}): ThemePagesController {
  return { pageIds: [], activeThemeId: "basic", error: null, ...overrides };
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
    // Built from the slug (not the id) — the Pages editor URL is slug-based.
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/admin/pages/about");
    expect(screen.getByRole("link", { name: "/about" })).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    expect(screen.getByText("2026-08-01 12:34")).toBeInTheDocument();
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

describe("row menu — Disable visibility mirrors pageRowMenuItems", () => {
  it("offers Disable for a published page", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] });
    await user.click(screen.getByRole("button", { name: 'Actions for "About"' }));
    expect(screen.getByRole("menuitem", { name: "Disable" })).toBeInTheDocument();
  });

  it("omits Disable for a draft page", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [DRAFT_PAGE] });
    await user.click(screen.getByRole("button", { name: 'Actions for "Draft Page"' }));
    expect(screen.queryByRole("menuitem", { name: "Disable" })).not.toBeInTheDocument();
  });

  it("Edit navigates to the Pages editor at /pages/{slug}, never the Posts editor", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] });
    await user.click(screen.getByRole("button", { name: 'Actions for "About"' }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(navigate).toHaveBeenCalledWith("/pages/about");
  });

  it("Disable calls disablePage with the row", async () => {
    const user = userEvent.setup();
    const c = renderWith({ pages: [PAGE] });
    await user.click(screen.getByRole("button", { name: 'Actions for "About"' }));
    await user.click(screen.getByRole("menuitem", { name: "Disable" }));
    expect(c.disablePage).toHaveBeenCalledWith(PAGE);
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
    renderWith({ pages: [PAGE] }, { pageIds: ["pricing", "docs"] });
    expect(screen.getByRole("tab", { name: "My Pages1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Theme Pages2" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Theme Pages2" }));
    expect(screen.queryByRole("button", { name: "New Page" })).not.toBeInTheDocument();
  });

  it("lists each theme page id with a view link and a read-only badge, no RowMenu", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] }, { pageIds: ["pricing"] });
    await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
    expect(screen.getByText("pricing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "/pricing" })).toBeInTheDocument();
    expect(screen.getByText("Theme content — read-only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
  });

  /**
   * Owner request (2026-08-27): this cell used to link to the LIVE site. It now opens the theme
   * studio focused on that page instead — the row is about the THEME's copy of the page, and the
   * only useful thing to do with it from here is edit it.
   */
  it("links each theme page row to the theme studio with both params, not to the live site", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] }, { pageIds: ["404"], activeThemeId: "basic" });
    await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
    const link = screen.getByRole("link", { name: "/404" });
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
    renderWith({ pages: [PAGE] }, { pageIds: ["404"], activeThemeId: "basic" });
    await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
    const link = screen.getByRole("link", { name: "/404" });
    expect(link).not.toHaveAttribute("target");
    expect(link).not.toHaveAttribute("rel");
  });

  it("percent-encodes both params, so a page id or theme id containing a space or & cannot forge a third param", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] }, { pageIds: ["my page&x=1"], activeThemeId: "b a&sic" });
    await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
    const link = screen.getByRole("link", { name: "/my page&x=1" });
    expect(link.getAttribute("href")).toBe("/admin/themes/explore?theme=b%20a%26sic&page=my%20page%26x%3D1");
  });

  it("still labels the 'index' page id as the site root, and points it at that page's own studio entry — pages.ts's static-page route excludes that slug (home is served by the route === \"home\" branch instead)", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] }, { pageIds: ["index"], activeThemeId: "basic" });
    await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
    const link = screen.getByRole("link", { name: "/" });
    expect(link.getAttribute("href")).toBe("/admin/themes/explore?theme=basic&page=index");
  });

  it("shows the page path as plain text, never a half-built ?theme= link, before the active theme id is known", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] }, { pageIds: ["404"], activeThemeId: null });
    await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
    expect(screen.getByText("Loading theme pages…")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "/404" })).not.toBeInTheDocument();
  });

  it("shows a sensible empty state, not the My Pages empty copy, when the active theme ships no pages", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] }, { pageIds: [] });
    await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
    expect(screen.getByText("The active theme doesn't ship any of its own static pages.")).toBeInTheDocument();
    expect(screen.queryByText("No pages yet.")).not.toBeInTheDocument();
  });

  it("shows a loading notice on the Theme Pages tab while its own request is still in flight, without blocking My Pages", async () => {
    const user = userEvent.setup();
    renderWith({ pages: [PAGE] }, { pageIds: null, error: null });
    // "My Pages" (the default tab) already rendered its table — only the Theme Pages tab's own
    // body is gated on its own load, not the whole screen.
    expect(screen.getByRole("table")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /^Theme Pages/ }));
    expect(screen.getByText("Loading theme pages…")).toBeInTheDocument();
  });
});

/**
 * `pagesListNotice` — pulled out of `Pages` (2026-08-06, complexity pass, fourth pass; see its own
 * doc). The states above already exercise it end to end through the full component; these pin the
 * function's own branch decisions directly, no render involved.
 */
describe("pagesListNotice", () => {
  it("returns the error notice when there is an error and no list yet", () => {
    expect(pagesListNotice(null, "boom")).not.toBeNull();
  });

  it("returns the loading notice when there is no list and no error", () => {
    expect(pagesListNotice(null, null)).not.toBeNull();
  });

  it("prioritizes the error branch over the loading branch when both conditions could apply", () => {
    render(<>{pagesListNotice(null, "boom")}</>);
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.queryByText("Loading pages…")).not.toBeInTheDocument();
  });

  it("returns null once the list has loaded, even with an error set (the inline-banner case)", () => {
    expect(pagesListNotice([], "a later error")).toBeNull();
  });
});
