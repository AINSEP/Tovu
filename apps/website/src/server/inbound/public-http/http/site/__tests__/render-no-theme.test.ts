import assert from "node:assert/strict";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { renderSite } from "../render.js";

/**
 * @file Certifies what `renderSite` produces when there is DELIBERATELY no theme — state 3 of the
 * optional-theme feature, where the operator has switched the theme off to handle styling
 * themselves.
 *
 * The framing rule this whole file exists to enforce: `fallbackSiteBody` and its helpers were
 * written as a safety net nobody would see, reached only when a theme was broken or missing a
 * template. State 3 promotes that exact path to the PRIMARY output for an entire class of site — an
 * operator ships it as their public website. So every string, link and attribute on it has to be
 * re-read against "an operator is shipping this", not against "this only appears when a theme is
 * broken". Anything that was merely good enough to be invisible is now a defect.
 *
 * These assertions are deliberately about the SHAPE an operator writes CSS against (every styling
 * hook present, no empty attributes, no placeholder text), not about exact markup — the latter would
 * just be a change-detector.
 */

const POST: PostRecord = {
  id: "post-1",
  workspaceId: "workspace-local",
  title: "Welcome to Tovu",
  slug: "welcome",
  bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello." }] }] },
  bodyFormat: "doc",
  bodyHtml: null,
  status: "published",
  createdAt: "2026-04-06T00:00:00.000Z",
  updatedAt: "2026-04-06T00:00:00.000Z",
  version: 1,
} as unknown as PostRecord;

async function renderThemeless(route: "home" | "post" | "products" | "product"): Promise<string> {
  return renderSite({
    theme: null,
    route,
    siteTitle: "Acme",
    posts: [POST],
    ...(route === "post" ? { post: POST } : {}),
    ...(route === "product"
      ? { product: { id: "p1", title: "Thing", priceFormatted: "$1.00" } as never, products: [] }
      : {}),
  });
}

test("a themeless render is still a complete, valid document — not an error and not a blank body", async () => {
  const html = await renderThemeless("home");

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta charset="utf-8"\/>/);
  assert.match(html, /<\/html>\s*$/);
  assert.match(html, /Welcome to Tovu/, "content must still render; only the styling is gone");
});

test("every styling hook an operator would write CSS against is present", async () => {
  const html = await renderThemeless("home");

  for (const hook of ["site", "site-header", "wordmark", "site-nav", "wrap", "entry-list", "entry", "entry-title", "entry-meta", "site-footer"]) {
    assert.match(html, new RegExp(`class="[^"]*\\b${hook}\\b`), `missing styling hook: .${hook}`);
  }
});

test("no theme means NO `data-theme` attribute at all, not an empty one", async () => {
  const html = await renderThemeless("home");

  // `data-theme=""` is a selector someone matches by accident (`[data-theme]` is truthy for it), and
  // an operator styling `[data-theme="basic"]` vs `:not([data-theme])` gets a silently wrong answer.
  assert.doesNotMatch(html, /data-theme=""/);
  assert.doesNotMatch(html, /data-theme=/);
  assert.match(html, /<div class="site">/, "the element itself must survive; only the attribute goes");
});

test("no theme means no theme badge — not `theme: ` with nothing after it", async () => {
  const html = await renderThemeless("home");

  assert.doesNotMatch(html, /theme-badge/);
  assert.doesNotMatch(html, /theme:\s*<\/span>/);
  assert.match(html, /site-footer/, "the footer itself must survive; only the badge goes");
});

test("the themeless shell emits no theme CSS and no theme font link, but keeps Tovu's own base style", async () => {
  const html = await renderThemeless("home");

  assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  assert.doesNotMatch(html, /:root \{/, "token CSS belongs to the theme and must not be synthesised");
  assert.match(html, /box-sizing: border-box/, "BASE_STYLE is Tovu's, not the theme's — it stays");
});

test("every route renders themelessly, not just home — posts, products and product detail too", async () => {
  for (const route of ["home", "post", "products", "product"] as const) {
    const html = await renderThemeless(route);
    assert.match(html, /^<!doctype html>/, `${route} must still produce a document`);
    assert.match(html, /<footer class="site-footer">/, `${route} must still produce a footer`);
    assert.doesNotMatch(html, /data-theme=/, `${route} must not emit data-theme`);
  }
});

test("the post route's themeless body carries the post, not just chrome", async () => {
  const html = await renderThemeless("post");
  assert.match(html, /Welcome to Tovu/);
  assert.match(html, /Hello\./, "the post body must render — embeds and prose read no theme");
});
