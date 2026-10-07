import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";

import { resolveChatFabClearance } from "../../App.hooks";

/**
 * @file Settings → User Interface's "Hide the chat button while the chat is open" (owner,
 * 2026-10-06), the shell half. On (default): the FAB hides while the dock is open, at both widths.
 * Off: it stays in its own spot over the open dock, and the composer footer leaves room for it so
 * Send and the runtime picker stay clear. jsdom has no layout, so the CSS half pins rule text; the
 * pixel result was checked in Chrome at 1000px and 390px.
 */

const assistantCss = readFileSync(resolve(process.cwd(), "src/styles/assistant.css"), "utf8");
const stylesCss = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

function rulesFor(stylesheet: string, selector: string): { media: string | null; body: string }[] {
  const found: { media: string | null; body: string }[] = [];
  parse(stylesheet).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    const parent = rule.parent;
    const media = parent?.type === "atrule" ? (parent as unknown as { params: string }).params : null;
    found.push({ media, body: rule.nodes.map((node) => node.toString()).join("; ") });
  });
  return found;
}

describe("hide-while-open CSS is gated on the preference class", () => {
  const gated = ".admin-layout.hides-fab-while-open .admin-chat-dock.is-open + .chat-fab";
  const ungated = ".admin-layout .admin-chat-dock.is-open + .chat-fab";

  it("hides the FAB while open on desktop only under .hides-fab-while-open", () => {
    expect(rulesFor(assistantCss, gated)).toEqual([{ media: "(width > 640px)", body: "display: none" }]);
    expect(rulesFor(assistantCss, ungated)).toEqual([]);
  });

  it("hides the FAB while the phone sheet is open only under .hides-fab-while-open", () => {
    expect(rulesFor(stylesCss, gated)).toEqual([{ media: "(max-width: 640px)", body: "display: none" }]);
    expect(rulesFor(stylesCss, ungated)).toEqual([]);
  });

  it("gives the composer footer room for the FAB only when the setting is off", () => {
    const room = rulesFor(assistantCss, ".admin-layout:not(.hides-fab-while-open) .admin-chat-dock.is-open .jini-composer-footer");
    expect(room).toEqual([
      {
        media: null,
        body: "padding-right: calc(var(--admin-chat-fab-size) + var(--admin-chat-fab-inset) + 8px - var(--admin-chat-composer-edge))",
      },
    ]);
  });

  it("keeps the inset token equal to the FAB hook's edge margin", async () => {
    const { FAB_EDGE_MARGIN } = await import("../../components/ChatFab/ChatFab.hooks");
    let inset: string | undefined;
    parse(assistantCss).walkDecls("--admin-chat-fab-inset", (decl) => {
      inset = decl.value;
    });
    expect(inset).toBe(`${FAB_EDGE_MARGIN}px`);
  });
});

describe("resolveChatFabClearance", () => {
  const base = { chatOpen: true, sheetHeightPx: 400, dockWidthPx: 380 };

  it("pushes the FAB clear of the open dock or sheet while the setting is on (default)", () => {
    expect(resolveChatFabClearance({ ...base, isSheetMode: false })).toEqual({ avoidBottomPx: 0, avoidRightPx: 380 });
    expect(resolveChatFabClearance({ ...base, isSheetMode: true })).toEqual({ avoidBottomPx: 400, avoidRightPx: 0 });
  });

  it("leaves the FAB in its own spot over the open dock when the setting is off", () => {
    expect(resolveChatFabClearance({ ...base, isSheetMode: false, fabHidesWhileOpen: false })).toEqual({ avoidBottomPx: 0, avoidRightPx: 0 });
    expect(resolveChatFabClearance({ ...base, isSheetMode: true, fabHidesWhileOpen: false })).toEqual({ avoidBottomPx: 0, avoidRightPx: 0 });
  });
});
