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

describe("Commerce nav section", () => {
  it("exists with exactly Payments, Orders, Products, Subscriptions in that order", () => {
    const commerce = getNav().find((group) => group.label === "Commerce");
    expect(commerce).toBeDefined();

    const ids = commerce!.items.map((item) => item.id);
    expect(ids).toEqual(["payments", "orders", "products", "subscriptions"]);
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
