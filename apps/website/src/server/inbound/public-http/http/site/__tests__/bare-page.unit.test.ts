import assert from "node:assert/strict";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import type { ResolveHtmlPageEmbedsResult } from "#src/features/widgets/resolver-service";
import { isFullHtmlDocument, renderBareEntryDocument } from "../bare-page.js";

/**
 * @file S3 (`no-template-bare-plan-2026-09-23.md`) — certifies `bare-page.ts`, the renderer for a
 * Page whose author picked "No template chosen" (`templateChoice === ""`). Two body shapes, two
 * outcomes: an `"html"`-format body that is already a full document passes through unchanged (apart
 * from embed resolution); everything else gets wrapped in a minimal document with no theme CSS/JS,
 * no `data-theme`, and no site-assistant — only the SEO/og head fold the caller already built.
 */

function fakePost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: "workspace-1",
    title: "Bare Page",
    slug: "bare-page",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Doc body renders." }] }] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "page",
    updatedAt: "2026-09-23T00:00:00.000Z",
    version: 1,
    ...overrides,
  } as unknown as PostRecord;
}

function htmlPage(overrides: Partial<PostRecord> = {}): PostRecord {
  return fakePost({ bodyFormat: "html", bodyHtml: "<p>hello</p>", ...overrides });
}

function widgetEmbeds(id: string, ir: { componentId: string; props: Record<string, unknown> }): ResolveHtmlPageEmbedsResult {
  return new Map([["widget", new Map([[id, ir]])]]) as unknown as ResolveHtmlPageEmbedsResult;
}

// ---------------------------------------------------------------------------
// Fragment wrapping — no theme CSS/JS, no data-theme, no site header/footer/assistant
// ---------------------------------------------------------------------------

test("renderBareEntryDocument: a doc-format body is wrapped in exactly one doctype/charset/viewport/title, and the SEO extraHead is spliced in", () => {
  const post = fakePost();
  const html = renderBareEntryDocument({ post, siteTitle: "Acme", extraHead: '<meta name="description" content="seo"/>' });

  assert.equal((html.match(/<!doctype html>/gi) ?? []).length, 1);
  assert.equal((html.match(/<meta charset="utf-8"\/>/g) ?? []).length, 1);
  assert.equal((html.match(/<meta name="viewport"/g) ?? []).length, 1);
  assert.equal((html.match(/<title>/g) ?? []).length, 1, "exactly one <title>");
  assert.match(html, /<title>Bare Page — Acme<\/title>/);
  assert.match(html, /<meta name="description" content="seo"\/>/, "extraHead must be spliced into <head>");
});

test("renderBareEntryDocument: title text is HTML-escaped — a <script> in the title never reaches the output as a real tag", () => {
  const post = fakePost({ title: `<script>alert(1)</script>` });
  const html = renderBareEntryDocument({ post, siteTitle: "Acme" });

  assert.match(html, /<title>&lt;script&gt;alert\(1\)&lt;\/script&gt; — Acme<\/title>/);
  assert.doesNotMatch(html, /<title><script>/);
});

test("renderBareEntryDocument: when extraHead already carries its own <title> (the SEO fold's), this module does not add a second one", () => {
  const post = fakePost();
  const html = renderBareEntryDocument({
    post,
    siteTitle: "Acme",
    extraHead: "<title>SEO Title</title>",
  });

  assert.equal((html.match(/<title>/g) ?? []).length, 1, "only the extraHead's <title> must survive");
  assert.match(html, /<title>SEO Title<\/title>/);
});

test("renderBareEntryDocument: no theme CSS/JS, no data-theme, no site header/footer, no site-assistant widget", () => {
  const post = fakePost();
  const html = renderBareEntryDocument({ post, siteTitle: "Acme" });

  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /<link[^>]*rel="stylesheet"/i);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /data-theme/);
  assert.doesNotMatch(html, /site-header/);
  assert.doesNotMatch(html, /site-footer/);
  assert.doesNotMatch(html, /site-assistant/);
  assert.doesNotMatch(html, /class="site"/);
});

// ---------------------------------------------------------------------------
// Full-document passthrough
// ---------------------------------------------------------------------------

