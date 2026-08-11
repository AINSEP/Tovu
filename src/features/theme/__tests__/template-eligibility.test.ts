import assert from "node:assert/strict";
import test from "node:test";

import { isEligibleForTemplateBranch } from "../static-render";
import type { DiscoveredTheme } from "../theme";

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

test("a doc-format Page with templateChoice \"\" (explicit opt-out) IS eligible", () => {
  // Eligible for the branch — resolveTemplate itself then routes "" to the diagnostic page, the same
  // tri-state behavior Posts get. The gate's job is only to keep the null/undefined fallback arm away
  // from Pages, not to reinterpret "" for them.
  const theme = makeTheme({ templates: ["blog-post.html"] });
  assert.equal(
    isEligibleForTemplateBranch({ theme, post: { kind: "page", bodyFormat: "doc", templateChoice: "" } }),
    true
  );
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

test("DIVERGENCE (preserved, not unified): an html-format Page with templateChoice \"\" is NOT eligible — collapses to the same 'render own body' outcome as null, unlike a doc-format Page", () => {
  // Deliberate divergence, predates the 2026-08-11 unification and is preserved verbatim: an
  // html-format Page's "no template" IS its normal working behavior, so "" must not route to the
  // diagnostic page the way it does for a doc-format Page/Post.
  const theme = makeTheme({ templates: ["legal-page.html"] });
  assert.equal(
    isEligibleForTemplateBranch({ theme, post: { kind: "page", bodyFormat: "html", templateChoice: "" } }),
    false
  );
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
