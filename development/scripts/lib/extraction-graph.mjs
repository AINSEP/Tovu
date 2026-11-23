/**
 * Gate B (P12 GATE-B) extraction-boundary graph and rules.
 *
 * Two authorities, joined on (importer, written specifier):
 * - RESOLUTION: dependency-cruiser's JSON graph, cruised once per application with that
 *   application's own TypeScript config (website: root tsconfig + root package `#src` imports;
 *   admin: `apps/admin/tsconfig.json` for `@/`; desktop: `apps/desktop/tsconfig.main.json`,
 *   NodeNext). `tsPreCompilationDeps` keeps type-only edges, because a moved file that still
 *   names a host type (`Pick<RouteDeps, …>`) cannot compile in its destination package either.
 * - OCCURRENCE: the TypeScript AST. dependency-cruiser reports one dependency per unique
 *   specifier, so it cannot count how many physical import/export/require sites a file has; the
 *   ratchet counts sites so a second import of an already-frozen edge is visible as new debt.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { cruise } from "dependency-cruiser";
import extractTSConfig from "dependency-cruiser/config-utl/extract-ts-config";
import { classifyPath, isForbiddenTarget } from "./extraction-inventory.mjs";

export const APP_CONFIGS = [
  { name: "website", dirs: ["apps/website/src"], tsConfig: "tsconfig.json" },
  { name: "admin", dirs: ["apps/admin/src"], tsConfig: "apps/admin/tsconfig.json" },
  { name: "desktop", dirs: ["apps/desktop/src", "apps/desktop/bin", "apps/desktop/scripts"], tsConfig: "apps/desktop/tsconfig.main.json" },
];

// Same production-file convention as `.dependency-cruiser.mjs` (tests are out of scope; a test may
// import anything), widened to the JS/TS variants and generated output the cruise can meet.
export const NON_PRODUCTION = "(^|/)(__tests__|__fixtures__|node_modules|dist|build|coverage)/|\\.(test|spec|stories)\\.[cm]?[jt]sx?$|\\.d\\.[cm]?ts$";
const NON_PRODUCTION_RE = new RegExp(NON_PRODUCTION);
const CHECKED_SCOPES = new Set(["bound", "mixed"]);
// Local aliases whose failure to resolve hides a possible host edge, so they cannot just be skipped.
// `@tovu/<name>` is a local tsconfig alias (admin's `@tovu/headless`) unless it is an installed
// workspace package (`@tovu/sdk`), which is external and stops traversal like any package.
const PROTECTED_ALIAS = /^(#|@\/|~\/)/;
const TOVU_SCOPE = /^@tovu\/([^/]+)/;
function isProtectedAlias(root, specifier) {
  if (PROTECTED_ALIAS.test(specifier)) return true;
  const scoped = TOVU_SCOPE.exec(specifier);
  return Boolean(scoped) && !fs.existsSync(path.join(root, "node_modules/@tovu", scoped[1]));
}
const TOVU_CONTRACTS = /^@tovu\/contracts(\/|$)/;
const CONTRACTS_WORKSPACE = /(^|\/)(packages\/contracts|node_modules\/@tovu\/contracts)\//;
const JINI = /^@jini-ai\/([^/]+)(\/.*)?$/;

/** Cruises one application with its own config and returns dependency-cruiser's module list. */
async function cruiseApp(required, _optional = {}) {
  const { root, app } = required;
  const dirs = app.dirs.filter((dir) => fs.existsSync(path.join(root, dir)));
  const tsConfigFile = path.join(root, app.tsConfig);
  if (dirs.length === 0 || !fs.existsSync(tsConfigFile)) return [];
  const options = {
    baseDir: root,
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: NON_PRODUCTION },
    tsConfig: { fileName: tsConfigFile },
    outputType: "json",
  };
  // dependency-cruiser installs its tsconfig `paths` resolver only when the resolve options name the
  // tsconfig AND the parsed config carries a baseUrl. TypeScript itself resolves `paths` against the
  // config's directory when baseUrl is absent (admin has none), so supply exactly that directory;
  // without it every admin `@/` import comes back unresolved.
  const parsed = extractTSConfig(tsConfigFile);
  if (parsed.options?.paths && !parsed.options.baseUrl) parsed.options.baseUrl = parsed.options.pathsBasePath ?? path.dirname(tsConfigFile);
  const result = await cruise(dirs, options, { tsConfig: tsConfigFile }, { tsConfig: parsed });
  const output = typeof result.output === "string" ? JSON.parse(result.output) : result.output;
  return output.modules.map((module) => ({ ...module, owned: dirs.some((dir) => module.source.startsWith(dir)) }));
}

