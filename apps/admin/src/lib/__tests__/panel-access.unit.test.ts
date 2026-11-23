import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AdminNavGroup } from "@jini-ai/admin/core";
import { isPanelAccessible, withoutInaccessiblePanels } from "@jini-ai/core/admin-runtime";

import { ADMIN_PANELS } from "../../panels";
import { getNav } from "../../nav";

/**
 * @file The admin nav hides a section the signed-in operator cannot use, and a direct URL to one
 * reports "no access" instead of mounting a screen whose first read 403s.
 *
 * Affordance only: every route still re-checks server-side (`identity/authorize.ts`), so these
 * tests pin the UX contract, not an authorization boundary.
 */

/** The built-in editor role's grants (Jini `user-management/src/server/seed.ts`,
 *  `BUILTIN_EDITOR_PERMISSIONS`) — the role the E2E pass found seeing Users and Roles. */
const EDITOR = ["content.read", "content.write", "content.publish", "content.delete", "media.read", "media.upload", "media.update", "media.delete", "theme.set"];
const OWNER = ["*"];

function navIds(groups: readonly AdminNavGroup[]): string[] {
  return groups.flatMap((group) => group.items.map((item) => item.id));
}

describe("isPanelAccessible", () => {
  it("shows every panel while the operator's permissions are not known yet", () => {
    expect(isPanelAccessible({ panel: { anyOfPermissions: ["role.manage"] }, permissions: undefined })).toBe(true);
  });

  it("shows a panel that declares no permission", () => {
    expect(isPanelAccessible({ panel: {}, permissions: [] })).toBe(true);
  });

  it("shows a panel when the operator holds any one of its permissions", () => {
    const users = { anyOfPermissions: ["user.manage", "member.manage"] };
    expect(isPanelAccessible({ panel: users, permissions: ["member.manage"] })).toBe(true);
    expect(isPanelAccessible({ panel: users, permissions: ["user.manage"] })).toBe(true);
  });

  it("hides a panel when the operator holds none of its permissions", () => {
    expect(isPanelAccessible({ panel: { anyOfPermissions: ["user.manage", "member.manage"] }, permissions: EDITOR })).toBe(false);
  });

  it("shows every panel to the owner wildcard", () => {
    expect(isPanelAccessible({ panel: { anyOfPermissions: ["role.manage"] }, permissions: OWNER })).toBe(true);
  });
});

describe("withoutInaccessiblePanels over the real nav", () => {
  it("hides Users and Roles & Permissions from an editor and keeps the content rows", () => {
    const ids = navIds(withoutInaccessiblePanels({ groups: getNav(), panels: ADMIN_PANELS, permissions: EDITOR }));

    // Positive controls first, so the negatives cannot pass because the nav came back empty.
    expect(ids).toEqual(expect.arrayContaining(["dashboard", "pages", "posts", "media", "themes", "trash"]));
    expect(ids).not.toContain("users");
    expect(ids).not.toContain("roles");
    // Every Integrations tab with a read (External MCP, Always allow, Webhooks) checks
    // admin.integrations.manage, which the editor lacks.
    expect(ids).not.toContain("providers");
  });

  it("shows the owner every row, unchanged", () => {
    const groups = getNav();
    expect(withoutInaccessiblePanels({ groups, panels: ADMIN_PANELS, permissions: OWNER })).toEqual(groups);
  });

  it("returns the nav untouched while permissions are unknown", () => {
    const groups = getNav();
    expect(withoutInaccessiblePanels({ groups, panels: ADMIN_PANELS, permissions: undefined })).toBe(groups);
  });

  it("drops a group whose every row is hidden, and keeps the ungrouped top row first", () => {
    const groups: readonly AdminNavGroup[] = [
      { items: [{ id: "dashboard", href: "/", label: "Overview" }] },
      { label: "People", items: [{ id: "roles", href: "/roles", label: "Roles & Permissions" }] },
      { label: "Content", items: [{ id: "posts", href: "/posts", label: "Posts" }] },
    ];

    const filtered = withoutInaccessiblePanels({ groups, panels: ADMIN_PANELS, permissions: EDITOR });

    expect(filtered.map((group) => group.label)).toEqual([undefined, "Content"]);
  });

  it("keeps a row whose id names no registered panel", () => {
    const groups: readonly AdminNavGroup[] = [{ items: [{ id: "not-a-panel", href: "/x", label: "X" }] }];
    expect(navIds(withoutInaccessiblePanels({ groups, panels: ADMIN_PANELS, permissions: [] }))).toEqual(["not-a-panel"]);
  });
});

/** The direct-URL decision `App.tsx`'s `gatedRouteElement` makes: the routed panel's declaration, `{}` for none. */
function gate(input: { panelId: string | null; permissions: readonly string[] | undefined }): "allowed" | "denied" {
  const panel = ADMIN_PANELS.find((candidate) => candidate.id === (input.panelId ?? "dashboard")) ?? {};
  return isPanelAccessible({ panel, permissions: input.permissions }) ? "allowed" : "denied";
}

