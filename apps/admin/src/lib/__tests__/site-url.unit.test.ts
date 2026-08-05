import { afterEach, describe, expect, it, vi } from "vitest";

import { siteUrl } from "../site-url";

/**
 * @file `siteUrl` — links to the public Tovu site (not the admin SPA), origin-qualified only in
 * dev where Vite serves the admin on its own origin. 75% before this pass (the dev branch, and its
 * own default-origin fallback, were untested).
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteUrl", () => {
  it("returns the path unchanged outside dev — same-origin production serving needs no qualification", () => {
    vi.stubEnv("DEV", false);

    expect(siteUrl("/hello-world")).toBe("/hello-world");
  });

  it("in dev, prefixes the path with VITE_TOVU_SITE_URL when set", () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_TOVU_SITE_URL", "https://staging.example.com");

    expect(siteUrl("/hello-world")).toBe("https://staging.example.com/hello-world");
  });

  it("in dev with no VITE_TOVU_SITE_URL set, falls back to http://localhost:3000", () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_TOVU_SITE_URL", undefined);

    expect(siteUrl("/hello-world")).toBe("http://localhost:3000/hello-world");
  });
});
