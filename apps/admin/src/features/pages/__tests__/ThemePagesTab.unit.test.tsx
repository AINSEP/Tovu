import { render, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemePagesTab } from "../ThemePagesTab";
import type { ThemePageRow } from "../hooks/use-theme-pages.hooks";
import { Pages } from "../Pages";
import { PAGES_DICT, t as translate } from "../pages-i18n";
import { defaultPagesPort, createFakePagesPort } from "../hooks/pages-dependencies.hooks";
import { defaultThemePagesPort, createFakeThemePagesPort } from "../hooks/theme-pages-dependencies.hooks";
import { defaultAdminLocalePort } from "@/hooks/admin-locale-dependencies.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import type { AdminPost } from "@/lib/api";

const candidate: ThemePageRow = { pageId: "pricing", filePath: "render/pages/pricing.html", published: true, resettable: true, collidingContent: null };
function props() {
  return { pages: [candidate], activeThemeId: "north-star", error: null, savingPageId: null, setPagePublished: vi.fn(), t: (key: string) => key };
}

it("shows an initial error instead of loading, then keeps loaded rows visible with a later error", () => {
  // F6.2 regression target: return an error-only view even after pages have loaded, or hide the error banner.
  const p = props();
  const view = render(<ThemePagesTab {...p} pages={null} error="Theme unavailable" />);
  expect(screen.getByText("Theme unavailable")).toBeInTheDocument();
  expect(screen.queryByText("Loading theme pages…")).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  view.rerender(<ThemePagesTab {...p} error="Publishing failed" />);
  expect(screen.getByText("Publishing failed")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "pricing" })).toHaveAttribute("href", "/admin/themes/explore?theme=north-star&page=pricing");
  expect(screen.getByRole("switch", { name: "Publish pricing" })).toHaveAttribute("aria-checked", "true");
});

it("assigns lock and saving state to the owning row and dispatches the correct publish boolean", async () => {
  // F1.3/F2.5 regression target: disable all rows during one save, or always dispatch true.
  const user = userEvent.setup();
  const p = props();
  const rows: ThemePageRow[] = [
    candidate, { ...candidate, pageId: "index", published: null },
    { ...candidate, pageId: "about", published: false }, { ...candidate, pageId: "terms", published: false },
  ];
  render(<ThemePagesTab {...p} pages={rows} savingPageId="terms" />);
  const row = (name: string) => screen.getByRole("link", { name }).closest("tr")!;
  const toggle = (name: string) => within(row(name)).getByRole("switch", { name: `Publish ${name}` });
  expect(toggle("index")).toBeDisabled();
  expect(toggle("index")).toHaveAttribute("aria-checked", "true");
  expect(row("index").querySelector(".theme-page-lock-glyph")).toHaveAttribute("aria-hidden", "true");
  expect(row("pricing").querySelector(".theme-page-lock-glyph")).toBeNull();
  expect(row("about").querySelector(".theme-page-lock-glyph")).toBeNull();
  expect(toggle("terms")).toBeDisabled();
  expect(toggle("pricing")).toBeEnabled();
  expect(toggle("about")).toBeEnabled();
  await user.click(toggle("terms"));
  await user.click(toggle("index"));
  expect(p.setPagePublished).not.toHaveBeenCalled();
  await user.click(toggle("pricing"));
  await user.click(toggle("about"));
  expect(p.setPagePublished.mock.calls).toEqual([["pricing", false], ["about", true]]);
});

// Exercise the production locale binding, controllers and rendered notices together: translating
// a dictionary alone cannot catch a hook or accessible name that bypasses it.

const page: AdminPost = {
  id: "page-1", workspaceId: "workspace-local", kind: "page", title: "About", slug: "about",
  bodyJson: {}, bodyFormat: "html", bodyHtml: "", status: "draft", templateChoice: null,
  overridesThemePage: false, updatedAt: "2026-01-01T00:00:00.000Z", version: 1,
};

function LocaleReadyPages({ locale }: { locale: string }) {
  // Like the app's boot boundary, settle the locale before mounting a feature's first read.
  return useAdminLocale() === locale ? <Pages /> : null;
}

const translations = [
  {
    locale: "es", actions: 'Acciones para "pricing"',
    errors: ["no se pudieron cargar las páginas", "no se pudo crear la página", "no se pudo publicar la página",
      "no se pudo anular la publicación de la página", "no se pudo eliminar la página",
      "no se pudieron cargar las páginas del tema", "no se pudo actualizar el estado de publicación"],
  },
  {
    locale: "ja", actions: '"pricing"の操作',
    errors: ["ページの読み込みに失敗しました", "ページの作成に失敗しました", "ページの公開に失敗しました",
      "ページの公開解除に失敗しました", "ページの削除に失敗しました",
      "テーマページの読み込みに失敗しました", "公開状態の更新に失敗しました"],
  },
];

const errorKeys = ["failed to load pages", "failed to create page", "failed to publish page",
  "failed to unpublish page", "failed to delete page", "failed to load theme pages", "failed to update publish state"];

it("registers every list error requirement in all 21 locales, including keys absent everywhere before this fix", () => {
  expect(Object.keys(PAGES_DICT)).toHaveLength(21);
  for (const locale of Object.keys(PAGES_DICT)) {
    for (const key of errorKeys) {
      const value = translate({ locale, key });
      expect(value, `${locale}: ${key}`).not.toBe(key);
      expect(value.trim()).not.toBe("");
    }
  }
});

