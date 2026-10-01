import assert from "node:assert/strict";
import test from "node:test";

import { locateRegion, moveRegion, regionHandlesIn, type PageRegion } from "../regions.js";

/**
 * @file `moveRegion` — reordering whole sections of a page body, byte-for-byte.
 *
 * The incident (chat "Can You See Higgsfield Plugin", 2026-10-01): the owner asked to swap two
 * landing-page sections. Every section was a tagged region, but the only tools were "replace one
 * region's INNER content" and "rewrite the whole ~55KB page", so the assistant refused. Moving a
 * section is a pure splice of an element the scanner already delimits; these cases pin that splice.
 */

function region(html: string, handle: string): PageRegion {
  const found = locateRegion(html, handle);
  assert.ok("region" in found, `fixture has no single region "${handle}"`);
  return found.region;
}

const A = `<section data-agent-element="a" data-agent-role="region"><h2>A</h2></section>`;
const B = `<section data-agent-element="b" data-agent-role="region"><h2>B</h2></section>`;
const C = `<section data-agent-element="c" data-agent-role="region"><h2>C</h2></section>`;
const STYLE = `<style>\n  .x > .y { color: red; }\n</style>\n`;
const PAGE = `${STYLE}${A}\n${B}\n${C}\n`;

test("moving a region before an earlier one puts the whole element there and leaves every other byte in order", () => {
  assert.deepEqual(moveRegion(PAGE, region(PAGE, "c"), region(PAGE, "a"), "before"), { html: `${STYLE}${C}\n${A}\n${B}\n` });
});

test("moving a region after a later one", () => {
  assert.deepEqual(moveRegion(PAGE, region(PAGE, "a"), region(PAGE, "c"), "after"), { html: `${STYLE}${B}\n${C}\n${A}\n` });
});

test("swapping two adjacent sections is one move, in either direction", () => {
  const expected = { html: `${STYLE}${B}\n${A}\n${C}\n` };
  assert.deepEqual(moveRegion(PAGE, region(PAGE, "b"), region(PAGE, "a"), "before"), expected);
  assert.deepEqual(moveRegion(PAGE, region(PAGE, "a"), region(PAGE, "b"), "after"), expected);
});

test("a region already in the requested position yields the identical document", () => {
  assert.deepEqual(moveRegion(PAGE, region(PAGE, "b"), region(PAGE, "a"), "after"), { html: PAGE });
});

test("the last region with no trailing whitespace carries its leading whitespace instead of gluing onto a neighbour", () => {
  const html = `${A}\n${B}`;
  assert.deepEqual(moveRegion(html, region(html, "b"), region(html, "a"), "before"), { html: `${B}\n${A}` });
});

test("a region holding a nested same-tag element and nested regions moves as one piece", () => {
  const outer = `<section data-agent-element="outer"><section data-agent-element="inner"><p>i</p></section><p>tail</p></section>`;
  const html = `${A}\n${outer}\n`;
  const moved = moveRegion(html, region(html, "outer"), region(html, "a"), "before");
  assert.deepEqual(moved, { html: `${outer}\n${A}\n` });
  assert.deepEqual(regionHandlesIn((moved as { html: string }).html), ["outer", "inner", "a"]);
});

test("moving a region relative to itself is refused", () => {
  assert.deepEqual(moveRegion(PAGE, region(PAGE, "a"), region(PAGE, "a"), "after"), { problem: "self" });
});

test("moving a region next to one of its own descendants is refused — it would have to sit inside itself", () => {
  const html = `<section data-agent-element="outer"><div data-agent-element="inner"><p>i</p></div></section>`;
  assert.deepEqual(moveRegion(html, region(html, "outer"), region(html, "inner"), "before"), { problem: "into-itself" });
});
