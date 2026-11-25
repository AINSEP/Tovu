/**
 * Old-specifier guard for completed module moves. A move is only complete when the old module is
 * deleted (no re-export shell) and nothing reaches its old path. TypeScript alone does not hold this:
 * `.mjs` plugin files, `mock.module(...)` strings and dynamic imports name paths tsc never resolves.
 *
 * Usage: `tsx development/scripts/check-moved-specifiers.ts` (exits 1 and lists offenders).
 */
import fs from "node:fs";
import path from "node:path";

/** A deleted module: its repo-relative path without extension (or a bare package subpath), and its new owner. */
export interface MovedModule { oldPath: string; newOwner: string }

export const MOVED_MODULES: readonly MovedModule[] = [
  { oldPath: "apps/website/src/features/post/contracts", newOwner: "#src/platform/publish-contracts (b-g6 A01)" },
  { oldPath: "apps/website/src/platform/oauth/ports", newOwner: "@jini-ai/core OAuth contracts (b-g6 R08)" },
  { oldPath: "@jini-ai/cms/seo/xml-escape", newOwner: "@jini-ai/core/text escapeXml (b-g6 R09)" },
];

const SCANNED_DIRS = ["apps", "packages", "content", "development"];
const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "build", "coverage", ".vite", "out"]);
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
/** Specifier strings in static/dynamic imports, re-exports, require and module mocks. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\bmock\.module\s*\(\s*|\bvi\.mock\s*\(\s*)["'`]([^"'`\n]+)["'`]/g;
const EXTENSION = /\.(?:[cm]?[jt]sx?)$/;
const SELF_FILES = new Set(["development/scripts/check-moved-specifiers.ts", "development/scripts/__tests__/check-moved-specifiers.test.ts"]);

/** Repo-relative module path (extension dropped) a specifier written in `file` points at. */
export function resolveSpecifier({ file, specifier }: { file: string; specifier: string }): string {
  const bare = specifier.replace(EXTENSION, "");
  if (bare.startsWith("#src/")) return `apps/website/src/${bare.slice("#src/".length)}`;
  if (!bare.startsWith(".")) return bare;
  return path.posix.normalize(path.posix.join(path.posix.dirname(file), bare));
}

/** The old-path imports in one file's text, as `file -> specifier (old path)` lines. */
export function findOldSpecifierImports({ file, text }: { file: string; text: string }): string[] {
  const oldPaths = new Set(MOVED_MODULES.map(entry => entry.oldPath));
  return [...text.matchAll(SPECIFIER)]
    .map(match => match[1] as string)
    .filter(specifier => oldPaths.has(resolveSpecifier({ file, specifier })))
    .map(specifier => `${file} -> ${specifier}`);
}

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIR_NAMES.has(entry.name) ? [] : sourceFiles(full);
    return SOURCE_FILE.test(entry.name) ? [full] : [];
  });
}

/** Every old-path import under the scanned roots, plus any deleted shell file that came back. */
export function scanRepoForOldSpecifiers({ repoRoot }: { repoRoot: string }): string[] {
  const revived = MOVED_MODULES.filter(entry => entry.oldPath.startsWith("apps/"))
    .flatMap(entry => [".ts", ".js", ".tsx", ".mjs"].map(ext => `${entry.oldPath}${ext}`))
    .filter(file => fs.existsSync(path.join(repoRoot, file)))
    .map(file => `${file} (deleted shell is back)`);
  const imports = SCANNED_DIRS.flatMap(dir => sourceFiles(path.join(repoRoot, dir)))
    .map(full => path.relative(repoRoot, full).split(path.sep).join("/"))
    .filter(file => !SELF_FILES.has(file))
    .flatMap(file => findOldSpecifierImports({ file, text: fs.readFileSync(path.join(repoRoot, file), "utf8") }));
  return [...revived, ...imports].sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const offenders = scanRepoForOldSpecifiers({ repoRoot: path.resolve(import.meta.dirname, "../..") });
  for (const line of offenders) console.error(`old specifier: ${line}`);
  process.exitCode = offenders.length === 0 ? 0 : 1;
}
