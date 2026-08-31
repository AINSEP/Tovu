import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file Regression coverage for the chat-pane horizontal-overflow bug (owner-reported, live,
 * 2026-08-30): the assistant chat pane could be scrolled horizontally "far", which the owner
 * reasonably expected only from a genuinely wide table, not ordinary chat content.
 *
 * Root cause, confirmed live against the real running dock via `scrollWidth`/`clientWidth`
 * measurement at every ancestor (see `assistant.css`'s own comment on `.jini-message-list` for the
 * full account): `.jini-message-list` set only `overflow-y`, which the CSS Overflow spec computes
 * to force `overflow-x` to `auto` too — making the WHOLE transcript a horizontal scroll container
 * for any one message's wide content (a fenced code block with a long unbroken line — what an
 * owner-authored ASCII/box-drawing table looks like once `Markdown.tsx` renders it, since that
 * component has no GFM pipe-table parser — or a long unbroken token in plain text, e.g. a URL).
 *
 * This is a pure-CSS invariant (`overflow-x`/`overflow-wrap` declarations on specific rules), the
 * same class of thing `sidebar-accordion-css.unit.test.ts`/`narrow-content-column-css.unit.test.ts`
 * document at length: no component test can exercise the failure because it depends on real
 * intrinsic-content-width layout math jsdom does not perform (`scrollWidth`/`clientWidth` are
 * always 0 there), so — like those files — this asserts the declaration exists as text over the
 * stylesheet instead.
 */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles/assistant.css"), "utf8");

/** Extracts a rule's declaration block by selector, tolerating the multi-selector
 *  `.jini-message-ext-events,\n.mcpui-surface-card { ... }` shape used below. */
function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[,{}])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "m");
  return re.exec(stylesheet)?.[1] ?? "";
}

describe("chat pane horizontal-overflow fix", () => {
  it("stops .jini-message-list from becoming a horizontal scroll container for the whole transcript", () => {
    const rule = ruleFor(".jini-message-list");
    expect(rule).toMatch(/overflow-x\s*:\s*hidden/);
  });

  it("lets an unbroken long token (a URL, a hash) wrap inside a message bubble instead of forcing the bubble wide", () => {
    const rule = ruleFor(".jini-message-content");
    expect(rule).toMatch(/overflow-wrap\s*:\s*anywhere/);
  });

  it("gives a fenced code block (Markdown.tsx's bare <pre><code>, styled nowhere else) its own local horizontal scrollbar", () => {
    const rule = ruleFor(".jini-message-content pre");
    expect(rule).toMatch(/overflow-x\s*:\s*auto/);
    expect(rule).toMatch(/max-width\s*:\s*100%/);
  });

  it("caps the MCP-UI surface card and its ext-event wrapper at the message row's own width", () => {
    const rule = ruleFor(".mcpui-surface-card");
    expect(rule).toMatch(/max-width\s*:\s*100%/);
  });
});
