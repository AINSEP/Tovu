import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * Owner bug 11-01 (ui-look-4): the browser tab's folder-window note now rides the composer's leading
 * zone above the input. That zone pads and draws its own seam, so the note adds neither (a second
 * rule and 16px of padding made a one-line status two lines tall at dock width).
 */
const assistantStyles = readFileSync(resolve(process.cwd(), "src/styles/assistant.css"), "utf8");

describe("folder window note", () => {
  it("is a compact status line with no padding or seam of its own", () => {
    const note = effectiveDeclarationsFor(assistantStyles, ".tovu-folder-drop-notice.tovu-folder-window-note");
    expect(note).toContain("padding: 0;");
    expect(note).toContain("border-bottom: 0;");
    expect(note).toContain("color: var(--jini-chat-muted);");
  });
});
