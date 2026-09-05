import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { ADMIN_PANELS, type PanelRouteContext } from "../../panels";
import { Themes, ThemeExplore } from "../../features/themes";
import { Dashboard } from "../../features/dashboard";
import { Placeholder } from "../../components/Placeholder";
import { PostEditor, Posts } from "../../features/posts";
import { PageEditor, Pages } from "../../features/pages";
import { Members } from "../../features/members";
import { Comments } from "../../features/comments";
import { Analytics } from "../../features/analytics";
import { Media } from "../../features/media";
import { Menus, MenuEditor } from "../../features/menus";
import { Integrations, IntegrationDeliveries } from "../../features/integrations";
import { Users } from "../../features/users";
import { Authentication } from "../../features/authentication";
import { Payments } from "../../features/commerce";
import { Roles } from "../../features/roles";
import { SettingsUi } from "../../features/settings";
import { Seo } from "../../features/seo";
import { Redirects } from "../../features/redirects";
import { Plugins, AgentPlugins } from "../../features/plugins";
import { FormsList, FormEditor } from "../../features/forms";
import { Collections, CollectionEntries, CollectionEntryEditor } from "../../features/collections";
import { Taxonomy } from "../../features/taxonomy";
import { Database } from "../../features/database";
import { Recovery } from "../../features/recovery";
import { Deployment } from "../../features/deployment";
import { SourceControl } from "../../features/source-control";
import { Security } from "../../features/security";
import { WidgetsLibrary, WidgetInstanceEditor, WidgetRegions, WidgetRegionEditor } from "../../features/widgets";
import { Workspace } from "../../features/workspace";
import { AiAssistant } from "../../features/ai-assistant";
import { Playground } from "../../features/playground";
import { Sites } from "../../features/sites";

/**
 * @file Coverage for `panels.tsx`'s `ADMIN_PANELS` (4/45 funcs — one `render` thunk per panel).
 *
 * `PanelRenderer` returns a `ReactNode` via `React.createElement` (JSX) — calling `panel.render(ctx)`
 * directly does NOT invoke the referenced component's own body, only builds the element description
 * (`.type`/`.props`/`.key`). That is what makes exercising all 45 renderers tractable in one file
 * without mounting (and therefore needing to stub the dependencies of) every feature screen in this
 * app: this file proves each panel wires to the RIGHT component with the RIGHT props for the RIGHT
 * route, the same class of regression `app-agent-page-identity.unit.test.tsx` guards against by
 * mounting `<App/>` for real — that file proves a handful of routes end-to-end through the full
 * router; this one proves the panel manifest itself, exhaustively, at the unit level.
 *
 * Team-lead's framing after reviewing the recon: "many small handlers rather than 45 genuinely
 * distinct behaviors." That held for about two-thirds of this file (a flat `render: () => <X/>` per
 * panel) but not for the rest — nine panels have real per-view dispatch logic (`?? "new"` id
 * fallbacks, a `"new"`-string-to-`null` id translation, a query param forced to `null` on one branch
 * of `widgets` but read on another) worth asserting directly rather than only smoke-testing.
 */

function panel(id: string) {
  const found = ADMIN_PANELS.find((p) => p.id === id);
  if (!found) throw new Error(`panel not found in ADMIN_PANELS: ${id}`);
  return found;
}

function ctx(overrides: Partial<PanelRouteContext> = {}): PanelRouteContext {
  return { view: null, params: {}, query: new URLSearchParams(), ...overrides };
}

describe("ADMIN_PANELS — manifest shape", () => {
  it("has exactly 46 panels, and every id is unique", () => {
    expect(ADMIN_PANELS).toHaveLength(46);
    expect(new Set(ADMIN_PANELS.map((p) => p.id)).size).toBe(46);
  });
});

/** Every panel whose `render` ignores `ctx` entirely and always returns the same element type
 *  (+ optionally fixed extra props) — the two-thirds majority the team-lead's framing predicted. */
