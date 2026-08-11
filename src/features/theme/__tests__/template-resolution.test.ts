import assert from "node:assert/strict";
import test from "node:test";

import { resolveTemplate } from "../static-render";
import type { DiscoveredTheme } from "../theme";

/**
 * @file Certifies the `templateChoice` tri-state in {@link resolveTemplate}.
 *
 * Replaces `post-template-resolution.test.ts` + `page-template-resolution.test.ts` (2026-08-11
 * unification — `resolvePostTemplate`/`resolvePageTemplate` collapsed into this one function, now
 * that both Posts and Pages resolve against the same `theme.manifest.templates` array and the same
 * `"content"` slot marker). Every case from both predecessors is preserved, minus the two that
 * asserted the split itself (separate arrays, a Post-shaped template rejected for a Page) — those
 * properties no longer exist by design; see `template-eligibility.test.ts` for what replaced the
 * kind-specific behavior that split used to encode (it now lives in the ELIGIBILITY gate, not here).
 *
 * Regression origin (2026-08-09): migration `0028` added `template_choice` as an additive nullable
 * column with no backfill, and the render path treated `null` as "author opted out" — so 11 live
 * published posts served a "Template not configured" diagnostic page at HTTP 200. The distinction
 * these tests pin down is the fix: `null` (never chosen) must fall back, `""` (explicitly chosen
 * "No template chosen" in the admin picker) must keep diagnosing.
 */

const CONTENT_SLOT = '<div data-embed-config=\'{"type":"content"}\'></div>';

