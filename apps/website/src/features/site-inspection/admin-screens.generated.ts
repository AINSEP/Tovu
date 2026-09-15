/**
 * @file GENERATED — do not edit by hand. The admin app's agent-navigable screens (id, sidebar label,
 * route path relative to `/admin`), exactly as `apps/admin/src/lib/agent-pages.ts`'s
 * `listAdminAgentScreens()` derives them from `panels.tsx`'s `ADMIN_PANELS`.
 *
 * Checked in because the server cannot import that browser bundle. Guarded by
 * `apps/admin/src/lib/__tests__/admin-screens-manifest.unit.test.ts`, which fails when this list and
 * `ADMIN_PANELS` disagree. Regenerate from `apps/admin`:
 *   UPDATE_ADMIN_SCREENS_MANIFEST=1 npx vitest run src/lib/__tests__/admin-screens-manifest.unit.test.ts
 */

export const ADMIN_SCREENS: readonly { readonly id: string; readonly label: string; readonly path: string }[] = [
  { id: "dashboard", label: "Overview", path: "/" },
  { id: "sites", label: "Sites", path: "/sites" },
  { id: "ai-assistant", label: "AI Assistant", path: "/ai-assistant" },
  { id: "pages", label: "Pages", path: "/pages" },
  { id: "posts", label: "Posts", path: "/posts" },
  { id: "media", label: "Media", path: "/media" },
  { id: "collections", label: "Collections", path: "/collections" },
  { id: "menus", label: "Menus", path: "/menus" },
  { id: "widgets", label: "Widgets", path: "/widgets" },
  { id: "widget-regions", label: "Widget Regions", path: "/widgets/regions" },
  { id: "taxonomy", label: "Categories & Tags", path: "/taxonomy" },
  { id: "forms", label: "Forms", path: "/forms" },
  { id: "users", label: "Users", path: "/users" },
  { id: "authentication", label: "Authentication", path: "/authentication" },
  { id: "roles", label: "Roles & Permissions", path: "/roles" },
  { id: "members", label: "Members", path: "/members" },
  { id: "comments", label: "Comments", path: "/comments" },
  { id: "themes", label: "Themes", path: "/themes" },
  { id: "skills", label: "Skills", path: "/skills" },
  { id: "design-system", label: "Design System", path: "/design-system" },
  { id: "admin-appearance", label: "Appearance", path: "/admin-appearance" },
  { id: "playground", label: "Playground", path: "/playground" },
  { id: "plugins", label: "Plugins", path: "/plugins" },
  { id: "agent-plugins", label: "Agent Plugins", path: "/agent-plugins" },
  { id: "providers", label: "Integrations", path: "/providers" },
  { id: "integrations", label: "Integrations", path: "/integrations" },
  { id: "payments", label: "Payments", path: "/payments" },
  { id: "orders", label: "Orders", path: "/orders" },
  { id: "products", label: "Products", path: "/products" },
  { id: "subscriptions", label: "Subscriptions", path: "/subscriptions" },
  { id: "billing", label: "Billing", path: "/billing" },
  { id: "database", label: "Database", path: "/database" },
  { id: "recovery", label: "Recovery", path: "/recovery" },
  { id: "deployment", label: "Deployment", path: "/deployment" },
  { id: "source-control", label: "Source Control", path: "/source-control" },
  { id: "access-tokens", label: "Secrets", path: "/access-tokens" },
  { id: "observability", label: "Observability", path: "/observability" },
  { id: "activity-log", label: "Activity Log", path: "/activity-log" },
  { id: "import-export", label: "Import & Export", path: "/import-export" },
  { id: "settings", label: "Settings", path: "/settings" },
  { id: "workspace", label: "Workspace", path: "/workspace" },
  { id: "notifications", label: "Notifications", path: "/notifications" },
  { id: "trash", label: "Trash", path: "/trash" },
  { id: "seo", label: "SEO & Metadata", path: "/seo" },
  { id: "redirects", label: "Redirects", path: "/redirects" },
  { id: "newsletter", label: "Newsletter", path: "/newsletter" },
  { id: "analytics", label: "Analytics", path: "/analytics" },
  { id: "appearance", label: "Appearance", path: "/appearance" },
];
