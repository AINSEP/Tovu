/** AST import discovery over git's exact file inventory. Never loads application modules. */
import path from "node:path";
import ts from "typescript";
import type { Optional } from "./coverage-changed-model.js";

export interface ModuleScan { imports: string[]; complexity: number; runtimeReasons: string[]; mockCount: number; declaredFunctions: string[]; generated: boolean }
export interface Alias { pattern: string; targets: readonly string[] }

function runtimeImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name || !clause.namedBindings || ts.isNamespaceImport(clause.namedBindings)) return true;
  return clause.namedBindings.elements.length === 0 || clause.namedBindings.elements.some((element) => !element.isTypeOnly);
}

function branches(node: ts.Node): number {
  if (ts.isIfStatement(node) || ts.isConditionalExpression(node) || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isCatchClause(node) || ts.isCaseClause(node)) return 1;
  if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) return 1;
  return 0;
}

function isFunction(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);
}

export function scanModule({ file, source }: { file: string; source: string }, _optional: Optional = {}): ModuleScan {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports = new Set<string>(), runtimeReasons = new Set<string>();
  const declaredFunctions: string[] = [];
  const comments = ts.getLeadingCommentRanges(source, 0) ?? [];
  const generated = comments.some((comment) => /@generated\b|\bauto[- ]generated\b|\bautomatically generated\b/i.test(source.slice(comment.pos, comment.end)));
  const stack: number[] = [1];
  let complexity = 1, mockCount = 0;
  const addImport = (specifier: string) => {
    imports.add(specifier);
    if (/^(electron(?:\/|$)|(?:node:)?(?:child_process|worker_threads|net|http|https|tls)$)/.test(specifier)) runtimeReasons.add(`direct runtime dependency ${specifier}; consider an injected port`);
  };
  const visit = (node: ts.Node) => {
    const fn = isFunction(node);
    if (fn) {
      stack.push(1);
      const named = node as ts.FunctionDeclaration;
      const parent = node.parent;
      const name = named.name?.getText(ast) ?? (ts.isConstructorDeclaration(node) ? "constructor" : parent && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) ? parent.name.getText(ast) : "(anonymous)");
      declaredFunctions.push(name);
    }
    stack[stack.length - 1]! += branches(node);
    if (ts.isImportDeclaration(node) && runtimeImport(node) && ts.isStringLiteral(node.moduleSpecifier)) addImport(node.moduleSpecifier.text);
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!node.exportClause || !ts.isNamedExports(node.exportClause) || node.exportClause.elements.length === 0 || node.exportClause.elements.some((element) => !element.isTypeOnly)) addImport(node.moduleSpecifier.text);
    }
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) addImport(node.moduleReference.expression.text);
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(ast);
      if ((node.expression.kind === ts.SyntaxKind.ImportKeyword || callee === "require") && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) addImport(node.arguments[0].text);
      if (/^(vi\.(?:mock|doMock)|mock\.module|jest\.(?:mock|doMock))$/.test(callee)) mockCount++;
      if (/^(?:globalThis\.)?fetch$|^(?:[\w$]+\.)?(?:spawn|spawnSync|execFile|execFileSync|fork|createConnection)$/.test(callee)) runtimeReasons.add(`direct runtime call ${callee}; isolate network/real process behavior behind a port`);
      if (/\.(?:evaluate|evaluateHandle|executeJavaScript)$/.test(callee)) runtimeReasons.add(`possible serialized browser/process execution (${callee}); Node coverage cannot prove remote execution`);
    }
    ts.forEachChild(node, visit);
    if (fn) complexity = Math.max(complexity, stack.pop()!);
  };
  visit(ast);
  return { imports: [...imports], complexity: Math.max(complexity, stack[0]!), runtimeReasons: [...runtimeReasons], mockCount, declaredFunctions, generated };
}

function candidates(base: string): string[] {
  const out = [base];
  if (/\.(?:js|jsx|mjs|cjs)$/.test(base)) {
    const stem = base.replace(/\.[^.]+$/, "");
    out.push(...[".ts", ".tsx", ".mts", ".cts"].map((extension) => stem + extension));
  }
  if (!/\.[cm]?[jt]sx?$/.test(base)) {
    for (const extension of [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]) out.push(base + extension, `${base}/index${extension}`);
  }
  return out.map((file) => path.posix.normalize(file));
}

export function resolveLocalImport({ file, specifier, files }: { file: string; specifier: string; files: ReadonlySet<string> }, { aliases = [] }: { aliases?: readonly Alias[] } = {}): string | undefined {
  const bases: string[] = [];
  if (specifier.startsWith(".")) bases.push(path.posix.join(path.posix.dirname(file), specifier));
  else if (specifier.startsWith("#src/")) bases.push(`apps/website/src/${specifier.slice(5)}`);
  else if (specifier.startsWith("@/") && file.startsWith("apps/admin/")) bases.push(`apps/admin/src/${specifier.slice(2)}`);
  for (const alias of aliases) {
    const at = alias.pattern.indexOf("*");
    if (at < 0) { if (alias.pattern === specifier) bases.push(...alias.targets); continue; }
    const head = alias.pattern.slice(0, at), tail = alias.pattern.slice(at + 1);
    if (specifier.startsWith(head) && specifier.endsWith(tail)) {
      const value = specifier.slice(head.length, tail ? -tail.length : undefined);
      bases.push(...alias.targets.map((target) => target.replace("*", value)));
    }
  }
  return bases.flatMap(candidates).find((candidate) => files.has(candidate));
}

export interface TestPick { test: string; changedFile?: string; reason: string }

