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
  /** Overridden per warn test: the one-time miss diagnostic dedupes on its own message text (which
   *  embeds the theme id), so two tests sharing an id would silence the second one's warning. */
  id?: string;
}

function makeTheme(options: ThemeOptions = {}): DiscoveredTheme {
  return {
    manifest: {
      id: options.id ?? "page-shell-fallback-test",
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

test("a static-tier html Page resolves the theme's own page-shell.html (legacy name, no pages-default.html present)", () => {
  assert.equal(
    resolveStaticTierPageShellFallback({ theme: makeTheme(), post: { kind: "page", bodyFormat: "html" } }),
    "page-shell.html"
  );
});

// 2026-09-03 posts-*/pages-* rename: `basic` renamed `page-shell.html` -> `pages-default.html`;
// `basic-2` still ships the legacy name. Both must keep resolving, new name preferred.
test("prefers the new pages-default.html over the legacy page-shell.html when a theme ships both", () => {
  const theme = makeTheme({
    pages: {
      "pages-default": PAGE_SHELL_HTML,
      "page-shell": "<html><body><main>legacy copy, must not be picked when the new one exists</main></body></html>",
    },
  });
  assert.equal(
    resolveStaticTierPageShellFallback({ theme, post: { kind: "page", bodyFormat: "html" } }),
    "pages-default.html"
  );
});

test("a theme shipping only the renamed pages-default.html (the live basic theme's shape) resolves it", () => {
  const theme = makeTheme({ pages: { "pages-default": PAGE_SHELL_HTML } });
  assert.equal(
    resolveStaticTierPageShellFallback({ theme, post: { kind: "page", bodyFormat: "html" } }),
    "pages-default.html"
  );
});

test("falls back to the legacy page-shell.html when the new pages-default.html is absent (basic-2's shape today)", () => {
  const theme = makeTheme({ pages: { "page-shell": PAGE_SHELL_HTML } });
  assert.equal(
    resolveStaticTierPageShellFallback({ theme, post: { kind: "page", bodyFormat: "html" } }),
    "page-shell.html"
  );
});

test("a slotless pages-default.html loses to a usable legacy page-shell.html later in the candidate order", () => {
  const theme = makeTheme({
    pages: {
      "pages-default": "<html><body><main>no slot here</main></body></html>",
      "page-shell": PAGE_SHELL_HTML,
    },
  });
  assert.equal(
    resolveStaticTierPageShellFallback({ theme, post: { kind: "page", bodyFormat: "html" } }),
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

/** Runs `fn` with `console.warn` captured, returning every warning it emitted. Same capture shape
 *  `static-render-token-sentinel.test.ts` uses for this module's other `[theme]` warnings. */
function capturingWarnings(fn: () => void): unknown[][] {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    fn();
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

test("a static theme with no page-shell.html warns, so the silent no-op is observable", () => {
  // Without this the miss is invisible: the caller just renders Tovu's generic chrome and returns
  // HTTP 200, so switching the active theme to a tailark theme reopens ed1dd2e9's bug with no log,
  // no error, and no test signal anywhere.
  const theme = makeTheme({ id: "warn-no-shell", pages: { index: PAGE_SHELL_HTML } });

  const warnings = capturingWarnings(() => {
    resolveStaticTierPageShellFallback({ theme, post: { kind: "page", bodyFormat: "html" } });
  });

  assert.deepEqual(warnings, [
    [
      "[theme] static theme 'warn-no-shell' ships none of 'pages-default.html', 'page-shell.html'; untemplated html Pages render in Tovu's generic chrome instead of this theme's own document",
    ],
  ]);
});

test("a page-shell.html with no content slot warns with its own distinct reason", () => {
  const theme = makeTheme({ id: "warn-no-slot", pages: { "page-shell": "<html><body>no slot</body></html>" } });

  const warnings = capturingWarnings(() => {
    resolveStaticTierPageShellFallback({ theme, post: { kind: "page", bodyFormat: "html" } });
  });

  assert.deepEqual(warnings, [
    [
      `[theme] static theme 'warn-no-slot' ships a 'page-shell.html' with no {"type":"content"} slot; untemplated html Pages render in Tovu's generic chrome instead of this theme's own document`,
    ],
  ]);
});

test("the miss warning fires ONCE per theme, not once per request", () => {
  // This path runs on every request to every untemplated html Page, so an unbounded warn would
  // bury its own signal.
  const theme = makeTheme({ id: "warn-once", pages: {} });

  const warnings = capturingWarnings(() => {
    for (let i = 0; i < 3; i += 1) {
      resolveStaticTierPageShellFallback({ theme, post: { kind: "page", bodyFormat: "html" } });
    }
  });

  assert.equal(warnings.length, 1, "three resolutions of the same missing shell must warn exactly once");
});

test("a resolvable page shell, and every arm that never consults the shell at all, warn nothing", () => {
  const warnings = capturingWarnings(() => {
    resolveStaticTierPageShellFallback({ theme: makeTheme({ id: "warn-none-ok" }), post: { kind: "page", bodyFormat: "html" } });
    resolveStaticTierPageShellFallback({ theme: makeTheme({ id: "warn-none-post" }), post: { kind: "post", bodyFormat: "doc" } });
    resolveStaticTierPageShellFallback({ theme: makeTheme({ id: "warn-none-doc" }), post: { kind: "page", bodyFormat: "doc" } });
    resolveStaticTierPageShellFallback({
      theme: makeTheme({ id: "warn-none-tier", tier: "declarative", pages: {} }),
      post: { kind: "page", bodyFormat: "html" },
    });
  });

  assert.deepEqual(warnings, [], "a non-static tier, a Post, a doc Page, and a successful resolve are all silent");
});
