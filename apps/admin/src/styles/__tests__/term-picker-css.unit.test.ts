import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file Twin-selector guard for `@jini-ai/admin`'s `TermPicker` (the editors' Categories & Tags
 * box). The component emits only `jini-term-picker*` classes; `styles.css` keeps its original
 * `.term-picker*` rules and lists each `jini-` twin in the same selector. jsdom has no layout, so
 * this reads the built component for every `jini-term-picker*` class it emits and asserts each one
 * is a selector of some rule in `styles.css` — a twin dropped from a rule fails here, where the
 * browser would silently render the box unstyled.
 */

const CSS = readFileSync(path.resolve(__dirname, "../../styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const COMPONENT = readFileSync(createRequire(import.meta.url).resolve("@jini-ai/admin/screens/taxonomy/TermPicker"), "utf8");

/** Every selector in `styles.css`, split out of each rule's prelude. */
const SELECTORS = CSS.split("}").flatMap((chunk) => {
  const prelude = chunk.split("{")[0] ?? "";
  return prelude.split(",").map((selector) => selector.trim()).filter(Boolean);
});

const EMITTED = [...new Set(COMPONENT.match(/jini-term-picker[a-z-]*/g) ?? [])].sort();

describe("TermPicker twin selectors", () => {
  it("reads the classes the built component emits", () => {
    expect(EMITTED).toEqual([
      "jini-term-picker", "jini-term-picker-actions", "jini-term-picker-add", "jini-term-picker-add-trigger",
      "jini-term-picker-body", "jini-term-picker-group", "jini-term-picker-groups", "jini-term-picker-more",
      "jini-term-picker-search", "jini-term-picker-terms",
    ]);
  });

  it.each(EMITTED.filter((cls) => cls !== "jini-term-picker-add-trigger"))("styles .%s next to its original rule", (cls) => {
    const twin = new RegExp(`^\\.${cls}(?![\\w-])`);
    const original = new RegExp(`^\\.${cls.replace(/^jini-/, "")}(?![\\w-])`);
    expect(SELECTORS.some((selector) => twin.test(selector))).toBe(true);
    expect(SELECTORS.some((selector) => original.test(selector))).toBe(true);
  });

  it("leaves the add trigger to the shared .btn-ghost, as the original .term-picker-add-trigger was", () => {
    expect(SELECTORS.some((selector) => /\.(jini-)?term-picker-add-trigger(?![\w-])/.test(selector))).toBe(false);
  });
});
