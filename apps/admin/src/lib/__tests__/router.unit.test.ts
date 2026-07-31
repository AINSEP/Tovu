// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { adminHref, currentRoutePath, navigate, redirectLegacyHashUrl } from "../router";

/**
 * @file `lib/router.ts` — the cases two rounds of external audit turned up, each of which was a real
 * defect at the time it was written.
 *
 * These are pure-ish functions over `window.location`/`history`, so they are driven with
 * `replaceState` directly rather than through a rendered `App`.
 */

function at(url: string) {
  window.history.replaceState(null, "", url);
}

beforeEach(() => at("/admin/"));
afterEach(() => at("/"));

describe("redirectLegacyHashUrl", () => {
  it("rewrites a legacy bookmark to its path equivalent", () => {
    at("/admin/#/section/seo");
    expect(redirectLegacyHashUrl()).toBe(true);
    expect(window.location.pathname).toBe("/admin/seo");
    expect(window.location.hash).toBe("");
  });

  it("keeps the query when rewriting", () => {
    at("/admin/#/section/settings?tab=general");
    redirectLegacyHashUrl();
    expect(window.location.pathname).toBe("/admin/settings");
    expect(window.location.search).toBe("?tab=general");
  });

  it("keeps `section/` when extra segments would make the path unparseable", () => {
    // The old hash parser matched `section` + id and ignored trailing segments. Stripping
    // unconditionally produced `/admin/settings/foo`, which is multi-segment and hits the dashboard.
    at("/admin/#/section/settings/foo");
    redirectLegacyHashUrl();
    expect(window.location.pathname).toBe("/admin/section/settings/foo");
  });

  it("does NOT touch a real route that carries a route-shaped fragment", () => {
    /*
     * The audit-round-2 bug. A fragment beginning `#/` is not a legacy URL when the path already
     * names a route — rewriting on it discarded the path, so `/admin/posts/abc#/section/seo` reloaded
     * as `/admin/seo` and the post was lost.
     */
    at("/admin/posts/abc#/section/seo");
    expect(redirectLegacyHashUrl()).toBe(false);
    expect(window.location.pathname).toBe("/admin/posts/abc");
    expect(window.location.hash).toBe("#/section/seo");
  });

  it("ignores an ordinary in-page fragment", () => {
    at("/admin/settings#seo-defaults");
    expect(redirectLegacyHashUrl()).toBe(false);
    expect(window.location.pathname).toBe("/admin/settings");
    expect(window.location.hash).toBe("#seo-defaults");
  });
});

describe("navigate does not stack duplicate history entries", () => {
  it("no-ops when the target is the current URL", () => {
    at("/admin/settings");
    const before = window.history.length;
    navigate("/settings");
    navigate("/settings");
    navigate("/settings");
    expect(window.history.length).toBe(before);
    expect(window.location.pathname).toBe("/admin/settings");
  });

  it("no-ops across a trailing-slash difference, which routes to the same screen", () => {
    // `parseRoute` drops empty segments, so `/admin/settings/` and `/admin/settings` are one screen.
    at("/admin/settings/");
    const before = window.history.length;
    navigate("/settings");
    expect(window.history.length).toBe(before);
  });

  it("no-ops for a path the browser percent-encodes", () => {
    // `pushState` stores a normalized URL, so comparing raw strings never matched here and the guard
    // silently failed for anything containing a space or non-ASCII character.
    at("/admin/collections/my recipe");
    const before = window.history.length;
    navigate("/collections/my recipe");
    expect(window.history.length).toBe(before);
  });

  it("still navigates when only the query differs", () => {
    at("/admin/widgets/new?type=text");
    navigate("/widgets/new?type=image");
    expect(window.location.search).toBe("?type=image");
  });
});

describe("route path vs URL", () => {
  it("adminHref applies the base once", () => {
    expect(adminHref("/settings")).toBe("/admin/settings");
    expect(adminHref("/")).toBe("/admin/");
  });

  it("currentRoutePath strips the base, with or without a trailing slash", () => {
    at("/admin");
    expect(currentRoutePath()).toBe("/");
    at("/admin/");
    expect(currentRoutePath()).toBe("/");
    at("/admin/posts/abc");
    expect(currentRoutePath()).toBe("/posts/abc");
  });
});
