import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file Static CSS-source regression test for `styles/external-mcp-tool-picker.css` — the same
 * pattern `styles/__tests__/see-more-css.unit.test.ts` uses, for the same reason: this suite runs
 * under `environment: "jsdom"` with `css: false` (`vitest.config.ts`), so a component test's
 * `getByText` assertion passes whether or not a control is actually legible, and jsdom has no real
 * layout engine regardless.
 *
 * This pins the two properties that failed silently on the sibling settings card (Jini `b82cbe95`):
 * a control that declares `background`/`border` but not `color` loses only `color` back to this
 * app's global `button { background: var(--primary); color: var(--primary-ink); }` reset
 * (`styles.css:279`), which reads as invisible near-white-on-near-white text rather than a crash —
 * and the two layout properties (`max-height`/`overflow-y` on the scroll container, `overflow-wrap`
 * on long-content rows) that jsdom cannot verify through a rendered component at all.
 */

const CSS_PATH = path.resolve(__dirname, "../external-mcp-tool-picker.css");

/** Strips `/* ... *\/` comments, the same well-formed-comment-only removal `see-more-css.unit.test.ts`
 *  documents the reasoning for — a real parser's error-recovery rules are not relevant here since
 *  this file has no unterminated comments, but stripping only balanced ones keeps this function
 *  honest about that rather than assuming it.
 *  @complexity O(n) over the input length. */
function stripComments(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    if (css[i] !== "/" || css[i + 1] !== "*") {
      out += css[i];
      i++;
      continue;
    }
    const end = css.indexOf("*/", i + 2);
    i = end === -1 ? css.length : end + 2; // unterminated comment: swallow to EOF, same as a real parser
  }
  return out;
}

interface RuleBlock {
  selector: string;
  body: string;
}

/** Every top-level `selector { ...declarations... }` block, in source order. This stylesheet has no
 *  at-rules or nested blocks, so a flat brace-matched split is sufficient — same simplifying
 *  assumption `see-more-css.unit.test.ts`'s own `extractRulePreludes` makes for its (also flat)
 *  stylesheet.
 *  @complexity O(n) over the input length. */
function ruleBlocks(css: string): RuleBlock[] {
  const stripped = stripComments(css);
  const blocks: RuleBlock[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stripped)) !== null) {
    blocks.push({ selector: match[1]!.trim(), body: match[2]! });
  }
  return blocks;
}

function findRule(blocks: RuleBlock[], selector: string): RuleBlock | undefined {
  return blocks.find((block) => block.selector === selector);
}

describe("styles/external-mcp-tool-picker.css", () => {
  const blocks = ruleBlocks(readFileSync(CSS_PATH, "utf8"));

  // Selectors the global `button` reset would otherwise win `color` on if any of these declared
  // `background`/`border` without it — see this file's header.
  const CONTROL_SELECTORS = [
    ".external-mcp-tool-actions button",
    ".external-mcp-tool-actions .btn-secondary",
    ".external-mcp-tool-enable",
    ".external-mcp-tool-row[data-locked] .external-mcp-tool-enable",
    ".external-mcp-tool-write",
    // `ExternalMcpSourceRow`'s own per-server "Tools" trigger (2026-09-10) — a bare `<button>`,
    // subject to the same global reset as every other control pinned above.
    ".external-mcp-source-tools-open",
  ];

  it.each(CONTROL_SELECTORS)("%s declares color explicitly", (selector) => {
    const block = findRule(blocks, selector);
    expect(block, `no rule found for selector: ${selector}`).toBeDefined();
    expect(block!.body).toMatch(/(?:^|;|\s)color\s*:/);
  });

  it("the tool list is a fixed-height, vertically-scrolling container — the live higgsfield connection advertises 101 tools", () => {
    const block = findRule(blocks, ".external-mcp-tool-list");
    expect(block).toBeDefined();
    expect(block!.body).toMatch(/max-height\s*:/);
    expect(block!.body).toMatch(/overflow-y\s*:\s*auto/);
  });

  it("long tool names and descriptions wrap instead of clipping or truncating", () => {
    for (const selector of [".external-mcp-tool-name", ".external-mcp-tool-description"]) {
      const block = findRule(blocks, selector);
      expect(block, `no rule found for selector: ${selector}`).toBeDefined();
      expect(block!.body).toMatch(/overflow-wrap\s*:\s*anywhere/);
      expect(block!.body).not.toMatch(/text-overflow\s*:\s*ellipsis/);
      expect(block!.body).not.toMatch(/overflow\s*:\s*hidden/);
      expect(block!.body).not.toMatch(/white-space\s*:\s*nowrap/);
    }
  });
});
