import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { api, type AdminUser } from "./lib/api";
import { Appearance } from "./sections/Appearance";
import { Dashboard } from "./sections/Dashboard";
import { Login } from "./sections/Login";
import { PostEditor } from "./sections/PostEditor";
import { Placeholder } from "./sections/Placeholder";
import { Posts } from "./sections/Posts";

type Route =
  | { view: "dashboard" }
  | { view: "posts" }
  | { view: "post-editor"; postId: string }
  | { view: "section"; sectionId: string };

function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { view: "dashboard" };
  if (parts[0] === "posts" && parts[1]) return { view: "post-editor", postId: parts[1] };
  if (parts[0] === "posts") return { view: "posts" };
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
    case "section":
      content =
        route.sectionId === "themes" || route.sectionId === "appearance" ? (
          <Appearance />
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
