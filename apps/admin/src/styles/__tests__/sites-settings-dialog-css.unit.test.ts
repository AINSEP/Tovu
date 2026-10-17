import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file Static CSS-source pin for the Sites settings dialog's phone sticky footer, which jsdom cannot
 * lay out (`css: false`, same reasoning as `expanded-code-viewer-css.unit.test.ts`). Sticky
 * `bottom: 0` stops at the scroller's padding edge, so at short phone heights scrolled fields showed
 * through Jini's 18px content bottom padding under Save (UI lane, 2026-10-17).
 */

const css = readFileSync(path.resolve(__dirname, "../sites-settings.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const phone = css.slice(css.indexOf("@media (max-width: 40rem)"));

describe("Sites settings dialog phone CSS", () => {
  it("keeps the footer sticky and drops the content's bottom padding it would float above", () => {
    expect(phone).toMatch(/\.sites-settings-footer \{[^}]*position: sticky; bottom: 0;/);
    expect(phone).toMatch(
      /\.jini-tabbed-dialog\.sites-settings-dialog:not\(\.jini-tabbed-dialog--inline\) \.jini-tabbed-dialog-content \{\s*padding-bottom: 0;\s*\}/,
    );
  });
});