export function discoverTests({ changed, modules, reported = [], inventory = new Set(modules.keys()) }: {
  changed: readonly string[]; modules: ReadonlyMap<string, ModuleScan>; reported?: readonly string[]; inventory?: ReadonlySet<string>;
}, { cap = 20, totalCap = 200, aliases = [] }: { cap?: number; totalCap?: number; aliases?: readonly Alias[] } = {}) {
  if (!Number.isInteger(cap) || cap < 1 || cap > 200) throw new Error("Test cap must be an integer from 1 to 200");
  if (!Number.isInteger(totalCap) || totalCap < 1 || totalCap > 2000) throw new Error("Total test cap must be an integer from 1 to 2000");
  const files = new Set([...modules.keys()].filter((file) => inventory.has(file))), reverse = new Map<string, Set<string>>();
  for (const file of files) {
    for (const specifier of modules.get(file)!.imports) {
      const dependency = resolveLocalImport({ file, specifier, files }, { aliases: file.startsWith("apps/admin/") ? aliases : [] });
      if (!dependency) continue;
      const consumers = reverse.get(dependency) ?? new Set(); consumers.add(file); reverse.set(dependency, consumers);
    }
  }
  const temporary = (file: string) => file.split("/").some((part) => part.startsWith("_tmp-"));
  const isTest = (file: string) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) && !temporary(file) && !/\/(?:fixtures|__fixtures__|node_modules|dist|build|coverage|generated|__generated__)\//.test(file);
  const byFile = new Map<string, string[]>(), importingByFile = new Map<string, string[]>();
  const errors: string[] = [], warnings: string[] = [], validReported: string[] = [];
  for (const test of [...new Set(reported)]) {
    if (temporary(test)) warnings.push(`Ignored temporary reported test: ${test}`);
    else if (!inventory.has(test)) errors.push(`Reported test is missing from git inventory (tracked + untracked): ${test}`);
    else if (!modules.has(test)) errors.push(`Reported test is missing: ${test}`);
    else if (isTest(test)) validReported.push(test);
  }
  const queues = new Map<string, TestPick[]>(), allCandidates = new Set(validReported);
  const proximity = (source: string, test: string) => {
    const a = path.posix.dirname(source).split("/"), b = path.posix.dirname(test).split("/");
    let shared = 0;
    while (shared < Math.min(a.length, b.length) && a[shared] === b[shared]) shared++;
    return a.length + b.length - 2 * shared;
  };
  for (const changedFile of changed) {
    const queue = [changedFile], seen = new Set(queue), importing = new Set<string>();
    for (let at = 0; at < queue.length; at++) {
      for (const consumer of reverse.get(queue[at]!) ?? []) {
        if (isTest(consumer)) importing.add(consumer);
        if (!seen.has(consumer)) { seen.add(consumer); queue.push(consumer); }
      }
    }
    const directory = path.posix.dirname(changedFile), stem = path.posix.basename(changedFile).replace(/\.[^.]+$/, "");
    const feature = /^(.*\/features\/[^/]+)(?:\/|$)/.exec(changedFile)?.[1];
    const own = [...files].filter((test) => isTest(test) && (
      test.startsWith(`${directory}/__tests__/`) || (feature && test.startsWith(`${feature}/`)) ||
      (path.posix.dirname(test) === directory && path.posix.basename(test).startsWith(`${stem}.`))));
    const direct = new Set([...(reverse.get(changedFile) ?? [])].filter(isTest));
    const candidates = [...new Set([...own, ...importing])];
    const rank = (test: string) => validReported.includes(test) ? 0 : own.includes(test) ? 1 : direct.has(test) ? 2 : 3;
    // Shared repo __tests__ directories can contain hundreds of unrelated tests. Resolve
    // directory-distance ties using the source basename before alphabetical ordering.
    const nameDistance = (test: string) => path.posix.basename(test).startsWith(`${stem}.`) ? 0 : 1;
    candidates.sort((a, b) => rank(a) - rank(b) || proximity(changedFile, a) - proximity(changedFile, b) || nameDistance(a) - nameDistance(b) || (a < b ? -1 : a > b ? 1 : 0));
    byFile.set(changedFile, candidates);
    importingByFile.set(changedFile, [...importing].sort());
    for (const test of candidates) allCandidates.add(test);
    queues.set(changedFile, candidates.slice(0, cap).map((test) => ({ test, changedFile,
      reason: rank(test) === 0 ? "report TESTS TO RUN" : rank(test) === 1 ? "own directory / feature tests" : rank(test) === 2 ? "direct importer (one hop), ranked by path proximity" : "wider transitive importer, ranked by path proximity" })));
  }
  const tests: string[] = [], picks: TestPick[] = [];
  const pick = (entry: TestPick) => {
    if (tests.includes(entry.test)) return;
    if (tests.length >= totalCap) return;
    tests.push(entry.test); picks.push(entry);
  };
  // Standalone report tests are also authoritative even when there is no changed source.
  for (const test of validReported) {
    const related = [...byFile.values()].some((entries) => entries.includes(test));
    if (!related || [...queues.values()].some((entries) => entries.some((entry) => entry.test === test))) pick({ test, reason: "report TESTS TO RUN" });
  }
  // Each source gets its nearest remaining test before any source gets its next slot.
  // Shared tests count once globally, while each file retains its own capped queue.
  for (let round = 0; round < cap; round++) {
    for (const entries of queues.values()) if (entries[round]) pick(entries[round]!);
  }
  for (const [file, entries] of queues) {
    if (entries.length && !entries.some((entry) => tests.includes(entry.test))) warnings.push(`Total cap leaves no selected tests for changed file: ${file}`);
  }
  return { tests, omitted: [...allCandidates].filter((test) => !tests.includes(test)), byFile, importingByFile, errors, warnings, picks };
}
