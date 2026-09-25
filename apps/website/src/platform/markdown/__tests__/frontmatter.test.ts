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
