import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * @file A453: the classic admin theme serves its three OFL fonts from its own folder, so opening
 * the admin makes no request to a third-party font host. Reads the shipped files directly.
 */

const CLASSIC = resolve(dirname(fileURLToPath(import.meta.url)), "../classic");
const REMOTE_FONT_HOST = /fonts\.(googleapis|gstatic)\.com/i;
const FACES = [
  { family: "DM Sans", slug: "dm-sans" },
  { family: "Space Grotesk", slug: "space-grotesk" },
  { family: "JetBrains Mono", slug: "jetbrains-mono" },
] as const;

function read({ path }: { path: string }, _optional = {}): string {
  return readFileSync(resolve(CLASSIC, path), "utf8");
}

describe("classic admin theme fonts", () => {
  it("names no remote font host in its CSS or manifest", () => {
    const css = read({ path: "admin.css" });
    const manifestText = read({ path: "manifest.json" });
    expect(css).not.toMatch(REMOTE_FONT_HOST);
    expect(manifestText).not.toMatch(REMOTE_FONT_HOST);
    expect(css.split("\n")[0]).toBe("@import url('./fonts/fonts.css');");

    const manifest = JSON.parse(manifestText) as { fonts: { family: string; stylesheet: string }[] };
    expect(manifest.fonts.map((font) => font.family).sort()).toEqual(FACES.map((face) => face.family).sort());
    const fontsCss = read({ path: "fonts/fonts.css" });
    expect(fontsCss).not.toMatch(REMOTE_FONT_HOST);
    for (const font of manifest.fonts) {
      expect(font.stylesheet).toBe("./fonts/fonts.css");
      const face = FACES.find((entry) => entry.family === font.family);
      expect(face).toBeDefined();
      expect(fontsCss).toContain(`font-family: '${font.family}';\n  src: url('./${face?.slug}-variable.ttf') format('truetype');`);
      expect(existsSync(resolve(CLASSIC, `fonts/${face?.slug}-variable.ttf`))).toBe(true);
      expect(read({ path: `fonts/${face?.slug}-OFL.txt` })).toMatch(/SIL Open Font License/i);
    }
  });
});
