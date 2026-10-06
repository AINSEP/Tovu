import assert from "node:assert/strict";
import test from "node:test";

import { renderSite } from "#src/server/inbound/public-http/http/site/render";

import { renderStaticPage } from "../static-render.js";
import type { DiscoveredTheme, ThemeTokens } from "../theme.js";
import { themeTokenAliasDeclarations } from "../token-aliases.js";

/**
 * Regression (demo video V1, 2026-10-05): an assistant-written HTML page styled its heading with
 * `color: var(--text, #1f1f1f)`. No theme defines `--text` (they say `--fg` or `--ink`), so the
 * light-mode fallback won on the dark theme — a dark-gray "Let's talk" on a near-black page. The
 * token emitters now alias the commonly guessed names onto the theme's own tokens.
 */

const STYLESHEET_SENTINEL = '<link rel="stylesheet" href="../css/styles.css" />';

function staticTheme(tokens: ThemeTokens, tokensLight: ThemeTokens): DiscoveredTheme {
  return {
    manifest: { id: "alias-test", name: "Alias Test", version: "1.0.0", tier: "static", engine: 1 },
    dir: "/fake",
    tokens,
    tokensLight,
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: { index: `<head>\n${STYLESHEET_SENTINEL}\n</head>` },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  };
}

test("static tier: a guessed --text/--text-strong/--surface-muted/--font-heading resolves to the theme's own token, declared once on :root so the light override of --fg carries through", () => {
  const html = renderStaticPage({
    theme: staticTheme(
      { "--fg": "white", "--muted": "gray", "--surface": "black", "--surface-2": "#111", "--font-display": "Geist" },
      { "--fg": "black" }
    ),
    pageId: "index",
  });
  assert.equal(
    html,
    `<head>
<style>
:root {
  --fg: white;
  --muted: gray;
  --surface: black;
  --surface-2: #111;
  --font-display: Geist;
  --text: var(--fg);
  --text-strong: var(--fg);
  --text-color: var(--fg);
  --color-text: var(--fg);
  --foreground: var(--fg);
  --heading-color: var(--fg);
  --text-muted: var(--muted);
  --text-secondary: var(--muted);
  --surface-muted: var(--surface-2);
  --font-heading: var(--font-display);
}
:root[data-theme="light"] {
  --fg: black;
}
</style>
<link rel="stylesheet" href="/theme-assets/alias-test/css/styles.css" />
</head>`
  );
});

test("an alias the theme defines itself is never overridden, and an --ink theme aliases onto --ink", () => {
  assert.deepEqual(themeTokenAliasDeclarations({ tokens: { "--ink": "#111", "--text": "red", "--surface": "#fff" } }), [
    ["--text-strong", "var(--ink)"],
    ["--text-color", "var(--ink)"],
    ["--color-text", "var(--ink)"],
    ["--foreground", "var(--ink)"],
    ["--heading-color", "var(--ink)"],
    ["--surface-muted", "var(--surface)"],
  ]);
});

test("a name defined only in the light token set is still the theme's own and is not aliased", () => {
  assert.deepEqual(themeTokenAliasDeclarations({ tokens: { "--fg": "#fff" }, tokensLight: { "--text": "#000" } }), [
    ["--text-strong", "var(--fg)"],
    ["--text-color", "var(--fg)"],
    ["--color-text", "var(--fg)"],
    ["--foreground", "var(--fg)"],
    ["--heading-color", "var(--fg)"],
  ]);
});

test("a theme with none of the alias targets gets no aliases (no dangling var())", () => {
  assert.deepEqual(themeTokenAliasDeclarations({ tokens: { "--color": "red" } }), []);
});

test("declarative/templated tier: the :root token block carries the same aliases", async () => {
  const theme: DiscoveredTheme = {
    manifest: { id: "t", name: "T", version: "1.0.0", tier: "declarative", engine: 1 },
    tokens: { "--fg": "white", "--muted": "gray" },
    tokensLight: {},
    templates: { home: { type: "doc", content: [] }, entry: { type: "doc", content: [] } },
    pages: {},
    partials: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    dir: "/nonexistent/test-theme",
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  };
  const html = await renderSite({ theme, route: "home", siteTitle: "Alias Demo", posts: [] });
  assert.ok(
    html.includes(
      ":root { --fg: white; --muted: gray; --text: var(--fg); --text-strong: var(--fg); --text-color: var(--fg); " +
        "--color-text: var(--fg); --foreground: var(--fg); --heading-color: var(--fg); --text-muted: var(--muted); " +
        "--text-secondary: var(--muted); }"
    ),
    "declarative :root block must carry the aliases"
  );
});