describe.each(translations)("Pages localization ($locale)", ({ locale, actions, errors }) => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/pages");
    vi.spyOn(defaultAdminLocalePort, "loadLanguage").mockResolvedValue(locale);
    const pages = createFakePagesPort({ pages: [page] });
    const theme = createFakeThemePagesPort({ activeThemeId: "north-star", pageFiles: [
      { path: "render/pages/pricing.html", group: "page", published: false, resettable: true },
    ] });
    vi.spyOn(defaultPagesPort, "listPages").mockImplementation(pages.listPages);
    vi.spyOn(defaultPagesPort, "createPage").mockImplementation(pages.createPage);
    vi.spyOn(defaultPagesPort, "updatePost").mockImplementation(pages.updatePost);
    vi.spyOn(defaultPagesPort, "deletePage").mockImplementation(pages.deletePage);
    vi.spyOn(defaultThemePagesPort, "getPresentation").mockImplementation(theme.getPresentation);
    vi.spyOn(defaultThemePagesPort, "getThemeDetail").mockImplementation(theme.getThemeDetail);
    vi.spyOn(defaultThemePagesPort, "setPagePublished").mockImplementation(theme.setPagePublished);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  const t = (key: string) => translate({ locale, key });

  it("translates the theme row's accessible menu name and opens its translated actions", async () => {
    window.history.replaceState(null, "", "/admin/pages?tab=themes");
    const user = userEvent.setup();
    render(<LocaleReadyPages locale={locale} />);
    const menu = await screen.findByRole("button", { name: actions });
    expect(screen.queryByRole("button", { name: 'Actions for "pricing"' })).not.toBeInTheDocument();
    await user.click(menu);
    expect(screen.getByRole("menuitem", { name: t("Details") })).toBeInTheDocument();
  });

  it("renders a translated page-load fallback", async () => {
    vi.mocked(defaultPagesPort.listPages).mockRejectedValue(null);
    render(<LocaleReadyPages locale={locale} />);
    expect(await screen.findByText(errors[0]!)).toBeInTheDocument();
    expect(screen.queryByText(errorKeys[0]!)).not.toBeInTheDocument();
  });

  it.each(["create", "publish", "unpublish", "delete"] as const)("translates the %s fallback after the user's action", async (action) => {
    const user = userEvent.setup();
    const index = { create: 1, publish: 2, unpublish: 3, delete: 4 }[action];
    vi.mocked(defaultPagesPort.createPage).mockRejectedValue(null);
    vi.mocked(defaultPagesPort.updatePost).mockRejectedValue(null);
    vi.mocked(defaultPagesPort.deletePage).mockRejectedValue(null);
    if (action === "unpublish") {
      vi.mocked(defaultPagesPort.listPages).mockResolvedValue({ posts: [{ post: { ...page, status: "published" } }] });
    }
    render(<LocaleReadyPages locale={locale} />);
    await screen.findByRole("link", { name: "About" });
    if (action === "create") {
      await user.click(screen.getByRole("button", { name: t("New Page") }));
    } else {
      await user.click(screen.getByRole("button", { name: t('Actions for "{title}"').replace("{title}", page.title) }));
      const key = { publish: "Publish", unpublish: "Unpublish", delete: "Delete" }[action];
      await user.click(screen.getByRole("menuitem", { name: t(key) }));
      if (action === "delete") await user.click(screen.getByRole("button", { name: t("Move to trash") }));
    }
    expect(await screen.findByText(errors[index]!)).toBeInTheDocument();
    expect(screen.queryByText(errorKeys[index]!)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "About" })).toBeInTheDocument();
  });

  it.each(["presentation", "detail", "publish"] as const)("translates theme %s failures through the wired controller", async (action) => {
    window.history.replaceState(null, "", "/admin/pages?tab=themes");
    if (action === "presentation") vi.mocked(defaultThemePagesPort.getPresentation).mockRejectedValue(null);
    if (action === "detail") vi.mocked(defaultThemePagesPort.getThemeDetail).mockRejectedValue(null);
    vi.mocked(defaultThemePagesPort.setPagePublished).mockRejectedValue(null);
    const user = userEvent.setup();
    render(<LocaleReadyPages locale={locale} />);
    if (action === "publish") {
      await user.click(await screen.findByRole("switch", { name: `${t("Publish")} pricing` }));
    }
    expect(await screen.findByText(errors[action === "publish" ? 6 : 5]!)).toBeInTheDocument();
  });

  it("keeps unknown theme server details in both initial and loaded error notices", () => {
    const view = render(<ThemePagesTab {...props()} t={t} pages={null} error="SERVER_DETAIL_123" />);
    expect(screen.getByText("SERVER_DETAIL_123")).toBeInTheDocument();
    view.rerender(<ThemePagesTab {...props()} t={t} error="SERVER_DETAIL_123" />);
    expect(screen.getByText("SERVER_DETAIL_123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "pricing" })).toBeInTheDocument();
  });

  it("keeps a specific server error instead of replacing it with the generic translation", async () => {
    vi.mocked(defaultPagesPort.createPage).mockRejectedValue(new Error("SERVER_DETAIL_123"));
    const user = userEvent.setup();
    render(<LocaleReadyPages locale={locale} />);
    await user.click(await screen.findByRole("button", { name: t("New Page") }));
    expect(await screen.findByText("SERVER_DETAIL_123")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: t("New Page") })).toBeEnabled());
  });
});
