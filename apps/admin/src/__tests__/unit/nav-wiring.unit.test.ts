import { describe, expect, it } from "vitest";

import { getNav } from "../../nav";

/**
 * @file REQ-17/AC-25 — `nav.ts`'s `plugins` `NavItem` wiring (SPEC-005 1.1.0 amendment).
 *
 * TDD-certified against the CURRENT `nav.ts` (an existing, already-shipped file this dispatch
 * does not modify) — currently RED because `nav.ts`'s `plugins` entry still carries `soon: true`
 * and no `href`. These assertions describe the contract the Programmer stage must satisfy
 * (tasks.md T025).
 */

function findPluginsNavItem() {
  for (const group of getNav()) {
    const item = group.items.find((i) => i.id === "plugins");
    if (item) return item;
  }
  return undefined;
}

describe("REQ-17/AC-25: the plugins NavItem is an active link, not disabled/soon", () => {
  it("has href '/addons/plugins' and no soon flag", () => {
    const item = findPluginsNavItem();
    expect(item).toBeDefined();
    expect(item?.href).toBe("/addons/plugins");
    expect(item?.soon).toBeFalsy();
  });

  it("RT-008: the stale SPEC-045-'BLOCKED pending an owner decision' comment must no longer describe this entry as blocked (source-text check, since the comment itself is not a runtime-observable NavItem field)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const navSource = await fs.readFile(path.resolve(__dirname, "../../nav.ts"), "utf8");

    expect(navSource).not.toMatch(/BLOCKED pending an owner decision/);
  });
});

describe("'authentication' sits directly between 'users' and 'roles' in the People group", () => {
  it("has no gap: authentication is immediately after users and immediately before roles", () => {
    // This is array-order-dependent, not driven by an explicit `nav.order` on any of the three
    // entries (see `panels.tsx`'s own comment on the `authentication` panel) — `buildNav`'s
    // documented tiebreak for equal/absent `order` is registration order in `ADMIN_PANELS`. That
    // makes this a silent-drift hazard: nothing stops a future edit from reordering the array and
    // moving `authentication` without anyone noticing, since TypeScript enforces none of it. This
    // test is the guard against that — it fails the moment the three stop being consecutive in
    // this exact sequence, not just "somewhere in People".
    const people = getNav().find((group) => group.label === "People");
    expect(people).toBeDefined();

    const ids = people!.items.map((item) => item.id);
    const usersIndex = ids.indexOf("users");
    const authIndex = ids.indexOf("authentication");
    const rolesIndex = ids.indexOf("roles");

    expect(usersIndex).toBeGreaterThanOrEqual(0);
    expect(authIndex).toBe(usersIndex + 1);
    expect(rolesIndex).toBe(authIndex + 1);
  });
});

