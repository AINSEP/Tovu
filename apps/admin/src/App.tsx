import { useEffect, useMemo, useState } from "react";
import { createFrontendSessionBridge, type FrontendSessionBridge } from "@jini-ai/ui/chat";
import { createDomPageDriver } from "@jini-ai/agentic/dom";
import { Sidebar } from "./components/Sidebar";
import { buildAdminAgentPages } from "./lib/agent-pages";
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
import { Plugins } from "./sections/Plugins";
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
import { Workspace } from "./sections/Workspace";
import { AiAssistant } from "./sections/AiAssistant";
import { AssistantDock } from "./components/AssistantDock";
import { ChatFab } from "./components/ChatFab";

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
  const [chatOpen, setChatOpen] = useState(false);
  /**
   * State, not a `useRef`, and attached as a callback ref below — because the effect that builds
   * the page driver needs to run *when this node appears*, and a ref being populated is not a
   * dependency change.
   *
   * The concrete failure that forced this (caught live, not in review): `api.me()` resolves
   * `setUser` in a `.then` and `setChecking(false)` in a `.finally`, which are separate
   * microtasks and therefore separate renders. On the first of them `user` is set but the layout
   * is still showing the boot screen, so `<main>` is not mounted — a `useRef` would read `null`,
   * the effect would bail, and the render that actually mounts `<main>` would not re-run it,
   * because nothing in its dependency list changed. Page control would then be silently dead for
   * the whole session with no error anywhere.
   */
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null);
  const [agentBridge, setAgentBridge] = useState<FrontendSessionBridge | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Stable for the app's lifetime: rebuilding it would tear down the driver (and with it the SSE
  // connection) on every render.
  const agentPages = useMemo(() => buildAdminAgentPages(), []);

  /**
   * Agent-driven control of this tab. The daemon relays each `page.*` invocation down the
   * frontend-session SSE stream (proxied by `src/server/modules/assistant.ts`), having already
   * passed `ToolExecutor`'s authorization, timeout and audit on the way in — this side only
   * executes what arrives.
   *
   * Scoped to `contentRef`, never `document`. Scanning the whole page would make any markup
   * anywhere — including rendered post content an author or a commenter wrote — into an
   * authorization decision, which is the opposite of an explicit allowlist. The chat pane itself
   * sits outside this subtree on purpose, so a page verb cannot reach into the assistant's own UI.
   *
   * No `currentPage`: the driver reads `data-agent-page` off the live DOM on every call, so a
   * navigation actually changes what elements report themselves as belonging to. Pinning it here
   * would freeze it at whatever was mounted when this effect ran.
   *
   * Outlives every route change — the connection belongs to the tab, not to a view. `contentEl`
   * is stable across navigations (the same `<main>` is reused; only its children swap), so this
   * does not reconnect on every section change.
   */
  useEffect(() => {
    if (!contentEl) return;

    const bridge = createFrontendSessionBridge({
      pageDriver: createDomPageDriver({ root: contentEl, pages: agentPages }),
      onError: (error) => console.error("[admin] frontend session", error),
    });
    // Attach failure is not fatal: the assistant still works, it just cannot drive the page, and
    // every `page.*` call it makes is refused by name rather than hanging.
    bridge.ready.catch((error: unknown) => console.error("[admin] page control never attached", error));
    setAgentBridge(bridge);

    return () => {
      bridge.close();
      setAgentBridge((current) => (current === bridge ? null : current));
    };
  }, [contentEl, agentPages]);

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
        ) : route.sectionId === "plugins" ? (
          <Plugins />
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
        ) : route.sectionId === "workspace" ? (
          <Workspace />
        ) : route.sectionId === "ai-assistant" ? (
          <AiAssistant />
        ) : (
          <Placeholder sectionId={route.sectionId} />
        );
      break;
  }

  return (
    <div className="admin-layout">
      <Sidebar activeId={activeSectionId(route)} onLogout={logout} />
      {/* `data-agent-page` is how the page driver reports where it is: `page.find_elements` tags
          every handle with its nearest `[data-agent-page]` ancestor, and `page.navigate` reads it
          back to say which page it left and which it landed on. Set from the same
          `activeSectionId(route)` the sidebar highlights, so the id an agent sees is the id a
          human sees selected. */}
      <main className="admin-content" ref={setContentEl} data-agent-page={activeSectionId(route)}>
        {content}
      </main>
      {/* `hidden`, never unmounted: every admin page shares one assistant conversation, which must
          survive both closing the dock and navigating to a different section (ADR-049). */}
      <aside className="admin-chat-dock" hidden={!chatOpen} aria-label="Assistant">
        <AssistantDock agentBridge={agentBridge} />
      </aside>
      <ChatFab open={chatOpen} onToggle={() => setChatOpen((current) => !current)} label="assistant" />
    </div>
  );
}
