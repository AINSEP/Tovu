import assert from "node:assert/strict";
import test from "node:test";

import { isEligibleForPageTemplateBranch } from "../static-render";
import type { DiscoveredTheme } from "../theme";

/**
 * @file Certifies {@link isEligibleForPageTemplateBranch} — the gate `pages.ts` runs before calling
 * `renderPageViaTemplate` (Task 4, 2026-08-11). Mirrors `post-template-eligibility.test.ts`'s
 * structure for the Pages counterpart of `isEligibleForPostTemplateBranch`.
 */

function makeTheme(overrides: { pageTemplate?: string[]; tier?: DiscoveredTheme["manifest"]["tier"] } = {}): DiscoveredTheme {
  return {
    manifest: {
      id: "t",
      name: "T",
      version: "1.0.0",
      tier: overrides.tier ?? "static",
      engine: 1,
      ...(overrides.pageTemplate !== undefined ? { pageTemplate: overrides.pageTemplate } : {}),
    },
    dir: "/fake",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {},
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

test("an html-format Page with an explicit templateChoice IS eligible", () => {
  const theme = makeTheme({ pageTemplate: ["legal-page.html"] });
  assert.equal(
    isEligibleForPageTemplateBranch({
      theme,
      post: { kind: "page", bodyFormat: "html", templateChoice: "legal-page.html" },
    }),
    true
  );
});

test("an html-format Page with templateChoice \"\" is NOT eligible — collapses to the same 'render own body' outcome as null, unlike Posts", () => {
  // Deliberate divergence from Posts' tri-state: a Page's "no template" IS its normal working
  // behavior, so "" must not route to the diagnostic page the way it does for a Post.
  const theme = makeTheme({ pageTemplate: ["legal-page.html"] });
  assert.equal(
    isEligibleForPageTemplateBranch({ theme, post: { kind: "page", bodyFormat: "html", templateChoice: "" } }),
    false
  );
});

test("REGRESSION GUARD: an html-format Page with templateChoice null is NOT eligible — no fallback arm for Pages", () => {
  // Unlike Posts, there is no "never chosen -> theme's first template" fallback for Pages at all.
  // null must mean "render the Page's own body directly", the existing default behavior.
  const theme = makeTheme({ pageTemplate: ["legal-page.html"] });
  assert.equal(
    isEligibleForPageTemplateBranch({ theme, post: { kind: "page", bodyFormat: "html", templateChoice: null } }),
    false
  );
});

test("REGRESSION GUARD: an html-format Page with templateChoice undefined is NOT eligible", () => {
  const theme = makeTheme({ pageTemplate: ["legal-page.html"] });
  assert.equal(
    isEligibleForPageTemplateBranch({ theme, post: { kind: "page", bodyFormat: "html" } }),
    false
  );
});

test("a doc-format Page is NOT eligible for the PAGE-template branch even with an explicit choice", () => {
  // A doc-format Page with an explicit choice is isEligibleForPostTemplateBranch's case
  // (our-story) -- the two branches are mutually exclusive by bodyFormat.
  const theme = makeTheme({ pageTemplate: ["legal-page.html"] });
  assert.equal(
    isEligibleForPageTemplateBranch({
      theme,
      post: { kind: "page", bodyFormat: "doc", templateChoice: "legal-page.html" },
    }),
    false
  );
});

test("an html-format Post is NOT eligible (kind must be page)", () => {
  const theme = makeTheme({ pageTemplate: ["legal-page.html"] });
  assert.equal(
    isEligibleForPageTemplateBranch({
      theme,
      post: { kind: "post", bodyFormat: "html", templateChoice: "legal-page.html" },
    }),
    false
  );
});

test("a non-static theme is NOT eligible", () => {
  const theme = makeTheme({ pageTemplate: ["legal-page.html"], tier: "declarative" });
  assert.equal(
    isEligibleForPageTemplateBranch({
      theme,
      post: { kind: "page", bodyFormat: "html", templateChoice: "legal-page.html" },
    }),
    false
  );
});

test("a theme with no pageTemplate array is NOT eligible", () => {
  const theme = makeTheme({});
  assert.equal(
    isEligibleForPageTemplateBranch({
      theme,
      post: { kind: "page", bodyFormat: "html", templateChoice: "legal-page.html" },
    }),
    false
  );
});

test("a theme with an empty pageTemplate array is NOT eligible", () => {
  const theme = makeTheme({ pageTemplate: [] });
  assert.equal(
    isEligibleForPageTemplateBranch({
      theme,
      post: { kind: "page", bodyFormat: "html", templateChoice: "legal-page.html" },
    }),
    false
  );
});
