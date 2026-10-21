import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

/** Every built asset the report measures, in report order; the loader comes first (budgeted). */
export const ASSETS = ['site-assistant-loader.js', 'site-assistant-vanilla.js', 'site-assistant-vanilla.css', 'site-assistant.js', 'site-assistant.css', 'remixicon.css', 'remixicon.woff2'];
/** The two widget totals: what a visitor downloads for each implementation. */
export const BUNDLE_TOTALS = [['vanilla JS+CSS', ['site-assistant-vanilla.js', 'site-assistant-vanilla.css']], ['React JS+CSS', ['site-assistant.js', 'site-assistant.css']]];
/** The loader ships on every public page, so it alone carries a hard gzip budget. */
export const LOADER_GZIP_BUDGET = 3000;

/**
 * Raw and level-9 gzip sizes per asset plus the two widget totals.
 * @param {{ read: (name: string) => Uint8Array }} input reads one built asset by file name.
 * @returns {{ asset: string; raw: number; gzip: number }[]}
 * @complexity O(total asset bytes) for the gzip passes.
 */
export function measureBundles({ read }) {
  const rows = ASSETS.map((asset) => {
    const bytes = read(asset);
    return { asset, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
  });
  for (const [asset, names] of BUNDLE_TOTALS) {
    const selected = rows.filter((row) => names.includes(row.asset));
    rows.push({ asset, raw: selected.reduce((sum, row) => sum + row.raw, 0), gzip: selected.reduce((sum, row) => sum + row.gzip, 0) });
  }
  return rows;
}

/** @throws {Error} when the loader's gzip size reaches {@link LOADER_GZIP_BUDGET}. */
export function assertLoaderBudget({ rows }) {
  if (rows[0].gzip >= LOADER_GZIP_BUDGET) throw new Error('Loader exceeds the 3 KB gzip budget');
}

/** The CLI: measure `dist/`, print the table, enforce the loader budget. Ports default to the real ones. */
export function main(
  { distDir = fileURLToPath(new URL('../dist/', import.meta.url)) } = {},
  { readFile = readFileSync, table = console.table } = {},
) {
  const rows = measureBundles({ read: (name) => readFile(path.join(distDir, name)) });
  table(rows);
  assertLoaderBudget({ rows });
  return rows;
}

/** Whether this module is the process entry point (`node scripts/measure-bundles.mjs`). */
export function isEntryPoint({ moduleUrl, argv1 }) {
  return argv1 !== undefined && moduleUrl === pathToFileURL(path.resolve(argv1)).href;
}

// An optional first argument names another dist directory (the tests point it at a fixture).
if (isEntryPoint({ moduleUrl: import.meta.url, argv1: process.argv[1] })) main({ distDir: process.argv[2] });
