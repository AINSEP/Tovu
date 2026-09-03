import assert from "node:assert/strict";
import test from "node:test";

import { resolveStaticTierPageShellFallback } from "../static-render.js";
import type { DiscoveredTheme, ThemeTier } from "../theme.js";

/**
 * @file Unit coverage for {@link resolveStaticTierPageShellFallback} — the 2026-09-02 fix that gives
 * an untemplated `html`-format Page a `static` theme's own document shell instead of Tovu's generic
 * `pageShell()` chrome.
 *
 * Until this file existed the function had NO unit test anywhere: `server/__tests__/routes/post-
 * template-site-serving.test.ts` covered it only through the HTTP boundary (and its own comment
 * deferred unit coverage to a `static-render.test.ts` that was never written). The HTTP tests prove
 * the WIRING; these prove the RESOLUTION RULE, including every arm that must return `undefined` —
 * the asymmetries that keep the `terms-of-service` regression closed (`isEligibleForTemplateBranch`'s
 * own doc records that bug: a Post-shaped template applied to a Page that never asked for one).
 *
 * Naming follows this directory's established `static-render-<topic>.test.ts` convention
 * (`static-render-token-sentinel`, `static-render-api-version`, `static-render-asset-quotes`).
 */

const CONTENT_SLOT = `<div data-embed-config='{"type":"content"}'></div>`;

/** A `page-shell.html` shaped like the real one `themes/static/basic` ships — a complete document
 *  whose one content slot is what the fallback's `markersOfType(html, "content")` check looks for. */
const PAGE_SHELL_HTML = `<html data-theme="dark"><body><main>${CONTENT_SLOT}</main></body></html>`;

interface ThemeOptions {
  tier?: ThemeTier;
  pages?: Record<string, string>;
}

function makeTheme(options: ThemeOptions = {}): DiscoveredTheme {
  return {
    manifest: {
      id: "page-shell-fallback-test",
      name: "Page Shell Fallback Test",
      version: "1.0.0",
      tier: options.tier ?? "static",
      engine: 1,
      // Deliberately present and non-empty: the fallback must NOT consult `templates` or its
      // ordering (that is exactly the "array position 0 carries no meaning" trap it exists to
      // avoid), so a theme listing an unrelated template must not change any answer below.
      templates: ["blog-post.html"],
    },
    dir: "/fake",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: options.pages ?? { "page-shell": PAGE_SHELL_HTML },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  };
}

test("a static-tier html Page resolves the theme's own page-shell.html", () => {
  assert.equal(
    resolveStaticTierPageShellFallback({ theme: makeTheme(), post: { kind: "page", bodyFormat: "html" } }),
    "page-shell.html"
  );
});

test("a static theme that does not ship page-shell.html resolves nothing", () => {
  // The live majority case: only 2 of the 5 static themes installed under `sites/tovu-com/themes/
  // static/` ship this file, so this arm — not the one above — is what a tailark theme hits.
  const theme = makeTheme({ pages: { index: PAGE_SHELL_HTML, about: PAGE_SHELL_HTML } });
  assert.equal(
    resolveStaticTierPageShellFallback({ theme, post: { kind: "page", bodyFormat: "html" } }),
    undefined
  );
});

test("a page-shell.html carrying no content slot resolves nothing", () => {
  // Same contract `resolveTemplate`'s own `resolveAgainstTheme` enforces: a shell with nowhere to
  // put the body is not a usable shell, and is indistinguishable from not having one.
  const theme = makeTheme({ pages: { "page-shell": "<html><body><main>no slot here</main></body></html>" } });
  assert.equal(
    resolveStaticTierPageShellFallback({ theme, post: { kind: "page", bodyFormat: "html" } }),
    undefined
  );
});

test("a doc-format Page resolves nothing — that arm keeps its own never-chosen handling", () => {
  // `isPageTemplateChoiceEligible` already owns the doc-format Page rule (an explicit
  // `templateChoice`, `""` included, is required); handing doc Pages a shell here would be a second
  // spelling of that decision.
  assert.equal(
    resolveStaticTierPageShellFallback({ theme: makeTheme(), post: { kind: "page", bodyFormat: "doc" } }),
    undefined
  );
});

test("a Post resolves nothing, in BOTH body formats — the asymmetry that keeps terms-of-service fixed", () => {
  for (const bodyFormat of ["doc", "html"] as const) {
    assert.equal(
      resolveStaticTierPageShellFallback({ theme: makeTheme(), post: { kind: "post", bodyFormat } }),
      undefined,
      `a ${bodyFormat}-format Post must never be handed the page shell`
    );
  }
});

test("a non-static tier resolves nothing even when a page keyed 'page-shell' exists", () => {
  // `pageShell()` IS the only shell the declarative/templated/handlebars tiers have, so the generic
  // path is genuinely correct for them and must stay untouched.
  for (const tier of ["declarative", "templated", "handlebars", "code"] as const) {
    assert.equal(
      resolveStaticTierPageShellFallback({ theme: makeTheme({ tier }), post: { kind: "page", bodyFormat: "html" } }),
      undefined,
      `tier '${tier}' must not resolve a static-tier page shell`
    );
  }
});
