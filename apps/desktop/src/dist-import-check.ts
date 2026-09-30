/**
 * @file Static check that every package the built server imports is one the payload actually ships.
 *
 * `scripts/stage-payload.ts` stages only the root `dependencies` closure. A package the website
 * imports but declares under `devDependencies` is therefore absent from the packaged app, and it
 * fails at boot with ERR_MODULE_NOT_FOUND. Nothing in the dev tree shows this: Node's upward walk
 * finds the package in the repo's own `node_modules`. `assertClosureComplete` does not catch it
 * either, because it checks the declared dependencies of staged PACKAGES, never the website's own
 * imports. js-yaml shipped exactly this way (a devDependency imported on the boot path).
 *
 * The walk starts at the CLI entry and follows relative, `#src/` and literal dynamic imports, so
 * build-only files that sit in `dist/` but are never loaded (`drizzle.config.js`) are not checked.
 * Parsing walks the TypeScript AST, so an import inside a comment is not an import, and neither is
 * a call to some local function that happens to be named `require` (this is ESM).
 *
 * Like the rest of `stage-payload-lib.ts`, nothing here has import-time side effects, and failures
 * throw a plain `Error` for the script to forward to its own `fail()`.
 */
import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

import ts from "typescript";

interface DistImportInput {
  /** The built tree's root (`dist/`), which `#src/*` resolves against as `./src/*.js`. */
  distDir: string;
  /** Absolute path of the file the walk starts from (the CLI entry). */
  entry: string;
  /** Package names allowed as bare imports besides builtins: root `dependencies` plus workspaces. */
  declared: ReadonlySet<string>;
}

type Specifier = { kind: "file"; target: string } | { kind: "package"; name: string } | { kind: "builtin" };

const BUILTINS = new Set(builtinModules);

function packageName(specifier: string): string {
  return specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
}

function classify(specifier: string, fromFile: string, distDir: string): Specifier {
  if (specifier.startsWith("#src/")) return { kind: "file", target: path.join(distDir, "src", `${specifier.slice(5)}.js`) };
  if (specifier.startsWith(".") || specifier.startsWith("/")) return { kind: "file", target: path.resolve(path.dirname(fromFile), specifier) };
  if (specifier.startsWith("node:") || BUILTINS.has(packageName(specifier))) return { kind: "builtin" };
  return { kind: "package", name: packageName(specifier) };
}

/** The string-literal specifier of an `import`/`export … from` declaration or an `import("…")` call. */
function specifierOf(node: ts.Node): string | undefined {
  const literal =
    ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
      ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? node.arguments[0]
        : undefined;
  return literal !== undefined && ts.isStringLiteral(literal) ? literal.text : undefined;
}

function importsOf(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    const specifier = specifierOf(node);
    if (specifier !== undefined) found.push(specifier);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The walk's shared state: what it has found wrong, what it has already queued, and what is next. */
interface Walk {
  distDir: string;
  declared: ReadonlySet<string>;
  problems: string[];
  seen: Set<string>;
  queue: string[];
}

/** Handles one import of `file`: reports an undeclared package or a missing file, and queues a file not yet seen. */
function walkImport(specifier: string, file: string, walk: Walk): void {
  const rel = path.relative(walk.distDir, file);
  const found = classify(specifier, file, walk.distDir);
  if (found.kind === "package" && !walk.declared.has(found.name)) walk.problems.push(`${found.name} (${rel})`);
  if (found.kind !== "file" || walk.seen.has(found.target)) return;
  walk.seen.add(found.target);
  if (existsSync(found.target)) walk.queue.push(found.target);
  else walk.problems.push(`${specifier} (${rel}: file not found)`);
}

/**
 * Every bare import reachable from `entry` that is neither a builtin nor in `declared`, as
 * `"<package> (<file relative to distDir>)"`, in walk order. A relative import whose target file
 * does not exist is reported too, so a broken walk can never read as a clean one.
 *
 * @complexity O(files + imports) reachable from `entry`; each file is read once.
 */
export function undeclaredDistImports({ distDir, entry, declared }: DistImportInput): string[] {
  const walk: Walk = { distDir, declared, problems: [], seen: new Set<string>([entry]), queue: [entry] };
  for (let file = walk.queue.shift(); file !== undefined; file = walk.queue.shift()) {
    for (const specifier of importsOf(file)) walkImport(specifier, file, walk);
  }
  return walk.problems;
}

/** @throws {Error} listing every {@link undeclaredDistImports} entry, when there is any. */
export function assertDistImportsDeclared(input: DistImportInput): void {
  const problems = undeclaredDistImports(input);
  if (problems.length === 0) return;
  const noun = problems.length === 1 ? "package that is not a root `dependencies` entry" : "packages that are not root `dependencies` entries";
  throw new Error(
    `the built server imports ${problems.length} ${noun}, so the packaged app would fail at boot with ERR_MODULE_NOT_FOUND (move each to \`dependencies\`):\n  ${problems.join("\n  ")}`
  );
}