/**
 * Resolution graph across all applications: source -> dependency-cruiser dependencies. A module
 * cruised by its own application's config wins over the same file reached from another app.
 */
export async function collectGraph(required, _optional = {}) {
  const graph = new Map();
  for (const app of APP_CONFIGS) {
    for (const module of await cruiseApp({ root: required.root, app })) {
      if (module.coreModule || module.couldNotResolve) continue;
      const known = graph.get(module.source);
      if (!known || (module.owned && !known.owned)) graph.set(module.source, { owned: module.owned, dependencies: module.dependencies });
    }
  }
  return graph;
}

function scriptKind(file) {
  if (/\.[cm]?tsx$/.test(file)) return ts.ScriptKind.TSX;
  if (/\.[cm]?jsx?$/.test(file)) return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

/** Parses one repo-relative file; returns null for unreadable or non-source files. */
export function parseSource(required, _optional = {}) {
  const file = path.join(required.root, required.file);
  if (!fs.existsSync(file)) return null;
  return ts.createSourceFile(required.file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, scriptKind(required.file));
}

function importKind(node) {
  const clause = node.importClause;
  if (!clause) return "import";
  if (clause.isTypeOnly) return "import-type";
  const bindings = clause.namedBindings;
  // `import { type A, type B } from "x"` is erased exactly like `import type`.
  const allTypes = !clause.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
  return allTypes ? "import-type" : "import";
}

function literal(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

function callSite(node) {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return [literal(node.arguments[0]), "dynamic-import"];
  if (ts.isIdentifier(node.expression) && node.expression.text === "require") return [literal(node.arguments[0]), "require"];
  return null;
}

/** The (specifier, kind) of one AST node when it is a physical module reference, else null. */
function siteOf(node) {
  if (ts.isImportDeclaration(node)) return [literal(node.moduleSpecifier), importKind(node)];
  if (ts.isExportDeclaration(node)) return node.moduleSpecifier ? [literal(node.moduleSpecifier), node.isTypeOnly ? "export-type" : "export"] : null;
  if (ts.isImportEqualsDeclaration(node)) return ts.isExternalModuleReference(node.moduleReference) ? [literal(node.moduleReference.expression), "require"] : null;
  if (ts.isImportTypeNode(node)) return ts.isLiteralTypeNode(node.argument) ? [literal(node.argument.literal), "type-reference"] : null;
  return ts.isCallExpression(node) ? callSite(node) : null;
}

/** Physical reference sites of one file: specifier -> Map(kind -> count). */
export function collectSites(required, _optional = {}) {
  const sites = new Map();
  const add = (specifier, kind) => {
    if (!specifier) return;
    const kinds = sites.get(specifier) ?? new Map();
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    sites.set(specifier, kinds);
  };
  const visit = (node) => {
    const site = siteOf(node);
    if (site) add(site[0], site[1]);
    ts.forEachChild(node, visit);
  };
  visit(required.sourceFile);
  for (const ref of required.sourceFile.referencedFiles) add(ref.fileName, "triple-slash");
  return sites;
}

function bindingNames(name, out = []) {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const element of name.elements ?? []) if (!ts.isOmittedExpression(element)) bindingNames(element.name, out);
  return out;
}

function importBindings(statement, imports) {
  const clause = statement.importClause;
  const specifier = literal(statement.moduleSpecifier);
  if (clause?.name) imports.set(clause.name.text, specifier);
  const bindings = clause?.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) imports.set(bindings.name.text, specifier);
  if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) imports.set(element.name.text, specifier);
}

