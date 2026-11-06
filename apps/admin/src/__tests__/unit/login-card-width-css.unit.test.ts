import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file The sign-in and recovery cards must fit a 320px phone. `.login-card` was a fixed `width: 22rem`
 * (352px), so the document scrolled sideways at 320px. Asserted against the stylesheet: jsdom resolves
 * no cascade; the live check was Chrome.
 */
const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("login card width", () => {
  it("never exceeds its container", () => {
    const rule = /^\.login-card \{([^}]*)\}/m.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).not.toMatch(/(^|[;\s])width:\s*22rem/);
    expect(rule![1]).toMatch(/width:\s*min\(22rem,\s*100%\)/);
  });
});
