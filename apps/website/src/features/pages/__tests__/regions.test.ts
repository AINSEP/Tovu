import assert from "node:assert/strict";
import test from "node:test";

import {
  locateRegion,
  regionHandlesIn,
  replaceRegionInner,
  scanPageMarkup,
  suggestRegionHandle,
  untaggedTopLevelSections,
} from "../regions.js";

/**
 * @file The region scanner's own branches, exercised directly rather than only through the tool.
 *
 * Worth its own file because the scanner is where a quiet, off-target write would come from. Every
 * case below is markup a model plausibly emits, and each one defeats the regex approach
 * `core/embeds/marker.ts` uses for its own (differently-shaped) job: a nested same-tag element, a
 * `>` inside a quoted attribute, an implicitly-closed `<p>`, a handle written inside a `<style>`
 * block. A splice that lands one byte off in any of these corrupts a live page silently.
 */

test("a nested same-tag element does not end the region early — the whole subtree is the region", () => {
  const html = `<section data-agent-element="outer"><section><p>in</p></section><p>tail</p></section>`;
  const found = locateRegion(html, "outer");
  assert.ok("region" in found);
  assert.equal(replaceRegionInner(html, found.region, "X"), `<section data-agent-element="outer">X</section>`);
});

test("a '>' inside a quoted attribute value does not terminate the open tag", () => {
  const html = `<section data-agent-element="hero" title="a > b"><p>body</p></section>`;
  assert.deepEqual(regionHandlesIn(html), ["hero"]);
  const found = locateRegion(html, "hero");
  assert.ok("region" in found);
  assert.equal(replaceRegionInner(html, found.region, "X"), `<section data-agent-element="hero" title="a > b">X</section>`);
});

test("a single-quoted handle attribute is read the same as a double-quoted one", () => {
  assert.deepEqual(regionHandlesIn(`<section data-agent-element='hero'><p>x</p></section>`), ["hero"]);
});

test("a region-shaped string inside a <style> block is not a region — CSS is not markup", () => {
  // Distinguishing on purpose: the scanner does not track quotes in TEXT, only inside a tag, so
  // without the raw-text mask this `<section ...>` inside a CSS string parses as a real open tag and
  // contributes a phantom handle the model could then address. A weaker fixture (a handle inside a
  // /* CSS comment */) passes with or without the mask and proves nothing.
  const html =
    `<section data-agent-element="real"><p>r</p></section>` +
    `<style>.a::after{content:'<section data-agent-element="ghost">'}</style>`;
  assert.deepEqual(regionHandlesIn(html), ["real"]);
});

test("a region-shaped string inside a <script> block is not a region either", () => {
  const html =
    `<section data-agent-element="real"><p>r</p></section>` +
    `<script>var s = '<section data-agent-element="ghost">';</script>`;
  assert.deepEqual(regionHandlesIn(html), ["real"]);
});

test("a region inside an HTML comment is not a region", () => {
  const html = `<!-- <section data-agent-element="ghost"></section> --><section data-agent-element="real"><p>r</p></section>`;
  assert.deepEqual(regionHandlesIn(html), ["real"]);
});

test("a handle carried by two elements is ambiguous, and locateRegion refuses rather than taking the first", () => {
  const html = `<section data-agent-element="dup"><p>1</p></section><section data-agent-element="dup"><p>2</p></section>`;
  const found = locateRegion(html, "dup");
  assert.ok("problem" in found, "taking the first match would land an edit somewhere the caller did not mean");
  assert.deepEqual(found.problem, { kind: "ambiguous", count: 2 });
});

test("a void element at the top level does not swallow what follows it", () => {
  // Distinguishing case for void handling: if <img> were pushed onto the open-element stack, the
  // section after it would be scanned at depth 1 — reported as nested inside a region rather than as
  // a top-level one, which is what the tagging check keys off.
  const html = `<img data-agent-element="logo" src="/a.png"><section data-agent-element="hero"><p>x</p></section>`;
  const { regions, topLevel } = scanPageMarkup(html);
  assert.deepEqual(
    regions.map((region) => [region.handle, region.depth]),
    [
      ["logo", 0],
      ["hero", 0],
    ]
  );
  assert.deepEqual(topLevel.map((element) => element.tag), ["img", "section"]);
});

test("an implicitly-closed <p> does not steal the region's closing tag", () => {
  const html = `<section data-agent-element="a"><p>one<p>two</section><section data-agent-element="b"><p>x</p></section>`;
  const found = locateRegion(html, "a");
  assert.ok("region" in found);
  assert.equal(
    replaceRegionInner(html, found.region, "X"),
    `<section data-agent-element="a">X</section><section data-agent-element="b"><p>x</p></section>`
  );
});

test("a stray closing tag with nothing open to match is ignored rather than throwing", () => {
  const html = `</div><section data-agent-element="hero"><p>x</p></section>`;
  assert.deepEqual(regionHandlesIn(html), ["hero"]);
});

test("a doctype is skipped rather than parsed as an element", () => {
  assert.deepEqual(regionHandlesIn(`<!doctype html><section data-agent-element="hero"><p>x</p></section>`), ["hero"]);
});