function declarationNames(statement) {
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap((declaration) => bindingNames(declaration.name));
  return statement.name && ts.isIdentifier(statement.name) ? [statement.name.text] : [];
}

/** Top-level index of a module: import bindings, local declarations and export aliases. */
function moduleIndex(sourceFile) {
  const index = { imports: new Map(), declarations: new Map(), aliases: new Map(), reexports: [], unconditional: new Set() };
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      importBindings(statement, index.imports);
      if (!statement.importClause) index.unconditional.add(literal(statement.moduleSpecifier));
    } else if (ts.isExportDeclaration(statement)) {
      indexExport(statement, index);
    } else if (ts.isExportAssignment(statement)) {
      index.declarations.set("default", [statement]);
    } else {
      for (const name of declarationNames(statement)) index.declarations.set(name, [...(index.declarations.get(name) ?? []), statement]);
    }
  }
  return index;
}

function indexExport(statement, index) {
  const specifier = literal(statement.moduleSpecifier);
  const clause = statement.exportClause;
  // `export * from "x"` can surface any moved name, so it belongs to the moved surface.
  if (!clause || !ts.isNamedExports(clause)) { if (specifier) index.unconditional.add(specifier); return; }
  for (const element of clause.elements) {
    const local = (element.propertyName ?? element.name).text;
    if (specifier) index.reexports.push({ exported: element.name.text, specifier });
    else index.aliases.set(element.name.text, local);
  }
}

function referencedNames(node, out = new Set()) {
  if (ts.isIdentifier(node)) out.add(node.text);
  ts.forEachChild(node, (child) => {
    // `obj.name` and `{ name: … }` keys are not references to a local binding called `name`.
    if (ts.isPropertyAccessExpression(node) && child === node.name) return;
    referencedNames(child, out);
  });
  return out;
}

/**
 * Specifiers a mixed file's moved symbols depend on: follow each moved export through local
 * declarations it references (cycle-safe), collecting the imports it reaches. Imports reached only
 * from retained host symbols stay out, so they are not boundary findings.
 */
export function movedSpecifiers(required, _optional = {}) {
  const index = moduleIndex(required.sourceFile);
  const used = new Set(index.unconditional);
  for (const { exported, specifier } of index.reexports) if (required.movedSymbols.includes(exported)) used.add(specifier);
  const queue = required.movedSymbols.map((name) => index.aliases.get(name) ?? name);
  const seen = new Set();
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    if (index.imports.has(name)) { used.add(index.imports.get(name)); continue; }
    for (const declaration of index.declarations.get(name) ?? []) queue.push(...referencedNames(declaration));
  }
  return used;
}

const exportMaps = new Map();
function readManifest(file) {
  if (!exportMaps.has(file)) exportMaps.set(file, fs.existsSync(file) ? { exports: JSON.parse(fs.readFileSync(file, "utf8")).exports } : null);
  return exportMaps.get(file);
}

/** Node-style lookup: the nearest node_modules/@jini-ai/<name> from the importer up to the root. */
function jiniExports(root, importer, name) {
  let dir = path.dirname(importer ?? ".");
  for (;;) {
    const manifest = readManifest(path.join(root, dir, "node_modules/@jini-ai", name, "package.json"));
    if (manifest || dir === "." || dir === "") return manifest;
    dir = path.dirname(dir);
  }
}

function exportKeyMatches(key, subpath) {
  if (!key.includes("*")) return key === subpath;
  const [prefix, suffix] = key.split("*");
  return subpath.startsWith(prefix) && subpath.endsWith(suffix) && subpath.length >= prefix.length + suffix.length;
}

/**
 * True when `@jini-ai/<pkg>[/sub]` is a public entry of the installed package's `exports` map.
 * A package that is not installed fails closed: its entry cannot be shown to be public.
 */
