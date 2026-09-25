import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ADMIN_SITE_TOKEN_STATES } from "@/lib/api";

/**
 * @file Parity tripwire between `ADMIN_SITE_TOKEN_STATES`/`AdminSiteTokenState` (`lib/api.ts`) and
 * the server's own `SiteTokenState` union (`apps/website/src/contracts/core/site-token-state.ts`).
 *
 * The admin app's `tsconfig.json`/`vite.config.ts` `@tovu/*` path-alias list (the precedent
 * `@tovu/headless`/`@tovu/embed-marker` set) doesn't carry `contracts/core/site-token-state.ts` yet
 * — see that file's own header comment, which explicitly names wiring the alias as a LATER
 * admin-side slice, distinct from this one (site-key plan §A.6). Rather than expand that alias list
 * (a wider, riskier change than this slice's scope), `AdminSiteTokenState` is a hand-declared mirror
 * of the server union, and this test is what keeps the two from silently drifting apart: it reads
 * the website source file directly off disk (a plain `fs` read, not an import — no build wiring
 * required) and compares its literal union against `ADMIN_SITE_TOKEN_STATES`.
 */
const WEBSITE_SITE_TOKEN_STATE_SOURCE = path.resolve(
  __dirname,
  "../../../../website/src/contracts/core/site-token-state.ts",
);

describe("AdminSiteTokenState parity with the server's SiteTokenState union", () => {
  it("matches apps/website/src/contracts/core/site-token-state.ts literal for literal", () => {
    const source = readFileSync(WEBSITE_SITE_TOKEN_STATE_SOURCE, "utf8");
    const match = source.match(/export type SiteTokenState = ([^;]+);/);
    if (!match) {
      throw new Error("could not find `export type SiteTokenState = ...` in site-token-state.ts — has it moved or been renamed?");
    }
    const serverStates = match[1]
      .split("|")
      .map((literal) => literal.trim().replace(/^"|"$/g, ""))
      .sort();

    expect(ADMIN_SITE_TOKEN_STATES.slice().sort()).toEqual(serverStates);
  });

  it("is a real, non-trivial list — proves the regex above actually matched something", () => {
    expect(ADMIN_SITE_TOKEN_STATES.length).toBeGreaterThanOrEqual(5);
  });
});
