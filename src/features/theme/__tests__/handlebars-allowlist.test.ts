import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  ALLOWED_HANDLEBARS_BLOCK_HELPERS,
  ALLOWED_HANDLEBARS_DATA_VARS,
  ALLOWED_HANDLEBARS_HELPERS,
  ALLOWED_HANDLEBARS_RAW_PATHS,
  lintHandlebarsTemplate,
} from "../handlebars-allowlist";
import { loadTheme } from "../theme";

/**
 * @file ADR-020 §3 (C6), Handlebars tier — certifies the helper/expression
 * allowlist walker that backs both `theme.ts`'s lint-before-publish and
 * `handlebars-worker.ts`'s defensive render-time re-check. Mirrors
 * `liquid-allowlist.test.ts` case for case, with the cases that are specific to
 * Handlebars' own danger surface (raw `{{{stashes}}}`, partials, decorators,
 * prototype paths) added.
 */

function ledgerTemplate(name: "home" | "entry"): string {
  return readFileSync(join(process.cwd(), "src", "themes", "handlebars", "ledger", "templates", `${name}.hbs`), "utf8");
}

test("a clean template with no expressions at all reports no violations", () => {
  assert.deepEqual(lintHandlebarsTemplate("<p>plain HTML, no Handlebars</p>"), []);
});

test("the live themes/handlebars/ledger home template uses only allowed helpers/expressions", () => {
  assert.deepEqual(lintHandlebarsTemplate(ledgerTemplate("home")), []);
});

test("the live themes/handlebars/ledger entry template uses only allowed helpers/expressions", () => {
  assert.deepEqual(lintHandlebarsTemplate(ledgerTemplate("entry")), []);
});

test("every helper the ledger templates actually use is on the allowlist (sanity check on the allowlist itself)", () => {
  for (const helper of ["each", "if", "unless", "with"]) {
    assert.ok(ALLOWED_HANDLEBARS_BLOCK_HELPERS.has(helper), `expected block helper "${helper}" to be allowed`);
  }
  assert.ok(ALLOWED_HANDLEBARS_HELPERS.has("render_block"), "expected Tovu's render_block seam to be allowed");
  for (const dataVar of ["index", "first"]) {
    assert.ok(ALLOWED_HANDLEBARS_DATA_VARS.has(dataVar), `expected @${dataVar} to be allowed`);
  }
});

// ---------------------------------------------------------------------------
// Partials — Handlebars' analogue of Liquid's include/render filesystem tags.
// ---------------------------------------------------------------------------

test("a partial reference ({{> name}}) is rejected", () => {
  const violations = lintHandlebarsTemplate("{{> header}}");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /disallowed partial "header"/);
});

test("a partial BLOCK ({{#> name}}…{{/name}}) is rejected too — the block form is not an escape hatch", () => {
  const violations = lintHandlebarsTemplate("{{#> layout}}x{{/layout}}");
  assert.match(violations[0], /disallowed partial "layout"/);
});

test("a partial pointing at a filesystem-shaped name is rejected without the lint ever touching the filesystem", () => {
  // `Handlebars.parse()` builds an AST and nothing else — no compile, no partial
  // resolution, no file read. If that ever changed, this case would attempt to
  // read /etc/hosts instead of cleanly reporting the disallowed partial.
  const violations = lintHandlebarsTemplate('{{> "/etc/hosts"}}');
  assert.equal(violations.length, 1);
  assert.match(violations[0], /disallowed partial/);
});

// ---------------------------------------------------------------------------
// Decorators — template text reaching the runtime's own program resolution.
// ---------------------------------------------------------------------------

test("an inline decorator ({{#*inline}}) is rejected", () => {
  const violations = lintHandlebarsTemplate('{{#*inline "mine"}}y{{/inline}}');
  assert.equal(violations.length, 1);
  assert.match(violations[0], /disallowed decorator "inline"/);
});

