import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * The Pages preview's full-screen geometry (2026-10-05 owner bug: expanded mode showed an empty grey
 * panel with the exit control over the notice line, its tooltip cut off at the window edge). jsdom
 * computes no layout, so these pin the stylesheet text itself — the Pages twin of
 * `post-preview-expanded-css.unit.test.ts`.
 *
 * Expanded height chain: `.page-preview-expanded` -> `.page-preview-surface` -> `.page-preview-stage`
 * -> `.page-preview-frame`, each a flex item with `flex: 1; min-height: 0` (the panel and the
 * surface/stage are flex columns). Drop a link and the frame falls back to its intrinsic height.
 */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles/pages.css"), "utf8");

function declarationsFor(selector: string): string {
  return effectiveDeclarationsFor(stylesheet, selector);
}

describe("expanded page-preview flex chain", () => {
  it("makes the stage a flex column, so it can pass height down to the frame", () => {
    const rule = declarationsFor(".page-preview-stage");
    expect(rule).toMatch(/display\s*:\s*flex/);
    expect(rule).toMatch(/flex-direction\s*:\s*column/);
  });

  it("gives the stage a resolved height while expanded", () => {
    const rule = declarationsFor(".page-preview-expanded .page-preview-stage");
    expect(rule).toMatch(/flex\s*:\s*1\s*;/);
    expect(rule).toMatch(/min-height\s*:\s*0/);
  });

  it("lets the expanded frame fill the stage", () => {
    const rule = declarationsFor(".page-preview-expanded .page-preview-frame");
    expect(rule).toMatch(/flex\s*:\s*1\s*;/);
    expect(rule).toMatch(/min-height\s*:\s*0/);
  });

  it("keeps the collapsed breathing-room pull on the surface under its stable host wrapper", () => {
    expect(declarationsFor(".page > .page-preview-host > .page-preview-surface")).toMatch(/margin-top\s*:\s*-15px/);
  });
});

describe("page-preview fullscreen control positioning", () => {
  it("uses the stage — not the surface with its notice line — as the fab's containing block", () => {
    expect(declarationsFor(".page-preview-stage")).toMatch(/position\s*:\s*relative/);
    const fab = declarationsFor(".page-preview-fab");
    expect(fab).toMatch(/position\s*:\s*absolute/);
    expect(fab).toMatch(/z-index\s*:\s*[1-9]/);
  });

  it("opens the hint leftwards from the button's right edge, so it is never clipped on the right", () => {
    const tip = declarationsFor(".page-preview-fab-tip");
    expect(tip).toMatch(/position\s*:\s*absolute/);
    expect(tip).toMatch(/right\s*:\s*0/);
    expect(tip).toMatch(/white-space\s*:\s*nowrap/);
  });
});
