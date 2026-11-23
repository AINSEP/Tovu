import { readFileSync } from "node:fs";
import path from "node:path";
import type { AdminSiteKeyState } from "@jini-ai/core/contracts/site/site-key";
import { describe, expect, expectTypeOf, it } from "vitest";

import { ADMIN_SITE_KEY_STATES } from "@/features/sites/api/sites-api.types";

/**
 * @file Parity tripwire across the three places the site-key state set is written down:
 *
 * - the Core union `AdminSiteKeyState` (`@jini-ai/core/contracts/site/site-key`) — the type every
 *   admin screen reads;
 * - the host tuple `ADMIN_SITE_KEY_STATES` (`features/sites/api/sites-api.types.ts`) — the runtime
 *   list, kept on the host because a Core contract module carries no runtime values;
 * - the website union `SiteKeyState` (`apps/website/src/contracts/core/site-key-state.ts`) — the
 *   server's own source of truth.
 *
 * The first case compares the Core union and the host tuple at the type level, in both directions,
 * so a literal added to either side fails the admin type-check. The second reads the website
 * source file directly off disk (a plain `fs` read, not an import — the admin app's `@tovu/*`
 * path-alias list does not carry that file) and compares its literal union against the host tuple.
 */
const WEBSITE_SITE_KEY_STATE_SOURCE = path.resolve(
  __dirname,
  "../../../../website/src/contracts/core/site-key-state.ts",
);

describe("AdminSiteKeyState parity with the server's SiteKeyState union", () => {
  it("matches the Core state union in both directions", () => {
    expectTypeOf<AdminSiteKeyState>().toEqualTypeOf<(typeof ADMIN_SITE_KEY_STATES)[number]>();
  });

  it("matches apps/website/src/contracts/core/site-key-state.ts literal for literal", () => {
    const source = readFileSync(WEBSITE_SITE_KEY_STATE_SOURCE, "utf8");
    const match = source.match(/export type SiteKeyState = ([^;]+);/);
    if (!match) {
      throw new Error("could not find `export type SiteKeyState = ...` in site-key-state.ts — has it moved or been renamed?");
    }
    const serverStates = match[1]
      .split("|")
      .map((literal) => literal.trim().replace(/^"|"$/g, ""))
      .sort();

    expect(ADMIN_SITE_KEY_STATES.slice().sort()).toEqual(serverStates);
  });

  it("is a real, non-trivial list — proves the regex above actually matched something", () => {
    expect(ADMIN_SITE_KEY_STATES.length).toBeGreaterThanOrEqual(5);
  });
});

