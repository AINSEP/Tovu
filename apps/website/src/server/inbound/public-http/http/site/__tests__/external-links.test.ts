import assert from "node:assert/strict";
import test from "node:test";

import { markOffSiteLinksOpenInNewTab } from "../external-links.js";

/**
 * @file Owner rule (2026-09-24): every off-site `<a href>` a public page renders should open in a
 * new tab with `rel="noopener noreferrer"`, generically, without any theme author having to add
 * `target="_blank"` to each link by hand. Certifies {@link markOffSiteLinksOpenInNewTab} against the
 * exact cases the rule names: off-site, same-site relative, same-host absolute, an existing `rel`,
 * an existing `target`, `mailto:`/`tel:`, and bare `#anchor` hrefs.
 */

const SITE_HOST = "tovu.example";

test("off-site absolute http(s) link gets target=_blank and rel=noopener noreferrer", () => {
  const html = `<a href="https://agent-plugins.org/specification">Spec</a>`;
  const result = markOffSiteLinksOpenInNewTab(html, SITE_HOST);
  assert.equal(result, `<a href="https://agent-plugins.org/specification" rel="noopener noreferrer" target="_blank">Spec</a>`);
});

test("plain http off-site link is rewritten the same as https", () => {
  const html = `<a href="http://other-host.example/page">Other</a>`;
  const result = markOffSiteLinksOpenInNewTab(html, SITE_HOST);
  assert.match(result, /target="_blank"/);
  assert.match(result, /rel="noopener noreferrer"/);
});

test("same-site relative link is left byte-identical", () => {
  const cases = [`<a href="pricing.html">Pricing</a>`, `<a href="/blog">Blog</a>`, `<a href="../docs/intro">Intro</a>`];
  for (const html of cases) {
    assert.equal(markOffSiteLinksOpenInNewTab(html, SITE_HOST), html, html);
  }
});

test("absolute link to the site's own host is left byte-identical", () => {
  const html = `<a href="https://tovu.example/about">About</a>`;
  assert.equal(markOffSiteLinksOpenInNewTab(html, SITE_HOST), html);
});

test("absolute link to the site's own host under a www. prefix mismatch is still same-site", () => {
  const html = `<a href="https://www.tovu.example/about">About</a>`;
  assert.equal(markOffSiteLinksOpenInNewTab(html, SITE_HOST), html);
  const reverse = `<a href="https://tovu.example/about">About</a>`;
  assert.equal(markOffSiteLinksOpenInNewTab(reverse, "www.tovu.example"), reverse);
});

test("off-site link with an existing rel merges noopener/noreferrer instead of overwriting", () => {
  const html = `<a href="https://other.example/x" rel="nofollow">X</a>`;
  const result = markOffSiteLinksOpenInNewTab(html, SITE_HOST);
  assert.equal(result, `<a href="https://other.example/x" rel="nofollow noopener noreferrer" target="_blank">X</a>`);
});

test("off-site link that already carries noopener in rel is not duplicated", () => {
  const html = `<a href="https://other.example/x" rel="noopener">X</a>`;
  const result = markOffSiteLinksOpenInNewTab(html, SITE_HOST);
  assert.equal(result, `<a href="https://other.example/x" rel="noopener noreferrer" target="_blank">X</a>`);
});

test("off-site link with an explicit target is never overridden, but rel is still merged", () => {
  const html = `<a href="https://other.example/x" target="_self">X</a>`;
  const result = markOffSiteLinksOpenInNewTab(html, SITE_HOST);
  assert.equal(result, `<a href="https://other.example/x" target="_self" rel="noopener noreferrer">X</a>`);
  assert.doesNotMatch(result, /target="_blank"/);
});

test("off-site link already authored with target=_blank keeps it and still gets rel merged", () => {
  const html = `<a href="https://other.example/x" target="_blank">X</a>`;
  const result = markOffSiteLinksOpenInNewTab(html, SITE_HOST);
  assert.equal(result, `<a href="https://other.example/x" target="_blank" rel="noopener noreferrer">X</a>`);
});

test("mailto: and tel: links are left byte-identical", () => {
  const mailto = `<a href="mailto:hello@example.com">Email</a>`;
  const tel = `<a href="tel:+15551234567">Call</a>`;
  assert.equal(markOffSiteLinksOpenInNewTab(mailto, SITE_HOST), mailto);
  assert.equal(markOffSiteLinksOpenInNewTab(tel, SITE_HOST), tel);
});

test("bare #anchor hrefs are left byte-identical", () => {
  const html = `<a href="#pricing">Jump to pricing</a>`;
  assert.equal(markOffSiteLinksOpenInNewTab(html, SITE_HOST), html);
});

test("a page mixing off-site, same-site, and anchor links only rewrites the off-site one", () => {
  const html = [
    `<a href="/pricing">Pricing</a>`,
    `<a href="https://agent-plugins.org/specification">Spec</a>`,
    `<a href="#top">Top</a>`,
    `<a href="mailto:hi@tovu.example">Contact</a>`,
  ].join("");
  const result = markOffSiteLinksOpenInNewTab(html, SITE_HOST);
  assert.match(result, /<a href="\/pricing">Pricing<\/a>/);
  assert.match(result, /<a href="https:\/\/agent-plugins\.org\/specification" rel="noopener noreferrer" target="_blank">Spec<\/a>/);
  assert.match(result, /<a href="#top">Top<\/a>/);
  assert.match(result, /<a href="mailto:hi@tovu\.example">Contact<\/a>/);
});

test("an <a> tag with no href at all is left untouched", () => {
  const html = `<a name="anchor-target">Named anchor</a>`;
  assert.equal(markOffSiteLinksOpenInNewTab(html, SITE_HOST), html);
});

test("a malformed absolute-looking href is left untouched rather than guessed at", () => {
  const html = `<a href="https://">Broken</a>`;
  assert.equal(markOffSiteLinksOpenInNewTab(html, SITE_HOST), html);
});

test("an attribute that merely ends in 'href' (e.g. an authored data-href) is not mistaken for href", () => {
  const html = `<a data-href="https://other.example/x">No real href</a>`;
  assert.equal(markOffSiteLinksOpenInNewTab(html, SITE_HOST), html);
});
