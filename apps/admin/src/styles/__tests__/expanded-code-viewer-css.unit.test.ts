import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file Static CSS-source pins for two phone/expanded fixes jsdom cannot see (`css: false`, no
 * layout engine — same reasoning as `external-mcp-tool-picker-css.unit.test.ts`):
 * - the code viewers' expanded (browser-fullscreen) stage paints the surface, not the UA's black
 *   backdrop (owner screenshot, 2026-10-15);
 * - the "Add a …" tab's buttons stay content-width on phones instead of stretching full width.
 */

const read = (relative: string) => readFileSync(path.resolve(__dirname, relative), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("expanded code viewer + install tab CSS", () => {
  it("paints the package-files and template modals' stage with the surface colour", () => {
    const css = read("../../styles.css");
    expect(css).toMatch(
      /\.agent-plugin-source-modal \[data-preview-modal-stage\],\s*\.template-source-modal \[data-preview-modal-stage\] \{ background: var\(--surface\); color: var\(--fg\); \}/,
    );
  });

  it("keeps the install tab's buttons content-width in the phone container query", () => {
    const css = read("../../components/InstallTabCard/install-tab-card.css");
    const phone = css.slice(css.indexOf("@container admin-content (max-width: 536px)"));
    expect(phone).toContain(".install-tab-field-controls button { align-self: flex-start; }");
    expect(phone).not.toMatch(/flex:\s*1 1 100%/);
  });
});
