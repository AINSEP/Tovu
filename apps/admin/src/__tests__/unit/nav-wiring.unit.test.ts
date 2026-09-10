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
  it("has href '/plugins' and no soon flag", () => {
    const item = findPluginsNavItem();
    expect(item).toBeDefined();
    expect(item?.href).toBe("/plugins");
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

describe("Integrations nav section", () => {
  // Renamed from "Add-Ons" 2026-09-10 (owner call) and widened from two rows to four: `providers`
  // and `integrations` joined `plugins`/`agent-plugins` under one group split on direction of
  // travel — see `panels.tsx`'s own comment on the `providers` panel for the full reasoning.
  it("exists with exactly Providers, APIs & Webhooks, Plugins, Agent Plugins in that order", () => {
    const integrations = getNav().find((group) => group.label === "Integrations");
    expect(integrations).toBeDefined();

    const ids = integrations!.items.map((item) => item.id);
    expect(ids).toEqual(["providers", "integrations", "plugins", "agent-plugins"]);
  });

  // Regression guard: this exact row was mislabeled "Developer API" twice before landing on
  // "APIs & Webhooks" — see `panels.tsx`'s own comment on the `integrations` panel entry.
  it("the integrations panel is labeled 'APIs & Webhooks', not 'Developer API' or 'External APIs'", () => {
    const integrations = getNav().find((group) => group.label === "Integrations");
    const item = integrations!.items.find((i) => i.id === "integrations");

    expect(item).toBeDefined();
    expect(item?.label).toBe("APIs & Webhooks");
  });

  it("agent-plugins is a fully enabled link, not a soon/preview-gated one", () => {
    const integrations = getNav().find((group) => group.label === "Integrations");
    const item = integrations!.items.find((i) => i.id === "agent-plugins");

    expect(item).toBeDefined();
    expect(item?.label).toBe("Agent Plugins");
    expect(item?.soon).toBeFalsy();
    expect(item?.soonPreviewable).toBeFalsy();
  });
});

describe("Operations nav section — observability", () => {
  it("observability is a fully enabled link, not a soon/preview-gated one", () => {
    // Same "enabled, not soon" guarantee `agent-plugins` asserts for Add-Ons above — the owner's
    // explicit ask for this entry (`development/todos.md`, 2026-09-09) was that it be clickable
    // now, not a disabled preview.
    const operations = getNav().find((group) => group.label === "Operations");
    expect(operations).toBeDefined();

    const item = operations!.items.find((i) => i.id === "observability");
    expect(item).toBeDefined();
    expect(item?.label).toBe("Observability");
    expect(item?.soon).toBeFalsy();
    expect(item?.soonPreviewable).toBeFalsy();
  });

  it("sits ahead of Activity Log and Import & Export, the two still-unbuilt Operations rows", () => {
    const operations = getNav().find((group) => group.label === "Operations");
    const ids = operations!.items.map((item) => item.id);

    const observabilityIndex = ids.indexOf("observability");
    expect(observabilityIndex).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf("activity-log")).toBeGreaterThan(observabilityIndex);
    expect(ids.indexOf("import-export")).toBeGreaterThan(observabilityIndex);
  });
});

describe("Commerce nav section", () => {
  it("exists with exactly Payments, Orders, Products, Subscriptions, Billing in that order", () => {
    const commerce = getNav().find((group) => group.label === "Commerce");
    expect(commerce).toBeDefined();

    // `billing` appended 2026-08-06 (owner request). Updated rather than loosened to a
    // `toContain`/length check: an exact-order assertion is the only thing that catches a panel
    // silently changing group or drifting up the array, which is precisely what the sibling
    // "no longer lists Payments under People" case below exists to guard. Weakening it to
    // accommodate one new row would retire that guarantee for every row.
    const ids = commerce!.items.map((item) => item.id);
    expect(ids).toEqual(["payments", "orders", "products", "subscriptions", "billing"]);
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
    // than defaulting to the disabled-non-link shape `skills`/`newsletter`/`design-system` use.
    const commerce = getNav().find((group) => group.label === "Commerce");
    expect(commerce).toBeDefined();

    for (const item of commerce!.items) {
      expect(item.soon).toBe(true);
      expect(item.soonPreviewable).toBe(true);
    }
  });
});
