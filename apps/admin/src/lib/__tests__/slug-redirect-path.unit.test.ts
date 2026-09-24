import { describe, expect, it } from "vitest";

import { slugRedirectPath } from "../slug-redirect-path";

/**
 * @file `slugRedirectPath` — the shared rule behind `widgetSlugRedirectPath`
 * (`features/widgets/rules.ts`, its first, narrower instance) and, per readable-slugs S6a, the
 * post/page editor load effects. Same four cases that file's own `widgetSlugRedirectPath` suite
 * pins, generalised over an explicit `base` instead of a hardcoded `/widgets`.
 */
describe("slugRedirectPath", () => {
  const UUID = "b7e6c8a0-1f2d-4e3a-9c5b-6a7d8e9f0a1b";
  const ITEM = { id: UUID, slug: "hero-banner" };

  it("returns null when the URL already carries the item's slug", () => {
    expect(slugRedirectPath("/widgets", "hero-banner", ITEM)).toBeNull();
  });

  it("returns '{base}/{slug}' when the URL carries the item's raw (UUID-shaped) id", () => {
    expect(slugRedirectPath("/widgets", UUID, ITEM)).toBe("/widgets/hero-banner");
  });

  it("works for a different base, e.g. posts", () => {
    expect(slugRedirectPath("/posts", UUID, { id: UUID, slug: "my-post" })).toBe("/posts/my-post");
  });

  it("returns null for a string that differs from the slug but isn't UUID-shaped (not recognizably an id link)", () => {
    expect(slugRedirectPath("/widgets", "some-other-slug", ITEM)).toBeNull();
  });

  it("returns null for a UUID-shaped string that isn't actually this item's own id", () => {
    expect(slugRedirectPath("/widgets", "00000000-0000-0000-0000-000000000000", ITEM)).toBeNull();
  });
});
