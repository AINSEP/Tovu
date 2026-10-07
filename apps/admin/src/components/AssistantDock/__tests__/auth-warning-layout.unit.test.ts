import { readFileSync } from "node:fs";
import { afterEach, expect, test } from "vitest";

const hostCss = readFileSync("src/styles/assistant.css", "utf8");
const packageSource = readFileSync("node_modules/@jini-ai/chat/src/react/features/chat-pane/styles.ts", "utf8");
// Injected after the host CSS in production: equal specificity would lose here too.
const packageCss = packageSource.slice(packageSource.indexOf(".jini-chat-pane .jini-composer-leading {"), packageSource.indexOf("@media (prefers-reduced-motion: reduce)", packageSource.indexOf(".jini-chat-pane .jini-composer-leading {")));

afterEach(() => { document.head.innerHTML = ""; document.body.innerHTML = ""; });

for (const [surface, width] of [["narrow dock", 280], ["wide dock", 520], ["mobile sheet", 350]] as const) {
  test(`D-21b: ${surface} gives the sign-in warning an uncapped wrapping block`, () => {
    document.head.innerHTML = `<style>${hostCss}</style><style>${packageCss}</style>`;
    document.body.innerHTML = `<div class="admin-chat-dock" style="width:${width}px"><div class="jini-chat-pane"><div class="jini-composer-leading"><p class="assistant-agent-auth-warning" role="status">Claude Code: Authentication required. Sign in before sending.</p><div class="jini-attachment-tray">Pinned skill</div></div><button class="jini-composer-attach">+</button><button class="jini-composer-send">Send</button></div></div>`;
    const leading = getComputedStyle(document.querySelector("div.jini-composer-leading")!);
    const warning = getComputedStyle(document.querySelector(".assistant-agent-auth-warning")!);
    expect(leading.height).not.toBe("34px");
    expect(leading.maxHeight).toBe("none");
    expect(leading.flexDirection).toBe("column");
    expect(warning.minWidth).toBe("0px");
    expect(warning.width).toBe("100%");
    expect(warning.whiteSpace).toBe("normal");
    expect(warning.overflowWrap).toBe("anywhere");
    expect(warning.color).toBe("var(--warning)");
    // jsdom does not resolve a var() background shorthand into its color longhand.
    const warningRule = Array.from(document.styleSheets[0]!.cssRules).find((rule) =>
      "selectorText" in rule && (rule as CSSStyleRule).selectorText === ".admin-chat-dock .jini-chat-pane .jini-composer-leading .assistant-agent-auth-warning",
    ) as CSSStyleRule;
    expect(warningRule.style.getPropertyValue("background")).toBe("var(--warning-bg)");
    const tray = getComputedStyle(document.querySelector(".jini-attachment-tray")!);
    expect(tray.minWidth).toBe("0px");
    expect(tray.maxWidth).toBe("100%");
    for (const selector of [".jini-composer-attach", ".jini-composer-send"]) {
      expect(getComputedStyle(document.querySelector(selector)!).height).toBe("34px");
    }
  });
}
