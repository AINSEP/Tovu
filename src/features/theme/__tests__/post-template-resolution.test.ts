import assert from "node:assert/strict";
import test from "node:test";

import { resolvePostTemplate } from "../static-render";
import type { DiscoveredTheme } from "../theme";

/**
 * @file Certifies the `templateChoice` tri-state in {@link resolvePostTemplate}.
 *
 * Regression origin (2026-08-09): migration `0028` added `template_choice` as an additive nullable
 * column with no backfill, and the render path treated `null` as "author opted out" — so 11 live
 * published posts served a "Template not configured" diagnostic page at HTTP 200. The distinction
 * these tests pin down is the fix: `null` (never chosen) must fall back, `""` (explicitly chosen
 * "No template chosen" in the admin picker) must keep diagnosing.
 *
 * The "never chosen" cases matter beyond the legacy rows: any creation path that doesn't know this
 * field exists (seed script, agent tool, direct API or DB insert) also writes `null`, so these are
 * the tests that stop the bug reappearing on the next post created outside the admin editor.
 */

const POST_SLOT = '<div data-embed-type="post" data-embed-id="{{post}}"></div>';

function makeTheme(
  overrides: { postTemplate?: string[]; pages?: Record<string, string> } = {}
): DiscoveredTheme {
  return {
    manifest: {
      id: "t",
      name: "T",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      ...(overrides.postTemplate !== undefined ? { postTemplate: overrides.postTemplate } : {}),
    },
    dir: "/fake",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: overrides.pages ?? {
      "blog-post": `<html><body><main>${POST_SLOT}</main></body></html>`,
      "long-form": `<html><body><article>${POST_SLOT}</article></body></html>`,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

test("templateChoice null (never chosen) falls back to the theme's first postTemplate", () => {
  const theme = makeTheme({ postTemplate: ["blog-post.html", "long-form.html"] });
  const result = resolvePostTemplate({ theme, templateChoice: null });

  assert.equal(result.kind, "template");
  assert.equal(result.kind === "template" && result.pageId, "blog-post");
});

test("templateChoice undefined (field absent, e.g. a pre-0028 row) also falls back", () => {
  const theme = makeTheme({ postTemplate: ["blog-post.html"] });
  const result = resolvePostTemplate({ theme, templateChoice: undefined });

  assert.equal(result.kind, "template");
  assert.equal(result.kind === "template" && result.pageId, "blog-post");
});

test('templateChoice "" (explicitly opted out) still renders the diagnostic page', () => {
  // The deliberate-author-action case. If this ever starts falling back, the admin picker's "No
  // template chosen" option has silently stopped meaning anything.
  const theme = makeTheme({ postTemplate: ["blog-post.html"] });

  assert.equal(resolvePostTemplate({ theme, templateChoice: "" }).kind, "diagnostic");
});

test("null and \"\" resolve differently for the same theme — the whole point of the tri-state", () => {
  const theme = makeTheme({ postTemplate: ["blog-post.html"] });

  assert.notEqual(
    resolvePostTemplate({ theme, templateChoice: null }).kind,
    resolvePostTemplate({ theme, templateChoice: "" }).kind
  );
});

test("an explicit choice wins over the first postTemplate entry", () => {
  const theme = makeTheme({ postTemplate: ["blog-post.html", "long-form.html"] });
  const result = resolvePostTemplate({ theme, templateChoice: "long-form.html" });

  assert.equal(result.kind === "template" && result.pageId, "long-form");
});

test("an explicit choice naming a page the theme no longer ships is diagnostic, not a silent fallback", () => {
  // A theme switch can strand a saved choice. Falling back here would render a post through a
  // template its author never picked, with no signal that their choice was dropped.
  const theme = makeTheme({ postTemplate: ["blog-post.html"] });

  assert.equal(resolvePostTemplate({ theme, templateChoice: "deleted.html" }).kind, "diagnostic");
});

test("a template with no post slot is diagnostic even when reached by fallback", () => {
  // Rendering it would drop the post body entirely — a silently blank page is worse than a loud one.
  const theme = makeTheme({
    postTemplate: ["slotless.html"],
    pages: { slotless: "<html><body><main>no embed marker here</main></body></html>" },
  });

  assert.equal(resolvePostTemplate({ theme, templateChoice: null }).kind, "diagnostic");
});

test("a theme declaring no postTemplate has nothing to fall back to", () => {
  const theme = makeTheme({});

  assert.equal(resolvePostTemplate({ theme, templateChoice: null }).kind, "diagnostic");
});

test("an empty postTemplate array has nothing to fall back to", () => {
  const theme = makeTheme({ postTemplate: [] });

  assert.equal(resolvePostTemplate({ theme, templateChoice: null }).kind, "diagnostic");
});

test("the resolved template html is returned so the caller never re-reads theme.pages", () => {
  const theme = makeTheme({ postTemplate: ["blog-post.html"] });
  const result = resolvePostTemplate({ theme, templateChoice: null });

  assert.ok(result.kind === "template" && result.html.includes('data-embed-id="{{post}}"'));
});

test("a choice carrying no .html suffix still resolves against the page key", () => {
  const theme = makeTheme({ postTemplate: ["blog-post.html"] });

  assert.equal(resolvePostTemplate({ theme, templateChoice: "blog-post" }).kind, "template");
});