describe("the direct-URL gate over the real panels", () => {
  it("denies an editor's direct visit to Users and Roles", () => {
    expect(gate({ panelId: "users", permissions: EDITOR })).toBe("denied");
    expect(gate({ panelId: "roles", permissions: EDITOR })).toBe("denied");
  });

  it("allows the owner everywhere and the editor on Posts", () => {
    expect(gate({ panelId: "roles", permissions: OWNER })).toBe("allowed");
    expect(gate({ panelId: "posts", permissions: EDITOR })).toBe("allowed");
  });

  it("allows the dashboard fallback and an unregistered id, which have no permission to check", () => {
    expect(gate({ panelId: null, permissions: [] })).toBe("allowed");
    expect(gate({ panelId: "not-a-panel", permissions: [] })).toBe("allowed");
  });
});

/**
 * The permission ids on `panels.tsx` must be the ones the server checks. The server's ids are not
 * importable here (they live as literals inside `apps/website` route handlers, and the admin build
 * must not depend on server code), so this map names, per gated panel, the file holding the check
 * for that panel's landing read. The test reads each file and requires every declared id to appear
 * in it as a string literal. Adding a permission to a panel without an entry here fails the first
 * test below; renaming a server permission fails the second.
 */
const ROUTES = "../../../../website/src/server/inbound/admin-http/routes";
// Routes that left the host as `@jini-ai/cms` route specs: the literal is in the spec's built file
// (or the `shared.js` beside it that holds that feature's permission guard).
const requireFromHere = createRequire(import.meta.url);
const cmsRoute = (spec: string, file: string): string =>
  join(dirname(requireFromHere.resolve(`@jini-ai/cms/admin-http/routes/${spec}`)), file);
const SERVER_EVIDENCE: Record<string, string> = {
  sites: `${ROUTES}/system/sites.ts`,
  pages: `${ROUTES}/pages/list.ts`,
  // The posts read routes are Jini specs now; their `content.read` check lives in the built guard they share.
  posts: "../../../node_modules/@jini-ai/cms/dist/admin-http/routes/posts/shared.js",
  media: `${ROUTES}/media/list.ts`,
  // Library lists `media?kind=document` through the same route and permission.
  library: `${ROUTES}/media/list.ts`,
  collections: cmsRoute("content-types/list", "list.js"),
  menus: cmsRoute("menus/list", "list.js"),
  taxonomy: cmsRoute("taxonomy/list", "shared.js"),
  forms: cmsRoute("forms/list", "shared.js"),
  users: `${ROUTES}/users/list.ts`,
  roles: `${ROUTES}/users/list-roles.ts`,
  members: `${ROUTES}/members/list.ts`,
  comments: cmsRoute("comments/moderation-queue", "moderation-queue.js"),
  themes: `${ROUTES}/themes/list.ts`,
  appearance: `${ROUTES}/themes/list.ts`,
  plugins: `${ROUTES}/plugins/list.ts`,
  "agent-plugins": `${ROUTES}/agent-plugins/list.ts`,
  skills: `${ROUTES}/skills/list.ts`,
  database: cmsRoute("database/timeline", "timeline.js"),
  recovery: `${ROUTES}/recovery/status.ts`,
  deployment: `${ROUTES}/system/deployment-overview.ts`,
  observability: `${ROUTES}/system/observability-status.ts`,
  email: `${ROUTES}/system/mail-status.ts`,
  settings: `${ROUTES}/settings/get-effective.ts`,
  consent: `${ROUTES}/consent/routes.ts`,
  // `trash/list.ts` checks `TRASH_READ_PERMISSION`; the literal lives where that constant is defined.
  trash: "../../../../website/src/features/trash/permissions.ts",
  seo: `${ROUTES}/seo/get-settings.ts`,
  redirects: cmsRoute("redirects/list", "shared.js"),
  analytics: `${ROUTES}/analytics/recent-hits.ts`,
  // The landing External MCP tab (and Always allow) go through this guard; Webhooks checks the same id.
  providers: `${ROUTES}/external-mcp/guard.ts`,
  // The routable-only webhook deliveries drill-down (`/admin/integrations/:subscriptionId`).
  integrations: `${ROUTES}/integrations/deliveries.ts`,
};

const here = dirname(fileURLToPath(import.meta.url));
const gated = ADMIN_PANELS.filter((panel) => (panel.anyOfPermissions ?? []).length > 0);

describe("panel permission ids match the server's checks", () => {
  it("names a server file for exactly the panels that declare permissions", () => {
    expect(gated.map((panel) => panel.id).sort()).toEqual(Object.keys(SERVER_EVIDENCE).sort());
  });

  it.each(gated.map((panel) => [panel.id, panel.anyOfPermissions ?? []] as const))(
    "%s declares only ids its server route checks",
    (panelId, permissions) => {
      const source = readFileSync(resolve(here, SERVER_EVIDENCE[panelId] ?? ""), "utf8");
      for (const permission of permissions) expect(source).toMatch(new RegExp(`["']${permission.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`));
    },
  );
});
