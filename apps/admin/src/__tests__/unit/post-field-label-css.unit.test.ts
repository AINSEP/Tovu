import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "postcss";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * @file The post editor's labels (`PostAuthorFields`, `PostPublishAtField`) render from
 * `@jini-ai/admin` with `jini-field-label`, not the admin's bare `field-label`. They must keep the
 * shared label face and every post-specific layout rule, which now target the `jini-*` class.
 * Asserted as text over the stylesheets, like `select-panel-surface-css`.
 */
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const editor = readFileSync(resolve(process.cwd(), "src/styles/editor.css"), "utf8");
const POST_LABEL = ".jini-post-publishing__field > .jini-field-label";
const FACE = ["font-size: var(--text-2xs);", "font-weight: 600;", "letter-spacing: 0.06em;", "text-transform: uppercase;", "color: var(--muted);"];

function selectorsIn(stylesheet: string): string[] {
  const selectors: string[] = [];
  parse(stylesheet).walkRules((rule) => { selectors.push(...rule.selectors); });
  return selectors;
}

describe("post editor field labels", () => {
  it("share the admin field-label face and drop their margin", () => {
    const shared = effectiveDeclarationsFor(styles, ".field-label");
    const post = effectiveDeclarationsFor(styles, POST_LABEL);
    for (const declaration of FACE) {
      expect(shared).toContain(declaration);
      expect(post).toContain(declaration);
    }
    expect(post).toContain("margin: 0;");
  });

  it("keep the narrow-screen and checkbox layout rules on the jini-* class", () => {
    expect(effectiveDeclarationsFor(styles, ".jini-post-publishing__fields .jini-field-label")).toBe("flex-basis: 100%; text-align: left;");
    expect(effectiveDeclarationsFor(editor, '.post-settings-panel .jini-post-publishing__field:has(> input[type="checkbox"]) > .jini-field-label')).toBe("flex-basis: auto;");
  });

  it("leave no post-specific selector on the old bare class", () => {
    const stale = [...selectorsIn(styles), ...selectorsIn(editor)].filter((selector) => selector.includes("jini-post-publishing") && /\.field-label\b/.test(selector));
    expect(stale).toEqual([]);
  });
});
