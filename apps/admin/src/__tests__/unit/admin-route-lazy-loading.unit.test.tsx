import { render, screen } from "@testing-library/react";
import { createElement, lazy, type ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchRoute } from "@jini-ai/admin/core";
import type { PanelRenderContext } from "../../panel-contracts";

// Record module evaluation, rather than component mounting: eagerly imported pages can also
// remain unmounted until navigation, which would miss the bundle-loading regression.
const loaded = new Set<string>();
const loadedPages: string[] = [];
const EAGER_BRIDGES = ["comments", "redirects", "seo", "widgets"];
const EAGER_MODULES = [...EAGER_BRIDGES, "forms"];
const ROUTE_FEATURES = [
  { modulePath: "../../features/skills/Skills", moduleId: "skills", exports: ["Skills"] },
  { modulePath: "../../features/themes", moduleId: "themes", exports: ["Themes", "ThemeExplore"] },
  { modulePath: "../../features/admin-ui", moduleId: "admin-ui", exports: ["AdminUi"] },
  { modulePath: "../../features/dashboard", moduleId: "dashboard", exports: ["Dashboard"] },
  { modulePath: "../../features/import-export", moduleId: "import-export", exports: ["ImportExport"] },
  { modulePath: "../../features/consent", moduleId: "consent", exports: ["CookieConsent"] },
  { modulePath: "../../features/posts", moduleId: "posts", exports: ["PostEditor", "Posts"] },
  { modulePath: "../../features/pages", moduleId: "pages", exports: ["PageEditor", "Pages"] },
  { modulePath: "../../features/members", moduleId: "members", exports: ["Members"] },
  { modulePath: "../../features/comments", moduleId: "comments", exports: ["Comments"] },
  { modulePath: "../../features/analytics", moduleId: "analytics", exports: ["Analytics"] },
  { modulePath: "../../features/library", moduleId: "library", exports: ["Library"] },
  { modulePath: "../../features/menus", moduleId: "menus", exports: ["Menus", "MenuEditor"] },
  { modulePath: "../../features/providers", moduleId: "providers", exports: ["Providers"] },
  { modulePath: "../../features/users", moduleId: "users", exports: ["Users"] },
  { modulePath: "../../features/authentication", moduleId: "authentication", exports: ["Authentication"] },
  { modulePath: "../../features/roles", moduleId: "roles", exports: ["Roles"] },
  { modulePath: "../../features/settings", moduleId: "settings", exports: ["SettingsUi"] },
  { modulePath: "../../features/seo", moduleId: "seo", exports: ["Seo"] },
  { modulePath: "../../features/redirects", moduleId: "redirects", exports: ["Redirects"] },
  { modulePath: "../../features/plugins", moduleId: "plugins", exports: ["Plugins", "AgentPlugins"] },
  { modulePath: "../../features/forms", moduleId: "forms", exports: ["FormsList", "FormEditor"] },
  { modulePath: "../../features/collections", moduleId: "collections", exports: ["Collections", "CollectionEntries", "CollectionEntryEditor"] },
  { modulePath: "../../features/taxonomy", moduleId: "taxonomy", exports: ["Taxonomy"] },
  { modulePath: "../../features/trash", moduleId: "trash", exports: ["Trash"] },
  { modulePath: "../../features/email", moduleId: "email", exports: ["Email", "EmailTemplateEditor"] },
  { modulePath: "../../features/database", moduleId: "database", exports: ["Database"] },
  { modulePath: "../../features/recovery", moduleId: "recovery", exports: ["Recovery"] },
  { modulePath: "../../features/deployment", moduleId: "deployment", exports: ["Deployment"] },
  { modulePath: "../../features/source-control", moduleId: "source-control", exports: ["SourceControl"] },
  { modulePath: "../../features/security", moduleId: "security", exports: ["Security"] },
  { modulePath: "../../features/observability", moduleId: "observability", exports: ["Observability"] },
  { modulePath: "../../features/widgets", moduleId: "widgets", exports: ["WidgetsLibrary", "WidgetInstanceEditor", "WidgetRegions", "WidgetRegionEditor"] },
  { modulePath: "../../features/ai-assistant", moduleId: "ai-assistant", exports: ["AiAssistant"] },
  { modulePath: "../../features/playground", moduleId: "playground", exports: ["Playground"] },
  { modulePath: "../../features/sites", moduleId: "sites", exports: ["Sites"] },
  { modulePath: "../../features/media", moduleId: "media", exports: ["Media"] },
  { modulePath: "../../features/integrations/IntegrationDeliveries", moduleId: "integrations", exports: ["IntegrationDeliveries"] },
];

