import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file Guard for the "assistant reply squeezed to the left" regression (owner, 2026-10-10: "there
 * seems to be some padding on the right … pushing … and stopping the text"; "tool call stuff is
 * fine but everything else is squeezed"). The shared `.jini-message-content` rule caps every message
 * at 80% so the user's bubbles read as bubbles; the assistant's replies (text, lists, tables) must
 * NOT inherit that cap, or they stop ~20% short of the tool-call rows above them. The owner asked
 * for a guard because agents keep re-breaking this.
 *
 * Same declaration-as-text approach as `chat-pane-overflow-css.unit.test.ts` (read its header):
 * jsdom does no layout, so this pins the declarations; the real-browser width check lives in the
 * journey pin `development/e2e/journeys/admin-chat-width.pins.journey.ts`. Note Jini's injected
 * chat-pane styles (88% user bubble, 22px list padding) load after this sheet; the journey pin
 * measures the real cascade.
 */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles/assistant.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every declaration block whose selector list contains exactly `selector`, in source order. */
function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[,{}])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "gm");
  return [...stylesheet.matchAll(re)].map((match) => match[1]).join(";\n");
}

/** The last value given for `property` (a later override wins, including inside media queries). */
function lastDeclaration(rule: string, property: string): string | undefined {
  const declarations = [...rule.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))];
  return declarations.at(-1)?.[1]?.trim();
}

/** Largest px value in a shorthand like "12px 16px" (horizontal sides for 2-value padding). */
function horizontalPx(padding: string | undefined): number {
  const parts = (padding ?? "").split(/\s+/).map((part) => Number.parseFloat(part));
  const right = parts.length >= 2 ? parts[1] : parts[0];
  const left = parts.length === 4 ? parts[3] : right;
  return Math.max(right ?? 0, left ?? 0);
}

describe("assistant chat: replies use the full row", () => {
  it("assistant reply content is uncapped, beating the shared 80% bubble cap", () => {
    expect(lastDeclaration(ruleFor(".jini-chat-pane .jini-message-assistant .jini-message-content"), "max-width")).toBe("none");
  });

  it("the 80% cap stays on the shared rule (the user's bubbles), not removed wholesale", () => {
    expect(lastDeclaration(ruleFor(".jini-message-content"), "max-width")).toBe("80%");
  });

  it("no rule re-caps assistant replies or pads them on the right", () => {
    const assistantRules = [...stylesheet.matchAll(/([^{}]*\.jini-message-assistant[^{}]*)\{([^}]*)\}/g)];
    for (const [, selector, body] of assistantRules) {
      const maxWidth = lastDeclaration(body ?? "", "max-width");
      if (maxWidth !== undefined) expect({ selector: selector?.trim(), maxWidth }).toEqual({ selector: selector?.trim(), maxWidth: "none" });
      expect({ selector: selector?.trim(), paddingRight: lastDeclaration(body ?? "", "padding-right") }).toEqual({ selector: selector?.trim(), paddingRight: undefined });
    }
  });

  it("the message list's side padding stays at most 16px", () => {
    expect(horizontalPx(lastDeclaration(ruleFor(".jini-message-list"), "padding"))).toBeLessThanOrEqual(16);
    expect(lastDeclaration(ruleFor(".jini-message-list"), "padding-right")).toBeUndefined();
  });
});
