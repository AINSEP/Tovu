import assert from "node:assert/strict";
import test from "node:test";

import { renderStaticPage } from "../static-render.js";
import type { DiscoveredTheme } from "../theme.js";

/**
 * @file Regression coverage for the Milestone 3 Blocker A fix: `static-asset-contract.ts`'s
 * `tokenStylesheetSentinel`/`rewriteAssetPaths`/`findUnrewrittenAssetPaths` gained an `apiVersion`
 * branch so a v2-migrated theme's `css/theme.css` + `scripts/` shape resolves correctly at request
 * time, without changing anything about a v1 theme's `css/styles.css` + `js/` shape (every theme on
 * disk before this change, and every one not yet migrated). `static-render-token-sentinel.test.ts`
 * and `static-render-asset-quotes.test.ts` already pin the v1 (default, no `apiVersion` field) path
 * byte-for-byte; this file adds the v2 (`apiVersion: 2`) path those didn't exist to cover.
 */

function makeTheme(pageHtml: string, apiVersion?: 2): DiscoveredTheme {
  return {
    manifest: { id: "v2-test", name: "V2 Test", version: "1.0.0", tier: "static", engine: 1, apiVersion },
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

test("a v1 theme (no apiVersion) still matches the css/styles.css sentinel and rewrites ../js/ — unchanged default", () => {
  const source = `<!doctype html><html><head><link rel="stylesheet" href="../css/styles.css" /><script src="../js/main.js"></script></head><body></body></html>`;
  const rendered = renderStaticPage({ theme: makeTheme(source), pageId: "index" });
  assert.ok(rendered?.includes("<style>"), "v1 theme should still get token injection");
  assert.ok(rendered?.includes(`href="/theme-assets/v2-test/css/styles.css"`));
  assert.ok(rendered?.includes(`src="/theme-assets/v2-test/js/main.js"`));
});

test("a v2 theme (apiVersion: 2) matches the css/theme.css sentinel and injects tokens", () => {
  const source = `<!doctype html><html><head><link rel="stylesheet" href="../css/theme.css" /></head><body></body></html>`;
  const rendered = renderStaticPage({ theme: makeTheme(source, 2), pageId: "index" });
  assert.ok(rendered?.includes("<style>"), "v2 theme should get token injection against its own sentinel");
  assert.ok(rendered?.includes(`href="/theme-assets/v2-test/css/theme.css"`));
});

test("a v2 theme's ../css/styles.css (v1 filename) does NOT match the v2 sentinel — no silent cross-version match", () => {
  const source = `<!doctype html><html><head><link rel="stylesheet" href="../css/styles.css" /></head><body></body></html>`;
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    const rendered = renderStaticPage({ theme: makeTheme(source, 2), pageId: "index" });
    assert.ok(!rendered?.includes("<style>"), "the v1 filename must not satisfy the v2 sentinel check");
    assert.ok(
      warnings.some((w) => typeof w[0] === "string" && w[0].includes("missing the exact token stylesheet sentinel"))
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("a v2 theme rewrites ../scripts/ (not ../js/) asset references", () => {
  const source = `<!doctype html><html><body><script src="../scripts/main.js"></script></body></html>`;
  const rendered = renderStaticPage({ theme: makeTheme(source, 2), pageId: "index" });
  assert.ok(rendered?.includes(`src="/theme-assets/v2-test/scripts/main.js"`));
});

test("a v2 theme's leftover ../js/ reference is left unrewritten and reported — v2 themes don't use js/", () => {
  const source = `<!doctype html><html><body><script src="../js/legacy.js"></script></body></html>`;
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    const rendered = renderStaticPage({ theme: makeTheme(source, 2), pageId: "index" });
    assert.ok(rendered?.includes(`src="../js/legacy.js"`), "left exactly as authored, not silently rewritten");
    assert.ok(
      warnings.some(
        (w) => typeof w[0] === "string" && w[0].includes("unrewritten") && w[0].includes("../scripts/")
      ),
      `expected an unrewritten-asset-path warning naming ../scripts/ (the v2 pair), got: ${JSON.stringify(warnings)}`
    );
  } finally {
    console.warn = originalWarn;
  }
});
