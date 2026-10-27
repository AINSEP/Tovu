/**
 * @file ADR-070 fitness rule (`ADS-memory/reports/architecture/ADR-070-slim-agent-daemon.md`): the
 * agent daemon is a slim process, so its entry must not statically load the server's composition
 * root, the tool catalog, admin HTTP routes or DB migrations. Today it does: the daemon boots a
 * second full site (~4,993 modules, ~174 MB idle; `2026-10-26-memory-baseline.md`). The guard lands
 * skipped and W3-C un-skips it once the daemon runs tools through the server.
 *
 * Method: walk the static RUNTIME import graph from `agent-daemon-server.ts` by parsing each file
 * (no type checker, so no full program build). An `import type`/`export type`, or one whose every
 * named binding is `type`, is erased at runtime and is not an edge. Any other import IS an edge,
 * even one whose bindings tsx/esbuild would later drop as type-only uses — over-counting is the
 * safe failure direction for a guard; mark such an import `type` to clear it. Dynamic `import()`
 * is lazy and not part of boot, so it is not an edge. Only Tovu source under `apps/website/src` is
 * walked; package imports (`@jini-ai/*`, `node:*`, npm) are leaves.
 */
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const SRC = path.resolve(import.meta.dirname, "../../../..");
const DAEMON_ENTRY = path.join(SRC, "server/inbound/assistant/agent-daemon-server.ts");

/** Plan §6 W1-P0 / ADR-070 "Fitness rule", as paths relative to `apps/website/src`. */
const FORBIDDEN: readonly RegExp[] = [
  /^server\/runtime\/composition\/deps\.ts$/,
  /^server\/runtime\/composition\/app\.ts$/,
  /^server\/runtime\/composition\/open-site-store\.ts$/,
  /^server\/runtime\/composition\/tool-catalog-manifest\.ts$/,
  /^server\/runtime\/composition\/installed-extension-tools\.ts$/,
  /^features\/.+\/tool-registrations(\.ts$|\/)/,
  /^server\/inbound\/admin-http\//,
  /^platform\/db\/migrations\//,
];

/** True when the declaration is erased at runtime (`import type`, or every named binding is `type`). */
function isTypeOnlyImport({ node }: { node: ts.ImportDeclaration }): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  if (clause.name || bindings === undefined || !ts.isNamedImports(bindings)) return false;
  return bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
}

/** True when a re-export is erased at runtime (`export type … from`, or every element is `type`). */
function isTypeOnlyExport({ node }: { node: ts.ExportDeclaration }): boolean {
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  return clause !== undefined && ts.isNamedExports(clause)
    && clause.elements.length > 0 && clause.elements.every((element) => element.isTypeOnly);
}

/**
 * Module specifiers a file loads at runtime when it is first imported.
 * @complexity O(s) in the file's top-level statements.
 */
function runtimeSpecifiers({ fileName, text }: { fileName: string; text: string }): string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  return source.statements.flatMap((node) => {
    if (ts.isImportDeclaration(node) && !isTypeOnlyImport({ node })) return [(node.moduleSpecifier as ts.StringLiteral).text];
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && !isTypeOnlyExport({ node })) return [(node.moduleSpecifier as ts.StringLiteral).text];
    return [];
  });
}

function isFile(file: string): boolean {
  try { return statSync(file).isFile(); } catch { return false; }
}

/**
 * The Tovu source file a specifier names, or `undefined` for a package import (a leaf).
 * `.js` specifiers name their `.ts` source; extensionless `#src/` ones get `.ts` from the root
 * package.json `imports` map. Throws on an unresolvable Tovu path so the walk can never pass vacuously.
 */
function resolveSpecifier({ from, specifier }: { from: string; specifier: string }): string | undefined {
  let base: string;
  if (specifier.startsWith("#src/")) base = path.join(SRC, specifier.slice("#src/".length));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return undefined;
  const match = [base.replace(/\.js$/, ".ts"), `${base}.ts`, base].find(isFile);
  if (!match) throw new Error(`unresolved import "${specifier}" in ${from}`);
  return match;
}

