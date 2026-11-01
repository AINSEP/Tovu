import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * Owner bug 11-01 (ui-look-4): the dock's "Jump to latest" button stayed white (#fff) on the dark
 * dock — the host override hard-coded its colours. It must paint from the chat theme tokens like
 * every other dock control, so light, dark and each admin theme follow.
 */
const assistantStyles = readFileSync(resolve(process.cwd(), "src/styles/assistant.css"), "utf8");

describe("chat Jump to latest button colours", () => {
  it("paints from the chat theme tokens, never a fixed colour", () => {
    const button = effectiveDeclarationsFor(assistantStyles, ".jini-chat-pane .jini-message-list__jump-btn");
    expect(button).toContain("background: var(--jini-chat-panel);");
    expect(button).toContain("color: var(--jini-chat-muted);");
    expect(button).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|white/i);
  });
});
