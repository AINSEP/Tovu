import { describe, expect, it } from "vitest";

import { ADMIN_DEV_SERVER_PORT, isAdminDevServerOrigin } from "../admin-dev-origin";

/**
 * @file `isAdminDevServerOrigin` — the runtime predicate `site-url.ts` uses instead of a bare
 * `import.meta.env.DEV` check. Covered directly here because `site-url.unit.test.ts` and
 * `api-connectors-policies-forms-seo-redirects-posts.unit.test.ts` both `vi.mock` this module (jsdom's
 * `window.location` is not reliably reconfigurable), so neither of those suites contributes any
 * coverage to it.
 */

describe("isAdminDevServerOrigin", () => {
  it("is true when the page's port is the admin dev server's own — Vite is serving this document directly", () => {
    expect(isAdminDevServerOrigin("5173", "5173")).toBe(true);
  });

  it("is false on a desktop site window's dynamic port — the page is proxied through a Tovu server at /admin/*", () => {
    expect(isAdminDevServerOrigin("53396", "5173")).toBe(false);
  });

  it("is false for an empty port, which is what a default-port (:80/:443) origin reports", () => {
    expect(isAdminDevServerOrigin("", "5173")).toBe(false);
  });

  it("defaults its second argument to the port baked in at Vite start", () => {
    expect(isAdminDevServerOrigin(ADMIN_DEV_SERVER_PORT)).toBe(true);
    expect(isAdminDevServerOrigin(`${ADMIN_DEV_SERVER_PORT}0`)).toBe(false);
  });
});

describe("ADMIN_DEV_SERVER_PORT", () => {
  // Proves `vitest.config.ts`'s `__TOVU_ADMIN_DEV_PORT__` define landed: without it this whole file
  // throws `ReferenceError: __TOVU_ADMIN_DEV_PORT__ is not defined` at import time, which is itself
  // the signal (the same failure `vitest.config.ts` documents for `__TOVU_ADMIN_VERSION__`).
  it("is a non-empty string", () => {
    expect(typeof ADMIN_DEV_SERVER_PORT).toBe("string");
    expect(ADMIN_DEV_SERVER_PORT.length).toBeGreaterThan(0);
  });
});
