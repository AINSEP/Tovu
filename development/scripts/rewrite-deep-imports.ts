/**
 * Deep-relative-import codemod: `../../../foo` -> `#src/foo`.
 *
 * WHY NODE `imports` AND NOT tsconfig `paths`:
 * TypeScript does NOT rewrite module specifiers at emit. A tsconfig `paths` alias typechecks
 * fine and then survives verbatim into `dist/` as `require("~alias/foo")`, which Node cannot
 * resolve. Tovu genuinely runs its compiled output (`"start": "node dist/src/index.js"`,
 * `"bin": {"tovu": "dist/src/cli/main.js"}`), so a `paths` alias would work under `tsx` in dev
 * and then fail at boot in production. Node's `imports` field is resolved by Node itself at
 * runtime, needs no build step, and `moduleResolution: nodenext` understands it — so the same
 * specifier works in both worlds. Specifiers must start with `#`; `~` is not valid here.
 *
 * HOW DEV AND PROD BOTH RESOLVE (the part that is easy to get wrong):
 * Node resolves a `#` specifier against the *closest package.json above the importing file*.
 * That single rule is what makes one specifier serve two trees, with no conditions and no flags:
 *
 *   apps/website/src/**\/*.ts -> closest package.json is  ./package.json       -> "#src/*": "./apps/website/src/*.ts"
 *   dist/src/**\/*.js         -> closest package.json is  ./dist/package.json  -> "#src/*": "./src/*.js"
 *
 * `dist/package.json` is generated at build time by `emit-dist-package-json.mjs`, which derives
 * it from the root mapping so the two can never drift. Without that file the built output
 * resolves `#src/*` against the root mapping, tries to `require` a `.ts` file, and dies — so it
 * is load-bearing, not cosmetic.
 *
 * WHY SPECIFIERS CARRY AN EXPLICIT `/index`:
 * Node performs NO extension search and NO directory/index resolution on `imports` targets, even
 * in CommonJS (verified against Node 22). `#src/identity` would simply not resolve. So a barrel
 * import `../../../identity` is rewritten to `#src/identity/index`, and the mapping supplies the
 * `.ts`/`.js` extension.
 *
 * SCOPE:
 * Only specifiers at or beyond MIN_DEPTH `../` segments are touched — those are the unreadable,
 * move-fragile ones. Same-directory `./sibling` and shallow `../` imports are left alone: they
 * are already readable and rewriting them is pure churn and risk. A specifier is only rewritten
 * if it resolves to a real `.ts` file inside `src/`; anything else (a `.json` asset, a path that
 * escapes `src/`, e.g. into `packages/`) is reported and left untouched.
 *
 * The rewrite is idempotent: already-converted `#src/...` specifiers are not relative and so are
 * never matched.
 *
 * Usage:
 *   tsx development/scripts/rewrite-deep-imports.ts --dry-run   # report only, write nothing
 *   tsx development/scripts/rewrite-deep-imports.ts             # apply
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const SRC_ROOT = path.join(REPO_ROOT, "apps", "website", "src");

/** Minimum number of leading `../` segments before a specifier is considered "deep". */
const MIN_DEPTH = 3;

/** The `imports` key prefix declared in package.json / dist/package.json. */
const ALIAS_PREFIX = "#src/";

/**
 * Matches the module specifier of `... from "spec"` (covers `import`, `export *`, `export {}`,
 * and `import type`) and of a dynamic `import("spec")`. Capture groups: 1 = leading syntax,
 * 2 = quote char, 3 = specifier.
 */
const SPECIFIER_RE = /(\bfrom\s*|\bimport\s*\(\s*)(["'])([^"']+)\2/g;

type Skip = { file: string; specifier: string; reason: string };

const skipped: Skip[] = [];
let filesChanged = 0;
let specifiersRewritten = 0;
let filesScanned = 0;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      out.push(...walk(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve a relative specifier the way Node/TS would, and return the concrete `.ts` file it
 * names — either `<spec>.ts` or the barrel `<spec>/index.ts`. Returns null when neither exists.
 */
function resolveToTsFile(fromFile: string, specifier: string): string | null {
  const abs = path.resolve(path.dirname(fromFile), specifier);
  if (isFile(`${abs}.ts`)) return `${abs}.ts`;
  if (isFile(path.join(abs, "index.ts"))) return path.join(abs, "index.ts");
  return null;
}

function depthOf(specifier: string): number {
  const m = /^(?:\.\.\/)+/.exec(specifier);
  return m ? m[0].length / 3 : 0;
}

function rewriteFile(file: string, apply: boolean): void {
  filesScanned += 1;
  const original = readFileSync(file, "utf8");
  let changedInFile = 0;

  const updated = original.replace(SPECIFIER_RE, (whole, lead: string, quote: string, spec: string) => {
    if (depthOf(spec) < MIN_DEPTH) return whole;

    const target = resolveToTsFile(file, spec);
    if (target === null) {
      // A .json asset, a .d.ts, or a path that does not name a TypeScript module. The alias
      // mapping only supplies a .ts/.js extension, so these must stay relative.
      skipped.push({ file, specifier: spec, reason: "does not resolve to a .ts file" });
      return whole;
    }
    if (!target.startsWith(SRC_ROOT + path.sep)) {
      // e.g. `../../../../../packages/sdk/src/index` — outside the `#src/*` mapping's tree.
      skipped.push({ file, specifier: spec, reason: "resolves outside src/" });
      return whole;
    }

    const relFromSrc = path.relative(SRC_ROOT, target).split(path.sep).join("/");
    const withoutExt = relFromSrc.replace(/\.ts$/, "");
    changedInFile += 1;
    return `${lead}${quote}${ALIAS_PREFIX}${withoutExt}${quote}`;
  });

  if (changedInFile > 0) {
    specifiersRewritten += changedInFile;
    filesChanged += 1;
    if (apply) writeFileSync(file, updated, "utf8");
  }
}

function main(): void {
  const apply = !process.argv.includes("--dry-run");
  for (const file of walk(SRC_ROOT)) rewriteFile(file, apply);

  console.log(`${apply ? "Rewrote" : "Would rewrite"} ${specifiersRewritten} specifier(s) across ${filesChanged} file(s).`);
  console.log(`Scanned ${filesScanned} .ts file(s) under src/ (threshold: >= ${MIN_DEPTH} '../' segments).`);

  if (skipped.length > 0) {
    console.log(`\nLeft relative (${skipped.length}):`);
    for (const s of skipped) {
      console.log(`  ${path.relative(REPO_ROOT, s.file)}: "${s.specifier}" — ${s.reason}`);
    }
  }
}

main();
