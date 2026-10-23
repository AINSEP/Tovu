import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * Host CSS contract for 0132bd6f0 / caee43ecb. jsdom has no layout engine, so these guards
 * pin the positioning and scroll clearance that keep the last row out from under the controls.
 * A vertical stack above the FAB exceeded the reserved 88px; the shared 32px buttons must sit
 * beside it. The spacer must remain when the dock opens, because the jump buttons remain too.
 */
const root = resolve(process.cwd(), "src");
const stylesheet = readFileSync(resolve(root, "styles.css"), "utf8");
const assistantStyles = readFileSync(resolve(root, "styles/assistant.css"), "utf8");
const bridgeStyles = readFileSync(resolve(root, "styles/admin-theme-bridge.css"), "utf8");
const closedLayout = ".admin-layout:not(:has(.admin-chat-dock.is-open))";

describe("admin scroll jump host layout", () => {
  it("anchors a horizontal pair beside the FAB within the reserved bottom band", () => {
    const column = effectiveDeclarationsFor(stylesheet, ".admin-main-col");
    expect(column).toContain("position: relative;");
    expect(column).toContain("--jini-scroll-jump-direction: row;");
    expect(column).toContain("--jini-scroll-jump-right: calc(var(--admin-chat-fab-inset, 20px) + var(--admin-chat-fab-size, 56px) + 10px);");
    expect(column).toContain("--jini-scroll-jump-bottom: calc(var(--admin-chat-fab-inset, 20px) + (var(--admin-chat-fab-size, 56px) - 32px) / 2 + env(safe-area-inset-bottom, 0px));");
    const fabTokens = effectiveDeclarationsFor(assistantStyles, ":root");
    expect(fabTokens).toContain("--admin-chat-fab-size: 56px;");
    expect(fabTokens).toContain("--admin-chat-fab-inset: 20px;");
    expect(effectiveDeclarationsFor(bridgeStyles, ":root")).toContain("--assistant-clearance: 88px;");
  });

  it("moves the pair into the content column's corner when the open dock hides the FAB", () => {
    const open = effectiveDeclarationsFor(stylesheet, ".admin-layout.hides-fab-while-open:has(.admin-chat-dock.is-open) .admin-main-col");
    expect(open).toContain("--jini-scroll-jump-right: 16px;");
    expect(open).toContain("--jini-scroll-jump-bottom: calc(16px + env(safe-area-inset-bottom, 0px));");
  });

  it.each(["(min-width: 641px)", "(max-width: 640px)"])("%s keeps a scrollable last-row spacer with either dock state", (query) => {
    const blocks: string[] = [];
    parse(stylesheet).walkAtRules("media", (rule) => {
      if (rule.params === query) blocks.push(rule.toString());
    });
    const spacer = effectiveDeclarationsFor(blocks.join("\n"), ".admin-content::after");
    expect(spacer).toContain('content: "";');
    expect(spacer).toContain("display: block;");
    expect(spacer).toContain("flex-shrink: 0;");
    expect(spacer).toContain("height: var(--assistant-clearance);");
  });

  it("reserves clearance plus the safe area as phone padding when the closed dock removes the spacer", () => {
    const blocks: string[] = [];
    parse(stylesheet).walkAtRules("media", (rule) => {
      if (rule.params === "(max-width: 640px)") blocks.push(rule.toString());
    });
    const phone = blocks.join("\n");
    expect(effectiveDeclarationsFor(phone, `${closedLayout} .admin-content`))
      .toContain("padding-bottom: calc(var(--assistant-clearance) + env(safe-area-inset-bottom, 0px));");
    expect(effectiveDeclarationsFor(phone, `${closedLayout} .admin-content::after`))
      .toContain("display: none;");
  });
});