describe("Studio navigation", () => {
  it("collapses the admin presentation rows into Admin UI and keeps Playground separate", () => {
    const studio = getNav().find((group) => group.label === "Studio")!;
    const themesIndex = studio.items.findIndex((item) => item.id === "themes");
    expect(themesIndex).toBeGreaterThanOrEqual(0);
    expect(studio.items.slice(themesIndex, themesIndex + 3).map((item) => item.id)).toEqual([
      "themes", "admin-ui", "playground",
    ]);
    expect(studio.items[themesIndex + 1]).toMatchObject({
      label: "Admin UI", href: "/admin-ui",
    });
    for (const retired of ["admin-themes", "admin-appearance", "design-system"]) {
      expect(getNav().flatMap((group) => group.items.map((item) => item.id))).not.toContain(retired);
    }
    expect(studio.items[themesIndex + 1].soon).toBeFalsy();
    expect(studio.items[themesIndex + 1].icon).toBeTruthy();
    expect(studio.items[themesIndex + 1].icon).not.toBe(studio.items[themesIndex].icon);
  });

  it("makes every announced Soon row previewable through the shared nav model", () => {
    const soonItems = getNav().flatMap((group) => group.items).filter((item) => item.soon);
    expect(soonItems.length).toBeGreaterThan(0);
    for (const item of soonItems) {
      expect(item.soonPreviewable, item.id).toBe(true);
      expect(item.href, item.id).toMatch(/^\//);
    }
  });
});

describe("Add-Ons nav section", () => {
  // 2026-09-10, second pass (owner call): renamed BACK from "Integrations" to "Add-Ons", and
  // narrowed from four rows to three — `providers` and `integrations` (four tabs total between
  // them) collapsed into one row, `providers`, now labelled "Integrations". See `panels.tsx`'s own
  // comment on the `providers`/`integrations` panels for the full reasoning and rename history.
  it("exists with exactly Plugins, Agent Plugins, Skills, Integrations in that order", () => {
    const addOns = getNav().find((group) => group.label === "Add-Ons");
    expect(addOns).toBeDefined();

    const ids = addOns!.items.map((item) => item.id);
    expect(ids).toEqual(["plugins", "agent-plugins", "skills", "providers"]);
    expect(addOns!.items.map((item) => item.href)).toEqual([
      "/addons/plugins", "/addons/agent-plugins", "/addons/skills", "/addons/integrations",
    ]);
  });

  // Regression guard: this exact row (route id `providers`) was labelled "Providers", then briefly
  // gained a sibling row labelled "APIs & Webhooks" (mislabeled "Developer API" twice before that),
  // before both merged into this one row labelled "Integrations" — see `panels.tsx`'s own comment
  // on the `providers` panel entry for the full history.
  it("the providers panel is labeled 'Integrations', not 'Providers' or 'APIs & Webhooks'", () => {
    const addOns = getNav().find((group) => group.label === "Add-Ons");
    const item = addOns!.items.find((i) => i.id === "providers");

    expect(item).toBeDefined();
    expect(item?.label).toBe("Integrations");
  });

  // The retired `integrations` panel keeps its id/route (so `/admin/integrations` still resolves,
  // redirecting rather than 404ing — see `panels.tsx`'s own comment) but has no nav row of its own
  // anymore, in this group or any other.
  it("the integrations panel no longer has its own nav row anywhere", () => {
    const allIds = getNav().flatMap((group) => group.items.map((item) => item.id));
    expect(allIds).not.toContain("integrations");
  });

  it("agent-plugins is a fully enabled link, not a soon/preview-gated one", () => {
    const addOns = getNav().find((group) => group.label === "Add-Ons");
    const item = addOns!.items.find((i) => i.id === "agent-plugins");

    expect(item).toBeDefined();
    expect(item?.label).toBe("Agent Plugins");
    expect(item?.soon).toBeFalsy();
    expect(item?.soonPreviewable).toBeFalsy();
  });
});

describe("Administration nav section — workspace", () => {
  // 2026-09-10 (owner call, resolving SPEC-044's OQ-04): Workspace folded into a Settings tab —
  // see `panels.tsx`'s own comment on the `settings`/`workspace` panels. Same "retired panel keeps
  // its id/route, loses its nav row" shape the `integrations` panel above already asserts for
  // itself; the retired `workspace` panel's own bare route now redirects to
  // `/admin/settings?tab=workspace` rather than 404ing or rendering nothing.
  it("the workspace panel no longer has its own nav row anywhere", () => {
    const allIds = getNav().flatMap((group) => group.items.map((item) => item.id));
    expect(allIds).not.toContain("workspace");
  });

  it("settings keeps its own nav row unchanged — the fold added a tab, not a new top-level entry", () => {
    const administration = getNav().find((group) => group.label === "Administration");
    expect(administration).toBeDefined();

    const item = administration!.items.find((i) => i.id === "settings");
    expect(item).toBeDefined();
    expect(item?.label).toBe("Settings");
  });
});

describe("Operations nav section — observability", () => {
  // Reversed 2026-09-13 (owner screenshot review) from the 2026-09-09 "fully enabled, not soon"
  // decision this test used to assert: the row now carries the SAME `soon` + `soonPreviewable`
  // shape as `comments` in the People/Content sections — a "Soon" badge and the greyed `is-soon`
  // treatment, but still a real, clickable `<a>` (`Sidebar.js`'s `item.soon && item.soonPreviewable`
  // branch renders an active link, not the disabled `is-soon` div a bare `soon: true` alone would).
  it("observability carries the soon badge but stays clickable (soon + soonPreviewable)", () => {
    const operations = getNav().find((group) => group.label === "Operations");
    expect(operations).toBeDefined();

    const item = operations!.items.find((i) => i.id === "observability");
    expect(item).toBeDefined();
    expect(item?.label).toBe("Observability");
    expect(item?.soon).toBe(true);
    expect(item?.soonPreviewable).toBe(true);
  });

  it("sits ahead of Activity Log, the still-unbuilt Operations row", () => {
    const operations = getNav().find((group) => group.label === "Operations");
    const ids = operations!.items.map((item) => item.id);

    const observabilityIndex = ids.indexOf("observability");
    expect(observabilityIndex).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf("activity-log")).toBeGreaterThan(observabilityIndex);
  });
});

describe("Ungrouped top row", () => {
  // Owner, 2026-10-25: Import & Export lives under Sites and above AI Assistant, not in Operations.
  it("is Overview, Sites, Import & Export, AI Assistant, and Operations no longer lists Import & Export", () => {
    const [top] = getNav();
    expect(top?.label).toBeUndefined();
    expect(top?.items.map((item) => item.id)).toEqual(["dashboard", "sites", "import-export", "ai-assistant"]);

    const operations = getNav().find((group) => group.label === "Operations");
    expect(operations!.items.map((item) => item.id)).not.toContain("import-export");
  });
});

describe("Commerce nav section", () => {
  it("keeps exactly Orders, Products, Subscriptions, Billing in that order while Payments is off", () => {
    const commerce = getNav().find((group) => group.label === "Commerce");
    expect(commerce).toBeDefined();

    // `billing` appended 2026-08-06 (owner request). Updated rather than loosened to a
    // `toContain`/length check: an exact-order assertion is the only thing that catches a panel
    // silently changing group or drifting up the array, which is precisely what the sibling
    // "no longer lists Payments under People" case below exists to guard. Weakening it to
    // accommodate one new row would retire that guarantee for every row.
    const ids = commerce!.items.map((item) => item.id);
    expect(ids).toEqual(["orders", "products", "subscriptions", "billing"]);
  });

  it("no longer lists Payments under People", () => {
    const people = getNav().find((group) => group.label === "People");
    expect(people).toBeDefined();

    const ids = people!.items.map((item) => item.id);
    expect(ids).not.toContain("payments");
  });

  it("every entry previews as a real link: soon + soonPreviewable both set", () => {
    // Owner's stated rationale: "All of these should be coming soon... because they're obviously
    // not active now" — but a section where some rows are clickable-preview and others are inert
    // would read as a bug, so every row matches Payments' existing `soonPreviewable: true` rather
    // than defaulting to a disabled non-link. Tovu's shared nav adapter now applies that same
    // preview policy to all Soon rows, including Design System's placeholder.
    const commerce = getNav().find((group) => group.label === "Commerce");
    expect(commerce).toBeDefined();

    for (const item of commerce!.items) {
      expect(item.soon).toBe(true);
      expect(item.soonPreviewable).toBe(true);
    }
  });
});
