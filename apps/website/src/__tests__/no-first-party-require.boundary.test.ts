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
    if (!/\.(ts|tsx|mts|cts)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith(".d.ts")) continue;
    out.push(full);
  }
  return out.sort();
}

/** True for a bare `createRequire(...)` call — the factory a first-party `require` may be bound through instead of the global. */
function isCreateRequireCall(node: ts.Node): boolean {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "createRequire";
}

/** Every local name this file binds to `require` — the global identifier plus any `const x = createRequire(...)`. */
function collectRequireNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>(["require"]);
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isCreateRequireCall(node.initializer)) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

/** True when `expr` (a call's callee) resolves to a require function — a known local name, or an inline `createRequire(...)(...)`. */
function isRequireCallee(expr: ts.Expression, names: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(expr) && names.has(expr.text)) return true;
  return isCreateRequireCall(expr);
}

/** The first argument's literal text, or `"<non-literal>"` when it cannot be read statically (it still might name a first-party module, so it is reported rather than silently skipped). */
function classifySpecifier(call: ts.CallExpression): string {
  const arg = call.arguments[0];
  if (arg && ts.isStringLiteralLike(arg)) return arg.text;
  return "<non-literal>";
}

/** A specifier that can only resolve to a module inside this repo — relative, `#src/`-aliased, absolute, or unreadable (see {@link classifySpecifier}). */
function isFirstParty(spec: string): boolean {
  return spec === "<non-literal>" || spec.startsWith("#src/") || spec.startsWith("./") || spec.startsWith("../") || path.isAbsolute(spec);
}

/** Every first-party specifier `fileName`'s source `require()`s — the guard's core detector, proven by G1 before G2/G3 trust it. */
function findFirstPartyRequires(fileName: string, text: string): string[] {
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const names = collectRequireNames(sourceFile);
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    // `require.resolve(...)`'s callee is a PropertyAccessExpression, not an Identifier/CallExpression
    // matching `names`/`isCreateRequireCall` — it is correctly never treated as a require call here.
    if (ts.isCallExpression(node) && isRequireCallee(node.expression, names)) {
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
    const isTypeOnly = (isImport && stmt.importClause?.isTypeOnly) || (isExport && stmt.isTypeOnly);
    if (isTypeOnly) continue;
    const spec = stmt.moduleSpecifier;
    if (spec && ts.isStringLiteralLike(spec) && isFirstParty(spec.text)) specs.push(spec.text);
  }
  return specs;
}

test("detector: findFirstPartyRequires recognizes every require-call shape and ignores non-require lookalikes", () => {
  assert.deepEqual(findFirstPartyRequires("x.ts", `require("./app.js")`), ["./app.js"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `const r = createRequire(import.meta.url); r("#src/a")`), ["#src/a"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `createRequire(import.meta.url)("../b.js")`), ["../b.js"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `require(somePath)`), ["<non-literal>"]);
  assert.deepEqual(findFirstPartyRequires("x.ts", `require.resolve("tsx")`), []);
  assert.deepEqual(findFirstPartyRequires("x.ts", `require("node:sea")`), []);
  assert.deepEqual(findFirstPartyRequires("x.ts", `createRequire(import.meta.url)("nodemailer")`), []);
  assert.deepEqual(findFirstPartyRequires("x.ts", `// require("./c.js")`), []);
  assert.deepEqual(findFirstPartyRequires("x.ts", `const s = "require('./d.js')";`), []);
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
      assert.deepEqual(
        firstPartyRuntimeImports(targetPath, targetText),
        [],
        `${spec} (required by ${relPath}) must stay first-party-import-free, or its require()d copy can diverge from a copy loaded elsewhere via import`
      );
    }
  }
});
