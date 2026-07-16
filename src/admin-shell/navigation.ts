export type AdminSectionId =
  | "dashboard"
  | "posts"
  | "media"
  | "pages"
  | "comments"
  | "appearance"
  | "plugins"
  | "users"
  | "tools"
  | "settings"
  | "recovery";

export type AdminCurrentKey = AdminSectionId | "post-list" | "post-editor";

export interface AdminSectionDefinition {
  id: AdminSectionId;
  label: string;
  icon: string;
  description: string;
}

export interface AdminMenuChildEntry {
  key: string;
  label: string;
  href: string;
  current: boolean;
}

export interface AdminMenuPromoEntry {
  kind: "promo";
  key: string;
  title: string;
  actionLabel: string;
  href: string;
}

export interface AdminMenuSeparatorEntry {
  kind: "separator";
  key: string;
}

export interface AdminMenuLinkEntry {
  kind: "link";
  key: string;
  label: string;
  icon: string;
  href: string;
  current: boolean;
  badge?: string;
  children?: AdminMenuChildEntry[];
  tone?: "default" | "product";
}

export type AdminMenuEntry = AdminMenuPromoEntry | AdminMenuSeparatorEntry | AdminMenuLinkEntry;

export type AdminMenuTarget =
  | { kind: "dashboard" }
  | { kind: "section"; sectionId: AdminSectionId }
  | { kind: "default-post-editor" };

interface AdminMenuChildDefinition {
  key: string;
  label: string;
  target: AdminMenuTarget;
  currentKey?: AdminCurrentKey;
}

interface AdminMenuPromoDefinition {
  kind: "promo";
  key: string;
  title: string;
  actionLabel: string;
  target: AdminMenuTarget;
}

interface AdminMenuSeparatorDefinition {
  kind: "separator";
  key: string;
}

interface AdminMenuLinkDefinition {
  kind: "link";
  key: string;
  label: string;
  icon: string;
  target: AdminMenuTarget;
  currentKey?: AdminCurrentKey;
  badge?: string;
  children?: AdminMenuChildDefinition[];
  tone?: "default" | "product";
}

type AdminMenuDefinition =
  | AdminMenuPromoDefinition
  | AdminMenuSeparatorDefinition
  | AdminMenuLinkDefinition;

export interface AdminMenuBuildContext {
  current: Record<AdminCurrentKey, boolean>;
  resolveTargetHref: (target: AdminMenuTarget) => string;
}

export const adminSections: AdminSectionDefinition[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "D",
    description: "Overview widgets, content shortcuts, and product status for the local shell.",
  },
  {
    id: "posts",
    label: "Posts",
    icon: "P",
    description: "Edit seeded posts and grow this into a real content list.",
  },
  {
    id: "media",
    label: "Media",
    icon: "M",
    description: "Placeholder for uploads, library views, and asset flows.",
  },
  {
    id: "pages",
    label: "Pages",
    icon: "Pg",
    description: "Placeholder for future page models and page authoring tools.",
  },
  {
    id: "comments",
    label: "Comments",
    icon: "C",
    description: "Placeholder for moderation and conversation tools.",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: "A",
    description: "Switch the active frontend theme and test public presentation.",
  },
  {
    id: "plugins",
    label: "Plugins",
    icon: "Pl",
    description: "Placeholder for future plugin and module administration.",
  },
  {
    id: "users",
    label: "Users",
    icon: "U",
    description: "Placeholder for team members, roles, and invitations.",
  },
  {
    id: "tools",
    label: "Tools",
    icon: "T",
    description: "Placeholder for import, export, and maintenance tasks.",
  },
  {
    id: "settings",
    label: "Settings",
    icon: "S",
    description: "Placeholder for workspace and site-level configuration screens.",
  },
  {
    id: "recovery",
    label: "Recovery",
    icon: "Rc",
    description:
      "Restore points, the discarded-write-window disclosure, and the guided plan-confirm-execute restore ceremony (ADR-045). A distinct screen from Storage, never a tab of it.",
  },
];

export const placeholderAdminSections = new Set<AdminSectionId>([
  "media",
  "pages",
  "comments",
  "plugins",
  "users",
  "tools",
  "settings",
  "recovery",
]);

