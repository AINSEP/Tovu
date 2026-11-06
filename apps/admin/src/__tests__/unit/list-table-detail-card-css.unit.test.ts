import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file A phone card's detail line holding a checkbox (an export's "I understand") must still take
 * the card's full width. The checkbox-title rule matched that line's first cell and set `flex: 0 0 auto`,
 * which beat the detail rule on specificity, so the cell grew to its text's full width (1129px at 390px)
 * and clipped the notice. Asserted against the stylesheet: jsdom resolves no cascade; the live check was Chrome.
 */
const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("list-table phone card detail line", () => {
  it("keeps the checkbox-title rule off the detail row", () => {
    const rule = /(table\.list-table > tbody > tr[^{},]*> td:first-child:has\(input\[type="checkbox"\]\)) \{ flex: 0 0 auto; \}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain("tr:not(.list-table-detail)");
  });
});
