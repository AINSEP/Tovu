import { readFileSync } from "node:fs";
import path from "node:path";
import type { CSSProperties } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ChatPane, registerMidRunUserMessageRenderer, type ChatTransport } from "@jini-ai/chat/react";
import { CLASSIC_ROOT, effectiveDeclarationsFor } from "../../__tests__/unit/css-declarations.test-helper";

// Vitest rewrites import.meta.url to the jsdom origin; resolve from the test's filesystem path.
const adminCss = readFileSync(path.resolve(__dirname, "../assistant.css"), "utf8");
const themeCss = readFileSync(path.resolve(__dirname, "../../admin-themes/classic/chat.css"), "utf8");
let unregister: (() => void) | undefined;

afterEach(() => { cleanup(); unregister?.(); });

it.each([
  { theme: "light", accent: "#222", ink: "#fff" },
  { theme: "dark", accent: "#fff", ink: "#000" },
])("keeps user bubbles black with white text and ordinary message spacing in the $theme accent palette", ({ theme, accent, ink }) => {
  unregister = registerMidRunUserMessageRenderer();
  const transport: ChatTransport = {
    startRun: async () => ({ runId: "unused" }), reattachRun: async () => {},
    fetchRunStatus: async () => null, stopRun: async () => {},
  };
  const { container } = render(<div className="admin-chat-dock" data-theme={theme}
    style={{ '--accent': accent, '--accent-ink': ink } as CSSProperties}>
    <style>{adminCss}</style>
    <ChatPane transport={transport} agents={[{ id: "claude", name: "Claude Code" }]} initialMessages={[
      { id: "user", role: "user", content: "A long **markdown** message\n\nwith multiple lines" },
      { id: "assistant", role: "assistant", content: "", runStatus: "succeeded", events: [
        { kind: "tool_use", id: "tool", name: "site_guide", input: {} },
        { kind: "tool_result", toolUseId: "tool", content: "done", isError: false },
        { kind: "ext", name: "user_message", data: { id: "mid", text: "use sqlite" } },
      ] },
      { id: "following-user", role: "user", content: "The next ordinary message" },
    ]} />
  </div>);
  const bubbles = container.querySelectorAll('.jini-message-user .jini-message-content');
  expect(bubbles).toHaveLength(3);
  const pane = container.querySelector('.jini-chat-pane')!;
  // Raw style injection does not load @import, and jsdom does not resolve var(); check both ends.
  expect(getComputedStyle(pane).getPropertyValue('--jini-chat-user-bubble')).toBe('var(--jini-theme-chat-user-bubble)');
  expect(getComputedStyle(pane).getPropertyValue('--jini-chat-user-bubble-ink')).toBe('var(--jini-theme-chat-user-bubble-ink)');
  const themeDeclarations = effectiveDeclarationsFor(themeCss, CLASSIC_ROOT);
  expect(themeDeclarations).toMatch(/--jini-theme-chat-user-bubble:\s*#1a1b1c\s*;/);
  expect(themeDeclarations).toMatch(/--jini-theme-chat-user-bubble-ink:\s*#fff\s*;/);
  const rules = Array.from(container.querySelector<HTMLStyleElement>('.jini-chat-pane style')!.sheet!.cssRules) as CSSStyleRule[];
  const rule = rules.find(rule => rule.selectorText === '.jini-chat-pane .jini-message-user .jini-message-content')!;
  // The package rule consumes the host tokens for both DOM shapes; jsdom does not resolve var().
  expect(rule.style.getPropertyValue('background')).toBe('var(--jini-chat-user-bubble, #1a1b1c)');
  expect(rule.style.getPropertyValue('color')).toBe('var(--jini-chat-user-bubble-ink, #fff)');
  for (const bubble of bubbles) {
    expect(bubble.matches(rule.selectorText)).toBe(true);
  }
  // Jini d72eb0638 renders mid-run inputs as ordinary sibling transcript rows.
  const midRun = container.querySelector('[data-agent-label="A message from the user, sent while the agent was working"]')!;
  const firstUser = container.querySelector('[data-message-id="user"]')!;
  const assistant = container.querySelector('.jini-message-assistant')!;
  const followingUser = container.querySelector('[data-message-id="following-user"]')!;
  const list = container.querySelector('.jini-message-list')!;
  const listStyle = getComputedStyle(list);
  expect(listStyle.display).toBe('flex');
  expect(listStyle.flexDirection).toBe('column');
  // Flex-item margins add to the row gap; the final row's zero bottom margin is not a turn gap.
  // jsdom can leave row-gap at its initial 'normal' value instead of expanding the gap shorthand.
  const rowGap = listStyle.rowGap === 'normal' ? '' : listStyle.rowGap;
  const listGap = parseFloat(rowGap || listStyle.gap || '0');
  const ordinaryGap = parseFloat(getComputedStyle(assistant).marginBottom || '0')
    + parseFloat(getComputedStyle(followingUser).marginTop || '0') + listGap;
  const firstGap = parseFloat(getComputedStyle(firstUser).marginBottom || '0')
    + parseFloat(getComputedStyle(assistant).marginTop || '0') + listGap;
  expect(firstGap).toBe(ordinaryGap);
  const midRunGap = parseFloat(getComputedStyle(assistant).marginBottom || '0')
    + parseFloat(getComputedStyle(midRun).marginTop || '0') + listGap;
  expect(midRunGap).toBe(ordinaryGap);
  expect(ordinaryGap).toBe(32);
  expect(getComputedStyle(followingUser).marginBottom).toBe('0px');
  expect(midRun).not.toHaveClass('jini-message-user--mid-run');
  expect(midRun.parentElement).toBe(list);
  expect(midRun.previousElementSibling).toBe(assistant);
  expect(midRun.nextElementSibling).toBe(followingUser);
  expect(assistant.querySelector('.jini-message-tools')).not.toBeNull();
});
