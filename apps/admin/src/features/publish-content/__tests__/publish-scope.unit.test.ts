import { describe, expect, it } from "vitest";

import { PUBLISH_SECTION_LABEL_KEYS, publishScopeTitleKey } from "../publish-scope";

/**
 * @file `plan-publish-sections-2026-09-25.md` §2 S2 — the pure label rules the dialog title, the
 * idle-state primary button, and (in S3) each section's own button all read from. Kept pure and
 * tested on its own so the dialog's own test file only has to assert on the rendered result, never
 * re-derive the mapping.
 */
describe("publishScopeTitleKey", () => {
  it("no scope at all reads as publishing everything", () => {
    expect(publishScopeTitleKey(undefined)).toBe("Publish all content");
  });

  it("a single-type scope with no entityKeys reads as that type's section label", () => {
    expect(publishScopeTitleKey({ entityTypes: ["page"] })).toBe("Publish pages");
    expect(publishScopeTitleKey({ entityTypes: ["post"] })).toBe("Publish posts");
    expect(publishScopeTitleKey({ entityTypes: ["media"] })).toBe("Publish media");
    expect(publishScopeTitleKey({ entityTypes: ["menu"] })).toBe("Publish menus");
    expect(publishScopeTitleKey({ entityTypes: ["redirect"] })).toBe("Publish redirects");
    expect(publishScopeTitleKey({ entityTypes: ["theme-files"] })).toBe("Publish themes");
  });

  it("entityKeys present reads as a single-item publish, regardless of entityTypes", () => {
    expect(publishScopeTitleKey({ entityTypes: ["page"], entityKeys: ["page:1"] })).toBe("Publish item");
  });

  it("more than one entityType with no entityKeys falls back to the all-content label", () => {
    expect(publishScopeTitleKey({ entityTypes: ["page", "post"] })).toBe("Publish all content");
  });

  it("an empty entityKeys array is treated as absent, not as a single-item publish", () => {
    expect(publishScopeTitleKey({ entityTypes: ["page"], entityKeys: [] })).toBe("Publish pages");
  });
});

describe("PUBLISH_SECTION_LABEL_KEYS", () => {
  it("names all six publishable entity types, matching the registry contributors", () => {
    expect(PUBLISH_SECTION_LABEL_KEYS).toEqual({
      page: "Publish pages",
      post: "Publish posts",
      media: "Publish media",
      menu: "Publish menus",
      redirect: "Publish redirects",
      "theme-files": "Publish themes",
    });
  });
});
