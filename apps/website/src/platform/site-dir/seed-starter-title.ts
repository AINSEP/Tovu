import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STARTER_HTML = [
  "render/pages/index.html", "render/pages/404.html", "render/partials/nav.html",
  "render/partials/footer.html", "render/partials/footer-minimal.html",
] as const;

/** D-05: only the new site's stock starter and its reset snapshot get the creation name.
 * Encode HTML contexts (including attributes); JSON serialization handles the web manifest.
 * This runs before the staging directory is published, never against an existing site's edits.
 */
export function seedStarterTitle(
  { themesDir, siteName }: { themesDir: string; siteName: string },
  _optional: Record<string, never> = {},
): void {
  const escaped = siteName.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
  for (const prefix of ["", "__original-themes__"]) {
    const starterDir = join(themesDir, prefix, "static", "tovu-starter");
    for (const relativePath of STARTER_HTML) {
      const file = join(starterDir, relativePath);
      if (!existsSync(file)) continue;
      writeFileSync(file, readFileSync(file, "utf8").replaceAll("Your Site", () => escaped), "utf8");
    }
    const manifestFile = join(starterDir, "manifest.webmanifest");
    if (!existsSync(manifestFile)) continue;
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as Record<string, unknown>;
    manifest.name = siteName;
    manifest.short_name = siteName;
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  }
}