const SIMPLE_PANELS: ReadonlyArray<{ id: string; component: unknown; extraProps?: Record<string, unknown> }> = [
  { id: "dashboard", component: Dashboard },
  { id: "sites", component: Sites },
  { id: "taxonomy", component: Taxonomy },
  { id: "users", component: Users },
  { id: "authentication", component: Authentication },
  { id: "roles", component: Roles },
  { id: "members", component: Members },
  { id: "comments", component: Comments },
  { id: "skills", component: Placeholder, extraProps: { sectionId: "skills" } },
  { id: "design-system", component: Placeholder, extraProps: { sectionId: "design-system" } },
  { id: "admin-appearance", component: Placeholder, extraProps: { sectionId: "admin-appearance" } },
  { id: "playground", component: Playground },
  { id: "plugins", component: Plugins },
  { id: "plugins-marketplace", component: Placeholder, extraProps: { sectionId: "plugins-marketplace" } },
  { id: "agent-plugins", component: AgentPlugins },
  { id: "payments", component: Payments },
  { id: "orders", component: Placeholder, extraProps: { sectionId: "orders" } },
  { id: "products", component: Placeholder, extraProps: { sectionId: "products" } },
  { id: "subscriptions", component: Placeholder, extraProps: { sectionId: "subscriptions" } },
  { id: "billing", component: Placeholder, extraProps: { sectionId: "billing" } },
  { id: "database", component: Database },
  { id: "recovery", component: Recovery },
  { id: "activity-log", component: Placeholder, extraProps: { sectionId: "activity-log" } },
  { id: "import-export", component: Placeholder, extraProps: { sectionId: "import-export" } },
  { id: "workspace", component: Workspace },
  { id: "notifications", component: Placeholder, extraProps: { sectionId: "notifications" } },
  { id: "trash", component: Placeholder, extraProps: { sectionId: "trash" } },
  { id: "seo", component: Seo },
  { id: "redirects", component: Redirects },
  { id: "newsletter", component: Placeholder, extraProps: { sectionId: "newsletter" } },
  { id: "analytics", component: Analytics },
];

describe.each(SIMPLE_PANELS)("panel '$id'", ({ id, component, extraProps }) => {
  it("renders the expected component with any expected fixed props, regardless of ctx", () => {
    const element = panel(id).render(ctx()) as ReactElement;
    expect(element.type).toBe(component);
    if (extraProps) expect(element.props).toMatchObject(extraProps);
  });
});

/** Panels whose `render` reads `ctx.query.get("tab")` straight into a `tabId` prop, with no switch. */
const TAB_THREADED_PANELS: ReadonlyArray<[id: string, component: unknown]> = [
  ["media", Media],
  ["ai-assistant", AiAssistant],
  ["deployment", Deployment],
  ["source-control", SourceControl],
  ["access-tokens", Security],
  ["settings", SettingsUi],
  // The nav-less `/appearance` alias for the SITE-themes screen (ADR-063) — its render has no
  // `ctx.view` switch of its own (unlike `themes` below, which also handles `theme-explore`), so it
  // fits this generic table even though it renders the same `Themes` component `themes` does.
  ["appearance", Themes],
];

describe.each(TAB_THREADED_PANELS)("panel '%s' — ?tab= threading", (id, component) => {
  it("threads ?tab= into tabId, and tabId is null when the query param is absent", () => {
    const withTab = panel(id).render(ctx({ query: new URLSearchParams("tab=execution") })) as ReactElement;
    expect(withTab.type).toBe(component);
    expect(withTab.props).toMatchObject({ tabId: "execution" });

    const withoutTab = panel(id).render(ctx()) as ReactElement;
    expect(withoutTab.props).toMatchObject({ tabId: null });
  });
});

describe("panel 'pages'", () => {
  it("index route (no view) renders Pages", () => {
    expect((panel("pages").render(ctx()) as ReactElement).type).toBe(Pages);
  });

  it("page-editor view renders PageEditor with slug from params, keyed by slug", () => {
    const el = panel("pages").render(ctx({ view: "page-editor", params: { slug: "about-us" } })) as ReactElement;
    expect(el.type).toBe(PageEditor);
    expect(el.props).toMatchObject({ slug: "about-us" });
    expect(el.key).toBe("about-us");
  });
});

