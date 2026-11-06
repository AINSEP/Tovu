import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripHtmlPresentation } from "@jini-ai/platform/web";
import { UNSTYLED_THEME_MARKER } from "./active-theme.js";

/** Structure copies retain the complete motion runtime, including its license and cloak assets. */
export function keepStructureFile({ relativePath }: { relativePath: string }, _optional = {}): boolean {
  if (relativePath.startsWith("assets/vendor/kuinetic/")) return true;
  return !/\.css(?:\.map)?$/i.test(relativePath);
}

/** Neutral placeholders preserve token names without carrying the source theme's appearance. */
function neutralToken(key: string): string {
  if (key.includes("font-mono")) return "ui-monospace, monospace";
  if (key.includes("font")) return "system-ui, sans-serif";
  if (key.includes("container")) return "100%";
  if (/bg|background|surface/.test(key)) return "Canvas";
  if (/fg|ink|text|accent|muted|border|color/.test(key)) return "CanvasText";
  return "initial";
}

/** Transform only staged authored-v2 files, before originals snapshotting. Functional scripts,
 * including lightbox's overlay, stay intact. Existing copy limits bound all reads/writes.
 * @returns Nothing; writes stripped markup, neutral tokens and a marked stylesheet to staging.
 * @throws Filesystem/JSON failures propagate to the duplication service's staging cleanup.
 * @complexity O(b + h*p + r log r) time for staged text bytes b, HTML files h, preserved href
 * bytes p and removal ranges r; O(m + p) space for the largest parsed file m. All are bounded
 * by the existing copy plan. One read and replacement write per HTML/token file.
 */
export function prepareStructureTheme(
  { stagingDir, files, themeId }: { stagingDir: string; files: readonly { relativePath: string }[]; themeId: string },
  _optional = {},
): void {
  const vendorCss = files.filter(f => f.relativePath.startsWith("assets/vendor/kuinetic/") && f.relativePath.endsWith(".css"));
  const preservedStylesheetHrefs = ["../css/theme.css", `/theme-assets/${themeId}/css/theme.css`,
    ...vendorCss.flatMap(f => [f.relativePath, `./${f.relativePath}`, `../${f.relativePath}`, `/theme-assets/${themeId}/${f.relativePath}`])];
  for (const { relativePath } of files) {
    if (!/^render\/(pages|partials)\/.*\.html$/i.test(relativePath)) continue;
    const filePath = join(stagingDir, relativePath);
    const html = readFileSync(filePath, "utf8");
    writeFileSync(filePath, stripHtmlPresentation({ html }, { preservedStylesheetHrefs }), "utf8");
  }
  const tokenPath = join(stagingDir, "tokens.json");
  const tokens = JSON.parse(readFileSync(tokenPath, "utf8")) as Record<string, string>;
  const neutral = Object.fromEntries(Object.keys(tokens).map(key => [key, neutralToken(key)]));
  writeFileSync(tokenPath, `${JSON.stringify(neutral, null, 2)}\n`, "utf8");
  if (files.some(f => f.relativePath === "tokens.light.json")) {
    const light = JSON.parse(readFileSync(join(stagingDir, "tokens.light.json"), "utf8")) as Record<string, string>;
    const lightNeutral = Object.fromEntries(Object.keys({ ...tokens, ...light }).map(key => [key, neutralToken(key)]));
    writeFileSync(join(stagingDir, "tokens.light.json"), `${JSON.stringify(lightNeutral, null, 2)}\n`, "utf8");
  }
  mkdirSync(join(stagingDir, "css"), { recursive: true });
  writeFileSync(join(stagingDir, "css/theme.css"), `/* ${UNSTYLED_THEME_MARKER}: write fresh CSS before activation. */\n`, "utf8");
}
