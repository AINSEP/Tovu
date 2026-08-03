import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ALLOWED_LIQUID_FILTERS, ALLOWED_LIQUID_TAGS, lintLiquidTemplate } from "../liquid-allowlist";

/**
 * @file ADR-020 §3 (C6) — certifies the LiquidJS tag/filter allowlist walker
 * that backs both `theme.ts`'s lint-before-publish and `liquid-worker.ts`'s
 * defensive render-time re-check.
 */

function dispatchTemplate(name: "home" | "entry"): string {
  return readFileSync(join(process.cwd(), "src", "themes", "liquidjs", "dispatch", "templates", `${name}.liquid`), "utf8");
}

test("a clean template with no tags/filters at all reports no violations", () => {
  assert.deepEqual(lintLiquidTemplate("<p>plain HTML, no Liquid</p>"), []);
});

test("the live themes/dispatch home template uses only allowed tags/filters", () => {
  assert.deepEqual(lintLiquidTemplate(dispatchTemplate("home")), []);
});

test("the live themes/dispatch entry template uses only allowed tags/filters", () => {
  assert.deepEqual(lintLiquidTemplate(dispatchTemplate("entry")), []);
});

test("every tag the dispatch templates actually use is on the allowlist (sanity check on the allowlist itself)", () => {
  for (const tag of ["comment", "render_block", "if", "for", "assign"]) {
    assert.ok(ALLOWED_LIQUID_TAGS.has(tag), `expected "${tag}" to be allowed`);
  }
  for (const filter of ["date", "raw", "plus"]) {
    assert.ok(ALLOWED_LIQUID_FILTERS.has(filter), `expected "${filter}" to be allowed`);
  }
});

test("a filesystem-reading tag (include) is rejected", () => {
  const violations = lintLiquidTemplate('{% include "partial" %}');
  assert.equal(violations.length, 1);
  assert.match(violations[0], /disallowed tag "include"/);
});

test("render (LiquidJS's own partial tag, distinct from render_block) is rejected", () => {
  const violations = lintLiquidTemplate('{% render "partial" %}');
  assert.match(violations[0], /disallowed tag "render"/);
});

test("layout and block (template-inheritance, also filesystem-backed) are rejected", () => {
  const violations = lintLiquidTemplate('{% layout "base" %}{% block "content" %}x{% endblock %}');
  assert.ok(violations.some((v) => /disallowed tag "layout"/.test(v)));
  assert.ok(violations.some((v) => /disallowed tag "block"/.test(v)));
});

test("a disallowed filter is rejected", () => {
  const violations = lintLiquidTemplate("{{ secret | sha256 }}");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /disallowed filter "sha256"/);
});

test("a dynamic-expression filter (where_exp) is rejected even though it is a built-in LiquidJS filter", () => {
  const violations = lintLiquidTemplate('{{ posts | where_exp: "p", "p.title" }}');
  assert.match(violations[0], /disallowed filter "where_exp"/);
});

test("a disallowed tag inside an if/for body is still caught (nested AST walk, not just top level)", () => {
  const violations = lintLiquidTemplate(
    '{% for post in posts %}{% if post.slug %}{% include "leak" %}{% endif %}{% endfor %}'
  );
  assert.ok(violations.some((v) => /disallowed tag "include"/.test(v)));
});

test("a disallowed tag smuggled via the {% liquid %} multi-statement shorthand is still caught", () => {
  const violations = lintLiquidTemplate('{% liquid\ninclude "leak"\nassign x = 1\n%}');
  assert.ok(violations.some((v) => /disallowed tag "include"/.test(v)));
});

test("a Liquid syntax error is reported as a violation message rather than thrown", () => {
  const violations = lintLiquidTemplate("{% if unterminated %}");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /Liquid syntax error/);
});

test("walking a template that contains include/render never touches the real filesystem during lint (partials=false)", () => {
  // If the walker ever flipped `partials` to true, this would attempt to read
  // a real file named "/etc/hosts" relative to the process cwd and throw a
  // filesystem error instead of cleanly reporting the disallowed tag.
  const violations = lintLiquidTemplate('{% include "/etc/hosts" %}{% render "/etc/hosts" %}');
  assert.deepEqual(
    violations.sort(),
    ['disallowed tag "include"', 'disallowed tag "render"'].sort()
  );
});

// ---------------------------------------------------------------------------
// A `for` loop over a literal numeric range needs no disallowed tag/filter —
// `for` itself is allowlisted. Verified empirically (outside this suite,
// documented in the Programmer handoff) that LiquidJS eagerly materializes
// the *entire* range into a real JS array before iterating, and that a
// single allocation request that large can crash the *whole* Node process
// with a fatal V8 OOM even inside a `resourceLimits`-capped worker thread —
// `resourceLimits` only protects against gradual heap growth via GC
// callbacks, not a one-shot allocation that already exceeds budget. This is
// the static guard that closes that gap for literal ranges.
// ---------------------------------------------------------------------------

test("a for-loop over a huge literal numeric range is rejected", () => {
  const violations = lintLiquidTemplate("{% for i in (1..2000000000) %}{{ i }}{% endfor %}");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /for-loop range \(1\.\.2000000000\) exceeds the maximum allowed span/);
});

test("a for-loop over a small literal numeric range is allowed", () => {
  assert.deepEqual(lintLiquidTemplate("{% for i in (1..100) %}{{ i }}{% endfor %}"), []);
});

test("a for-loop over an array/variable (not a literal range) is never flagged by the range-span guard, regardless of the array's real size", () => {
  // `posts` here is just an identifier, not a `(a..b)` range literal — the
  // guard only inspects RangeToken collections. This is the shape every
  // real theme actually uses (themes/dispatch: `for post in posts`).
  assert.deepEqual(lintLiquidTemplate("{% for post in posts %}{{ post.title }}{% endfor %}"), []);
});

test("an oversized range nested inside an if/for body is still caught (nested AST walk, not just top level)", () => {
  const violations = lintLiquidTemplate(
    '{% for post in posts %}{% if post.slug %}{% for i in (1..2000000000) %}{{ i }}{% endfor %}{% endif %}{% endfor %}'
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /for-loop range \(1\.\.2000000000\)/);
});
