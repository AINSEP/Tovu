import path from "node:path";

import { syncThemeOriginals, type SyncThemeOriginalsResult } from "#src/features/theme/index";

/**
 * @file `tovu theme sync-originals <themesRoot> [--json]` — `sync-originals.ts`'s CLI surface.
 * Mirrors `theme validate`/`theme generate-index`'s shape: formats stdout only, and unlike those two
 * this command cannot itself report a per-theme skip — every shipped theme it discovers gets an
 * original, that being the whole point (see `sync-originals.ts`'s own file header).
 */

export interface RunThemeSyncOriginalsCommandInput {
  themesRoot: string;
  json?: boolean;
}

function formatSummary(themesRoot: string, result: SyncThemeOriginalsResult): string {
  if (result.themes.length === 0) {
    return `no shipped themes found under ${themesRoot}\n`;
  }
  const lines = result.themes.map((theme) => `  ${theme.tier}/${theme.id}\n`).join("");
  return `(re)generated ${result.themes.length} theme original(s) under ${themesRoot}:\n${lines}`;
}

/**
 * Run `tovu theme sync-originals <themesRoot> [--json]`.
 *
 * @complexity O(1) beyond {@link syncThemeOriginals}'s own bounded cost.
 */
export async function runThemeSyncOriginalsCommand(input: RunThemeSyncOriginalsCommandInput): Promise<void> {
  const themesRoot = path.resolve(input.themesRoot);
  const result = syncThemeOriginals({ themesRoot });

  if (input.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatSummary(themesRoot, result));
  }
}
