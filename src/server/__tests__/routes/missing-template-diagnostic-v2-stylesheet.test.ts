import assert from "node:assert/strict";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { renderViaTemplate, type TemplateRenderDeps } from "../../inbound/public-http/routes/site/pages.js";

/**
 * @file 2026-08-19 architecture audit finding 4: the "Template not configured" diagnostic page
 * (`buildMissingTemplateHtml` in `routes/site/pages.ts`) hardcoded `../css/styles.css` — v1's
 * stylesheet filename — regardless of the active theme's `apiVersion`. `renderStaticPage` itself
 * already picks the right sentinel/filename per `apiVersion` (`tokenStylesheetSentinel`,
 * `static-asset-contract.ts`); the diagnostic builder was the one caller that didn't ask it.
 *
 * Failure without the fix, for a v2 theme (every real static theme on disk today): the diagnostic's
 * `<link>` never matches `tokenStylesheetSentinel(2)` (`../css/theme.css`), so design tokens are
 * never injected AND `rewriteAssetPaths` rewrites the folder prefix but keeps the wrong filename
 * (`styles.css`, which does not exist in a v2 theme), producing an extra 404 on top of the unstyled
 * page.
 */

const V2_THEME: DiscoveredTheme = {
  manifest: {
    id: "v2-diagnostic-test-theme",
    name: "V2 Diagnostic Test Theme",
    version: "1.0.0",
    tier: "static",
    engine: 1,
    apiVersion: 2,
  },
  dir: "/nonexistent/v2-diagnostic-test-theme",
  tokens: { "--bg": "#000" },
  tokensLight: { "--bg": "#fff" },
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

const V1_THEME: DiscoveredTheme = {
  ...V2_THEME,
  manifest: { ...V2_THEME.manifest, apiVersion: undefined },
} as unknown as DiscoveredTheme;

const EMPTY_TEMPLATE_CHOICE_POST = { templateChoice: "" } as unknown as PostRecord;
const FAKE_DEPS = {} as unknown as TemplateRenderDeps;

test("v2 theme: the missing-template diagnostic page links css/theme.css, not the v1 filename", async () => {
  const html = await renderViaTemplate(FAKE_DEPS, V2_THEME, EMPTY_TEMPLATE_CHOICE_POST, undefined);

  assert.match(
    html,
    /href="\/theme-assets\/v2-diagnostic-test-theme\/css\/theme\.css"/,
    `expected the v2 stylesheet path, got: ${html}`
  );
  assert.doesNotMatch(html, /styles\.css/, "must not reference the v1-only styles.css filename for a v2 theme");
  // Token injection only fires when the sentinel matched -- proves the fix isn't just a string swap.
  assert.match(html, /--bg:\s*#000/, "design tokens must be injected once the sentinel matches");
});

test("v1 theme (apiVersion undefined): the missing-template diagnostic page still links css/styles.css", async () => {
  const html = await renderViaTemplate(FAKE_DEPS, V1_THEME, EMPTY_TEMPLATE_CHOICE_POST, undefined);

  assert.match(
    html,
    /href="\/theme-assets\/v2-diagnostic-test-theme\/css\/styles\.css"/,
    `expected the v1 stylesheet path, got: ${html}`
  );
  assert.doesNotMatch(html, /theme\.css/, "must not reference the v2-only theme.css filename for a v1 theme");
});