// ---------------------------------------------------------------------------
// Raw output — the tier's entire XSS surface, and the ONE sanctioned exemption.
// ---------------------------------------------------------------------------

test("a triple-stash raw output is rejected for an ordinary path", () => {
  const violations = lintHandlebarsTemplate("{{{post.title}}}");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /disallowed raw output "\{\{\{post\.title\}\}\}"/);
});

test("the {{&x}} ampersand form is the same unescaped output and is rejected identically", () => {
  const violations = lintHandlebarsTemplate("{{&site.title}}");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /disallowed raw output/);
});

test("{{{post.content}}} — and only it — is permitted raw, because it is server-rendered pre-sanitized HTML", () => {
  assert.deepEqual(lintHandlebarsTemplate("{{{post.content}}}"), []);
  assert.deepEqual([...ALLOWED_HANDLEBARS_RAW_PATHS], ["post.content"]);
});

test("the escaped form of the same expression is always fine", () => {
  assert.deepEqual(lintHandlebarsTemplate("{{post.title}} {{site.title}}"), []);
});

// ---------------------------------------------------------------------------
// Helpers — no custom helper surface exists, so anything outside the reviewed
// set is refused, including Handlebars' own built-ins that do I/O or dynamic
// property access.
// ---------------------------------------------------------------------------

test("the built-in log helper (console I/O from template text) is rejected", () => {
  const violations = lintHandlebarsTemplate('{{log "pwn"}}');
  assert.equal(violations.length, 1);
  assert.match(violations[0], /disallowed helper "log"/);
});

test("the built-in lookup helper (dynamic property access by computed key) is rejected", () => {
  const violations = lintHandlebarsTemplate('{{lookup this "constructor"}}');
  assert.match(violations[0], /disallowed helper "lookup"/);
});

test("an unknown block helper is rejected — a theme cannot register one, so there is nothing it could resolve to", () => {
  const violations = lintHandlebarsTemplate("{{#customBlock}}x{{/customBlock}}");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /disallowed block helper "customBlock"/);
});

test("a raw block ({{{{name}}}}…{{{{/name}}}}) goes through the same block-helper allowlist", () => {
  const violations = lintHandlebarsTemplate("{{{{rawblock}}}}{{x}}{{{{/rawblock}}}}");
  assert.match(violations[0], /disallowed block helper "rawblock"/);
});

test("Tovu's own render_block seam is allowed, in both its component and region forms", () => {
  assert.deepEqual(lintHandlebarsTemplate('{{render_block component="tovu/site-header" tagline="x"}}'), []);
  assert.deepEqual(lintHandlebarsTemplate('{{render_block region="footer"}}'), []);
});

// ---------------------------------------------------------------------------
// Nested rejection — the walk descends into block bodies, inverse ({{else}})
// branches, helper params, and hash values, not just the top level.
// ---------------------------------------------------------------------------

test("a disallowed helper inside an if/each body is still caught (nested AST walk, not just top level)", () => {
  const violations = lintHandlebarsTemplate('{{#each posts}}{{#if title}}{{lookup this "x"}}{{/if}}{{/each}}');
  assert.ok(violations.some((v) => /disallowed helper "lookup"/.test(v)));
});

test("a disallowed partial inside an each body is still caught", () => {
  const violations = lintHandlebarsTemplate("{{#each posts}}{{> leak}}{{/each}}");
  assert.ok(violations.some((v) => /disallowed partial "leak"/.test(v)));
});

test("a raw output inside an each body is still caught", () => {
  const violations = lintHandlebarsTemplate("{{#each posts}}{{{title}}}{{/each}}");
  assert.ok(violations.some((v) => /disallowed raw output/.test(v)));
});

test("a disallowed partial smuggled into an {{else}} inverse branch is still caught", () => {
  const violations = lintHandlebarsTemplate("{{#if a}}x{{else}}{{> leak}}{{/if}}");
  assert.ok(violations.some((v) => /disallowed partial "leak"/.test(v)));
});

