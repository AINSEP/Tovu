/**
 * @file Admin sidebar navigation model (grouped).
 *
 * Purpose:
 * The blueprint for the per-site admin's grouped secondary nav — Overview plus
 * Content / People / Marketing / Design & System sections. Replaces the flat,
 * WordPress-shaped menu that came from `@tovu/admin-shell`.
 *
 * How it relates to the project:
 * - Rendered by `components/Sidebar.tsx`.
 * - `href` points at the hash routes `App.tsx` understands; items marked `soon`
 *   are not built yet and render disabled.
 *
 * Icons are inline SVG inner-markup (viewBox 0 0 18 18, stroke=currentColor).
 */
export interface NavItem {
  /** Matches the route's active section id (see App.activeSectionId). */
  id: string;
  label: string;
  /** Inner SVG markup for an 18x18 stroked icon. */
  icon: string;
  /** Hash route; omit for not-yet-built ("soon") items. */
  href?: string;
  soon?: boolean;
}

export interface NavGroup {
  /** Group heading; omitted for the top-level Overview row. */
  label?: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    items: [
      {
        id: "dashboard",
        label: "Overview",
        href: "#/",
        icon: '<rect x="2" y="2" width="6" height="6" rx="1.5"/><rect x="10" y="2" width="6" height="9" rx="1.5"/><rect x="2" y="10" width="6" height="6" rx="1.5"/><rect x="10" y="13" width="6" height="3" rx="1.5"/>',
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        id: "pages",
        label: "Pages",
        href: "#/section/pages",
        icon: '<rect x="3" y="2" width="12" height="14" rx="1.5"/><path d="M6 6h6M6 9h6M6 12h4"/>',
      },
      {
        id: "posts",
        label: "Posts",
        href: "#/posts",
        icon: '<path d="M3 4h12M3 8h12M3 12h8"/>',
      },
      {
        id: "media",
        label: "Media",
        href: "#/section/media",
        icon: '<rect x="2" y="3" width="14" height="11" rx="1.5"/><path d="M2 11l4-3 3 2 3-3 4 3"/><circle cx="6" cy="6.5" r="1"/>',
      },
      {
        id: "collections",
        label: "Collections",
        href: "#/section/collections",
        icon: '<rect x="2.5" y="4" width="13" height="10" rx="1.5"/><path d="M2.5 7.5h13M6 4V2.5M12 4V2.5"/>',
      },
      {
        id: "menus",
        label: "Menus",
        href: "#/menus",
        icon: '<path d="M4 3h10M4 7h10M4 11h6M2 3v.01M2 7v.01M2 11v.01"/>',
      },
      {
        id: "widgets",
        label: "Widgets",
        href: "#/widgets",
        icon: '<rect x="2" y="2" width="6" height="6" rx="1"/><rect x="10" y="2" width="6" height="6" rx="1"/><rect x="2" y="10" width="6" height="6" rx="1"/><rect x="10" y="10" width="6" height="6" rx="1"/>',
      },
      {
        id: "taxonomy",
        label: "Categories & Tags",
        href: "#/section/taxonomy",
        icon: '<path d="M9 2l2 3.5 4 .6-3 2.9.7 4L9 11.5 5.6 13l.7-4-3-2.9 4-.6L9 2z"/>',
      },
      {
        id: "forms",
        label: "Forms",
        href: "#/forms",
        icon: '<rect x="3" y="2" width="12" height="14" rx="1.5"/><path d="M6 6h6M6 9h6M6 12h3"/>',
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        id: "users",
        label: "Users",
        href: "#/section/users",
        icon: '<circle cx="9" cy="6" r="3"/><path d="M3 15c0-3.3 2.7-6 6-6s6 2.7 6 6"/>',
      },
      {
        id: "roles",
        label: "Roles & Permissions",
        href: "#/section/roles",
        icon: '<rect x="2.5" y="4" width="13" height="10" rx="1.5"/><path d="M2.5 8h13M6 12h3"/>',
      },
      {
        id: "members",
        label: "Members",
        href: "#/section/members",
        icon: '<circle cx="7" cy="6" r="2.5"/><path d="M2 15c0-2.8 2.2-5 5-5s5 2.2 5 5"/><path d="M12.5 6.5l1.3 1.3 2.2-2.5"/>',
      },
      {
        id: "comments",
        label: "Comments",
        href: "#/section/comments",
        icon: '<path d="M3 4h12v8H8l-3 3v-3H3V4z"/>',
      },
    ],
  },
  {
    label: "Design & System",
    items: [
      {
        id: "themes",
        label: "Themes",
        href: "#/section/themes",
        icon: '<circle cx="6.2" cy="7" r="3.4"/><circle cx="11.8" cy="7" r="3.4"/><circle cx="9" cy="11.6" r="3.4"/>',
      },
      {
        id: "plugins",
        label: "Plugins",
        href: "#/section/plugins",
        icon: '<path d="M7 2v3H4v9h10V5h-3V2H7z"/>',
      },
      {
        // Renamed from "storage" to "database" (ADR-041 naming-correction note, 2026-07):
        // "Storage" read as ambiguous next to the Media/Assets subsystem's own file/blob storage
        // — this section is the ADR-041 read-first ledger of migrations/snapshots/index
        // changes/template upgrades, now called Database. `id` must equal the route segment
        // (App.activeSectionId derives the highlighted nav id from route.sectionId), not just
        // the label.
        id: "database",
        label: "Database",
        href: "#/section/database",
        icon: '<ellipse cx="9" cy="4.5" rx="6" ry="2.2"/><path d="M3 4.5v9c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2v-9"/><path d="M3 9c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2"/>',
      },
      {
        id: "integrations",
        label: "Integrations & API",
        href: "#/integrations",
        icon: '<path d="M6 6l-3 3 3 3M12 6l3 3-3 3M10 4l-2 10"/>',
      },
      {
        // Renamed from "backups" — ADR-045: Recovery supersedes Backups as a concept, there is
        // no separate Backups screen (see Recovery.tsx's own header comment).
        id: "recovery",
        label: "Recovery",
        href: "#/section/recovery",
        icon: '<path d="M9 2a7 7 0 107 7"/><path d="M9 5v4l2.5 1.5"/>',
      },
      {
        id: "settings",
        label: "Settings",
        href: "#/section/settings",
        icon: '<circle cx="9" cy="9" r="2.5"/><path d="M9 2v2M9 14v2M2 9h2M14 9h2M4.2 4.2l1.4 1.4M12.4 12.4l1.4 1.4M4.2 13.8l1.4-1.4M12.4 5.6l1.4-1.4"/>',
      },
    ],
  },
  {
    label: "Marketing",
    items: [
      {
        id: "seo",
        label: "SEO & Metadata",
        href: "#/section/seo",
        icon: '<circle cx="8" cy="8" r="5.5"/><path d="M12 12l3.5 3.5"/>',
      },
      {
        id: "redirects",
        label: "Redirects",
        href: "#/section/redirects",
        icon: '<path d="M3 6h8a3 3 0 010 6H6M3 6l2.5-2.5M3 6l2.5 2.5"/>',
      },
      {
        id: "newsletter",
        label: "Newsletter",
        soon: true,
        icon: '<rect x="2.5" y="4" width="13" height="9" rx="1.5"/><path d="M2.5 5.5L9 9.5l6.5-4"/>',
      },
      {
        id: "analytics",
        label: "Analytics",
        href: "#/section/analytics",
        icon: '<path d="M3 15V9M8 15V4M13 15v-4"/>',
      },
    ],
  },
];
