import assert from "node:assert/strict";
import test from "node:test";

import { staticThemeScripts } from "@jini-ai/cms/public-http/routes/site/pages/static-tier";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { renderViaTemplate } from "../../inbound/public-http/routes/site/pages/template-render.js";
import type { TemplateRenderDeps } from "../../inbound/public-http/routes/site/pages/render-context/deps.js";

/**
 * @file The "Template not configured" diagnostic page is a full static document, so the site's
 * document assets (cookie-consent banner/policy head) must reach it exactly as they reach any other
 * static page: asked for with the theme's static scripts and `static: true`, and the returned head
 * folded in before `</head>`. The sibling v2-stylesheet test covers the no-assets host.
 */

const THEME = {
  manifest: { id: "assets-diagnostic-theme", name: "Assets Diagnostic Theme", version: "1.0.0", tier: "static", engine: 1, apiVersion: 2 },
  dir: "/nonexistent/assets-diagnostic-theme",
  tokens: { "--bg": "#000" },
  tokensLight: { "--bg": "#fff" },
  templates: {}, liquidTemplates: {}, handlebarsTemplates: {}, pages: {}, partials: {},
  css: "", source: "site", status: "valid", errors: [],
} as unknown as DiscoveredTheme;

const ASSET_HEAD = '<meta name="diagnostic-consent-probe" content="present">';

test("missing-template page asks the host for static document assets and folds their head in", async () => {
  const requests: Array<{ scripts: readonly unknown[]; static?: true }> = [];
  const deps = {
    documentAssets: async (required: { scripts: readonly unknown[]; static?: true }) => {
      requests.push(required);
      return { head: ASSET_HEAD, body: "" };
    },
  } as unknown as TemplateRenderDeps;

  const html = await renderViaTemplate({ deps, theme: THEME, post: buildPostRecord({ templateChoice: "" }), staticMenus: undefined });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.static, true);
  assert.deepEqual(requests[0]?.scripts, staticThemeScripts({ theme: THEME }));
  const headEnd = html.indexOf("</head>");
  const probeAt = html.indexOf(ASSET_HEAD);
  assert.ok(probeAt > -1, `asset head missing from diagnostic page: ${html}`);
  assert.ok(headEnd > probeAt, "asset head must land inside <head>");
  assert.match(html, /Template not configured/i);
});
