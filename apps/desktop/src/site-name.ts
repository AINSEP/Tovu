/**
 * @file A site's window title, extracted from `main.ts` so its fallback rules are verified directly.
 */
import fs from "node:fs";
import path from "node:path";

/** The site's own display name — `config.json`'s `name` field, falling back to the folder's own
 *  basename when that is missing or unreadable. Used only for the window title, which is what makes
 *  Electron's native Window menu double as a site switcher (distinct titles, distinct entries).
 *  `readFile` defaults to a UTF-8 `fs.readFileSync`.
 *  @complexity O(1). */
export function readSiteName(
  { siteDir }: { siteDir: string },
  { readFile = (file: string) => fs.readFileSync(file, "utf8") }: { readFile?: (file: string) => string } = {},
): string {
  try {
    const config = JSON.parse(readFile(path.join(siteDir, "config.json")));
    if (typeof config.name === "string" && config.name.trim().length > 0) return config.name;
  } catch {
    // Missing, unreadable, or not JSON — the folder's own name is still a reasonable title.
  }
  return path.basename(siteDir);
}