test("isFullHtmlDocument: recognizes a plain doctype, an <html> tag, a leading HTML comment, a leading BOM, and an uppercase DOCTYPE", () => {
  assert.equal(isFullHtmlDocument("<!doctype html><html><body>x</body></html>"), true);
  assert.equal(isFullHtmlDocument("<html><body>x</body></html>"), true);
  assert.equal(isFullHtmlDocument("<!-- authored by me --><!doctype html><html></html>"), true);
  assert.equal(isFullHtmlDocument("﻿<!doctype html><html></html>"), true);
  assert.equal(isFullHtmlDocument("<!DOCTYPE HTML><HTML></HTML>"), true);
  assert.equal(isFullHtmlDocument("   \n  <!doctype html><html></html>"), true);
});

test("isFullHtmlDocument: an ordinary fragment that merely mentions doctype/html in prose is NOT a full document", () => {
  assert.equal(isFullHtmlDocument("<p>Read about &lt;!doctype html&gt; sometime.</p>"), false);
  assert.equal(isFullHtmlDocument("<div>hello</div>"), false);
  assert.equal(isFullHtmlDocument(""), false);
});

test("renderBareEntryDocument: a full-document 'html'-format body is served through unchanged — no SEO fold, no wrapping, no injected <title>", () => {
  const full = '<!doctype html><html lang="en"><head><title>Author Title</title></head><body><p>hi</p></body></html>';
  const post = htmlPage({ bodyHtml: full });
  const html = renderBareEntryDocument({ post, siteTitle: "Acme", extraHead: '<meta name="description" content="seo"/>' });

  assert.equal(html, full, "output must equal the raw authored document byte-for-byte when there are no embeds");
  assert.doesNotMatch(html, /seo/, "the SEO fold must never be injected into an author-owned document");
});

test("renderBareEntryDocument: a full document with a leading comment and a BOM still passes through unchanged apart from embeds", () => {
  const full = '﻿<!-- exported from elsewhere -->\n<!doctype html><html><head><title>T</title></head><body><p>x</p></body></html>';
  const post = htmlPage({ bodyHtml: full });
  const html = renderBareEntryDocument({ post, siteTitle: "Acme" });

  assert.equal(html, full);
});

test("renderBareEntryDocument: an embed marker inside a full document still resolves, and nothing else about the document changes", () => {
  const full =
    '<!doctype html><html><head><title>T</title></head><body>' +
    `<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>` +
    "</body></html>";
  const post = htmlPage({ bodyHtml: full });
  const html = renderBareEntryDocument({
    post,
    siteTitle: "Acme",
    pageHtmlEmbeds: widgetEmbeds("widget-1", { componentId: "text", props: { body: "Embedded!" } }),
  });

  assert.match(html, /widget-text">Embedded!/);
  assert.equal((html.match(/<!doctype html>/gi) ?? []).length, 1, "the passthrough must not add a second doctype");
  assert.equal((html.match(/<title>/g) ?? []).length, 1, "the author's own <title> must be the only one");
});

// ---------------------------------------------------------------------------
// Fragment (non-full-document) embed resolution + doc-format body
// ---------------------------------------------------------------------------

test("renderBareEntryDocument: an embed marker in a fragment 'html'-format body resolves before wrapping", () => {
  const post = htmlPage({ bodyHtml: `<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>` });
  const html = renderBareEntryDocument({
    post,
    siteTitle: "Acme",
    pageHtmlEmbeds: widgetEmbeds("widget-1", { componentId: "text", props: { body: "Embedded!" } }),
  });

  assert.match(html, /widget-text">Embedded!/);
  assert.equal((html.match(/<!doctype html>/gi) ?? []).length, 1, "a fragment still gets wrapped in exactly one document");
});

test("renderBareEntryDocument: a doc-format body renders through renderDocNode's ordinary node walk", () => {
  const post = fakePost({
    bodyFormat: "doc",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Doc body renders." }] }] },
  });
  const html = renderBareEntryDocument({ post, siteTitle: "Acme" });

  assert.match(html, /<p>Doc body renders\.<\/p>/);
});