const dashboardTarget: AdminMenuTarget = { kind: "dashboard" };

function sectionTarget(sectionId: AdminSectionId): AdminMenuTarget {
  return { kind: "section", sectionId };
}

const adminMenuDefinitions: AdminMenuDefinition[] = [
  {
    kind: "promo",
    key: "upgrade-promo",
    title: "Free domain with an annual plan",
    actionLabel: "Upgrade",
    target: dashboardTarget,
  },
  {
    kind: "link",
    key: "dashboard",
    label: "Dashboard",
    icon: "D",
    target: dashboardTarget,
    currentKey: "dashboard",
    children: [
      {
        key: "dashboard-home",
        label: "Home",
        target: dashboardTarget,
        currentKey: "dashboard",
      },
      {
        key: "dashboard-updates",
        label: "Updates",
        target: dashboardTarget,
      },
    ],
  },
  {
    kind: "link",
    key: "my-home",
    label: "My Home",
    icon: "MH",
    target: dashboardTarget,
    tone: "product",
  },
  {
    kind: "link",
    key: "stats",
    label: "Stats",
    icon: "St",
    target: dashboardTarget,
    tone: "product",
  },
  {
    kind: "link",
    key: "hosting",
    label: "Hosting",
    icon: "Ho",
    target: dashboardTarget,
    tone: "product",
  },
  {
    kind: "link",
    key: "upgrades",
    label: "Upgrades",
    icon: "Up",
    target: dashboardTarget,
    badge: "Free",
    tone: "product",
  },
  {
    kind: "link",
    key: "jetpack",
    label: "Jetpack",
    icon: "J",
    target: dashboardTarget,
    tone: "product",
  },
  {
    kind: "separator",
    key: "product-separator",
  },
  {
    kind: "link",
    key: "posts",
    label: "Posts",
    icon: "P",
    target: sectionTarget("posts"),
    currentKey: "posts",
    children: [
      {
        key: "posts-all",
        label: "All Posts",
        target: sectionTarget("posts"),
        currentKey: "post-list",
      },
      {
        key: "posts-add",
        label: "Add Post",
        target: { kind: "default-post-editor" },
        currentKey: "post-editor",
      },
      {
        key: "posts-categories",
        label: "Categories",
        target: sectionTarget("posts"),
      },
      {
        key: "posts-tags",
        label: "Tags",
        target: sectionTarget("posts"),
      },
    ],
  },
  {
    kind: "link",
    key: "media",
    label: "Media",
    icon: "M",
    target: sectionTarget("media"),
    currentKey: "media",
    children: [
      {
        key: "media-library",
        label: "Library",
        target: sectionTarget("media"),
        currentKey: "media",
      },
      {
        key: "media-add",
        label: "Add Media File",
        target: sectionTarget("media"),
      },
    ],
  },
  {
    kind: "link",
    key: "pages",
    label: "Pages",
    icon: "Pg",
    target: sectionTarget("pages"),
    currentKey: "pages",
    children: [
      {
        key: "pages-all",
        label: "All Pages",
        target: sectionTarget("pages"),
        currentKey: "pages",
      },
      {
        key: "pages-add",
        label: "Add Page",
        target: sectionTarget("pages"),
      },
    ],
  },
  {
    kind: "link",
    key: "comments",
    label: "Comments",
    icon: "C",
    target: sectionTarget("comments"),
    currentKey: "comments",
  },
  {
    kind: "link",
    key: "feedback",
    label: "Feedback",
    icon: "Fb",
    target: dashboardTarget,
    tone: "product",
  },
  {
    kind: "separator",
    key: "core-separator",
  },
  {
    kind: "link",
    key: "appearance",
    label: "Appearance",
    icon: "A",
    target: sectionTarget("appearance"),
    currentKey: "appearance",
    children: [
      {
        key: "appearance-themes",
        label: "Themes",
        target: sectionTarget("appearance"),
        currentKey: "appearance",
      },
      {
        key: "appearance-editor",
        label: "Editor",
        target: sectionTarget("appearance"),
      },
      {
        key: "appearance-fonts",
        label: "Fonts",
        target: sectionTarget("appearance"),
      },
    ],
  },
  {
    kind: "link",
    key: "plugins",
    label: "Plugins",
    icon: "Pl",
    target: sectionTarget("plugins"),
    currentKey: "plugins",
  },
  {
    kind: "link",
    key: "users",
    label: "Users",
    icon: "U",
    target: sectionTarget("users"),
    currentKey: "users",
    children: [
      {
        key: "users-all",
        label: "All Users",
        target: sectionTarget("users"),
        currentKey: "users",
      },
      {
        key: "users-add",
        label: "Add New User",
        target: sectionTarget("users"),
      },
      {
        key: "users-profile",
        label: "Profile",
        target: sectionTarget("users"),
      },
    ],
  },
  {
    kind: "link",
    key: "tools",
    label: "Tools",
    icon: "T",
    target: sectionTarget("tools"),
    currentKey: "tools",
    children: [
      {
        key: "tools-available",
        label: "Available Tools",
        target: sectionTarget("tools"),
        currentKey: "tools",
      },
      {
        key: "tools-import",
        label: "Import",
        target: sectionTarget("tools"),
      },
      {
        key: "tools-export",
        label: "Export",
        target: sectionTarget("tools"),
      },
      {
        key: "tools-health",
        label: "Site Health",
        target: sectionTarget("tools"),
      },
    ],
  },
  {
    kind: "link",
    key: "settings",
    label: "Settings",
    icon: "S",
    target: sectionTarget("settings"),
    currentKey: "settings",
    children: [
      {
        key: "settings-general",
        label: "General",
        target: sectionTarget("settings"),
        currentKey: "settings",
      },
      {
        key: "settings-writing",
        label: "Writing",
        target: sectionTarget("settings"),
      },
      {
        key: "settings-reading",
        label: "Reading",
        target: sectionTarget("settings"),
      },
      {
        key: "settings-discussion",
        label: "Discussion",
        target: sectionTarget("settings"),
      },
    ],
  },
  {
    kind: "link",
    key: "recovery",
    label: "Recovery",
    icon: "Rc",
    target: sectionTarget("recovery"),
    currentKey: "recovery",
  },
];