describe("panel 'posts'", () => {
  it("index route renders Posts", () => {
    expect((panel("posts").render(ctx()) as ReactElement).type).toBe(Posts);
  });

  it("post-editor view renders PostEditor with postId from params, keyed by postId (staleness-fix keying)", () => {
    const el = panel("posts").render(ctx({ view: "post-editor", params: { postId: "p1" } })) as ReactElement;
    expect(el.type).toBe(PostEditor);
    expect(el.props).toMatchObject({ postId: "p1" });
    expect(el.key).toBe("p1");
  });
});

describe("panel 'collections'", () => {
  it("index route renders Collections", () => {
    expect((panel("collections").render(ctx()) as ReactElement).type).toBe(Collections);
  });

  it("collection-entries view renders CollectionEntries with contentTypeKey", () => {
    const el = panel("collections").render(ctx({ view: "collection-entries", params: { contentTypeKey: "blog" } })) as ReactElement;
    expect(el.type).toBe(CollectionEntries);
    expect(el.props).toMatchObject({ contentTypeKey: "blog" });
  });

  it("collection-entry-editor view: entryId 'new' in the URL becomes entryId: null", () => {
    const el = panel("collections").render(
      ctx({ view: "collection-entry-editor", params: { contentTypeKey: "blog", entryId: "new" } })
    ) as ReactElement;
    expect(el.type).toBe(CollectionEntryEditor);
    expect(el.props).toMatchObject({ contentTypeKey: "blog", entryId: null });
  });

  it("collection-entry-editor view: a real entryId threads through unchanged", () => {
    const el = panel("collections").render(
      ctx({ view: "collection-entry-editor", params: { contentTypeKey: "blog", entryId: "e1" } })
    ) as ReactElement;
    expect(el.props).toMatchObject({ contentTypeKey: "blog", entryId: "e1" });
  });
});

describe("panel 'menus'", () => {
  it("index route renders Menus", () => {
    expect((panel("menus").render(ctx()) as ReactElement).type).toBe(Menus);
  });

  it("menu-editor view: an absent menuId (the /new route) becomes menuId: null, keyed 'new'", () => {
    const el = panel("menus").render(ctx({ view: "menu-editor", params: {} })) as ReactElement;
    expect(el.type).toBe(MenuEditor);
    expect(el.props).toMatchObject({ menuId: null });
    expect(el.key).toBe("new");
  });

  it("menu-editor view: an existing menuId threads through, keyed by that id", () => {
    const el = panel("menus").render(ctx({ view: "menu-editor", params: { menuId: "m1" } })) as ReactElement;
    expect(el.props).toMatchObject({ menuId: "m1" });
    expect(el.key).toBe("m1");
  });
});

describe("panel 'widgets'", () => {
  it("index route renders WidgetsLibrary", () => {
    expect((panel("widgets").render(ctx()) as ReactElement).type).toBe(WidgetsLibrary);
  });

  it("widget-regions view renders WidgetRegions", () => {
    expect((panel("widgets").render(ctx({ view: "widget-regions" })) as ReactElement).type).toBe(WidgetRegions);
  });

  it("widget-region-editor view renders WidgetRegionEditor with regionKey", () => {
    const el = panel("widgets").render(ctx({ view: "widget-region-editor", params: { regionKey: "header" } })) as ReactElement;
    expect(el.type).toBe(WidgetRegionEditor);
    expect(el.props).toMatchObject({ regionKey: "header" });
  });

  it("widget-editor view (new): widgetId is null, widgetType is read from ?type=", () => {
    const el = panel("widgets").render(ctx({ view: "widget-editor", params: {}, query: new URLSearchParams("type=html") })) as ReactElement;
    expect(el.type).toBe(WidgetInstanceEditor);
    expect(el.props).toMatchObject({ widgetId: null, widgetType: "html" });
    expect(el.key).toBe("new");
  });

  it("widget-editor view (existing): widgetId threads through, and widgetType is forced null even with ?type= present", () => {
    const el = panel("widgets").render(
      ctx({ view: "widget-editor", params: { widgetId: "w1" }, query: new URLSearchParams("type=html") })
    ) as ReactElement;
    expect(el.props).toMatchObject({ widgetId: "w1", widgetType: null });
    expect(el.key).toBe("w1");
  });
});