// Render just the route inputs under test; page effects and network reads are outside this seam.
const routeProbes = {
  Posts: () => createElement("h1", null, "Posts list"),
  PostEditor: ({ postId }: { postId: string }) => createElement("h1", null, `Post ${postId}`),
  Pages: () => createElement("h1", null, "Pages list"),
  PageEditor: ({ slug }: { slug: string }) => createElement("h1", null, `Page ${slug}`),
  Media: ({ tabId, itemId }: { tabId: string | null; itemId: string | null }) =>
    createElement("h1", null, `Media ${tabId} ${itemId}`),
  SettingsUi: ({ tabId }: { tabId: string | null }) => createElement("h1", null, `Settings ${tabId}`),
  Collections: () => createElement("h1", null, "Collections list"),
  CollectionEntryEditor: ({ contentTypeKey, entryId }: { contentTypeKey: string; entryId: string | null }) =>
    createElement("h1", null, `Collection ${contentTypeKey} ${entryId ?? "new"}`),
};
vi.mock("../../hooks/use-admin-locale.hooks", () => ({ useWiredAdminLocale: () => "es" }));

const Placeholder: PanelRenderContext["Placeholder"] = ({ sectionId }) => createElement("h1", null, sectionId);

beforeEach(() => {
  vi.resetModules();
  loaded.clear();
  loadedPages.length = 0;
  // resetModules preserves cached mock factories. Re-register them so each case observes real
  // module evaluation afresh, including when another case has already visited the same feature.
  for (const feature of ROUTE_FEATURES) {
    vi.doMock(feature.modulePath, () => {
      loaded.add(feature.moduleId);
      return Object.fromEntries(feature.exports.map(name => [
        name,
        fakeRouteExport({ moduleId: feature.moduleId, name }),
      ]));
    });
  }
});

// Fake the Jini page boundary beneath a thin, synchronous host adapter. Module evaluation and
// actual page-loader invocation are distinct observations; mounting alone cannot detect either.
function fakeRouteExport({ moduleId, name }: { moduleId: string; name: string }) {
  const Page = routeProbes[name as keyof typeof routeProbes] ?? (() => createElement("h1", null, name));
  if (!EAGER_BRIDGES.includes(moduleId)) return Page;
  const DeferredPage = lazy(async () => {
    loadedPages.push(name);
    return { default: Page as ComponentType<Record<string, unknown>> };
  });
  return (props: Record<string, unknown>) => createElement(DeferredPage, props);
}

