import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file A453: the classic admin theme serves its three font families from its own folder.
 *
 * The theme used to `@import` a Google Fonts stylesheet, so every admin page load made a request to a
 * third party (and the browser sent that host the operator's IP) before any consent screen could
 * apply. The same three OFL variable fonts the desktop shell already ships now live next to the
 * theme, with their licence texts, and nothing in the theme names a remote font host.
 */

const CLASSIC = resolve(process.cwd(), "src/admin-themes/classic");
const FAMILIES = ["Space Grotesk", "DM Sans", "JetBrains Mono"];
const read = (rel: string) => readFileSync(resolve(CLASSIC, rel), "utf8");
const FONT_HOST = /fonts\.(googleapis|gstatic)\.com/;

describe("classic admin theme fonts", () => {
  it("names no remote font host in its CSS or manifest", () => {
    expect(read("admin.css")).not.toMatch(FONT_HOST);
    expect(read("manifest.json")).not.toMatch(FONT_HOST);
  });

  it("declares every family through a local @font-face file that exists, with its licence", () => {
    const manifest = JSON.parse(read("manifest.json")) as { fonts: { family: string; stylesheet: string }[] };
    expect(manifest.fonts.map((font) => font.family)).toEqual(FAMILIES);
    for (const font of manifest.fonts) expect(font.stylesheet).toBe("./fonts/fonts.css");
    const css = read("fonts/fonts.css");
    for (const family of FAMILIES) expect(css).toContain(`font-family: '${family}'`);
    const files = [...css.matchAll(/url\('\.\/([^']+\.ttf)'\)/g)].map((match) => match[1] as string);
    expect(files).toHaveLength(FAMILIES.length);
    for (const file of files) {
      expect(existsSync(resolve(CLASSIC, "fonts", file)), file).toBe(true);
      expect(existsSync(resolve(CLASSIC, "fonts", file.replace("-variable.ttf", "-OFL.txt"))), `${file} licence`).toBe(true);
    }
  });

  it("loads the local font file from the theme stylesheet", () => {
    expect(read("admin.css")).toMatch(/^@import url\('\.\/fonts\/fonts\.css'\);/);
  });
});
