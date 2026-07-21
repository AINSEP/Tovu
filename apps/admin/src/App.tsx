import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { api, type AdminUser } from "./lib/api";
import { Appearance } from "./sections/Appearance";
import { Dashboard } from "./sections/Dashboard";
import { Login } from "./sections/Login";
import { PostEditor } from "./sections/PostEditor";
import { Placeholder } from "./sections/Placeholder";
import { Posts } from "./sections/Posts";
import { Pages } from "./sections/Pages";
import { Members } from "./sections/Members";
import { Comments } from "./sections/Comments";
import { Analytics } from "./sections/Analytics";
import { Media } from "./sections/Media";
import { Menus } from "./sections/Menus";
import { MenuEditor } from "./sections/MenuEditor";
import { Integrations } from "./sections/Integrations";
import { IntegrationDeliveries } from "./sections/IntegrationDeliveries";
import { Users } from "./sections/Users";
import { Roles } from "./sections/Roles";
import { Settings } from "./sections/Settings";
import { Seo } from "./sections/Seo";
import { Redirects } from "./sections/Redirects";
import { FormsList } from "./sections/FormsList";
import { FormEditor } from "./sections/FormEditor";
import { Collections } from "./sections/Collections";
import { CollectionEntries } from "./sections/CollectionEntries";
import { CollectionEntryEditor } from "./sections/CollectionEntryEditor";
import { Taxonomy } from "./sections/Taxonomy";
import { Database } from "./sections/Database";
import { Recovery } from "./sections/Recovery";
import { WidgetsLibrary } from "./sections/WidgetsLibrary";
import { WidgetInstanceEditor } from "./sections/WidgetInstanceEditor";
import { WidgetRegions } from "./sections/WidgetRegions";
import { WidgetRegionEditor } from "./sections/WidgetRegionEditor";

type Route =
  | { view: "dashboard" }
  | { view: "posts" }
  | { view: "post-editor"; postId: string }
  | { view: "menus" }
  | { view: "menu-editor"; menuId: string | null }
  | { view: "widgets" }
  | { view: "widget-editor"; widgetId: string | null; widgetType: string | null }
  | { view: "widget-regions" }
  | { view: "widget-region-editor"; regionKey: string }
  | { view: "integrations" }
  | { view: "integration-deliveries"; subscriptionId: string }
  | { view: "forms" }
  | { view: "form-editor"; formId: string }
  | { view: "collection-entries"; contentTypeKey: string }
  | { view: "collection-entry-editor"; contentTypeKey: string; entryId: string | null }
  | { view: "section"; sectionId: string };

