import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * @file A locked ("Soon") agent-plugin switch is not drawn: the padlock takes the switch's column, as on a
 * linked row, so the action cluster has one width on every row and the divider is one straight line.
 */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("locked agent-plugin switch", () => {
  const locked = effectiveDeclarationsFor(stylesheet, ".agent-plugin-switch--locked:disabled");

  it("is taken out of the row flow and hidden, keeping it in the DOM", () => {
    expect(locked).toMatch(/position:\s*absolute;/);
    expect(locked).toMatch(/opacity:\s*0;/);
  });

  it("shares the 38px lock slot with the linked padlock", () => {
    expect(effectiveDeclarationsFor(stylesheet, ".agent-plugin-linked-lock")).toMatch(/width:\s*38px;/);
  });
});