/**
 * Breadth-first walk of the runtime graph. Returns each reached file mapped to the file that first
 * imported it (`null` for the entry), so a violation can print its shortest import chain.
 * @complexity O(F + E) for F reached files and E import edges; one parse per file.
 */
function walkRuntimeGraph({ entry }: { entry: string }): Map<string, string | null> {
  const importers = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (!file.endsWith(".ts")) continue;
    for (const specifier of runtimeSpecifiers({ fileName: file, text: readFileSync(file, "utf8") })) {
      const target = resolveSpecifier({ from: file, specifier });
      if (target === undefined || importers.has(target)) continue;
      importers.set(target, file);
      queue.push(target);
    }
  }
  return importers;
}

function relativeToSrc(file: string): string {
  return path.relative(SRC, file).split(path.sep).join("/");
}

/** `forbidden <- importer <- … <- entry`, the shortest chain the walk found. */
function importChain({ file, importers }: { file: string; importers: Map<string, string | null> }): string {
  const chain: string[] = [];
  for (let current: string | null | undefined = file; current; current = importers.get(current)) chain.push(relativeToSrc(current));
  return chain.join(" <- ");
}

test("the daemon entry's static runtime graph reaches none of ADR-070's forbidden modules", { skip: "un-skipped by W3-C" }, () => {
  const importers = walkRuntimeGraph({ entry: DAEMON_ENTRY });
  const reached = [...importers.keys()].filter((file) => FORBIDDEN.some((rule) => rule.test(relativeToSrc(file))));
  assert.deepEqual(
    reached.map(relativeToSrc).sort(), [],
    `the daemon statically loads ${reached.length} forbidden module(s) out of ${importers.size}; first chains:\n`
      + reached.slice(0, 15).map((file) => importChain({ file, importers })).join("\n"),
  );
});

test("the walk resolves relative and #src imports from the real daemon entry and never throws", () => {
  const reached = new Set([...walkRuntimeGraph({ entry: DAEMON_ENTRY }).keys()].map(relativeToSrc));
  assert.ok(reached.has("server/inbound/assistant/run-log-lines.ts"), "relative `./x.js` import");
  assert.ok(reached.has("contracts/core/secret-redaction.ts"), "extensionless `#src/` import");
});

test("type-only imports and dynamic import() are not runtime edges; every other import form is", () => {
  const specifiers = runtimeSpecifiers({ fileName: "probe.ts", text: [
    'import type { A } from "./type-only.js";',
    'import { type B, type C } from "./all-inline-types.js";',
    'export type { D } from "./type-reexport.js";',
    'export { type E } from "./inline-type-reexport.js";',
    'const lazy = () => import("./dynamic.js");',
    'import { type F, g } from "./mixed.js";',
    'import h from "./default.js";',
    'import * as ns from "./namespace.js";',
    'import "./side-effect.js";',
    'export * from "./star.js";',
    'export { i } from "./value-reexport.js";',
  ].join("\n") });
  assert.deepEqual(specifiers, ["./mixed.js", "./default.js", "./namespace.js", "./side-effect.js", "./star.js", "./value-reexport.js"]);
});

test("the forbidden list matches the ADR's modules and nothing next to them", () => {
  const forbidden = (rel: string) => FORBIDDEN.some((rule) => rule.test(rel));
  for (const rel of [
    "server/runtime/composition/deps.ts", "server/runtime/composition/app.ts",
    "server/runtime/composition/open-site-store.ts", "server/runtime/composition/tool-catalog-manifest.ts",
    "server/runtime/composition/installed-extension-tools.ts", "features/media/tool-registrations.ts",
    "features/a/b/tool-registrations/index.ts", "server/inbound/admin-http/routes/x.ts", "platform/db/migrations/runner.ts",
  ]) assert.equal(forbidden(rel), true, rel);
  for (const rel of [
    "server/runtime/composition/agent-daemon-deps.ts", "server/runtime/composition/deps-helpers.ts",
    "assistant/tool-registrations.ts", "platform/db/client/open-site-db-client.ts",
  ]) assert.equal(forbidden(rel), false, rel);
});
