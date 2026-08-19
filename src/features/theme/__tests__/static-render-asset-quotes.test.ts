import assert from "node:assert/strict";
import test from "node:test";

import { renderStaticPage } from "../static-render.js";
import type { DiscoveredTheme } from "../theme.js";

/**
 * @file `rewriteAssetPaths` (`static-render.ts`) hardcoded a double-quote in its `href="../css/"` /
 * `src="../js/"` regexes — a theme page authored with single-quoted attributes (valid HTML, and what
 * several formatters/template engines emit) silently kept its `../css/`/`../js/` reference, which then
 * 404s in the browser because it's only correct relative to the theme's `pages/` folder on disk.
 *
 * Same silent-failure class as the missing-token-sentinel bug fixed in `a8c0cd6` (see
 * `static-render-token-sentinel.test.ts`): this file certifies both the quote-preserving fix AND that
 * an asset reference this function still can't rewrite (unquoted, whitespace around `=`) is reported
 * loudly rather than silently 404ing.
 */

function makeTheme(pageHtml: string): DiscoveredTheme {
  return {
    manifest: { id: "quote-test", name: "Quote Test", version: "1.0.0", tier: "static", engine: 1 },
    dir: "/fake",
    tokens: {},
    tokensLight: {},
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

test("a single-quoted css href is rewritten to the served theme-assets route, preserving the single quote", () => {
  const source = `<!doctype html><html><head><link rel="stylesheet" href='../css/app.css' /></head><body></body></html>`;
  const rendered = renderStaticPage({ theme: makeTheme(source), pageId: "index" });
  assert.ok(
    rendered?.includes(`href='/theme-assets/quote-test/css/app.css'`),
    `expected the single-quoted href to be rewritten with quotes preserved, got: ${rendered}`
  );
});

test("a single-quoted js src is rewritten to the served theme-assets route, preserving the single quote", () => {
  const source = `<!doctype html><html><body><script src='../js/app.js'></script></body></html>`;
  const rendered = renderStaticPage({ theme: makeTheme(source), pageId: "index" });
  assert.ok(
    rendered?.includes(`src='/theme-assets/quote-test/js/app.js'`),
    `expected the single-quoted src to be rewritten with quotes preserved, got: ${rendered}`
  );
});

test("a double-quoted css href and js src still rewrite exactly as before (no regression)", () => {
  const source = `<!doctype html><html><head><link rel="stylesheet" href="../css/app.css" /></head><body><script src="../js/app.js"></script></body></html>`;
  const rendered = renderStaticPage({ theme: makeTheme(source), pageId: "index" });
  assert.ok(rendered?.includes(`href="/theme-assets/quote-test/css/app.css"`));
  assert.ok(rendered?.includes(`src="/theme-assets/quote-test/js/app.js"`));
});

test("an unquoted asset href is left unrewritten (deliberate no) but reported as an observable warning", () => {
  const source = `<!doctype html><html><head><link rel="stylesheet" href=../css/app.css /></head><body></body></html>`;
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    const rendered = renderStaticPage({ theme: makeTheme(source), pageId: "index" });
    assert.ok(
      rendered?.includes("href=../css/app.css"),
      "left exactly as authored — unquoted attribute values are a deliberate no, see rewriteAssetPaths' own doc"
    );
    assert.ok(
      warnings.some(
        (w) => typeof w[0] === "string" && w[0].includes("unrewritten") && w[0].includes("quote-test/index")
      ),
      `expected an unrewritten-asset-path warning naming the theme/page, got: ${JSON.stringify(warnings)}`
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("whitespace around = on a quoted asset href is left unrewritten (deliberate no) but reported", () => {
  const source = `<!doctype html><html><body><script src = "../js/app.js"></script></body></html>`;
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    const rendered = renderStaticPage({ theme: makeTheme(source), pageId: "index" });
    assert.ok(rendered?.includes(`src = "../js/app.js"`));
    assert.ok(
      warnings.some(
        (w) => typeof w[0] === "string" && w[0].includes("unrewritten") && w[0].includes("quote-test/index")
      ),
      `expected an unrewritten-asset-path warning naming the theme/page, got: ${JSON.stringify(warnings)}`
    );
  } finally {
    console.warn = originalWarn;
  }
});
