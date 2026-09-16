import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAdminDevServerOrigin } from "../admin-dev-origin";
import { siteUrl } from "../site-url";

/**
 * @file `siteUrl` — links to the public Tovu site (not the admin SPA), origin-qualified only when the
 * page is on the admin dev server's OWN origin. 75% before the first pass on this file (the dev
 * branch, and its own default-origin fallback, were untested).
 *
 * `admin-dev-origin` is mocked rather than driving `window.location`, which jsdom does not reliably
 * let a test reconfigure. The cost is that this suite contributes ZERO coverage to that module —
 * `admin-dev-origin.unit.test.ts` exists to cover it directly.
 */

vi.mock("../admin-dev-origin", () => ({ isAdminDevServerOrigin: vi.fn() }));

beforeEach(() => {
  // Default to the historical premise (the browser really is on Vite's origin) so each test below
  // only has to state the axis it is actually exercising.
  vi.mocked(isAdminDevServerOrigin).mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
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

  it("in dev with no VITE_TOVU_SITE_URL set, falls back to https://localhost:3000 — the dev API server terminates TLS too (51c59f5c)", () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_TOVU_SITE_URL", undefined);

    expect(siteUrl("/hello-world")).toBe("https://localhost:3000/hello-world");
  });

  it("in dev but NOT on the admin dev server's origin, stays relative — the apps/desktop same-origin /admin/* proxy", () => {
    // The desktop serves the Vite-built admin through its own site server on a runtime-assigned port,
    // so `import.meta.env.DEV` is true while the site's routes are reachable relatively. Absolutizing
    // here would point every "View site" link and the template-preview iframe at
    // `https://localhost:3000`, which a bare `npm run desktop` has nothing listening on.
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_TOVU_SITE_URL", undefined);
    vi.mocked(isAdminDevServerOrigin).mockReturnValue(false);

    expect(siteUrl("/hello-world")).toBe("/hello-world");
  });

  it("does not consult the origin at all outside dev — a production bundle has no dev server to be on", () => {
    vi.stubEnv("DEV", false);
    vi.mocked(isAdminDevServerOrigin).mockReturnValue(true);

    expect(siteUrl("/hello-world")).toBe("/hello-world");
    expect(isAdminDevServerOrigin).not.toHaveBeenCalled();
  });
});
