import { describe, expect, it } from "vitest";

import { NAV } from "../../nav";

/**
 * @file REQ-17/AC-25 — `nav.ts`'s `plugins` `NavItem` wiring (SPEC-005 1.1.0 amendment).
 *
 * TDD-certified against the CURRENT `nav.ts` (an existing, already-shipped file this dispatch
 * does not modify) — currently RED because `nav.ts`'s `plugins` entry still carries `soon: true`
 * and no `href`. These assertions describe the contract the Programmer stage must satisfy
 * (tasks.md T025).
 */

function findPluginsNavItem() {
  for (const group of NAV) {
    const item = group.items.find((i) => i.id === "plugins");
    if (item) return item;
  }
  return undefined;
}

describe("REQ-17/AC-25: the plugins NavItem is an active link, not disabled/soon", () => {
  it("has href '#/section/plugins' and no soon flag", () => {
    const item = findPluginsNavItem();
    expect(item).toBeDefined();
    expect(item?.href).toBe("#/section/plugins");
    expect(item?.soon).toBeFalsy();
  });

  it("RT-008: the stale SPEC-045-'BLOCKED pending an owner decision' comment must no longer describe this entry as blocked (source-text check, since the comment itself is not a runtime-observable NavItem field)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const navSource = await fs.readFile(path.resolve(__dirname, "../../nav.ts"), "utf8");

    expect(navSource).not.toMatch(/BLOCKED pending an owner decision/);
  });
});