describe("panel 'forms'", () => {
  it("index route renders FormsList", () => {
    expect((panel("forms").render(ctx()) as ReactElement).type).toBe(FormsList);
  });

  it("form-editor view (/:formId) renders FormEditor with formId, tab: 'fields', keyed by formId", () => {
    const el = panel("forms").render(ctx({ view: "form-editor", params: { formId: "f1" } })) as ReactElement;
    expect(el.type).toBe(FormEditor);
    expect(el.props).toMatchObject({ formId: "f1", tab: "fields" });
    expect(el.key).toBe("f1");
  });

  // ADR-063: Submissions is a real route (`/:formId/submissions`), not a `?tab=` filter — same
  // dual-pattern shape `collections` uses for `/:contentTypeKey/:entryId` + `/:contentTypeKey`.
  it("form-submissions view (/:formId/submissions) renders FormEditor with formId, tab: 'submissions', SAME key as form-editor", () => {
    const el = panel("forms").render(ctx({ view: "form-submissions", params: { formId: "f1" } })) as ReactElement;
    expect(el.type).toBe(FormEditor);
    expect(el.props).toMatchObject({ formId: "f1", tab: "submissions" });
    // Same key as the form-editor view's element above for the SAME formId — this is what lets
    // React treat a Fields<->Submissions switch as a prop update rather than a remount, so
    // in-progress Fields edits survive (see `FormEditor.unit.test.tsx`'s direct DOM-level proof).
    expect(el.key).toBe("f1");
  });
});

describe("panel 'themes'", () => {
  it("index route renders Themes", () => {
    expect((panel("themes").render(ctx()) as ReactElement).type).toBe(Themes);
  });

  // ADR-063: the tier tabs (Declarative/Static/Templated/Code/Marketplace) get `?tab=`, matching
  // `TAB_THREADED_PANELS` above — but `themes`' own `render` isn't in that generic table because,
  // unlike those panels, it ALSO dispatches on `ctx.view` for `theme-explore` below.
  it("index route threads ?tab= into tabId, and tabId is null when the query param is absent", () => {
    const withTab = panel("themes").render(ctx({ query: new URLSearchParams("tab=static") })) as ReactElement;
    expect(withTab.type).toBe(Themes);
    expect(withTab.props).toMatchObject({ tabId: "static" });

    const withoutTab = panel("themes").render(ctx()) as ReactElement;
    expect(withoutTab.props).toMatchObject({ tabId: null });
  });

  it("theme-explore view renders ThemeExplore with themeId from ?theme=, empty string when absent", () => {
    const withTheme = panel("themes").render(ctx({ view: "theme-explore", query: new URLSearchParams("theme=quartz") })) as ReactElement;
    expect(withTheme.type).toBe(ThemeExplore);
    expect(withTheme.props).toMatchObject({ themeId: "quartz" });

    const withoutTheme = panel("themes").render(ctx({ view: "theme-explore" })) as ReactElement;
    expect(withoutTheme.props).toMatchObject({ themeId: "" });
  });
});

describe("panel 'integrations'", () => {
  it("index route renders Integrations", () => {
    expect((panel("integrations").render(ctx()) as ReactElement).type).toBe(Integrations);
  });

  it("integration-deliveries view renders IntegrationDeliveries with subscriptionId", () => {
    const el = panel("integrations").render(ctx({ view: "integration-deliveries", params: { subscriptionId: "sub1" } })) as ReactElement;
    expect(el.type).toBe(IntegrationDeliveries);
    expect(el.props).toMatchObject({ subscriptionId: "sub1" });
  });
});

describe("ADMIN_PANELS — every panel id is exercised by this file", () => {
  it("no panel id is missing from the simple/tab-threaded/switch-based test groups above", () => {
    const switchTested = ["pages", "posts", "collections", "menus", "widgets", "forms", "themes", "integrations"];
    const covered = new Set([...SIMPLE_PANELS.map((p) => p.id), ...TAB_THREADED_PANELS.map(([id]) => id), ...switchTested]);
    const missing = ADMIN_PANELS.map((p) => p.id).filter((id) => !covered.has(id));
    expect(missing).toEqual([]);
  });
});
