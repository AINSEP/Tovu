import assert from "node:assert/strict";
import test from "node:test";

import { renderStaticPage } from "../static-render";
import type { DiscoveredTheme } from "../theme";

const STYLESHEET_SENTINEL = '<link rel="stylesheet" href="../css/styles.css" />';

function makeTheme(pageHtml: string): DiscoveredTheme {
  return {
    manifest: { id: "sentinel-test", name: "Sentinel Test", version: "1.0.0", tier: "static", engine: 1 },
    dir: "/fake",
    tokens: { "--color": "red" },
    tokensLight: { "--color": "white" },
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: { index: pageHtml },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  };
}

test("a static page missing the token stylesheet sentinel emits an observable warning", () => {
  const source = "<!doctype html>\n<html><head></head><body>untokened</body></html>";
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    const rendered = renderStaticPage({ theme: makeTheme(source), pageId: "index" });
    assert.equal(rendered, source);
    assert.deepEqual(warnings, [
      [
        "[theme] static page 'sentinel-test/index' is missing the exact token stylesheet sentinel; design tokens were not injected",
      ],
    ]);
  } finally {
    console.warn = originalWarn;
  }
});

test("a static page carrying the sentinel retains the existing byte-for-byte render output", () => {
  const source = `<!doctype html>
<html>
<head>
${STYLESHEET_SENTINEL}
</head>
<body>tokened</body>
</html>`;

  assert.equal(
    renderStaticPage({ theme: makeTheme(source), pageId: "index" }),
    `<!doctype html>
<html>
<head>
<style>
:root {
  --color: red;
}
:root[data-theme="light"] {
  --color: white;
}
</style>
<link rel="stylesheet" href="/theme-assets/sentinel-test/css/styles.css" />
</head>
<body>tokened</body>
</html>`
  );
});
