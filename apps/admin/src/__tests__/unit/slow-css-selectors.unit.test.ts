import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/** @file Long-chat typing regressed because sibling `:has` selectors invalidated styles across
 * the document (qachat handoff, 2026-10-11). Pin the replacement layout and selector contracts;
 * browser measurement owns the actual keystroke cost. */
const assistant = readFileSync(resolve(process.cwd(), "src/styles/assistant.css"), "utf8");
const sidebar = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const row = ".jini-chat-pane .jini-message-assistant--usage-actions";

describe("slow CSS selector regression", () => {
  it.each([
    [row, "display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 8px; align-items: center;"],
    [`${row} > *`, "grid-column: 1 / -1;"],
    [`${row} > .jini-message-usage`, "grid-column: 1;"],
    [`${row} > .jini-message-actions--assistant`, "grid-column: 2; margin-top: 2px; padding-left: 0; border-left: 0;"],
  ])("preserves the declarations for %s", (selector, declarations) => {
    expect(effectiveDeclarationsFor(assistant, selector)).toBe(declarations);
  });

  it.each([["assistant", assistant], ["sidebar", sidebar]])(
    "%s message and CMS item selectors avoid sibling combinators inside :has",
    (_name, stylesheet) => {
      parse(stylesheet).walkRules((rule) => {
        if (!/\.jini-message-assistant|\.cms-item/.test(rule.selector)) return;
        expect(rule.selector).not.toMatch(/:has\([^)]*[+~]/);
      });
    },
  );
});
