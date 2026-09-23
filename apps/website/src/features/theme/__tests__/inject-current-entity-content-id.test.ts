import assert from "node:assert/strict";
import test from "node:test";

import { injectCurrentEntityContentId } from "../static-render.js";

/**
 * @file Certifies {@link injectCurrentEntityContentId} — the unified-marker (2026-08-11) replacement
 * for both the retired `injectPostEmbedId` (`{{post}}` literal substitution) and the original
 * `injectPageContent` (direct body-HTML splice).
 *
 * `injectPageContent`'s old contract — "splice a Page's own bodyHtml into the marker's INNER
 * content, preserving the wrapper" — no longer applies: the unified marker fills in an `id`, not a
 * content string, and the actual entity/content resolution happens later (`resolveContentTypeEmbeds`
 * for `"doc"`-format targets, `pages.ts`'s `resolveHtmlFormatContentMarkers` for `"html"`-format
 * ones). This function's OWN job is narrower and purely syntactic: fill a missing `id` into a bare
 * `{"type":"content"}` marker, and leave everything else — including an already-id-carrying marker —
 * completely alone.
 */

test("fills the current entity's id into a bare content marker, preserving the wrapper tag/attrs", () => {
  const template = '<main data-embed-config=\'{"type":"content"}\'></main>';
  const out = injectCurrentEntityContentId(template, "post-123");
  assert.equal(out, '<main data-embed-config=\'{"type":"content","id":"post-123"}\'></main>');
});

test("preserves the marker element's own authored attributes and fallback content", () => {
  const template =
    '<main class="page-body" aria-label="Page content" data-embed-config=\'{"type":"content"}\'>placeholder</main>';
  const out = injectCurrentEntityContentId(template, "post-123");
  assert.ok(out.startsWith('<main class="page-body" aria-label="Page content" data-embed-config='));
  assert.ok(out.includes('"id":"post-123"'));
  assert.ok(out.includes("placeholder"), "authored fallback content is untouched — this function never resolves it");
  assert.ok(out.endsWith("</main>"));
});

test("every bare content marker in the template receives the same id", () => {
  const template =
    '<header data-embed-config=\'{"type":"content"}\'></header>' +
    '<main data-embed-config=\'{"type":"content"}\'></main>';
  const out = injectCurrentEntityContentId(template, "post-123");
  const occurrences = out.split('"id":"post-123"').length - 1;
  assert.equal(occurrences, 2);
});

test("leaves markers of every OTHER type untouched, for a later stage to resolve", () => {
  const template =
    '<nav data-embed-config=\'{"type":"menu","id":"main"}\'>fallback nav</nav>' +
    '<main data-embed-config=\'{"type":"content"}\'></main>' +
    '<div data-embed-config=\'{"type":"partial","id":"footer"}\'></div>';
  const out = injectCurrentEntityContentId(template, "post-123");
  assert.ok(out.includes('<nav data-embed-config=\'{"type":"menu","id":"main"}\'>fallback nav</nav>'));
  assert.ok(out.includes('<div data-embed-config=\'{"type":"partial","id":"footer"}\'></div>'));
  assert.ok(out.includes('"id":"post-123"'));
});

test("REGRESSION GUARD: a content marker that already carries an id is left completely untouched", () => {
  // The core contract: an author's explicit reference to some OTHER entity must never be overwritten
  // by the current entity's id — that would silently redirect an authored cross-reference.
  const template = '<div data-embed-config=\'{"type":"content","id":"other-entity"}\'></div>';
  assert.equal(injectCurrentEntityContentId(template, "post-123"), template);
});

test("REGRESSION GUARD: a template with no content marker is returned unchanged", () => {
  const template = "<html><body><p>No slot here</p></body></html>";
  assert.equal(injectCurrentEntityContentId(template, "post-123"), template);
});

test("a marker carrying extra config keys keeps them, alongside the added id", () => {
  const template = '<main data-embed-config=\'{"type":"content","variant":"card"}\'></main>';
  const out = injectCurrentEntityContentId(template, "post-123");
  assert.ok(out.includes('"variant":"card"'));
  assert.ok(out.includes('"id":"post-123"'));
});

// S3 (2026-09-23 widget-attrs plan) — the silent-wrong-entity trap this function's own doc names: a
// slug-only marker means "this OTHER entity, addressed by slug", not "no id yet". Filling in the
// CURRENT entity's id here would silently redirect it to the current page/post instead of the one the
// author named, exactly the hazard the pre-existing id-carrying-marker guard above already exists to
// avoid — this is that same guard's slug-shaped twin.
test("REGRESSION GUARD: a slug-only content marker is left completely untouched — it names another entity, not an empty slot", () => {
  const template = '<div data-embed-config=\'{"type":"content","slug":"some-other-entity"}\'></div>';
  assert.equal(injectCurrentEntityContentId(template, "post-123"), template);
});
