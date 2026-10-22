/**
 * Stage the `apps/website/src` modules the desktop shell imports into
 * `apps/desktop/staging/website-shared/`, which `electron-builder.yml` ships as `extraResources`
 * at `Contents/Resources/website/`.
 *
 * ## Why
 *
 * Shell files import shared website code by relative path (e.g. `src/tovu-server.ts` ->
 * `../../website/src/platform/server-logs/redact-local-text.ts`). In the checkout that resolves to
 * `apps/website/src/...`. Packaged, the shell lives in `Resources/app.asar/src/`, so the same
 * specifier resolves to `Resources/website/src/...`, which held nothing: desktop 0.1.21's first
 * package failed `smoke-native` with ERR_MODULE_NOT_FOUND for every such import.
 *
 * Staging each imported file at that path keeps the specifiers unchanged in dev and packaged alike.
 * Each one is bundled with its dependencies (`@jini-ai/diagnostics`, `jszip`, …) inlined, because
 * nothing under `Resources/website/` has a `node_modules` ancestor to resolve bare imports from.
 * The output keeps the `.ts` name the importers use; esbuild's JavaScript is valid input for
 * Node's type stripping.
 *
 * Discovery is a scan of the shell's own sources, so a new shared import is staged without
 * touching this file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEBSITE_ROOT = path.resolve(DESKTOP_ROOT, "..", "website");
const OUT_DIR = path.join(DESKTOP_ROOT, "staging", "website-shared");
const SHARED_SPECIFIER = /["']((?:\.\.\/)+website\/src\/[^"']+)["']/g;

/** Shell source files: what ships in app.asar and can import website code. */
function shellSources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...shellSources(abs));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) found.push(abs);
  }
  return found;
}

/** Website files the shell imports, as absolute paths. */
function sharedImports(files: readonly string[]): string[] {
  const shared = new Set<string>();
  for (const file of files) {
    for (const match of fs.readFileSync(file, "utf8").matchAll(SHARED_SPECIFIER)) {
      const target = path.resolve(path.dirname(file), match[1]!);
      if (target.startsWith(WEBSITE_ROOT + path.sep) && fs.existsSync(target)) shared.add(target);
    }
  }
  return [...shared].sort();
}

const sources = [path.join(DESKTOP_ROOT, "main.ts"), ...shellSources(path.join(DESKTOP_ROOT, "src")), ...shellSources(path.join(DESKTOP_ROOT, "bin"))];
const entryPoints = sharedImports(sources);
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
// No package.json sits above Resources/website, so Node would otherwise pick a module type from
// whatever package.json happens to enclose the install location.
fs.writeFileSync(path.join(OUT_DIR, "package.json"), `${JSON.stringify({ type: "module" })}\n`);
await build({
  entryPoints, outbase: WEBSITE_ROOT, outdir: OUT_DIR, outExtension: { ".js": ".ts" },
  bundle: true, platform: "node", format: "esm", target: "node22", logLevel: "warning",
  // Inlined CommonJS dependencies call `require` for Node built-ins; ESM has none without this.
  banner: { js: 'import { createRequire as __tovuCreateRequire } from "node:module"; const require = __tovuCreateRequire(import.meta.url);' },
});
console.log(`stage-website-shared: bundled ${entryPoints.length} module(s) -> ${path.relative(DESKTOP_ROOT, OUT_DIR)}`);
for (const entry of entryPoints) console.log(`  ${path.relative(WEBSITE_ROOT, entry)}`);
