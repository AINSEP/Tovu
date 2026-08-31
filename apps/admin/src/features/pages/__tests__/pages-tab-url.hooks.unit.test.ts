import { afterEach, describe, expect, it } from "vitest";

import { resolvePagesTabFromUrl, writePagesTabToUrl } from "../hooks/pages-tab-url.hooks";

/**
 * @file `pages-tab-url.hooks.ts` in isolation — no React, no `Pages` render involved. Mirrors
 * `theme-explore-url.hooks.unit.test.ts`'s own split: `Pages.unit.test.tsx`'s "deep link via
 * ?tab=" describe covers this wired into the real component; these are the resolver/writer's own
 * direct unit tests.
 */

describe("resolvePagesTabFromUrl", () => {
  it("resolves 'theme' from ?tab=themes", () => {
    expect(resolvePagesTabFromUrl("?tab=themes")).toBe("theme");
  });

  it("resolves 'mine' when the param is absent", () => {
    expect(resolvePagesTabFromUrl("")).toBe("mine");
  });

  it("resolves 'mine' for an unrecognized value — a typo or stale link must not open the wrong tab", () => {
    expect(resolvePagesTabFromUrl("?tab=theme")).toBe("mine"); // the internal id, not the URL word
    expect(resolvePagesTabFromUrl("?tab=bogus")).toBe("mine");
    expect(resolvePagesTabFromUrl("?tab=")).toBe("mine");
  });

  it("ignores other, unrelated params", () => {
    expect(resolvePagesTabFromUrl("?foo=bar&tab=themes")).toBe("theme");
  });

  it("defaults to window.location.search when no argument is given", () => {
    window.history.replaceState(null, "", "/admin/pages?tab=themes");
    try {
      expect(resolvePagesTabFromUrl()).toBe("theme");
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });
});

describe("writePagesTabToUrl", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("sets ?tab=themes for the theme tab", () => {
    window.history.replaceState(null, "", "/admin/pages");
    writePagesTabToUrl("theme");
    expect(window.location.search).toBe("?tab=themes");
  });

  it("deletes the param for the mine tab, rather than writing ?tab=mine", () => {
    window.history.replaceState(null, "", "/admin/pages?tab=themes");
    writePagesTabToUrl("mine");
    expect(window.location.search).toBe("");
  });

  it("uses replaceState, not pushState — no new history entry", () => {
    window.history.replaceState(null, "", "/admin/pages");
    const lengthBefore = window.history.length;
    writePagesTabToUrl("theme");
    expect(window.history.length).toBe(lengthBefore);
  });

  it("preserves other query params already on the URL", () => {
    window.history.replaceState(null, "", "/admin/pages?foo=bar");
    writePagesTabToUrl("theme");
    expect(window.location.search).toBe("?foo=bar&tab=themes");
  });
});
