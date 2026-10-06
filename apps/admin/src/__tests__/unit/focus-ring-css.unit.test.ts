import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * @file The admin's focus ring lives in CSS only, so it is asserted against the stylesheet: one
 * brand-coloured ring for keyboard focus, none on mouse click. jsdom resolves neither
 * `:focus-visible` nor the cascade, so no render test can see this (verified live in Chrome
 * instead, 2026-10-06).
 */

/** From `process.cwd()` for the reason `sidebar-accordion-css.unit.test.ts` gives. */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

/** Rules whose selector ends in a bare `:focus` (not `:focus-visible`/`:focus-within`). */
function bareFocusSelectors(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...withoutComments.matchAll(/([^{}]+)\{/g)].flatMap((match) => match[1]!.split(","));
  return selectors.map((selector) => selector.trim()).filter((selector) => /:focus(?![-\w])/.test(selector));
}

describe("admin focus ring", () => {
  it("defines the ring as the brand primary", () => {
    expect(effectiveDeclarationsFor(stylesheet, ":root")).toMatch(/--focus-ring\s*:\s*var\(--primary\)\s*;/);
  });

  it("colours every focus-visible outline with the ring token, whichever rule drew it", () => {
    expect(effectiveDeclarationsFor(stylesheet, ":focus-visible")).toMatch(/outline-color\s*:\s*var\(--focus-ring\)\s*;/);
    // `!important` is the point (component rules set their own outline colour at higher
    // specificity), and the helper above drops it, so it is checked on the source.
    expect(stylesheet).toMatch(/(?:^|\})\s*:focus-visible\s*\{\s*outline-color\s*:\s*var\(--focus-ring\)\s*!important\s*;/m);
  });

  it("draws no ring around the programmatic focus landmarks", () => {
    expect(effectiveDeclarationsFor(stylesheet, "#main-content:focus")).toMatch(/outline\s*:\s*none\s*;/);
    expect(effectiveDeclarationsFor(stylesheet, ".admin-chat-dock:focus")).toMatch(/outline\s*:\s*none\s*;/);
  });

  it("uses bare :focus only on text fields, the skip link and the two landmarks — never on buttons or rows", () => {
    const allowed = /^(?:input|select|textarea)\b|\b(?:input|textarea)\b[^ ]*:focus$|-input:focus$|^\.skip-link:focus$|^\.editor-title|^\.editor-id input|^#main-content:focus$|^\.admin-chat-dock:focus$/;
    expect(bareFocusSelectors(stylesheet).filter((selector) => !allowed.test(selector))).toEqual([]);
  });
});
