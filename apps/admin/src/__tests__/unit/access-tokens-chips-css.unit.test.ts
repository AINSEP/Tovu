import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * Access Tokens' "Works for" chips (Jini `OnboardingChipField`, host-styled) and the shared-key
 * Replace warning. Seen in Chrome 2026-10-26: unpicked chips drew as filled primary buttons, the
 * same as picked ones, and both blocks sat left of the row's indented fields. jsdom resolves no
 * cascade, so the stylesheet is asserted, like `selection-ring-css.unit.test.ts`.
 */
const css = readFileSync(resolve(process.cwd(), "src/styles/access-tokens.css"), "utf8");

describe("access tokens chips and warning", () => {
  it("an unpicked chip is an outlined pill; only a picked one is filled", () => {
    expect(effectiveDeclarationsFor(css, ".onboarding-chip")).toMatch(/background: var\(--surface\);/);
    expect(effectiveDeclarationsFor(css, '.onboarding-chip[aria-pressed="true"]')).toMatch(/background: var\(--primary\);/);
  });

  it("the chip label reads like the other field labels", () => {
    expect(effectiveDeclarationsFor(css, ".onboarding-chip-field__label")).toMatch(/text-transform: uppercase;/);
  });

  it("the chips and the Replace warning take the row's field indent", () => {
    const indent = /padding-left: calc\(1\.75rem \+ var\(--space-3\)\);/;
    expect(effectiveDeclarationsFor(css, ".access-tokens-row > .field")).toMatch(indent);
    expect(effectiveDeclarationsFor(css, ".access-tokens-row > .save-warning")).toMatch(indent);
    expect(effectiveDeclarationsFor(css, ".access-tokens-row > .field")).toMatch(/margin-top: var\(--space-4\);/);
  });
});