function makeTheme(overrides: { templates?: string[]; pages?: Record<string, string> } = {}): DiscoveredTheme {
  return {
    manifest: {
      id: "t",
      name: "T",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      ...(overrides.templates !== undefined ? { templates: overrides.templates } : {}),
    },
    dir: "/fake",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: overrides.pages ?? {
      "blog-post": `<html><body><main>${CONTENT_SLOT}</main></body></html>`,
      "long-form": `<html><body><article>${CONTENT_SLOT}</article></body></html>`,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

test("templateChoice null (never chosen) falls back to the theme's first template", () => {
  const theme = makeTheme({ templates: ["blog-post.html", "long-form.html"] });
  const result = resolveTemplate({ theme, templateChoice: null });

  assert.equal(result.kind, "template");
  assert.equal(result.kind === "template" && result.pageId, "blog-post");
});

test("templateChoice undefined (field absent, e.g. a pre-0028 row) also falls back", () => {
  const theme = makeTheme({ templates: ["blog-post.html"] });
  const result = resolveTemplate({ theme, templateChoice: undefined });

  assert.equal(result.kind, "template");
  assert.equal(result.kind === "template" && result.pageId, "blog-post");
});

test('templateChoice "" (explicitly opted out) still renders the diagnostic page', () => {
  const theme = makeTheme({ templates: ["blog-post.html"] });
  assert.equal(resolveTemplate({ theme, templateChoice: "" }).kind, "diagnostic");
});

test("null and \"\" resolve differently for the same theme — the whole point of the tri-state", () => {
  const theme = makeTheme({ templates: ["blog-post.html"] });
  assert.notEqual(
    resolveTemplate({ theme, templateChoice: null }).kind,
    resolveTemplate({ theme, templateChoice: "" }).kind
  );
});

test("an explicit choice wins over the first templates entry", () => {
  const theme = makeTheme({ templates: ["blog-post.html", "long-form.html"] });
  const result = resolveTemplate({ theme, templateChoice: "long-form.html" });
  assert.equal(result.kind === "template" && result.pageId, "long-form");
});

test("an explicit choice the ACTIVE theme cannot honor falls back to that theme's first template", () => {
  // The theme-switch half of the same regression. `template_choice` names a file in whatever theme
  // was active when the author picked it, and nothing on the row records which theme that was — so
  // switching themes strands every explicit choice at once. Reading a stranded choice as an opt-out
  // would put every one of those rows back on the HTTP-200 diagnostic page, and unlike the `null`
  // case no backfill could heal it, because the stored value is a real filename.
  const theme = makeTheme({ templates: ["blog-post.html"] });
  const result = resolveTemplate({ theme, templateChoice: "from-the-old-theme.html" });

  assert.equal(result.kind, "template");
  assert.equal(result.kind === "template" && result.pageId, "blog-post");
});

test("a stranded explicit choice is diagnostic only when the theme has no usable fallback either", () => {
  const theme = makeTheme({});
  assert.equal(resolveTemplate({ theme, templateChoice: "from-the-old-theme.html" }).kind, "diagnostic");
});

test("an explicit choice naming a page that exists but ships no content slot falls back", () => {
  // "Cannot honor" for the same reason a missing page cannot: rendering it would drop the body.
  const theme = makeTheme({
    templates: ["blog-post.html"],
    pages: {
      "blog-post": `<html><body><main>${CONTENT_SLOT}</main></body></html>`,
      slotless: "<html><body><main>no embed marker here</main></body></html>",
    },
  });
  const result = resolveTemplate({ theme, templateChoice: "slotless.html" });
  assert.equal(result.kind === "template" && result.pageId, "blog-post");
});

test('"" stays diagnostic even when the theme has a template that could have been used', () => {
  // The opt-out must not be reachable by the fallback path the stranded-choice case now takes.
  const theme = makeTheme({ templates: ["blog-post.html"] });
  assert.equal(resolveTemplate({ theme, templateChoice: "" }).kind, "diagnostic");
});

test("a template with no content slot is diagnostic even when reached by fallback", () => {
  // Rendering it would drop the row's body entirely — a silently blank page is worse than a loud one.
  const theme = makeTheme({
    templates: ["slotless.html"],
    pages: { slotless: "<html><body><main>no embed marker here</main></body></html>" },
  });
  assert.equal(resolveTemplate({ theme, templateChoice: null }).kind, "diagnostic");
});

test("a theme declaring no templates has nothing to fall back to", () => {
  const theme = makeTheme({});
  assert.equal(resolveTemplate({ theme, templateChoice: null }).kind, "diagnostic");
});

test("an empty templates array has nothing to fall back to", () => {
  const theme = makeTheme({ templates: [] });
  assert.equal(resolveTemplate({ theme, templateChoice: null }).kind, "diagnostic");
});

test("the resolved template html is returned so the caller never re-reads theme.pages", () => {
  const theme = makeTheme({ templates: ["blog-post.html"] });
  const result = resolveTemplate({ theme, templateChoice: null });
  assert.ok(result.kind === "template" && result.html.includes('"type":"content"'));
});

test("a choice carrying no .html suffix still resolves against the page key", () => {
  const theme = makeTheme({ templates: ["blog-post.html"] });
  assert.equal(resolveTemplate({ theme, templateChoice: "blog-post" }).kind, "template");
});

test("a Post-authored template and a Page-authored template resolve identically now — same array, same slot marker", () => {
  // The headline behavior change this unification exists to prove: there is nothing left in
  // resolveTemplate that could distinguish "this template was meant for a Post" from "this template
  // was meant for a Page" — that distinction is gone from the marker vocabulary entirely, by design.
  const theme = makeTheme({
    templates: ["blog-post.html", "page-shell.html"],
    pages: {
      "blog-post": `<html><body><article class="post-detail">${CONTENT_SLOT}</article></body></html>`,
      "page-shell": `<html><body><main>${CONTENT_SLOT}</main></body></html>`,
    },
  });
  const postResult = resolveTemplate({ theme, templateChoice: "blog-post.html" });
  const pageResult = resolveTemplate({ theme, templateChoice: "page-shell.html" });
  assert.equal(postResult.kind, "template");
  assert.equal(pageResult.kind, "template");
});
