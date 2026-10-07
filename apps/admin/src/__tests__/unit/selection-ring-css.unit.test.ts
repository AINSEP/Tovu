import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * @file Selected/active outlines are brand orange through one token, `--selected-ring` (owner,
 * 2026-10-06: a picked CLI card drew a near-black border). Asserted against the stylesheets, like
 * `focus-ring-css.unit.test.ts`: jsdom resolves no cascade, so the live check was done in Chrome.
 */

/** From `process.cwd()` for the reason `sidebar-accordion-css.unit.test.ts` gives. */
const root = resolve(process.cwd(), "src");
const stylesheet = readFileSync(resolve(root, "styles.css"), "utf8");
const sheets = [
  "styles.css",
  ...readdirSync(resolve(root, "styles"))
    .filter((name) => name.endsWith(".css"))
    .map((name) => `styles/${name}`),
].map((path) => ({ path, css: readFileSync(resolve(root, path), "utf8") }));

const RING = /var\(--selected-ring\)/;

describe("admin selection ring", () => {
  it("defines the ring as the brand primary", () => {
    expect(effectiveDeclarationsFor(stylesheet, ":root")).toMatch(/--selected-ring\s*:\s*var\(--primary\)\s*;/);
  });

  it.each([
    ["styles/settings.css", ":root .jini-agent-card.is-selected", "border-color"],
    ["styles/settings.css", ":root .jini-agent-card.is-selected", "box-shadow"],
    ["styles/settings.css", ":root .jini-accent-swatch.active", "box-shadow"],
    ["styles/settings.css", ":root .filter-pill.active", "border-color"],
    ["styles.css", '.tab-bar-item[aria-selected="true"]', "border-bottom-color"],
    ["styles.css", ".settings-ui-section .jini-tabbed-dialog--inline .jini-tabbed-dialog-nav-item.active", "border-bottom-color"],
    ["styles.css", ".settings-ui-section .jini-settings-language-tile.active", "border-color"],
    ["styles.css", '.agent-plugin-source-content-header button[aria-pressed="true"]', "border-color"],
    ["styles.css", ".site-db-option.is-selected", "border-color"],
    ["styles/forms.css", '.form-tab[aria-selected="true"]', "border-bottom-color"],
  ])("%s: %s draws its %s in the ring token", (path, selector, property) => {
    const css = sheets.find((sheet) => sheet.path === path)!.css;
    const declaration = effectiveDeclarationsFor(css, selector).match(new RegExp(`(?:^|; )${property}: ([^;]+);`));
    expect(declaration?.[1]).toMatch(RING);
  });

  it("no selected-state outline anywhere in the admin is drawn in a near-black accent", () => {
    const state = /(\.active|\.is-selected|\.is-active|\.selected\b|\[aria-(?:selected|pressed|checked|current)[^\]]*\]|:checked)/;
    const edge = /^(?:border(?:-(?:top|bottom|left|right))?(?:-color)?|outline(?:-color)?|box-shadow)$/;
    const dark = /var\(--(?:accent|accent-text|jini-accent|jini-text-strong|fg)\)/;
    const offenders: string[] = [];
    for (const { path, css } of sheets) {
      parse(css).walkRules((rule) => {
        const selected = rule.selectors.filter((selector) => state.test(selector.split(/\s+/).pop()!));
        if (selected.length === 0) return;
        for (const node of rule.nodes) {
          if (node.type === "decl" && edge.test(node.prop) && dark.test(node.value)) {
            offenders.push(`${path}: ${selected.join(", ")} { ${node.prop}: ${node.value} }`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
