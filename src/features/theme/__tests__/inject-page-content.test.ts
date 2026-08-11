import assert from "node:assert/strict";
import test from "node:test";

import { injectPageContent } from "../static-render";

/**
 * @file Certifies {@link injectPageContent} — the page-template counterpart to `injectPostEmbedId`.
 * Splices a Page's own body HTML into every `{"type":"content"}` marker in a chosen template,
 * BEFORE `resolveHtmlPageEmbeds` runs (Task 3, 2026-08-11: the `{"type":"content"}` marker the recon
 * flagged as never built).
 */

test("splices contentHtml inside a bare content marker, keeping the wrapping tag", () => {
  const template = '<main data-embed-config=\'{"type":"content"}\'></main>';
  const out = injectPageContent(template, "<h1>Hello</h1>");
  assert.equal(out, '<main data-embed-config=\'{"type":"content"}\'><h1>Hello</h1></main>');
});

test("preserves the marker element's own authored attributes (class, aria-label, ...)", () => {
  // The whole reason this uses withInnerContent rather than a whole-element replace: a real theme
  // author's styling hooks on the wrapper must survive.
  const template = '<main class="page-body" aria-label="Page content" data-embed-config=\'{"type":"content"}\'></main>';
  const out = injectPageContent(template, "<p>Body</p>");
  assert.ok(out.startsWith('<main class="page-body" aria-label="Page content" data-embed-config=\'{"type":"content"}\'>'));
  assert.ok(out.includes("<p>Body</p>"));
  assert.ok(out.endsWith("</main>"));
});

test("replaces authored fallback content inside the marker, not appends to it", () => {
  const template = '<div data-embed-config=\'{"type":"content"}\'>placeholder text</div>';
  const out = injectPageContent(template, "<p>Real body</p>");
  assert.ok(!out.includes("placeholder text"));
  assert.equal(out, '<div data-embed-config=\'{"type":"content"}\'><p>Real body</p></div>');
});

test("every content marker in the template receives the same contentHtml", () => {
  const template =
    '<header data-embed-config=\'{"type":"content"}\'></header>' +
    '<main data-embed-config=\'{"type":"content"}\'></main>';
  const out = injectPageContent(template, "<p>Shared</p>");
  const occurrences = out.split("<p>Shared</p>").length - 1;
  assert.equal(occurrences, 2);
});

test("leaves markers of every OTHER type untouched, for a later stage to resolve", () => {
  const template =
    '<nav data-embed-config=\'{"type":"menu","id":"main"}\'>fallback nav</nav>' +
    '<main data-embed-config=\'{"type":"content"}\'></main>' +
    '<div data-embed-config=\'{"type":"partial","id":"footer"}\'></div>';
  const out = injectPageContent(template, "<p>Body</p>");
  assert.ok(out.includes('<nav data-embed-config=\'{"type":"menu","id":"main"}\'>fallback nav</nav>'));
  assert.ok(out.includes('<div data-embed-config=\'{"type":"partial","id":"footer"}\'></div>'));
  assert.ok(out.includes("<p>Body</p>"));
});

test("REGRESSION GUARD: a template with no content marker is returned unchanged", () => {
  const template = "<html><body><p>No slot here</p></body></html>";
  assert.equal(injectPageContent(template, "<p>Never spliced</p>"), template);
});

test("an empty contentHtml (a genuinely empty Page body) still clears any authored fallback", () => {
  const template = '<main data-embed-config=\'{"type":"content"}\'>placeholder</main>';
  assert.equal(injectPageContent(template, ""), '<main data-embed-config=\'{"type":"content"}\'></main>');
});
