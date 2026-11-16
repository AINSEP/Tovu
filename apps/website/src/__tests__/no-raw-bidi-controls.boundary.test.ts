import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file Source guard: no file under `apps/website/src` may contain a raw bidirectional-text control
 * character (U+200E-200F, U+202A-202E, U+2066-2069). They are invisible in a diff, so a filter that
 * names them must spell them as `\u` escapes: a raw one cannot be reviewed by eye, and an editor or
 * formatter that drops it changes the filter with nothing a person can read (security review A1-F1).
 * This file spells every code point as an escape for the same reason.
 */

const SCAN_ROOT = path.resolve(import.meta.dirname, "..");
const RAW_BIDI_CONTROL = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist"]);

/** Every file under `dir`, depth first. */
function listFiles({ dir }: { dir: string }, _options = {}): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIPPED_DIRECTORIES.has(entry.name) ? [] : listFiles({ dir: path.join(dir, entry.name) });
    return entry.isFile() ? [path.join(dir, entry.name)] : [];
  });
}

/** `file:line:column U+XXXX` for each raw control in `text`. */
function rawBidiControls({ file, text }: { file: string; text: string }, _options = {}): string[] {
  return [...text.matchAll(RAW_BIDI_CONTROL)].map((match) => {
    const before = text.slice(0, match.index).split("\n");
    const codePoint = match[0].codePointAt(0)!.toString(16).toUpperCase();
    return `${path.relative(SCAN_ROOT, file)}:${before.length}:${before.at(-1)!.length + 1} U+${codePoint}`;
  });
}

test("the scanner reports each raw bidi control with its position", () => {
  const text = `ok\nab${String.fromCodePoint(0x202e)}c${String.fromCodePoint(0x2066)}`;
  assert.deepEqual(rawBidiControls({ file: path.join(SCAN_ROOT, "x.ts"), text }), ["x.ts:2:3 U+202E", "x.ts:2:5 U+2066"]);
  assert.deepEqual(rawBidiControls({ file: path.join(SCAN_ROOT, "x.ts"), text: String.raw`/[\u200e\u202a-\u202e]/` }), []);
});

test("no file under apps/website/src contains a raw bidi control character", () => {
  const files = listFiles({ dir: SCAN_ROOT });
  assert.ok(files.length > 1000, `the scan must reach the whole source tree, found ${files.length} files`);
  const found = files.flatMap((file) => rawBidiControls({ file, text: fs.readFileSync(file, "utf8") }));
  assert.deepEqual(found, [], "write these as \\u escapes instead of raw characters");
});
