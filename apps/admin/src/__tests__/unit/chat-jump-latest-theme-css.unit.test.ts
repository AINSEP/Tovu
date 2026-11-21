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

  // Owner 2026-11-13: 40px like the site chat's arrow, a comfortable phone tap target (was 32px).
  it("is a 40px round target", () => {
    const button = effectiveDeclarationsFor(assistantStyles, ".jini-chat-pane .jini-message-list__jump-btn");
    expect(button).toContain("width: 40px;");
    expect(button).toContain("height: 40px;");
  });
});

/**
 * Bug 11-01 (ui-fix-4/6): floating inside the transcript's scrollport, the icon button covered the
 * expand chevron of whichever tool row sat at the bottom edge (dock and 375px). In the dock it is
 * placed against `.jini-chat-pane__body` instead (absolute escapes the list's overflow clip) and
 * centred on the seam between transcript and composer: half over the composer's empty top padding,
 * so at most 16px of the transcript's bottom edge is under it. Its z-index must beat the controls'
 * flex-item z-index 4, or the composer paints over its lower half.
 */
describe("dock Jump to latest placement", () => {
  it("straddles the composer's top edge instead of floating over the last transcript row", () => {
    const jump = effectiveDeclarationsFor(assistantStyles, ".admin-chat-dock .jini-chat-pane .jini-message-list__jump");
    expect(jump).toContain("position: absolute;");
    // Controls' measured content height + their 14px bottom padding = the seam; minus half the 40px button.
    expect(jump).toContain("bottom: calc(var(--jini-chat-controls-height, 240px) + 14px - 20px);");
    expect(jump).toContain("z-index: 5;");
  });

  it("leaves the right edge at every width while a message is queued, so it never covers Cancel", () => {
    // Cancel sits at the bubble's right edge, right where the button floats (seen at 390 px).
    const rule = /\.admin-chat-dock \.jini-chat-pane:has\(\.jini-chat-pane__queued\) \.jini-message-list__jump \{\s*left: 26px;\s*right: auto;\s*\}/;
    expect(assistantStyles).toMatch(rule);
    const at = assistantStyles.indexOf(".jini-chat-pane:has(.jini-chat-pane__queued) .jini-message-list__jump");
    expect(assistantStyles.lastIndexOf("@media", at)).toBeLessThan(assistantStyles.lastIndexOf("}\n", at));
  });
});
