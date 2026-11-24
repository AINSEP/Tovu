import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * rv1123l T11: the policies table moved to Jini (`@jini-ai/admin` `roles/PoliciesSection.tsx`) and renders
 * its own table class instead of `.list-table`. Tovu's `.list-table` desktop detail/row-action rules and the
 * mobile card layout must also match that moved markup, or the table silently loses them. The class is read
 * from the shipped markup, so a rename in Jini fails here instead of un-styling the table.
 */
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../../styles.css"), "utf8");
const markup = readFileSync(resolve(here, "../../../node_modules/@jini-ai/admin/src/roles/PoliciesSection.tsx"), "utf8");
const tableClass = /<table className="([^"]+)"/.exec(markup)?.[1] ?? "";
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whether some rule's selector list (the text before `{`) names this selector. */
const hasSelector = (selector: string) => new RegExp(`(^|[,}/]\\s*|\\n\\s*)${escape(selector)}\\s*[,{]`).test(css);
// The mobile card layout starts at its scroll-container override (inside the narrow-width media block).
const mobile = css.slice(css.indexOf(".table-scroll:has(> table.list-table)"));

describe("moved policies table keeps the list-table states", () => {
  it("reads the moved table class from the Jini markup", () => {
    expect(tableClass).toBe("jini-roles-list-table");
  });

  it.each([
    `.${tableClass} tbody tr:hover`,
    `.${tableClass} tbody tr:has(+ .list-table-detail) td`,
    `.${tableClass} .list-table-detail > td`,
    `.${tableClass} td button:not([class*="btn-"]):not(.link-button)`,
    `.${tableClass} td button:not([class*="btn-"]):not(.link-button):hover`,
  ])("desktop: %s", (selector) => {
    expect(hasSelector(selector)).toBe(true);
  });

  it.each([
    `table.${tableClass}`,
    `table.${tableClass} > thead:not(:has(button, input))`,
    `table.${tableClass} > tbody > tr`,
    `table.${tableClass} > tbody > tr:has(+ .list-table-detail)`,
    `table.${tableClass} > tbody > tr > td`,
    `table.${tableClass} > tbody > tr > td:last-child:not(:first-child):has(button, a, select)`,
  ])("responsive: %s", (selector) => {
    expect(new RegExp(`(^|[,}/]\\s*|\\n\\s*)${escape(selector)}\\s*[,{]`).test(mobile)).toBe(true);
  });
});
