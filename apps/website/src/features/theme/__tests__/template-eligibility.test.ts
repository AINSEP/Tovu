import assert from "node:assert/strict";
import test from "node:test";

import { isBarePageChoice, isEligibleForTemplateBranch } from "../static-render.js";
import type { DiscoveredTheme } from "../theme.js";

/**
 * @file Certifies {@link isEligibleForTemplateBranch} — the gate `pages.ts` runs BEFORE calling
 * `renderViaTemplate`/`resolveTemplate`, deciding whether a `posts`-table record enters the template
 * render branch at all.
 *
 * Replaces `post-template-eligibility.test.ts` + `page-template-eligibility.test.ts` (2026-08-11
 * unification — the two separate gates collapsed into one function operating on the single
 * `theme.manifest.templates` array). Every case from both predecessors is preserved: this is where
 * the kind/bodyFormat asymmetries that USED to live in two separate gates now live in one, and losing
 * any of them here would silently reintroduce a live bug (see each test's own comment).
 *
 * Regression origin (2026-08-11, this session): `pages.ts` used to gate the post-template branch on
 * `bodyFormat === "doc"` alone, never `kind`. Every `kind: "page"` row with `template_choice: null`
 * (all of them, since no admin UI had ever set that column for a Page) fell into the resolver's
 * "never chosen" fallback arm and rendered under the theme's first template entry — live:
 * `terms-of-service` served `<title>Blog post — Basic</title>`. `our-story` (`kind: "page"`,
 * `template_choice: "page-shell.html"`, set by hand as the page-template proof of concept) is the
 * control case these tests must NOT break.
 */

