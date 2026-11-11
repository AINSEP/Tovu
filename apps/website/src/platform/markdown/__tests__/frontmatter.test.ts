import assert from "node:assert/strict";
import test from "node:test";

import { readFrontmatterField } from "../frontmatter.js";

/**
 * @file RED test for row 32 (S13): both `features/skills/tool-registrations.ts`'s
 * `extractFrontmatterField` and `features/agent-plugins/tool-registrations.ts`'s
 * `extractFrontmatterDescription` read frontmatter with a single-line regex (`^key:\s*(.+)$`), so a
 * YAML block scalar (`description: >` folded, `description: |` literal) yields the literal marker
 * character instead of the multi-line value it introduces. `readFrontmatterField` fixes this with a
 * real (FAILSAFE_SCHEMA) YAML parse, falling back to today's regex + quote-trim only when the
 * frontmatter block itself isn't valid YAML, so nothing that loads today stops loading.
 */

test("folded block scalar ('>') resolves to its joined, whitespace-collapsed value", () => {
  const md = "---\nname: x\ndescription: >\n  Folded line one\n  line two\n---\nbody";
  assert.equal(readFrontmatterField(md, "description"), "Folded line one line two");
});

test("literal block scalar ('|') resolves to its joined, whitespace-collapsed value", () => {
  const md = "---\ndescription: |\n  a\n  b\n---\nbody";
  assert.equal(readFrontmatterField(md, "description"), "a b");
});

test("malformed YAML falls back to the single-line regex plus quote trim", () => {
  const md = "---\ndescription: a: b: [\n---";
  assert.equal(readFrontmatterField(md, "description"), "a: b: [");
});

test("an ordinary single-line value is returned verbatim (no frontmatter regression)", () => {
  const md = "---\nname: incident-response\ndescription: Use when handling production incidents.\n---\nbody";
  assert.equal(readFrontmatterField(md, "name"), "incident-response");
  assert.equal(readFrontmatterField(md, "description"), "Use when handling production incidents.");
});

test("a quoted single-line value has its surrounding quotes stripped", () => {
  const md = '---\ndescription: "Quoted value"\n---\nbody';
  assert.equal(readFrontmatterField(md, "description"), "Quoted value");
});

test("no frontmatter block at all returns undefined", () => {
  assert.equal(readFrontmatterField("# Just a heading\n\nSome prose.\n", "description"), undefined);
});

test("unterminated frontmatter returns undefined", () => {
  assert.equal(readFrontmatterField("---\ndescription: unfinished\nbody", "description"), undefined);
});

test("CRLF frontmatter parses normally", () => {
  assert.equal(readFrontmatterField("---\r\ndescription: Windows skill\r\n---\r\nbody", "description"), "Windows skill");
});

test("a four-dash line does not close an otherwise unterminated frontmatter block", () => {
  assert.equal(readFrontmatterField("---\ndescription: unfinished\n----\nbody", "description"), undefined);
});

test("a missing key returns undefined", () => {
  const md = "---\nname: x\n---\nbody";
  assert.equal(readFrontmatterField(md, "description"), undefined);
});

test("an empty value returns undefined", () => {
  const md = "---\ndescription:\n---\nbody";
  assert.equal(readFrontmatterField(md, "description"), undefined);
});

test("a value YAML reads as a non-string (flow sequence/map) falls back to the single-line regex, as it read before", () => {
  // The pre-S13 regex returned the raw line for these; a YAML parse turns them into an array/object,
  // which would otherwise silently drop a skill that loads today.
  assert.equal(readFrontmatterField("---\nname: x\ndescription: [Beta]\n---\nbody", "description"), "[Beta]");
  assert.equal(readFrontmatterField("---\nname: {x}\ndescription: d\n---\nbody", "name"), "{x}");
});

test("quoted whitespace and empty strings have no usable frontmatter value", () => {
  for (const value of ['""', "''", '"  \\t  "']) {
    assert.equal(readFrontmatterField(`---\ndescription: ${value}\n---`, "description"), undefined);
  }
});

test("malformed YAML without the requested field has no regex fallback value", () => {
  assert.equal(readFrontmatterField("---\nname: [unfinished\n---", "description"), undefined);
});

test("malformed YAML preserves quote trimming and whitespace normalization in the fallback", () => {
  assert.equal(readFrontmatterField('---\nname: [unfinished\ndescription: "  Keep   this value  "\n---', "description"), "Keep this value");
  assert.equal(readFrontmatterField('---\nname: [unfinished\ndescription: "   "\n---', "description"), undefined);
});

test("empty, scalar and sequence YAML documents do not expose frontmatter fields", () => {
  for (const block of ["", "plain scalar", "- description\n- not a mapping"]) {
    assert.equal(readFrontmatterField(`---\n${block}\n---`, "description"), undefined);
  }
});

// L11 Stryker: the fallback's quote-strip anchors and the leading `---` check survived.
test("the regex fallback strips only the outer quotes, keeping an inner apostrophe and quote", () => {
  // `: [` inside an unclosed flow sequence makes YAML refuse the block, so the fallback runs.
  assert.equal(readFrontmatterField(`---\nname: "it's a "quoted" one: [x\n---\nbody`, "name"), `it's a "quoted" one: [x`);
  assert.equal(readFrontmatterField(`---\nname: 'O'Brien: [x'\n---\n`, "name"), `O'Brien: [x`);
});

test("frontmatter must start at the first byte", () => {
  for (const markdown of [" ---\nname: x\n---\n", "\n---\nname: x\n---\n", "text\n---\nname: x\n---\n"]) {
    assert.equal(readFrontmatterField(markdown, "name"), undefined, JSON.stringify(markdown));
  }
  assert.equal(readFrontmatterField("---\nname: x\n---", "name"), "x", "a close at end of file counts");
});
