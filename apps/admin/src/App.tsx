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

type Route =
  | { view: "dashboard" }
  | { view: "posts" }
  | { view: "post-editor"; postId: string }
  | { view: "menus" }
  | { view: "menu-editor"; menuId: string | null }
  | { view: "integrations" }
  | { view: "integration-deliveries"; subscriptionId: string }
  | { view: "forms" }
  | { view: "form-editor"; formId: string }
  | { view: "section"; sectionId: string };

function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { view: "dashboard" };
  if (parts[0] === "posts" && parts[1]) return { view: "post-editor", postId: parts[1] };
  if (parts[0] === "posts") return { view: "posts" };
  if (parts[0] === "menus" && parts[1] === "new") return { view: "menu-editor", menuId: null };
  if (parts[0] === "menus" && parts[1]) return { view: "menu-editor", menuId: parts[1] };
  if (parts[0] === "menus") return { view: "menus" };
  if (parts[0] === "integrations" && parts[1])
    return { view: "integration-deliveries", subscriptionId: parts[1] };
  if (parts[0] === "integrations") return { view: "integrations" };
  if (parts[0] === "forms" && parts[1]) return { view: "form-editor", formId: parts[1] };
  if (parts[0] === "forms") return { view: "forms" };
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
    case "integrations":
    case "integration-deliveries":
      return "integrations";
    case "forms":
    case "form-editor":
      return "forms";
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
