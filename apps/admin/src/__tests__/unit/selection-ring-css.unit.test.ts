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

  it("maps Jini's primary inputs to the brand primary, so every --jini-accent* token is orange", () => {
    const rootDeclarations = effectiveDeclarationsFor(stylesheet, ":root");
    expect(rootDeclarations).toMatch(/--jini-theme-light-primary\s*:\s*var\(--primary\)\s*;/);
    expect(rootDeclarations).toMatch(/--jini-theme-dark-primary\s*:\s*var\(--primary\)\s*;/);
  });

  it("selected-item text is the primary in light, the lighter primary in dark, and the primary again on the light-pinned Settings panel", () => {
    expect(effectiveDeclarationsFor(stylesheet, ":root")).toMatch(/--selected-text\s*:\s*var\(--primary\)\s*;/);
    expect(effectiveDeclarationsFor(stylesheet, ':root[data-theme="dark"]')).toMatch(/--selected-text\s*:\s*var\(--primary-strong\)\s*;/);
    const settings = sheets.find((sheet) => sheet.path === "styles/settings.css")!.css;
    expect(effectiveDeclarationsFor(settings, '.settings-ui-section[data-theme="light"]')).toMatch(/--selected-text\s*:\s*var\(--primary\)\s*;/);
  });

  it("the active sidebar label is the selected-text orange, nudged toward --fg for contrast on its tinted row", () => {
    expect(effectiveDeclarationsFor(stylesheet, ":root")).toMatch(
      /--selected-text-on-tint\s*:\s*color-mix\(in oklab, var\(--selected-text\) \d+%, var\(--fg\)\)\s*;/,
    );
    const declaration = effectiveDeclarationsFor(stylesheet, ".cms-item.active").match(/(?:^|; )color: ([^;]+);/);
    expect(declaration?.[1]).toBe("var(--selected-text-on-tint)");
  });

  it("the active sidebar icon wears the label's exact orange, not the darker ring that measured 2.96:1 on the dark tint", () => {
    const declaration = effectiveDeclarationsFor(stylesheet, ".cms-item.active svg").match(/(?:^|; )color: ([^;]+);/);
    expect(declaration?.[1]).toBe("var(--selected-text-on-tint)");
  });

  it.each([
    ["styles.css", '.tab-bar-item[aria-selected="true"]', "color"],
    ["styles.css", ".settings-ui-section .jini-tabbed-dialog--inline .jini-tabbed-dialog-nav-item.active", "color"],
    ["styles/forms.css", '.form-tab[aria-selected="true"]', "color"],
  ])("%s: %s draws its active-tab %s in the selected-text token", (path, selector, property) => {
    const css = sheets.find((sheet) => sheet.path === path)!.css;
    const declaration = effectiveDeclarationsFor(css, selector).match(new RegExp(`(?:^|; )${property}: ([^;]+);`));
    expect(declaration?.[1]).toBe("var(--selected-text)");
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
    ["styles.css", ".cms-item.active::before", "background"],
  ])("%s: %s draws its %s in the ring token", (path, selector, property) => {
    const css = sheets.find((sheet) => sheet.path === path)!.css;
    const declaration = effectiveDeclarationsFor(css, selector).match(new RegExp(`(?:^|; )${property}: ([^;]+);`));
    expect(declaration?.[1]).toMatch(RING);
  });

  it("fills the selected Access Tokens category pill with the primary, not the near-black accent", () => {
    const css = sheets.find((sheet) => sheet.path === "styles/access-tokens.css")!.css;
    expect(effectiveDeclarationsFor(css, '.access-tokens-category-filter-item[aria-selected="true"]')).toMatch(
      /background: var\(--primary\); color: var\(--primary-ink\);/,
    );
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
