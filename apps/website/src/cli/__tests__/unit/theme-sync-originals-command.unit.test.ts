import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

import { runThemeSyncOriginalsCommand } from "../../commands/theme/sync-originals.js";
import { THEME_CATALOG_DIR } from "#src/features/theme/theme";

/**
 * @file `tovu theme sync-originals` — unit tier for the command's output shapes against a throwaway
 * themes root (never `content/themes/`). The generator itself is covered by
 * `features/theme/__tests__/sync-originals.test.ts`.
 */

const roots: string[] = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function themesRoot(withTheme: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "tovu-sync-originals-cmd-"));
  roots.push(root);
  if (withTheme) {
    const dir = join(root, "static", "plain");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "theme.json"), JSON.stringify({ id: "plain", tier: "static", version: "0.1.0" }));
    writeFileSync(join(dir, "theme.css"), "body{}");
  }
  return root;
}

test("prints a per-theme summary and writes each theme's original", async () => {
  const root = themesRoot(true);
  const out: string[] = [];
  await runThemeSyncOriginalsCommand({ themesRoot: root }, { output: (message) => out.push(message) });
  assert.deepEqual(out, [`(re)generated 1 theme original(s) under ${root}:\n  static/plain\n`]);
  assert.ok(existsSync(join(root, THEME_CATALOG_DIR, "static", "plain", "theme.css")));
});

test("--json prints the generator result", async () => {
  const root = themesRoot(true);
  const out: string[] = [];
  await runThemeSyncOriginalsCommand({ themesRoot: root, json: true }, { output: (message) => out.push(message) });
  assert.deepEqual(JSON.parse(out.join("")), { themes: [{ tier: "static", id: "plain" }] });
});

test("says so when there are no shipped themes, writing to stdout by default", async (t) => {
  const root = themesRoot(false);
  const written: string[] = [];
  t.mock.method(process.stdout, "write", (chunk: string) => { written.push(chunk); return true; });
  await runThemeSyncOriginalsCommand({ themesRoot: root });
  t.mock.restoreAll();
  assert.deepEqual(written, [`no shipped themes found under ${root}\n`]);
});
