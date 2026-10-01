import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import ts from "typescript";

/**
 * @file Repo-wide AST guard: no first-party module under `apps/website/src` may load another
 * first-party module through `require()`/`createRequire(...)(...)` (t91 F4.1-A).
 *
 * Under `node --import tsx`, `require()` of a first-party `.ts` module does not return the same
 * module instance an `import` of that same file already produced in this process — it loads a
 * SECOND, CommonJS-compiled copy of that module and its entire graph, with its own independent
 * top-level state (module-scoped `Map`/`WeakSet`/registry singletons included). `deps.ts`'s former
 * `createSiteAppLazily`/`runExportSiteLazily` were exactly this: every SQLite composition's
 * `createSiteApp()`/`runExportSite()` built the site app from a required copy of `app.ts` whose
 * routing `phaseRegistry`, page-head `contributors`, and `busesWithSiteEventHandlers` WeakSet were
 * all empty — exported sites and site inspection served no redirects, and after the first export a
 * form submission's notify mail and webhook fan-out both doubled up (see this plan's
 * `ADS-memory/.local-artifacts/agent-reports/2026-09-16-t91-plan-app-loading.md`, F4.1-A). This test
 * is the guard that stops the next one from being added silently.
 *
 * AST-based, not a text/regex scan: a `require(` inside a comment or a string literal cannot fake a
 * hit, and a real call split across multiple lines or using `createRequire(...)(...)` cannot hide
 * from it either.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const SCAN_ROOT = path.join(REPO_ROOT, "apps/website/src");

const WORKSPACE_PACKAGES = new Set<string>([JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).name]);
const workspaceGlobs: string[] = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).workspaces ?? [];
for (const glob of workspaceGlobs) {
  assert.ok(glob.endsWith("/*"), `unsupported workspace glob: ${glob}`);
  const parent = path.join(REPO_ROOT, glob.slice(0, -2));
  for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
    const manifest = path.join(parent, entry.name, "package.json");
    if (entry.isDirectory() && fs.existsSync(manifest)) WORKSPACE_PACKAGES.add(JSON.parse(fs.readFileSync(manifest, "utf8")).name);
  }
}

/**
 * One first-party `require()` this guard accepts, with the reason it is safe. Keep this list exact
 * (file + specifier), not a glob — a future legitimate lazy leaf must be added here deliberately,
 * which is the point (G3 below re-checks every entry is still true).
 */
const ALLOWED_FIRST_PARTY_REQUIRES: ReadonlyMap<string, readonly string[]> = new Map([
  [
    // `platform/observability/index.ts`'s `createObservabilityPort` reaches this module lazily so
    // the OTel SDK is never loaded into a process that hasn't enabled it. Safe because nothing
    // `import`s `otel.ts` (so tsx's `require()` copy is the ONLY copy) and `otel.ts` itself has no
    // first-party runtime import (so its "second copy" can never diverge from a first one) — G3
    // re-verifies both facts on every run rather than trusting this comment forever.
    "apps/website/src/platform/observability/index.ts",
    ["./otel.js"],
  ],
]);

/** Recursively lists candidate source files under `dir` — production `.ts`/`.tsx`/`.mts`/`.cts`, no tests, no type declarations. */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
    if (/\.test\.[cm]?[jt]sx?$/.test(entry.name) || /\.d\.[cm]?ts$/.test(entry.name)) continue;
    out.push(full);
  }
  return out.sort();
}

/** The local names `node:module`'s `createRequire` can be called through in one file: the imported binding under whatever name it was given (`createRequire as mk`), and any namespace it was imported under (`import * as mod` -> `mod.createRequire`). The bare name is always included, so a snippet with no import statement still resolves. */
interface CreateRequireBindings {
  direct: ReadonlySet<string>;
  namespaces: ReadonlySet<string>;
}

