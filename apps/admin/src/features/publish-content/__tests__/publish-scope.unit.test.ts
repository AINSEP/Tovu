import { describe, expect, it } from "vitest";

import { publishScopeDescriptionKey, publishScopeTitleKey } from "../publish-scope";

/**
 * @file `plan-publish-sections-2026-09-25.md` §2 S2 — the pure label rules the dialog title, the
 * idle-state primary button, and (in S3) each section's own button all read from. Kept pure and
 * tested on its own so the dialog's own test file only has to assert on the rendered result, never
 * re-derive the mapping.
 */
describe("publishScopeTitleKey", () => {
  it("no scope at all reads as publishing everything", () => {
    expect(publishScopeTitleKey({ scope: undefined })).toBe("Publish all content");
  });

  it("a single-type scope with no entityKeys reads as that type's section label", () => {
    expect(publishScopeTitleKey({ scope: { entityTypes: ["page"] } })).toBe("Publish pages");
    expect(publishScopeTitleKey({ scope: { entityTypes: ["post"] } })).toBe("Publish posts");
    expect(publishScopeTitleKey({ scope: { entityTypes: ["media"] } })).toBe("Publish media");
    expect(publishScopeTitleKey({ scope: { entityTypes: ["menu"] } })).toBe("Publish menus");
    expect(publishScopeTitleKey({ scope: { entityTypes: ["redirect"] } })).toBe("Publish redirects");
    expect(publishScopeTitleKey({ scope: { entityTypes: ["theme-files", "active-theme"] } })).toBe("Publish themes");
  });

  it("entityKeys present reads as a single-item publish, regardless of entityTypes", () => {
    expect(publishScopeTitleKey({ scope: { entityTypes: ["page"], entityKeys: ["page:1"] } })).toBe("Publish item");
  });

  it("more than one entityType with no entityKeys falls back to the all-content label", () => {
    expect(publishScopeTitleKey({ scope: { entityTypes: ["page", "post"] } })).toBe("Publish all content");
  });

  it("an empty entityKeys array is treated as absent, not as a single-item publish", () => {
    expect(publishScopeTitleKey({ scope: { entityTypes: ["page"], entityKeys: [] } })).toBe("Publish pages");
  });
});

describe("multi-type sections (plan G1)", () => {
  it("a scope equal to one section's whole type set, in any order, reads as that section", () => {
    expect(publishScopeTitleKey({ scope: { entityTypes: ["form"] } })).toBe("Publish forms");
    expect(publishScopeTitleKey({ scope: { entityTypes: ["content-type", "collection-entry"] } })).toBe("Publish collections");
    expect(publishScopeTitleKey({ scope: { entityTypes: ["term", "taxonomy"] } })).toBe("Publish categories & tags");
    expect(publishScopeTitleKey({ scope: { entityTypes: ["widget", "widget-area"] } })).toBe("Publish widgets");
    expect(publishScopeDescriptionKey({ scope: { entityTypes: ["widget", "widget-area"] } })).toBe(
      "Sends your widgets and widget regions to the live site.",
    );
  });

  it("part of a section's type set is not that section", () => {
    expect(publishScopeTitleKey({ scope: { entityTypes: ["taxonomy"] } })).toBe("Publish all content");
  });
});

/** Owner decision 2026-09-25 — the dialog's description line says what THIS dialog sends, not the
 *  all-content sentence in every section. */
describe("publishScopeDescriptionKey", () => {
  it("keeps the all-content sentence when nothing is narrowed", () => {
    const all = "Sends your posts, pages and media to the live site. Deploy ships code; publish ships content.";
    expect(publishScopeDescriptionKey({ scope: undefined })).toBe(all);
    expect(publishScopeDescriptionKey({ scope: { entityTypes: ["page", "post"] } })).toBe(all);
  });

  it("names the section a single-type scope sends", () => {
    expect(publishScopeDescriptionKey({ scope: { entityTypes: ["page"] } })).toBe("Sends your pages to the live site.");
    expect(publishScopeDescriptionKey({ scope: { entityTypes: ["post"] } })).toBe("Sends your posts to the live site.");
    expect(publishScopeDescriptionKey({ scope: { entityTypes: ["media"] } })).toBe("Sends your media to the live site.");
    expect(publishScopeDescriptionKey({ scope: { entityTypes: ["menu"] } })).toBe("Sends your menus to the live site.");
    expect(publishScopeDescriptionKey({ scope: { entityTypes: ["redirect"] } })).toBe("Sends your redirects to the live site.");
    expect(publishScopeDescriptionKey({ scope: { entityTypes: ["theme-files", "active-theme"] } })).toBe("Sends your themes to the live site.");
  });

  it("reads as one item for an entityKeys scope", () => {
    expect(publishScopeDescriptionKey({ scope: { entityTypes: ["page"], entityKeys: ["page:1"] } })).toBe("Sends this item to the live site.");
  });
});
