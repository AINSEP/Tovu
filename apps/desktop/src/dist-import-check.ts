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
import path from "node:path";
import ts from "typescript";
import { undeclaredDistImports as check, createNodePackagingFilesystem } from "@jini-ai/devops/packaging/electron";
import { createTypeScriptImportReader } from "@jini-ai/devops/packaging/electron/typescript";
interface DistImportInput { distDir: string; entry: string; declared: ReadonlySet<string> }
/** Bind filesystem, maintained AST parser and Tovu's build alias to the shared walk. */
export function undeclaredDistImports(input: DistImportInput): string[] {
  return check({ ...input, fs: createNodePackagingFilesystem({}), imports: createTypeScriptImportReader({ compiler: ts }), aliases: {
    resolve: ({ specifier, distDir }) => specifier.startsWith("#src/") ? path.join(distDir, "src", `${specifier.slice(5)}.js`) : undefined,
  } });
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