describe("admin routes load only the page being visited", () => {
  it("opening navigation evaluates only the thin adapters and required Forms bridge", async () => {
    const { ADMIN_PANELS } = await import("../../panels");
    const { getNav } = await import("../../nav");
    expect(getNav().flatMap(group => group.items).length).toBeGreaterThan(0);
    // Jini's Forms List deliberately avoids a native import before its bounded API read.
    expect([...loaded].sort()).toEqual([...EAGER_MODULES].sort());
    expect([...loadedPages]).toEqual([]);

    const posts = ADMIN_PANELS.find(panel => panel.id === "posts")!;
    const context = { view: null, params: {}, query: new URLSearchParams(), Placeholder };
    // Constructing an element (as route selection does) must not start the import either.
    const element = posts.render(context);
    expect([...loaded].sort()).toEqual([...EAGER_MODULES].sort());
    const view = render(<><aside>Admin navigation</aside>{element}</>);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando Tovu…");
    expect(screen.getByText("Admin navigation")).toBeVisible();
    await screen.findByRole("heading", { name: "Posts list" });
    expect([...loaded].sort()).toEqual([...EAGER_MODULES, "posts"].sort());

    const settings = ADMIN_PANELS.find(panel => panel.id === "settings")!;
    view.rerender(<><aside>Admin navigation</aside>{settings.render({ ...context, query: new URLSearchParams("tab=interface") })}</>);
    await screen.findByRole("heading", { name: "Settings interface" });
    expect([...loaded].sort()).toEqual([...EAGER_MODULES, "posts", "settings"].sort());
    expect([...loadedPages]).toEqual([]);
  });

  it.each([
    ["/comments", "Comments"],
    ["/redirects", "Redirects"],
    ["/seo", "Seo"],
    ["/widgets", "WidgetsLibrary"],
    ["/widgets/regions", "WidgetRegions"],
    ["/widgets/regions/footer", "WidgetRegionEditor"],
    ["/widgets/new?type=text", "WidgetInstanceEditor"],
  ])("%s has a synchronous adapter while its page waits for rendering", async (routePath, name) => {
    const pages = await import("../../panel-pages");
    const { ADMIN_PANELS } = await import("../../panels");
    expect(typeof pages[name as keyof typeof pages]).toBe("function");
    expect([...loadedPages]).toEqual([]);
    const route = matchRoute({ routePath, panels: ADMIN_PANELS });
    const element = ADMIN_PANELS.find(panel => panel.id === route.panelId)!.render({ ...route, Placeholder });
    expect([...loadedPages]).toEqual([]);

    const view = render(<>{element}</>);
    await screen.findByRole("heading", { name });
    expect([...loadedPages]).toEqual([name]);
    expect([...loaded].sort()).toEqual([...EAGER_MODULES].sort());
    view.unmount();
    render(<>{element}</>);
    expect(screen.getByRole("heading", { name })).toBeVisible();
    expect([...loadedPages]).toEqual([name]);
  });

  it.each([
    ["/skills", "Skills", "skills"],
    ["/themes", "Themes", "themes"],
    ["/admin-ui", "AdminUi", "admin-ui"],
    ["/dashboard", "Dashboard", "dashboard"],
    ["/import-export", "ImportExport", "import-export"],
    ["/consent", "CookieConsent", "consent"],
    ["/posts", "Posts list", "posts"],
    ["/pages", "Pages list", "pages"],
    ["/members", "Members", "members"],
    ["/comments", "Comments", "comments"],
    ["/analytics", "Analytics", "analytics"],
    ["/library", "Library", "library"],
    ["/menus", "Menus", "menus"],
    ["/providers", "Providers", "providers"],
    ["/users", "Users", "users"],
    ["/authentication", "Authentication", "authentication"],
    ["/roles", "Roles", "roles"],
    ["/settings", "Settings null", "settings"],
    ["/seo", "Seo", "seo"],
    ["/redirects", "Redirects", "redirects"],
    ["/plugins", "Plugins", "plugins"],
    ["/forms", "FormsList", "forms"],
    ["/collections", "Collections list", "collections"],
    ["/taxonomy", "Taxonomy", "taxonomy"],
    ["/trash", "Trash", "trash"],
    ["/email", "Email", "email"],
    ["/database", "Database", "database"],
    ["/recovery", "Recovery", "recovery"],
    ["/deployment", "Deployment", "deployment"],
    ["/source-control", "SourceControl", "source-control"],
    ["/access-tokens", "Security", "security"],
    ["/observability", "Observability", "observability"],
    ["/widgets", "WidgetsLibrary", "widgets"],
    ["/ai-assistant", "AiAssistant", "ai-assistant"],
    ["/playground", "Playground", "playground"],
    ["/sites", "Sites", "sites"],
    ["/media", "Media null null", "media"],
    ["/integrations/sub-1", "IntegrationDeliveries", "integrations"],
    ["/posts/hello", "Post hello", "posts"],
    ["/posts?create=1", "Post ", "posts"],
    ["/pages/about-us", "Page about-us", "pages"],
    ["/media?tab=videos&id=asset-1", "Media videos asset-1", "media"],
    ["/settings?tab=interface", "Settings interface", "settings"],
    ["/collections/articles/new", "Collection articles new", "collections"],
  ])("a direct link to %s renders the matching page without loading unrelated routes", async (routePath, heading, moduleId) => {
    const { ADMIN_PANELS } = await import("../../panels");
    const route = matchRoute({ routePath, panels: ADMIN_PANELS });
    expect([...loaded].sort()).toEqual([...EAGER_MODULES].sort());
    const panel = ADMIN_PANELS.find(candidate => candidate.id === route.panelId)!;
    render(<>{panel.render({ ...route, Placeholder })}</>);
    await screen.findByRole("heading", { name: heading.trim() });
    expect([...loaded].sort()).toEqual([...new Set([...EAGER_MODULES, moduleId])].sort());
  });
});