export function isPublicJiniEntry(required, _optional = {}) {
  const match = JINI.exec(required.specifier);
  if (!match) return true;
  const manifest = jiniExports(required.root, required.importer, match[1]);
  if (!manifest) return false;
  const subpath = `.${match[2] ?? ""}`;
  const { exports } = manifest;
  if (exports === undefined) return true;
  if (typeof exports === "string" || Array.isArray(exports) || !Object.keys(exports).some((key) => key.startsWith("."))) return subpath === ".";
  const keys = Object.keys(exports).filter((key) => exportKeyMatches(key, subpath));
  return keys.length > 0 && keys.every((key) => exports[key] !== null);
}

// ---------------------------------------------------------------------------------------------
// Rules. Only bound and mixed (moved-symbol) importers are checked: host-owned and out-of-scope
// files may import anything, because host -> feature is the valid direction (a host binder wires
// the feature in). Bound and mixed targets are not findings either; each is checked on its own.

function classify(ctx, file) {
  if (!ctx.scopes.has(file)) ctx.scopes.set(file, classifyPath({ inventory: ctx.inventory, path: file }));
  return ctx.scopes.get(file);
}

function enclosingRoots(ctx, file) {
  return ctx.inventory.forbiddenRoots.filter((root) => (root.endsWith("/") ? file.startsWith(root) : file === root)).join("|");
}

/**
 * True when `target` is host code for the bound `source`: inside a forbidden root the source is
 * outside of, or a host-owned row / theme-root file. A host file inside the same forbidden root as
 * the source is exempt (GB root overlap), but is still walked for what it reaches.
 */
function isHostFor(ctx, source, target) {
  if (isForbiddenTarget({ inventory: ctx.inventory, importer: source, target })) return true;
  if (classify(ctx, target).scope !== "host") return false;
  return !ctx.inventory.forbiddenRoots.some((root) => root.endsWith("/") && source.startsWith(root) && target.startsWith(root));
}

function isExternal(dep) {
  return dep.couldNotResolve || dep.coreModule || /(^|\/)node_modules\//.test(dep.resolved);
}

function localTargets(ctx, file) {
  const dependencies = ctx.graph.get(file)?.dependencies ?? [];
  return [...new Set(dependencies.filter((dep) => !isExternal(dep)).map((dep) => dep.resolved))].sort();
}

/** Breadth-first, cycle-safe walk from `start`; returns the shortest trail ending at host code, or null. */
function walkToHost(ctx, source, start) {
  const queue = [[start]];
  const seen = new Set([start]);
  while (queue.length > 0) {
    const trail = queue.shift();
    for (const next of localTargets(ctx, trail.at(-1))) {
      if (seen.has(next)) continue;
      seen.add(next);
      if (isHostFor(ctx, source, next)) return [...trail, next];
      // Bound and mixed modules are checked as importers in their own right, so the walk stops there.
      if (!CHECKED_SCOPES.has(classify(ctx, next).scope)) queue.push([...trail, next]);
    }
  }
  return null;
}

/** Memoized per (forbidden roots enclosing the source, start): the only inputs the walk depends on. */
function witnessFor(ctx, source, start) {
  const key = `${enclosingRoots(ctx, source)}\0${start}`;
  if (!ctx.walks.has(key)) ctx.walks.set(key, walkToHost(ctx, source, start));
  const trail = ctx.walks.get(key);
  return trail ? [source, ...trail] : null;
}

/** Package, contracts and unresolved verdicts: `undefined` when the dependency is a local module. */
function classifyNonLocal(ctx, source, dep) {
  const specifier = dep.module;
  if (TOVU_CONTRACTS.test(specifier)) return { rule: "bound-tovu-contracts", target: specifier };
  if (!dep.couldNotResolve && CONTRACTS_WORKSPACE.test(dep.resolved)) return { rule: "bound-tovu-contracts", target: dep.resolved };
  // Package specifiers key on their spelling so the key does not depend on whether dist/ is built.
  if (JINI.test(specifier)) return isPublicJiniEntry({ root: ctx.root, specifier, importer: source }) ? null : { rule: "bound-private-jini", target: specifier };
  if (dep.couldNotResolve) return isProtectedAlias(ctx.root, specifier) ? { rule: "unresolved-protected-alias", target: specifier } : null;
  return isExternal(dep) ? null : undefined;
}