test("a disallowed helper smuggled into a subexpression argument of an ALLOWED block is still caught", () => {
  const violations = lintHandlebarsTemplate('{{#if (lookup a b)}}x{{/if}}');
  assert.ok(violations.some((v) => /disallowed helper "lookup"/.test(v)));
});

test("a disallowed helper smuggled into a hash value of the render_block seam is still caught", () => {
  const violations = lintHandlebarsTemplate("{{render_block component=(lookup a b)}}");
  assert.ok(violations.some((v) => /disallowed helper "lookup"/.test(v)));
});

// ---------------------------------------------------------------------------
// Path safety — the static half of the prototype-pollution guarantee whose
// runtime half is `allowProtoPropertiesByDefault: false` in the worker.
// ---------------------------------------------------------------------------

test("a path traversing constructor is rejected", () => {
  const violations = lintHandlebarsTemplate("{{a.constructor.b}}");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /disallowed path segment "constructor"/);
});

test("a path traversing __proto__ is rejected, including nested inside a loop body", () => {
  const violations = lintHandlebarsTemplate("{{#each posts}}{{__proto__.x}}{{/each}}");
  assert.ok(violations.some((v) => /disallowed path segment "__proto__"/.test(v)));
});

test("@root is rejected (scope escape), while the loop data variables a real theme needs are allowed", () => {
  assert.match(lintHandlebarsTemplate("{{@root.site.title}}")[0], /disallowed data variable/);
  assert.deepEqual(lintHandlebarsTemplate("{{#each posts}}{{@index}}{{@key}}{{@first}}{{@last}}{{/each}}"), []);
});

test("a parent-scope path (../) is ordinary scoping, not a violation", () => {
  assert.deepEqual(lintHandlebarsTemplate("{{#each posts}}{{../site.title}}{{/each}}"), []);
});

// ---------------------------------------------------------------------------
// Total-function contract + static resource guards.
// ---------------------------------------------------------------------------

test("a Handlebars syntax error is reported as a violation message rather than thrown", () => {
  const violations = lintHandlebarsTemplate("{{#if unterminated}}");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /Handlebars syntax error/);
});

test("a pathologically deeply nested template is rejected rather than recursing without bound", () => {
  const deep = `${"{{#if a}}".repeat(70)}x${"{{/if}}".repeat(70)}`;
  const violations = lintHandlebarsTemplate(deep);
  assert.equal(violations.length, 1, `expected one de-duplicated depth violation, got: ${JSON.stringify(violations)}`);
  assert.match(violations[0], /nesting exceeds the maximum allowed depth/);
});

test("nesting well within the depth cap is allowed", () => {
  const shallow = `${"{{#if a}}".repeat(10)}{{title}}${"{{/if}}".repeat(10)}`;
  assert.deepEqual(lintHandlebarsTemplate(shallow), []);
});

test("an oversized template source is rejected before it is ever parsed", () => {
  const violations = lintHandlebarsTemplate("x".repeat(1_000_001));
  assert.equal(violations.length, 1);
  assert.match(violations[0], /exceeds the maximum allowed size/);
});

// ---------------------------------------------------------------------------
// End-to-end: the real demonstrator theme loads as valid through loadTheme().
// ---------------------------------------------------------------------------

test("the live themes/handlebars/ledger demonstrator theme loads as valid end-to-end", () => {
  const theme = loadTheme({
    themeDir: join(process.cwd(), "src", "themes", "handlebars", "ledger"),
    id: "ledger",
    source: "built-in",
  });
  assert.equal(theme.status, "valid", `expected ledger to load valid, got errors: ${JSON.stringify(theme.errors)}`);
  assert.deepEqual(theme.errors, []);
  assert.equal(theme.manifest.tier, "handlebars");
  assert.ok(theme.handlebarsTemplates.home);
  assert.ok(theme.handlebarsTemplates.entry);
});
