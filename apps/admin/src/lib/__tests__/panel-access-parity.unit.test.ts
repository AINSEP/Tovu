import { describe, expect, it } from "vitest";
import { isPanelAccessible, withoutInaccessiblePanels } from "@jini-ai/core/admin-runtime";

import { ADMIN_PANELS } from "../../panels";
import { getNav } from "../../nav";

/**
 * @file P1 (admin-ui plan, T1a): for five fixed permission lists, which of the real `ADMIN_PANELS` an
 * operator may use and which rows the real nav shows. The literals below were produced by running
 * Tovu's own rule (`lib/panel-access.ts`, since deleted by T1a) over the real `panels.tsx` list on the base commit, before
 * any edit; they are never computed from the rule under test. The rule may move (T1a repoints it to
 * `@jini-ai/admin/core`); these sets must not change.
 */

const EDITOR = ["content.read", "content.write", "content.publish", "content.delete", "media.read", "media.upload", "media.update", "media.delete", "theme.set"];
const LISTS: Record<"unknown" | "empty" | "star" | "editor" | "memberManager", readonly string[] | undefined> = {
  unknown: undefined,
  empty: [],
  star: ["*"],
  editor: EDITOR,
  // The built-in admin role holds `member.manage` only; Users admits either it or `user.manage` (the any-of case).
  memberManager: ["member.manage"],
};

/** Panel ids the operator may NOT use, per list. */
const DENIED: Record<keyof typeof LISTS, readonly string[]> = {
  unknown: [],
  empty: [
    "sites", "pages", "posts", "media", "library", "collections", "menus", "taxonomy", "forms", "users",
    "roles", "members", "comments", "themes", "plugins", "agent-plugins", "skills", "providers",
    "integrations", "database", "recovery", "deployment", "observability", "settings", "consent", "email",
    "trash", "seo", "redirects", "analytics", "appearance",
  ],
  star: [],
  editor: [
    "sites", "collections", "menus", "taxonomy", "forms", "users", "roles", "members", "comments", "plugins",
    "agent-plugins", "skills", "providers", "integrations", "database", "recovery", "deployment",
    "observability", "settings", "consent", "email", "seo", "redirects", "analytics",
  ],
  memberManager: [
     "sites", "pages", "posts", "media", "library", "collections", "menus", "taxonomy", "forms", "roles",
     "comments", "themes", "plugins", "agent-plugins", "skills", "providers", "integrations", "database",
     "recovery", "deployment", "observability", "settings", "consent", "email", "trash", "seo", "redirects",
     "analytics", "appearance",
  ],
};

/** Nav row ids shown, in order, per list (`getNav()` through the access filter). */
const NAV: Record<keyof typeof LISTS, readonly string[]> = {
  unknown: [
    "dashboard", "sites", "import-export", "ai-assistant", "pages", "posts", "media", "library",
    "collections", "menus", "widgets", "taxonomy", "forms", "users", "authentication", "roles", "members",
    "comments", "themes", "admin-ui", "playground", "plugins", "agent-plugins", "skills", "providers",
    "orders", "products", "subscriptions", "billing", "database", "recovery", "deployment", "source-control",
    "access-tokens", "observability", "activity-log", "settings", "consent", "email", "trash", "seo",
    "redirects", "newsletter", "analytics",
  ],
  empty: [
    "dashboard", "import-export", "ai-assistant", "widgets", "authentication", "admin-ui", "playground",
    "orders", "products", "subscriptions", "billing", "source-control", "access-tokens", "activity-log",
    "newsletter",
  ],
  star: [
    "dashboard", "sites", "import-export", "ai-assistant", "pages", "posts", "media", "library",
    "collections", "menus", "widgets", "taxonomy", "forms", "users", "authentication", "roles", "members",
    "comments", "themes", "admin-ui", "playground", "plugins", "agent-plugins", "skills", "providers",
    "orders", "products", "subscriptions", "billing", "database", "recovery", "deployment", "source-control",
    "access-tokens", "observability", "activity-log", "settings", "consent", "email", "trash", "seo",
    "redirects", "newsletter", "analytics",
  ],
  editor: [
    "dashboard", "import-export", "ai-assistant", "pages", "posts", "media", "library", "widgets",
    "authentication", "themes", "admin-ui", "playground", "orders", "products", "subscriptions", "billing",
    "source-control", "access-tokens", "activity-log", "trash", "newsletter",
  ],
  memberManager: [
     "dashboard", "import-export", "ai-assistant", "widgets", "users", "authentication", "members",
     "admin-ui", "playground", "orders", "products", "subscriptions", "billing", "source-control",
     "access-tokens", "activity-log", "newsletter",
  ],
};

describe("P1: panel access over the real panels list, five fixed permission lists", () => {
  it("lists all 51 registered panels", () => {
    expect(ADMIN_PANELS).toHaveLength(51);
  });

  it.each(Object.keys(LISTS) as (keyof typeof LISTS)[])("%s: the denied panel ids are unchanged", (name) => {
    const denied = ADMIN_PANELS.filter((panel) => !isPanelAccessible({ panel, permissions: LISTS[name] })).map((panel) => panel.id);
    expect(denied).toEqual(DENIED[name]);
  });

  it.each(Object.keys(LISTS) as (keyof typeof LISTS)[])("%s: the visible nav rows are unchanged", (name) => {
    const groups = withoutInaccessiblePanels({ groups: getNav(), panels: ADMIN_PANELS, permissions: LISTS[name] });
    expect(groups.flatMap((group) => group.items.map((item) => item.id))).toEqual(NAV[name]);
  });
});