/** The finding (rule + key target) one dependency of a checked source produces, or null. */
function classifyDependency(ctx, source, dep) {
  const nonLocal = classifyNonLocal(ctx, source, dep);
  if (nonLocal !== undefined) return nonLocal;
  if (isHostFor(ctx, source, dep.resolved)) return { rule: "bound-host-edge", target: dep.resolved };
  if (CHECKED_SCOPES.has(classify(ctx, dep.resolved).scope)) return null;
  // Counted at the wrapper entrance, keyed by the immediate resolved target, so a finding stays put
  // when the wrapper's inside changes and moves only when the bound file's own import changes.
  const witness = witnessFor(ctx, source, dep.resolved);
  return witness ? { rule: "bound-indirect-host-edge", target: dep.resolved, witness } : null;
}

function addFinding(findings, finding) {
  const key = [finding.rule, finding.source, finding.target, finding.kind].join("\0");
  const known = findings.get(key);
  if (known) known.count += finding.count;
  else findings.set(key, { ...finding });
}

/** Dependencies of a checked source that are in scope: all of them, or a mixed file's moved ones. */
function scopedDependencies(ctx, source, sourceFile) {
  const { scope, row } = classify(ctx, source);
  const dependencies = ctx.graph.get(source).dependencies;
  if (scope !== "mixed") return dependencies;
  const moved = movedSpecifiers({ sourceFile, movedSymbols: row?.movedSymbols ?? [] });
  return dependencies.filter((dep) => moved.has(dep.module));
}

function checkSource(ctx, source, findings, errors) {
  const owner = classify(ctx, source).row?.owner ?? "unassigned";
  const sourceFile = parseSource({ root: ctx.root, file: source });
  if (!sourceFile) { errors.push(`${source}: cannot read source for occurrence counting`); return; }
  const sites = collectSites({ sourceFile });
  for (const dep of scopedDependencies(ctx, source, sourceFile)) {
    const verdict = classifyDependency(ctx, source, dep);
    if (!verdict) continue;
    const kinds = sites.get(dep.module);
    // Fail closed: a protected edge the AST cannot see would otherwise be silently uncounted.
    if (!kinds) { errors.push(`${source} -> ${dep.module}: protected edge has no source occurrence (join failed)`); continue; }
    for (const [kind, count] of kinds) addFinding(findings, { ...verdict, source, kind, count, owner });
  }
}

function compareEntries(a, b) {
  for (const field of ["rule", "source", "target", "kind"]) {
    if (a[field] !== b[field]) return a[field] < b[field] ? -1 : 1;
  }
  return 0;
}

/** A copy of `entries` in the debt file's canonical order (rule, source, target, kind). */
export function sortEntries(required, _optional = {}) {
  return [...required.entries].sort(compareEntries);
}

/**
 * All extraction-boundary findings of the live tree under `root`.
 * @param {{ root: string, inventory: object }} required
 * @returns {Promise<{ findings: Array<{rule,source,target,kind,count,owner,witness?}>, errors: string[] }>}
 */
export async function computeFindings(required, _optional = {}) {
  const ctx = { root: required.root, inventory: required.inventory, graph: await collectGraph({ root: required.root }), scopes: new Map(), walks: new Map() };
  const findings = new Map();
  const errors = [];
  for (const source of [...ctx.graph.keys()].sort()) {
    if (NON_PRODUCTION_RE.test(source) || !CHECKED_SCOPES.has(classify(ctx, source).scope)) continue;
    checkSource(ctx, source, findings, errors);
  }
  return { findings: sortEntries({ entries: [...findings.values()] }), errors };
}
