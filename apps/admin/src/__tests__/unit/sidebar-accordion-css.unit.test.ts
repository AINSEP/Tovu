import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file Guards the one accordion invariant that lives in CSS and cannot be asserted by rendering.
 *
 * ## Why this is a text assertion over a stylesheet rather than a component test
 *
 * `Sidebar.tsx` hides a closed section with `hidden={!open}`, which works ONLY because the browser's
 * UA stylesheet carries `[hidden] { display: none }`. Any author-level `display` declaration beats
 * the UA sheet outright — not on specificity, but because author styles win over UA styles by
 * cascade origin. So `.cms-section-items { display: flex }` in this file's own stylesheet silently
 * defeats `hidden`: the button still toggles, `aria-expanded` still flips, the attribute still lands
 * in the DOM, and the items never disappear. That was a real regression, shipped and caught by the
 * owner rather than by the suite.
 *
 * No component test can catch it, and that is the point worth recording: the component lives in
 * `@jini-ai/admin` (a different package, whose jsdom tests never load this stylesheet), and this
 * stylesheet lives here (where nothing renders that component). Both sides are individually green
 * while the composed product is broken. jsdom would not help even if they were co-located — it
 * applies `[hidden]` semantics without doing real cascade resolution against a `display` override.
 *
 * So the invariant is asserted where it actually lives: if something gives `.cms-section-items` a
 * `display`, something must also restore `display: none` under `[hidden]`.
 */

/** Resolved from `process.cwd()` (this package's root, where Vitest is configured and run) rather
 *  than `import.meta.url` — Vitest transforms this module with a non-`file:` module URL, so
 *  `fileURLToPath` throws "The URL must be of scheme file" here. */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("sidebar accordion stylesheet", () => {
  it("restores [hidden] whenever .cms-section-items is given a display", () => {
    const declaresDisplay = /\.cms-section-items\s*(?:,[^{]*)?\{[^}]*\bdisplay\s*:/.test(stylesheet);
    const restoresHidden = /\.cms-section-items\[hidden\]\s*\{[^}]*display\s*:\s*none/.test(stylesheet);

    // Not "the rule exists" but "the rule exists IF it is needed" — a future refactor that drops the
    // flex layout entirely may legitimately drop the override with it, and this should not fail then.
    if (declaresDisplay) {
      expect(
        restoresHidden,
        ".cms-section-items sets `display`, which overrides the UA stylesheet's `[hidden] { display: none }` " +
          "and silently breaks the collapsible sidebar sections. Add `.cms-section-items[hidden] { display: none; }`."
      ).toBe(true);
    }
  });

  it("styles the collapsible heading as a button reset, so it does not inherit the UA font", () => {
    // `.cms-group-toggle` is a real <button>; without `font: inherit` the browser's own control font
    // overrides `.cms-group`'s 10px uppercase treatment and the heading visibly changes size the
    // moment a section becomes collapsible.
    const toggleRule = /\.cms-group-toggle\s*\{[^}]*\}/.exec(stylesheet)?.[0] ?? "";
    expect(toggleRule).toMatch(/font\s*:\s*inherit/);
  });
});