function makeTheme(overrides: { templates?: string[]; tier?: DiscoveredTheme["manifest"]["tier"] } = {}): DiscoveredTheme {
  return {
    manifest: {
      id: "t",
      name: "T",
      version: "1.0.0",
      tier: overrides.tier ?? "static",
      engine: 1,
      ...(overrides.templates !== undefined ? { templates: overrides.templates } : {}),
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
  const theme = makeTheme({ templates: ["blog-post.html"] });
  assert.equal(
    isEligibleForTemplateBranch({ theme, post: { kind: "post", bodyFormat: "doc", templateChoice: null } }),
    true
  );
});

test("a doc-format Post with templateChoice undefined is eligible", () => {
  const theme = makeTheme({ templates: ["blog-post.html"] });
  assert.equal(isEligibleForTemplateBranch({ theme, post: { kind: "post", bodyFormat: "doc" } }), true);
});

test("an html-format Post is eligible too — Posts have no bodyFormat restriction (though CIC-3 means this never happens in practice)", () => {
  const theme = makeTheme({ templates: ["blog-post.html"] });
  assert.equal(
    isEligibleForTemplateBranch({ theme, post: { kind: "post", bodyFormat: "html", templateChoice: null } }),
    true
  );
});

test("REGRESSION GUARD: a doc-format Page with templateChoice null is NOT eligible", () => {
  // This is the live bug: terms-of-service / privacy-policy / contact / team / faq are all
  // kind=page, bodyFormat=doc, template_choice=NULL. They must fall through to the generic render
  // path, never into a template's first-listed entry.
  const theme = makeTheme({ templates: ["blog-post.html"] });
  assert.equal(
    isEligibleForTemplateBranch({ theme, post: { kind: "page", bodyFormat: "doc", templateChoice: null } }),
    false
  );
});

test("REGRESSION GUARD: a doc-format Page with templateChoice undefined is NOT eligible", () => {
  const theme = makeTheme({ templates: ["blog-post.html"] });
  assert.equal(isEligibleForTemplateBranch({ theme, post: { kind: "page", bodyFormat: "doc" } }), false);
});

test("DEMO GUARD: our-story — a doc-format Page with an explicit templateChoice IS eligible", () => {
  // our-story: kind=page, bodyFormat=doc, template_choice="page-shell.html". The working
  // proof-of-concept for the whole template model, and must keep rendering through this branch.
  const theme = makeTheme({ templates: ["page-shell.html"] });
  assert.equal(
    isEligibleForTemplateBranch({
      theme,
      post: { kind: "page", bodyFormat: "doc", templateChoice: "page-shell.html" },
    }),
    true
  );
});

test("BARE PAGE: a doc-format Page with templateChoice \"\" is NOT eligible for the template branch", () => {
  // Owner ruling 2026-09-23: "" now means a bare page (the Page's own HTML, no theme chrome) rather
  // than the diagnostic page. isBarePageChoice is what identifies it; this gate must keep it OUT of
  // the template branch entirely, in every body format.
  const theme = makeTheme({ templates: ["blog-post.html"] });
  const post = { kind: "page" as const, bodyFormat: "doc" as const, templateChoice: "" };
  assert.equal(isEligibleForTemplateBranch({ theme, post }), false);
  assert.equal(isBarePageChoice(post), true);
});

test("a Post with templateChoice \"\" stays eligible — isBarePageChoice is Page-only", () => {
  // The bare-page ruling is scoped to kind: "page". A Post's "" keeps routing through this branch to
  // resolveTemplate's own diagnostic-page arm, unchanged.
  const theme = makeTheme({ templates: ["blog-post.html"] });
  const post = { kind: "post" as const, bodyFormat: "doc" as const, templateChoice: "" };
  assert.equal(isEligibleForTemplateBranch({ theme, post }), true);
  assert.equal(isBarePageChoice(post), false);
});

test("an html-format Page with an explicit templateChoice IS eligible", () => {
  const theme = makeTheme({ templates: ["legal-page.html"] });
  assert.equal(
    isEligibleForTemplateBranch({
      theme,
      post: { kind: "page", bodyFormat: "html", templateChoice: "legal-page.html" },
    }),
    true
  );
});

test("BARE PAGE: an html-format Page with templateChoice \"\" is NOT eligible either — no more doc/html divergence", () => {
  // Before the owner's 2026-09-23 ruling this was a documented DIVERGENCE: a doc-format Page's ""
  // was eligible (diagnostic page, like a Post) while an html-format Page's "" was already ineligible
  // (matching null). The ruling gave "" a Page-only bare-page meaning that both formats must now
  // honor identically.
  const theme = makeTheme({ templates: ["legal-page.html"] });
  const post = { kind: "page" as const, bodyFormat: "html" as const, templateChoice: "" };
  assert.equal(isEligibleForTemplateBranch({ theme, post }), false);
  assert.equal(isBarePageChoice(post), true);
});

test("REGRESSION GUARD: an html-format Page with templateChoice null is NOT eligible — no fallback arm for Pages", () => {
  const theme = makeTheme({ templates: ["legal-page.html"] });
  assert.equal(
    isEligibleForTemplateBranch({ theme, post: { kind: "page", bodyFormat: "html", templateChoice: null } }),
    false
  );
});

test("REGRESSION GUARD: an html-format Page with templateChoice undefined is NOT eligible", () => {
  const theme = makeTheme({ templates: ["legal-page.html"] });
  assert.equal(isEligibleForTemplateBranch({ theme, post: { kind: "page", bodyFormat: "html" } }), false);
});

test("a non-static theme is NOT eligible even for a Post with a matching templates array", () => {
  const theme = makeTheme({ templates: ["blog-post.html"], tier: "templated" });
  assert.equal(
    isEligibleForTemplateBranch({ theme, post: { kind: "post", bodyFormat: "doc", templateChoice: null } }),
    false
  );
});

test("a theme with no templates array is NOT eligible", () => {
  const theme = makeTheme({});
  assert.equal(
    isEligibleForTemplateBranch({ theme, post: { kind: "post", bodyFormat: "doc", templateChoice: null } }),
    false
  );
});

test("a theme with an empty templates array is NOT eligible", () => {
  const theme = makeTheme({ templates: [] });
  assert.equal(
    isEligibleForTemplateBranch({ theme, post: { kind: "post", bodyFormat: "doc", templateChoice: null } }),
    false
  );
});