function collectCreateRequireBindings(sourceFile: ts.SourceFile): CreateRequireBindings {
  const direct = new Set<string>(["createRequire"]);
  const namespaces = new Set<string>();
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteralLike(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== "node:module" && stmt.moduleSpecifier.text !== "module") continue;
    if (stmt.importClause?.name) namespaces.add(stmt.importClause.name.text);
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === "createRequire") direct.add(element.name.text);
    }
  }
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer && isModuleReference(node.initializer, namespaces)) {
      if (ts.isIdentifier(node.name)) namespaces.add(node.name.text);
      if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (ts.isIdentifier(element.name) && (element.propertyName ?? element.name).getText(sourceFile) === "createRequire") direct.add(element.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { direct, namespaces };
}

function isModuleReference(expr: ts.Expression, namespaces: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(expr)) return namespaces.has(expr.text);
  if (!ts.isCallExpression(expr) || !expr.arguments[0] || !ts.isStringLiteralLike(expr.arguments[0])) return false;
  if (!["node:module", "module"].includes(expr.arguments[0].text)) return false;
  return (ts.isIdentifier(expr.expression) && expr.expression.text === "require")
    || (ts.isPropertyAccessExpression(expr.expression) && expr.expression.getText() === "process.getBuiltinModule");
}

/** True for a `createRequire(...)` call under any of the names {@link collectCreateRequireBindings} resolved — the factory a first-party `require` may be bound through instead of the global. */
function isCreateRequireCall(node: ts.Node, bindings: CreateRequireBindings): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return bindings.direct.has(callee.text);
  return ts.isPropertyAccessExpression(callee) && isModuleReference(callee.expression, bindings.namespaces) && callee.name.text === "createRequire";
}

/** Every local name this file binds to `require` — the global identifier plus any `const x = createRequire(...)`. */
function collectRequireNames(sourceFile: ts.SourceFile, bindings: CreateRequireBindings): Set<string> {
  const names = new Set<string>(["require"]);
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isCreateRequireCall(node.initializer, bindings)) {
      names.add(node.name.text);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(node.left) && isCreateRequireCall(node.right, bindings)) names.add(node.left.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

/** True when `expr` (a call's callee) resolves to a require function — a known local name, or an inline `createRequire(...)(...)`. */
function isRequireCallee(expr: ts.Expression, names: ReadonlySet<string>, bindings: CreateRequireBindings): boolean {
  if (ts.isIdentifier(expr) && names.has(expr.text)) return true;
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === "module" && expr.name.text === "require") return true;
  return isCreateRequireCall(expr, bindings);
}

/** The first argument's literal text, or `"<non-literal>"` when it cannot be read statically (it still might name a first-party module, so it is reported rather than silently skipped). */
function classifySpecifier(call: ts.CallExpression): string {
  const arg = call.arguments[0];
  if (arg && ts.isStringLiteralLike(arg)) return arg.text;
  return "<non-literal>";
}

/** A specifier that can only resolve to a module inside this repo — relative, `#src/`-aliased, absolute, or unreadable (see {@link classifySpecifier}). */
function isFirstParty(spec: string): boolean {
  return [...WORKSPACE_PACKAGES].some((name) => spec === name || spec.startsWith(`${name}/`)) || spec === "<non-literal>" || spec.startsWith("#src/") || spec.startsWith("./") || spec.startsWith("../") || path.isAbsolute(spec);
}

