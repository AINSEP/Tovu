import assert from "node:assert/strict";
import test from "node:test";

import { isEligibleForPostTemplateBranch } from "../static-render";
import type { DiscoveredTheme } from "../theme";

/**
 * @file Certifies {@link isEligibleForPostTemplateBranch} — the gate `pages.ts` runs BEFORE calling
 * `resolvePostTemplate`, deciding whether a `posts`-table record enters the post-template render
 * branch at all.
 *
 * Regression origin (2026-08-11): `pages.ts:546` gated this branch on `bodyFormat === "doc"` alone,
 * never `kind`, despite a comment claiming the branch was "deliberately scoped to Posts only". Every
 * `kind: "page"` row with `template_choice: null` (all of them, since no admin UI has ever set that
 * column for a Page) fell into `resolvePostTemplate`'s "never chosen" fallback arm and rendered under
 * the theme's first `postTemplate` entry — live: `terms-of-service` served `<title>Blog post —
 * Basic</title>`. `our-story` (`kind: "page"`, `template_choice: "page-shell.html"`, set by hand as
 * the page-template proof of concept) is the control case these tests must NOT break.
 */

function makeTheme(overrides: { postTemplate?: string[]; tier?: DiscoveredTheme["manifest"]["tier"] } = {}): DiscoveredTheme {
  return {
    manifest: {
      id: "t",
      name: "T",
      version: "1.0.0",
      tier: overrides.tier ?? "static",
      engine: 1,
      ...(overrides.postTemplate !== undefined ? { postTemplate: overrides.postTemplate } : {}),
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

test("a doc-format Post with templateChoice null is eligible — the fallback Posts rely on", () => {
  const theme = makeTheme({ postTemplate: ["blog-post.html"] });
  assert.equal(
    isEligibleForPostTemplateBranch({ theme, post: { kind: "post", bodyFormat: "doc", templateChoice: null } }),
    true
  );
});

test("a doc-format Post with templateChoice undefined is eligible", () => {
  const theme = makeTheme({ postTemplate: ["blog-post.html"] });
  assert.equal(
    isEligibleForPostTemplateBranch({ theme, post: { kind: "post", bodyFormat: "doc" } }),
    true
  );
});

test("REGRESSION GUARD: a doc-format Page with templateChoice null is NOT eligible", () => {
  // This is the live bug: terms-of-service / privacy-policy / contact / team / faq / two untitled
  // pages are all kind=page, bodyFormat=doc, template_choice=NULL. They must fall through to the
  // generic render path, never into a Post template.
  const theme = makeTheme({ postTemplate: ["blog-post.html"] });
  assert.equal(
    isEligibleForPostTemplateBranch({ theme, post: { kind: "page", bodyFormat: "doc", templateChoice: null } }),
    false
  );
});

test("REGRESSION GUARD: a doc-format Page with templateChoice undefined is NOT eligible", () => {
  const theme = makeTheme({ postTemplate: ["blog-post.html"] });
  assert.equal(
    isEligibleForPostTemplateBranch({ theme, post: { kind: "page", bodyFormat: "doc" } }),
    false
  );
});

test("DEMO GUARD: our-story — a doc-format Page with an explicit templateChoice IS eligible", () => {
  // our-story: kind=page, bodyFormat=doc, template_choice="page-shell.html". This is the working
  // proof-of-concept for the whole page-template model and must keep rendering through this branch.
  const theme = makeTheme({ postTemplate: ["page-shell.html"] });
  assert.equal(
    isEligibleForPostTemplateBranch({
      theme,
      post: { kind: "page", bodyFormat: "doc", templateChoice: "page-shell.html" },
    }),
    true
  );
});

test("a doc-format Page with templateChoice \"\" (explicit opt-out) IS eligible", () => {
  // Eligible for the branch — resolvePostTemplate itself then routes "" to the diagnostic page, the
  // same tri-state behavior Posts get. The gate's job is only to keep the null/undefined fallback
  // arm away from Pages, not to reinterpret "" for them.
  const theme = makeTheme({ postTemplate: ["blog-post.html"] });
  assert.equal(
    isEligibleForPostTemplateBranch({ theme, post: { kind: "page", bodyFormat: "doc", templateChoice: "" } }),
    true
  );
});

test("an html-format Page with an explicit templateChoice is NOT eligible (no content-marker path yet)", () => {
  const theme = makeTheme({ postTemplate: ["blog-post.html"] });
  assert.equal(
    isEligibleForPostTemplateBranch({
      theme,
      post: { kind: "page", bodyFormat: "html", templateChoice: "blog-post.html" },
    }),
    false
  );
});

test("an html-format Post is NOT eligible regardless of templateChoice", () => {
  const theme = makeTheme({ postTemplate: ["blog-post.html"] });
  assert.equal(
    isEligibleForPostTemplateBranch({
      theme,
      post: { kind: "post", bodyFormat: "html", templateChoice: "blog-post.html" },
    }),
    false
  );
});

test("a non-static theme is NOT eligible even for a Post with a matching postTemplate", () => {
  const theme = makeTheme({ postTemplate: ["blog-post.html"], tier: "templated" });
  assert.equal(
    isEligibleForPostTemplateBranch({ theme, post: { kind: "post", bodyFormat: "doc", templateChoice: null } }),
    false
  );
});

test("a theme with no postTemplate array is NOT eligible", () => {
  const theme = makeTheme({});
  assert.equal(
    isEligibleForPostTemplateBranch({ theme, post: { kind: "post", bodyFormat: "doc", templateChoice: null } }),
    false
  );
});

test("a theme with an empty postTemplate array is NOT eligible", () => {
  const theme = makeTheme({ postTemplate: [] });
  assert.equal(
    isEligibleForPostTemplateBranch({ theme, post: { kind: "post", bodyFormat: "doc", templateChoice: null } }),
    false
  );
});
