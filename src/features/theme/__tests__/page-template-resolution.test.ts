import assert from "node:assert/strict";
import test from "node:test";

import { resolvePageTemplate } from "../static-render";
import type { DiscoveredTheme } from "../theme";

/**
 * @file Certifies {@link resolvePageTemplate} — the Pages-editor counterpart to
 * `resolvePostTemplate` (Task 4, 2026-08-11), sharing the same tri-state engine
 * (`resolveTemplateChoice`) but checking `theme.manifest.pageTemplate` against a `{"type":"content"}`
 * slot instead of `theme.manifest.postTemplate` against a `{"type":"post"}` slot.
 *
 * This file mirrors `post-template-resolution.test.ts`'s cases 1:1 so the two resolvers are certified
 * to the same standard — the shared implementation makes that guarantee cheap, but the certification
 * itself still has to name each case, the same discipline `resolvePostTemplate`'s own tests apply.
 */

const CONTENT_SLOT = '<main data-embed-config=\'{"type":"content"}\'></main>';

function makeTheme(overrides: { pageTemplate?: string[]; pages?: Record<string, string> } = {}): DiscoveredTheme {
  return {
    manifest: {
      id: "t",
      name: "T",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      ...(overrides.pageTemplate !== undefined ? { pageTemplate: overrides.pageTemplate } : {}),
    },
    dir: "/fake",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: overrides.pages ?? {
      "legal-page": `<html><body><article>${CONTENT_SLOT}</article></body></html>`,
      "landing-page": `<html><body><section>${CONTENT_SLOT}</section></body></html>`,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

test("templateChoice null (never chosen) falls back to the theme's first pageTemplate", () => {
  const theme = makeTheme({ pageTemplate: ["legal-page.html", "landing-page.html"] });
  const result = resolvePageTemplate({ theme, templateChoice: null });

  assert.equal(result.kind, "template");
  assert.equal(result.kind === "template" && result.pageId, "legal-page");
});

test("templateChoice undefined also falls back", () => {
  const theme = makeTheme({ pageTemplate: ["legal-page.html"] });
  const result = resolvePageTemplate({ theme, templateChoice: undefined });

  assert.equal(result.kind, "template");
  assert.equal(result.kind === "template" && result.pageId, "legal-page");
});

test('templateChoice "" (explicitly opted out) renders the diagnostic page', () => {
  const theme = makeTheme({ pageTemplate: ["legal-page.html"] });
  assert.equal(resolvePageTemplate({ theme, templateChoice: "" }).kind, "diagnostic");
});

test("an explicit choice wins over the first pageTemplate entry", () => {
  const theme = makeTheme({ pageTemplate: ["legal-page.html", "landing-page.html"] });
  const result = resolvePageTemplate({ theme, templateChoice: "landing-page.html" });

  assert.equal(result.kind === "template" && result.pageId, "landing-page");
});

test("an explicit choice the ACTIVE theme cannot honor falls back to that theme's first template", () => {
  const theme = makeTheme({ pageTemplate: ["legal-page.html"] });
  const result = resolvePageTemplate({ theme, templateChoice: "from-the-old-theme.html" });

  assert.equal(result.kind, "template");
  assert.equal(result.kind === "template" && result.pageId, "legal-page");
});

test("a stranded explicit choice is diagnostic only when the theme has no usable fallback either", () => {
  const theme = makeTheme({});
  assert.equal(resolvePageTemplate({ theme, templateChoice: "from-the-old-theme.html" }).kind, "diagnostic");
});

test("a POST template (has a post slot, not a content slot) does not count as a usable page template", () => {
  // The whole reason pageTemplate/postTemplate are separate arrays and separate slot markers: a
  // template built for Posts must not be silently accepted as a Page template just because a
  // filename was named in pageTemplate by mistake.
  const theme = makeTheme({
    pageTemplate: ["blog-post.html"],
    pages: { "blog-post": '<div data-embed-config=\'{"type":"post","id":"{{post}}"}\'></div>' },
  });
  assert.equal(resolvePageTemplate({ theme, templateChoice: null }).kind, "diagnostic");
});

test("a theme declaring no pageTemplate has nothing to fall back to", () => {
  const theme = makeTheme({});
  assert.equal(resolvePageTemplate({ theme, templateChoice: null }).kind, "diagnostic");
});

test("an empty pageTemplate array has nothing to fall back to", () => {
  const theme = makeTheme({ pageTemplate: [] });
  assert.equal(resolvePageTemplate({ theme, templateChoice: null }).kind, "diagnostic");
});

test("postTemplate and pageTemplate are independent arrays on the same theme", () => {
  const theme: DiscoveredTheme = {
    ...makeTheme({ pageTemplate: ["legal-page.html"] }),
    manifest: {
      ...makeTheme({ pageTemplate: ["legal-page.html"] }).manifest,
      postTemplate: ["blog-post.html"],
    },
  } as DiscoveredTheme;
  const pageResult = resolvePageTemplate({ theme, templateChoice: null });
  assert.equal(pageResult.kind === "template" && pageResult.pageId, "legal-page");
});
