import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";

import { portFake } from "#src/server/__tests__/helpers/port-fake";
import { resolveRequestedSlug } from "../request-policy.js";

/** Runs the gate for one `:slug` param and records whether it fell through to the next handler. */
function resolve(slug: string | undefined, _options = {}) {
  let fellThrough = 0;
  const result = resolveRequestedSlug({ req: portFake<Request>({ params: slug === undefined ? {} : { slug } }), next: () => { fellThrough++; } });
  return { result, fellThrough };
}

test("resolveRequestedSlug: a clean single-segment slug resolves without falling through", () => {
  assert.deepEqual(resolve("pricing-2026"), { result: "pricing-2026", fellThrough: 0 });
});

test("resolveRequestedSlug: a trailing .html is stripped so /blog.html resolves like /blog", () => {
  assert.deepEqual(resolve("blog.html"), { result: "blog", fellThrough: 0 });
  // Only the suffix is stripped; an inner .html is not a page filename and stays unresolvable.
  assert.deepEqual(resolve("blog.html.bak"), { result: undefined, fellThrough: 1 });
});

for (const slug of ["admin", "api", "admin.html", "Pricing", "two words", "a/b", "../etc", "café", ""]) {
  test(`resolveRequestedSlug: ${JSON.stringify(slug)} is not a site page and falls through exactly once`, () => {
    assert.deepEqual(resolve(slug), { result: undefined, fellThrough: 1 });
  });
}

test("resolveRequestedSlug: a request without a slug param falls through instead of resolving an empty page", () => {
  assert.deepEqual(resolve(undefined), { result: undefined, fellThrough: 1 });
});
