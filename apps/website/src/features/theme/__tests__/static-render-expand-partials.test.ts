import assert from "node:assert/strict";
import test from "node:test";

import { expandPartials, renderStaticPage } from "../static-render.js";
import type { DiscoveredTheme } from "../theme.js";

/**
 * @file Unit coverage for {@link expandPartials} (E2, 2026-09-23) — partial-slot expansion pulled
 * out of {@link renderStaticPage} into its own exported step so D2's `finishStaticTierDocument`
 * pipeline (`pages.ts`) can run it standalone, ahead of the widget/media/post/content stage, over
 * assembled HTML rather than only over a raw theme page.
 *
 * Also covers D3's wrapper rule for the `partial` marker type: a BARE partial marker still
 * disappears entirely (byte-identical to the pre-2026-09-23 behavior — a survey found every shipped
 * partial marker is bare), but a marker carrying any authored attribute besides `data-embed-config`
 * keeps its element (minus the marker config) around the resolved partial, matching the existing
 * `widget` rule ({@link withElementKeptIfAttributed}, `marker.ts`).
 */

function makeTheme(overrides: Partial<DiscoveredTheme> = {}): DiscoveredTheme {
  return {
    manifest: {
      id: "expand-partials-test",
      name: "Expand Partials Test",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      slots: { nav: { source: "nav.html" } },
    },
    dir: "/fake",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {},
    partials: { nav: "<nav>Main Nav</nav>" },
    css: "",
    source: "site",
    status: "valid",
    errors: [],
    ...overrides,
  };
}

test("expandPartials replaces a bare partial marker with the partial (marker element itself disappears)", () => {
  const theme = makeTheme();
  const html = `<html><body><div data-embed-config='{"type":"partial","id":"nav"}'></div></body></html>`;
  assert.equal(expandPartials(html, theme), "<html><body><nav>Main Nav</nav></body></html>");
});

test("expandPartials keeps an attributed partial marker's wrapper element around the partial, with data-embed-config stripped", () => {
  const theme = makeTheme();
  const html = `<html><body><div class="x" id="y" data-embed-config='{"type":"partial","id":"nav"}'></div></body></html>`;
  assert.equal(
    expandPartials(html, theme),
    `<html><body><div class="x" id="y"><nav>Main Nav</nav></div></body></html>`
  );
});

test("renderStaticPage over already-expanded HTML is byte-identical to over raw HTML (idempotent)", () => {
  const theme = makeTheme();
  const rawHtml = `<html><body><div data-embed-config='{"type":"partial","id":"nav"}'></div></body></html>`;
  const alreadyExpanded = expandPartials(rawHtml, theme);

  const fromRaw = renderStaticPage({ theme, pageId: "index", htmlOverride: rawHtml });
  const fromExpanded = renderStaticPage({ theme, pageId: "index", htmlOverride: alreadyExpanded });

  assert.equal(fromRaw, fromExpanded);
});