test("a region that is never closed is reported but refused as a write target — there is no delimited span to replace", () => {
  const found = locateRegion(`<section data-agent-element="hero"><p>x</p>`, "hero");
  assert.ok("problem" in found);
  assert.equal(found.problem.kind, "not-replaceable");
});

test("a handle on a void element is refused — an <img> has no inner content to replace", () => {
  const found = locateRegion(`<img data-agent-element="logo" src="/a.png">`, "logo");
  assert.ok("problem" in found);
  assert.deepEqual(found.problem, { kind: "not-replaceable", tag: "img" });
});

test("a self-closing element carrying a handle is refused for the same reason", () => {
  const found = locateRegion(`<div data-agent-element="spacer" />`, "spacer");
  assert.ok("problem" in found);
  assert.equal(found.problem.kind, "not-replaceable");
});

test("a nested region reports its enclosing-region depth, and is still individually addressable", () => {
  const html = `<section data-agent-element="outer"><div data-agent-element="inner"><p>x</p></div></section>`;
  const { regions } = scanPageMarkup(html);
  assert.deepEqual(
    regions.map((region) => [region.handle, region.depth]),
    [
      ["outer", 0],
      ["inner", 1],
    ]
  );
  const found = locateRegion(html, "inner");
  assert.ok("region" in found);
  assert.equal(
    replaceRegionInner(html, found.region, "Y"),
    `<section data-agent-element="outer"><div data-agent-element="inner">Y</div></section>`
  );
});

test("replacing a region with an empty fragment empties it without removing the element or its handle", () => {
  const html = `<section data-agent-element="hero"><p>x</p></section>`;
  const found = locateRegion(html, "hero");
  assert.ok("region" in found);
  assert.equal(replaceRegionInner(html, found.region, ""), `<section data-agent-element="hero"></section>`);
});

test("whitespace and a trailing <style> block on either side of the target survive byte-for-byte", () => {
  const html = `\n  <section data-agent-element="hero">\n    <h1>Old</h1>\n  </section>\n\n<style>\n  .hero { color: red }\n</style>\n`;
  const found = locateRegion(html, "hero");
  assert.ok("region" in found);
  assert.equal(
    replaceRegionInner(html, found.region, "<h1>New</h1>"),
    `\n  <section data-agent-element="hero"><h1>New</h1></section>\n\n<style>\n  .hero { color: red }\n</style>\n`
  );
});

test("an absent handle reports the handles that exist; an empty document reports none", () => {
  const absent = locateRegion(`<section data-agent-element="a"><p>x</p></section>`, "b");
  assert.ok("problem" in absent);
  assert.deepEqual(absent.problem, { kind: "absent", available: ["a"] });

  const empty = locateRegion("", "b");
  assert.ok("problem" in empty);
  assert.deepEqual(empty.problem, { kind: "absent", available: [] });
});

test("suggestRegionHandle slugifies the section's own heading, strips inline tags, and truncates without a trailing dash", () => {
  assert.equal(suggestRegionHandle(`<h2>Our <em>Pricing</em> &amp; Plans!</h2>`, new Set()), "our-pricing-amp-plans");
  assert.equal(suggestRegionHandle(`<h1>${"a".repeat(60)}</h1>`, new Set()), "a".repeat(48));
  assert.equal(suggestRegionHandle(`<h3>!!!</h3>`, new Set()), undefined, "a heading that slugifies to nothing yields no suggestion");
});

test("suggestRegionHandle withholds a suggestion that would collide with a handle already in the document", () => {
  assert.equal(suggestRegionHandle(`<h2>Pricing</h2>`, new Set(["pricing"])), undefined);
});

test("a section with no heading gets no suggestion — 'you pick one' beats an address that will go stale", () => {
  assert.equal(suggestRegionHandle(`<p>Just some copy.</p>`, new Set()), undefined);
});

test("untaggedTopLevelSections names every offender, and never suggests the same handle twice in one batch", () => {
  // The aggregate case: two untagged sections whose headings slugify identically. A per-element
  // suggester would offer "pricing" for both, and following that advice would produce exactly the
  // ambiguous handle `locateRegion` refuses — the batch has to remember what it already handed out.
  const html =
    `<section data-agent-element="hero"><h1>Hi</h1></section>` +
    `<section><h2>Pricing</h2></section>` +
    `<section><h2>Pricing</h2></section>` +
    `<div><p>no heading here</p></div>`;
  assert.deepEqual(untaggedTopLevelSections(html), [
    { tag: "section", suggestedHandle: "pricing" },
    { tag: "section", suggestedHandle: undefined },
    { tag: "div", suggestedHandle: undefined },
  ]);
});

test("untaggedTopLevelSections exempts <style>/<script> and only looks at the TOP level", () => {
  const html =
    `<section data-agent-element="hero"><div><p>nested and untagged, which is fine</p></div></section>` +
    `<style>.a{}</style><script>var x = 1;</script>`;
  assert.deepEqual(untaggedTopLevelSections(html), []);
});

test("untaggedTopLevelSections flags a bare heading at the top level — the contract asks for sections, and a loose <h1> is not one", () => {
  assert.deepEqual(untaggedTopLevelSections(`<h1>Untagged</h1><p>Copy.</p>`), [
    { tag: "h1", suggestedHandle: undefined },
    { tag: "p", suggestedHandle: undefined },
  ]);
});
