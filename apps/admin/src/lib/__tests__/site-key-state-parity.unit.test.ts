import { describe, expect, expectTypeOf, it } from "vitest";
import type { AdminSiteKeyState as SharedSiteKeyState } from "@jini-ai/core/contracts/site/site-key";

import { ADMIN_SITE_KEY_STATES } from "@/features/sites/api/sites-api.types";

/**
 * @file Parity tripwire between `ADMIN_SITE_KEY_STATES` (`features/sites/api/sites-api.types.ts`)
 * and the shared site-key state union (`@jini-ai/core/contracts/site/site-key`'s
 * `AdminSiteKeyState`) — the one union the server's `GET .../system/site-key` route
 * (`routes/system/site-key.ts`'s `siteKeyState`) now types its `state` field with.
 *
 * This used to read the server's own `contracts/core/site-key-state.ts` off disk and regex its
 * literal union. That file is gone: the union lives in the shared contract both apps import, so the
 * remaining drift risk is between this app's RUNTIME list and that type. `SHARED_STATES` below is a
 * `Record` keyed by the shared union, so adding, removing or renaming a state there fails the
 * typecheck here until this object is edited too; the runtime assertion then ties the list to it.
 */
const SHARED_STATES: Record<SharedSiteKeyState, true> = {
  active: true,
  missing: true,
  "missing-with-data": true,
  mismatch: true,
  invalid: true,
};

describe("AdminSiteKeyState parity with the shared site-key state union", () => {
  it("matches the Core state union in both directions (type level)", () => {
    expectTypeOf<SharedSiteKeyState>().toEqualTypeOf<(typeof ADMIN_SITE_KEY_STATES)[number]>();
  });

  it("matches the shared AdminSiteKeyState union literal for literal", () => {
    expect(ADMIN_SITE_KEY_STATES.slice().sort()).toEqual(Object.keys(SHARED_STATES).sort());
  });

  it("is a real, non-trivial list — proves the comparison above compared something", () => {
    expect(ADMIN_SITE_KEY_STATES.length).toBeGreaterThanOrEqual(5);
  });
});