/** Every first-party specifier `fileName`'s source `require()`s — the guard's core detector, proven by G1 before G2/G3 trust it. */
function findFirstPartyRequires(fileName: string, text: string): string[] {
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const bindings = collectCreateRequireBindings(sourceFile);
  const names = collectRequireNames(sourceFile, bindings);
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    // `require.resolve(...)`'s callee is a PropertyAccessExpression whose name is `resolve`, never
    // `createRequire`, so it is correctly never treated as a require call here.
    if (ts.isCallExpression(node) && isRequireCallee(node.expression, names, bindings)) {
      hits.push(classifySpecifier(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hits.filter((spec) => isFirstParty(spec));
}

/** Every runtime (non-type-only) first-party import/export specifier `fileName`'s source declares. */
function firstPartyRuntimeImports(fileName: string, text: string): string[] {
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const specs: string[] = [];
  for (const stmt of sourceFile.statements) {
    const isImport = ts.isImportDeclaration(stmt);
    const isExport = ts.isExportDeclaration(stmt);
    if (!isImport && !isExport) continue;
    const isTypeOnly = (isImport && (stmt.importClause?.isTypeOnly || (!stmt.importClause?.name && stmt.importClause?.namedBindings && ts.isNamedImports(stmt.importClause.namedBindings) && stmt.importClause.namedBindings.elements.length > 0 && stmt.importClause.namedBindings.elements.every((item) => item.isTypeOnly)))) || (isExport && (stmt.isTypeOnly || (stmt.exportClause && ts.isNamedExports(stmt.exportClause) && stmt.exportClause.elements.length > 0 && stmt.exportClause.elements.every((item) => item.isTypeOnly))));
    if (isTypeOnly) continue;
    const spec = stmt.moduleSpecifier;
    if (spec && ts.isStringLiteralLike(spec) && isFirstParty(spec.text)) specs.push(spec.text);
  }
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const spec = classifySpecifier(node);
      if (isFirstParty(spec)) specs.push(spec);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specs;
}

// Arbitrary higher-order flow (e.g. a loader passed as a function parameter) is outside this
// syntactic detector; direct factories, module bindings and assigned loaders are supported.
test("detector: findFirstPartyRequires recognizes every require-call shape and ignores non-require lookalikes", () => {
  assert.deepEqual(findFirstPartyRequires("x.ts", `require("./app.js")`), ["./app.js"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `const r = createRequire(import.meta.url); r("#src/a")`), ["#src/a"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `createRequire(import.meta.url)("../b.js")`), ["../b.js"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `require(somePath)`), ["<non-literal>"]);
  // An IMPORT ALIAS is the bypass this guard was demonstrated to miss (2026-09-16 review of 92663cc0):
  // re-adding deps.ts's `require("./app.js")` through `createRequire as __cr` left the guard green
  // while the behavioral module-identity test went red on all 3 cases.
  assert.deepEqual(findFirstPartyRequires("x.ts", `import { createRequire as mk } from "node:module";\nmk(import.meta.url)("./app.js")`), ["./app.js"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `import { createRequire as mk } from "node:module";\nconst r = mk(import.meta.url);\nr("./app.js")`), ["./app.js"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `import * as mod from "node:module";\nmod.createRequire(import.meta.url)("./app.js")`), ["./app.js"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `import mod from "node:module"; mod.createRequire(import.meta.url)("./app.js")`), ["./app.js"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `import mod from "module"; const r = mod.createRequire(import.meta.url); r("./app.js")`), ["./app.js"]);
  assert.deepEqual(findFirstPartyRequires("x.cjs", `module.require("./app.js")`), ["./app.js"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `process.getBuiltinModule("module").createRequire(import.meta.url)("./app.js")`), ["./app.js"]);
  assert.deepEqual(findFirstPartyRequires("x.cjs", `const { createRequire: mk } = require("node:module"); const r = mk(__filename); r("./app.js")`), ["./app.js"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `let r; r = createRequire(import.meta.url); r("./app.js")`), ["./app.js"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", 'require(`./app.js`)'), ["./app.js"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `require("./" + "app.js")`), ["<non-literal>"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `require("@tovu/sdk"); require("@tovu/sdk/plugins")`), ["@tovu/sdk", "@tovu/sdk/plugins"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `require.resolve("tsx")`), []);
  assert.deepEqual(findFirstPartyRequires("x.ts", `require("node:sea")`), []);
  assert.deepEqual(findFirstPartyRequires("x.ts", `createRequire(import.meta.url)("nodemailer")`), []);
  assert.deepEqual(findFirstPartyRequires("x.ts", `// require("./c.js")`), []);
  assert.deepEqual(findFirstPartyRequires("x.ts", `const s = "require('./d.js')";`), []);
});

test("the source-file scanner includes JavaScript variants and excludes declarations/tests", () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "tovu-require-scanner-"));
  try {
    for (const file of ["a.js", "b.mjs", "c.cjs", "d.ts", "types.d.ts", "skip.test.js"]) fs.writeFileSync(path.join(dir, file), "");
    assert.deepEqual(listSourceFiles(dir).map((file) => path.basename(file)), ["a.js", "b.mjs", "c.cjs", "d.ts"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the leaf scanner includes dynamic imports and first-party require loads", () => {
  assert.deepEqual(firstPartyRuntimeImports("x.ts", `async function load() { return import("./shared-registry.js"); }`), ["./shared-registry.js"]);
  assert.deepEqual(firstPartyRuntimeImports("x.ts", `export { x } from "./state.js"; import type { T } from "./types.js"; import { type U } from "./more-types.js";`), ["./state.js"]);
  assert.deepEqual(firstPartyRuntimeImports("x.ts", `type T = typeof import("./types.js"); import("node:fs");`), []);
  assert.deepEqual(findFirstPartyRequires("x.ts", `function load() { return require("./shared-registry.js"); }`), ["./shared-registry.js"]);
});

function runtimeImportersOf(targetPath: string, files: readonly string[]): string[] {
  const importers: string[] = [];
  for (const file of files) {
    for (const spec of firstPartyRuntimeImports(file, fs.readFileSync(file, "utf8"))) {
      const resolved = ts.resolveModuleName(spec, file, { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, baseUrl: REPO_ROOT, paths: { "#src/*": ["apps/website/src/*"] } }, ts.sys).resolvedModule?.resolvedFileName;
      if (resolved && path.resolve(resolved) === path.resolve(targetPath)) importers.push(file);
    }
  }
  return importers;
}

test("the only-copy guard resolves static imports, re-exports and dynamic imports to the leaf", () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "tovu-leaf-importers-"));
  try {
    const target = path.join(dir, "leaf.ts");
    fs.writeFileSync(target, "export const x = 1;");
    const files = ["import.ts", "export.ts", "dynamic.ts", "type.ts"].map((file) => path.join(dir, file));
    const texts = [`import { x } from "./leaf.js";`, `export { x } from "./leaf.js";`, `async function load() { return import("./leaf.js"); }`, `import type { x } from "./leaf.js";`];
    files.forEach((file, index) => fs.writeFileSync(file, texts[index]));
    assert.deepEqual(runtimeImportersOf(target, files), files.slice(0, 3));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("no source file under apps/website/src require()s a first-party module except the allowlist", () => {
  const violations: Record<string, string[]> = {};
  for (const file of listSourceFiles(SCAN_ROOT)) {
    const relPath = path.relative(REPO_ROOT, file).split(path.sep).join("/");
    const text = fs.readFileSync(file, "utf8");
    const hits = findFirstPartyRequires(file, text);
    const allowedForFile = ALLOWED_FIRST_PARTY_REQUIRES.get(relPath) ?? [];
    const flagged = hits.filter((spec) => !allowedForFile.includes(spec));
    if (flagged.length > 0) violations[relPath] = flagged;
  }
  assert.deepEqual(
    violations,
    {},
    "a first-party require() loads a SECOND tsx module graph (empty registries, doubled event handlers) — " +
      "see ADS-memory/.local-artifacts/agent-reports/2026-09-16-t91-plan-app-loading.md F4.1-A, and use a " +
      "static import or add a deliberate, reasoned allowlist entry instead"
  );
});

test("every allowlist entry is still present and still a first-party-import-free leaf", () => {
  for (const [relPath, specifiers] of ALLOWED_FIRST_PARTY_REQUIRES) {
    const absPath = path.join(REPO_ROOT, relPath);
    const text = fs.readFileSync(absPath, "utf8");
    const hits = findFirstPartyRequires(absPath, text);
    for (const spec of specifiers) {
      assert.ok(hits.includes(spec), `stale allowlist entry: ${relPath} no longer require()s ${spec}`);
    }
    for (const spec of specifiers) {
      // NodeNext specifiers name the compiled `.js` output; the source on disk is `.ts`.
      const targetPath = path.resolve(path.dirname(absPath), spec).replace(/\.js$/, ".ts");
      const targetText = fs.readFileSync(targetPath, "utf8");
      assert.deepEqual(findFirstPartyRequires(targetPath, targetText), [], `${spec} must not require first-party state`);
      assert.deepEqual(runtimeImportersOf(targetPath, listSourceFiles(SCAN_ROOT)), [], `${spec} must have no production runtime importers, so its required copy stays the only copy`);
      assert.deepEqual(
        firstPartyRuntimeImports(targetPath, targetText),
        [],
        `${spec} (required by ${relPath}) must stay first-party-import-free, or its require()d copy can diverge from a copy loaded elsewhere via import`
      );
    }
  }
});