function parseHash(hash: string): Route {
  const [rawPath, rawQuery] = hash.replace(/^#\/?/, "").split("?");
  const parts = rawPath.split("/").filter(Boolean);
  const query = new URLSearchParams(rawQuery ?? "");
  if (parts.length === 0) return { view: "dashboard" };
  if (parts[0] === "posts" && parts[1]) return { view: "post-editor", postId: parts[1] };
  if (parts[0] === "posts") return { view: "posts" };
  if (parts[0] === "menus" && parts[1] === "new") return { view: "menu-editor", menuId: null };
  if (parts[0] === "menus" && parts[1]) return { view: "menu-editor", menuId: parts[1] };
  if (parts[0] === "menus") return { view: "menus" };
  if (parts[0] === "widgets" && parts[1] === "regions" && parts[2])
    return { view: "widget-region-editor", regionKey: parts[2] };
  if (parts[0] === "widgets" && parts[1] === "regions") return { view: "widget-regions" };
  if (parts[0] === "widgets" && parts[1] === "new")
    return { view: "widget-editor", widgetId: null, widgetType: query.get("type") };
  if (parts[0] === "widgets" && parts[1]) return { view: "widget-editor", widgetId: parts[1], widgetType: null };
  if (parts[0] === "widgets") return { view: "widgets" };
  if (parts[0] === "integrations" && parts[1])
    return { view: "integration-deliveries", subscriptionId: parts[1] };
  if (parts[0] === "integrations") return { view: "integrations" };
  if (parts[0] === "forms" && parts[1]) return { view: "form-editor", formId: parts[1] };
  if (parts[0] === "forms") return { view: "forms" };
  if (parts[0] === "collections" && parts[1] && parts[2])
    return { view: "collection-entry-editor", contentTypeKey: parts[1], entryId: parts[2] === "new" ? null : parts[2] };
  if (parts[0] === "collections" && parts[1]) return { view: "collection-entries", contentTypeKey: parts[1] };
  if (parts[0] === "appearance" || (parts[0] === "section" && parts[1] === "appearance"))
    return { view: "section", sectionId: "appearance" };
  if (parts[0] === "section" && parts[1]) return { view: "section", sectionId: parts[1] };
  return { view: "dashboard" };
}

/** Which sidebar NavItem.id is highlighted for the current route. */
function activeSectionId(route: Route): string {
  switch (route.view) {
    case "dashboard":
      return "dashboard";
    case "posts":
    case "post-editor":
      return "posts";
    case "menus":
    case "menu-editor":
      return "menus";
    case "widgets":
    case "widget-editor":
    case "widget-regions":
    case "widget-region-editor":
      return "widgets";
    case "integrations":
    case "integration-deliveries":
      return "integrations";
    case "forms":
    case "form-editor":
      return "forms";
    case "collection-entries":
    case "collection-entry-editor":
      return "collections";
    case "section":
      return route.sectionId;
  }
}

export function App() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [route, setRoute] = useState<Route>(parseHash(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  async function logout() {
    await api.logout().catch(() => undefined);
    setUser(null);
  }

  if (checking) return <div className="boot-screen">Loading Tovu…</div>;
  if (!user) return <Login onLogin={setUser} />;

  let content: React.ReactNode;
  switch (route.view) {
    case "dashboard":
      content = <Dashboard />;
      break;
    case "posts":
      content = <Posts />;
      break;
    case "post-editor":
      content = <PostEditor postId={route.postId} />;
      break;
    case "menus":
      content = <Menus />;
      break;
    case "menu-editor":
      content = <MenuEditor menuId={route.menuId} />;
      break;
    case "widgets":
      content = <WidgetsLibrary />;
      break;
    case "widget-editor":
      content = <WidgetInstanceEditor widgetId={route.widgetId} widgetType={route.widgetType} />;
      break;
    case "widget-regions":
      content = <WidgetRegions />;
      break;
    case "widget-region-editor":
      content = <WidgetRegionEditor regionKey={route.regionKey} />;
      break;
    case "integrations":
      content = <Integrations />;
      break;
    case "integration-deliveries":
      content = <IntegrationDeliveries subscriptionId={route.subscriptionId} />;
      break;
    case "forms":
      content = <FormsList />;
      break;
    case "form-editor":
      content = <FormEditor formId={route.formId} />;
      break;
    case "collection-entries":
      content = <CollectionEntries contentTypeKey={route.contentTypeKey} />;
      break;
    case "collection-entry-editor":
      content = <CollectionEntryEditor contentTypeKey={route.contentTypeKey} entryId={route.entryId} />;
      break;
    case "section":
      content =
        route.sectionId === "themes" || route.sectionId === "appearance" ? (
          <Appearance />
        ) : route.sectionId === "seo" ? (
          <Seo />
        ) : route.sectionId === "redirects" ? (
          <Redirects />
        ) : route.sectionId === "members" ? (
          <Members />
        ) : route.sectionId === "comments" ? (
          <Comments />
        ) : route.sectionId === "users" ? (
          <Users />
        ) : route.sectionId === "roles" ? (
          <Roles />
        ) : route.sectionId === "analytics" ? (
          <Analytics />
        ) : route.sectionId === "media" ? (
          <Media />
        ) : route.sectionId === "pages" ? (
          <Pages />
        ) : route.sectionId === "settings" ? (
          <Settings />
        ) : route.sectionId === "collections" ? (
          <Collections />
        ) : route.sectionId === "taxonomy" ? (
          <Taxonomy />
        ) : route.sectionId === "database" ? (
          <Database />
        ) : route.sectionId === "recovery" ? (
          <Recovery />
        ) : (
          <Placeholder sectionId={route.sectionId} />
        );
      break;
  }

  return (
    <div className="admin-layout">
      <Sidebar activeId={activeSectionId(route)} onLogout={logout} />
      <main className="admin-content">{content}</main>
    </div>
  );
}