/**
 * Creates a fully-initialized current-state map for admin navigation rendering.
 *
 * Frontend wrappers fill this object based on their own route model and then
 * hand it to {@link buildAdminMenuEntries} so shared menu data can stay
 * framework-agnostic.
 */
export function createEmptyAdminCurrentState(): Record<AdminCurrentKey, boolean> {
  return {
    dashboard: false,
    posts: false,
    media: false,
    pages: false,
    comments: false,
    appearance: false,
    plugins: false,
    users: false,
    tools: false,
    settings: false,
    recovery: false,
    "post-list": false,
    "post-editor": false,
  };
}

/**
 * Finds the shared section metadata for a given admin section id.
 *
 * Frontend routes use this to render placeholder pages and section-level copy
 * without duplicating section descriptions across frameworks.
 */
export function getAdminSectionById(sectionId: string): AdminSectionDefinition | null {
  return adminSections.find((section) => section.id === sectionId) ?? null;
}

/**
 * Builds concrete menu entries from the shared admin-shell blueprint.
 *
 * The blueprint owns labels, grouping, submenu depth, and product/core
 * separation. Each frontend provides its own route activeness map and href
 * resolver so route shape can vary without forking the menu definition.
 */
export function buildAdminMenuEntries({
  current,
  resolveTargetHref,
}: AdminMenuBuildContext): AdminMenuEntry[] {
  return adminMenuDefinitions.map((entry) => {
    if (entry.kind === "promo") {
      return {
        kind: "promo",
        key: entry.key,
        title: entry.title,
        actionLabel: entry.actionLabel,
        href: resolveTargetHref(entry.target),
      };
    }

    if (entry.kind === "separator") {
      return entry;
    }

    return {
      kind: "link",
      key: entry.key,
      label: entry.label,
      icon: entry.icon,
      href: resolveTargetHref(entry.target),
      current: entry.currentKey ? current[entry.currentKey] : false,
      badge: entry.badge,
      tone: entry.tone,
      children: entry.children?.map((child) => ({
        key: child.key,
        label: child.label,
        href: resolveTargetHref(child.target),
        current: child.currentKey ? current[child.currentKey] : false,
      })),
    };
  });
}
