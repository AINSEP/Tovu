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

/** Collects every declaration block for a selector, tolerating the multi-selector
 *  `.jini-message-ext-events,\n.mcpui-surface-card { ... }` shape used below. */
function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[,{}])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "gm");
  return [...stylesheet.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(re)].map((match) => match[1]).join(";\n");
}

/** Guard later overrides of the same selector, including ones inside media queries. This is
 * declaration coverage; browser geometry is still needed for the full cascade/layout. */
function lastDeclaration(rule: string, property: string): string | undefined {
  const declarations = [...rule.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))];
  return declarations.at(-1)?.[1]?.trim();
}

/** The dock's flex layout replaces Jini's controls overlay at every viewport width.
 * Check the more-specific capture-wrapper rule too: its shorthand wins over the pane rule.
 * These are declaration guards; jsdom cannot prove desktop/375px scroll geometry. */
describe("chat dock composer stays at the bottom", () => {
  it("keeps a zero length flex basis through the capture wrapper instead of overriding it with flex: 1", () => {
    const pane = ruleFor(".admin-chat-dock .jini-chat-pane");
    const capturedPane = ruleFor(".admin-chat-dock > .admin-chat-dock-drop > .jini-chat-pane");
    expect(lastDeclaration(pane, "display")).toBe("flex");
    expect(lastDeclaration(pane, "flex-direction")).toBe("column");
    expect(lastDeclaration(pane, "flex")).toBe("1 1 0");
    expect(lastDeclaration(pane, "height")).toBe("auto");
    expect(lastDeclaration(pane, "min-height")).toBe("0");
    expect(lastDeclaration(capturedPane, "flex")).toBe("1 1 0");
  });

  it("owns a shrinking flex column so scrollback fills free space and the composer reserves its actual height", () => {
    const body = ruleFor(".admin-chat-dock .jini-chat-pane__body");
    expect(lastDeclaration(body, "display")).toBe("flex");
    expect(lastDeclaration(body, "flex-direction")).toBe("column");
    expect(lastDeclaration(body, "flex")).toBe("1 1 0");
    expect(lastDeclaration(body, "min-height")).toBe("0");
    // `clip`, not `hidden`: a hidden box still scrolls programmatically (focus/scrollIntoView),
    // which floated the composer mid-dock during a run with blank dock below it.
    expect(lastDeclaration(body, "overflow")).toBe("clip");
    const list = ruleFor(".admin-chat-dock .jini-chat-pane .jini-message-list");
    const controls = ruleFor(".admin-chat-dock .jini-chat-pane__controls");
    expect(lastDeclaration(list, "flex")).toBe("1 1 0");
    expect(lastDeclaration(list, "height")).toBe("auto");
    expect(lastDeclaration(list, "min-height")).toBe("0");
    expect(lastDeclaration(list, "overflow-y")).toBe("auto");
    expect(lastDeclaration(list, "padding-bottom")).toBe("8px");
    expect(lastDeclaration(controls, "flex")).toBe("0 0 auto");
    expect(lastDeclaration(controls, "position")).toBe("static");
    expect(lastDeclaration(controls, "margin-top")).toBe("auto");
    expect(lastDeclaration(ruleFor(".admin-chat-dock .jini-message-list > *"), "flex-shrink")).toBe("0");
  });

  it("lets no box between the dock and the transcript scroll, so the composer cannot ride up mid-run", () => {
    expect(lastDeclaration(ruleFor(".admin-chat-dock"), "overflow")).toBe("clip");
    expect(lastDeclaration(ruleFor(".admin-chat-dock .jini-chat-pane"), "overflow")).toBe("clip");
    expect(lastDeclaration(ruleFor(".admin-chat-dock .jini-chat-pane__body"), "overflow")).toBe("clip");
  });
});

describe("chat pane horizontal-overflow fix", () => {
  it("stops .jini-message-list from becoming a horizontal scroll container for the whole transcript", () => {
    const rule = ruleFor(".jini-message-list");
    expect(rule).toMatch(/overflow-x\s*:\s*hidden/);
    expect(lastDeclaration(rule, "overflow-x")).toBe("hidden");
  });

  it("lets an unbroken long token (a URL, a hash) wrap inside a message bubble instead of forcing the bubble wide", () => {
    const rule = ruleFor(".jini-message-content");
    expect(rule).toMatch(/overflow-wrap\s*:\s*anywhere/);
    expect(lastDeclaration(rule, "overflow-wrap")).toBe("anywhere");
  });

  it("gives a fenced code block (Markdown.tsx's bare <pre><code>, styled nowhere else) its own local horizontal scrollbar", () => {
    const rule = ruleFor(".jini-message-content pre");
    expect(rule).toMatch(/overflow-x\s*:\s*auto/);
    expect(rule).toMatch(/max-width\s*:\s*100%/);
    expect(lastDeclaration(rule, "overflow-x")).toBe("auto");
    expect(lastDeclaration(rule, "max-width")).toBe("100%");
  });

  it("caps the MCP-UI surface card and its ext-event wrapper at the message row's own width", () => {
    const rule = ruleFor(".mcpui-surface-card");
    expect(rule).toMatch(/max-width\s*:\s*100%/);
    expect(lastDeclaration(rule, "max-width")).toBe("100%");
    const wrapperRule = ruleFor(".jini-message-ext-events");
    expect(wrapperRule).toMatch(/max-width\s*:\s*100%/);
    expect(lastDeclaration(wrapperRule, "max-width")).toBe("100%");
  });

  it("keeps an MCP-UI surface's iframe at exactly the card's width whatever px width the View reported", () => {
    // Owner bug 2026-10-08: `@mcp-ui/client`'s AppFrame writes a View's reported width onto the
    // iframe as inline `style.width = Npx`. Mounted in a hidden pane after a reload, the ask-choice
    // card reported its min-content width and stayed pinned at 192px in a ~540px panel. Inline
    // `width` loses to `min-width`/`max-width`, so these two declarations clamp it back to 100%.
    const rule = ruleFor(".mcpui-surface-card iframe");
    expect(lastDeclaration(rule, "min-width")).toBe("100%");
    expect(lastDeclaration(rule, "max-width")).toBe("100%");
  });
});
